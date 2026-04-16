import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

interface Ctx { params: Promise<{ id: string }> }

export async function DELETE(_req: NextRequest, ctx: Ctx) {
    const { id } = await ctx.params;
    const cookieStore = await cookies();
    const authSupabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await authSupabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
    const { data: p } = await admin.from("user_profiles").select("id").eq("auth_user_id", user.id).maybeSingle();
    const profile = p as { id: string } | null;
    if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

    const { error } = await admin.from("profile_invitations")
        .delete()
        .eq("id", id)
        .eq("profile_id", profile.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ deleted: true });
}
