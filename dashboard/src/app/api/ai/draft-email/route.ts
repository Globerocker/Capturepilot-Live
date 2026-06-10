import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { HUMAN_VOICE_RULES } from "@/lib/llm/humanizer";
import { requireUser } from "@/lib/auth-server";

export const maxDuration = 60;

/**
 * POST /api/ai/draft-email
 * Generate an outreach email to an agency POC for an opportunity.
 *
 * Body: {
 *   notice_id?: string,              // if present, pull opp context
 *   opportunity_id?: string,         // uuid alternative
 *   user_profile_id: string,
 *   poc_name?: string,
 *   poc_title?: string,
 *   tone: "cold-intro" | "follow-up" | "post-sources-sought" | "pre-bid-question",
 *   custom_context?: string,
 * }
 *
 * Returns: { subject: string, body: string, tone: string }
 */
export async function POST(req: NextRequest) {
    // Audit fix #3: require auth; resolve caller's own profile.
    // Body-supplied user_profile_id is ignored — was an outbound-spam vector
    // (any unauth caller could draft outreach copy for any chosen POC).
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;
    const user_profile_id = auth.profile?.id;
    if (!user_profile_id) {
        return NextResponse.json({ error: "Profile not found for current user" }, { status: 404 });
    }

    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_KEY) {
        console.error("[draft-email] OPENAI_API_KEY not set");
        return NextResponse.json({ error: "OpenAI not configured" }, { status: 500 });
    }

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

    const {
        notice_id, opportunity_id,
        poc_name, poc_title, tone = "cold-intro", custom_context,
    } = body as {
        notice_id?: string; opportunity_id?: string;
        poc_name?: string; poc_title?: string; tone?: string; custom_context?: string;
    };

    const validTones = ["cold-intro", "follow-up", "post-sources-sought", "pre-bid-question"];
    if (!validTones.includes(tone)) return NextResponse.json({ error: `invalid tone; use one of ${validTones.join(", ")}` }, { status: 400 });

    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

    // Load opportunity context if provided
    let oppContext = "";
    if (notice_id || opportunity_id) {
        const q = db.from("opportunities")
            .select("title, agency, sub_agency, notice_type, naics_code, set_aside_code, response_deadline, estimated_value, place_of_performance_state");
        const { data: opp } = notice_id
            ? await q.eq("notice_id", notice_id).single()
            : await q.eq("id", opportunity_id).single();
        if (opp) {
            oppContext = `
OPPORTUNITY:
Title: ${opp.title}
Agency: ${opp.agency}${opp.sub_agency ? ` / ${opp.sub_agency}` : ""}
Notice Type: ${opp.notice_type}
NAICS: ${opp.naics_code}
Set-Aside: ${opp.set_aside_code || "None"}
Response Deadline: ${opp.response_deadline || "N/A"}
Est. Value: ${opp.estimated_value || "N/A"}
Location: ${opp.place_of_performance_state || "N/A"}`;
        }
    }

    // Load contractor profile
    const { data: profile } = await db.from("user_profiles")
        .select("company_name, contact_name, email, phone, naics_codes, sba_certifications, state, years_in_business, federal_awards_count, company_description, website")
        .eq("id", user_profile_id).single();

    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    const contractorContext = `
CONTRACTOR:
Company: ${profile.company_name}
Contact: ${profile.contact_name || "N/A"} (${profile.email || "N/A"})
Phone: ${profile.phone || "N/A"}
NAICS: ${(profile.naics_codes || []).join(", ")}
Certifications: ${(profile.sba_certifications || []).join(", ") || "None"}
State: ${profile.state || "N/A"}
Years in Business: ${profile.years_in_business || "N/A"}
Federal Awards: ${profile.federal_awards_count || 0}
Description: ${profile.company_description || "N/A"}
Website: ${profile.website || "N/A"}`;

    const toneGuide: Record<string, string> = {
        "cold-intro": "First-time outreach. Brief, respectful, warm. Introduce the company in 1-2 sentences. Ask a single focused question about the opportunity or future needs. Mention a concrete past-performance hook if available. Under 150 words.",
        "follow-up": "Follow up on prior outreach (assume no reply after ~1 week). Keep it short, restate the ask, add one new data point or insight that brings value. Under 120 words.",
        "post-sources-sought": "After submitting a Sources Sought response. Thank the POC, acknowledge the source sought submission, confirm continued interest, and offer availability for a brief capability call. Under 150 words.",
        "pre-bid-question": "Ask a specific, substantive clarification question about the solicitation (scope, requirements, or evaluation). Cite the relevant section/requirement, ask precisely. Professional and procurement-compliant. Under 120 words.",
    };

    const poc = poc_name ? `${poc_name}${poc_title ? `, ${poc_title}` : ""}` : "the contracting officer / POC";

    const system = `You are a federal capture/BD specialist who writes high-signal, professional emails to federal agency POCs. Your emails are concise, respectful of procurement ethics, and never violate FAR communication rules during active solicitations. You avoid marketing fluff. You always return JSON with keys "subject" and "body".`;

    const user = `Write an outreach email addressed to ${poc}.

TONE/STYLE: ${toneGuide[tone]}

${oppContext}
${contractorContext}
${custom_context ? `\nADDITIONAL CONTEXT FROM SENDER:\n${custom_context}` : ""}

Requirements:
- Subject line should be specific and reference the opportunity title or solicitation number when known.
- Sign off with the contractor's contact name and company.
- Do not invent awards, clearances, or certifications not listed above.
- Output MUST be JSON: {"subject": "...", "body": "..."} — body is plain text with real newlines (\\n).`;

    try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${OPENAI_KEY}`,
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                temperature: 0.4,
                response_format: { type: "json_object" },
                messages: [
                    { role: "system", content: `${HUMAN_VOICE_RULES}\n\n${system}` },
                    { role: "user", content: user },
                ],
            }),
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error("[draft-email] OpenAI error:", res.status, errText);
            return NextResponse.json({ error: `OpenAI request failed: ${res.status}` }, { status: 502 });
        }

        const json = await res.json();
        const content = json.choices?.[0]?.message?.content || "{}";
        let parsed: { subject?: string; body?: string };
        try { parsed = JSON.parse(content); } catch (e) {
            console.error("[draft-email] JSON parse failed:", e, content);
            return NextResponse.json({ error: "Invalid AI response" }, { status: 502 });
        }

        if (!parsed.subject || !parsed.body) {
            console.error("[draft-email] missing subject/body in response:", parsed);
            return NextResponse.json({ error: "AI returned incomplete email" }, { status: 502 });
        }

        return NextResponse.json({ subject: parsed.subject, body: parsed.body, tone });
    } catch (err) {
        console.error("[draft-email] fatal:", err);
        return NextResponse.json({ error: "Generation failed" }, { status: 500 });
    }
}
