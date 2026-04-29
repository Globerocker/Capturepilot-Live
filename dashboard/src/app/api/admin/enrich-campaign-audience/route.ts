import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { crawlContractor } from "@/lib/enrichment/contractor-website";
import { findEmail, splitNameForHunter } from "@/lib/enrichment/hunter";

export const maxDuration = 300;

/**
 * Bulk-enrich the "re-engagement" audience: contractors that won at least
 * one federal award via USAspending, but haven't recorded an award in 12+
 * months. Cascade per contractor (stops as soon as we get an email):
 *
 *   1) Hunter email-finder      — when we have a SAM POC name + domain.
 *      1 credit per call. Skipped once `hunter_budget` for the run is hit.
 *   2) Website crawl (Firecrawl + OpenAI structured outputs)
 *      — fallback; free except for compute. Used when (1) misses, has no
 *      POC name, or is outside the Hunter budget.
 *
 *   POST /api/admin/enrich-campaign-audience?limit=20&silent_months=12&hunter_budget=15
 *
 * Defaults: 20 contractors per call, max 15 Hunter calls per call (so we
 * stay well under the 50/month free tier across multiple runs). Domain-
 * search is intentionally not in the cascade — it tends to burn credits on
 * generic info@ matches we can get for free from the website crawler.
 */
function admin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

interface Candidate {
    id: string;
    company_name: string | null;
    website: string | null;
    business_url: string | null;
    last_award_date: string | null;
    federal_awards_count: number | null;
    primary_poc_name: string | null;
    primary_poc_email: string | null;
}

function rootDomain(url: string | null | undefined): string | null {
    if (!url) return null;
    try {
        const u = new URL(url.startsWith("http") ? url : "https://" + url);
        return u.hostname.replace(/^www\./, "").toLowerCase();
    } catch {
        return null;
    }
}

interface EnrichmentOutcome {
    update: Record<string, unknown>;
    source: "hunter_finder" | "website_crawl" | "miss";
    hunter_call_made: boolean;
}

async function enrichOne(
    row: Candidate,
    state: { hunterBlocked: boolean; hunterRemaining: number },
): Promise<EnrichmentOutcome> {
    const website = (row.website || row.business_url || "").trim();
    const domain = rootDomain(website);
    let hunter_call_made = false;

    // ─── Step 1: Hunter email-finder ───────────────────────────────────────
    // Only fires when we have BOTH a SAM POC name AND a domain — that's the
    // condition where Hunter is most accurate (and worth burning a credit).
    // Free tier is 50 credits/month, so we also enforce a per-run budget.
    if (domain && row.primary_poc_name && !state.hunterBlocked && state.hunterRemaining > 0) {
        const split = splitNameForHunter(row.primary_poc_name);
        if (split) {
            state.hunterRemaining--;
            hunter_call_made = true;
            const r = await findEmail({ domain, firstName: split.first, lastName: split.last });
            if (!r.ok && r.blocked) state.hunterBlocked = true;
            if (r.ok && r.result?.email) {
                const update: Record<string, unknown> = { primary_poc_email: r.result.email };
                if (r.result.position) update.primary_poc_title = r.result.position;
                if (r.result.linkedin) update.owner_linkedin = r.result.linkedin;
                if (r.result.phone)    update.direct_phone = r.result.phone;
                return { update, source: "hunter_finder", hunter_call_made };
            }
        }
    }

    // ─── Step 2: Website crawl (free) ──────────────────────────────────────
    if (website) {
        const res = await crawlContractor({ company_name: row.company_name || "", website });
        if (res.ok) {
            const c = res.contact;
            const update: Record<string, unknown> = {};
            if (c.primary_poc_name)     update.primary_poc_name = c.primary_poc_name;
            if (c.primary_poc_title)    update.primary_poc_title = c.primary_poc_title;
            if (c.primary_poc_email)    update.primary_poc_email = c.primary_poc_email;
            if (c.primary_poc_phone)    update.primary_poc_phone = c.primary_poc_phone;
            if (c.secondary_poc_name)   update.secondary_poc_name = c.secondary_poc_name;
            if (c.secondary_poc_email)  update.secondary_poc_email = c.secondary_poc_email;
            if (c.company_linkedin)     update.company_linkedin = c.company_linkedin;
            if (Object.keys(update).length > 0) {
                return { update, source: "website_crawl", hunter_call_made };
            }
        }
    }

    return { update: {}, source: "miss", hunter_call_made };
}

export async function POST(req: NextRequest) {
    const url = new URL(req.url);
    const limit         = Math.max(1, Math.min(50, parseInt(url.searchParams.get("limit") || "20", 10)));
    const silentMonths  = Math.max(1, Math.min(36, parseInt(url.searchParams.get("silent_months") || "12", 10)));
    const hunterBudget  = Math.max(0, Math.min(50, parseInt(url.searchParams.get("hunter_budget") || "15", 10)));
    const overwrite     = url.searchParams.get("overwrite") === "1";

    const db = admin();
    const startTime = Date.now();
    const stats = {
        processed: 0,
        emails_found: 0,
        via_hunter_finder: 0,
        via_website_crawl: 0,
        miss: 0,
        skipped_no_website: 0,
        hunter_calls_made: 0,
        hunter_remaining_in_run: hunterBudget,
        hunter_blocked: false,
    };
    const sample: Array<{ company: string; email?: string; name?: string; title?: string; via?: string }> = [];

    const cutoff = new Date(Date.now() - silentMonths * 30 * 86400_000).toISOString();
    let q = db
        .from("contractors")
        .select("id, company_name, website, business_url, last_award_date, federal_awards_count, primary_poc_name, primary_poc_email")
        .gt("federal_awards_count", 0)
        .lt("last_award_date", cutoff)
        .or("website.not.is.null,business_url.not.is.null")
        .order("total_award_volume", { ascending: false, nullsFirst: false })
        .limit(limit);
    if (!overwrite) q = q.is("primary_poc_email", null);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const candidates = (data || []) as Candidate[];
    if (candidates.length === 0) {
        return NextResponse.json({
            success: true,
            message: "No candidates match — every lapsed-award contractor with a website already has an email.",
            ...stats,
        });
    }

    const state = { hunterBlocked: false, hunterRemaining: hunterBudget };

    for (const row of candidates) {
        if (Date.now() - startTime > 270_000) break;

        const website = (row.website || row.business_url || "").trim();
        if (!website) { stats.skipped_no_website++; continue; }

        try {
            const outcome = await enrichOne(row, state);
            const update = {
                ...outcome.update,
                last_enriched_at: new Date().toISOString(),
                enrichment_source: outcome.source === "miss" ? "campaign_miss" : outcome.source,
            };

            await db.from("contractors").update(update).eq("id", row.id);

            stats.processed++;
            if (outcome.hunter_call_made)                  stats.hunter_calls_made++;
            if (outcome.source === "hunter_finder")        stats.via_hunter_finder++;
            else if (outcome.source === "website_crawl")   stats.via_website_crawl++;
            else                                            stats.miss++;

            if (outcome.update.primary_poc_email) {
                stats.emails_found++;
                if (sample.length < 5) {
                    sample.push({
                        company: row.company_name || "",
                        email: outcome.update.primary_poc_email as string,
                        name: outcome.update.primary_poc_name as string | undefined,
                        title: outcome.update.primary_poc_title as string | undefined,
                        via: outcome.source,
                    });
                }
            }
        } catch (e) {
            stats.miss++;
            stats.processed++;
            await db.from("contractors").update({
                last_enriched_at: new Date().toISOString(),
                enrichment_source: "campaign_error",
            }).eq("id", row.id);
            console.error("enrichOne failed", row.id, e);
        }
    }

    stats.hunter_blocked = state.hunterBlocked;
    stats.hunter_remaining_in_run = state.hunterRemaining;

    return NextResponse.json({
        success: true,
        ...stats,
        elapsed_ms: Date.now() - startTime,
        batch_attempted: candidates.length,
        sample,
    });
}

/**
 * GET — read-only audience preview. Lets the admin see how many rows the
 * filter would touch before kicking off a real run.
 */
export async function GET(req: NextRequest) {
    const url = new URL(req.url);
    const silentMonths = Math.max(1, Math.min(36, parseInt(url.searchParams.get("silent_months") || "12", 10)));
    const cutoff = new Date(Date.now() - silentMonths * 30 * 86400_000).toISOString();
    const db = admin();

    const { count: totalAudience } = await db
        .from("contractors")
        .select("id", { count: "exact", head: true })
        .gt("federal_awards_count", 0)
        .lt("last_award_date", cutoff);

    const { count: missingEmail } = await db
        .from("contractors")
        .select("id", { count: "exact", head: true })
        .gt("federal_awards_count", 0)
        .lt("last_award_date", cutoff)
        .is("primary_poc_email", null);

    const { count: missingEmailHasWebsite } = await db
        .from("contractors")
        .select("id", { count: "exact", head: true })
        .gt("federal_awards_count", 0)
        .lt("last_award_date", cutoff)
        .is("primary_poc_email", null)
        .or("website.not.is.null,business_url.not.is.null");

    return NextResponse.json({
        silent_months: silentMonths,
        total_audience: totalAudience || 0,
        ready_to_email: (totalAudience || 0) - (missingEmail || 0),
        missing_email: missingEmail || 0,
        crawlable_now: missingEmailHasWebsite || 0,
    });
}
