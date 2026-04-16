import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

interface Ctx { params: Promise<{ id: string }> }

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
 * PATCH /api/user-views/[id] — rename, update filter_state, or reorder.
 * Body shape: { name?, filter_state?, sort_order? }
 * DELETE /api/user-views/[id] — remove the view.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
    const auth = await authedProfile();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({})) as {
        name?: string; filter_state?: Record<string, unknown>; sort_order?: number;
    };
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.name === "string") update.name = body.name.trim().slice(0, 80);
    if (body.filter_state && typeof body.filter_state === "object") update.filter_state = body.filter_state;
    if (typeof body.sort_order === "number") update.sort_order = body.sort_order;
    const { data, error } = await auth.admin.from("user_views")
        .update(update)
        .eq("id", id)
        .eq("user_profile_id", auth.profileId)
        .select("id, name, filter_state, sort_order")
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ view: data });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
    const auth = await authedProfile();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await ctx.params;
    const { error } = await auth.admin.from("user_views")
        .delete()
        .eq("id", id)
        .eq("user_profile_id", auth.profileId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ deleted: true });
}
