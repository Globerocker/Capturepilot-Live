import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/admin/outreach/prospects/bulk
 * Body: { action: "bulk_approve" | "bulk_reject", ids: string[], rejection_reason?: string }
 *
 * Applies the same status change to many prospects in one round-trip. Used by
 * the "Approve N / Reject N" action bar when the admin has checkboxes selected.
 */
export async function POST(req: NextRequest) {
    const cookieStore = await cookies();
    const authSupabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await authSupabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
    const { data: profRow } = await admin.from("user_profiles").select("account_type").eq("auth_user_id", user.id).maybeSingle();
    const prof = profRow as { account_type: string } | null;
    if (!prof || prof.account_type !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

    const body = await req.json().catch(() => ({})) as {
        action?: string; ids?: string[]; rejection_reason?: string;
    };
    if (!body.action || !Array.isArray(body.ids) || body.ids.length === 0) {
        return NextResponse.json({ error: "action + ids required" }, { status: 400 });
    }
    const update: Record<string, unknown> = {
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
    if (body.action === "bulk_approve") update.status = "approved";
    else if (body.action === "bulk_reject") {
        update.status = "rejected";
        if (body.rejection_reason) update.rejection_reason = body.rejection_reason;
    } else return NextResponse.json({ error: "unknown action" }, { status: 400 });

    const { error, count } = await admin.from("outreach_prospects")
        .update(update, { count: "exact" }).in("id", body.ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ updated: count || 0 });
}
