/**
 * Cron / on-demand: FULL Quick Checker enrichment for contractors.
 *
 * Runs the same runQuickCheck() pipeline the public checker uses (and that we
 * trust the quality of) on each contractor's website, then maps the rich
 * extraction into every contractor field we can fill: email, NAICS, certs /
 * set-asides, years in business, employee count, HQ state, POC, and the full
 * capability profile (keywords, services, strengths/weaknesses, pitch angles,
 * gov-experience) into capability_summary_ai.
 *
 * Priority tiers (the "different cron cases"):
 *   awards   — has past federal awards (recent OR dormant). #1 — we can help them.
 *   expiring — SAM registration lapses within 90 days.
 *   fresh    — activated in SAM in the last 120 days.
 *   all      — every other contractor with a website.
 *
 * Guarded; driven day/night from the VPS in tier order. Apollo stays OUT of
 * this loop (reserved for hot leads only) — this is website-crawl + LLM, the
 * cheap+rich path.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";
import { runQuickCheck } from "@/lib/quick-checker";
import { analyzeSiteTech } from "@/lib/quick-checker/website-tech";

export const runtime = "nodejs";
export const maxDuration = 300;

/* eslint-disable @typescript-eslint/no-explicit-any */

const CURRENT_YEAR = new Date().getUTCFullYear();

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
    const out: R[] = new Array(items.length);
    let i = 0;
    await Promise.all(
        Array.from({ length: Math.min(limit, items.length) }, async () => {
            while (i < items.length) {
                const idx = i++;
                out[idx] = await fn(items[idx]);
            }
        })
    );
    return out;
}

// ── Regex email scrape (free, ~50% yield — more reliable for emails than any
//    LLM). Used as a fallback when the QC extraction didn't surface a contact
//    email, since emails live verbatim in the page HTML. ──────────────────────
const UA = "Mozilla/5.0 (compatible; CapturePilotBot/1.0; +https://capturepilot.com)";
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const BAD_EMAIL = /(\.(png|jpe?g|gif|svg|webp|ico)$)|sentry|wixpress|example\.(com|org)|godaddy|cloudflare|\.cdn|@2x|wordpress|squarespace|\.wix|yourdomain|placeholder|email@|user@|name@|domain\.com|mysite\.com|wix\.com|vistaprint|weebly|no-?reply|donotreply/i;
const BAD_HOST = /(^|\.)(google\.|bing\.|yahoo\.|facebook\.|instagram\.|twitter\.|x\.com|linkedin\.|yelp\.|indeed\.|sam\.gov|\.gov$|maps\.|youtube\.|tiktok\.)/i;
const ROLE_PRIORITY = ["info", "contact", "sales", "hello", "office", "admin", "business", "federal", "contracts", "bd"];

function siteHost(url: string): string {
    try { return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "").toLowerCase(); }
    catch { return ""; }
}
function pickBestEmail(emails: string[], host: string): string | null {
    const clean = [...new Set(emails.map((e) => e.toLowerCase().trim()))].filter((e) => !BAD_EMAIL.test(e) && e.length < 70 && e.includes("@"));
    if (!clean.length) return null;
    const same = host ? clean.filter((e) => e.endsWith("@" + host)) : [];
    const pool = same.length ? same : clean;
    for (const role of ROLE_PRIORITY) { const hit = pool.find((e) => e.startsWith(role + "@")); if (hit) return hit; }
    return pool[0];
}
async function scrapeEmail(site: string): Promise<string | null> {
    const base = (site.startsWith("http") ? site : `https://${site}`).replace(/\/$/, "");
    const host = siteHost(base);
    if (!host || BAD_HOST.test(host) || base.includes("/search?")) return null;
    const found: string[] = [];
    for (const path of ["", "/contact", "/contact-us", "/about"]) {
        try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 7000);
            const r = await fetch(base + path, { headers: { "User-Agent": UA }, redirect: "follow", signal: ctrl.signal });
            clearTimeout(t);
            if (!r.ok) continue;
            const html = await r.text();
            for (const m of html.matchAll(/mailto:([^"'?>\s]+)/gi)) found.push(m[1]);
            found.push(...(html.match(EMAIL_RE) || []));
            const best = pickBestEmail(found, host);
            if (best) return best;
        } catch { /* timeout/network */ }
    }
    return pickBestEmail(found, host);
}

export async function GET(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;

    const params = new URL(req.url).searchParams;
    const batch = Math.min(50, Math.max(1, parseInt(params.get("batch") || "10", 10)));
    const tier = params.get("tier") || "claim";
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

    const today = new Date().toISOString().slice(0, 10);
    const in90 = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);
    const ago120 = new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10);

    // Default path: atomic claim so multiple workers can run in parallel without
    // double-crawling. Email-having contractors are claimed first. Explicit
    // ?tier=... still works for targeted single-worker runs.
    let rows: any[] | null = null;
    let error: { message: string } | null = null;
    if (tier === "claim") {
        const r = await db.rpc("claim_contractors_for_qc", { p_batch: batch });
        rows = (r.data as any[]) || null;
        error = r.error;
    } else {
        let q = db
            .from("contractors")
            .select("id, company_name, website, business_url, email, naics_codes, state, years_in_business, employee_count, primary_poc_name")
            .eq("qc_enriched", false)
            .or("website.not.is.null,business_url.not.is.null");
        if (tier === "awards") q = q.gte("federal_awards_count", 1).order("federal_awards_count", { ascending: true, nullsFirst: false });
        else if (tier === "expiring") q = q.gte("expiration_date", today).lte("expiration_date", in90);
        else if (tier === "fresh") q = q.gte("activation_date", ago120).order("activation_date", { ascending: false, nullsFirst: false });
        else q = q.order("activation_date", { ascending: false, nullsFirst: false });
        const res = await q.limit(batch);
        rows = res.data;
        error = res.error;
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!rows?.length) return NextResponse.json({ ok: true, tier, processed: 0, enriched: 0, emails_found: 0 });

    const t0 = Date.now();
    let emails = 0;
    const results = await mapLimit(rows as any[], 3, async (c) => {
        const site = c.website || c.business_url;
        const patch: any = { qc_enriched: true, enrichment_source: "quickcheck", last_enriched_at: new Date().toISOString() };
        try {
            const r = await runQuickCheck(site, { companyName: c.company_name || undefined });
            const ex = r.extraction;

            // Email: trust the LLM extraction first, but fall back to a free
            // regex scrape of the site (the LLM under-extracts emails; they
            // live verbatim in the HTML, so a regex is more reliable).
            let foundEmail: string | null =
                ex.contacts?.find((x: any) => x.email)?.email ||
                ex.leadership?.find((p: any) => p.email)?.email ||
                null;
            if (!foundEmail) foundEmail = await scrapeEmail(site);
            const naics = (r.naics_suggestions || []).map((n: any) => n.code).filter(Boolean);
            const certs = (ex.certifications || []).map((x: any) => x.type).filter(Boolean);
            const dm = ex.leadership?.find((p: any) => p.is_decision_maker) || ex.leadership?.[0];

            // Full profile blob — everything we extracted, for outreach personalization.
            patch.capability_summary_ai = {
                tagline: ex.tagline,
                short_description: ex.short_description,
                long_description: ex.long_description,
                industries_served: ex.industries_served,
                services: ex.services,
                products: ex.products,
                differentiators: ex.differentiators,
                capability_keywords: ex.capability_keywords,
                nail_down_keywords: ex.nail_down_keywords,
                strengths: ex.strengths,
                weaknesses: ex.weaknesses,
                pitch_angles: ex.pitch_angles,
                certifications: ex.certifications,
                has_gov_experience: ex.has_gov_experience,
                gov_experience_evidence: ex.gov_experience_evidence,
                federal_agencies_served: ex.federal_agencies_served,
                past_customers: ex.past_customers,
                revenue_signal: ex.revenue_signal,
                social_links: ex.social_links,
                service_areas: ex.service_areas,
                naics_suggestions: r.naics_suggestions,
                pages_scraped: r.pages_scraped,
                scraped_at: r.scraped_at,
            };
            patch.capability_summary_refreshed_at = new Date().toISOString();
            // Mirror the keyword list into the GIN-indexed text[] column (migration 183)
            // so reverse-match (gov opportunity -> contractors) can pre-filter fast.
            patch.capability_keywords = Array.isArray(ex.capability_keywords)
                ? Array.from(new Set(ex.capability_keywords.map((k: any) => String(k).trim().toLowerCase()).filter(Boolean)))
                : null;

            // Deterministic social + CMS extraction. The LLM can't see social
            // URLs (markdown strips <a href>), so scan the raw links/html here.
            try {
                const tech = await analyzeSiteTech(site, r.raw_pages || []);
                const so = tech.socials;
                if (so.linkedin) { patch.social_linkedin = so.linkedin; patch.company_linkedin = so.linkedin; }
                if (so.facebook) patch.social_facebook = so.facebook;
                if (so.twitter) patch.social_twitter = so.twitter;
                if (so.instagram) patch.social_instagram = so.instagram;
                if (so.youtube) patch.social_youtube = so.youtube;
                if (so.tiktok) patch.social_tiktok = so.tiktok;
                if (Object.keys(so.other).length) patch.social_other = so.other;
                if (so.linkedin_people.length) patch.capability_summary_ai.linkedin_people = so.linkedin_people;
                if (tech.cms) patch.website_cms = tech.cms;
                patch.social_extracted_at = new Date().toISOString();
                // Keep the cap-AI social_links blob consistent with the columns.
                patch.capability_summary_ai.social_links = {
                    linkedin: so.linkedin || ex.social_links?.linkedin || null,
                    facebook: so.facebook || ex.social_links?.facebook || null,
                    twitter: so.twitter || ex.social_links?.twitter || null,
                    youtube: so.youtube || ex.social_links?.youtube || null,
                    instagram: so.instagram || null,
                    tiktok: so.tiktok || null,
                };
                // Personal /in/ profile that matches the decision-maker's full name → owner_linkedin.
                if (dm?.name && so.linkedin_people.length && !c.owner_linkedin) {
                    const parts = dm.name.toLowerCase().split(/\s+/).filter((p: string) => p.length > 1);
                    const match = so.linkedin_people.find(u => {
                        const tail = (u.toLowerCase().split("/in/")[1] || "");
                        return parts.length >= 2 && parts.every(p => tail.includes(p));
                    });
                    if (match) patch.owner_linkedin = match;
                }
            } catch { /* non-fatal — socials/CMS are best-effort */ }

            // Fill scalar fields only when empty so we never clobber better data.
            if (foundEmail && !c.email) { patch.email = String(foundEmail).toLowerCase(); emails++; }
            if (naics.length && (!c.naics_codes || c.naics_codes.length === 0)) patch.naics_codes = naics;
            if (certs.length) patch.certifications = certs;
            if (ex.founded_year && !c.years_in_business) patch.years_in_business = Math.max(0, CURRENT_YEAR - ex.founded_year);
            if (ex.employee_count_estimate && !c.employee_count) patch.employee_count = ex.employee_count_estimate;
            if (ex.headquarters_state && !c.state) patch.state = ex.headquarters_state;
            if (dm?.name && !c.primary_poc_name) {
                patch.primary_poc_name = dm.name;
                if (dm.title) patch.primary_poc_title = dm.title;
                if (dm.email) patch.primary_poc_email = dm.email;
            }
            patch.capacity_signals = {
                employee_estimate: ex.employee_count_estimate ?? null,
                revenue_signal: ex.revenue_signal ?? null,
                founded_year: ex.founded_year ?? null,
                has_gov_experience: !!ex.has_gov_experience,
            };
        } catch (e) {
            patch.capability_summary_ai = { error: (e as Error).message?.slice(0, 200) };
        }
        await db.from("contractors").update(patch).eq("id", c.id);
        return !!patch.email;
    });

    return NextResponse.json({
        ok: true,
        tier,
        processed: rows.length,
        enriched: results.length,
        emails_found: emails,
        elapsed_ms: Date.now() - t0,
    });
}
