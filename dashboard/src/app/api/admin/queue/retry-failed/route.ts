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
    const taskType = url.searchParams.get("task_type")?.trim();
    if (!taskType) {
        return NextResponse.json({ error: "task_type required" }, { status: 400 });
    }

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    // Pull failed row ids first so we can iterate and tolerate dedup
    // collisions row-by-row (a single bulk UPDATE would abort on the first
    // conflict and roll back the whole transaction).
    const { data: failed, error: selErr } = await sb
        .from("worker_jobs")
        .select("id")
        .eq("task_type", taskType)
        .eq("status", "failed")
        .limit(10_000);

    if (selErr) {
        return NextResponse.json({ error: selErr.message }, { status: 500 });
    }
    const ids = (failed || []).map(r => r.id as string);

    let retried = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Process in batches of 200 — each row is its own update so the
    // partial unique constraint can reject duplicates individually.
    for (const id of ids) {
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
            }
        } else {
            retried++;
        }
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
