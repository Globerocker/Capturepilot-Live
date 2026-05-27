/**
 * CapturePilot worker — generic job-queue consumer with Playwright handlers.
 *
 * Reads worker_jobs (migration 086), atomically claims pending rows whose
 * task_type matches our HANDLERS map, runs the handler, writes the result
 * back via finish_job.
 *
 * Currently registered task types:
 *   - scrape_portal_detail   : Bonfire / OpenGov / TX SmartBuy / generic SPA
 *                              detail-page scraping. Uses portal_cookies
 *                              when available (defeats Cloudflare).
 *   - warm_cf_cookie         : Open a portal homepage, wait for CF, harvest
 *                              cookies, store in portal_cookies for reuse.
 *   - extract_brand_tokens   : (future) competitor brand extraction
 *
 * Vercel cron handlers consume the HTTP-only task types out of the same
 * queue (classify_naics, extract_structured_reqs, analyze_attachments, etc).
 */

import { createClient } from "@supabase/supabase-js";
import { chromium as rawChromium } from "playwright";
import WebSocketImpl from "ws";

// Node 20 in the Playwright base image doesn't ship a native WebSocket;
// Supabase realtime-js needs one or createClient throws on boot.
if (typeof globalThis.WebSocket === "undefined") {
    globalThis.WebSocket = WebSocketImpl;
}

// Stealth plugin — hides headless-Chrome fingerprints (navigator.webdriver,
// plugin count, canvas hash, etc). Loaded conditionally so the worker still
// boots if the dep isn't installed.
let chromium = rawChromium;
try {
    const { addExtra } = await import("playwright-extra");
    const stealth = (await import("puppeteer-extra-plugin-stealth")).default;
    const extra = addExtra(rawChromium);
    extra.use(stealth());
    chromium = extra;
    console.log("[worker] stealth plugin loaded");
} catch (e) {
    console.log("[worker] stealth plugin unavailable, using raw chromium:", e?.message || e);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("[worker] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY");
    process.exit(1);
}

const BATCH_SIZE = Number(process.env.WORKER_BATCH_SIZE || 3);
const POLL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS || 30_000);
const UA = process.env.WORKER_USER_AGENT
    || "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

// ---------------------------------------------------------------------------
// HANDLERS — one per task_type. Each returns { result, error? }.
// ---------------------------------------------------------------------------
const HANDLERS = {
    scrape_portal_detail: scrapePortalDetail,
    warm_cf_cookie: warmCfCookie,
};
const MY_TASKS = Object.keys(HANDLERS);

// ---------------------------------------------------------------------------
// Portal-cookies helpers
// ---------------------------------------------------------------------------
async function loadPortalCookies(host) {
    const { data } = await sb.from("portal_cookies").select("*").eq("host", host).maybeSingle();
    if (!data) return null;
    // Bump use_count + last_used_at fire-and-forget
    sb.from("portal_cookies")
        .update({ use_count: (data.use_count || 0) + 1, last_used_at: new Date().toISOString() })
        .eq("host", host)
        .then(() => {});
    return data;
}

function hasClearance(cookies) {
    return Array.isArray(cookies) && cookies.some(c => c.name === "cf_clearance");
}

async function savePortalCookies(host, cookies, userAgent) {
    const earliestExpiry = cookies
        .map(c => c.expires)
        .filter(e => typeof e === "number" && e > 0)
        .sort((a, b) => a - b)[0];
    await sb.from("portal_cookies").upsert({
        host,
        cookies,
        user_agent: userAgent,
        fetched_at: new Date().toISOString(),
        expires_at: earliestExpiry ? new Date(earliestExpiry * 1000).toISOString() : null,
        last_blocked_at: null,
    }, { onConflict: "host" });
}

// Mark a host as currently blocked — backfill cron uses this to skip the host
// for ~6h instead of re-enqueuing warm/scrape jobs that will fail the same way.
async function markHostBlocked(host) {
    await sb.from("portal_cookies").upsert({
        host,
        last_blocked_at: new Date().toISOString(),
    }, { onConflict: "host" }).then(() => {});
}

// Enqueue a fresh warm_cf_cookie job for a host. Idempotent: the partial unique
// index on dedup_key prevents duplicate pending/running rows.
async function enqueueWarm(host) {
    await sb.from("worker_jobs").insert({
        task_type: "warm_cf_cookie",
        payload: { host },
        priority: 9,
    }).then(() => {});
}

// ---------------------------------------------------------------------------
// HANDLER: scrape_portal_detail
// ---------------------------------------------------------------------------
async function scrapePortalDetail(job, browser) {
    const oppId = job.payload?.opp_id;
    const url = job.payload?.url;
    if (!oppId || !url) return { error: "missing opp_id or url" };

    let host;
    try { host = new URL(url).hostname.toLowerCase(); } catch { return { error: "bad url" }; }

    const cookieRow = await loadPortalCookies(host);

    // Bonfire detail pages require cf_clearance to load. If we don't have one,
    // spawning a context and navigating is guaranteed to return the CF
    // challenge HTML — wastes 4s of browser time per row. Skip and enqueue a
    // fresh warm job so the next backfill tick has a chance.
    const needsClearance = host.endsWith(".bonfirehub.com");
    if (needsClearance && !hasClearance(cookieRow?.cookies)) {
        await enqueueWarm(host);
        return { result: { skipped: "no_clearance_cookie", host } };
    }

    const context = await browser.newContext({
        userAgent: cookieRow?.user_agent || UA,
        viewport: { width: 1280, height: 800 },
    });
    if (cookieRow?.cookies) {
        await context.addCookies(cookieRow.cookies).catch(() => {});
    }
    // Block heavy assets — save ~70% of memory and bandwidth.
    await context.route("**/*", (route) => {
        const t = route.request().resourceType();
        if (t === "image" || t === "font" || t === "media" || t === "stylesheet") return route.abort();
        return route.continue();
    });

    const page = await context.newPage();
    try {
        await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
        await page.waitForTimeout(2500);

        // CF challenge guard
        const diag = await page.evaluate(() => ({
            title: document.title || "",
            bodyLen: (document.body?.innerText || "").length,
            hasCf: !!document.querySelector("#cf-wrapper, .cf-error-code, [data-translate]"),
        }));
        const cfBlocked = /just a moment|attention required|cloudflare/i.test(diag.title)
            || diag.hasCf
            || diag.bodyLen < 600;
        if (cfBlocked) {
            console.log(`    [cf-blocked] ${host} (title="${diag.title}" body=${diag.bodyLen})`);
            await markHostBlocked(host);
            await enqueueWarm(host);
            return { result: { skipped: "cf_blocked", host }, error: null, write: { last_crawled_at: new Date().toISOString() } };
        }

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
        if (!text || text.length < 400) {
            return { result: { skipped: "thin_content", chars: text?.length || 0 }, write: { last_crawled_at: new Date().toISOString() } };
        }

        // Write the description back to the opp
        const { error: upErr } = await sb
            .from("opportunities")
            .update({ description: text.slice(0, 6000), last_crawled_at: new Date().toISOString() })
            .eq("id", oppId);
        if (upErr) return { error: `db update failed: ${upErr.message}` };
        return { result: { chars: text.length, host } };
    } finally {
        await page.close().catch(() => {});
        await context.close().catch(() => {});
    }
}

// ---------------------------------------------------------------------------
// HANDLER: warm_cf_cookie
// Open a portal page that is actually CF-challenged, sit through the JS
// challenge, harvest cf_clearance + companion cookies.
//
// Why not just hit `/portal/`? On most Bonfire tenants the homepage isn't CF
// protected — it sets __cf_bm (passive bot mgmt) and that's it. cf_clearance
// is only issued AFTER the interactive JS challenge runs, which only fires on
// the gated paths (Opportunities list, detail URLs, login). We try a small
// list of likely-protected paths and the first one that issues cf_clearance
// wins. Saving without cf_clearance is treated as a failure (the cookie that
// actually proves you passed the challenge isn't there).
// ---------------------------------------------------------------------------
const CF_WARM_PATHS = [
    "/portal/Opportunities",
    "/portal/portallogin",
    "/portal/",
];

async function warmCfCookie(job, browser) {
    const host = job.payload?.host;
    if (!host) return { error: "missing host" };
    const context = await browser.newContext({
        userAgent: UA,
        viewport: { width: 1280, height: 800 },
        locale: "en-US",
    });
    const page = await context.newPage();
    try {
        for (const path of CF_WARM_PATHS) {
            const target = `https://${host}${path}`;
            try {
                await page.goto(target, { waitUntil: "networkidle", timeout: 60_000 });
            } catch {
                continue;
            }
            // Sit through the CF JS challenge — up to 30s. The challenge can
            // require multiple round-trips; networkidle returns before it's
            // fully resolved.
            for (let i = 0; i < 60; i++) {
                const title = await page.title().catch(() => "");
                const challenged = /just a moment|attention required|cloudflare/i.test(title);
                const cookies = await context.cookies().catch(() => []);
                if (!challenged && hasClearance(cookies)) break;
                await page.waitForTimeout(500);
            }
            const cookies = await context.cookies();
            if (hasClearance(cookies)) {
                await savePortalCookies(host, cookies, UA);
                return {
                    result: {
                        saved_cookies: cookies.length,
                        cf_clearance: true,
                        path,
                    },
                };
            }
        }
        // None of the paths produced cf_clearance — mark blocked so backfill
        // stops re-enqueueing this host for a while.
        await markHostBlocked(host);
        return { error: "no cf_clearance issued (strict tenant or stealth defeated)" };
    } finally {
        await page.close().catch(() => {});
        await context.close().catch(() => {});
    }
}

// ---------------------------------------------------------------------------
// Queue consumer loop
// ---------------------------------------------------------------------------
async function claimAndRun(browser) {
    const { data: jobs, error } = await sb.rpc("claim_jobs", {
        p_task_types: MY_TASKS,
        p_batch_size: BATCH_SIZE,
    });
    if (error) {
        console.error("[worker] claim err:", error.message);
        return 0;
    }
    if (!jobs || jobs.length === 0) {
        console.log("[worker] queue empty");
        return 0;
    }
    console.log(`[worker] claimed ${jobs.length} jobs`);
    for (const job of jobs) {
        const handler = HANDLERS[job.task_type];
        if (!handler) {
            await sb.rpc("finish_job", { p_job_id: job.id, p_status: "skipped", p_result: null, p_error: "no handler" });
            continue;
        }
        const t0 = Date.now();
        try {
            const res = await handler(job, browser);
            if (res?.error) {
                await sb.rpc("finish_job", {
                    p_job_id: job.id,
                    p_status: job.attempts >= job.max_attempts ? "failed" : "pending",
                    p_result: null,
                    p_error: res.error,
                });
                console.log(`  ✗ ${job.task_type} (${Date.now() - t0}ms): ${res.error}`);
            } else {
                await sb.rpc("finish_job", { p_job_id: job.id, p_status: "done", p_result: res?.result || {}, p_error: null });
                console.log(`  ✓ ${job.task_type} (${Date.now() - t0}ms): ${JSON.stringify(res?.result || {}).slice(0, 100)}`);
            }
        } catch (e) {
            const msg = (e && e.message) || String(e);
            await sb.rpc("finish_job", {
                p_job_id: job.id,
                p_status: job.attempts >= job.max_attempts ? "failed" : "pending",
                p_result: null,
                p_error: msg,
            });
            console.warn(`  ✗ ${job.task_type} (${Date.now() - t0}ms): ${msg}`);
        }
        await new Promise((r) => setTimeout(r, 1500));
    }
    return jobs.length;
}

// Per-batch browser lifecycle. --single-process used to be in here but
// caused "context closed" cascades after the first job — single-process
// Chromium dies when stealth-patched context.close() runs. Multi-process
// is heavier (~150MB more RAM) but stable across many batches.
const CHROMIUM_ARGS = [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-extensions",
    "--disable-default-apps",
    "--disable-sync",
    "--no-first-run",
    "--disable-background-networking",
];

async function tick() {
    // Launch a FRESH browser per claim batch (not per tick). The previous
    // pattern reused one browser across 5 claim cycles; even with
    // multi-process, accumulated state caused intermittent crashes. A new
    // browser per batch costs ~600ms of cold start but the work itself is
    // 4-30s per job so the overhead is negligible.
    let total = 0;
    for (let i = 0; i < 5; i++) {
        // Pause between browser launches — back-to-back chromium spawns
        // on Railway's container occasionally SIGSEGV during init. 2s
        // settle window between close() and next launch() makes it stable.
        if (i > 0) await new Promise(r => setTimeout(r, 2000));
        let browser;
        try {
            browser = await chromium.launch({ headless: true, args: CHROMIUM_ARGS });
            const n = await claimAndRun(browser);
            total += n;
            if (n === 0) break;
        } catch (e) {
            console.error(`[worker] batch ${i} error: ${(e && e.message) || e}`);
            // Continue to next batch — transient launch failures shouldn't
            // kill the whole tick.
            continue;
        } finally {
            if (browser) await browser.close().catch(() => {});
        }
    }
    console.log(`[worker] tick done: ${total} jobs processed`);
}

async function main() {
    console.log(`[worker] starting (handlers=${MY_TASKS.join(",")}, batch=${BATCH_SIZE}, poll=${POLL_MS}ms)`);
    let stopping = false;
    process.on("SIGTERM", () => { console.log("[worker] SIGTERM"); stopping = true; });
    process.on("uncaughtException", (e) => console.error(`[worker] uncaughtException: ${e?.message || e}`));
    process.on("unhandledRejection", (r) => console.error(`[worker] unhandledRejection: ${r?.message || r}`));

    while (!stopping) {
        const t0 = Date.now();
        try { await tick(); } catch (e) { console.error(`[worker] tick fatal: ${(e && e.message) || e}`); }
        if (stopping) break;
        const sleep = Math.max(0, POLL_MS - (Date.now() - t0));
        if (sleep > 0) await new Promise((r) => setTimeout(r, sleep));
    }
    console.log("[worker] exiting cleanly");
}

main().catch((e) => {
    console.error("[worker] fatal:", e?.message || e);
    process.exit(1);
});
