/**
 * CapturePilot Playwright worker — fills SLED opportunity descriptions from
 * SPA portals that Vercel's serverless can't crawl.
 *
 * What this exists for:
 *   - Bonfire detail pages (~228 rows in our DB) are Cloudflare-protected SPAs.
 *     Anonymous curl gets a 403; a real Chromium with a CF cookie jar gets the
 *     bid body.
 *   - OpenGov procurement portals load via GraphQL with auth tokens we can't
 *     mint from our backend. A logged-out browser session does the dance for us.
 *   - TX SmartBuy / Cleveland / Maryland eMMA show "Javascript is disabled"
 *     in the no-script HTML. The actual content lands after JS executes.
 *   - NY-SCR detail pages require an account login (we skip those — only
 *     valuable if you've registered an NYS vendor account; not the worker's job).
 *
 * Loop:
 *   1. Poll Supabase every WORKER_POLL_INTERVAL_MS for SLED rows where
 *      description IS NULL or length < 200, AND the link matches one of the
 *      SPA portal patterns below.
 *   2. For each batch, spin up a single Chromium context (cookie reuse cuts
 *      Cloudflare friction by ~3x). One worker = one batch in flight; we set
 *      concurrency low because Bonfire detects parallel hits and starts
 *      throwing CF challenges.
 *   3. Per row: navigate, wait for content selector, extract description text.
 *   4. Write back via service-role Supabase client.
 *   5. Bump last_crawled_at on every row (even on miss) so we don't burn
 *      Chromium time on the same dead-ends each tick.
 *
 * Env vars required:
 *   NEXT_PUBLIC_SUPABASE_URL    Supabase project URL
 *   SUPABASE_SERVICE_KEY        Service-role JWT (write access)
 *   WORKER_BATCH_SIZE           Default 8 rows/tick (low for CF politeness)
 *   WORKER_POLL_INTERVAL_MS     Default 60000 (1 min)
 *   WORKER_USER_AGENT           Override the default UA string
 */

import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("[worker] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY");
    process.exit(1);
}

const BATCH_SIZE = Number(process.env.WORKER_BATCH_SIZE || 8);
const POLL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS || 60_000);
const UA = process.env.WORKER_USER_AGENT
    || "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

// Per-portal handler — each returns a description string or null. Each runs
// inside the same browser context so CF cookies persist across hits.
const HANDLERS = [
    {
        name: "bonfire-detail",
        match: (host) => host.endsWith(".bonfirehub.com"),
        async fetch(page, link) {
            // Bonfire SPAs render the bid body into .project-summary on this
            // route. Waiting for the selector handles both clean loads and
            // CF challenges (CF resolves within 5s, then the SPA mounts).
            await page.goto(link, { waitUntil: "domcontentloaded", timeout: 30_000 });
            const sel = await page.waitForSelector(
                ".project-summary, .public-project-summary, [class*='ProjectSummary'], main",
                { timeout: 15_000 },
            ).catch(() => null);
            if (!sel) return null;
            const text = await page.evaluate(() => {
                const main = document.querySelector(".project-summary, .public-project-summary, [class*='ProjectSummary'], main");
                if (!main) return "";
                return (main.innerText || "").replace(/\s+/g, " ").trim();
            });
            return text && text.length >= 80 ? text.slice(0, 6000) : null;
        },
    },
    {
        name: "opengov-procurement",
        match: (host) => host.endsWith(".opengov.com") || host === "procurement.opengov.com",
        async fetch(page, link) {
            await page.goto(link, { waitUntil: "networkidle", timeout: 30_000 });
            // OpenGov mounts the bid body into [data-testid="project-detail-..."]
            // OR an article tag after GraphQL resolves.
            const text = await page.evaluate(() => {
                const candidates = document.querySelectorAll(
                    "[data-testid*='detail'], article, main, .project-details, .bid-body",
                );
                for (const el of candidates) {
                    const t = (el.innerText || "").trim();
                    if (t.length >= 200) return t.replace(/\s+/g, " ");
                }
                return "";
            });
            return text && text.length >= 80 ? text.slice(0, 6000) : null;
        },
    },
    {
        name: "tx-smartbuy",
        match: (host) => host === "www.txsmartbuy.gov" || host === "txsmartbuy.gov",
        async fetch(page, link) {
            await page.goto(link, { waitUntil: "networkidle", timeout: 30_000 });
            // TX SmartBuy ESBD detail panel
            const text = await page.evaluate(() => {
                const panel = document.querySelector(".esbd-detail, .opportunity-detail, main, #content");
                if (!panel) return "";
                return (panel.innerText || "").replace(/\s+/g, " ").trim();
            });
            return text && text.length >= 80 ? text.slice(0, 6000) : null;
        },
    },
    {
        name: "generic-spa",
        // Fallback for everything else — Cleveland, eMaryland, NC eVP, etc.
        // Waits for networkidle then grabs main / body innerText. Caller
        // decides whether the row was worth a Chromium launch by URL host
        // pattern in pickHandler() below.
        match: () => true,
        async fetch(page, link) {
            await page.goto(link, { waitUntil: "networkidle", timeout: 30_000 });
            const text = await page.evaluate(() => {
                const main = document.querySelector(
                    "main, article, [role='main'], .content, #content, .detail, .bid-detail",
                );
                if (!main) return (document.body.innerText || "").replace(/\s+/g, " ").trim();
                return (main.innerText || "").replace(/\s+/g, " ").trim();
            });
            return text && text.length >= 200 ? text.slice(0, 6000) : null;
        },
    },
];

// Only queue rows whose link host matches a portal we know is SPA-rendered
// (and therefore worth burning a Chromium launch on). Server-rendered .gov
// portals are handled by the Vercel fetcher — running them here is wasteful.
const SPA_HOST_PATTERNS = [
    /\.bonfirehub\.com$/i,
    /\.opengov\.com$/i,
    /^procurement\.opengov\.com$/i,
    /^www\.txsmartbuy\.gov$/i,
    /^txsmartbuy\.gov$/i,
    /^evp\.nc\.gov$/i,
    /^emma\.maryland\.gov$/i,
    /\.cleveland\.gov$/i,
    /\.clevelandohio\.gov$/i,
    /^sigma\.michigan\.gov$/i,
    /^caleprocure\.ca\.gov$/i,
];

function pickHandler(link) {
    let host;
    try {
        host = new URL(link).hostname.toLowerCase();
    } catch {
        return null;
    }
    if (!SPA_HOST_PATTERNS.some((re) => re.test(host))) return null;
    return HANDLERS.find((h) => h.match(host));
}

async function fetchBatch() {
    // Pull candidate rows — SLED, link present, description short, ordered by
    // last_crawled_at ASC so we cycle fairly. Pull more than BATCH_SIZE since
    // many will be filtered out by SPA_HOST_PATTERNS.
    const { data, error } = await sb
        .from("opportunities")
        .select("id, title, link, description")
        .eq("source", "sled")
        .eq("is_archived", false)
        .not("link", "is", null)
        .neq("link", "")
        .or("description.is.null,description.eq.")
        .order("last_crawled_at", { ascending: true, nullsFirst: true })
        .limit(BATCH_SIZE * 4);
    if (error) {
        console.error("[worker] fetch err:", error.message);
        return [];
    }
    const rows = (data || []).filter((r) => pickHandler(r.link));
    return rows.slice(0, BATCH_SIZE);
}

async function tick(browser) {
    const rows = await fetchBatch();
    if (rows.length === 0) {
        console.log("[worker] nothing to do");
        return;
    }
    console.log(`[worker] batch of ${rows.length} rows`);

    const context = await browser.newContext({
        userAgent: UA,
        viewport: { width: 1280, height: 800 },
        // Persist cookies in-memory so CF challenges resolve once per batch.
    });

    let enriched = 0;
    let failed = 0;
    for (const row of rows) {
        const handler = pickHandler(row.link);
        const page = await context.newPage();
        try {
            const text = await handler.fetch(page, row.link);
            if (text && text.length >= 200) {
                const { error: upErr } = await sb
                    .from("opportunities")
                    .update({ description: text, last_crawled_at: new Date().toISOString() })
                    .eq("id", row.id);
                if (upErr) {
                    console.warn(`[worker] update fail ${row.id}: ${upErr.message}`);
                    failed++;
                } else {
                    enriched++;
                    console.log(`  ✓ ${handler.name}: ${(row.title || "").slice(0, 60)} (+${text.length} chars)`);
                }
            } else {
                failed++;
                await sb
                    .from("opportunities")
                    .update({ last_crawled_at: new Date().toISOString() })
                    .eq("id", row.id);
            }
        } catch (e) {
            failed++;
            console.warn(`  ✗ ${handler.name}: ${(row.title || "").slice(0, 40)} → ${e.message || e}`);
            await sb
                .from("opportunities")
                .update({ last_crawled_at: new Date().toISOString() })
                .eq("id", row.id);
        } finally {
            await page.close().catch(() => undefined);
        }
        // Be polite — 1-2s between hits to the same portal (each new page
        // launches inside the same context).
        await new Promise((r) => setTimeout(r, 1500));
    }
    await context.close();
    console.log(`[worker] batch done: ${enriched} enriched, ${failed} failed`);
}

async function main() {
    console.log("[worker] starting Playwright worker");
    const browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    process.on("SIGTERM", async () => {
        console.log("[worker] SIGTERM — shutting down");
        await browser.close().catch(() => undefined);
        process.exit(0);
    });

    // Eternal loop — Railway / Fly will restart on crash.
    while (true) {
        const started = Date.now();
        try {
            await tick(browser);
        } catch (e) {
            console.error("[worker] tick error:", e?.message || e);
        }
        const elapsed = Date.now() - started;
        const sleep = Math.max(0, POLL_MS - elapsed);
        if (sleep > 0) await new Promise((r) => setTimeout(r, sleep));
    }
}

main().catch((e) => {
    console.error("[worker] fatal:", e?.message || e);
    process.exit(1);
});
