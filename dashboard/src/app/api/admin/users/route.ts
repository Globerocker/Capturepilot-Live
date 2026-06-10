import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";

function getAdmin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );
}

/**
 * GET /api/admin/users — List all auth users with profiles
 */
export async function GET() {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    try {
        const admin = getAdmin();
        const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        const users = await Promise.all(
            (data.users || []).map(async (u) => {
                const { data: profile } = await admin
                    .from("user_profiles")
                    .select("id, company_name, account_type, client_status, onboarding_complete")
                    .eq("auth_user_id", u.id)
                    .single();
                return {
                    auth_id: u.id,
                    email: u.email,
                    created_at: u.created_at,
                    last_sign_in: u.last_sign_in_at,
                    email_confirmed: u.email_confirmed_at != null,
                    profile: profile || null,
                };
            })
        );

        return NextResponse.json({ users });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}

/**
 * PATCH /api/admin/users — Update user email or password
 * Body: { auth_id | user_profile_id, email?, password? }
 * If user_profile_id is given instead of auth_id, the server resolves it.
 */
export async function PATCH(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    try {
        const { auth_id: bodyAuthId, user_profile_id, email, password } = await req.json();
        const admin = getAdmin();
        let auth_id: string | null = bodyAuthId ?? null;
        if (!auth_id && user_profile_id) {
            const { data } = await admin
                .from("user_profiles")
                .select("auth_user_id")
                .eq("id", user_profile_id)
                .single();
            auth_id = (data as { auth_user_id: string } | null)?.auth_user_id ?? null;
        }
        if (!auth_id) return NextResponse.json({ error: "auth_id or user_profile_id required" }, { status: 400 });

        const update: Record<string, string> = {};
        if (email) update.email = email;
        if (password) update.password = password;

        if (Object.keys(update).length === 0) {
            return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
        }

        const { error } = await admin.auth.admin.updateUserById(auth_id, update);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        // Also update email in user_profiles if changed
        if (email) {
            await admin.from("user_profiles").update({ email }).eq("auth_user_id", auth_id);
        }

        // Log activity
        const { data: profile } = await admin
            .from("user_profiles")
            .select("id, company_name")
            .eq("auth_user_id", auth_id)
            .single();

        if (profile) {
            await admin.from("client_activity_log").insert({
                user_profile_id: profile.id,
                action: "admin_user_update",
                description: `Admin updated ${email ? "email" : ""}${email && password ? " + " : ""}${password ? "password" : ""} for ${profile.company_name}`,
            });
        }

        return NextResponse.json({ success: true, updated: Object.keys(update) });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}

/**
 * DELETE /api/admin/users — Delete user (auth + profile)
 * Body: { auth_id | user_profile_id }
 * Caller can pass either; the server resolves user_profile_id → auth_user_id.
 * The auth.admin.deleteUser cascade should remove the profile row if FK
 * has ON DELETE CASCADE; if not, we also delete it explicitly.
 */
export async function DELETE(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    try {
        const { auth_id: bodyAuthId, user_profile_id } = await req.json();
        const admin = getAdmin();
        let auth_id: string | null = bodyAuthId ?? null;
        let profileId: string | null = user_profile_id ?? null;
        let companyName: string | null = null;

        // Resolve auth_id from profile if needed, and grab profile id + company
        // for the activity log + the post-delete profile cleanup.
        if (!auth_id && profileId) {
            const { data } = await admin
                .from("user_profiles")
                .select("auth_user_id, company_name")
                .eq("id", profileId)
                .single();
            const row = data as { auth_user_id: string; company_name: string | null } | null;
            auth_id = row?.auth_user_id ?? null;
            companyName = row?.company_name ?? null;
        } else if (auth_id && !profileId) {
            const { data } = await admin
                .from("user_profiles")
                .select("id, company_name")
                .eq("auth_user_id", auth_id)
                .maybeSingle();
            const row = data as { id: string; company_name: string | null } | null;
            profileId = row?.id ?? null;
            companyName = row?.company_name ?? null;
        }
        if (!auth_id) return NextResponse.json({ error: "auth_id or user_profile_id required" }, { status: 400 });

        const { error } = await admin.auth.admin.deleteUser(auth_id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        // Explicit profile cleanup in case the auth FK isn't ON DELETE CASCADE.
        if (profileId) {
            await admin.from("user_profiles").delete().eq("id", profileId);
            // Best-effort audit log on a synthetic row (the FK target is gone,
            // so the insert may fail — swallow the error).
            await admin.from("client_activity_log").insert({
                user_profile_id: profileId,
                action: "user_deleted",
                description: `Admin deleted account for ${companyName || auth_id}`,
                metadata: { deleted_auth_id: auth_id, company_name: companyName },
            }).then(() => null, () => null);
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
