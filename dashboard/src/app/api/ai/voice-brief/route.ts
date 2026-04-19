import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const maxDuration = 180;

/**
 * POST /api/ai/voice-brief
 *   multipart/form-data:
 *     audio: <File>  — user's spoken request (e.g. "brief me on the Fort Bragg logistics recompete")
 *   OR  application/json:
 *     { text: string }  — skip Whisper, go straight to briefing + TTS
 *
 *   Query ?tts=0 returns { transcript, capture_brief } without audio.
 *
 * Returns `audio/mpeg` with an MP3 TTS response narrating the capture brief,
 * plus X-Brief-JSON header (URL-encoded) with the full brief text for the UI.
 *
 * Pipeline:
 *   1. Whisper → transcript (unless text provided)
 *   2. Extract opportunity reference (notice_id OR keyword-search)
 *   3. Call existing /api/ai/capture-brief
 *   4. Summarize to ~150 spoken-words
 *   5. OpenAI TTS → MP3
 *
 * Needs OPENAI_API_KEY. Graceful 501 if missing.
 */

const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";
const TTS_URL = "https://api.openai.com/v1/audio/speech";
const CHAT_URL = "https://api.openai.com/v1/chat/completions";

export async function POST(req: NextRequest) {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
        return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 501 });
    }

    const cookieStore = await cookies();
    const sb = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const withTts = searchParams.get("tts") !== "0";
    const contentType = req.headers.get("content-type") || "";

    // ── Step 1: Get user text ──
    let userText = "";
    if (contentType.includes("application/json")) {
        const body = await req.json().catch(() => ({}));
        userText = String(body.text || "").trim();
    } else if (contentType.includes("multipart/form-data")) {
        const form = await req.formData();
        const audioBlob = form.get("audio");
        if (!(audioBlob instanceof Blob)) {
            return NextResponse.json({ error: "audio field required" }, { status: 400 });
        }
        const fd = new FormData();
        fd.append("file", audioBlob, "speech.webm");
        fd.append("model", "whisper-1");
        fd.append("response_format", "text");
        const res = await fetch(WHISPER_URL, {
            method: "POST",
            headers: { Authorization: `Bearer ${openaiKey}` },
            body: fd,
        });
        if (!res.ok) {
            const err = await res.text().catch(() => "");
            return NextResponse.json({ error: `Whisper: ${res.status}`, detail: err.slice(0, 300) }, { status: 502 });
        }
        userText = (await res.text()).trim();
    } else {
        return NextResponse.json({ error: "Send multipart/form-data with audio, or JSON with text" }, { status: 400 });
    }

    if (!userText) {
        return NextResponse.json({ error: "Empty transcript" }, { status: 400 });
    }

    // ── Step 2: Resolve opportunity reference ──
    // Look for a notice_id pattern, else hit the /api/mcp-style search under the hood.
    const noticeMatch = userText.match(/\b[A-Z0-9]{8,}(?:-[A-Z0-9]+)*\b/);
    let noticeId: string | null = noticeMatch ? noticeMatch[0] : null;

    if (!noticeId) {
        // Fallback: pick the top matching active opportunity by keyword
        const { data: topOpp } = await sb
            .from("opportunities")
            .select("notice_id, title")
            .or(`title.ilike.%${userText.slice(0, 80)}%,description.ilike.%${userText.slice(0, 80)}%`)
            .in("status", ["ACTIVE", "EXPIRING_SOON", "DISCOVERED"])
            .limit(1)
            .maybeSingle();
        noticeId = (topOpp?.notice_id as string) || null;
    }

    if (!noticeId) {
        const narrated = `I couldn't find a matching opportunity for "${userText.slice(0, 100)}". Try naming a specific agency or solicitation number.`;
        if (!withTts) return NextResponse.json({ transcript: userText, narration: narrated, brief: null });
        return await narrate(narrated, openaiKey, userText, null);
    }

    // ── Step 3: Call capture brief ──
    const cookieHeader = req.headers.get("cookie") || "";
    const base = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.get("host")}`;
    const briefRes = await fetch(`${base}/api/ai/capture-brief`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: cookieHeader },
        body: JSON.stringify({ notice_id: noticeId }),
    });
    const briefData = await briefRes.json();
    if (!briefRes.ok || !briefData.brief) {
        return NextResponse.json({ error: briefData.error || "Failed to generate brief" }, { status: 500 });
    }

    // ── Step 4: Narrative summary — ~150 spoken words ──
    const sumRes = await fetch(CHAT_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            model: "gpt-4o-mini",
            temperature: 0.4,
            max_tokens: 350,
            messages: [
                {
                    role: "system",
                    content: "You are narrating a capture brief to a consultant driving between meetings. Summarize in under 150 words, conversational. Open with PWin + bid/no-bid, then program, incumbent, top risk, top action. No lists — full sentences.",
                },
                { role: "user", content: JSON.stringify(briefData.brief) },
            ],
        }),
    });
    const sumData = await sumRes.json();
    const narration = sumData.choices?.[0]?.message?.content || "Unable to summarize the brief.";

    if (!withTts) {
        return NextResponse.json({
            transcript: userText,
            notice_id: noticeId,
            pwin: briefData.pwin,
            narration,
            brief: briefData.brief,
        });
    }

    return await narrate(narration, openaiKey, userText, briefData.brief);
}

async function narrate(
    text: string,
    openaiKey: string,
    transcript: string,
    briefJson: unknown
): Promise<Response> {
    const ttsRes = await fetch(TTS_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            model: "tts-1",
            voice: "alloy",
            input: text.slice(0, 4000),
            response_format: "mp3",
        }),
    });
    if (!ttsRes.ok) {
        return NextResponse.json(
            { error: `TTS: ${ttsRes.status}`, narration: text, transcript, brief: briefJson },
            { status: 502 }
        );
    }

    const buffer = await ttsRes.arrayBuffer();
    const briefHeader = briefJson ? encodeURIComponent(JSON.stringify(briefJson)).slice(0, 8000) : "";
    return new Response(buffer, {
        status: 200,
        headers: {
            "Content-Type": "audio/mpeg",
            "X-Transcript": encodeURIComponent(transcript).slice(0, 1000),
            "X-Narration": encodeURIComponent(text).slice(0, 2000),
            "X-Brief-JSON": briefHeader,
            "Cache-Control": "no-store",
        },
    });
}
