/**
 * Cron-auth twin of /api/admin/contractor-profiles/publish.
 *
 * Identical pipeline but gated by CRON_SECRET bearer instead of admin
 * session cookie — so the operator (or this assistant) can trigger
 * profile publishing from a terminal without an admin login.
 *
 * Use the same query params as /api/cron/backfill_extracted_contacts:
 *   - ?limit=N (default 3, capped at 100)
 *   - ?dry_run=true preview the picks
 *
 * Not scheduled in vercel.json — operator-triggered for the pilot bootstrap.
 * The daily-drip variant will live at /api/cron/publish_daily_contractor and
 * be scheduled there once the pilot is approved.
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

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;

    const url = new URL(req.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 3), 1), 100);
    const dryRun = url.searchParams.get("dry_run") === "true";

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    const { data: alreadyPublished } = await sb
        .from("contractor_profile_pages")
        .select("contractor_uei");
    const publishedUeis = new Set(
        ((alreadyPublished as Array<{ contractor_uei: string }>) || []).map((r) => r.contractor_uei),
    );

    const { data: candidates, error: cErr } = await sb
        .from("contractors")
        .select("uei, business_name, primary_naics, state, city, cage_code, sam_registered, sba_certifications, website, total_obligated")
        .gt("total_obligated", 0)
        .order("total_obligated", { ascending: false })
        .limit(limit + publishedUeis.size + 20);

    if (cErr) {
        return NextResponse.json({ error: cErr.message }, { status: 500 });
    }

    type Cand = ContractorRow & { total_obligated: number };
    const pool = ((candidates || []) as Cand[])
        .filter((c) => !publishedUeis.has(c.uei))
        .slice(0, limit);

    if (pool.length === 0) {
        return NextResponse.json({ ok: true, picked: 0, note: "no eligible contractors" });
    }

    if (dryRun) {
        return NextResponse.json({
            ok: true,
            dry_run: true,
            would_publish: pool.map((c) => ({
                uei: c.uei,
                name: c.business_name,
                total_obligated: c.total_obligated,
                proposed_slug: slugify(c.business_name),
            })),
        });
    }

    const results: Array<{ uei: string; slug?: string; status: string; error?: string; model?: string }> = [];

    for (const c of pool) {
        try {
            const baseSlug = slugify(c.business_name);
            const slug = await uniqueSlug(sb, baseSlug, c.uei);
            const rollup = await buildAwardRollup(sb, c.uei);
            const apollo = await enrichCompanyViaApollo({ name: c.business_name, domain: c.website || undefined });
            const ai = await generateAiSummary({ contractor: c, rollup, apollo });
            const score = computeFederalScore({ contractor: c, rollup, apollo });

            const insertRow = {
                contractor_uei: c.uei,
                slug,
                business_name: c.business_name,
                primary_naics: c.primary_naics,
                state: c.state,
                city: c.city,
                cage_code: c.cage_code,
                sam_registered: c.sam_registered,
                sba_certifications: c.sba_certifications,
                total_awarded_amount: rollup.total_awarded_amount,
                total_awards_count: rollup.total_awards_count,
                top_agency: rollup.top_agency,
                top_agency_amount: rollup.top_agency_amount,
                awards_by_year: rollup.awards_by_year,
                top_naics_codes: rollup.top_naics_codes,
                ai_summary: ai?.summary || null,
                ai_summary_model: ai?.model || null,
                apollo_data: apollo?.raw as Record<string, unknown> | null,
                company_website: apollo?.company_website || c.website,
                company_linkedin: apollo?.company_linkedin || null,
                company_size_est: apollo?.company_size_est || null,
                industry: apollo?.industry || null,
                founded_year: apollo?.founded_year || null,
                federal_score: score.federal_score,
                score_breakdown: score.score_breakdown,
                badges: score.badges,
                is_published: true,
                published_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };

            const { error: upErr } = await sb
                .from("contractor_profile_pages")
                .upsert(insertRow, { onConflict: "contractor_uei" });

            if (upErr) {
                results.push({ uei: c.uei, status: "error", error: upErr.message.slice(0, 200) });
            } else {
                results.push({ uei: c.uei, slug, status: "published", model: ai?.model });
            }
        } catch (err) {
            results.push({ uei: c.uei, status: "exception", error: (err as Error).message.slice(0, 200) });
        }
    }

    return NextResponse.json({
        ok: true,
        picked: pool.length,
        published: results.filter((r) => r.status === "published").length,
        errors: results.filter((r) => r.status !== "published").length,
        results,
    });
}
