/**
 * Inline admin gate used by `/api/admin/outreach/*` routes.
 *
 * This is a lightweight check until the post-audit `auth-admin.ts` helper
 * lands on main. Pattern matches the rest of `/api/admin/*` in this branch.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export function getServiceClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );
}

/**
 * Returns null when the caller is an admin. Otherwise returns a 401/403
 * NextResponse the caller should bail with. Service role bypasses; we still
 * accept service-role calls from the same project's edge routes via header.
 */
export async function requireAdmin(): Promise<{ unauth: NextResponse | null; userId: string | null; email: string | null }> {
    try {
        const sb = await createSupabaseServerClient();
        const { data: { user } } = await sb.auth.getUser();

        if (!user) {
            return { unauth: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), userId: null, email: null };
        }

        const service = getServiceClient();
        const { data: profile } = await service
            .from("user_profiles")
            .select("account_type")
            .eq("auth_user_id", user.id)
            .maybeSingle();

        if (!profile || profile.account_type !== "admin") {
            return { unauth: NextResponse.json({ error: "Forbidden" }, { status: 403 }), userId: user.id, email: user.email || null };
        }

        return { unauth: null, userId: user.id, email: user.email || null };
    } catch (e: any) {
        return { unauth: NextResponse.json({ error: e?.message || "Auth error" }, { status: 500 }), userId: null, email: null };
    }
}
