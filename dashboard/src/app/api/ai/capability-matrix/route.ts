import { NextRequest, NextResponse, after } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { callLLMJson } from "@/lib/llm/deepseek";
import { createJob, runStep, startJob, completeJob, failJob } from "@/lib/background-jobs";

export const maxDuration = 120;

/**
 * POST /api/ai/capability-matrix
 * Body: { notice_id: string; force?: boolean }
 *
 * Cross-references user capabilities (capability statement + profile) against
 * opportunity evaluation criteria (Section M). Produces a factor-by-factor
 * strength/gap assessment. Cached in capability_matrices for 14 days.
 */

interface MatrixRow {
    factor: string;                            // e.g. "Technical Approach", "Past Performance", "Key Personnel"
    factor_weight: string;                     // "critical" | "high" | "medium" | "low"
    opp_requirement: string;                   // what the RFP demands for this factor
    user_strength: string;                     // what user can cite
    assessment: "strong" | "moderate" | "weak" | "gap";
    gap_description: string | null;            // where user falls short, or null
    mitigation: string | null;                 // how to close the gap in the proposal
    citation_ideas: string[];                  // specific past projects / capabilities to mention
}

interface CapabilityMatrix {
    opportunity_title: string;
    overall_fit: "strong" | "moderate" | "weak" | "poor";
    total_factors: number;
    strong_count: number;
    moderate_count: number;
    weak_count: number;
    gap_count: number;
    top_risks: string[];                      // 3 biggest gaps
    top_strengths: string[];                   // 3 strongest fits
    recommended_win_themes: string[];
    rows: MatrixRow[];
}

const SYSTEM_PROMPT = `You are a proposal capture strategist. Given a user profile + opportunity, produce a capability × evaluation matrix that objectively rates the user's fit per evaluation factor.

Rules:
- Extract evaluation factors from the opportunity's Section M / evaluation criteria (weight them critical/high/medium/low).
- For each factor, state exactly what the RFP requires (opp_requirement), what the user can cite (user_strength), and rate the fit.
- gap_description: be specific. "No past performance in cloud migration for agencies over 10K seats" not "limited experience".
- citation_ideas: reference SPECIFIC past projects / certifications / staff by name from the user profile.
- mitigation: 1-2 sentences on HOW to address the gap in the proposal (teaming, subcontractor, key hire, recent training, etc.).

Return JSON only. No commentary, no markdown.

Schema:
{
  "opportunity_title": "string",
  "rows": [
    {
      "factor": "Technical Approach",
      "factor_weight": "critical",
      "opp_requirement": "string",
      "user_strength": "string",
      "assessment": "strong" | "moderate" | "weak" | "gap",
      "gap_description": "string or null",
      "mitigation": "string or null",
      "citation_ideas": ["string"]
    }
  ],
  "recommended_win_themes": ["string x 3-5"]
}`;

function calcOverallFit(rows: MatrixRow[]): CapabilityMatrix["overall_fit"] {
    if (rows.length === 0) return "poor";
    const weights: Record<string, number> = { strong: 1, moderate: 0.6, weak: 0.3, gap: 0 };
    const weightsFactor: Record<string, number> = { critical: 3, high: 2, medium: 1, low: 0.5 };
    let total = 0;
    let max = 0;
    for (const r of rows) {
        const fw = weightsFactor[r.factor_weight] || 1;
        total += (weights[r.assessment] || 0) * fw;
        max += fw;
    }
    const ratio = max > 0 ? total / max : 0;
    if (ratio >= 0.75) return "strong";
    if (ratio >= 0.5) return "moderate";
    if (ratio >= 0.3) return "weak";
    return "poor";
}

export async function POST(req: NextRequest) {
    const cookieStore = await cookies();
    const sb = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const noticeId = body.notice_id as string | undefined;
    const force = body.force === true;
    if (!noticeId) return NextResponse.json({ error: "notice_id required" }, { status: 400 });

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data: profile } = await admin
        .from("user_profiles")
        .select("id, company_name, capability_statement, naics_codes, sba_certifications, years_in_business, federal_awards_count, revenue, employee_count, is_veteran_owned, veteran_cert_type")
        .eq("auth_user_id", user.id)
        .single();
    if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });
    const p = profile as Record<string, unknown>;
    const userProfileId = p.id as string;

    const { data: opp } = await admin
        .from("opportunities")
        .select("id, notice_id, title, description, structured_requirements")
        .eq("notice_id", noticeId)
        .single();
    if (!opp) return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
    const o = opp as Record<string, unknown>;
    const opportunityId = o.id as string;

    if (!force) {
        const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
        const { data: cached } = await admin
            .from("capability_matrices")
            .select("matrix_json, overall_fit, generated_at")
            .eq("user_profile_id", userProfileId)
            .eq("opportunity_id", opportunityId)
            .gt("generated_at", fourteenDaysAgo)
            .order("generated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
        if (cached) {
            return NextResponse.json({
                matrix: cached.matrix_json,
                overall_fit: cached.overall_fit,
                generated_at: cached.generated_at,
                cached: true,
            });
        }
    }

    const { jobId } = await createJob(userProfileId, {
        kind: "capability_matrix",
        title: `Capability Matrix: ${String(o.title || "Opportunity").slice(0, 80)}`,
        opportunity_id: opportunityId,
        notice_id: noticeId,
        steps: [
            { key: "prepare_context", label: "Building profile + opportunity context" },
            { key: "llm_call", label: "Scoring factor-by-factor fit via LLM (can take up to 60s)" },
            { key: "rank", label: "Ranking top strengths + gaps" },
            { key: "persist", label: "Saving matrix to your account" },
        ],
    });

    after(async () => {
        await startJob(jobId);
        try {
            const userMessage = await runStep<string>(
                jobId,
                "prepare_context",
                async () => [
                    "USER PROFILE:",
                    JSON.stringify({
                        company: p.company_name,
                        naics: p.naics_codes,
                        certs: p.sba_certifications,
                        years: p.years_in_business,
                        federal_awards: p.federal_awards_count,
                        revenue: p.revenue,
                        employees: p.employee_count,
                        veteran: p.is_veteran_owned ? p.veteran_cert_type : null,
                        capability_statement: ((p.capability_statement as string) || "").slice(0, 3000),
                    }, null, 2),
                    "",
                    "OPPORTUNITY:",
                    `Title: ${o.title}`,
                    "",
                    "SOLICITATION TEXT:",
                    ((o.description as string) || "").slice(0, 15000),
                    "",
                    "STRUCTURED REQUIREMENTS:",
                    o.structured_requirements ? JSON.stringify(o.structured_requirements).slice(0, 8000) : "(none)",
                    "",
                    "Generate the capability matrix JSON.",
                ].join("\n"),
                { detailOnDone: (s) => `${s.length.toLocaleString()} chars of context` },
            ) || "";

            const core = await runStep<{ opportunity_title: string; rows: MatrixRow[]; recommended_win_themes?: string[] }>(
                jobId,
                "llm_call",
                async () => callLLMJson(
                    [
                        { role: "system", content: SYSTEM_PROMPT },
                        { role: "user", content: userMessage },
                    ],
                    { temperature: 0.3, max_tokens: 3500 },
                ),
                {
                    detailOnStart: process.env.DEEPSEEK_API_KEY ? "Using DeepSeek V3" : "Using OpenAI gpt-4o-mini",
                    detailOnDone: (c) => `${c.rows?.length ?? 0} factors scored`,
                },
            );
            if (!core) throw new Error("LLM returned empty");

            const matrix = await runStep<CapabilityMatrix>(
                jobId,
                "rank",
                async () => {
                    const rows = core.rows || [];
                    const counts = { strong: 0, moderate: 0, weak: 0, gap: 0 };
                    for (const r of rows) counts[r.assessment] = (counts[r.assessment] || 0) + 1;
                    const strengths = rows
                        .filter((r) => r.assessment === "strong")
                        .slice(0, 3)
                        .map((r) => `${r.factor}: ${r.user_strength}`);
                    const risks = rows
                        .filter((r) => r.assessment === "gap" || r.assessment === "weak")
                        .slice(0, 3)
                        .map((r) => `${r.factor}: ${r.gap_description || "gap"}`);
                    const overallFit = calcOverallFit(rows);
                    return {
                        opportunity_title: core.opportunity_title || ((o.title as string) ?? ""),
                        overall_fit: overallFit,
                        total_factors: rows.length,
                        strong_count: counts.strong,
                        moderate_count: counts.moderate,
                        weak_count: counts.weak,
                        gap_count: counts.gap,
                        top_risks: risks,
                        top_strengths: strengths,
                        recommended_win_themes: core.recommended_win_themes || [],
                        rows,
                    };
                },
                { detailOnDone: (m) => `Overall fit: ${m.overall_fit}  · ${m.strong_count} strong, ${m.gap_count} gaps` },
            );

            if (!matrix) throw new Error("Matrix not computed");

            await runStep(
                jobId,
                "persist",
                async () => {
                    const { error: insErr } = await admin.from("capability_matrices").insert({
                        user_profile_id: userProfileId,
                        opportunity_id: opportunityId,
                        matrix_json: matrix,
                        overall_fit: matrix.overall_fit,
                    });
                    if (insErr) throw new Error(insErr.message);
                    return "saved";
                },
            );

            await completeJob(jobId, { matrix, overall_fit: matrix.overall_fit });
        } catch (e) {
            await failJob(jobId, (e as Error).message || "capability-matrix failed").catch(() => { /* noop */ });
        }
    });

    return NextResponse.json({ jobId });
}
