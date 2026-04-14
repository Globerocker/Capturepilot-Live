import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
    DEFAULT_SECTIONS,
    loadProposalContext,
    runProposalGeneration,
} from "../route";

export const maxDuration = 300;

/**
 * POST /api/ai/write-proposal/start
 *
 * Kicks off an async AI proposal generation job.
 * Returns { jobId } immediately. The caller should then poll
 *   GET /api/ai/write-proposal/status/:jobId
 * every 2-3s to observe progress.
 *
 * Background execution strategy:
 *   We use `after()` from next/server so the HTTP response is flushed
 *   to the client before generation begins. Vercel keeps the function
 *   alive for the rest of `maxDuration`, during which we write progress
 *   to the `proposal_jobs` row section by section. The client can
 *   navigate away — progress lives in Postgres, not in the browser.
 */
export async function POST(req: NextRequest) {
    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_KEY) return NextResponse.json({ error: "OpenAI not configured" }, { status: 500 });

    try {
        const body = await req.json();
        const {
            notice_id,
            user_profile_id,
            sections: requestedSections,
            tone = "formal",
            max_pages = 10,
        } = body;

        if (!notice_id) return NextResponse.json({ error: "notice_id required" }, { status: 400 });
        if (!user_profile_id) return NextResponse.json({ error: "user_profile_id required" }, { status: 400 });

        const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

        // Validate context early (capability statement, opp exists, etc.) so the
        // user gets immediate feedback rather than a failed background job.
        const ctx = await loadProposalContext(db, notice_id, user_profile_id);
        if (!ctx.ok) {
            return NextResponse.json(ctx.body, { status: ctx.status });
        }

        const sectionsToWrite: string[] = Array.isArray(requestedSections) && requestedSections.length > 0
            ? requestedSections
            : DEFAULT_SECTIONS;

        // Create the job row
        const { data: job, error: jobErr } = await db.from("proposal_jobs").insert({
            user_profile_id,
            notice_id,
            status: "pending",
            sections_requested: sectionsToWrite,
            total_sections: sectionsToWrite.length,
            completed_sections: 0,
            tone,
            max_pages,
        }).select("id").single();

        if (jobErr || !job) {
            console.error("[write-proposal/start] Failed to create job:", jobErr);
            return NextResponse.json({ error: "Failed to create job" }, { status: 500 });
        }

        const jobId = (job as { id: string }).id;

        // Fire-and-forget the generation after response is sent
        after(async () => {
            try {
                const { writtenSections, sectionErrors, complianceMatrix, totalWords } = await runProposalGeneration({
                    openAIKey: OPENAI_KEY,
                    db,
                    notice_id,
                    oppContext: ctx.oppContext,
                    companyContext: ctx.companyContext,
                    descText: ctx.descText,
                    opp: ctx.opp,
                    sectionsToWrite,
                    tone,
                    max_pages,
                    jobId,
                });

                if (writtenSections.length === 0) {
                    await db.from("proposal_jobs").update({
                        status: "failed",
                        error: "No sections could be written",
                        sections_errored: sectionErrors,
                        completed_at: new Date().toISOString(),
                        current_section: null,
                    }).eq("id", jobId);
                    return;
                }

                const payload = {
                    success: true,
                    proposal_title: `Proposal Response: ${ctx.opp.title}`,
                    agency: ctx.opp.agency,
                    sections: writtenSections,
                    compliance_matrix: complianceMatrix,
                    total_word_count: totalWords,
                    estimated_pages: Math.ceil(totalWords / 250),
                };

                await db.from("proposal_jobs").update({
                    status: "completed",
                    result: payload,
                    sections_errored: sectionErrors,
                    completed_sections: writtenSections.length,
                    completed_at: new Date().toISOString(),
                    current_section: null,
                }).eq("id", jobId);
            } catch (err) {
                console.error("[write-proposal/start] Background generation threw:", err);
                await db.from("proposal_jobs").update({
                    status: "failed",
                    error: (err as Error).message || "Unknown error",
                    completed_at: new Date().toISOString(),
                    current_section: null,
                }).eq("id", jobId);
            }
        });

        return NextResponse.json({
            success: true,
            jobId,
            status: "pending",
            total_sections: sectionsToWrite.length,
        });

    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
