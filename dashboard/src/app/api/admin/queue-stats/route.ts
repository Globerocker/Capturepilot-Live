/**
 * Live worker_jobs queue stats — for the admin queue dashboard.
 * Returns per-task-type counts grouped by status, plus recent throughput
 * (jobs completed in last 5 / 30 / 60 min).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
    const denied = await assertAdmin();
    if (denied) return denied;

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    // Pull aggregate counts via a single roundtrip — for-each task_type with a
    // count(*) filter would be N+1; one query that groups in JS is cheaper.
    const { data: jobs } = await sb.from("worker_jobs")
        .select("task_type, status, finished_at")
        .order("finished_at", { ascending: false, nullsFirst: false })
        .limit(50_000);

    const rows = (jobs || []) as Array<{ task_type: string; status: string; finished_at: string | null }>;

    const now = Date.now();
    const m5 = now - 5 * 60 * 1000;
    const m30 = now - 30 * 60 * 1000;
    const m60 = now - 60 * 60 * 1000;

    const byType: Record<string, {
        pending: number; running: number; done: number; failed: number; skipped: number;
        done_5m: number; done_30m: number; done_60m: number;
    }> = {};
    for (const r of rows) {
        if (!byType[r.task_type]) {
            byType[r.task_type] = { pending: 0, running: 0, done: 0, failed: 0, skipped: 0,
                done_5m: 0, done_30m: 0, done_60m: 0 };
        }
        const b = byType[r.task_type];
        if (r.status in b) (b as Record<string, number>)[r.status]++;
        if (r.status === "done" && r.finished_at) {
            const ft = new Date(r.finished_at).getTime();
            if (ft >= m5) b.done_5m++;
            if (ft >= m30) b.done_30m++;
            if (ft >= m60) b.done_60m++;
        }
    }

    // Also pull portal_cookies count + recently warmed
    const { data: cookies } = await sb.from("portal_cookies")
        .select("host, fetched_at, expires_at, use_count")
        .order("fetched_at", { ascending: false });

    const totals = Object.values(byType).reduce((acc, b) => ({
        pending: acc.pending + b.pending,
        running: acc.running + b.running,
        done: acc.done + b.done,
        failed: acc.failed + b.failed,
        done_5m: acc.done_5m + b.done_5m,
        done_30m: acc.done_30m + b.done_30m,
        done_60m: acc.done_60m + b.done_60m,
    }), { pending: 0, running: 0, done: 0, failed: 0, done_5m: 0, done_30m: 0, done_60m: 0 });

    return NextResponse.json({
        ok: true,
        totals,
        by_task_type: byType,
        portal_cookies: {
            count: cookies?.length || 0,
            hosts: cookies?.slice(0, 30) || [],
        },
        as_of: new Date().toISOString(),
    });
}
