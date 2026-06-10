import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
    captureCronFailure,
    captureWorkerQueueSpike,
    alertBreadcrumb,
} from "@/lib/sentry-alerts";

export const maxDuration = 60;

/**
 * /api/cron/health_monitor
 *
 * Scheduled health sweep that runs every 10 minutes and fires Sentry
 * alert recipes when CapturePilot's background systems are unhealthy:
 *
 *   1. Cron failures: scans `health_alerts` for any `cron_failed`
 *      firings in the last hour and re-surfaces a single rollup if any
 *      route has failed 3+ times (avoids alert fatigue).
 *
 *   2. Worker queue spike: if a `worker_jobs` table exists, checks each
 *      task_type lane — fires `worker_queue_spike` when pending > 5000
 *      and no `done` records in the last hour. (No-op if the table
 *      isn't deployed, which is the case on older branches.)
 *
 * Auth: CRON_SECRET bearer token, same pattern as every other cron.
 */
export async function GET(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) {
        return NextResponse.json({ error: "Supabase env missing" }, { status: 500 });
    }
    const db = createClient(url, key);

    const out: Record<string, unknown> = { ok: true };

    try {
        // ─── 1) Cron failure rollup ─────────────────────────────────
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { data: recentCronFails, error: failErr } = await db
            .from("health_alerts")
            .select("route, fired_at")
            .eq("recipe", "cron_failed")
            .gte("fired_at", oneHourAgo);

        if (failErr) {
            alertBreadcrumb("health_monitor", "cron_fail_query_error", { error: failErr.message });
        } else {
            const counts = new Map<string, number>();
            for (const row of recentCronFails || []) {
                const route = (row as { route: string | null }).route || "unknown";
                counts.set(route, (counts.get(route) || 0) + 1);
            }
            const rolling: Array<{ route: string; count: number }> = [];
            for (const [route, count] of counts.entries()) {
                if (count >= 3) {
                    rolling.push({ route, count });
                    captureCronFailure({
                        route,
                        status: 0,
                        error: `health_monitor: ${count} cron_failed firings in last hour on ${route}`,
                        extra: { rollup: true, window_min: 60 },
                    });
                }
            }
            out.cron_failure_rollups = rolling;
        }

        // ─── 2) Worker queue spike (optional table) ─────────────────
        // Try to read from worker_jobs; if the table doesn't exist on
        // this branch we silently skip — no crash.
        const { data: pendingRows, error: pendingErr } = await db
            .from("worker_jobs")
            .select("task_type")
            .eq("status", "pending");

        if (pendingErr) {
            // Table not yet deployed on this branch — treat as no-op
            // and just record a breadcrumb so we don't spam errors.
            alertBreadcrumb("health_monitor", "worker_jobs_table_missing", {
                error: pendingErr.message,
            });
            out.worker_queue_spike_scan = "skipped";
        } else {
            const pendingByType = new Map<string, number>();
            for (const r of (pendingRows || []) as { task_type: string }[]) {
                pendingByType.set(r.task_type, (pendingByType.get(r.task_type) || 0) + 1);
            }

            const spikes: Array<{ task_type: string; pending: number; done_in_window: number }> = [];
            for (const [taskType, pending] of pendingByType.entries()) {
                if (pending <= 5000) continue;

                // Has anything completed in this lane in the last hour?
                const { count: doneCount } = await db
                    .from("worker_jobs")
                    .select("id", { count: "exact", head: true })
                    .eq("task_type", taskType)
                    .eq("status", "done")
                    .gte("updated_at", oneHourAgo);

                const doneInWindow = doneCount || 0;
                if (doneInWindow === 0) {
                    spikes.push({ task_type: taskType, pending, done_in_window: doneInWindow });
                    captureWorkerQueueSpike({
                        taskType,
                        pending,
                        runningWindowMin: 60,
                        doneInWindow,
                    });
                }
            }
            out.worker_queue_spikes = spikes;
        }

        return NextResponse.json(out);
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "health_monitor error";
        console.error("[health_monitor] fatal:", e);
        captureCronFailure({
            route: "/api/cron/health_monitor",
            status: 500,
            error: e,
        });
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
