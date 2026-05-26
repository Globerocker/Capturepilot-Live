/**
 * Path B — top-contractors-by-NAICS discovery.
 *
 * Pulls USAspending's "top recipients in NAICS X" leaderboard, looks each
 * winner up to obtain a recipient_id hash, then runs the full publish
 * pipeline (lifetime + by-year + by-agency + AI summary + Federal Score)
 * for any that aren't already in contractor_profile_pages.
 *
 * Use case: seed the directory with the ACTUAL top federal contractors in
 * the 20 most-active NAICS codes — instead of mining our 80k-row contractors
 * table for top-by-cert. The discovery endpoint returns full company name +
 * UEI + 3-year amount, so we don't need an existing row in `contractors`.
 *
 * Query params:
 *   ?naics=541330            single NAICS (default: cycles through SEED list)
 *   ?per_naics=10            how many top contractors to publish per NAICS (default 10)
 *   ?dry_run=true            preview without publishing
 *
 * Bounded to 5 NAICS per call so we fit the Vercel 300s budget — operator
 * loops over the SEED list across multiple invocations.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";
import {
    type ContractorRow,
    slugify,
    uniqueSlug,
    buildAwardRollup,
    computeFederalScore,
    enrichCompanyViaApollo,
    generateAiSummary,
} from "@/lib/contractor-profile";
import { getTopRecipientsByNaics } from "@/lib/usaspending";

export const runtime = "nodejs";
export const maxDuration = 300;

// Top 20 highest-volume federal-procurement NAICS codes (based on FPDS
// 3-year obligation totals across all agencies). Each is responsible for
// billions in annual federal contract awards, so the top-10 per NAICS gives
// us 200 extremely high-signal contractor pages.
const SEED_NAICS: Array<{ code: string; label: string }> = [
    { code: "541330", label: "Engineering Services" },
    { code: "541512", label: "Computer Systems Design Services" },
    { code: "541715", label: "R&D — Physical, Engineering, and Life Sciences" },
    { code: "236220", label: "Commercial and Institutional Building Construction" },
    { code: "541611", label: "Administrative Management Consulting" },
    { code: "517311", label: "Wired Telecommunications Carriers" },
    { code: "336411", label: "Aircraft Manufacturing" },
    { code: "541219", label: "Other Accounting Services" },
    { code: "561210", label: "Facilities Support Services" },
    { code: "541620", label: "Environmental Consulting Services" },
    { code: "561720", label: "Janitorial Services" },
    { code: "238210", label: "Electrical Contractors" },
    { code: "562112", label: "Hazardous Waste Collection" },
    { code: "541214", label: "Payroll Services" },
    { code: "541310", label: "Architectural Services" },
    { code: "238220", label: "Plumbing, Heating, Air-Conditioning Contractors" },
    { code: "541618", label: "Other Management Consulting" },
    { code: "611310", label: "Colleges, Universities, Professional Schools" },
    { code: "541990", label: "All Other Professional, Scientific Services" },
    { code: "541512", label: "Computer Systems Design (dup for emphasis)" },
];

export async function GET(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;

    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dry_run") === "true";
    const explicitNaics = url.searchParams.get("naics");
    const perNaics = Math.min(Math.max(Number(url.searchParams.get("per_naics") || 10), 1), 50);
    const startIdx = Number(url.searchParams.get("start") || 0);
    const naicsToProcess = explicitNaics
        ? [{ code: explicitNaics, label: explicitNaics }]
        : SEED_NAICS.slice(startIdx, startIdx + 5);

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    // Pre-fetch already-published UEIs to skip dupes.
    const { data: published } = await sb
        .from("contractor_profile_pages")
        .select("contractor_uei");
    const publishedSet = new Set(
        ((published as Array<{ contractor_uei: string }>) || []).map((r) => r.contractor_uei),
    );

    const perNaicsResults: Array<{
        naics: string;
        label: string;
        top_count: number;
        skipped_dupes: number;
        published: number;
        errors: number;
        sample: Array<{ name: string; uei: string | null; amount: number; slug?: string; status?: string }>;
    }> = [];

    for (const naics of naicsToProcess) {
        const top = await getTopRecipientsByNaics({ naics: naics.code, limit: perNaics * 3, fromFiscalYear: new Date().getFullYear() - 3 });
        if (top.length === 0) {
            perNaicsResults.push({ naics: naics.code, label: naics.label, top_count: 0, skipped_dupes: 0, published: 0, errors: 0, sample: [] });
            continue;
        }
        // Filter dupes BEFORE we burn AI calls.
        const candidates = top
            .filter((r) => r.uei && !publishedSet.has(r.uei))
            .slice(0, perNaics);
        const skipped = top.length - candidates.length;

        if (dryRun) {
            perNaicsResults.push({
                naics: naics.code,
                label: naics.label,
                top_count: top.length,
                skipped_dupes: skipped,
                published: 0,
                errors: 0,
                sample: candidates.map((c) => ({ name: c.name, uei: c.uei, amount: c.amount })),
            });
            continue;
        }

        let pubCount = 0;
        let errCount = 0;
        const sample: typeof perNaicsResults[number]["sample"] = [];

        for (const cand of candidates) {
            if (!cand.uei) { errCount++; continue; }
            try {
                const contractor: ContractorRow = {
                    uei: cand.uei,
                    business_name: cand.name,
                    primary_naics: naics.code,
                    state: null,
                    city: null,
                    cage_code: null,
                    sam_registered: true,
                    sba_certifications: [],
                    website: null,
                };

                const baseSlug = slugify(cand.name);
                const slug = await uniqueSlug(sb, baseSlug, cand.uei);
                const rollup = await buildAwardRollup(sb, cand.uei, cand.name);
                const apollo = await enrichCompanyViaApollo({ name: cand.name });
                const ai = await generateAiSummary({ contractor, rollup, apollo });
                const score = computeFederalScore({ contractor, rollup, apollo });

                // Insert/refresh contractors row so the rest of the pipeline
                // (refresh cron, USAspending re-enrichment) finds it later.
                await sb.from("contractors").upsert({
                    uei: cand.uei,
                    company_name: cand.name,
                    naics_codes: [naics.code],
                    sam_registered: true,
                }, { onConflict: "uei" });

                const { error: upErr } = await sb
                    .from("contractor_profile_pages")
                    .upsert({
                        contractor_uei: cand.uei,
                        slug,
                        business_name: cand.name,
                        primary_naics: naics.code,
                        total_awarded_amount: rollup.total_awarded_amount,
                        total_awards_count: rollup.total_awards_count,
                        top_agency: rollup.top_agency,
                        top_agency_amount: rollup.top_agency_amount,
                        awards_by_year: rollup.awards_by_year,
                        top_naics_codes: rollup.top_naics_codes,
                        ai_summary: ai?.summary || null,
                        ai_summary_model: ai?.model || null,
                        apollo_data: apollo?.raw as Record<string, unknown> | null,
                        company_website: apollo?.company_website || null,
                        company_linkedin: apollo?.company_linkedin || null,
                        company_size_est: apollo?.company_size_est || null,
                        industry: apollo?.industry || null,
                        founded_year: apollo?.founded_year || null,
                        federal_score: score.federal_score,
                        score_breakdown: score.score_breakdown,
                        badges: score.badges,
                        sam_registered: true,
                        is_published: true,
                        published_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    }, { onConflict: "contractor_uei" });

                if (upErr) {
                    errCount++;
                    sample.push({ name: cand.name, uei: cand.uei, amount: cand.amount, status: `err: ${upErr.message.slice(0, 80)}` });
                } else {
                    pubCount++;
                    publishedSet.add(cand.uei);
                    sample.push({ name: cand.name, uei: cand.uei, amount: cand.amount, slug, status: "published" });
                }
            } catch (e) {
                errCount++;
                sample.push({ name: cand.name, uei: cand.uei, amount: cand.amount, status: `exc: ${(e as Error).message.slice(0, 60)}` });
            }
        }

        perNaicsResults.push({
            naics: naics.code,
            label: naics.label,
            top_count: top.length,
            skipped_dupes: skipped,
            published: pubCount,
            errors: errCount,
            sample: sample.slice(0, 5),
        });
    }

    return NextResponse.json({
        ok: true,
        processed_naics: naicsToProcess.length,
        seed_total: SEED_NAICS.length,
        seed_start_index: startIdx,
        seed_next_index: startIdx + naicsToProcess.length,
        results: perNaicsResults,
    });
}
