import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";
import { callLLM } from "@/lib/llm/deepseek";
import { HUMAN_VOICE_RULES } from "@/lib/llm/humanizer";

export const dynamic = "force-dynamic";

function admin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );
}

interface ContactRow {
    id: string;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    company_name: string | null;
    title: string | null;
    naics_codes: string[] | null;
    state: string | null;
    tags: string[] | null;
}

interface ReplyRow {
    id: string;
    from_email: string;
    from_name: string | null;
    subject: string | null;
    body_text: string | null;
    snippet: string | null;
    sentiment: string | null;
    intent: string | null;
    outreach_campaigns: { id: string; name: string } | null;
    outreach_contacts: ContactRow | null;
}

/**
 * POST /api/admin/outreach/replies/[id]/ai-draft
 *
 * Drafts a concise, on-brand reply to an inbound outreach message using
 * everything we know about the sender (joined contact + campaign context).
 * Returns { draft }. The Inbox composer fills its textarea with this so the
 * admin can edit before sending.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    const { id } = await ctx.params;
    const db = admin();

    const { data, error } = await db
        .from("outreach_replies")
        .select(
            `id, from_email, from_name, subject, body_text, snippet, sentiment, intent,
             outreach_campaigns ( id, name ),
             outreach_contacts ( id, email, first_name, last_name, company_name, title, naics_codes, state, tags )`
        )
        .eq("id", id)
        .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });

    // Supabase joins come back as objects, not arrays — cast to our shape.
    const reply = data as unknown as ReplyRow;
    const contact = reply.outreach_contacts;

    const senderName =
        [contact?.first_name, contact?.last_name].filter(Boolean).join(" ").trim() ||
        reply.from_name ||
        reply.from_email.split("@")[0];

    const senderFacts: string[] = [];
    if (contact?.company_name) senderFacts.push(`Company: ${contact.company_name}`);
    if (contact?.title) senderFacts.push(`Title: ${contact.title}`);
    if (contact?.state) senderFacts.push(`State: ${contact.state}`);
    if (contact?.naics_codes?.length)
        senderFacts.push(`NAICS codes: ${contact.naics_codes.slice(0, 6).join(", ")}`);
    if (contact?.tags?.length) senderFacts.push(`Tags: ${contact.tags.slice(0, 6).join(", ")}`);
    if (reply.outreach_campaigns?.name)
        senderFacts.push(`Replied to our campaign: ${reply.outreach_campaigns.name}`);
    if (reply.sentiment) senderFacts.push(`Detected sentiment: ${reply.sentiment}`);
    if (reply.intent) senderFacts.push(`Detected intent: ${reply.intent}`);

    const inboundBody = (reply.body_text || reply.snippet || "").trim().slice(0, 4000);

    const userPrompt = `You're Sergio, a partner at Americurial (a federal-contracting consultancy). Someone replied to one of our outreach emails and you're writing a short, personal reply back.

WHO REPLIED:
- Name: ${senderName}
- Email: ${reply.from_email}
${senderFacts.length ? senderFacts.map((f) => `- ${f}`).join("\n") : "- (no extra context on file)"}

THEIR MESSAGE${reply.subject ? ` (subject: "${reply.subject}")` : ""}:
"""
${inboundBody || "(no message body captured)"}
"""

Write the reply body only. Rules:
- Greet them by first name if you have it.
- Respond directly to what they actually said. If they asked a question, answer it. If they pushed back, acknowledge it honestly. If they're interested, suggest a concrete next step (a short call works).
- Keep it to 3-5 short sentences. No preamble, no recap of their own email back at them.
- Reference something specific about their firm (company, NAICS, state) only if it's genuinely relevant — don't force it.
- Sign off as:
  Sergio
  Partner, Americurial
- Do NOT include a subject line, "Re:" prefix, or email headers. Body text only.`;

    try {
        const resp = await callLLM(
            [
                { role: "system", content: HUMAN_VOICE_RULES },
                { role: "user", content: userPrompt },
            ],
            { temperature: 0.6, max_tokens: 600 }
        );

        const draft = resp.content.trim();
        if (!draft) {
            return NextResponse.json({ error: "LLM returned an empty draft" }, { status: 500 });
        }

        return NextResponse.json({ draft });
    } catch (e) {
        const msg = e instanceof Error ? e.message : "AI draft failed";
        console.error("[outreach/ai-draft] failed:", msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
