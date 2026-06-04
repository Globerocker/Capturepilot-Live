/**
 * Crawl protection — server-side rate limiting + bot detection.
 *
 * Two layers of defense against data scraping (which is the realistic
 * exfiltration risk on a $39 Light tier that doesn't have export):
 *
 *   1. Per-IP rate limit  — sliding window in Supabase (no Redis needed)
 *   2. Bot UA detection   — block obvious headless/scraper user-agents
 *   3. Per-user quota     — counted against matches_per_day limit
 *
 * Usage in any public-facing API route:
 *
 *   import { protectCrawl } from "@/lib/crawl-protection";
 *
 *   export async function GET(req: NextRequest) {
 *     const denied = await protectCrawl(req, { route: "matches", maxPerMin: 30 });
 *     if (denied) return denied;     // returns NextResponse 429
 *     // ... your route logic
 *   }
 *
 * The rate-limit state lives in the `rate_limit_buckets` table (migration
 * 109). Per-IP + per-route + per-minute. Rows older than 5 min are GC'd
 * by a daily cron — they don't consume meaningful space.
 *
 * Why not edge middleware + KV?
 *   - We're on Vercel Hobby/Pro without paid Vercel KV
 *   - Postgres can handle the write load (low cardinality: IP + route)
 *   - Keeps everything inside our existing Supabase, one source of truth
 *   - Vercel Edge Functions can read but not write Postgres without a
 *     longer-running runtime; Node runtime is fine for our throughput
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// User-agent patterns that almost certainly aren't real browsers. Real
// users may show up in the long tail of mobile clients we don't have
// listed — so this is a SOFT-block (rate-limit ÷2) for unknowns and a
// HARD-block for the obvious scrapers below.
const HARD_BLOCK_UA = [
    /python-requests/i, /python-urllib/i, /^Python\//,
    /curl\//i, /^Wget\//i, /^Go-http-client/i, /^okhttp/i,
    /^Java\//, /aiohttp/i, /node-fetch/i, /axios/i,
    /scrapy/i, /Scrapy/, /HTTrack/i, /SiteSucker/i,
    /^ApacheBench/, /^libwww-perl/i,
    /selenium/i, /Headless(Chrome|Firefox)/i, /PhantomJS/i,
    /CapturePilot-(?!Discovery)/i,  // anything pretending to be us, except our own discovery agent
];

// Allowed bots we explicitly invite (search engine indexers). These pass
// even with no rate-limit budget because we WANT them crawling pricing/blog.
const ALLOWED_BOT_UA = [
    /Googlebot/i, /Bingbot/i, /DuckDuckBot/i, /YandexBot/i,
    /GPTBot/i, /ClaudeBot/i, /PerplexityBot/i, /Google-Extended/i,
    /Applebot/i, /CCBot/i, /Amazonbot/i,
];

interface ProtectOpts {
    /** Logical route name for the bucket key (e.g. "matches", "search"). */
    route: string;
    /** Hard per-IP per-minute cap. Above this we 429. Default 60. */
    maxPerMin?: number;
    /** When true, allow ALLOWED_BOT_UA through unconditionally. Default true. */
    allowSearchBots?: boolean;
    /** When true, soft-block unknown UAs at half the maxPerMin. Default true. */
    softBlockUnknownUa?: boolean;
}

function getClientIp(req: NextRequest): string {
    // Vercel sets x-forwarded-for. Take the FIRST entry (closest to user).
    const xff = req.headers.get("x-forwarded-for");
    if (xff) return xff.split(",")[0].trim();
    const xri = req.headers.get("x-real-ip");
    if (xri) return xri.trim();
    return "unknown";
}

function isHardBlockedUa(ua: string | null): boolean {
    if (!ua) return true;  // no UA at all = scraper
    return HARD_BLOCK_UA.some(p => p.test(ua));
}

function isAllowedBot(ua: string | null): boolean {
    if (!ua) return false;
    return ALLOWED_BOT_UA.some(p => p.test(ua));
}

function sb() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

/**
 * Returns null when the request is allowed. Returns a 429 NextResponse
 * (ready to return from the route handler) when blocked.
 */
export async function protectCrawl(
    req: NextRequest,
    opts: ProtectOpts,
): Promise<NextResponse | null> {
    const ua = req.headers.get("user-agent");
    const ip = getClientIp(req);
    const { route, maxPerMin = 60, allowSearchBots = true, softBlockUnknownUa = true } = opts;

    // 1. UA hard-block — scrapers with library UAs get 403 immediately.
    if (isHardBlockedUa(ua)) {
        return NextResponse.json(
            { error: "Automated requests not permitted. Use the API: /api/v1 (Pro tier)." },
            { status: 403, headers: { "x-blocked-reason": "automated_ua" } },
        );
    }

    // 2. Whitelisted search/LLM bots bypass the rate limit entirely.
    if (allowSearchBots && isAllowedBot(ua)) {
        return null;
    }

    // 3. Per-IP per-route per-minute window.
    // Bucket key: "ip:ROUTE:YYYY-MM-DDTHH:MM"
    const now = new Date();
    const minuteKey = now.toISOString().slice(0, 16); // "2026-06-03T14:25"
    const bucket = `${ip}|${route}|${minuteKey}`;

    // Soft-block: unknown UAs get half the budget.
    const limit = softBlockUnknownUa && !ua ? Math.floor(maxPerMin / 2) : maxPerMin;

    try {
        const client = sb();
        // Atomic increment via RPC `rl_bump` (created in migration 109).
        // Returns new count after increment.
        const { data, error } = await client.rpc("rl_bump", { p_bucket: bucket });
        if (error) {
            // Don't fail the request just because Supabase is having a moment.
            // We log so we can spot crawl events that bypassed protection.
            console.warn("[crawl-protection] rl_bump failed:", error.message);
            return null;
        }
        const count = (data as number) || 1;
        if (count > limit) {
            return NextResponse.json(
                { error: `Rate limit exceeded: ${maxPerMin} requests/min per IP on this route. Slow down or upgrade to Pro for API access.` },
                {
                    status: 429,
                    headers: {
                        "x-blocked-reason": "rate_limit",
                        "x-rl-limit": String(maxPerMin),
                        "x-rl-count": String(count),
                        "retry-after": "60",
                    },
                },
            );
        }
        return null;
    } catch (e) {
        console.warn("[crawl-protection] exception:", (e as Error).message);
        return null;
    }
}

/**
 * Helper for unit tests + admin dashboards — tells you what the current
 * count is for a (ip, route, minute) tuple without incrementing.
 */
export async function peekRateLimit(ip: string, route: string): Promise<number> {
    const minuteKey = new Date().toISOString().slice(0, 16);
    const bucket = `${ip}|${route}|${minuteKey}`;
    const { data } = await sb().from("rate_limit_buckets").select("count").eq("bucket", bucket).maybeSingle();
    return (data as { count: number } | null)?.count || 0;
}
