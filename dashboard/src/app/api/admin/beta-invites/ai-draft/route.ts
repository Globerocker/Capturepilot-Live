import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/auth-admin";
import { HUMAN_VOICE_RULES } from "@/lib/llm/humanizer";

export const maxDuration = 60;

/**
 * POST /api/admin/beta-invites/ai-draft
 *
 * Given free-text context about how the admin met a recipient, draft an
 * invite email opener — eyebrow, heading, intro line, CTA label, and personal
 * note. The admin can then review/edit before sending.
 *
 * Body: { context: string, recipient_name?: string, company_name?: string }
 * Returns: { subject, eyebrow, heading, ctaLabel, introLine, personalNote }
 */
export async function POST(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_KEY) {
        return NextResponse.json({ error: "OpenAI not configured" }, { status: 500 });
    }

    let body: { context?: string; recipient_name?: string; company_name?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const context = (body.context || "").trim();
    if (!context) {
        return NextResponse.json({ error: "context is required" }, { status: 400 });
    }

    const recipientName = body.recipient_name?.trim() || "";
    const companyName = body.company_name?.trim() || "";

    const systemPrompt = `You write a short beta-invite email for CapturePilot, a federal-contracting SaaS. The admin briefly describes how they met the recipient, and you draft the invite copy.

HARD RULES:
- Never invent facts, numbers, statistics, or product details that are not in the context. If the admin didn't mention it, you don't write it.
- No marketing speak, no self-aggrandizing language, no superlatives ("game-changing", "revolutionary", "powerful", "best-in-class", etc.).
- Do not claim specific counts ("30,000 opportunities", "thousands of contracts", etc.) — these vary and you'll get them wrong.
- Do not pretend to know anything about the recipient's company beyond what the admin said.
- First-person singular voice ("I"), not "we" or "our team", unless the context says otherwise. It's a personal message from one person.
- Conversational, direct, human. Short sentences. No fluff.
- Do not use em-dashes.

Return valid JSON with exactly these fields:
- subject: string (email subject, 30-60 chars, plain and specific — not clickbait)
- eyebrow: string (2-4 word label above the heading — e.g. "Following Up", "Great Connecting")
- heading: string (4-8 words — use [firstName] as a literal placeholder if a first name fits naturally)
- ctaLabel: string (button text, 2-4 words — e.g. "Accept Invite", "Set Up Account")
- introLine: string (one sentence opening the email, naturally referencing the context)
- personalNote: string (1-2 sentences that reference the context more specifically, then hand off to the invite. Don't repeat the intro line.)`;

    const userPrompt = `CONTEXT (how the admin met the recipient):
${context}

RECIPIENT NAME: ${recipientName || "(not provided)"}
COMPANY NAME: ${companyName || "(not provided)"}

Draft the invite email copy now. Return JSON only.`;

    try {
        const resp = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${OPENAI_KEY}`,
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                response_format: { type: "json_object" },
                temperature: 0.6,
                max_tokens: 500,
                messages: [
                    { role: "system", content: `${HUMAN_VOICE_RULES}\n\n${systemPrompt}` },
                    { role: "user", content: userPrompt },
                ],
            }),
        });

        if (!resp.ok) {
            const errText = await resp.text();
            console.error("[ai-draft] OpenAI error:", resp.status, errText);
            return NextResponse.json(
                { error: `OpenAI returned ${resp.status}` },
                { status: 502 },
            );
        }

        const data = await resp.json();
        const raw = data?.choices?.[0]?.message?.content;
        if (!raw) {
            return NextResponse.json({ error: "Empty response from model" }, { status: 502 });
        }

        let parsed: Record<string, unknown>;
        try {
            parsed = JSON.parse(raw);
        } catch {
            return NextResponse.json({ error: "Model did not return valid JSON" }, { status: 502 });
        }

        const pickString = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

        return NextResponse.json({
            subject: pickString(parsed.subject),
            eyebrow: pickString(parsed.eyebrow),
            heading: pickString(parsed.heading),
            ctaLabel: pickString(parsed.ctaLabel),
            introLine: pickString(parsed.introLine),
            personalNote: pickString(parsed.personalNote),
        });
    } catch (e) {
        console.error("[ai-draft] error:", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
