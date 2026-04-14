import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ jobId: string }> }
) {
    const { jobId } = await params;

    const sb = await createSupabaseServerClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data: profile } = await admin
        .from("user_profiles")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();
    if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

    const profileId = (profile as unknown as { id: string }).id;

    const { data: job, error } = await admin
        .from("attachment_analysis_jobs")
        .select("*")
        .eq("id", jobId)
        .eq("user_profile_id", profileId)
        .single();

    if (error || !job) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const j = job as unknown as Record<string, unknown>;

    // Count extracted non-null requirement fields
    let requirementCount = 0;
    const extracted = j.extracted_requirements as Record<string, unknown> | null;
    if (extracted && typeof extracted === "object") {
        for (const [, v] of Object.entries(extracted)) {
            if (v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)) {
                requirementCount++;
            }
        }
    }

    return NextResponse.json({
        id: j.id,
        notice_id: j.notice_id,
        status: j.status,
        files_total: j.files_total,
        files_done: j.files_done,
        current_file: j.current_file,
        extracted_requirements: j.extracted_requirements,
        requirement_count: requirementCount,
        error: j.error,
        created_at: j.created_at,
        completed_at: j.completed_at,
    });
}
