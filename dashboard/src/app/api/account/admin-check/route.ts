import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * GET /api/account/admin-check
 *
 * Tiny endpoint that the AdminViewSwitcher banner pings on every customer-
 * facing page load. Returns whether the current session belongs to an
 * admin so the banner can offer a "back to admin" shortcut.
 *
 * Returns 200 with { isAdmin: false } on any failure rather than throwing
 * — the banner is purely informational and never gating anything.
 */

export async function GET() {
    try {
        const cookieStore = await cookies();
        const sb = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { cookies: { getAll: () => cookieStore.getAll() } },
        );
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return NextResponse.json({ isAdmin: false, adminEmail: null });

        const admin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_KEY!,
            { auth: { persistSession: false } },
        );
        const { data: profile } = await admin
            .from("user_profiles")
            .select("account_type")
            .eq("auth_user_id", user.id)
            .maybeSingle();
        const isAdmin = (profile as { account_type?: string } | null)?.account_type === "admin";
        return NextResponse.json({
            isAdmin,
            adminEmail: isAdmin ? (user.email ?? null) : null,
        });
    } catch {
        return NextResponse.json({ isAdmin: false, adminEmail: null });
    }
}
