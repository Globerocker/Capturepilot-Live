/**
 * Refresh already-published contractor profile pages.
 *
 * Same enrichment pipeline as /api/cron/publish_contractor_pages but
 * operates over EXISTING rows in contractor_profile_pages — updating
 * award rollups, AI summaries, Apollo data, and badges in place.
 *
 * Run after upgrading the USAspending client OR Apollo enrichment to
 * propagate richer data to the pilot pages without re-picking the pool.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";
import {
    type ContractorRow,
    buildAwardRollup,
    computeFederalScore,
    enrichCompanyViaApollo,
    generateAiSummary,
} from "@/lib/contractor-profile";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;

    const url = new URL(req.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 10), 1), 50);
    const slugFilter = url.searchParams.get("slug"); // refresh single page by slug

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    let query = sb
        .from("contractor_profile_pages")
        .select("id, contractor_uei, slug, business_name, primary_naics, state, city, cage_code, sam_registered, sba_certifications, company_website")
        .eq("is_published", true);
    if (slugFilter) {
        query = query.eq("slug", slugFilter);
    } else {
        query = query.order("updated_at", { ascending: true, nullsFirst: true }).limit(limit);
    }

    const { data: rows, error } = await query;
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const targets = (rows || []) as Array<{
        id: string;
        contractor_uei: string;
        slug: string;
        business_name: string;
        primary_naics: string | null;
        state: string | null;
        city: string | null;
        cage_code: string | null;
        sam_registered: boolean | null;
        sba_certifications: string[] | null;
        company_website: string | null;
    }>;

    if (targets.length === 0) {
        return NextResponse.json({ ok: true, scanned: 0, note: "no published pages match" });
    }

    const results: Array<{ slug: string; status: string; before?: number; after?: number; model?: string; agency?: string | null }> = [];

    for (const r of targets) {
        try {
            const contractor: ContractorRow = {
                uei: r.contractor_uei,
                business_name: r.business_name,
                primary_naics: r.primary_naics,
                state: r.state,
                city: r.city,
                cage_code: r.cage_code,
                sam_registered: r.sam_registered,
                sba_certifications: r.sba_certifications,
                website: r.company_website,
            };

            const rollup = await buildAwardRollup(sb, r.contractor_uei, r.business_name);
            const apollo = await enrichCompanyViaApollo({ name: r.business_name, domain: r.company_website || undefined });
            const ai = await generateAiSummary({ contractor, rollup, apollo });
            const score = computeFederalScore({ contractor, rollup, apollo });

            // Read previous total for the delta report.
            const { data: prev } = await sb
                .from("contractor_profile_pages")
                .select("total_awarded_amount")
                .eq("id", r.id)
                .maybeSingle();

            await sb
                .from("contractor_profile_pages")
                .update({
                    total_awarded_amount: rollup.total_awarded_amount,
                    total_awards_count: rollup.total_awards_count,
                    top_agency: rollup.top_agency,
                    top_agency_amount: rollup.top_agency_amount,
                    awards_by_year: rollup.awards_by_year,
                    top_naics_codes: rollup.top_naics_codes,
                    ai_summary: ai?.summary || null,
                    ai_summary_model: ai?.model || null,
                    apollo_data: apollo?.raw as Record<string, unknown> | null,
                    company_website: apollo?.company_website || r.company_website,
                    company_linkedin: apollo?.company_linkedin || null,
                    company_size_est: apollo?.company_size_est || null,
                    industry: apollo?.industry || null,
                    founded_year: apollo?.founded_year || null,
                    federal_score: score.federal_score,
                    score_breakdown: score.score_breakdown,
                    badges: score.badges,
                    updated_at: new Date().toISOString(),
                    last_recalc_at: new Date().toISOString(),
                })
                .eq("id", r.id);

            results.push({
                slug: r.slug,
                status: "refreshed",
                before: Number((prev as { total_awarded_amount?: number } | null)?.total_awarded_amount || 0),
                after: rollup.total_awarded_amount,
                model: ai?.model,
                agency: rollup.top_agency,
            });
        } catch (err) {
            results.push({ slug: r.slug, status: "error", model: (err as Error).message.slice(0, 100) });
        }
    }

    return NextResponse.json({
        ok: true,
        scanned: targets.length,
        refreshed: results.filter((r) => r.status === "refreshed").length,
        errors: results.filter((r) => r.status !== "refreshed").length,
        results,
    });
}
