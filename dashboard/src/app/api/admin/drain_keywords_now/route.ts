/**
 * POST /api/admin/drain_keywords_now
 *
 * Emergency one-shot drain for the extract_keywords + classify_naics lanes.
 * Run by an admin when the queue grows past the cron's drain rate (e.g. after
 * a big ingest, a reap-burn loop, or a stuck handler).
 *
 * Body: { batch_size?: number }   (default 200, capped at 500)
 *
 * Returns: { ok, processed, done, failed, by_type, elapsed_ms }
 *
 * Handlers are duplicated from /api/cron/run_worker_jobs_keywords so the
 * drain stays self-contained. Any change to classify/extract logic must apply
 * in BOTH places.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";
import { classifyNaics } from "@/lib/classify-naics";
import { extractAiKeywords } from "@/lib/extract-ai-keywords";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SbAny = SupabaseClient<any, any, any>;

export const runtime = "nodejs";
export const maxDuration = 300;

type Job = {
    id: string;
    task_type: string;
    payload: Record<string, unknown>;
    attempts: number;
    max_attempts: number;
};

// Mirrors handleClassifyNaics in run_worker_jobs_keywords/route.ts.
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

// Mirrors handleExtractKeywords in run_worker_jobs_keywords/route.ts.
async function handleExtractKeywords(sb: SbAny, job: Job) {
    const oppId = job.payload.opp_id as string;
    if (!oppId) return { error: "missing opp_id" };
    const { data: opp } = await sb.from("opportunities")
        .select("title, description, ai_keywords")
        .eq("id", oppId)
        .maybeSingle();
    if (!opp) return { result: { skipped: "opp_deleted" } };
    if (opp.ai_keywords && Array.isArray(opp.ai_keywords) && opp.ai_keywords.length > 0) {
        return { result: { skipped: "already_extracted" } };
    }
    const result = await extractAiKeywords({ title: opp.title, description: opp.description });
    if (!result || !result.keywords || result.keywords.length === 0) {
        return { result: { no_keywords: true } };
    }
    const { error: upErr } = await sb.from("opportunities")
        .update({ ai_keywords: result.keywords })
        .eq("id", oppId);
    if (upErr) return { error: upErr.message };
    return { result: { keyword_count: result.keywords.length } };
}

const HANDLERS: Record<string, (sb: SbAny, job: Job) => Promise<{ result?: unknown; error?: string }>> = {
    classify_naics: handleClassifyNaics,
    extract_keywords: handleExtractKeywords,
};

const TASK_TYPES = ["extract_keywords", "classify_naics"];

export async function POST(req: NextRequest): Promise<NextResponse> {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    let body: { batch_size?: number } = {};
    try {
        body = await req.json();
    } catch {
        // empty body is fine — use defaults
    }
    const batchSize = Math.min(Math.max(Number(body.batch_size || 200), 1), 500);
    console.log("[drain-keywords-now] starting batch_size=" + batchSize);

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

    const { data: jobs, error } = await sb.rpc("claim_jobs", {
        p_task_types: TASK_TYPES,
        p_batch_size: batchSize,
    });
    if (error) {
        return NextResponse.json({ error: error.message, processed, done, failed }, { status: 500 });
    }
    if (!jobs || jobs.length === 0) {
        return NextResponse.json({
            ok: true,
            processed: 0,
            done: 0,
            failed: 0,
            by_type: byType,
            elapsed_ms: Date.now() - startedAt,
            note: "no pending jobs in lane",
        });
    }

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

    return NextResponse.json({
        ok: true,
        processed,
        done,
        failed,
        by_type: byType,
        elapsed_ms: Date.now() - startedAt,
    });
}
