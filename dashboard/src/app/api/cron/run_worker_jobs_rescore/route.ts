/**
 * Dedicated drain route for the rescore_user_matches lane.
 *
 * Counterpart to /api/cron/run_worker_jobs that ONLY claims rescore jobs.
 * Split out (2026-06-10) because each rescore loads 78k+ opportunities,
 * scores them all, then rewrites user_matches — ~20-40s per job. Mixing this
 * lane with the main worker would starve every other task type whenever a
 * single user clicks "Refresh".
 *
 * This route:
 *   - Claims ONLY task_type='rescore_user_matches'
 *   - batch_size=3 — each job is ~30s, three fits comfortably inside the
 *     150s budget below.
 *   - Hands off scoring to @/lib/rescore-user-matches so the logic stays
 *     callable from a test or admin flow without going through the queue.
 *
 * Scheduled via the enrichment_orchestrator at every orchestrator tick
 * (in-process invocation — no DNS / no edge auth). vercel.json is at the
 * Pro-plan 40-cron ceiling, so the orchestrator route ferries us instead of
 * adding a 41st entry.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";
import { withCronTelemetry } from "@/lib/cron-telemetry";
import { rescoreUserMatches } from "@/lib/rescore-user-matches";

export const runtime = "nodejs";
export const maxDuration = 300;

// Loose Supabase client typing to match the existing worker-job routes — the
// scoring lib uses the same any-shape client to sidestep PostgrestQueryBuilder
// generic constraints on our jsonb payloads.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SbAny = SupabaseClient<any, any, any>;

type Job = {
    id: string;
    task_type: string;
    payload: Record<string, unknown>;
    attempts: number;
    max_attempts: number;
};

const TASK_TYPES = ["rescore_user_matches"];

async function handleRescore(
    sb: SbAny,
    job: Job,
): Promise<{ result?: unknown; error?: string }> {
    const userProfileId = job.payload.user_profile_id as string | undefined;
    if (!userProfileId) return { error: "missing user_profile_id" };
    try {
        const result = await rescoreUserMatches({ user_profile_id: userProfileId, sb });
        return { result };
    } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
    }
}

async function GET_handler(req: NextRequest): Promise<NextResponse> {
    const denied = guardCron(req);
    if (denied) return denied;

    const url = new URL(req.url);
    // Leave a 10s safety margin under the 300s ceiling. Each job is heavy
    // (~30s) so the total budget caps at ~150s by default to leave headroom.
    const totalBudget = Math.min(
        Math.max(Number(url.searchParams.get("budget") || 150_000), 5_000),
        290_000,
    );
    const batchSize = Math.min(
        Math.max(Number(url.searchParams.get("batch_size") || 3), 1),
        5,
    );

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    ) as unknown as SbAny;

    const startedAt = Date.now();
    let processed = 0;
    let done = 0;
    let failed = 0;

    while (Date.now() - startedAt < totalBudget) {
        const { data: jobs, error } = await sb.rpc("claim_jobs", {
            p_task_types: TASK_TYPES,
            p_batch_size: batchSize,
        });
        if (error) {
            return NextResponse.json(
                { error: error.message, processed, done, failed },
                { status: 500 },
            );
        }
        if (!jobs || (jobs as Job[]).length === 0) break;

        for (const j of jobs as Job[]) {
            processed++;
            try {
                const res = await handleRescore(sb, j);
                if (res.error) {
                    await sb.rpc("finish_job", {
                        p_job_id: j.id,
                        p_status: j.attempts >= j.max_attempts ? "failed" : "pending",
                        p_result: null,
                        p_error: res.error.slice(0, 500),
                    });
                    failed++;
                } else {
                    await sb.rpc("finish_job", {
                        p_job_id: j.id,
                        p_status: "done",
                        p_result: (res.result || {}) as never,
                        p_error: null,
                    });
                    done++;
                }
            } catch (e) {
                const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500);
                await sb.rpc("finish_job", {
                    p_job_id: j.id,
                    p_status: j.attempts >= j.max_attempts ? "failed" : "pending",
                    p_result: null,
                    p_error: msg,
                });
                failed++;
            }
        }
    }

    return NextResponse.json({
        ok: true,
        processed,
        done,
        failed,
        elapsed_ms: Date.now() - startedAt,
    });
}

export const GET = withCronTelemetry("/api/cron/run_worker_jobs_rescore", GET_handler);
