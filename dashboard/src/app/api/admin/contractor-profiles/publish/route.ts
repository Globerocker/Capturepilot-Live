import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";
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

/**
 * POST /api/admin/contractor-profiles/publish
 *
 * Body: { limit?: number (default 3, max 100), dry_run?: boolean }
 *
 * Picks the next N contractors by total_obligated DESC that don't already
 * have a published profile page, enriches each, and inserts a row into
 * `contractor_profile_pages` with is_published=true.
 *
 * Default is 3 = the user's preferred pilot size. Bump to 500 once the
 * pilot looks good.
 */
export async function POST(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const limit = Math.min(Math.max(Number(body.limit) || 3, 1), 100);
    const dryRun = body.dry_run === true;

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    // Find candidates: contractors with award data that aren't already published.
    const { data: alreadyPublished } = await sb
        .from("contractor_profile_pages")
        .select("contractor_uei");
    const publishedUeis = new Set(((alreadyPublished as Array<{ contractor_uei: string }>) || []).map((r) => r.contractor_uei));

    // Contractors table has no scalar total-obligated column; we over-fetch
    // by USAspending-enriched recency, compute lifetime totals from the
    // naics_awards JSONB array, and sort client-side. See same logic in
    // /api/cron/publish_contractor_pages.
    const { data: candidates, error: cErr } = await sb
        .from("contractors")
        .select("uei, company_name, dba_name, naics_codes, naics_awards, state, city, cage_code, sam_registered, sba_certifications, website")
        .not("naics_awards", "eq", "[]")
        .not("naics_awards", "is", null)
        .order("last_usaspending_refresh", { ascending: false, nullsFirst: false })
        .limit(Math.max(500, limit + publishedUeis.size + 50));

    if (cErr) {
        return NextResponse.json({ error: cErr.message }, { status: 500 });
    }

    type RawCand = {
        uei: string;
        company_name: string | null;
        dba_name: string | null;
        naics_codes: string[] | null;
        naics_awards: Array<{ naics: string; total: number; count: number }> | null;
        state: string | null;
        city: string | null;
        cage_code: string | null;
        sam_registered: boolean | null;
        sba_certifications: string[] | null;
        website: string | null;
    };
    type Cand = ContractorRow & { lifetime_total: number };

    const pool: Cand[] = ((candidates || []) as RawCand[])
        .filter((c) => !publishedUeis.has(c.uei))
        .map((c) => {
            const lifetime_total = (c.naics_awards || []).reduce((s, n) => s + (Number(n.total) || 0), 0);
            return {
                uei: c.uei,
                business_name: c.company_name || c.dba_name || "(unnamed contractor)",
                primary_naics: (c.naics_codes && c.naics_codes[0]) || null,
                state: c.state,
                city: c.city,
                cage_code: c.cage_code,
                sam_registered: c.sam_registered,
                sba_certifications: c.sba_certifications,
                website: c.website,
                lifetime_total,
            };
        })
        // No `> 0` filter — naics_awards is empty across the table (separate
        // enrichment bug). Sort by total DESC then by cert-count DESC so the
        // most "interesting" pages still surface first.
        .sort((a, b) => {
            if (b.lifetime_total !== a.lifetime_total) return b.lifetime_total - a.lifetime_total;
            const aCerts = (a.sba_certifications || []).length;
            const bCerts = (b.sba_certifications || []).length;
            return bCerts - aCerts;
        })
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
                lifetime_total: c.lifetime_total,
                proposed_slug: slugify(c.business_name),
            })),
        });
    }

    const results: Array<{ uei: string; slug?: string; status: string; error?: string }> = [];

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
                results.push({ uei: c.uei, slug, status: "published" });
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
