/**
 * DELETE /api/admin/queue/clear-pending?task_type=<name>&confirm=<task_type>
 *
 * Destructive. Deletes every PENDING row for the given task_type. Requires
 * the caller to repeat the task_type in the `confirm` param — the UI's typed
 * confirmation modal forwards what the user typed so we can fail-closed if
 * it doesn't match.
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

export async function DELETE(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    const url = new URL(req.url);
    const v = validateTaskType(url.searchParams.get("task_type"));
    if (!v.ok) {
        return NextResponse.json({ ok: false, error: v.error }, { status: 400 });
    }
    const taskType = v.value;

    const confirm = url.searchParams.get("confirm")?.trim();
    if (!confirm || confirm !== taskType) {
        return NextResponse.json(
            { ok: false, error: "confirm param must equal the task_type to authorize deletion" },
            { status: 400 },
        );
    }

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

    let deletedCount = 0;
    try {
        // DELETE returns the affected rows via .select() so we get an
        // exact count to report back and to log.
        const { data: deleted, error } = await sb
            .from("worker_jobs")
            .delete()
            .eq("task_type", taskType)
            .eq("status", "pending")
            .select("id");

        if (error) {
            console.error("[queue-admin clear-pending] delete error:", error.message);
            return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        }
        deletedCount = deleted?.length || 0;
    } catch (e) {
        console.error("[queue-admin clear-pending] delete threw:", (e as Error).message);
        return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
    }

    if (authUser?.id) {
        await logQueueAction(sb, {
            authUserId: authUser.id,
            action: "queue_clear_pending",
            taskType,
            description: `Deleted ${deletedCount} pending jobs for ${taskType}`,
            metadata: { deleted: deletedCount, destructive: true, confirmed: true },
        });
    }

    return NextResponse.json({
        ok: true,
        task_type: taskType,
        deleted: deletedCount,
    });
}
