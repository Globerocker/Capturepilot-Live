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
    // ?reset=true wipes existing profile rows first so we can re-pick the
    // pilot set from a corrected sort order. Use sparingly.
    const reset = url.searchParams.get("reset") === "true";

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    if (reset) {
        // Soft-reset only the pilot rows (those without claim_email) so we
        // never blow away a contractor who's claimed their profile.
        await sb.from("contractor_profile_pages")
            .delete()
            .is("claim_email", null);
    }

    const { data: alreadyPublished } = await sb
        .from("contractor_profile_pages")
        .select("contractor_uei");
    const publishedUeis = new Set(
        ((alreadyPublished as Array<{ contractor_uei: string }>) || []).map((r) => r.contractor_uei),
    );

    // Sort by total_award_volume DESC — this is the scalar populated by the
    // enrich_contractors_usaspending cron alongside naics_awards. It's the
    // signal we actually want: real award history. Filtering by > 0 drops
    // the long tail of zero-award SAM-registered firms (the bulk of the
    // table, mostly small inactive entities).
    const { data: candidates, error: cErr } = await sb
        .from("contractors")
        .select("uei, company_name, dba_name, naics_codes, naics_awards, state, city, cage_code, sam_registered, sba_certifications, website, total_award_volume, federal_awards_count, capability_summary_ai, years_in_business")
        .gt("total_award_volume", 0)
        .order("total_award_volume", { ascending: false })
        .limit(Math.max(1000, limit + publishedUeis.size + 100));

    if (cErr) {
        return NextResponse.json({ error: cErr.message }, { status: 500 });
    }

    type RawCand = {
        uei: string;
        company_name: string | null;
        dba_name: string | null;
        naics_codes: string[] | null;
        naics_awards: Array<{ naics: string; amount: number; count: number; description?: string }> | null;
        state: string | null;
        city: string | null;
        cage_code: string | null;
        sam_registered: boolean | null;
        sba_certifications: string[] | null;
        website: string | null;
        total_award_volume: number | null;
        federal_awards_count: number | null;
        capability_summary_ai: Record<string, unknown> | null;
        years_in_business: number | null;
    };

    type Cand = ContractorRow & {
        lifetime_total: number;
        capability_summary_ai?: Record<string, unknown> | null;
        years_in_business?: number | null;
    };

    // Non-contractor entity blocklist. These show up in the contractors
    // table because SAM registers federal agencies, foreign governments,
    // and military commands as "entities" that receive funds. They don't
    // belong in a US-contractor-focused SEO directory.
    const NON_CONTRACTOR_PATTERNS = [
        /^MINISTRY OF /i,
        /^GOVERNMENT OF /i,
        /^REPUBLIC OF /i,
        /^EMBASSY OF /i,
        /\bFOREIGN MILITARY SALES?\b/i,
        /^(AIR FORCE|ARMY|NAVY|MARINE CORPS|MARINES|COAST GUARD|SPACE FORCE)\b.*\bDEPARTMENT\b/i,
        /^DEPARTMENT OF (?!.*\bDEFENSE INC|.*LLC|.*CORP)/i,
        /\bUNITED STATES DEPARTMENT\b/i,
        /\bDEFENSE LOGISTICS AGENCY\b/i,
        /\bUS ARMY CORPS OF ENGINEERS\b/i,
        /\bNATIONAL (GUARD|RECONNAISSANCE|SECURITY) /i,
        /,\s*(?:[A-Z'\s-]+\s+)?(?:STATE\s+)?DEPARTMENT\s+OF/i,
        /\bAIR FORCE BASE\b/i,
        /\bARMY (BASE|GARRISON|DEPOT|RESERVE)\b/i,
        /\bNAVAL (BASE|STATION|AIR STATION|SUPPORT ACTIVITY)\b/i,
        /\bMARINE CORPS BASE\b/i,
        /\bAFB\s+LODGING\b/i,
        /^STATE OF (?!.*USA|.*\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b)/i,
    ];
    // US state names that prefix state-agency entries.
    const US_STATES = new Set([
        "ALABAMA","ALASKA","ARIZONA","ARKANSAS","CALIFORNIA","COLORADO","CONNECTICUT",
        "DELAWARE","FLORIDA","GEORGIA","HAWAII","IDAHO","ILLINOIS","INDIANA","IOWA",
        "KANSAS","KENTUCKY","LOUISIANA","MAINE","MARYLAND","MASSACHUSETTS","MICHIGAN",
        "MINNESOTA","MISSISSIPPI","MISSOURI","MONTANA","NEBRASKA","NEVADA","NEW",
        "NORTH","OHIO","OKLAHOMA","OREGON","PENNSYLVANIA","RHODE","SOUTH","TENNESSEE",
        "TEXAS","UTAH","VERMONT","VIRGINIA","WASHINGTON","WEST","WISCONSIN","WYOMING",
        "DISTRICT","PUERTO","COMMONWEALTH",
    ]);
    function isNonContractor(name: string): boolean {
        if (!name) return false;
        if (NON_CONTRACTOR_PATTERNS.some((re) => re.test(name))) return true;
        const first = (name.trim().split(/\s+/)[0] || "").toUpperCase().replace(/[.,]/g, "");
        if (US_STATES.has(first) && /\bDEPARTMENT\b/i.test(name)) return true;
        return false;
    }

    const raw = ((candidates || []) as RawCand[])
        .filter((c) => !isNonContractor(c.company_name || c.dba_name || ""));
    // Prefer the scalar `total_award_volume` populated by enrich_contractors_usaspending.
    // Naics_awards aggregate may have a different shape ({amount} vs {total}) so we sum
    // BOTH possible field names as a safety belt.
    const enriched: Array<RawCand & { lifetime_total: number }> = raw.map((c) => {
        const fromArray = Array.isArray(c.naics_awards)
            ? c.naics_awards.reduce((s, n) => s + (Number(n.amount ?? (n as unknown as { total?: number }).total) || 0), 0)
            : 0;
        return {
            ...c,
            lifetime_total: Number(c.total_award_volume) || fromArray || 0,
        };
    });

    // KNOWN ISSUE — contractors.naics_awards is empty [] across all rows
    // even though last_usaspending_refresh is set. The USAspending enrichment
    // cron populates the timestamp but not the array. Tracked separately.
    //
    // For the pilot we publish ANYWAY since contractor pages have plenty of
    // value without awards: name, NAICS, state, certifications, SAM status.
    // We tiebreak by sba_certifications length (more certs = richer page +
    // better badges + better SEO meta).
    const pool: Cand[] = enriched
        .filter((c) => !publishedUeis.has(c.uei))
        .sort((a, b) => {
            if (b.lifetime_total !== a.lifetime_total) return b.lifetime_total - a.lifetime_total;
            const aCerts = (a.sba_certifications || []).length;
            const bCerts = (b.sba_certifications || []).length;
            if (bCerts !== aCerts) return bCerts - aCerts;
            // Final tiebreak — prefer SAM-registered
            return (b.sam_registered ? 1 : 0) - (a.sam_registered ? 1 : 0);
        })
        .slice(0, limit)
        .map((c) => ({
            uei: c.uei,
            business_name: c.company_name || c.dba_name || "(unnamed contractor)",
            primary_naics: (c.naics_codes && c.naics_codes[0]) || null,
            state: c.state,
            city: c.city,
            cage_code: c.cage_code,
            sam_registered: c.sam_registered,
            sba_certifications: c.sba_certifications,
            website: c.website,
            lifetime_total: c.lifetime_total,
            capability_summary_ai: c.capability_summary_ai,
            years_in_business: c.years_in_business,
        }));

    if (pool.length === 0) {
        // Diagnostic — return counts at each stage so we can see whether the
        // contractors table is enriched at all in this environment.
        return NextResponse.json({
            ok: true,
            picked: 0,
            note: "no eligible contractors",
            diagnostic: {
                rows_fetched: raw.length,
                rows_with_naics_awards_array: raw.filter((c) => Array.isArray(c.naics_awards)).length,
                rows_with_award_total_gt_0: enriched.filter((c) => c.lifetime_total > 0).length,
                rows_already_published: raw.filter((c) => publishedUeis.has(c.uei)).length,
                sample_first_row: raw[0]
                    ? {
                          uei: raw[0].uei,
                          name: raw[0].company_name,
                          naics_awards_type: typeof raw[0].naics_awards,
                          naics_awards_len: Array.isArray(raw[0].naics_awards) ? raw[0].naics_awards.length : null,
                      }
                    : null,
            },
        });
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

    const results: Array<{ uei: string; slug?: string; status: string; error?: string; model?: string }> = [];

    for (const c of pool) {
        try {
            const baseSlug = slugify(c.business_name);
            const slug = await uniqueSlug(sb, baseSlug, c.uei);
            const rollup = await buildAwardRollup(sb, c.uei);
            const apollo = await enrichCompanyViaApollo({ name: c.business_name, domain: c.website || undefined });
            const ai = await generateAiSummary({ contractor: c, rollup, apollo });
            const score = computeFederalScore({ contractor: c, rollup, apollo });
            // Quick Checker enrichment (crawled capability profile) — used to
            // backfill the page when Apollo/AI come up empty.
            const cap = (c.capability_summary_ai || {}) as Record<string, any>;
            const capIndustry = Array.isArray(cap.industries_served) ? cap.industries_served[0] : null;
            const capFounded = c.years_in_business ? new Date().getFullYear() - c.years_in_business : null;

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
                ai_summary: ai?.summary || cap.long_description || cap.short_description || null,
                ai_summary_model: ai?.model || (cap.short_description ? "quickcheck" : null),
                apollo_data: apollo?.raw as Record<string, unknown> | null,
                company_website: apollo?.company_website || c.website,
                company_linkedin: apollo?.company_linkedin || null,
                company_size_est: apollo?.company_size_est || null,
                industry: apollo?.industry || capIndustry || null,
                founded_year: apollo?.founded_year || capFounded || null,
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
