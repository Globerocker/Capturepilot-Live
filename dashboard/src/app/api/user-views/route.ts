import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

async function authedProfile() {
    const cookieStore = await cookies();
    const authSupabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await authSupabase.auth.getUser();
    if (!user) return null;
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
    const { data } = await admin.from("user_profiles").select("id").eq("auth_user_id", user.id).maybeSingle();
    const profile = data as { id: string } | null;
    if (!profile) return null;
    return { admin, profileId: profile.id };
}

/**
 * GET /api/user-views?page=matches|opportunities — list saved views
 * POST  — body: { page, name, filter_state }          create
 */
export async function GET(req: NextRequest) {
    const auth = await authedProfile();
    if (!auth) return NextResponse.json({ views: [] });
    const page = req.nextUrl.searchParams.get("page");
    if (!page || !["matches", "opportunities"].includes(page)) {
        return NextResponse.json({ error: "page must be matches|opportunities" }, { status: 400 });
    }
    const { data } = await auth.admin.from("user_views")
        .select("id, name, filter_state, sort_order, created_at, updated_at")
        .eq("user_profile_id", auth.profileId)
        .eq("page", page)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
    return NextResponse.json({ views: data || [] });
}

export async function POST(req: NextRequest) {
    const auth = await authedProfile();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => ({})) as {
        page?: string; name?: string; filter_state?: Record<string, unknown>;
    };
    if (!body.page || !["matches", "opportunities"].includes(body.page)) {
        return NextResponse.json({ error: "page must be matches|opportunities" }, { status: 400 });
    }
    if (!body.name || body.name.trim().length === 0) {
        return NextResponse.json({ error: "name required" }, { status: 400 });
    }

    // Put new view at the end of the order list.
    const { data: maxRow } = await auth.admin.from("user_views")
        .select("sort_order")
        .eq("user_profile_id", auth.profileId)
        .eq("page", body.page)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
    const nextOrder = ((maxRow as { sort_order?: number } | null)?.sort_order ?? -1) + 1;

    const { data, error } = await auth.admin.from("user_views")
        .insert({
            user_profile_id: auth.profileId,
            page: body.page,
            name: body.name.trim().slice(0, 80),
            filter_state: body.filter_state || {},
            sort_order: nextOrder,
        })
        .select("id, name, filter_state, sort_order")
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ view: data });
}
