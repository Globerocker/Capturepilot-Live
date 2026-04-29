import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { crawlContractor } from "@/lib/enrichment/contractor-website";

export const maxDuration = 300;

/**
 * Bulk-enrich the "re-engagement" audience: contractors that won at least
 * one federal award via USAspending, but haven't recorded an award in 12+
 * months. Fills primary POC name/title/email/phone via website crawl when
 * Apollo didn't (or can't on the current plan).
 *
 *   POST /api/admin/enrich-campaign-audience?limit=20&silent_months=12
 *
 * Defaults: 20 contractors per call (each crawl is 5–10s — Vercel's 300s
 * function ceiling caps us around 25). Re-runnable: every successful call
 * marks the row with last_enriched_at + a non-null primary_poc_email so the
 * next call works on a fresh slice.
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
    primary_poc_email: string | null;
}

export async function POST(req: NextRequest) {
    const url = new URL(req.url);
    const limit         = Math.max(1, Math.min(50, parseInt(url.searchParams.get("limit") || "20", 10)));
    const silentMonths  = Math.max(1, Math.min(36, parseInt(url.searchParams.get("silent_months") || "12", 10)));
    const overwrite     = url.searchParams.get("overwrite") === "1";

    const db = admin();
    const startTime = Date.now();
    const stats = {
        processed: 0,
        emails_found: 0,
        executive_found: 0,
        crawl_failed: 0,
        skipped_no_website: 0,
    };
    const sample: Array<{ company: string; email?: string; name?: string; title?: string }> = [];

    // Audience: award-winners that have gone quiet for at least `silentMonths`.
    // Sorted by award volume descending so the highest-value reach-outs go
    // first. We exclude rows with an email already unless ?overwrite=1.
    const cutoff = new Date(Date.now() - silentMonths * 30 * 86400_000).toISOString();
    let q = db
        .from("contractors")
        .select("id, company_name, website, business_url, last_award_date, federal_awards_count, primary_poc_email")
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

    for (const row of candidates) {
        if (Date.now() - startTime > 270_000) break;

        const website = (row.website || row.business_url || "").trim();
        if (!website) { stats.skipped_no_website++; continue; }

        try {
            const res = await crawlContractor({
                company_name: row.company_name || "",
                website,
            });

            if (!res.ok) {
                await db.from("contractors").update({
                    last_enriched_at: new Date().toISOString(),
                    enrichment_source: "website_crawl_miss",
                }).eq("id", row.id);
                stats.crawl_failed++;
                stats.processed++;
                continue;
            }

            const c = res.contact;
            const update: Record<string, unknown> = {
                last_enriched_at: new Date().toISOString(),
                enrichment_source: "website_crawl",
            };
            if (c.primary_poc_name)     update.primary_poc_name = c.primary_poc_name;
            if (c.primary_poc_title)    update.primary_poc_title = c.primary_poc_title;
            if (c.primary_poc_email)    update.primary_poc_email = c.primary_poc_email;
            if (c.primary_poc_phone)    update.primary_poc_phone = c.primary_poc_phone;
            if (c.secondary_poc_name)   update.secondary_poc_name = c.secondary_poc_name;
            if (c.secondary_poc_email)  update.secondary_poc_email = c.secondary_poc_email;
            if (c.company_linkedin)     update.company_linkedin = c.company_linkedin;

            await db.from("contractors").update(update).eq("id", row.id);

            stats.processed++;
            if (c.primary_poc_email)  stats.emails_found++;
            if (c.primary_poc_name)   stats.executive_found++;

            if (sample.length < 5 && c.primary_poc_email) {
                sample.push({
                    company: row.company_name || "",
                    email: c.primary_poc_email,
                    name: c.primary_poc_name,
                    title: c.primary_poc_title,
                });
            }
        } catch (e) {
            stats.crawl_failed++;
            stats.processed++;
            // Still mark the row so we don't keep retrying a broken site.
            await db.from("contractors").update({
                last_enriched_at: new Date().toISOString(),
                enrichment_source: "website_crawl_error",
            }).eq("id", row.id);
            console.error("crawlContractor failed", row.id, e);
        }
    }

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
