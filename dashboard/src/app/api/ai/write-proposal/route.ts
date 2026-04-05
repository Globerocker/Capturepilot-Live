import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 300;

/**
 * POST /api/ai/write-proposal
 * Full AI Proposal Writer — generates complete proposal sections, not just outlines.
 *
 * Body: {
 *   notice_id: string,
 *   user_profile_id?: string,
 *   sections?: string[],  // optional: which sections to write (default: all)
 *   tone?: "formal" | "conversational",  // default: formal
 *   max_pages?: number,   // target page count (default: 10)
 * }
 *
 * Returns: {
 *   proposal_title: string,
 *   sections: Array<{
 *     title: string,
 *     content: string,       // full written text
 *     word_count: number,
 *     compliance_notes: string[],
 *   }>,
 *   compliance_matrix: Array<{ requirement: string, addressed_in: string, status: string }>,
 *   total_word_count: number,
 *   estimated_pages: number,
 * }
 */
export async function POST(req: NextRequest) {
    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_KEY) return NextResponse.json({ error: "OpenAI not configured" }, { status: 500 });

    try {
        const body = await req.json();
        const { notice_id, user_profile_id, sections: requestedSections, tone = "formal", max_pages = 10 } = body;
        if (!notice_id) return NextResponse.json({ error: "notice_id required" }, { status: 400 });

        const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

        // Fetch opportunity
        const { data: opp } = await db.from("opportunities")
            .select("title, description, agency, naics_code, set_aside_code, notice_type, response_deadline, estimated_value, structured_requirements, ai_win_strategy, incumbent_contractor_name")
            .eq("notice_id", notice_id).single();

        if (!opp) return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });

        // Fetch description text if URL
        let descText = opp.description || "";
        if (descText.startsWith("https://api.sam.gov")) {
            try {
                const r = await fetch(descText, {
                    headers: process.env.SAM_API_KEY ? { "X-Api-Key": process.env.SAM_API_KEY } : {},
                    signal: AbortSignal.timeout(15000),
                });
                if (r.ok) descText = (await r.text()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().substring(0, 6000);
            } catch { /* timeout */ }
        }

        // Fetch company profile
        let companyContext = "";
        if (user_profile_id) {
            const { data: profile } = await db.from("user_profiles")
                .select("company_name, naics_codes, sba_certifications, state, employee_count, revenue, years_in_business, federal_awards_count, company_description, website")
                .eq("id", user_profile_id).single();
            if (profile) {
                companyContext = `
CONTRACTOR PROFILE:
Company: ${profile.company_name}
Location: ${profile.state}
NAICS: ${(profile.naics_codes || []).join(", ")}
Certifications: ${(profile.sba_certifications || []).join(", ") || "None"}
Employees: ${profile.employee_count || "N/A"}
Revenue: ${profile.revenue ? `$${Number(profile.revenue).toLocaleString()}` : "N/A"}
Years in Business: ${profile.years_in_business || "N/A"}
Federal Awards: ${profile.federal_awards_count || 0}
Description: ${profile.company_description || "N/A"}
Website: ${profile.website || "N/A"}`;
            }
        }

        const oppContext = `
OPPORTUNITY:
Title: ${opp.title}
Agency: ${opp.agency}
NAICS: ${opp.naics_code}
Set-Aside: ${opp.set_aside_code || "Full & Open Competition"}
Type: ${opp.notice_type}
Deadline: ${opp.response_deadline || "TBD"}
Value: ${opp.estimated_value ? `$${Number(opp.estimated_value).toLocaleString()}` : "Not specified"}
Incumbent: ${opp.incumbent_contractor_name || "None identified"}

DESCRIPTION:
${descText.substring(0, 4000)}

REQUIREMENTS:
${JSON.stringify(opp.structured_requirements || {}, null, 2).substring(0, 1000)}`;

        // Determine sections to write
        const defaultSections = [
            "Cover Letter",
            "Executive Summary",
            "Technical Approach",
            "Management Approach",
            "Past Performance",
            "Staffing Plan",
            "Quality Control Plan",
            "Transition Plan",
            "Small Business Subcontracting Plan",
        ];

        const sectionsToWrite = requestedSections || defaultSections;
        const wordsPerSection = Math.floor((max_pages * 250) / sectionsToWrite.length);

        // Generate each section
        const writtenSections: Array<{ title: string; content: string; word_count: number; compliance_notes: string[] }> = [];

        for (const sectionTitle of sectionsToWrite) {
            const sectionPrompt = `Write the "${sectionTitle}" section of a government contract proposal.

${oppContext}
${companyContext}

INSTRUCTIONS:
- Write ${wordsPerSection} words for this section
- Tone: ${tone === "formal" ? "Professional, formal government proposal language" : "Clear, direct, accessible language"}
- Be specific to THIS opportunity and THIS contractor
- Reference actual requirements from the solicitation
- Include specific metrics, timelines, and deliverables where possible
- Use FAR-compliant language and structure
- If this is Past Performance, create plausible examples based on the company's industry
- If this is Technical Approach, describe a clear methodology with phases
- If this is Cover Letter, address the Contracting Officer directly

Write ONLY the section content. No headers, no "Section X:" prefix. Just the body text.`;

            try {
                const res = await fetch("https://api.openai.com/v1/chat/completions", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_KEY}` },
                    body: JSON.stringify({
                        model: "gpt-4o-mini",
                        messages: [
                            { role: "system", content: "You are an expert government proposal writer who has won billions of dollars in federal contracts. Write compelling, compliant, and specific proposal content." },
                            { role: "user", content: sectionPrompt },
                        ],
                        max_tokens: Math.min(4000, wordsPerSection * 2),
                        temperature: 0.4,
                    }),
                });

                if (res.ok) {
                    const data = await res.json();
                    const content = data.choices?.[0]?.message?.content?.trim() || "";
                    const wordCount = content.split(/\s+/).length;
                    writtenSections.push({
                        title: sectionTitle,
                        content,
                        word_count: wordCount,
                        compliance_notes: [],
                    });
                }
            } catch { /* skip failed section */ }
        }

        // Generate compliance matrix
        let complianceMatrix: Array<{ requirement: string; addressed_in: string; status: string }> = [];
        try {
            const compRes = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_KEY}` },
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [
                        { role: "system", content: "Extract requirements from the solicitation and create a compliance matrix. Return ONLY a JSON array." },
                        { role: "user", content: `Based on this solicitation, create a compliance matrix:\n\n${descText.substring(0, 3000)}\n\nReturn a JSON array of objects: [{"requirement": "...", "addressed_in": "Section name", "status": "Compliant"}]` },
                    ],
                    max_tokens: 2000,
                    temperature: 0.1,
                }),
            });
            if (compRes.ok) {
                const data = await compRes.json();
                let content = data.choices?.[0]?.message?.content?.trim() || "[]";
                if (content.startsWith("```")) content = content.split("\n").slice(1).join("\n").replace(/```$/, "").trim();
                complianceMatrix = JSON.parse(content);
            }
        } catch { /* compliance matrix generation failed */ }

        const totalWords = writtenSections.reduce((s, sec) => s + sec.word_count, 0);

        // Store in DB
        await db.from("opportunities").update({
            ai_win_strategy: {
                ...(opp.ai_win_strategy || {}),
                proposal_generated: true,
                proposal_sections: writtenSections.length,
                proposal_words: totalWords,
                generated_at: new Date().toISOString(),
            },
        }).eq("notice_id", notice_id);

        return NextResponse.json({
            success: true,
            proposal_title: `Proposal Response: ${opp.title}`,
            agency: opp.agency,
            sections: writtenSections,
            compliance_matrix: complianceMatrix,
            total_word_count: totalWords,
            estimated_pages: Math.ceil(totalWords / 250),
        });

    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
