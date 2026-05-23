import { NextRequest, NextResponse, after } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { createJob, runStep, startJob, completeJob, failJob, requireProfileId } from "@/lib/background-jobs";
import { HUMAN_VOICE_RULES } from "@/lib/llm/humanizer";

export const maxDuration = 180;

/**
 * POST /api/ai/voice-brief
 *   multipart/form-data: { audio: File, hint_notice_id?: string }
 *   application/json:    { text: string, hint_notice_id?: string }
 *
 * Creates a background job (kind=voice_brief), returns { jobId } immediately,
 * and runs the 5-step pipeline in after():
 *   1) transcribe (Whisper) or skip if text provided
 *   2) resolve_opportunity
 *   3) capture_brief (DeepSeek/OpenAI)
 *   4) summarize_narration
 *   5) tts + upload to Supabase Storage (voice-briefs bucket)
 *
 * Client polls /api/jobs/[id] → final `job.result.audio_url` is a signed
 * Supabase Storage URL for the generated MP3.
 */

const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";
const TTS_URL = "https://api.openai.com/v1/audio/speech";
const CHAT_URL = "https://api.openai.com/v1/chat/completions";

function adminClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

export async function POST(req: NextRequest) {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
        return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 501 });
    }

    const cookieStore = await cookies();
    const sbAuth = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } },
    );
    const { data: { user } } = await sbAuth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Parse body early so we can error fast if malformed
    const contentType = req.headers.get("content-type") || "";
    let audioBytes: ArrayBuffer | null = null;
    let audioMime = "audio/webm";
    let userText = "";
    let hintNoticeId: string | null = null;

    if (contentType.includes("application/json")) {
        const body = await req.json().catch(() => ({}));
        userText = String(body.text || "").trim();
        hintNoticeId = typeof body.hint_notice_id === "string" ? body.hint_notice_id : null;
    } else if (contentType.includes("multipart/form-data")) {
        const form = await req.formData();
        const audioBlob = form.get("audio");
        const hint = form.get("hint_notice_id");
        if (typeof hint === "string") hintNoticeId = hint;
        if (!(audioBlob instanceof Blob)) {
            return NextResponse.json({ error: "audio field required" }, { status: 400 });
        }
        audioBytes = await audioBlob.arrayBuffer();
        audioMime = audioBlob.type || "audio/webm";
    } else {
        return NextResponse.json({ error: "Send multipart/form-data with audio, or JSON with text" }, { status: 400 });
    }

    if (!audioBytes && !userText) {
        return NextResponse.json({ error: "Need either audio or text" }, { status: 400 });
    }

    const profileId = await requireProfileId(user.id);
    const db = adminClient();

    // Look up opp title for job title (hint_notice_id helps us label it)
    let jobTitle = userText ? `Voice Brief: "${userText.slice(0, 60)}"` : "Voice Brief";
    if (hintNoticeId) {
        const { data: opp } = await db
            .from("opportunities")
            .select("id, title")
            .eq("notice_id", hintNoticeId)
            .maybeSingle();
        if (opp?.title) jobTitle = `Voice Brief: ${(opp.title as string).slice(0, 70)}`;
    }

    const { jobId } = await createJob(profileId, {
        kind: "voice_brief",
        title: jobTitle,
        notice_id: hintNoticeId,
        steps: [
            { key: "transcribe", label: "Transcribing audio (Whisper)" },
            { key: "resolve", label: "Resolving opportunity" },
            { key: "capture_brief", label: "Generating capture brief" },
            { key: "summarize", label: "Summarizing to narration (~150 words)" },
            { key: "tts", label: "Generating speech (OpenAI TTS)" },
            { key: "upload", label: "Uploading audio to storage" },
        ],
    });

    // Clone the audio bytes before the response closes — ArrayBuffer isn't
    // guaranteed to remain live after we send the response. Convert to Uint8Array.
    const audioForBackground = audioBytes ? new Uint8Array(audioBytes) : null;
    const cookieHeader = req.headers.get("cookie") || "";
    const appBase = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.get("host")}`;

    after(async () => {
        await startJob(jobId);
        try {
            // Step 1: Transcribe
            const transcript = await runStep<string>(
                jobId,
                "transcribe",
                async () => {
                    if (userText) return userText;
                    if (!audioForBackground) throw new Error("No audio or text");
                    const fd = new FormData();
                    fd.append("file", new Blob([audioForBackground as BlobPart], { type: audioMime }), "speech.webm");
                    fd.append("model", "whisper-1");
                    fd.append("response_format", "text");
                    const r = await fetch(WHISPER_URL, {
                        method: "POST",
                        headers: { Authorization: `Bearer ${openaiKey}` },
                        body: fd,
                    });
                    if (!r.ok) throw new Error(`Whisper ${r.status}`);
                    return (await r.text()).trim();
                },
                {
                    skipIf: () => !!userText,
                    detailOnDone: (t) => `${t.length} chars transcribed`,
                },
            ) || userText;

            if (!transcript) throw new Error("Empty transcript");

            // Step 2: Resolve opportunity
            const resolved = await runStep<{ notice_id: string | null; title: string | null }>(
                jobId,
                "resolve",
                async () => {
                    let noticeId = hintNoticeId;
                    if (!noticeId) {
                        const m = transcript.match(/\b[A-Z0-9]{8,}(?:-[A-Z0-9]+)*\b/);
                        noticeId = m ? m[0] : null;
                    }
                    if (!noticeId) {
                        const { data: top } = await db
                            .from("opportunities")
                            .select("notice_id, title")
                            .or(`title.ilike.%${transcript.slice(0, 80)}%,description.ilike.%${transcript.slice(0, 80)}%`)
                            .in("status", ["ACTIVE", "EXPIRING_SOON", "DISCOVERED"])
                            .limit(1)
                            .maybeSingle();
                        if (top) return { notice_id: top.notice_id as string, title: top.title as string };
                        return { notice_id: null, title: null };
                    }
                    const { data: opp } = await db
                        .from("opportunities")
                        .select("title")
                        .eq("notice_id", noticeId)
                        .maybeSingle();
                    return { notice_id: noticeId, title: (opp?.title as string) || null };
                },
                {
                    detailOnDone: (r) => r.notice_id ? `Linked to ${r.title?.slice(0, 60) || r.notice_id}` : "No matching opportunity — will narrate the request back",
                },
            );

            // Step 3: Capture brief (optional — skip if we have no notice)
            const briefData: { brief: unknown; pwin: number | null } = { brief: null, pwin: null };
            await runStep(
                jobId,
                "capture_brief",
                async () => {
                    if (!resolved?.notice_id) {
                        return "skipped — no opportunity";
                    }
                    const br = await fetch(`${appBase}/api/ai/capture-brief`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", cookie: cookieHeader },
                        body: JSON.stringify({ notice_id: resolved.notice_id }),
                    });
                    const data = await br.json();
                    if (br.ok && data.brief) {
                        briefData.brief = data.brief;
                        briefData.pwin = data.pwin ?? null;
                        return `Brief generated (PWin ${data.pwin ?? "?"}%)`;
                    }
                    throw new Error(data.error || `capture-brief ${br.status}`);
                },
                {
                    skipIf: () => !resolved?.notice_id,
                    detailOnDone: (s) => s as string,
                },
            );

            // Step 4: Narration summary
            const narration = await runStep<string>(
                jobId,
                "summarize",
                async () => {
                    if (!briefData.brief) {
                        return `I couldn't find a matching opportunity for "${transcript.slice(0, 120)}". Try naming a specific agency or solicitation number.`;
                    }
                    const r = await fetch(CHAT_URL, {
                        method: "POST",
                        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
                        body: JSON.stringify({
                            model: "gpt-4o-mini",
                            temperature: 0.4,
                            max_tokens: 350,
                            messages: [
                                {
                                    role: "system",
                                    content: `${HUMAN_VOICE_RULES}\n\nYou are narrating a capture brief to a consultant driving between meetings. Summarize in under 150 words, conversational. Open with PWin + bid/no-bid, then program, incumbent, top risk, top action. No lists — full sentences.`,
                                },
                                { role: "user", content: JSON.stringify(briefData.brief) },
                            ],
                        }),
                    });
                    const data = await r.json();
                    return data.choices?.[0]?.message?.content || "Unable to summarize the brief.";
                },
                { detailOnDone: (t) => `${t.length} chars of narration` },
            ) || "";

            // Step 5: TTS
            const mp3Bytes = await runStep<Uint8Array>(
                jobId,
                "tts",
                async () => {
                    const r = await fetch(TTS_URL, {
                        method: "POST",
                        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
                        body: JSON.stringify({
                            model: "tts-1",
                            voice: "alloy",
                            input: narration.slice(0, 4000),
                            response_format: "mp3",
                        }),
                    });
                    if (!r.ok) throw new Error(`TTS ${r.status}`);
                    const buf = await r.arrayBuffer();
                    return new Uint8Array(buf);
                },
                { detailOnDone: (b) => `${(b.byteLength / 1024).toFixed(0)} KB audio` },
            );

            // Step 6: Upload
            let audioUrl: string | null = null;
            await runStep(
                jobId,
                "upload",
                async () => {
                    if (!mp3Bytes) throw new Error("No audio to upload");
                    const path = `${profileId}/${jobId}.mp3`;
                    const { error: upErr } = await db.storage.from("voice-briefs").upload(path, mp3Bytes as BlobPart, {
                        contentType: "audio/mpeg",
                        upsert: true,
                    });
                    if (upErr) throw new Error(upErr.message);
                    const signed = await db.storage.from("voice-briefs").createSignedUrl(path, 60 * 60 * 24); // 24h
                    if (signed.error) throw new Error(signed.error.message);
                    audioUrl = signed.data?.signedUrl || null;
                    return `Uploaded ${path}`;
                },
                { detailOnDone: (s) => s as string },
            );

            await completeJob(jobId, {
                transcript,
                narration,
                notice_id: resolved?.notice_id || null,
                brief: briefData.brief,
                pwin: briefData.pwin,
                audio_url: audioUrl,
            });
        } catch (e) {
            await failJob(jobId, (e as Error).message || "voice-brief failed").catch(() => { /* noop */ });
        }
    });

    return NextResponse.json({ jobId });
}
