import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

interface Ctx { params: Promise<{ id: string }> }

async function authedAdmin() {
    const cookieStore = await cookies();
    const authSupabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await authSupabase.auth.getUser();
    if (!user) return null;
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
    const { data } = await admin.from("user_profiles").select("account_type").eq("auth_user_id", user.id).maybeSingle();
    const profile = data as { account_type: string } | null;
    if (!profile || profile.account_type !== "admin") return null;
    return { admin, user };
}

/**
 * PATCH /api/admin/outreach/prospects/[id]
 * Body: { status?, rejection_reason?, notes?, match_score? }
 *
 * Admin-only: approve/reject a prospect or tweak fields.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
    const { id } = await ctx.params;
    const c = await authedAdmin();
    if (!c) return NextResponse.json({ error: "Admin only" }, { status: 403 });

    const body = await req.json().catch(() => ({})) as {
        status?: string; rejection_reason?: string; notes?: string; match_score?: number;
    };
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const validStatuses = ["pending_review", "approved", "rejected", "queued", "sent", "replied", "bounced", "opted_out"];
    if (body.status && validStatuses.includes(body.status)) {
        update.status = body.status;
        update.reviewed_by = c.user.id;
        update.reviewed_at = new Date().toISOString();
    }
    if (typeof body.rejection_reason === "string") update.rejection_reason = body.rejection_reason;
    if (typeof body.notes === "string") update.notes = body.notes;
    if (typeof body.match_score === "number") update.match_score = Math.max(0, Math.min(100, body.match_score));

    const { data, error } = await c.admin.from("outreach_prospects")
        .update(update).eq("id", id).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ prospect: data });
}

