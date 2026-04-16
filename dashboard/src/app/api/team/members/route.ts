import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

async function authedOwnerProfile() {
    const cookieStore = await cookies();
    const authSupabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await authSupabase.auth.getUser();
    if (!user) return null;
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
    const { data: p } = await admin
        .from("user_profiles")
        .select("id, company_name, plan_tier, contact_name")
        .eq("auth_user_id", user.id)
        .maybeSingle();
    const profile = p as { id: string; company_name: string; plan_tier: string | null; contact_name: string | null } | null;
    if (!profile) return null;
    return { admin, user, profile };
}

/**
 * GET /api/team/members — returns accepted members + pending invitations
 * for the authenticated owner's company profile.
 */
export async function GET() {
    const ctx = await authedOwnerProfile();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { admin, profile } = ctx;

    const [membersRes, invitesRes] = await Promise.all([
        admin.from("profile_members")
            .select("id, auth_user_id, role, feature_access, invited_at, accepted_at")
            .eq("profile_id", profile.id)
            .order("invited_at", { ascending: true }),
        admin.from("profile_invitations")
            .select("id, email, role, feature_access, invited_at, expires_at")
            .eq("profile_id", profile.id)
            .is("accepted_at", null)
            .gt("expires_at", new Date().toISOString())
            .order("invited_at", { ascending: false }),
    ]);

    // Hydrate member emails from auth.admin (service role).
    const members = (membersRes.data || []) as Array<{ auth_user_id: string; role: string; id: string; feature_access: Record<string, boolean>; invited_at: string; accepted_at: string | null }>;
    const hydrated = await Promise.all(members.map(async m => {
        const { data: { user } } = await admin.auth.admin.getUserById(m.auth_user_id);
        return { ...m, email: user?.email || null };
    }));

    return NextResponse.json({
        members: hydrated,
        invitations: invitesRes.data || [],
        owner_email: ctx.user.email,
        owner_name: profile.contact_name,
        company_name: profile.company_name,
        plan_tier: profile.plan_tier,
    });
}
