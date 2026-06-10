import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { HUMAN_VOICE_RULES } from "@/lib/llm/humanizer";
import { requireUser } from "@/lib/auth-server";

export const maxDuration = 120;

/**
 * POST /api/ai/generate-proposal
 * AI-powered proposal outline generator using GPT-4o-mini.
 *
 * Takes an opportunity + company profile and generates a structured
 * proposal outline tailored to the specific solicitation.
 *
 * Body: {
 *   notice_id: string,           // opportunity to write proposal for
 *   user_profile_id?: string,    // optional: use specific client profile
 * }
 *
 * Returns:
 * - proposal_title
 * - sections[] with title, guidance, key_points, estimated_pages
 * - win_themes[]
 * - differentiators[]
 * - compliance_checklist[]
 * - pricing_guidance
 */
export async function POST(req: NextRequest) {
    // Audit fix #3: require auth; resolve caller's own profile.
    // Body-supplied user_profile_id is ignored.
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;
    const user_profile_id = auth.profile?.id;

    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_KEY) {
        return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 });
    }

    try {
        const { notice_id } = await req.json();
        if (!notice_id) return NextResponse.json({ error: "notice_id required" }, { status: 400 });

        const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

        // Fetch opportunity
        const { data: opp } = await db
            .from("opportunities")
            .select("title, description, agency, naics_code, set_aside_code, notice_type, response_deadline, estimated_value, structured_requirements, ai_win_strategy, incumbent_contractor_name")
            .eq("notice_id", notice_id)
            .single();

        if (!opp) return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });

        // Fetch company profile if provided
        let profileContext = "";
        if (user_profile_id) {
            const { data: profile } = await db
                .from("user_profiles")
                .select("company_name, naics_codes, sba_certifications, state, employee_count, revenue, years_in_business, federal_awards_count, company_description")
                .eq("id", user_profile_id)
                .single();

            if (profile) {
                profileContext = `\n\nCOMPANY PROFILE:
Company: ${profile.company_name}
NAICS: ${(profile.naics_codes || []).join(", ")}
Certifications: ${(profile.sba_certifications || []).join(", ") || "None"}
Location: ${profile.state || "N/A"}
Employees: ${profile.employee_count || "N/A"}
Revenue: ${profile.revenue || "N/A"}
Years in Business: ${profile.years_in_business || "N/A"}
Past Federal Awards: ${profile.federal_awards_count || 0}
Description: ${profile.company_description || "N/A"}`;
            }
        }

        // Fetch actual description if URL
        let description = opp.description || "";
        if (description.startsWith("https://api.sam.gov")) {
            try {
                const SAM_KEY = process.env.SAM_API_KEY;
                const descRes = await fetch(description, {
                    headers: SAM_KEY ? { "X-Api-Key": SAM_KEY } : {},
                    signal: AbortSignal.timeout(15000),
                });
                if (descRes.ok) {
                    const html = await descRes.text();
                    description = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().substring(0, 6000);
                }
            } catch { /* timeout */ }
        }

        const oppContext = `OPPORTUNITY:
Title: ${opp.title}
Agency: ${opp.agency}
NAICS: ${opp.naics_code}
Set-Aside: ${opp.set_aside_code || "Full & Open"}
Notice Type: ${opp.notice_type}
Deadline: ${opp.response_deadline || "TBD"}
Estimated Value: ${opp.estimated_value || "Not specified"}
Incumbent: ${opp.incumbent_contractor_name || "None identified"}
Requirements: ${JSON.stringify(opp.structured_requirements || {})}
AI Analysis: ${JSON.stringify(opp.ai_win_strategy || {})}

Description:
${description.substring(0, 5000)}`;

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${OPENAI_KEY}`,
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: `${HUMAN_VOICE_RULES}\n\nYou are also generating a federal proposal outline. Write the guidance and win themes in the same plain, specific voice — no marketing fluff. The JSON structure itself stays as specified.

Original outline brief:
Generate a detailed proposal outline for the given opportunity.

Return a JSON object with this structure:
{
  "proposal_title": "Compelling proposal title",
  "win_themes": ["theme 1", "theme 2", "theme 3"],
  "differentiators": ["What makes this contractor uniquely qualified - point 1", "point 2"],
  "sections": [
    {
      "title": "Section title (e.g. 'Cover Letter', 'Technical Approach')",
      "guidance": "2-3 sentences explaining what to write in this section",
      "key_points": ["specific point to address", "another point"],
      "estimated_pages": 1
    }
  ],
  "compliance_checklist": [
    "Requirement 1 from the solicitation that must be addressed",
    "Requirement 2"
  ],
  "pricing_guidance": "Strategy advice for pricing this opportunity",
  "submission_tips": ["tip 1", "tip 2"],
  "estimated_total_pages": 15,
  "estimated_effort_hours": 40
}

Be specific to THIS opportunity. Reference the actual requirements, agency, and notice type.
Return ONLY valid JSON.`
                    },
                    {
                        role: "user",
                        content: oppContext + profileContext
                    }
                ],
                max_tokens: 3000,
                temperature: 0.3,
            }),
        });

        if (!response.ok) {
            return NextResponse.json({ error: `OpenAI error: ${response.status}` }, { status: 500 });
        }

        const data = await response.json();
        let content = data.choices?.[0]?.message?.content?.trim() || "{}";
        if (content.startsWith("```")) {
            content = content.split("\n").slice(1).join("\n").replace(/```$/, "").trim();
        }

        const proposal = JSON.parse(content);

        return NextResponse.json({
            success: true,
            proposal,
            opportunity: {
                title: opp.title,
                agency: opp.agency,
                deadline: opp.response_deadline,
            },
        });

    } catch (e) {
        console.error("Proposal generation error:", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
