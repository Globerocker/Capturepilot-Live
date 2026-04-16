import { NextRequest, NextResponse } from "next/server";

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

    const systemPrompt = `You write short, warm beta-invite email copy for CapturePilot, a federal-contracting SaaS. The admin met the recipient through some specific context and is now inviting them to try the product. Write copy that feels personal, specific to that context, and non-salesy. Never invent facts not given in the context. Keep it tight and human — no corporate filler. Do not use em-dashes in generated copy.

You MUST return valid JSON with exactly these fields:
- subject: string (email subject line, 40-70 chars, reference the context)
- eyebrow: string (uppercase-looking label, 2-5 words, sets context — e.g. "Following Up", "Great Connecting", "From Our Call")
- heading: string (the headline, 4-8 words — use [firstName] as a literal placeholder if a name fits; otherwise omit it)
- ctaLabel: string (button text, 2-4 words — e.g. "Accept Beta Access", "Claim Your Access")
- introLine: string (1 sentence opening the email body, specific to the context)
- personalNote: string (1-2 sentences referencing the context explicitly, then handing off to the invite. Warm, specific, no salesy language. Do NOT repeat the intro line.)`;

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
                    { role: "system", content: systemPrompt },
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
