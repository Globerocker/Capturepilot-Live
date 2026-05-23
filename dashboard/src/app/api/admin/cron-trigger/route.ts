/**
 * Admin manual-trigger for any cron route.
 *
 * POST /api/admin/cron-trigger
 *   body: { route: "/api/cron/ingest_sam", params?: { days: "10" } }
 *
 * Returns the cron's own JSON response + elapsed_ms. Backs the
 * "Run now" buttons on the /admin/crons dashboard.
 *
 * Admin-only. Uses SUPABASE_SERVICE_KEY internally as the Bearer when
 * calling the target cron — every cron now has dual-auth (commit
 * 54470bbe) so this works without exposing CRON_SECRET to the browser.
 */

import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/auth-admin";

// Allowlist — only routes that genuinely live under /api/cron/ and use the
// dual-auth pattern. Reject any attempt to call non-cron endpoints.
function isAllowedRoute(route: string): boolean {
    return /^\/api\/cron\/[a-z0-9_]+$/.test(route);
}

export async function POST(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    let body: { route?: string; params?: Record<string, string> } = {};
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const route = body.route?.trim();
    if (!route || !isAllowedRoute(route)) {
        return NextResponse.json({ error: "route must look like /api/cron/<name>" }, { status: 400 });
    }

    const serviceKey = process.env.SUPABASE_SERVICE_KEY;
    if (!serviceKey) return NextResponse.json({ error: "SUPABASE_SERVICE_KEY missing" }, { status: 500 });

    // Resolve base — same-origin
    const proto = req.headers.get("x-forwarded-proto") || "https";
    const host = req.headers.get("host") || "app.capturepilot.com";
    const base = `${proto}://${host}`;

    const qs = body.params ? "?" + new URLSearchParams(body.params).toString() : "";
    const url = `${base}${route}${qs}`;

    const t0 = Date.now();
    try {
        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${serviceKey}` },
            // Cron routes set maxDuration=300; this admin route also waits up to that.
            signal: AbortSignal.timeout(295_000),
        });
        let payload: unknown;
        try { payload = await res.json(); } catch { payload = await res.text(); }
        return NextResponse.json({
            status: res.status,
            elapsed_ms: Date.now() - t0,
            payload,
        });
    } catch (e) {
        return NextResponse.json({
            error: (e as Error).message || "fetch failed",
            elapsed_ms: Date.now() - t0,
        }, { status: 502 });
    }
}
