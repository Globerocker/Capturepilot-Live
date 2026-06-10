/**
 * Admin auth gate.
 *
 * Use at the top of every `/api/admin/**` handler:
 *
 *     const unauth = await assertAdmin();
 *     if (unauth) return unauth;
 *
 * Returns `null` on success, or a `NextResponse` with 401/403 to bubble
 * straight back to the client.
 */
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

function noopCookies() {
    return {
        get() {
            return undefined;
        },
        set() {
            /* no-op for read-only routes */
        },
        remove() {
            /* no-op */
        },
    };
}

async function getSupabase() {
    try {
        const cookieStore = await cookies();
        return createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    get(name: string) {
                        return cookieStore.get(name)?.value;
                    },
                    set() {
                        /* read-only — ignore */
                    },
                    remove() {
                        /* read-only — ignore */
                    },
                },
            }
        );
    } catch {
        // Some Next.js contexts don't expose cookies() — fall back to anon client.
        return createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { cookies: noopCookies() }
        );
    }
}

export interface AdminCaller {
    userId: string;
    email: string | null;
}

/**
 * Returns null on success, or a 401/403 NextResponse on failure.
 * Caller pattern:
 *     const unauth = await assertAdmin();
 *     if (unauth) return unauth;
 */
export async function assertAdmin(): Promise<NextResponse | null> {
    const result = await assertAdminWithUser();
    return "userId" in result ? null : result;
}

/**
 * Same gate, but returns the caller's id/email on success so the handler
 * can audit-log who took the action.
 */
export async function assertAdminWithUser(): Promise<AdminCaller | NextResponse> {
    const supabase = await getSupabase();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check admin via service role to bypass any RLS quirks.
    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: profile } = await admin
        .from("user_profiles")
        .select("account_type")
        .eq("auth_user_id", user.id)
        .maybeSingle();

    if (!profile || profile.account_type !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return { userId: user.id, email: user.email ?? null };
}
