/**
 * POST /api/admin/queue/retry-failed?task_type=<name>
 *
 * Re-enqueues every FAILED row for the given task_type by flipping
 * status='pending' and resetting attempts=0. The partial unique index
 * worker_jobs_dedup_active_idx covers status IN ('pending','running'),
 * so any row whose dedup_key is already in flight will surface as a 23505
 * constraint violation — those rows are left FAILED and reported back as
 * `skipped`.
 *
 * Admin-only. task_type must be in ALLOWED_TASK_TYPES.
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

    // Resolve admin's auth user id for the audit log. assertAdmin already
    // verified the session, so this read should always succeed; we still
    // guard against null and skip audit on failure.
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

    let ids: string[] = [];
    try {
        // Pull failed row ids first so we can iterate and tolerate dedup
        // collisions row-by-row (a single bulk UPDATE would abort on the
        // first conflict and roll back the whole transaction).
        const { data: failed, error: selErr } = await sb
            .from("worker_jobs")
            .select("id")
            .eq("task_type", taskType)
            .eq("status", "failed")
            .limit(10_000);

        if (selErr) {
            console.error("[queue-admin retry-failed] select error:", selErr.message);
            return NextResponse.json({ ok: false, error: selErr.message }, { status: 500 });
        }
        ids = (failed || []).map(r => r.id as string);
    } catch (e) {
        console.error("[queue-admin retry-failed] select threw:", (e as Error).message);
        return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
    }

    let retried = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const id of ids) {
        try {
            const { error: updErr } = await sb
                .from("worker_jobs")
                .update({
                    status: "pending",
                    attempts: 0,
                    started_at: null,
                    finished_at: null,
                    error_message: null,
                })
                .eq("id", id);

            if (updErr) {
                if (updErr.code === "23505") {
                    skipped++;
                } else {
                    errors.push(`${id}: ${updErr.message}`);
                    console.error("[queue-admin retry-failed] update error:", id, updErr.message);
                }
            } else {
                retried++;
            }
        } catch (e) {
            errors.push(`${id}: ${(e as Error).message}`);
            console.error("[queue-admin retry-failed] update threw:", id, (e as Error).message);
        }
    }

    if (authUser?.id) {
        await logQueueAction(sb, {
            authUserId: authUser.id,
            action: "queue_retry_failed",
            taskType,
            description: `Re-enqueued ${retried} of ${ids.length} failed jobs for ${taskType}`,
            metadata: { candidates: ids.length, retried, skipped, error_count: errors.length },
        });
    }

    return NextResponse.json({
        ok: true,
        task_type: taskType,
        candidates: ids.length,
        retried,
        skipped_due_to_active_duplicate: skipped,
        errors: errors.slice(0, 10),
    });
}
