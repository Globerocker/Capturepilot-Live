/**
 * Sentry alert recipes for CapturePilot.
 *
 * Centralized capture helpers so all high-leverage failure events emit
 * with consistent tags (deployment URL, git sha, env) and the same
 * Sentry message names — making the issue list filterable and alert
 * rules trivial to wire up in Sentry's UI.
 *
 * Why a helper instead of inline `Sentry.captureMessage` everywhere:
 * - Adds env/sha/deployment tags consistently
 * - Adds a breadcrumb on each call so the issue carries the surrounding
 *   context that led up to it
 * - Becomes a no-op when DSN isn't configured (dev / preview without DSN)
 * - Single place to swap transport (e.g. add Slack mirror) later
 *
 * Recipes:
 *   - cron_failed              — any cron returning non-2xx
 *   - worker_queue_spike       — queue lane > N pending + no done in last hour
 *   - webhook_signature_invalid — Stripe / Resend / HubSpot signature mismatch
 *   - openai_failure           — OpenAI request failed (includes cost tokens)
 */

import * as Sentry from "@sentry/nextjs";
import { createClient } from "@supabase/supabase-js";

const DEPLOYMENT_URL =
    process.env.VERCEL_URL ||
    process.env.NEXT_PUBLIC_VERCEL_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "local";

const GIT_SHA =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_GIT_SHA ||
    "unknown";

const ENVIRONMENT =
    process.env.VERCEL_ENV ||
    process.env.NODE_ENV ||
    "development";

function baseTags(extra?: Record<string, string | number | undefined>) {
    return {
        deployment_url: DEPLOYMENT_URL,
        git_sha: GIT_SHA,
        environment: ENVIRONMENT,
        ...(extra || {}),
    };
}

/**
 * Mirror the alert into Supabase `health_alerts` so /admin/health and
 * the cron health_monitor route can scan recent firings without
 * round-tripping to the Sentry API. Fire-and-forget; errors swallowed.
 */
function mirrorToSupabase(payload: {
    recipe: string;
    severity?: string;
    route?: string;
    provider?: string;
    task_type?: string;
    details: Record<string, unknown>;
}) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) return;
    try {
        const db = createClient(url, key);
        // Don't await — alert mirroring must never block the caller.
        void db.from("health_alerts").insert({
            recipe: payload.recipe,
            severity: payload.severity || "error",
            route: payload.route || null,
            provider: payload.provider || null,
            task_type: payload.task_type || null,
            details: payload.details,
        });
    } catch {
        /* swallow */
    }
}

/** Add a breadcrumb without firing an alert (low-overhead context). */
export function alertBreadcrumb(
    category: string,
    message: string,
    data?: Record<string, unknown>,
) {
    try {
        Sentry.addBreadcrumb({
            category,
            message,
            level: "info",
            data,
        });
    } catch {
        // Never let Sentry breadcrumb errors break the caller.
    }
}

/** A cron handler returned non-2xx or threw. */
export function captureCronFailure(params: {
    route: string;
    status: number;
    error?: unknown;
    extra?: Record<string, unknown>;
}) {
    const { route, status, error, extra } = params;
    const errMessage = error instanceof Error ? error.message : error;
    try {
        Sentry.captureMessage("cron_failed", {
            level: "error",
            tags: baseTags({ route, status }),
            extra: {
                route,
                status,
                error: errMessage,
                stack: error instanceof Error ? error.stack : undefined,
                ...(extra || {}),
            },
        });
    } catch {
        // Swallow — Sentry must never surface.
    }
    mirrorToSupabase({
        recipe: "cron_failed",
        severity: "error",
        route,
        details: { status, error: errMessage, ...(extra || {}) },
    });
}

/** Worker queue lane is backed up with no progress. */
export function captureWorkerQueueSpike(params: {
    taskType: string;
    pending: number;
    runningWindowMin: number;
    doneInWindow: number;
    extra?: Record<string, unknown>;
}) {
    const { taskType, pending, runningWindowMin, doneInWindow, extra } = params;
    try {
        Sentry.captureMessage("worker_queue_spike", {
            level: "warning",
            tags: baseTags({ task_type: taskType, pending }),
            extra: {
                task_type: taskType,
                pending,
                running_window_min: runningWindowMin,
                done_in_window: doneInWindow,
                ...(extra || {}),
            },
        });
    } catch {
        /* swallow */
    }
    mirrorToSupabase({
        recipe: "worker_queue_spike",
        severity: "warning",
        task_type: taskType,
        details: {
            pending,
            running_window_min: runningWindowMin,
            done_in_window: doneInWindow,
            ...(extra || {}),
        },
    });
}

/** Inbound webhook signature couldn't be verified. */
export function captureWebhookSignatureInvalid(params: {
    provider: "stripe" | "resend" | "hubspot" | string;
    route: string;
    reason?: string;
    extra?: Record<string, unknown>;
}) {
    const { provider, route, reason, extra } = params;
    try {
        Sentry.captureMessage("webhook_signature_invalid", {
            level: "error",
            tags: baseTags({ provider, route }),
            extra: {
                provider,
                route,
                reason,
                ...(extra || {}),
            },
        });
    } catch {
        /* swallow */
    }
    mirrorToSupabase({
        recipe: "webhook_signature_invalid",
        severity: "error",
        route,
        provider,
        details: { reason, ...(extra || {}) },
    });
}

/** OpenAI request failed — include cost tokens for budget alerts. */
export function captureOpenAIFailure(params: {
    route: string;
    status?: number;
    model?: string;
    costTokens?: number;
    error?: unknown;
    extra?: Record<string, unknown>;
}) {
    const { route, status, model, costTokens, error, extra } = params;
    const errMessage = error instanceof Error ? error.message : error;
    try {
        Sentry.captureMessage("openai_failure", {
            level: "error",
            tags: baseTags({ route, status, model }),
            extra: {
                route,
                status,
                model,
                cost_tokens: costTokens,
                error: errMessage,
                stack: error instanceof Error ? error.stack : undefined,
                ...(extra || {}),
            },
        });
    } catch {
        /* swallow */
    }
    mirrorToSupabase({
        recipe: "openai_failure",
        severity: "error",
        route,
        details: {
            status,
            model,
            cost_tokens: costTokens,
            error: errMessage,
            ...(extra || {}),
        },
    });
}

/** Tags exported so callers can attach the same context to ad-hoc captures. */
export const sentryBaseTags = baseTags;
