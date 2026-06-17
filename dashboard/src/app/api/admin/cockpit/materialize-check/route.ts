/**
 * POST /api/admin/cockpit/materialize-check  { contractor_id }
 *
 * Synthesizes a `company_analyses` row FROM a contractor so the existing
 * customer-facing /check/[analysisId] page can render it as-is — the partner
 * can then open / share the exact results page for a contractor who never ran
 * the public Quick Checker form.
 *
 * Why a company_analyses row (and not a bespoke page): /check + its status API
 * (`/api/analyze-company/status/[analysisId]`) already render the full dossier
 * (preview_matches, readiness, cert recommendations, strategic brief). The
 * cheapest, lowest-bug path is to map the contractor into the same row shape
 * and reuse that page untouched. The page is PUBLIC + shareable by URL.
 *
 * Field-name parity (verified against the /check page + status route):
 *   - status route is `select("*")` from company_analyses, so the columns we
 *     write ARE the fields the page reads.
 *   - preview_matches[] uses the ScoredMatch shape from quick-checker-finish.ts
 *     (opportunity_id, score 0-1, classification, score_breakdown, title,
 *     agency, naics_code, set_aside_code, response_deadline, notice_type,
 *     award_amount, notice_id, place_of_performance_state, description_url,
 *     source, matched_keywords, eligibility). We build it the SAME way the
 *     Quick Checker pipeline does.
 *   - inferred_profile.contact_person → { name, title, email, phone } matches
 *     what the page's `profile.contact_person || samPocs[0] || ...` reads.
 *
 * Idempotent: the created analysis id is stashed on contractors.check_analysis_id
 * (migration 179). Re-running UPDATES the same company_analyses row instead of
 * creating duplicates.
 *
 * Admin-gated via assertAdmin(). Service client for the cross-table writes.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";
import { scoreOpportunityLeadMagnet } from "@/lib/match-scoring";
import type { OpportunityForScoring, ScoredMatch, ProfileForScoring } from "@/lib/match-scoring";
import { generateCertRecommendations } from "@/lib/cert-recommendations";
import { buildScoringProfile } from "@/lib/outreach/match-drop";
import { computeReadinessScore } from "@/lib/quick-checker-helpers";
import { enrichFirmographics } from "@/lib/quick-checker/firmographics";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const dynamic = "force-dynamic";
// Scoring + (optional) firmographics enrichment can run a few seconds.
export const maxDuration = 60;

function svc() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

const CONTRACTOR_COLS =
    "id, uei, company_name, website, email, primary_poc_name, primary_poc_email, primary_poc_title, phone, " +
    "naics_codes, certifications, sba_certifications, state, city, employee_count, years_in_business, " +
    "federal_awards_count, qc_enriched, top_match_count, capability_summary_ai, owner_linkedin, social_linkedin, " +
    "social_facebook, social_twitter, website_cms, check_analysis_id";

// Columns we pull for full preview_matches detail (mirrors quick-checker-finish).
const OPP_DETAIL_COLS =
    "id, title, agency, naics_code, set_aside_code, response_deadline, notice_type, award_amount, " +
    "notice_id, place_of_performance_state, description, structured_requirements, source";

function toStrArray(v: unknown): string[] {
    if (!Array.isArray(v)) return [];
    return v
        .map((x) => (typeof x === "string" ? x : (x && typeof x === "object" ? String((x as any).type || (x as any).name || "") : "")))
        .filter(Boolean);
}

/** certifications as {type, confidence} — the shape computeReadinessScore + /check expect. */
function toCertObjects(v: unknown): { type: string; confidence: number }[] {
    return toStrArray(v).map((type) => ({ type, confidence: 0.9 }));
}

/** Strip protocol/path → bare domain for firmographics + Apollo. */
function toDomain(website: string | null | undefined): string {
    if (!website) return "";
    try {
        const u = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`);
        return u.hostname.replace(/^www\./, "");
    } catch {
        return String(website).replace(/^https?:\/\//i, "").replace(/^www\./, "").split("/")[0];
    }
}

export async function POST(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    let body: { contractor_id?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
    }
    const contractorId = (body.contractor_id || "").trim();
    if (!contractorId) {
        return NextResponse.json({ error: "contractor_id required" }, { status: 400 });
    }

    const sb = svc();

    // ── Load the contractor ───────────────────────────────────────────────────
    const { data: c, error: cErr } = await sb
        .from("contractors")
        .select(CONTRACTOR_COLS)
        .eq("id", contractorId)
        .maybeSingle();
    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
    if (!c) return NextResponse.json({ error: "contractor not found" }, { status: 404 });

    const contractor = c as any;
    const blob = (contractor.capability_summary_ai || {}) as any;
    const naics: string[] = Array.isArray(contractor.naics_codes) ? contractor.naics_codes.filter(Boolean) : [];
    const certifications = toStrArray(contractor.certifications);
    const sbaCerts = toStrArray(contractor.sba_certifications);
    const certObjects = toCertObjects(contractor.certifications);

    // ── Score live opportunities (same path as enrich_contractor_matches) ──────
    const nowIso = new Date().toISOString();
    const profile: ProfileForScoring = buildScoringProfile(contractor, blob);

    let oppPool: Array<OpportunityForScoring & { notice_id?: string | null; title?: string | null; agency?: string | null; description?: string | null; source?: string | null }> = [];
    if (naics.length) {
        const { data: oppRows } = await sb
            .from("opportunities")
            .select(OPP_DETAIL_COLS)
            .in("naics_code", naics)
            .neq("is_archived", true)
            .or(`response_deadline.is.null,response_deadline.gte.${nowIso}`)
            .order("response_deadline", { ascending: true, nullsFirst: false })
            .limit(400);
        oppPool = (oppRows || []) as any[];
    }

    // Build rich preview_matches in the ScoredMatch shape the /check page reads.
    const previewMatches: ScoredMatch[] = [];
    for (const opp of oppPool) {
        const enrichedOpp: OpportunityForScoring = {
            id: opp.id,
            naics_code: opp.naics_code,
            psc_code: null,
            notice_type: (opp as any).notice_type,
            agency: opp.agency ?? null,
            set_aside_code: (opp as any).set_aside_code,
            place_of_performance_state: (opp as any).place_of_performance_state,
            award_amount: (opp as any).award_amount,
            response_deadline: (opp as any).response_deadline,
            title: opp.title,
            description: opp.description,
            structured_requirements: (opp as any).structured_requirements,
        } as OpportunityForScoring;
        const m = scoreOpportunityLeadMagnet(profile, enrichedOpp);
        // Skip biddable-but-ineligible (cert/size) just like the email scorer
        // does — we don't want to show a contractor a match they can't win.
        if (!m || m.eligibility !== "eligible") continue;
        previewMatches.push({
            ...m,
            title: opp.title ?? undefined,
            agency: opp.agency ?? undefined,
            naics_code: opp.naics_code ?? undefined,
            set_aside_code: (opp as any).set_aside_code ?? undefined,
            response_deadline: (opp as any).response_deadline ?? undefined,
            notice_type: (opp as any).notice_type ?? undefined,
            award_amount: (opp as any).award_amount ?? undefined,
            notice_id: (opp as any).notice_id ?? undefined,
            place_of_performance_state: (opp as any).place_of_performance_state ?? undefined,
            description_url: opp.description ?? undefined,
            source: (opp as any).source ?? undefined,
            eligibility: m.eligibility,
            required_certifications: m.required_certifications,
        } as ScoredMatch);
    }
    previewMatches.sort((a, b) => b.score - a.score);
    const topPreview = previewMatches.slice(0, 10);

    // Cert recommendations from the same opp pool (what the /check page renders).
    let certRecommendations: any[] = [];
    try {
        certRecommendations = generateCertRecommendations(
            [...certifications, ...sbaCerts],
            oppPool as (OpportunityForScoring & { title?: string })[],
            naics,
        );
    } catch (e) {
        console.error("[materialize-check] cert recs failed:", e instanceof Error ? e.message : e);
        certRecommendations = [];
    }

    // ── Firmographics — on-demand fill via the shared cascade (best-effort) ────
    // Only run when the contractor is thin on firmographic signal AND we have a
    // domain. Network calls are wrapped so a failure never blocks the page.
    const domain = toDomain(contractor.website);
    let firmographics: any = null;
    const needsFirmo = !contractor.employee_count || !contractor.years_in_business;
    if (domain && needsFirmo) {
        try {
            firmographics = await enrichFirmographics({
                domain,
                companyName: contractor.company_name || domain,
                uei: contractor.uei ?? null,
                existing: {
                    employee_count: contractor.employee_count ?? null,
                    founded_year: contractor.years_in_business
                        ? new Date().getFullYear() - Number(contractor.years_in_business)
                        : null,
                },
            });
        } catch (e) {
            console.error("[materialize-check] firmographics failed:", e instanceof Error ? e.message : e);
            firmographics = null;
        }
    }

    // Reconcile employee_count / years_in_business with anything firmographics found.
    const employeeCount: number | null =
        contractor.employee_count ?? firmographics?.employee_count?.value ?? null;
    const yearsInBusiness: number | null =
        contractor.years_in_business ?? firmographics?.years_in_business?.value ?? null;
    const foundedYear: number | null =
        firmographics?.founded_year?.value ??
        (yearsInBusiness ? new Date().getFullYear() - Number(yearsInBusiness) : null);

    // ── crawl_data — the shape computeReadinessScore + StrategicBriefPanel read.
    const services: string[] = Array.isArray(blob.services) ? blob.services.map(String).filter(Boolean) : [];
    const summary: string =
        (typeof blob.findings_summary === "string" && blob.findings_summary) ||
        (typeof blob.capability_summary === "string" && blob.capability_summary) ||
        "";
    const crawlData: Record<string, any> = {
        description: summary,
        services,
        detected_states: contractor.state ? [contractor.state] : [],
        contacts: [
            contractor.email || contractor.primary_poc_email
                ? { email: contractor.email || contractor.primary_poc_email, name: contractor.primary_poc_name || undefined }
                : null,
            contractor.phone ? { phone: contractor.phone } : null,
        ].filter(Boolean),
        certifications: certObjects,
        leadership: contractor.primary_poc_name
            ? [{ name: contractor.primary_poc_name, title: contractor.primary_poc_title || "Contact" }]
            : [],
        social_links: {
            linkedin: contractor.owner_linkedin || contractor.social_linkedin || undefined,
            facebook: contractor.social_facebook || undefined,
            twitter: contractor.social_twitter || undefined,
        },
        founding_year: foundedYear || undefined,
        years_in_business: yearsInBusiness || undefined,
        employee_signals: employeeCount ? { estimate: employeeCount, source: "contractors" } : null,
        // Strategic-brief pull-throughs (only present if the QC blob has them).
        strengths: toStrArray(blob.strengths),
        weaknesses: toStrArray(blob.weaknesses),
        pitch_angles: toStrArray(blob.pitch_angles),
        nail_down_keywords: toStrArray(blob.nail_down_keywords || blob.capability_keywords),
    };

    // ── Readiness (deterministic, same helper as the live pipeline) ────────────
    const samDataForReadiness = contractor.uei
        ? { uei: contractor.uei, sba_certifications: sbaCerts }
        : null;
    const { score: readinessScore, breakdown: readinessBreakdown } = computeReadinessScore({
        samData: samDataForReadiness as Record<string, unknown> | null,
        crawlData,
        certifications: certObjects,
        usaspendingAwardCount: Number(contractor.federal_awards_count || 0),
    });

    // ── sam_data — only when we actually have a UEI (drives "SAM.gov Verified"). ─
    const samData = contractor.uei
        ? {
            uei: contractor.uei,
            company_name: contractor.company_name || undefined,
            state: contractor.state || undefined,
            city: contractor.city || undefined,
            phone: contractor.phone || undefined,
            naics_codes: naics,
            sba_certifications: sbaCerts,
            points_of_contact: contractor.primary_poc_name
                ? [{
                    name: contractor.primary_poc_name,
                    title: contractor.primary_poc_title || "",
                    email: contractor.primary_poc_email || undefined,
                }]
                : [],
        }
        : {};

    // ── inferred_profile — contact_person shape matches /check's reader. ───────
    const inferredProfile: Record<string, any> = {
        company_name: contractor.company_name || undefined,
        website: contractor.website || undefined,
        uei: contractor.uei || undefined,
        state: contractor.state || undefined,
        phone: contractor.phone || undefined,
        email: contractor.email || contractor.primary_poc_email || undefined,
        naics_codes: naics,
        sba_certifications: sbaCerts,
        certifications,
        employee_count: employeeCount ?? undefined,
        years_in_business: yearsInBusiness ?? undefined,
        federal_awards_count: contractor.federal_awards_count ?? undefined,
        contact_person: contractor.primary_poc_name
            ? {
                name: contractor.primary_poc_name,
                title: contractor.primary_poc_title || "",
                email: contractor.primary_poc_email || undefined,
                phone: contractor.phone || undefined,
                linkedin_url: contractor.owner_linkedin || contractor.social_linkedin || undefined,
                source: "contractors",
            }
            : null,
    };

    // inferred_naics — the /check page maps these to {code,label} chips.
    const inferredNaics = naics.map((code) => ({
        code,
        label: code,
        confidence: 1,
        matched_keywords: [],
    }));

    // ── Assemble the company_analyses row ──────────────────────────────────────
    // website is NOT NULL on the table; fall back to a sam.gov entity link when
    // the contractor has no site so the insert never fails.
    const website =
        contractor.website ||
        (contractor.uei ? `https://sam.gov/entity/${contractor.uei}` : "https://capturepilot.com");

    const analysisRow: Record<string, any> = {
        company_name: contractor.company_name || "Unnamed contractor",
        website,
        uei: contractor.uei || null,
        company_summary: summary || null,
        status: "complete", // must be one of the CHECK-constrained statuses (migration 007)
        crawl_data: crawlData,
        sam_data: samData,
        inferred_naics: inferredNaics,
        selected_naics_codes: naics,
        preview_matches: topPreview,
        inferred_profile: inferredProfile,
        cert_recommendations: certRecommendations,
        easy_wins: [],
        competitors: [],
        readiness_score: readinessScore,
        readiness_breakdown: readinessBreakdown,
        ai_match_summaries: {},
        firmographics: firmographics || null,
    };

    // ── Idempotent upsert keyed on contractors.check_analysis_id ───────────────
    const existingId: string | null = contractor.check_analysis_id || null;
    let analysisId: string;

    if (existingId) {
        const { data: upd, error: updErr } = await sb
            .from("company_analyses")
            .update(analysisRow)
            .eq("id", existingId)
            .select("id")
            .maybeSingle();
        if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
        if (upd?.id) {
            analysisId = upd.id;
        } else {
            // Stored id no longer points at a live row (hard-deleted) — re-create.
            const { data: ins, error: insErr } = await sb
                .from("company_analyses")
                .insert(analysisRow)
                .select("id")
                .single();
            if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
            analysisId = ins.id;
            await sb.from("contractors").update({ check_analysis_id: analysisId }).eq("id", contractorId);
        }
    } else {
        const { data: ins, error: insErr } = await sb
            .from("company_analyses")
            .insert(analysisRow)
            .select("id")
            .single();
        if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
        analysisId = ins.id;
        await sb.from("contractors").update({ check_analysis_id: analysisId }).eq("id", contractorId);
    }

    return NextResponse.json({
        ok: true,
        analysis_id: analysisId,
        check_url: `/check/${analysisId}`,
        match_count: topPreview.length,
        readiness_score: readinessScore,
    });
}
