/**
 * GET /api/matches/refresh/status/[jobId]
 *
 * Polled by the dashboard's "Refresh Matches" button while a rescore job is
 * in flight. Returns the current status and (once finished) the per-class
 * counts written by `rescoreUserMatches`.
 *
 * Auth model: the caller must be signed in AND the job's payload.user_profile_id
 * must match their own profile id. Stops one user from polling another's job.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function GET(
    req: NextRequest,
    ctx: { params: Promise<{ jobId: string }> },
) {
    const { jobId } = await ctx.params;
    if (!jobId) {
        return NextResponse.json({ error: "missing jobId" }, { status: 400 });
    }

    // Auth check
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

    // Service-key client for worker_jobs lookup (RLS allows service_role only).
    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );

    // Resolve the caller's profile id for the ownership check below.
    const { data: profile } = await sb
        .from("user_profiles")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();
    if (!profile) {
        return NextResponse.json({ error: "No profile found" }, { status: 404 });
    }
    const callerProfileId = (profile as { id: string }).id;

    const { data: job, error } = await sb
        .from("worker_jobs")
        .select("id, task_type, status, payload, result, error_message, created_at, started_at, finished_at")
        .eq("id", jobId)
        .maybeSingle();
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!job) {
        return NextResponse.json({ error: "job not found" }, { status: 404 });
    }

    const j = job as {
        id: string;
        task_type: string;
        status: string;
        payload: Record<string, unknown>;
        result: Record<string, unknown> | null;
        error_message: string | null;
        created_at: string;
        started_at: string | null;
        finished_at: string | null;
    };

    // Defense in depth — this endpoint is rescore-only.
    if (j.task_type !== "rescore_user_matches") {
        return NextResponse.json({ error: "wrong task type" }, { status: 400 });
    }

    // Ownership check — the job's user_profile_id must be the caller's profile.
    const jobProfileId = (j.payload as { user_profile_id?: string }).user_profile_id;
    if (jobProfileId !== callerProfileId) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    return NextResponse.json({
        job_id: j.id,
        status: j.status,
        result: j.result,
        error: j.error_message,
        created_at: j.created_at,
        started_at: j.started_at,
        finished_at: j.finished_at,
    });
}
