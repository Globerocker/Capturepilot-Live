/**
 * Cron / on-demand: scrape contact emails from contractor websites.
 *
 * SAM redacts POC emails and Apollo barely covers micro federal contractors
 * (~0.4% yield, already exhausted). But most small contractors list an email
 * on their own site, so we fetch the homepage + a couple of contact pages and
 * extract the best address (same-domain + role-prefixed preferred).
 *
 * Static fetch only (no headless browser) — catches simple-site SMBs, which is
 * exactly the dormant/fresh-registrant target. JS-only sites come back as a
 * miss and are flagged so we don't refetch them.
 *
 * Guarded; not on a Vercel schedule (cron ceiling is full) — triggered by the
 * Target Groups "Enrich emails" button and ad-hoc with CRON_SECRET.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 300;

/* eslint-disable @typescript-eslint/no-explicit-any */

const UA = "Mozilla/5.0 (compatible; CapturePilotBot/1.0; +https://capturepilot.com)";
const PATHS = ["", "/contact", "/contact-us", "/about", "/about-us"];
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const BAD =
    /(\.(png|jpe?g|gif|svg|webp|ico)$)|sentry|wixpress|example\.(com|org)|godaddy|cloudflare|\.cdn|@2x|wordpress|squarespace|\.wix|sentry\.io|yourdomain|placeholder|email@|user@|name@|domain\.com|mysite\.com|wix\.com|vistaprint|weebly|sentry|no-?reply|donotreply/i;
const ROLE_PRIORITY = ["info", "contact", "sales", "hello", "office", "admin", "business", "federal", "contracts", "bd"];
// Hosts that are never the contractor's own site (directories, search, social).
const BAD_HOST = /(^|\.)(google\.|bing\.|yahoo\.|facebook\.|instagram\.|twitter\.|x\.com|linkedin\.|yelp\.|indeed\.|sam\.gov|\.gov$|maps\.|youtube\.|tiktok\.)/i;

function siteHost(url: string): string {
    try {
        const u = new URL(url.startsWith("http") ? url : `https://${url}`);
        return u.hostname.replace(/^www\./, "").toLowerCase();
    } catch {
        return "";
    }
}

function pickBest(emails: string[], host: string): string | null {
    const clean = [...new Set(emails.map((e) => e.toLowerCase().trim()))].filter(
        (e) => !BAD.test(e) && e.length < 70 && e.includes("@")
    );
    if (!clean.length) return null;
    const sameDomain = host ? clean.filter((e) => e.endsWith("@" + host)) : [];
    const pool = sameDomain.length ? sameDomain : clean;
    for (const role of ROLE_PRIORITY) {
        const hit = pool.find((e) => e.startsWith(role + "@"));
        if (hit) return hit;
    }
    return pool[0];
}

async function scrapeSite(site: string): Promise<string | null> {
    const base = (site.startsWith("http") ? site : `https://${site}`).replace(/\/$/, "");
    const host = siteHost(base);
    // Skip junk URLs (Google-search links, social, .gov, directories) — these
    // never carry the contractor's own contact email.
    if (!host || BAD_HOST.test(host) || base.includes("/search?") || base.includes("/search%")) return null;
    const found: string[] = [];
    for (const path of PATHS) {
        try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 7000);
            const res = await fetch(base + path, { headers: { "User-Agent": UA }, redirect: "follow", signal: ctrl.signal });
            clearTimeout(t);
            if (!res.ok) continue;
            const html = await res.text();
            for (const m of html.matchAll(/mailto:([^"'?>\s]+)/gi)) found.push(m[1]);
            found.push(...(html.match(EMAIL_RE) || []));
            const best = pickBest(found, host);
            if (best) return best; // stop early once we have a good one
        } catch {
            /* timeout / network / DNS — try next path */
        }
    }
    return pickBest(found, host);
}

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

export async function GET(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;

    const batch = Math.min(60, Math.max(1, parseInt(new URL(req.url).searchParams.get("batch") || "25", 10)));
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

    const { data: rows, error } = await db
        .from("contractors")
        .select("id, website, business_url")
        .is("email", null)
        .eq("email_scrape_done", false)
        .or("website.not.is.null,business_url.not.is.null")
        // Prioritise recently-active small firms (the segments we email) over
        // long-registered primes whose sites are contact-form-only.
        .order("activation_date", { ascending: false, nullsFirst: false })
        .limit(batch);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!rows?.length) return NextResponse.json({ ok: true, message: "Nothing to scrape", processed: 0, emails_found: 0 });

    const t0 = Date.now();
    const results = await mapLimit(rows, 6, async (r: any) => {
        const site = r.website || r.business_url;
        let email: string | null = null;
        try {
            email = await scrapeSite(site);
        } catch {
            email = null;
        }
        const patch: any = { email_scrape_done: true, last_enriched_at: new Date().toISOString() };
        if (email) {
            patch.email = email;
            patch.enrichment_source = "website_email";
        }
        await db.from("contractors").update(patch).eq("id", r.id);
        return !!email;
    });

    const found = results.filter(Boolean).length;
    return NextResponse.json({
        ok: true,
        processed: rows.length,
        emails_found: found,
        misses: rows.length - found,
        elapsed_ms: Date.now() - t0,
    });
}
