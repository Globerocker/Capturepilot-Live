import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Lightweight IP-based rate limiter for public POST endpoints.
 *
 * History: was an in-memory `Map<string, Bucket>` per Vercel instance until
 * 2026-06-10 R2. That gave best-effort throttling — once Vercel horizontally
 * scaled the effective cap was `instances × maxPerMin`, which is fine when
 * the route only sees handfuls of req/min but breaks when an attacker hits
 * the public lead form from a few IPs. Now backed by the `rl_bump_windowed`
 * RPC (migration 142) so every instance shares the same counter.
 *
 * Usage:
 *   const limited = await protectCrawl(req, { route: "brand", maxPerMin: 5 });
 *   if (limited) return limited;
 *
 * Failure mode: if Supabase is unreachable we fail open (return null). The
 * crawl helper is a brake, not a vault — the real exfiltration defences live
 * in RLS policies and per-user quotas (see lib/crawl-protection.ts comment).
 */

function getClientIp(req: NextRequest): string {
    const fwd = req.headers.get("x-forwarded-for") || "";
    const ip = fwd.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
    return ip;
}

function sb() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

export async function protectCrawl(
    req: NextRequest,
    opts: { route: string; maxPerMin?: number; windowMs?: number },
): Promise<NextResponse | null> {
    const maxPerMin = opts.maxPerMin ?? 10;
    const windowMs = opts.windowMs ?? 60_000;
    // Round up so a `windowMs` < 1000 still maps to a 1-second window.
    const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
    const ip = getClientIp(req);
    const key = `${opts.route}:${ip}`;

    try {
        const { data, error } = await sb().rpc("rl_bump_windowed", {
            p_key: key,
            p_window_seconds: windowSeconds,
            p_max_count: maxPerMin,
        });
        if (error) {
            // Don't fail the caller just because Supabase is having a moment.
            // The audit panel surfaces unprotected calls via env-health anyway.
            console.warn("[protect-crawl] rl_bump_windowed failed:", error.message);
            return null;
        }
        const allowed = (data as boolean) ?? true;
        if (!allowed) {
            const retryAfter = windowSeconds;
            return NextResponse.json(
                { error: "Too many requests", retry_after_seconds: retryAfter },
                { status: 429, headers: { "Retry-After": String(retryAfter) } },
            );
        }
        return null;
    } catch (e) {
        console.warn("[protect-crawl] exception:", (e as Error).message);
        return null;
    }
}
