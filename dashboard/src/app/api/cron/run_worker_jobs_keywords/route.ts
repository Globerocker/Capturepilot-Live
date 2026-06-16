/**
 * Dedicated drain route for the extract_keywords + classify_naics lanes.
 *
 * Counterpart to /api/cron/run_worker_jobs that ONLY claims keyword +
 * classify_naics jobs. Split out (2026-06-10) because claim_jobs() orders by
 * priority DESC, created_at ASC. The extract_structured_reqs_federal lane was
 * bumped to priority 8 in migration 131; with 11K+ priority-8 jobs always
 * available, the shared consumer never reaches priority-7 classify_naics or
 * priority-6 extract_keywords. Result: 17.6K keyword jobs and 13K NAICS
 * classify jobs starved for 14 days, every new opportunity ingested with
 * empty ai_keywords + missing naics_code → degraded match scoring across
 * the entire product.
 *
 * This route:
 *   - Claims ONLY task_type IN ('extract_keywords', 'classify_naics')
 *   - batch_size=150 so the 31K backlog drains fast (each job is ~1-2s,
 *     description-only LLM call with no fetch). Phase-A bump (2026-06-10):
 *     was 50, now 150 to clear the 17.9K extract_keywords + 13.2K
 *     classify_naics queue in under a day.
 *   - maxDuration=300 (Vercel Pro ceiling) so a single run can chew through
 *     ~150-300 jobs depending on LLM latency.
 *   - Reuses the per-task handlers from run_worker_jobs/route.ts by
 *     duplicating the logic inline (self-contained handlers, no shared
 *     module yet — same pattern as run_worker_jobs_attachments).
 *
 * Scheduled every 5 min in vercel.json. Drain math (post-bump):
 *   ~150 jobs/run × 12 runs/hour × 24h ≈ 43,200/day.
 *   31K backlog ÷ 43,200 ≈ <1 day to drain.
 *   Once backlog clears, new fan-out enqueues 3-5 jobs per opp insert —
 *   easily handled at this cadence.
 *
 * Emergency drain: POST /api/admin/drain_keywords_now nukes a one-shot
 * batch inline (admin-only) when the queue grows again unexpectedly.
 *
 * Notes:
 *   - Stale-running reap is handled by the shared consumer (run_worker_jobs)
 *     — no need to duplicate the RPC here (it would race on the same rows).
 *   - Cookie warmer top-up is shared-consumer territory.
 *   - No cleanup logic — handlers themselves are idempotent (skip if
 *     already_extracted).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";
import { classifyNaics } from "@/lib/classify-naics";
import { extractAiKeywords } from "@/lib/extract-ai-keywords";
import { withCronTelemetry } from "@/lib/cron-telemetry";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SbAny = SupabaseClient<any, any, any>;

export const runtime = "nodejs";
// 300s = Vercel Pro plan ceiling. batch_size=150 × ~2s/job = ~300s worst case.
export const maxDuration = 300;

type Job = {
    id: string;
    task_type: string;
    payload: Record<string, unknown>;
    attempts: number;
    max_attempts: number;
};

// Mirrors handleClassifyNaics in run_worker_jobs/route.ts. Kept inline so this
// drain route stays isolated — any change to classify logic must apply in BOTH.
async function handleClassifyNaics(sb: SbAny, job: Job) {
    const oppId = job.payload.opp_id as string;
    if (!oppId) return { error: "missing opp_id" };
    const { data: opp } = await sb.from("opportunities")
        .select("title, description, naics_code")
        .eq("id", oppId)
        .maybeSingle() as { data: { title: string | null; description: string | null; naics_code: string | null } | null };
    if (!opp) return { result: { skipped: "opp_deleted" } };
    if (opp.naics_code) return { result: { skipped: "already_has_naics" } };
    const result = await classifyNaics({ title: opp.title, description: opp.description });
    if (!result) return { result: { no_classification: true } };
    if (result.confidence < 0.6) return { result: { low_confidence: result.confidence } };
    const { error: upErr } = await sb.from("opportunities")
        .update({ naics_code: result.naics_code })
        .eq("id", oppId)
        .is("naics_code", null);
    if (upErr) return { error: upErr.message };
    return { result: { naics_code: result.naics_code, confidence: result.confidence } };
}

// Mirrors handleExtractKeywords in run_worker_jobs/route.ts. Kept inline so this
// drain route stays isolated — any change to extraction logic must apply in BOTH.
async function handleExtractKeywords(sb: SbAny, job: Job) {
    const oppId = job.payload.opp_id as string;
    if (!oppId) return { error: "missing opp_id" };
    // FIX: column is extracted_keywords (ai_keywords doesn't exist — the select
    // errored, returned null, logged as "opp not found"). Also feed analyzed
    // attachment text so keywords come from the full solicitation, not just the
    // short SAM description. Keep in sync with run_worker_jobs/route.ts.
    const { data: opp } = await sb.from("opportunities")
        .select("title, description, extracted_keywords")
        .eq("id", oppId)
        .maybeSingle() as { data: { title: string | null; description: string | null; extracted_keywords: unknown } | null };
    if (!opp) return { result: { skipped: "opp_deleted" } };
    if (Array.isArray(opp.extracted_keywords) && opp.extracted_keywords.length > 0) {
        return { result: { skipped: "already_extracted" } };
    }

    let attachmentText = "";
    try {
        const { data: atts } = await sb.from("opportunity_attachments")
            .select("extracted_text")
            .eq("opportunity_id", oppId)
            .limit(3) as { data: Array<{ extracted_text: string | null }> | null };
        attachmentText = (atts || [])
            .map(a => a.extracted_text || "")
            .filter(Boolean)
            .join("\n\n")
            .slice(0, 12_000);
    } catch { /* attachments optional */ }

    const description = [opp.description || "", attachmentText]
        .filter(Boolean).join("\n\n").slice(0, 16_000);

    const result = await extractAiKeywords({ title: opp.title, description });
    if (!result || !result.keywords || result.keywords.length === 0) {
        return { result: { no_keywords: true } };
    }
    const { error: upErr } = await sb.from("opportunities")
        .update({
            extracted_keywords: result.keywords,
            keywords_extracted_at: new Date().toISOString(),
            keywords_extraction_model: result.model,
        })
        .eq("id", oppId);
    if (upErr) return { error: upErr.message };
    return { result: { keyword_count: result.keywords.length, used_attachments: attachmentText.length > 0 } };
}

const HANDLERS: Record<string, (sb: SbAny, job: Job) => Promise<{ result?: unknown; error?: string }>> = {
    classify_naics: handleClassifyNaics,
    extract_keywords: handleExtractKeywords,
};

const TASK_TYPES = ["extract_keywords", "classify_naics"];

async function GET_handler(req: NextRequest): Promise<NextResponse> {
    const denied = guardCron(req);
    if (denied) return denied;

    const url = new URL(req.url);
    const totalBudget = Math.min(Math.max(Number(url.searchParams.get("budget") || 290_000), 5_000), 290_000);
    // Big batch to drain the 30K backlog fast. Each job is ~1-2s (one LLM
    // call, no fetch). batch_size=150 fits inside the 300s maxDuration budget.
    const batchSize = Math.min(Math.max(Number(url.searchParams.get("batch_size") || 150), 1), 300);
    console.log("[keywords-drain] starting batch_size=" + batchSize);

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    const startedAt = Date.now();
    let processed = 0;
    let done = 0;
    let failed = 0;
    const byType: Record<string, { done: number; failed: number }> = {};

    while (Date.now() - startedAt < totalBudget) {
        const { data: jobs, error } = await sb.rpc("claim_jobs", {
            p_task_types: TASK_TYPES,
            p_batch_size: batchSize,
        });
        if (error) {
            return NextResponse.json({ error: error.message, processed, done, failed }, { status: 500 });
        }
        if (!jobs || jobs.length === 0) break;

        for (const j of jobs as Job[]) {
            processed++;
            byType[j.task_type] = byType[j.task_type] || { done: 0, failed: 0 };
            const handler = HANDLERS[j.task_type];
            if (!handler) {
                await sb.rpc("finish_job", { p_job_id: j.id, p_status: "skipped", p_result: null, p_error: "no handler" });
                continue;
            }
            try {
                const res = await handler(sb, j);
                if (res.error) {
                    await sb.rpc("finish_job", {
                        p_job_id: j.id,
                        p_status: j.attempts >= j.max_attempts ? "failed" : "pending",
                        p_result: null,
                        p_error: res.error,
                    });
                    failed++;
                    byType[j.task_type].failed++;
                } else {
                    await sb.rpc("finish_job", { p_job_id: j.id, p_status: "done", p_result: (res.result || {}) as never, p_error: null });
                    done++;
                    byType[j.task_type].done++;
                }
            } catch (e) {
                const msg = (e instanceof Error ? e.message : String(e)).slice(0, 200);
                await sb.rpc("finish_job", {
                    p_job_id: j.id,
                    p_status: j.attempts >= j.max_attempts ? "failed" : "pending",
                    p_result: null,
                    p_error: msg,
                });
                failed++;
                byType[j.task_type].failed++;
            }
        }
    }

    return NextResponse.json({
        ok: true,
        processed,
        done,
        failed,
        by_type: byType,
        elapsed_ms: Date.now() - startedAt,
    });
}

export const GET = withCronTelemetry("/api/cron/run_worker_jobs_keywords", GET_handler);
