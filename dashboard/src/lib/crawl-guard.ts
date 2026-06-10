/**
 * crawl-guard — rate-limit + light bot-block for public crawl endpoints.
 *
 * Used by `/api/analyze-company` and any future public lead-magnet crawl route.
 * The full security model is layered:
 *   1. Captcha-response check (computed token the client must echo back).
 *   2. Honeypot field check (silently rejected if filled).
 *   3. In-memory IP rate limit (sliding window, per route).
 *   4. Postgres RLS policy on `company_analyses` rejects raw `WITH CHECK (true)`
 *      inserts that don't pass through the helper (see migration 035).
 *
 * Anything that fails here should return a `NextResponse` so the caller can
 * short-circuit with a single `if (rejection) return rejection;`.
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

type GuardOpts = {
    route: string;
    /** max requests allowed per IP per minute */
    maxPerMin?: number;
};

type Hit = { count: number; resetAt: number };

// In-memory sliding-window store. Vercel functions are short-lived so this is
// per-instance — good enough for a free-tier abuse brake. The DB policy in
// migration 035 is the durable defense.
const HITS = new Map<string, Hit>();

function getIp(req: NextRequest): string {
    const fwd = req.headers.get("x-forwarded-for") || "";
    const ip = fwd.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
    return ip;
}

/**
 * Compute the expected captcha_response token for a given website + day bucket.
 * Clients call `/api/analyze-company/token` first (or compute it client-side
 * if we ever expose the seed) and POST the result back. A missing or wrong
 * value gets a 400 — same shape as a bad form submit, no extra info.
 *
 * The token is HMAC(seed, normalized_host || YYYYMMDD). Day-bucketed so old
 * scraper scripts that hardcoded a token stop working after 24h.
 */
export function expectedCaptchaToken(website: string): string {
    const seed = process.env.CRAWL_GUARD_SEED || "cp-crawl-guard-default-seed-CHANGE-ME";
    let host = "";
    try {
        const url = website.startsWith("http") ? website : `https://${website}`;
        host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
        host = website.toLowerCase();
    }
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return crypto.createHmac("sha256", seed).update(`${host}|${day}`).digest("hex").slice(0, 24);
}

/**
 * Basic URL validation — rejects obvious spam shapes before we even hit the DB.
 * Returns the normalized URL on success, or a NextResponse to bail with.
 */
export function validateCrawlUrl(raw: string): { url: string; host: string } | NextResponse {
    if (!raw || typeof raw !== "string") {
        return NextResponse.json({ error: "Website is required" }, { status: 400 });
    }
    const trimmed = raw.trim();
    if (trimmed.length < 4 || trimmed.length > 500) {
        return NextResponse.json({ error: "Website URL has an invalid length" }, { status: 400 });
    }
    let parsed: URL;
    try {
        parsed = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    } catch {
        return NextResponse.json({ error: "Website URL is malformed" }, { status: 400 });
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
        return NextResponse.json({ error: "Only http/https URLs are accepted" }, { status: 400 });
    }
    const host = parsed.hostname.toLowerCase();
    if (host.length < 4 || !host.includes(".")) {
        return NextResponse.json({ error: "Website domain is too short" }, { status: 400 });
    }
    // Reject IP literals and localhost — we shouldn't crawl those.
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host === "localhost" || host.endsWith(".local")) {
        return NextResponse.json({ error: "Website hostname is not allowed" }, { status: 400 });
    }
    // Block a few classic abuse TLDs that almost never host real govcon firms.
    const badTld = /\.(ru|cn|tk|ml|ga|cf|gq|click|zip|xyz\b)$/i;
    if (badTld.test(host)) {
        return NextResponse.json({ error: "Website TLD is not supported" }, { status: 400 });
    }
    return { url: parsed.toString().replace(/\/+$/, ""), host };
}

/**
 * Main entry point. Call at the top of any POST handler that triggers a crawl.
 *
 * Returns `null` if the request passes all checks. Otherwise returns a
 * `NextResponse` you should return directly.
 *
 * The body MUST be parsed by the caller (we can't read it twice) — instead we
 * accept the already-parsed body fields we care about. Honeypot field is
 * `hp_field`; valid response means it must be empty.
 */
export async function protectCrawl(
    req: NextRequest,
    body: { website?: string; captcha_response?: string; hp_field?: string },
    opts: GuardOpts,
): Promise<NextResponse | null> {
    const { route, maxPerMin = 3 } = opts;

    // 1. Honeypot — bots that auto-fill every field die here, silent 400.
    if (body.hp_field && String(body.hp_field).length > 0) {
        return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }

    // 2. Captcha-response check — must match the day-bucketed HMAC.
    const website = (body.website || "").trim();
    if (!body.captcha_response || typeof body.captcha_response !== "string") {
        return NextResponse.json(
            { error: "Missing verification token. Please refresh and try again." },
            { status: 400 },
        );
    }
    const expected = expectedCaptchaToken(website);
    // Constant-time compare to avoid timing oracle on the HMAC.
    const got = String(body.captcha_response).slice(0, 24);
    if (got.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected))) {
        return NextResponse.json(
            { error: "Verification token is invalid. Please refresh and try again." },
            { status: 400 },
        );
    }

    // 3. In-memory sliding-window rate limit per IP + route.
    const ip = getIp(req);
    const key = `${route}:${ip}`;
    const now = Date.now();
    const windowMs = 60_000;
    const hit = HITS.get(key);
    if (!hit || hit.resetAt < now) {
        HITS.set(key, { count: 1, resetAt: now + windowMs });
    } else {
        hit.count += 1;
        if (hit.count > maxPerMin) {
            const retryAfter = Math.max(1, Math.ceil((hit.resetAt - now) / 1000));
            return NextResponse.json(
                { error: `Too many analyses. Try again in ${retryAfter}s.` },
                { status: 429, headers: { "Retry-After": String(retryAfter) } },
            );
        }
    }

    // 4. Periodic eviction of stale entries so the Map can't grow unbounded.
    if (HITS.size > 5000) {
        for (const [k, v] of HITS) {
            if (v.resetAt < now) HITS.delete(k);
        }
    }

    return null;
}
