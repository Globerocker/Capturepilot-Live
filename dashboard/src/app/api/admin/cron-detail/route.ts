/**
 * Admin endpoint backing the /admin/health/crons detail pages.
 *
 * Two shapes:
 *
 *   GET /api/admin/cron-detail
 *     → { crons: CronOverview[] } — every cron in vercel.json with last-run
 *       summary + 24h counters joined from `cron_runs`. Powers the list view.
 *
 *   GET /api/admin/cron-detail?route=/api/cron/ingest_sam
 *     → { cron, summary, runs: CronRunRow[] } — single cron + last 50 runs.
 *       Powers the detail view.
 *
 * Admin-only. Re-uses `cron_runs` (same source as /api/admin/cron-runs) but
 * keyed by route to make the per-cron page cheap.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";
import {
    getAllCrons,
    findCron,
    nextRunAt,
    expectedIntervalMs,
    humanizeSchedule,
} from "@/lib/cron-schedule";

function getServiceClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

interface CronRunRow {
    id: string;
    route: string;
    started_at: string;
    finished_at: string | null;
    status: string | null;
    rows_in: number | null;
    rows_out: number | null;
    error_message: string | null;
    elapsed_ms: number | null;
}

export interface CronOverview {
    route: string;
    schedule: string;
    schedule_label: string;
    expected_interval_ms: number | null;
    next_run_at: string | null;
    last_run_at: string | null;
    last_status: string | null;
    last_error: string | null;
    last_elapsed_ms: number | null;
    runs_24h: number;
    ok_24h: number;
    error_24h: number;
    success_rate_24h: number | null;
    runs_7d: number;
    /**
     * Computed bucket — "green" (fresh), "amber" (stale 1.5-3× interval),
     * "red" (>3× interval OR never ran), "unknown" (no schedule parsed).
     */
    health: "green" | "amber" | "red" | "unknown";
}

function computeHealth(
    lastRun: string | null,
    expectedMs: number | null,
): CronOverview["health"] {
    if (expectedMs == null) return "unknown";
    if (!lastRun) return "red";
    const age = Date.now() - new Date(lastRun).getTime();
    if (age <= expectedMs * 1.5) return "green";
    if (age <= expectedMs * 3) return "amber";
    return "red";
}

export async function GET(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    const url = new URL(req.url);
    const route = url.searchParams.get("route");
    const db = getServiceClient();

    if (route) {
        // ─────────────── single-cron detail ───────────────
        const cron = findCron(route);
        if (!cron) {
            // Not in vercel.json — still surface any runs that exist, but flag
            // the schedule as missing. Lets admins debug accidentally-renamed
            // routes (cron_runs still has the old name).
        }
        const schedule = cron?.schedule || "";
        const expectedMs = schedule ? expectedIntervalMs(schedule) : null;
        const next = schedule ? nextRunAt(schedule) : null;

        const { data: runs, error: runsErr } = await db
            .from("cron_runs")
            .select("id, route, started_at, finished_at, status, rows_in, rows_out, error_message, elapsed_ms")
            .eq("route", route)
            .order("started_at", { ascending: false })
            .limit(50);
        if (runsErr) return NextResponse.json({ error: runsErr.message }, { status: 500 });

        const since24h = new Date(Date.now() - 86_400_000).toISOString();
        const { data: window24h } = await db
            .from("cron_runs")
            .select("status")
            .eq("route", route)
            .gte("started_at", since24h);

        const since7d = new Date(Date.now() - 7 * 86_400_000).toISOString();
        const { data: window7d } = await db
            .from("cron_runs")
            .select("id")
            .eq("route", route)
            .gte("started_at", since7d);

        const runs24h = (window24h || []).length;
        const ok24h = (window24h || []).filter(r => r.status === "ok").length;
        const err24h = (window24h || []).filter(r => r.status === "error").length;
        const latest = (runs || [])[0] || null;
        const lastError = (runs || []).find(r => r.error_message)?.error_message || null;

        const overview: CronOverview = {
            route,
            schedule,
            schedule_label: schedule ? humanizeSchedule(schedule) : "Not scheduled (missing from vercel.json)",
            expected_interval_ms: expectedMs,
            next_run_at: next?.toISOString() || null,
            last_run_at: latest?.started_at || null,
            last_status: latest?.status || null,
            last_error: lastError,
            last_elapsed_ms: latest?.elapsed_ms ?? null,
            runs_24h: runs24h,
            ok_24h: ok24h,
            error_24h: err24h,
            success_rate_24h: runs24h > 0 ? Math.round((ok24h / runs24h) * 100) : null,
            runs_7d: (window7d || []).length,
            health: computeHealth(latest?.started_at || null, expectedMs),
        };

        return NextResponse.json({
            cron: overview,
            runs: (runs || []) as CronRunRow[],
            generated_at: new Date().toISOString(),
        });
    }

    // ─────────────── list view: all crons ───────────────
    const all = getAllCrons();
    const since24h = new Date(Date.now() - 86_400_000).toISOString();
    const since7d = new Date(Date.now() - 7 * 86_400_000).toISOString();

    // Pull last 7d so we can derive both 24h + 7d windows in one round-trip.
    const { data: rows, error } = await db
        .from("cron_runs")
        .select("route, started_at, status, error_message, elapsed_ms")
        .gte("started_at", since7d)
        .order("started_at", { ascending: false })
        .limit(20_000);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Bucket by route — first row per route is the latest (we ordered desc).
    const byRoute = new Map<string, typeof rows>();
    for (const r of rows || []) {
        const arr = byRoute.get(r.route) || [];
        arr.push(r);
        byRoute.set(r.route, arr);
    }

    const overviews: CronOverview[] = all.map(cron => {
        const rs = byRoute.get(cron.path) || [];
        const latest = rs[0] || null;
        const lastError = rs.find(r => r.error_message)?.error_message || null;
        const win24h = rs.filter(r => r.started_at >= since24h);
        const ok24h = win24h.filter(r => r.status === "ok").length;
        const err24h = win24h.filter(r => r.status === "error").length;
        const expectedMs = expectedIntervalMs(cron.schedule);
        const next = nextRunAt(cron.schedule);
        return {
            route: cron.path,
            schedule: cron.schedule,
            schedule_label: humanizeSchedule(cron.schedule),
            expected_interval_ms: expectedMs,
            next_run_at: next?.toISOString() || null,
            last_run_at: latest?.started_at || null,
            last_status: latest?.status || null,
            last_error: lastError,
            last_elapsed_ms: latest?.elapsed_ms ?? null,
            runs_24h: win24h.length,
            ok_24h: ok24h,
            error_24h: err24h,
            success_rate_24h: win24h.length > 0 ? Math.round((ok24h / win24h.length) * 100) : null,
            runs_7d: rs.length,
            health: computeHealth(latest?.started_at || null, expectedMs),
        };
    });

    // Worst-first sort: red → amber → unknown → green; within bucket, stalest
    // (oldest last_run) on top. Lets admins see what's broken without scrolling.
    const healthOrder: Record<CronOverview["health"], number> = {
        red: 0, amber: 1, unknown: 2, green: 3,
    };
    overviews.sort((a, b) => {
        const h = healthOrder[a.health] - healthOrder[b.health];
        if (h !== 0) return h;
        return (a.last_run_at || "").localeCompare(b.last_run_at || "");
    });

    return NextResponse.json({
        crons: overviews,
        total: overviews.length,
        generated_at: new Date().toISOString(),
    });
}
