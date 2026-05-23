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
 * Body: { auth_id, email?, password? }
 */
export async function PATCH(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    try {
        const { auth_id, email, password } = await req.json();
        if (!auth_id) return NextResponse.json({ error: "auth_id required" }, { status: 400 });

        const admin = getAdmin();
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
 * Body: { auth_id }
 */
export async function DELETE(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    try {
        const { auth_id } = await req.json();
        if (!auth_id) return NextResponse.json({ error: "auth_id required" }, { status: 400 });

        const admin = getAdmin();
        const { error } = await admin.auth.admin.deleteUser(auth_id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
