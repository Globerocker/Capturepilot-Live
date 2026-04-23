/**
 * Background job helpers.
 *
 * A "job" is a long-running async task (AI win strategy, voice brief,
 * compliance matrix, etc) whose progress we persist to Postgres so the
 * client can poll, navigate away, and return without losing visibility.
 *
 * Pattern:
 *   1) Route creates a job:     const { jobId, steps } = await createJob(...)
 *   2) Route returns jobId (response is flushed)
 *   3) Inside `after(async () => { ... })`, the route performs each step
 *      wrapped with `runStep(jobId, "step_key", async () => { ... })`
 *   4) `runStep` flips the step to running → done (or error),
 *      rolls completed_steps/progress_pct, logs duration.
 *   5) Final `completeJob(jobId, result)` or `failJob(jobId, msg)`
 *
 * Client polls /api/jobs/[id] every 2s for updates.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type JobStatus = "pending" | "running" | "completed" | "failed" | "canceled";
export type StepStatus = "pending" | "running" | "done" | "skipped" | "error";

export interface JobStep {
    key: string;
    label: string;
    status: StepStatus;
    started_at?: string | null;
    duration_ms?: number | null;
    detail?: string | null;
}

export interface JobKindMeta {
    kind: string;
    title: string;
    steps: Array<{ key: string; label: string }>;
    opportunity_id?: string | null;
    notice_id?: string | null;
}

function admin(): SupabaseClient {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

/**
 * Create a new job row in `pending` state with the step list seeded.
 * Returns jobId — caller should return this in the HTTP response immediately.
 */
export async function createJob(
    userProfileId: string,
    meta: JobKindMeta,
): Promise<{ jobId: string; steps: JobStep[] }> {
    const steps: JobStep[] = meta.steps.map((s) => ({
        key: s.key,
        label: s.label,
        status: "pending",
        started_at: null,
        duration_ms: null,
        detail: null,
    }));

    const db = admin();
    const { data, error } = await db
        .from("background_jobs")
        .insert({
            user_profile_id: userProfileId,
            kind: meta.kind,
            title: meta.title,
            status: "pending",
            opportunity_id: meta.opportunity_id || null,
            notice_id: meta.notice_id || null,
            steps,
            total_steps: steps.length,
            completed_steps: 0,
            progress_pct: 0,
            started_at: new Date().toISOString(),
        })
        .select("id")
        .single();

    if (error || !data) throw new Error(`createJob failed: ${error?.message || "unknown"}`);
    return { jobId: (data as { id: string }).id, steps };
}

async function patchJob(
    jobId: string,
    patch: Record<string, unknown>,
): Promise<void> {
    const db = admin();
    await db.from("background_jobs").update(patch).eq("id", jobId);
}

async function loadSteps(jobId: string): Promise<JobStep[]> {
    const db = admin();
    const { data } = await db.from("background_jobs").select("steps").eq("id", jobId).single();
    return ((data as { steps: JobStep[] } | null)?.steps) || [];
}

function recomputeProgress(steps: JobStep[]): { completed: number; pct: number } {
    const done = steps.filter((s) => s.status === "done" || s.status === "skipped").length;
    const pct = steps.length === 0 ? 0 : Math.round((done / steps.length) * 100);
    return { completed: done, pct };
}

/**
 * Mark the job `running` (idempotent) and activate the first pending step.
 */
export async function startJob(jobId: string): Promise<void> {
    await patchJob(jobId, { status: "running" });
}

/**
 * Execute a step: flips its status to `running` before the callback, then
 * `done` (or `error`) after. Duration + detail tracked automatically.
 *
 * On throw: step is marked `error`, entire job is marked `failed`, and the
 * error re-throws so callers can choose to continue or abort.
 */
export async function runStep<T>(
    jobId: string,
    stepKey: string,
    fn: () => Promise<T>,
    opts: { detailOnStart?: string; detailOnDone?: (result: T) => string | null; skipIf?: () => boolean } = {},
): Promise<T | null> {
    if (opts.skipIf?.()) {
        const steps = await loadSteps(jobId);
        const updated = steps.map((s) =>
            s.key === stepKey ? { ...s, status: "skipped" as StepStatus, duration_ms: 0 } : s,
        );
        const { completed, pct } = recomputeProgress(updated);
        await patchJob(jobId, { steps: updated, completed_steps: completed, progress_pct: pct, current_step: null });
        return null;
    }

    const started = Date.now();
    const startedIso = new Date(started).toISOString();

    // Mark step running
    {
        const steps = await loadSteps(jobId);
        const updated = steps.map((s) =>
            s.key === stepKey ? { ...s, status: "running" as StepStatus, started_at: startedIso, detail: opts.detailOnStart ?? null } : s,
        );
        await patchJob(jobId, { steps: updated, current_step: stepKey });
    }

    try {
        const result = await fn();
        const duration = Date.now() - started;
        const steps = await loadSteps(jobId);
        const updated = steps.map((s) =>
            s.key === stepKey
                ? {
                      ...s,
                      status: "done" as StepStatus,
                      duration_ms: duration,
                      detail: opts.detailOnDone ? opts.detailOnDone(result) : s.detail,
                  }
                : s,
        );
        const { completed, pct } = recomputeProgress(updated);
        await patchJob(jobId, {
            steps: updated,
            completed_steps: completed,
            progress_pct: pct,
            current_step: null,
        });
        return result;
    } catch (e) {
        const duration = Date.now() - started;
        const msg = e instanceof Error ? e.message : String(e);
        const steps = await loadSteps(jobId);
        const updated = steps.map((s) =>
            s.key === stepKey ? { ...s, status: "error" as StepStatus, duration_ms: duration, detail: msg.slice(0, 300) } : s,
        );
        await patchJob(jobId, {
            steps: updated,
            status: "failed",
            error: msg.slice(0, 600),
            completed_at: new Date().toISOString(),
            current_step: null,
        });
        throw e;
    }
}

export async function completeJob(jobId: string, result: unknown): Promise<void> {
    await patchJob(jobId, {
        status: "completed",
        result: result ?? null,
        completed_at: new Date().toISOString(),
        current_step: null,
        progress_pct: 100,
    });
}

export async function failJob(jobId: string, error: string): Promise<void> {
    await patchJob(jobId, {
        status: "failed",
        error: error.slice(0, 600),
        completed_at: new Date().toISOString(),
        current_step: null,
    });
}

/**
 * Resolve a user_profile_id from an auth cookie context. Throws on missing.
 */
export async function requireProfileId(userId: string): Promise<string> {
    const db = admin();
    const { data } = await db
        .from("user_profiles")
        .select("id")
        .eq("auth_user_id", userId)
        .single();
    if (!data) throw new Error("User profile not found");
    return (data as { id: string }).id;
}
