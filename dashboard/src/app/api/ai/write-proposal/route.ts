import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const maxDuration = 300;

/**
 * POST /api/ai/write-proposal
 * Synchronous AI Proposal Writer (legacy endpoint).
 *
 * Prefer /api/ai/write-proposal/start for long-running generation —
 * it returns a jobId immediately and runs in the background.
 *
 * Body: {
 *   notice_id: string,
 *   user_profile_id?: string,
 *   sections?: string[],
 *   tone?: "formal" | "conversational",
 *   max_pages?: number,
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

        const ctx = await loadProposalContext(db, notice_id, user_profile_id);
        if (!ctx.ok) {
            return NextResponse.json(ctx.body, { status: ctx.status });
        }

        const result = await runProposalGeneration({
            openAIKey: OPENAI_KEY,
            db,
            notice_id,
            oppContext: ctx.oppContext,
            companyContext: ctx.companyContext,
            descText: ctx.descText,
            opp: ctx.opp,
            sectionsToWrite: requestedSections || DEFAULT_SECTIONS,
            tone,
            max_pages,
            // no job ID = no live progress writes
        });

        if (result.writtenSections.length === 0) {
            return NextResponse.json({
                error: "Proposal generation failed — no sections could be written.",
                details: result.sectionErrors,
            }, { status: 502 });
        }

        return NextResponse.json({
            success: true,
            proposal_title: `Proposal Response: ${ctx.opp.title}`,
            agency: ctx.opp.agency,
            sections: result.writtenSections,
            compliance_matrix: result.complianceMatrix,
            total_word_count: result.totalWords,
            estimated_pages: Math.ceil(result.totalWords / 250),
        });

    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}

// ---------------------------------------------------------------------------
// Shared helpers (also used by the background /start endpoint)
// ---------------------------------------------------------------------------

export const DEFAULT_SECTIONS = [
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

type OppRow = {
    title: string;
    description: string | null;
    agency: string | null;
    naics_code: string | null;
    set_aside_code: string | null;
    notice_type: string | null;
    response_deadline: string | null;
    estimated_value: number | null;
    structured_requirements: Record<string, unknown> | null;
    ai_win_strategy: Record<string, unknown> | null;
    incumbent_contractor_name: string | null;
};

type ContextError = { ok: false; status: number; body: Record<string, unknown> };
type ContextOk = {
    ok: true;
    opp: OppRow;
    oppContext: string;
    companyContext: string;
    descText: string;
};

export async function loadProposalContext(
    db: SupabaseClient,
    notice_id: string,
    user_profile_id?: string,
): Promise<ContextOk | ContextError> {
    const { data: opp } = await db.from("opportunities")
        .select("title, description, agency, naics_code, set_aside_code, notice_type, response_deadline, estimated_value, structured_requirements, ai_win_strategy, incumbent_contractor_name")
        .eq("notice_id", notice_id).single();

    if (!opp) return { ok: false, status: 404, body: { error: "Opportunity not found" } };

    // Fetch description text if it is a URL
    let descText = (opp as OppRow).description || "";
    if (descText.startsWith("https://api.sam.gov")) {
        try {
            const r = await fetch(descText, {
                headers: process.env.SAM_API_KEY ? { "X-Api-Key": process.env.SAM_API_KEY } : {},
                signal: AbortSignal.timeout(15000),
            });
            if (r.ok) descText = (await r.text()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().substring(0, 6000);
        } catch { /* timeout */ }
    }

    let companyContext = "";
    if (user_profile_id) {
        const { data: profile } = await db.from("user_profiles")
            .select("company_name, naics_codes, sba_certifications, state, employee_count, revenue, years_in_business, federal_awards_count, company_description, website, capability_statement")
            .eq("id", user_profile_id).single();
        if (!profile) {
            return { ok: false, status: 404, body: { error: "User profile not found" } };
        }
        const hasCapStatement = Boolean(
            (profile as { capability_statement?: string }).capability_statement?.trim() ||
            ((profile as { company_description?: string }).company_description && (profile as { company_description?: string }).company_description!.trim().length >= 100),
        );
        if (!hasCapStatement) {
            return {
                ok: false,
                status: 412,
                body: {
                    error: "Capability statement required. Create or upload one before generating a proposal.",
                    code: "CAPABILITY_STATEMENT_REQUIRED",
                    next: "/ai-drafter/capability-statement",
                },
            };
        }
        const p = profile as Record<string, unknown>;
        companyContext = `
CONTRACTOR PROFILE:
Company: ${p.company_name}
Location: ${p.state}
NAICS: ${((p.naics_codes as string[]) || []).join(", ")}
Certifications: ${((p.sba_certifications as string[]) || []).join(", ") || "None"}
Employees: ${p.employee_count || "N/A"}
Revenue: ${p.revenue ? `$${Number(p.revenue).toLocaleString()}` : "N/A"}
Years in Business: ${p.years_in_business || "N/A"}
Federal Awards: ${p.federal_awards_count || 0}
Description: ${p.company_description || "N/A"}
Website: ${p.website || "N/A"}
Capability Statement: ${(p.capability_statement as string) || "N/A"}`;
    }

    const o = opp as OppRow;
    const oppContext = `
OPPORTUNITY:
Title: ${o.title}
Agency: ${o.agency}
NAICS: ${o.naics_code}
Set-Aside: ${o.set_aside_code || "Full & Open Competition"}
Type: ${o.notice_type}
Deadline: ${o.response_deadline || "TBD"}
Value: ${o.estimated_value ? `$${Number(o.estimated_value).toLocaleString()}` : "Not specified"}
Incumbent: ${o.incumbent_contractor_name || "None identified"}

DESCRIPTION:
${descText.substring(0, 4000)}

REQUIREMENTS:
${JSON.stringify(o.structured_requirements || {}, null, 2).substring(0, 1000)}`;

    return { ok: true, opp: o, oppContext, companyContext, descText };
}

export type WrittenSection = { title: string; content: string; word_count: number; compliance_notes: string[] };
export type SectionError = { section: string; error: string };
export type ComplianceRow = { requirement: string; addressed_in: string; status: string };

export async function runProposalGeneration(opts: {
    openAIKey: string;
    db: SupabaseClient;
    notice_id: string;
    oppContext: string;
    companyContext: string;
    descText: string;
    opp: OppRow;
    sectionsToWrite: string[];
    tone: string;
    max_pages: number;
    jobId?: string;
}): Promise<{
    writtenSections: WrittenSection[];
    sectionErrors: SectionError[];
    complianceMatrix: ComplianceRow[];
    totalWords: number;
}> {
    const { openAIKey, db, notice_id, oppContext, companyContext, descText, opp, sectionsToWrite, tone, max_pages, jobId } = opts;
    const wordsPerSection = Math.floor((max_pages * 250) / sectionsToWrite.length);

    const writtenSections: WrittenSection[] = [];
    const sectionErrors: SectionError[] = [];

    if (jobId) {
        await db.from("proposal_jobs").update({
            status: "writing",
            total_sections: sectionsToWrite.length,
        }).eq("id", jobId);
    }

    for (const sectionTitle of sectionsToWrite) {
        if (jobId) {
            await db.from("proposal_jobs").update({ current_section: sectionTitle }).eq("id", jobId);
        }

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
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${openAIKey}` },
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
                if (content) {
                    const sec: WrittenSection = {
                        title: sectionTitle,
                        content,
                        word_count: content.split(/\s+/).length,
                        compliance_notes: [],
                    };
                    writtenSections.push(sec);
                    if (jobId) {
                        await db.from("proposal_jobs").update({
                            sections_completed: [
                                ...writtenSections.map(s => ({
                                    title: s.title,
                                    word_count: s.word_count,
                                    completed_at: new Date().toISOString(),
                                })),
                            ],
                            completed_sections: writtenSections.length,
                        }).eq("id", jobId);
                    }
                } else {
                    sectionErrors.push({ section: sectionTitle, error: "OpenAI returned empty content" });
                }
            } else {
                const errBody = await res.text().catch(() => "");
                console.error(`[write-proposal] OpenAI error for "${sectionTitle}" (${res.status}):`, errBody.substring(0, 500));
                sectionErrors.push({ section: sectionTitle, error: `OpenAI ${res.status}` });
            }
        } catch (err) {
            console.error(`[write-proposal] Section "${sectionTitle}" threw:`, err);
            sectionErrors.push({ section: sectionTitle, error: (err as Error).message });
        }

        if (jobId && sectionErrors.length > 0) {
            await db.from("proposal_jobs").update({ sections_errored: sectionErrors }).eq("id", jobId);
        }
    }

    // Compliance matrix
    let complianceMatrix: ComplianceRow[] = [];
    try {
        const compRes = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${openAIKey}` },
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
        } else {
            console.error(`[write-proposal] Compliance matrix OpenAI ${compRes.status}`);
        }
    } catch (err) {
        console.error("[write-proposal] Compliance matrix failed:", err);
    }

    const totalWords = writtenSections.reduce((s, sec) => s + sec.word_count, 0);

    // Mark ai_win_strategy on the opportunity (legacy behavior)
    await db.from("opportunities").update({
        ai_win_strategy: {
            ...(opp.ai_win_strategy || {}),
            proposal_generated: true,
            proposal_sections: writtenSections.length,
            proposal_words: totalWords,
            generated_at: new Date().toISOString(),
        },
    }).eq("notice_id", notice_id);

    return { writtenSections, sectionErrors, complianceMatrix, totalWords };
}
