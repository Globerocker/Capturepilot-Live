import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { getAutoPursuitRecommendations } from "@/lib/auto-pursuit-recommend";

export async function GET() {
    const cookieStore = await cookies();
    const authSupabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } },
    );

    const { data: { user } } = await authSupabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );

    const { data: profile } = await sb
        .from("user_profiles")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();

    if (!profile) {
        return NextResponse.json({ recommendations: [] });
    }

    try {
        const recommendations = await getAutoPursuitRecommendations(
            (profile as { id: string }).id,
            5,
            sb,
        );
        return NextResponse.json({ recommendations });
    } catch (err) {
        console.error("auto-pursuit recommendations failed", err);
        return NextResponse.json(
            { error: "Failed to generate recommendations" },
            { status: 500 },
        );
    }
}
