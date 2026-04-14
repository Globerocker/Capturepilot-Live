import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const maxDuration = 15;

/**
 * GET /api/ai/write-proposal/status/:jobId
 *
 * Returns the current state of a background proposal generation job.
 * Auth: user must own the job (by user_profile_id → auth_user_id).
 *
 * Response:
 * {
 *   id, status, notice_id,
 *   total_sections, completed_sections, current_section,
 *   sections_completed: [{ title, word_count, completed_at }],
 *   sections_errored: [{ section, error }],
 *   error, created_at, completed_at,
 *   result?: <only present when status === 'completed'>
 * }
 */
export async function GET(
    _req: NextRequest,
    ctx: { params: Promise<{ jobId: string }> },
) {
    const { jobId } = await ctx.params;
    if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });

    try {
        // Authenticate the caller
        const authed = await createSupabaseServerClient();
        const { data: { user } } = await authed.auth.getUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { data: profile } = await authed.from("user_profiles")
            .select("id")
            .eq("auth_user_id", user.id)
            .single();

        if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
        const userProfileId = (profile as { id: string }).id;

        // Use service role to read the job, then double-check ownership
        const db = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_KEY!,
        );
        const { data: job, error } = await db.from("proposal_jobs")
            .select("id, user_profile_id, notice_id, status, sections_requested, sections_completed, sections_errored, current_section, total_sections, completed_sections, error, created_at, updated_at, completed_at, result")
            .eq("id", jobId)
            .single();

        if (error || !job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

        const j = job as Record<string, unknown>;
        if (j.user_profile_id !== userProfileId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        return NextResponse.json({
            id: j.id,
            notice_id: j.notice_id,
            status: j.status,
            sections_requested: j.sections_requested || [],
            sections_completed: j.sections_completed || [],
            sections_errored: j.sections_errored || [],
            current_section: j.current_section,
            total_sections: j.total_sections,
            completed_sections: j.completed_sections || 0,
            error: j.error,
            created_at: j.created_at,
            updated_at: j.updated_at,
            completed_at: j.completed_at,
            // Only include the heavy result payload when complete
            result: j.status === "completed" ? j.result : undefined,
        });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
