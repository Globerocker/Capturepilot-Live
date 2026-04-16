import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

interface Ctx { params: Promise<{ id: string }> }

async function getAuthedProfile() {
    const cookieStore = await cookies();
    const authSupabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await authSupabase.auth.getUser();
    if (!user) return { error: "Unauthorized" as const, status: 401 as const };
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
    const { data: profile } = await admin
        .from("user_profiles").select("id").eq("auth_user_id", user.id).maybeSingle();
    if (!profile) return { error: "No profile" as const, status: 404 as const };
    return { admin, profileId: profile.id as string };
}

export async function GET(_req: NextRequest, ctx: Ctx) {
    const { id } = await ctx.params;
    const auth = await getAuthedProfile();
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { data, error } = await auth.admin.from("client_partners")
        .select("*").eq("id", id).eq("user_profile_id", auth.profileId).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ partner: data });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
    const { id } = await ctx.params;
    const auth = await getAuthedProfile();
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = await req.json().catch(() => ({})) as {
        status?: "active" | "potential" | "archived";
        notes?: string;
    };
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.status && ["active", "potential", "archived"].includes(body.status)) update.status = body.status;
    if (typeof body.notes === "string") update.notes = body.notes;
    const { data, error } = await auth.admin.from("client_partners")
        .update(update).eq("id", id).eq("user_profile_id", auth.profileId).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ partner: data });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
    const { id } = await ctx.params;
    const auth = await getAuthedProfile();
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { error } = await auth.admin.from("client_partners")
        .delete().eq("id", id).eq("user_profile_id", auth.profileId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ deleted: true });
}
