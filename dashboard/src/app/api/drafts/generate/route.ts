import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { HUMAN_VOICE_RULES } from "@/lib/llm/humanizer";

export async function POST(request: Request) {
    const cookieStore = await cookies();
    const sb = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } }
    );

    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { opportunityId } = await request.json();
    if (!opportunityId) {
        return NextResponse.json({ error: "opportunityId required" }, { status: 400 });
    }

    // Use service key for writes
    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Load user profile
    const { data: profile } = await admin
        .from("user_profiles")
        .select("id, company_name, naics_codes, sba_certifications, state, target_states")
        .eq("auth_user_id", user.id)
        .single();

    if (!profile) {
        return NextResponse.json({ error: "No profile found" }, { status: 404 });
    }
    const p = profile as unknown as Record<string, unknown>;

    // Load opportunity
    const { data: opp } = await admin
        .from("opportunities")
        .select("id, title, agency, notice_type, naics_code, set_aside_code, response_deadline, award_amount, description, place_of_performance_state")
        .eq("id", opportunityId)
        .single();

    if (!opp) {
        return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!GEMINI_API_KEY && !OPENAI_API_KEY) {
        return NextResponse.json({ error: "Neither GEMINI_API_KEY nor OPENAI_API_KEY is configured" }, { status: 500 });
    }

    // Build prompt
    const companyName = (p.company_name as string) || "Our Company";
    const certs = ((p.sba_certifications as string[]) || []).join(", ") || "None";
    const naics = ((p.naics_codes as string[]) || []).join(", ") || "N/A";
    const deadline = opp.response_deadline ? new Date(opp.response_deadline).toLocaleDateString() : "TBD";

    const prompt = `You are a B2G (business-to-government) sales communication expert. Generate 3 professional email drafts for outreach regarding a federal contract opportunity.

COMPANY INFO:
- Company: ${companyName}
- NAICS Codes: ${naics}
- Certifications: ${certs}
- State: ${(p.state as string) || "N/A"}

OPPORTUNITY:
- Title: ${opp.title}
- Agency: ${opp.agency || "Unknown"}
- Notice Type: ${opp.notice_type || "Unknown"}
- NAICS: ${opp.naics_code || "N/A"}
- Set-Aside: ${opp.set_aside_code || "Unrestricted"}
- Deadline: ${deadline}
- Location: ${opp.place_of_performance_state || "N/A"}
${opp.description ? `- Description (first 500 chars): ${(opp.description as string).substring(0, 500)}` : ""}

Generate exactly 3 email drafts separated by "---":

DRAFT 1 - STANDARD ALERT (direct, professional opportunity inquiry):
Subject: [subject line]
Body: [max 180 words, professional tone, mention NAICS code, mention deadline]

---

DRAFT 2 - CERTIFICATION LEVERAGE (emphasize set-aside/certification match):
Subject: [subject line]
Body: [max 180 words, emphasize certifications and set-aside alignment, specific competitive advantage]

---

DRAFT 3 - EARLY ENGAGEMENT (relationship-building, sources sought/presolicitation positioning):
Subject: [subject line]
Body: [max 180 words, focus on capability statement, partnership, early engagement]

Rules:
- Each email must be under 180 words
- Professional B2G tone
- Include specific opportunity details
- Include clear call-to-action
- Format: "Subject: [subject]\\nBody: [body]" for each draft`;

    try {
        // Prefer Gemini (typically free), fall back to OpenAI when Gemini isn't configured.
        let text = "";
        if (GEMINI_API_KEY) {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
                    }),
                },
            );
            if (!response.ok) {
                const err = await response.text();
                console.error("[drafts/generate] Gemini error:", err);
                // Fall through to OpenAI rather than hard-failing when Gemini rejects.
            } else {
                const result = await response.json();
                text = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
            }
        }

        if (!text && OPENAI_API_KEY) {
            const oaRes = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_API_KEY}` },
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [
                        { role: "system", content: `${HUMAN_VOICE_RULES}\n\nYou are also drafting a B2G sales email. Follow the user's formatting instructions exactly.` },
                        { role: "user", content: prompt },
                    ],
                    max_tokens: 2048,
                    temperature: 0.7,
                }),
            });
            if (!oaRes.ok) {
                const err = await oaRes.text();
                console.error("[drafts/generate] OpenAI error:", err);
                return NextResponse.json({ error: "AI generation failed (both Gemini and OpenAI unavailable)" }, { status: 500 });
            }
            const data = await oaRes.json();
            text = data.choices?.[0]?.message?.content || "";
        }

        if (!text) {
            return NextResponse.json({ error: "AI returned empty content" }, { status: 502 });
        }

        // Parse the three drafts
        const drafts = text.split("---").map((section: string) => section.trim()).filter(Boolean);

        const strategies = ["standard_alert", "certification_leverage", "early_engagement"];
        const parsedDrafts = drafts.slice(0, 3).map((draft: string, i: number) => {
            const subjectMatch = draft.match(/Subject:\s*(.+?)(?:\n|$)/i);
            const bodyMatch = draft.match(/Body:\s*([\s\S]+)/i);
            return {
                strategy: strategies[i],
                subject: subjectMatch?.[1]?.trim() || `Regarding: ${opp.title}`,
                body: bodyMatch?.[1]?.trim() || draft,
            };
        });

        // Upsert drafts into DB
        const profileId = p.id as string;
        for (const d of parsedDrafts) {
            await admin.from("email_drafts").upsert(
                {
                    user_profile_id: profileId,
                    opportunity_id: opportunityId,
                    strategy: d.strategy,
                    subject: d.subject,
                    body: d.body,
                    status: "draft",
                },
                { onConflict: "user_profile_id,opportunity_id,strategy" }
            );
        }

        return NextResponse.json({ success: true, drafts: parsedDrafts });
    } catch (err) {
        console.error("Email draft generation error:", err);
        return NextResponse.json({ error: "Failed to generate drafts" }, { status: 500 });
    }
}
