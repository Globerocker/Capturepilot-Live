import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

/**
 * Account deletion request / cancel / status endpoints.
 *
 * POST   /api/account/delete-request           — create or refresh a request
 * GET    /api/account/delete-request           — current pending request (or null)
 * DELETE /api/account/delete-request           — cancel a pending request
 *
 * Requests sit in `account_deletion_requests` with a 7-day grace window.
 * The db_cleanup cron (Sunday 04:00 UTC) processes any requests whose
 * grace_window_ends_at has elapsed — hard-deletes the auth user, which
 * cascades to user_profiles, which cascades to every owned row.
 */

function svc() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

async function getUserAndProfile() {
    const cookieStore = await cookies();
    const sb = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } },
    );
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return null;
    const admin = svc();
    const { data: profile } = await admin
        .from("user_profiles")
        .select("id")
        .eq("auth_user_id", user.id)
        .maybeSingle();
    return { user, admin, profileId: (profile as { id: string } | null)?.id ?? null };
}

export async function POST(req: NextRequest) {
    const ctx = await getUserAndProfile();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body: { reason?: string } = {};
    try { body = await req.json(); } catch { /* empty body ok */ }

    const sevenDays = new Date(Date.now() + 7 * 86400_000).toISOString();
    const { data, error } = await ctx.admin
        .from("account_deletion_requests")
        .upsert({
            auth_user_id: ctx.user.id,
            user_profile_id: ctx.profileId,
            requested_at: new Date().toISOString(),
            grace_window_ends_at: sevenDays,
            cancelled_at: null,
            completed_at: null,
            reason: body.reason || null,
        }, { onConflict: "auth_user_id" })
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Mirror the request to the activity log so admins see it on the
    // /admin/clients/[id] activity tab without needing a separate widget.
    if (ctx.profileId) {
        await ctx.admin.from("client_activity_log").insert({
            user_profile_id: ctx.profileId,
            actor_id: ctx.user.id,
            action: "deletion",
            description: "Account deletion requested — 7 day grace window",
            metadata: { grace_window_ends_at: sevenDays },
        });
    }

    return NextResponse.json({
        request: data,
        grace_window_ends_at: sevenDays,
        message: "Deletion scheduled. You can cancel any time before " + sevenDays + ".",
    });
}

export async function GET() {
    const ctx = await getUserAndProfile();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data } = await ctx.admin
        .from("account_deletion_requests")
        .select("*")
        .eq("auth_user_id", ctx.user.id)
        .is("completed_at", null)
        .is("cancelled_at", null)
        .maybeSingle();

    return NextResponse.json({ request: data || null });
}

export async function DELETE() {
    const ctx = await getUserAndProfile();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { error } = await ctx.admin
        .from("account_deletion_requests")
        .update({ cancelled_at: new Date().toISOString() })
        .eq("auth_user_id", ctx.user.id)
        .is("completed_at", null)
        .is("cancelled_at", null);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (ctx.profileId) {
        await ctx.admin.from("client_activity_log").insert({
            user_profile_id: ctx.profileId,
            actor_id: ctx.user.id,
            action: "deletion_cancelled",
            description: "Account deletion request cancelled before grace window",
        });
    }

    return NextResponse.json({ ok: true });
}
