import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { callLLMJson } from "@/lib/llm/deepseek";

export const maxDuration = 180;

/**
 * POST /api/ai/compliance-matrix
 * Body: { notice_id: string; force?: boolean; export?: "xlsx" | "json" }
 *
 * Parses Section L (instructions) + Section M (evaluation) + Section C (SOW)
 * + special contract requirements from an opportunity's description +
 * structured_requirements. Outputs a compliance matrix:
 *   rows = every "shall / must / will / required" obligation
 *   cols = section, requirement text, obligation verb, owner, status,
 *          addressable-by-user (yes/no/partial), proposal section ref
 *
 * Cached in compliance_matrices for 14 days. XLSX export uses exceljs
 * (already installed in the project).
 */

interface ComplianceRow {
    section: string;               // e.g. "L.3.2", "M.1", "C.4.1"
    requirement: string;           // the obligation text
    obligation_verb: string;       // "shall" | "must" | "will" | "required" | "should"
    category: string;              // "technical" | "management" | "past_performance" | "pricing" | "admin"
    owner: string;                 // "Capture Lead" | "Tech SME" | "Pricing" | "Contracts" | "Past Perf" | ...
    addressable: "yes" | "no" | "partial" | "unknown";
    mitigation: string | null;
    proposal_section_ref: string;  // "Vol II §3.1" etc
}

interface Matrix {
    opportunity_title: string;
    total_requirements: number;
    by_category: Record<string, number>;
    by_owner: Record<string, number>;
    compliance_score: number;       // % addressable
    rows: ComplianceRow[];
}

const SYSTEM_PROMPT = `You are a proposal compliance manager. Extract every explicit obligation (shall / must / will / required / should) from the provided federal opportunity text and return them as a JSON compliance matrix.

Rules:
- One row per distinct obligation. Do NOT merge or summarize.
- section: best-effort FAR-style section reference (e.g. "L.3.2", "M.2", "C.4"). If unknown use "General".
- obligation_verb: the exact verb from the text, lowercase.
- category: technical | management | past_performance | pricing | admin
- owner: Capture Lead | Tech SME | Pricing | Contracts | Past Perf | Security | Quality | Program Mgmt
- addressable: yes (user profile can clearly address it), partial (some gap), no (major gap), unknown
- mitigation: 1 sentence on how to close any gap, or null if fully addressable
- proposal_section_ref: best-guess target volume/section in the response

Return JSON matching the schema. No markdown. No commentary.

Schema:
{
  "opportunity_title": "string",
  "rows": [
    {
      "section": "L.3.2",
      "requirement": "string",
      "obligation_verb": "shall",
      "category": "technical",
      "owner": "Tech SME",
      "addressable": "yes",
      "mitigation": null,
      "proposal_section_ref": "Vol II §3.1"
    }
  ]
}`;

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
    const exportFormat = (body.export as "xlsx" | "json" | undefined) || "json";
    if (!noticeId) return NextResponse.json({ error: "notice_id required" }, { status: 400 });

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data: opp } = await admin
        .from("opportunities")
        .select("id, notice_id, title, description, structured_requirements")
        .eq("notice_id", noticeId)
        .single();
    if (!opp) return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
    const o = opp as Record<string, unknown>;
    const opportunityId = o.id as string;

    // Pull user profile for addressability scoring
    const { data: profile } = await admin
        .from("user_profiles")
        .select("capability_statement, naics_codes, sba_certifications, federal_awards_count, years_in_business")
        .eq("auth_user_id", user.id)
        .single();
    const p = (profile || {}) as Record<string, unknown>;

    // Cache check — 14 day TTL
    if (!force) {
        const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
        const { data: cached } = await admin
            .from("compliance_matrices")
            .select("matrix_json, compliance_score, generated_at, model_used")
            .eq("opportunity_id", opportunityId)
            .gt("generated_at", fourteenDaysAgo)
            .order("generated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
        if (cached) {
            if (exportFormat === "xlsx") {
                return buildXlsxResponse(cached.matrix_json as Matrix);
            }
            return NextResponse.json({
                matrix: cached.matrix_json,
                compliance_score: cached.compliance_score,
                generated_at: cached.generated_at,
                model: cached.model_used,
                cached: true,
            });
        }
    }

    const description = ((o.description as string) || "").slice(0, 20000);
    const structured = o.structured_requirements
        ? JSON.stringify(o.structured_requirements).slice(0, 10000)
        : "";

    const userMessage = [
        `OPPORTUNITY TITLE: ${o.title}`,
        "",
        "USER PROFILE CONTEXT (to rate 'addressable'):",
        JSON.stringify(
            {
                naics: p.naics_codes,
                certs: p.sba_certifications,
                federal_awards: p.federal_awards_count,
                years_in_business: p.years_in_business,
                capability_statement: ((p.capability_statement as string) || "").slice(0, 1500),
            },
            null,
            2
        ),
        "",
        "SOLICITATION TEXT:",
        description,
        "",
        structured ? `STRUCTURED REQUIREMENTS:\n${structured}` : "",
    ].join("\n");

    let matrixCore: { opportunity_title: string; rows: ComplianceRow[] };
    let modelUsed: string;
    try {
        matrixCore = await callLLMJson<{ opportunity_title: string; rows: ComplianceRow[] }>(
            [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: userMessage },
            ],
            { temperature: 0.2, max_tokens: 4000 }
        );
        modelUsed = process.env.DEEPSEEK_API_KEY ? "deepseek-chat" : "gpt-4o-mini";
    } catch (e) {
        const msg = e instanceof Error ? e.message : "LLM call failed";
        return NextResponse.json({ error: msg }, { status: 500 });
    }

    const rows = matrixCore.rows || [];
    const byCategory: Record<string, number> = {};
    const byOwner: Record<string, number> = {};
    let addressableCount = 0;
    for (const r of rows) {
        byCategory[r.category] = (byCategory[r.category] || 0) + 1;
        byOwner[r.owner] = (byOwner[r.owner] || 0) + 1;
        if (r.addressable === "yes") addressableCount += 1;
        else if (r.addressable === "partial") addressableCount += 0.5;
    }
    const complianceScore = rows.length > 0 ? Math.round((addressableCount / rows.length) * 100) : 0;

    const matrix: Matrix = {
        opportunity_title: matrixCore.opportunity_title || ((o.title as string) ?? ""),
        total_requirements: rows.length,
        by_category: byCategory,
        by_owner: byOwner,
        compliance_score: complianceScore,
        rows,
    };

    await admin.from("compliance_matrices").insert({
        opportunity_id: opportunityId,
        notice_id: noticeId,
        matrix_json: matrix,
        compliance_score: complianceScore,
        model_used: modelUsed,
    });

    if (exportFormat === "xlsx") {
        return buildXlsxResponse(matrix);
    }

    return NextResponse.json({
        matrix,
        compliance_score: complianceScore,
        generated_at: new Date().toISOString(),
        model: modelUsed,
        cached: false,
    });
}

async function buildXlsxResponse(matrix: Matrix): Promise<Response> {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Compliance Matrix");

    ws.columns = [
        { header: "Section", key: "section", width: 12 },
        { header: "Requirement", key: "requirement", width: 60 },
        { header: "Verb", key: "obligation_verb", width: 10 },
        { header: "Category", key: "category", width: 16 },
        { header: "Owner", key: "owner", width: 18 },
        { header: "Addressable", key: "addressable", width: 12 },
        { header: "Mitigation", key: "mitigation", width: 40 },
        { header: "Proposal Ref", key: "proposal_section_ref", width: 16 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF059669" },
    };
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };

    for (const r of matrix.rows) {
        ws.addRow(r);
    }

    const buffer = await wb.xlsx.writeBuffer();
    return new Response(buffer as unknown as BodyInit, {
        status: 200,
        headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="compliance-matrix.xlsx"`,
        },
    });
}
