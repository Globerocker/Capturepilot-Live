import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/team/invite/accept
 * Body: { token: string }
 *
 * Converts a profile_invitation into a profile_members row for the currently
 * authenticated user. The invite page redirects here after the user signs in /
 * signs up. Token-only lookup plus email match ensures the right person accepts.
 */
export async function POST(req: NextRequest) {
    const cookieStore = await cookies();
    const authSupabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await authSupabase.auth.getUser();
    if (!user || !user.email) return NextResponse.json({ error: "Sign in to accept" }, { status: 401 });

    const body = await req.json().catch(() => ({})) as { token?: string };
    if (!body.token) return NextResponse.json({ error: "token required" }, { status: 400 });

    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
    const { data: inv } = await admin
        .from("profile_invitations")
        .select("id, profile_id, email, role, feature_access, expires_at, accepted_at")
        .eq("token", body.token)
        .maybeSingle();
    const invitation = inv as {
        id: string; profile_id: string; email: string; role: string;
        feature_access: Record<string, boolean>; expires_at: string; accepted_at: string | null;
    } | null;
    if (!invitation) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    if (invitation.accepted_at) return NextResponse.json({ error: "Already accepted" }, { status: 410 });
    if (invitation.expires_at < new Date().toISOString()) {
        return NextResponse.json({ error: "Invitation has expired" }, { status: 410 });
    }
    if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
        return NextResponse.json({
            error: "This invitation is for a different email address. Sign in with " + invitation.email,
        }, { status: 403 });
    }

    // Insert the membership. Unique constraint (profile_id, auth_user_id)
    // prevents duplicates when the same user accepts twice.
    const { error: memberErr } = await admin.from("profile_members").upsert({
        profile_id: invitation.profile_id,
        auth_user_id: user.id,
        role: invitation.role,
        feature_access: invitation.feature_access,
        accepted_at: new Date().toISOString(),
    }, { onConflict: "profile_id,auth_user_id" });
    if (memberErr) return NextResponse.json({ error: memberErr.message }, { status: 500 });

    await admin.from("profile_invitations")
        .update({ accepted_at: new Date().toISOString() })
        .eq("id", invitation.id);

    return NextResponse.json({ success: true, profile_id: invitation.profile_id });
}
