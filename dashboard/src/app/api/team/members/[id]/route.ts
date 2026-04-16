import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

interface Ctx { params: Promise<{ id: string }> }

async function authedOwner() {
    const cookieStore = await cookies();
    const authSupabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await authSupabase.auth.getUser();
    if (!user) return null;
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
    const { data: p } = await admin.from("user_profiles").select("id").eq("auth_user_id", user.id).maybeSingle();
    const profile = p as { id: string } | null;
    if (!profile) return null;
    return { admin, profileId: profile.id };
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
    const { id } = await ctx.params;
    const auth = await authedOwner();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => ({})) as {
        role?: string; feature_access?: Record<string, boolean>;
    };
    const update: Record<string, unknown> = {};
    if (body.role && ["admin", "member", "viewer"].includes(body.role)) update.role = body.role;
    if (body.feature_access && typeof body.feature_access === "object") update.feature_access = body.feature_access;
    const { data, error } = await auth.admin.from("profile_members")
        .update(update)
        .eq("id", id)
        .eq("profile_id", auth.profileId)
        .select("id, role, feature_access")
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ member: data });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
    const { id } = await ctx.params;
    const auth = await authedOwner();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { error } = await auth.admin.from("profile_members")
        .delete()
        .eq("id", id)
        .eq("profile_id", auth.profileId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ deleted: true });
}
