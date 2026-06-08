/**
 * DELETE /api/admin/queue/clear-pending?task_type=<name>&confirm=<task_type>
 *
 * Destructive. Deletes every PENDING row for the given task_type. Requires
 * the caller to repeat the task_type in the `confirm` param — the UI's typed
 * confirmation modal forwards what the user typed so we can fail-closed if
 * it doesn't match.
 *
 * Admin-only.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";

export const runtime = "nodejs";

export async function DELETE(req: NextRequest) {
    const denied = await assertAdmin();
    if (denied) return denied;

    const url = new URL(req.url);
    const taskType = url.searchParams.get("task_type")?.trim();
    const confirm = url.searchParams.get("confirm")?.trim();

    if (!taskType) {
        return NextResponse.json({ error: "task_type required" }, { status: 400 });
    }
    if (!confirm || confirm !== taskType) {
        return NextResponse.json(
            { error: "confirm param must equal the task_type to authorize deletion" },
            { status: 400 },
        );
    }

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    // Count first so we can report back. The DELETE returns the rows via
    // .select() so we get an exact count.
    const { data: deleted, error } = await sb
        .from("worker_jobs")
        .delete()
        .eq("task_type", taskType)
        .eq("status", "pending")
        .select("id");

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
        ok: true,
        task_type: taskType,
        deleted: deleted?.length || 0,
    });
}
