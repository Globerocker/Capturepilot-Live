import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

/**
 * Allowlist of cron paths the admin "Re-run" button can fire. Anything outside
 * this set is rejected so the proxy can't be coerced into hitting an arbitrary
 * URL with our CRON_SECRET attached.
 */
const ALLOWED_CRON_PATHS = new Set<string>([
    "/api/cron/ingest_sam",
    "/api/cron/ingest_grants",
    "/api/cron/score_matches",
    "/api/cron/strategic_scoring",
    "/api/cron/db_cleanup",
    "/api/cron/enrich",
    "/api/cron/enrich_contractors",
    "/api/cron/enrich_apollo",
    "/api/cron/backfill_requirements",
    "/api/cron/competitor_monitor",
    "/api/cron/deep_enrich",
    "/api/cron/ai_strategy",
    "/api/cron/notify_matches",
    "/api/cron/process_scheduled_emails",
    "/api/cron/trial_reminders",
    "/api/cron/beta_deadline",
    "/api/cron/monthly_awards",
]);

/**
 * POST /api/admin/jobs/trigger-cron
 * Body: { path: "/api/cron/<name>" }
 *
 * Server-side fires the cron route with the CRON_SECRET bearer so the admin
 * can re-run any scheduled task from the unified jobs page without exposing
 * the secret to the browser.
 */
export async function POST(req: NextRequest) {
    try {
        const { path } = await req.json();
        if (typeof path !== "string" || !ALLOWED_CRON_PATHS.has(path)) {
            return NextResponse.json({ error: "Invalid or disallowed cron path" }, { status: 400 });
        }

        const secret = process.env.CRON_SECRET;
        if (!secret) {
            return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
        }

        const proto = req.headers.get("x-forwarded-proto") || "https";
        const host = req.headers.get("host");
        if (!host) {
            return NextResponse.json({ error: "Missing host header" }, { status: 500 });
        }
        const url = `${proto}://${host}${path}`;

        const started = Date.now();
        const res = await fetch(url, {
            method: "GET",
            headers: { Authorization: `Bearer ${secret}` },
        });
        const text = await res.text();
        const elapsedMs = Date.now() - started;

        let body: unknown = text;
        try { body = JSON.parse(text); } catch { /* keep as text */ }

        return NextResponse.json({
            success: res.ok,
            status: res.status,
            elapsed_ms: elapsedMs,
            result: body,
        });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
