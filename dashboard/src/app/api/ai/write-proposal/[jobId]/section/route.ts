/**
 * Patch a single section of a completed proposal_job.
 *
 * PATCH /api/ai/write-proposal/[jobId]/section
 *   body: { section_title: "Technical Approach", content: "<updated text>" }
 *
 * Auth: must be the job's owner (looked up via user_profiles).
 *
 * Updates both `sections_completed[*].content` AND `result.sections[*].content`
 * so the next download builds the edited proposal, and the live-preview UI
 * keeps showing the edit on reload.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ jobId: string }> }) {
    const { jobId } = await ctx.params;
    if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });

    const cookieStore = await cookies();
    const sb = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() { return cookieStore.getAll(); },
                setAll() { /* read-only */ },
            },
        },
    );
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body: { section_title?: string; content?: string } = {};
    try { body = await req.json(); } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const title = body.section_title?.trim();
    const content = body.content;
    if (!title || typeof content !== "string") {
        return NextResponse.json({ error: "section_title + content required" }, { status: 400 });
    }
    if (content.length > 80_000) {
        return NextResponse.json({ error: "Section too long (>80k chars)" }, { status: 400 });
    }

    const db = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    // Resolve the owning profile id, then verify the job belongs to it.
    const { data: profile } = await sb
        .from("user_profiles")
        .select("id")
        .eq("auth_user_id", user.id)
        .maybeSingle();
    const profileId = (profile as { id?: string } | null)?.id;
    if (!profileId) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    const { data: job, error: jobErr } = await db
        .from("proposal_jobs")
        .select("id, user_profile_id, sections_completed, result")
        .eq("id", jobId)
        .single();
    if (jobErr || !job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    if ((job as { user_profile_id?: string }).user_profile_id !== profileId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    type SectionWithContent = { title: string; content?: string; word_count?: number; completed_at?: string; edited_at?: string };
    const sectionsCompleted = ((job as { sections_completed?: SectionWithContent[] }).sections_completed || []).slice();
    const result = ((job as { result?: { sections?: SectionWithContent[] } }).result) || {};
    const resultSections = (result.sections || []).slice();

    const wordCount = content.split(/\s+/).filter(Boolean).length;
    const editedAt = new Date().toISOString();

    let patched = false;
    for (let i = 0; i < sectionsCompleted.length; i++) {
        if (sectionsCompleted[i]!.title === title) {
            sectionsCompleted[i] = {
                ...sectionsCompleted[i]!,
                content,
                word_count: wordCount,
                edited_at: editedAt,
            };
            patched = true;
            break;
        }
    }
    for (let i = 0; i < resultSections.length; i++) {
        if (resultSections[i]!.title === title) {
            resultSections[i] = {
                ...resultSections[i]!,
                content,
                word_count: wordCount,
                edited_at: editedAt,
            };
            break;
        }
    }
    if (!patched) {
        return NextResponse.json({ error: `Section "${title}" not found in job` }, { status: 404 });
    }

    const { error: upErr } = await db
        .from("proposal_jobs")
        .update({
            sections_completed: sectionsCompleted,
            result: { ...result, sections: resultSections },
            updated_at: editedAt,
        })
        .eq("id", jobId);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    return NextResponse.json({ success: true, word_count: wordCount, edited_at: editedAt });
}
