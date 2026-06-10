import { NextRequest, NextResponse } from "next/server";

/**
 * Lightweight in-memory IP-based rate limiter for public POST endpoints.
 * In-memory means it is per-instance — on Vercel it gives best-effort
 * throttling, not a strict global cap. For strict throttling, swap in
 * a `rl_bump` RPC against Supabase or Upstash Redis.
 *
 * Usage:
 *   const limited = protectCrawl(req, { route: "brand", maxPerMin: 5 });
 *   if (limited) return limited;
 */
type Bucket = { count: number; resetAt: number };

const BUCKETS = new Map<string, Bucket>();

function getClientIp(req: NextRequest): string {
    const fwd = req.headers.get("x-forwarded-for") || "";
    const ip = fwd.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
    return ip;
}

export function protectCrawl(
    req: NextRequest,
    opts: { route: string; maxPerMin?: number; windowMs?: number },
): NextResponse | null {
    const maxPerMin = opts.maxPerMin ?? 10;
    const windowMs = opts.windowMs ?? 60_000;
    const ip = getClientIp(req);
    const key = `${opts.route}:${ip}`;
    const now = Date.now();

    const existing = BUCKETS.get(key);
    if (!existing || existing.resetAt < now) {
        BUCKETS.set(key, { count: 1, resetAt: now + windowMs });
        return null;
    }

    if (existing.count >= maxPerMin) {
        const retryAfter = Math.ceil((existing.resetAt - now) / 1000);
        return NextResponse.json(
            { error: "Too many requests", retry_after_seconds: retryAfter },
            { status: 429, headers: { "Retry-After": String(retryAfter) } },
        );
    }

    existing.count += 1;
    return null;
}
