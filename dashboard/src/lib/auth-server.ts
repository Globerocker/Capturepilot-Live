import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolve the authenticated caller for a server route.
 *
 * Returns either:
 *   - `{ user, sb, profile }` when the caller is signed in (profile may be null
 *     if they haven't completed onboarding)
 *   - a 401 `NextResponse` when no session is present
 *
 * Usage:
 *   const auth = await requireUser();
 *   if (auth instanceof NextResponse) return auth;
 *   const { user, sb, profile } = auth;
 */
export type AuthedUser = {
    user: { id: string; email: string | undefined; app_metadata: Record<string, unknown> };
    sb: SupabaseClient;
    profile: { id: string; auth_user_id: string } | null;
};

export async function requireUser(): Promise<AuthedUser | NextResponse> {
    const sb = await createSupabaseServerClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { data: profile } = await sb
        .from("user_profiles")
        .select("id, auth_user_id")
        .eq("auth_user_id", user.id)
        .single();

    return {
        user: { id: user.id, email: user.email, app_metadata: user.app_metadata },
        sb,
        profile: profile ?? null,
    };
}
