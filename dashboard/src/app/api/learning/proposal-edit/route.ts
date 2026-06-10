import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 10;

const MAX_SECTION_BYTES = 60_000;

/**
 * POST /api/learning/proposal-edit
 * Body: {
 *   proposal_job_id: string,
 *   section_name: string,
 *   original_text: string,
 *   edited_text: string
 * }
 *
 * Auth-gated. Verifies the proposal_job belongs to the caller before writing.
 * Skipped silently when original == edited (no-op).
 */
export async function POST(req: NextRequest) {
    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const proposalJobId = typeof body.proposal_job_id === "string" ? body.proposal_job_id : "";
    const sectionName = typeof body.section_name === "string" ? body.section_name.slice(0, 200) : "";
    const originalText = typeof body.original_text === "string" ? body.original_text : "";
    const editedText = typeof body.edited_text === "string" ? body.edited_text : "";

    if (!proposalJobId || !sectionName) {
        return NextResponse.json({ error: "proposal_job_id and section_name required" }, { status: 400 });
    }
    if (originalText === editedText) {
        return NextResponse.json({ success: true, skipped: "no_change" });
    }
    if (originalText.length > MAX_SECTION_BYTES || editedText.length > MAX_SECTION_BYTES) {
        return NextResponse.json({ error: "section too large" }, { status: 413 });
    }

    const cookieStore = await cookies();
    const authSupabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } },
    );
    const { data: { user } } = await authSupabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );

    const { data: profile } = await sb
        .from("user_profiles")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();

    if (!profile?.id) {
        return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    const profileId = profile.id as string;

    const { data: job, error: jErr } = await sb
        .from("proposal_jobs")
        .select("id, user_profile_id")
        .eq("id", proposalJobId)
        .single();

    if (jErr || !job || job.user_profile_id !== profileId) {
        return NextResponse.json({ error: "Proposal job not found" }, { status: 404 });
    }

    const { data: inserted, error: insErr } = await sb
        .from("proposal_edit_events")
        .insert({
            proposal_job_id: proposalJobId,
            user_profile_id: profileId,
            section_name: sectionName,
            original_text: originalText,
            edited_text: editedText,
        })
        .select("id, edit_distance")
        .single();

    if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({
        success: true,
        id: inserted?.id,
        edit_distance: inserted?.edit_distance,
    });
}
