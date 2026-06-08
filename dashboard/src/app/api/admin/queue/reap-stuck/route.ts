/**
 * POST /api/admin/queue/reap-stuck?task_type=<name>&stale_minutes=<n>
 *
 * Calls migration 119's reap_stale_jobs(interval) RPC, which flips rows
 * stuck in status='running' for >stale_minutes back to 'pending' (if
 * attempts remain) or marks them 'failed' (if max_attempts reached).
 *
 * NOTE: reap_stale_jobs is global by design — running-row cleanup must not
 * leave half the queue with stale entries. We accept task_type in the query
 * string for symmetry with the other admin queue endpoints and surface it
 * in the response + audit log, but the underlying RPC sweeps all task
 * types in one shot.
 *
 * Admin-only. task_type must be in ALLOWED_TASK_TYPES. stale_minutes is
 * clamped to [1, 60].
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { assertAdmin } from "@/lib/auth-admin";
import { validateTaskType, logQueueAction } from "@/lib/worker-jobs/admin-actions";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    const url = new URL(req.url);
    const v = validateTaskType(url.searchParams.get("task_type"));
    if (!v.ok) {
        return NextResponse.json({ ok: false, error: v.error }, { status: 400 });
    }
    const taskType = v.value;

    const rawStale = Number(url.searchParams.get("stale_minutes"));
    const staleMinutes = Math.max(
        1,
        Math.min(60, Number.isFinite(rawStale) && rawStale > 0 ? rawStale : 10),
    );

    // Resolve admin's auth user id for the audit log.
    const cookieStore = await cookies();
    const userClient = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    );
    const { data: { user: authUser } } = await userClient.auth.getUser();

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    let requeued = 0;
    let failed = 0;
    try {
        const { data, error } = await sb.rpc("reap_stale_jobs", {
            p_stale_after: `${staleMinutes} minutes`,
        });
        if (error) {
            console.error("[queue-admin reap-stuck] rpc error:", error.message);
            return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        }
        // reap_stale_jobs RETURNS TABLE (requeued int, failed int) → array of one row
        const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
        requeued = row?.requeued ?? 0;
        failed = row?.failed ?? 0;
    } catch (e) {
        console.error("[queue-admin reap-stuck] rpc threw:", (e as Error).message);
        return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
    }

    if (authUser?.id) {
        await logQueueAction(sb, {
            authUserId: authUser.id,
            action: "queue_reap_stuck",
            taskType,
            description: `Reaped stale running jobs (>${staleMinutes}min): ${requeued} requeued, ${failed} failed`,
            metadata: { stale_minutes: staleMinutes, requeued, failed, scope: "global" },
        });
    }

    return NextResponse.json({
        ok: true,
        task_type: taskType,
        stale_minutes: staleMinutes,
        requeued,
        failed,
        note: "Reaper is global across all task types — counts include other task_types.",
    });
}
