import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Gate any /api/admin/* route to admins only.
 *
 * Usage:
 *   export async function POST(req: NextRequest) {
 *     const unauth = await assertAdmin();
 *     if (unauth) return unauth;
 *     // ...rest of handler
 *   }
 *
 * Returns:
 *   - 401 NextResponse when no session
 *   - 403 NextResponse when authed but profile.account_type !== "admin"
 *   - null when caller is an admin (proceed)
 *
 * Canonical column in user_profiles is auth_user_id (migration 001).
 */
export async function assertAdmin(): Promise<NextResponse | null> {
    const cookieStore = await cookies();
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() { return cookieStore.getAll(); },
                setAll() { /* read-only */ },
            },
        },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { data: profile } = await supabase
        .from("user_profiles")
        .select("account_type")
        .eq("auth_user_id", user.id)
        .maybeSingle();
    if (profile?.account_type !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return null;
}

/**
 * Variant that returns the admin's user_id alongside the gate result, so
 * handlers that need the caller's identity (audit logging, impersonation
 * grants) don't have to re-fetch the session.
 */
export async function assertAdminWithUser(): Promise<
    { ok: false; response: NextResponse } | { ok: true; userId: string; email: string | null }
> {
    const cookieStore = await cookies();
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() { return cookieStore.getAll(); },
                setAll() { /* read-only */ },
            },
        },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    }
    const { data: profile } = await supabase
        .from("user_profiles")
        .select("account_type")
        .eq("auth_user_id", user.id)
        .maybeSingle();
    if (profile?.account_type !== "admin") {
        return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }
    return { ok: true, userId: user.id, email: user.email ?? null };
}
