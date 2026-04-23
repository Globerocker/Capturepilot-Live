import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * GET /api/jobs?status=running|pending
 * Returns jobs for the current user. Used by GlobalJobsIndicator to list
 * everything in-flight across the whole dashboard.
 */
export async function GET(req: NextRequest) {
    const cookieStore = await cookies();
    const sb = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } },
    );
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );

    const { data: profile } = await admin
        .from("user_profiles")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();
    if (!profile) return NextResponse.json({ jobs: [] });

    const statusParam = req.nextUrl.searchParams.get("status");
    const kindParam = req.nextUrl.searchParams.get("kind");

    let query = admin
        .from("background_jobs")
        .select("id, kind, title, status, progress_pct, current_step, completed_steps, total_steps, created_at, updated_at, error")
        .eq("user_profile_id", (profile as { id: string }).id)
        .order("updated_at", { ascending: false })
        .limit(25);

    if (statusParam) {
        const allowed = statusParam.split(",").filter((s) => ["pending","running","completed","failed","canceled"].includes(s));
        if (allowed.length > 0) query = query.in("status", allowed);
    }
    if (kindParam) query = query.eq("kind", kindParam);

    const { data: jobs, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ jobs: jobs || [] });
}
