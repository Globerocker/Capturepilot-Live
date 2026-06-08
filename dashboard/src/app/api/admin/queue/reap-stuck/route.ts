/**
 * POST /api/admin/queue/reap-stuck?task_type=<name>&stale_minutes=<n>
 *
 * Calls migration 119's reap_stale_jobs(interval) RPC, which flips rows
 * stuck in status='running' for >10min back to 'pending' (if attempts
 * remain) or marks them 'failed' (if max_attempts reached).
 *
 * NOTE: reap_stale_jobs is global by design — running-row cleanup must not
 * leave half the queue with stale entries. We accept task_type in the
 * query string for symmetry with the other admin queue endpoints and
 * surface it in the response, but the underlying RPC sweeps all task
 * types in one shot. Future improvement: a task-scoped variant.
 *
 * Admin-only.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
    const denied = await assertAdmin();
    if (denied) return denied;

    const url = new URL(req.url);
    const taskType = url.searchParams.get("task_type")?.trim() || null;
    const staleMinutes = Math.max(1, Math.min(60, Number(url.searchParams.get("stale_minutes")) || 10));

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    const { data, error } = await sb.rpc("reap_stale_jobs", {
        p_stale_after: `${staleMinutes} minutes`,
    });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // reap_stale_jobs RETURNS TABLE (requeued int, failed int) → array of one row
    const row = Array.isArray(data) && data.length > 0 ? data[0] : null;

    return NextResponse.json({
        ok: true,
        task_type: taskType,
        stale_minutes: staleMinutes,
        requeued: row?.requeued ?? 0,
        failed: row?.failed ?? 0,
        note: "Reaper is global across all task types — counts include other task_types.",
    });
}
