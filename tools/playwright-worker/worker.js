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
import WebSocketImpl from "ws";

// Node 20 (which the Playwright base image ships) doesn't have a native
// global WebSocket. Supabase's realtime-js eagerly initializes a WS client
// when createClient() runs — without this polyfill the worker crashes on
// boot with "Node.js 20 detected without native WebSocket support".
if (typeof globalThis.WebSocket === "undefined") {
    globalThis.WebSocket = WebSocketImpl;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("[worker] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY");
    process.exit(1);
}

// Smaller default batch because Chromium memory accumulates fast on Railway's
// 1 GB / Fly's 512 MB trial tiers. Bump WORKER_BATCH_SIZE in env once we know
// the plan can take it.
const BATCH_SIZE = Number(process.env.WORKER_BATCH_SIZE || 3);
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
            // Bonfire = Cloudflare-protected SPA. The CF challenge resolves
            // via JS within 5-10s; we navigate with networkidle so the wait
            // happens transparently, then check what we actually loaded.
            await page.goto(link, { waitUntil: "networkidle", timeout: 45_000 });
            // Give the SPA mount a moment after CF clears.
            await page.waitForTimeout(2500);
            // Log what we ACTUALLY got so we can iterate selectors.
            const diag = await page.evaluate(() => ({
                title: document.title || "",
                bodyLen: (document.body?.innerText || "").length,
                h1: document.querySelector("h1")?.innerText || "",
                // Probe a wide net of candidate selectors so we can see
                // which one Bonfire's actual template uses.
                candidates: {
                    "main": (document.querySelector("main")?.innerText || "").length,
                    ".project-summary": (document.querySelector(".project-summary")?.innerText || "").length,
                    "[role=main]": (document.querySelector("[role=main]")?.innerText || "").length,
                    "article": (document.querySelector("article")?.innerText || "").length,
                    "#root": (document.querySelector("#root")?.innerText || "").length,
                    "#app": (document.querySelector("#app")?.innerText || "").length,
                    ".content": (document.querySelector(".content")?.innerText || "").length,
                },
            }));
            console.log(`    [diag] title="${diag.title}" body=${diag.bodyLen} h1="${diag.h1}" candidates=${JSON.stringify(diag.candidates)}`);
            // Look for CF challenge marker — if present, scraping failed.
            const cfBlocked = await page.evaluate(() =>
                /just a moment|enable javascript and cookies/i.test(document.body?.innerText || "")
            );
            if (cfBlocked) {
                console.log("    [diag] Cloudflare challenge page detected — scrape unavailable");
                return null;
            }
            // Grab whichever candidate has the most content (likely the
            // bid body container).
            const text = await page.evaluate(() => {
                const sels = ["main", ".project-summary", "[role=main]", "article", "#root", "#app", ".content", "body"];
                let best = "";
                for (const s of sels) {
                    const el = document.querySelector(s);
                    if (!el) continue;
                    const t = (el.innerText || "").trim();
                    if (t.length > best.length) best = t;
                }
                return best.replace(/\s+/g, " ").trim();
            });
            return text && text.length >= 200 ? text.slice(0, 6000) : null;
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

// Host patterns the worker is willing to scrape, used by both the SQL
// function for filtering and pickHandler() for routing. ilike-friendly
// (PostgREST ANY/UNNEST on text[]). Bonfire detail is CF-walled but
// queued anyway — Chromium handles the challenge inline.
const SPA_LINK_ILIKE_PATTERNS = [
    "%.bonfirehub.com/%",
    "%procurement.opengov.com/%",
    "%.opengov.com/%",
    "%txsmartbuy.gov/%",
    "%evp.nc.gov/%",
    "%emma.maryland.gov/%",
    "%.cleveland.gov/%",
    "%.clevelandohio.gov/%",
    "%sigma.michigan.gov/%",
    "%caleprocure.ca.gov/%",
];

async function fetchBatch() {
    // Calls a Postgres function (migration 085) that filters by char_length
    // on the description column — something PostgREST can't express
    // directly. Previously we filtered "description is null or empty" which
    // missed the 800+ Bonfire rows with stub descriptions like
    // "Department: Procurement" (technically non-empty, useless content).
    const { data, error } = await sb.rpc("get_sled_rows_needing_enrichment", {
        host_patterns: SPA_LINK_ILIKE_PATTERNS,
        max_desc_len: 500,
        batch_size: BATCH_SIZE,
    });
    if (error) {
        console.error("[worker] fetch err:", error.message);
        return [];
    }
    return (data || []).filter((r) => pickHandler(r.link));
}

// Single-tick worker: launch a fresh Chromium per batch, do the work, kill
// it. Burns ~2s extra per batch on cold-start but avoids the slow memory
// leak that comes from keeping a single browser running for hours of
// navigations. On Railway's 1 GB tier this is the difference between
// "stays up indefinitely" and "OOM-crashes every ~5 min".
async function tick() {
    const rows = await fetchBatch();
    if (rows.length === 0) {
        console.log("[worker] nothing to do");
        return;
    }
    console.log(`[worker] batch of ${rows.length} rows — launching Chromium`);

    let browser;
    let enriched = 0;
    let failed = 0;
    try {
        browser = await chromium.launch({
            headless: true,
            args: [
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--disable-extensions",
                "--disable-default-apps",
                "--disable-sync",
                "--no-first-run",
                "--no-zygote",
                "--single-process",   // Railway's containers don't like multi-process Chromium
                "--disable-background-networking",
            ],
        });
        const context = await browser.newContext({
            userAgent: UA,
            viewport: { width: 1280, height: 800 },
            // Block heavy resources — we only need DOM text, not pixels.
            // Saves ~70% of bandwidth + memory per page load.
            javaScriptEnabled: true,
        });
        // Route-level filter — skip images, fonts, media, stylesheets. The
        // bid text we want is in the DOM regardless.
        await context.route("**/*", (route) => {
            const t = route.request().resourceType();
            if (t === "image" || t === "font" || t === "media" || t === "stylesheet") {
                return route.abort();
            }
            return route.continue();
        });

        for (const row of rows) {
            const handler = pickHandler(row.link);
            if (!handler) {
                failed++;
                continue;
            }
            const page = await context.newPage();
            try {
                console.log(`  → ${handler.name}: ${(row.title || "").slice(0, 50)} (${row.link.slice(0, 60)})`);
                const text = await handler.fetch(page, row.link);
                if (text && text.length >= 200) {
                    const { error: upErr } = await sb
                        .from("opportunities")
                        .update({ description: text, last_crawled_at: new Date().toISOString() })
                        .eq("id", row.id);
                    if (upErr) {
                        console.warn(`    ✗ update err: ${upErr.message}`);
                        failed++;
                    } else {
                        enriched++;
                        console.log(`    ✓ +${text.length} chars`);
                    }
                } else {
                    failed++;
                    console.log(`    ✗ no body (got ${text ? text.length : 0} chars)`);
                    await sb
                        .from("opportunities")
                        .update({ last_crawled_at: new Date().toISOString() })
                        .eq("id", row.id);
                }
            } catch (e) {
                failed++;
                console.warn(`    ✗ ${(e && e.message) || e}`);
                await sb
                    .from("opportunities")
                    .update({ last_crawled_at: new Date().toISOString() })
                    .eq("id", row.id);
            } finally {
                await page.close().catch(() => undefined);
            }
            await new Promise((r) => setTimeout(r, 1500));
        }
        await context.close().catch(() => undefined);
    } catch (e) {
        console.error(`[worker] batch error: ${(e && e.message) || e}`);
    } finally {
        if (browser) await browser.close().catch(() => undefined);
    }
    console.log(`[worker] batch done: ${enriched} enriched, ${failed} failed`);
}

async function main() {
    console.log(`[worker] starting Playwright worker (batch_size=${BATCH_SIZE}, poll=${POLL_MS}ms)`);
    let stopping = false;
    process.on("SIGTERM", () => {
        console.log("[worker] SIGTERM received — finishing current batch then exiting");
        stopping = true;
    });
    process.on("uncaughtException", (e) => {
        console.error(`[worker] uncaughtException: ${e?.message || e}`);
    });
    process.on("unhandledRejection", (reason) => {
        console.error(`[worker] unhandledRejection: ${reason?.message || reason}`);
    });

    while (!stopping) {
        const started = Date.now();
        try {
            await tick();
        } catch (e) {
            console.error(`[worker] tick error: ${(e && e.message) || e}`);
        }
        if (stopping) break;
        const elapsed = Date.now() - started;
        const sleep = Math.max(0, POLL_MS - elapsed);
        if (sleep > 0) await new Promise((r) => setTimeout(r, sleep));
    }
    console.log("[worker] exiting cleanly");
}

main().catch((e) => {
    console.error("[worker] fatal:", e?.message || e);
    process.exit(1);
});
