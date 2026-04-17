import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

async function authedAdmin() {
    const cookieStore = await cookies();
    const authSupabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await authSupabase.auth.getUser();
    if (!user) return null;
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
    const { data } = await admin.from("user_profiles").select("id, account_type").eq("auth_user_id", user.id).maybeSingle();
    const profile = data as { id: string; account_type: string } | null;
    if (!profile || profile.account_type !== "admin") return null;
    return { admin, user };
}

/**
 * GET /api/admin/outreach/prospects?status=pending_review&state=CA&cert=8(a)&limit=50&offset=0
 *
 * Admin-only list endpoint for the review queue. Supports status/state/cert
 * filters and cursor-free pagination. Returns match_score-ranked rows so the
 * highest-fit leads land at the top of the inbox.
 */
export async function GET(req: NextRequest) {
    const ctx = await authedAdmin();
    if (!ctx) return NextResponse.json({ error: "Admin only" }, { status: 403 });

    const params = req.nextUrl.searchParams;
    const status = params.get("status") || "pending_review";
    const state = params.get("state") || "";
    const cert = params.get("cert") || "";
    const source = params.get("source") || "";
    const search = params.get("q") || "";
    const limit = Math.min(200, parseInt(params.get("limit") || "50", 10));
    const offset = parseInt(params.get("offset") || "0", 10);

    let q = ctx.admin
        .from("outreach_prospects")
        .select("*", { count: "exact" })
        .order("match_score", { ascending: false })
        .order("discovered_at", { ascending: false });

    if (status !== "all") q = q.eq("status", status);
    if (state) q = q.eq("state", state);
    if (cert) q = q.contains("certifications", [cert]);
    if (source) q = q.eq("source", source);
    if (search) q = q.or(`company_name.ilike.%${search}%,uei.ilike.%${search}%,website.ilike.%${search}%`);

    const { data, count, error } = await q.range(offset, offset + limit - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ prospects: data || [], total: count || 0 });
}
