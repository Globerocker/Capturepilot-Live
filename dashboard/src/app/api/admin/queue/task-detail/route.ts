/**
 * Per-task-type drill-down for the /admin/health/queue/[task_type] detail page.
 *
 * Returns:
 *   - counts per status (pending/running/done/failed/skipped)
 *   - throughput buckets last 24h (24 hourly buckets of done count)
 *   - up to 20 most recent FAILED rows with truncated last_error
 *   - up to 5 most recent RUNNING rows with started_at + age_seconds
 *
 * Cheap: scoped to one task_type via the worker_jobs_task_status_idx index.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";

export const runtime = "nodejs";

const MAX_ERR_LEN = 240;

function truncate(s: string | null, n: number) {
    if (!s) return null;
    if (s.length <= n) return s;
    return s.slice(0, n) + "…";
}

export async function GET(req: NextRequest) {
    const denied = await assertAdmin();
    if (denied) return denied;

    const url = new URL(req.url);
    const taskType = url.searchParams.get("task_type")?.trim();
    if (!taskType) {
        return NextResponse.json({ error: "task_type required" }, { status: 400 });
    }

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    // Pull every row for this task_type in the last 24h plus all live
    // (pending/running) rows regardless of age — the live set is what we
    // need accurate counts on. Capped at 20k to keep the response bounded.
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: jobs, error } = await sb
        .from("worker_jobs")
        .select("id, task_type, status, started_at, finished_at, error_message, attempts, max_attempts, created_at, payload")
        .eq("task_type", taskType)
        .or(`status.in.(pending,running),finished_at.gte.${since24h}`)
        .order("created_at", { ascending: false })
        .limit(20_000);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (jobs || []) as Array<{
        id: string;
        task_type: string;
        status: string;
        started_at: string | null;
        finished_at: string | null;
        error_message: string | null;
        attempts: number;
        max_attempts: number;
        created_at: string;
        payload: Record<string, unknown> | null;
    }>;

    // Status counts (live + 24h done/failed/skipped)
    const counts = { pending: 0, running: 0, done: 0, failed: 0, skipped: 0 };
    for (const r of rows) {
        if (r.status in counts) (counts as Record<string, number>)[r.status]++;
    }

    // 24h throughput — 24 hourly buckets of done count (oldest → newest)
    const now = Date.now();
    const bucketMs = 60 * 60 * 1000;
    const buckets: { hour_start: string; done: number; failed: number }[] = [];
    for (let i = 23; i >= 0; i--) {
        const start = now - (i + 1) * bucketMs;
        buckets.push({ hour_start: new Date(start).toISOString(), done: 0, failed: 0 });
    }
    for (const r of rows) {
        if (!r.finished_at) continue;
        const ft = new Date(r.finished_at).getTime();
        const ageMin = (now - ft) / 60_000;
        if (ageMin > 24 * 60) continue;
        const idx = 23 - Math.floor(ageMin / 60);
        if (idx < 0 || idx > 23) continue;
        if (r.status === "done") buckets[idx].done++;
        if (r.status === "failed") buckets[idx].failed++;
    }

    // Sample failed (up to 20, most recent first)
    const sampleFailed = rows
        .filter(r => r.status === "failed")
        .sort((a, b) => (b.finished_at || "").localeCompare(a.finished_at || ""))
        .slice(0, 20)
        .map(r => ({
            id: r.id,
            finished_at: r.finished_at,
            attempts: r.attempts,
            max_attempts: r.max_attempts,
            last_error: truncate(r.error_message, MAX_ERR_LEN),
            payload_summary: summarizePayload(r.payload),
        }));

    // Sample running (up to 5, oldest first — those are the ones most likely stuck)
    const sampleRunning = rows
        .filter(r => r.status === "running")
        .sort((a, b) => (a.started_at || "").localeCompare(b.started_at || ""))
        .slice(0, 5)
        .map(r => {
            const ageSec = r.started_at
                ? Math.max(0, Math.floor((now - new Date(r.started_at).getTime()) / 1000))
                : null;
            return {
                id: r.id,
                started_at: r.started_at,
                age_seconds: ageSec,
                attempts: r.attempts,
                payload_summary: summarizePayload(r.payload),
            };
        });

    return NextResponse.json({
        ok: true,
        task_type: taskType,
        counts,
        throughput_24h: buckets,
        sample_failed: sampleFailed,
        sample_running: sampleRunning,
        as_of: new Date().toISOString(),
    });
}

/**
 * Reduce the payload to a short human-readable label. The fan-out trigger
 * uses opp_id / host / company_id as the dedup key, so those are the most
 * informative fields to surface in a sample row.
 */
function summarizePayload(p: Record<string, unknown> | null): string {
    if (!p) return "";
    const keys = ["opp_id", "host", "company_id", "lead_id", "user_id"];
    for (const k of keys) {
        const v = p[k];
        if (typeof v === "string" && v) return `${k}=${v.length > 40 ? v.slice(0, 37) + "…" : v}`;
    }
    const first = Object.entries(p)[0];
    if (!first) return "";
    return `${first[0]}=${String(first[1]).slice(0, 40)}`;
}
