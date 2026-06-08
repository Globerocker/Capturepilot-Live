/**
 * Centralized helper for writing rows to `health_alerts`.
 *
 * Why a wrapper instead of inline inserts:
 *   - One canonical place to map our `(source, severity, message, payload)`
 *     escalation shape onto the legacy `health_alerts` schema introduced in
 *     migration 075 (connector_slug / alert_type / title / detail / payload).
 *   - Lets callers in cron handlers, worker queues, and orchestrators raise
 *     alerts without re-importing Supabase or worrying about column names.
 *   - Centralizes failure handling — alert inserts must never throw past the
 *     caller (the caller is usually itself a failure path; throwing again
 *     would mask the original error).
 *
 * Usage:
 *   await raiseAlert({
 *       source: "orchestrator:run_worker_jobs",
 *       severity: "error",
 *       message: "Sub-task returned HTTP 500",
 *       payload: { url, body_excerpt },
 *   });
 *
 * The `source` string becomes `connector_slug` on the row. Convention is
 * `<system>:<sub_component>` so /admin/health/alerts can group by prefix.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type AlertSeverity = "info" | "warning" | "error" | "critical";

export interface RaiseAlertInput {
    /** Stable identifier for the alert source, e.g. `orchestrator:run_worker_jobs`. */
    source: string;
    severity: AlertSeverity;
    /** Short human-readable summary; lands in both `title` and `detail`. */
    message: string;
    /** Optional structured context (URL, status code, response excerpt, etc). */
    payload?: Record<string, unknown>;
    /**
     * Optional alert_type override. Defaults to `"cron_failed"` to match the
     * existing health_monitor vocabulary so the /admin/health/alerts filters
     * keep working. Use a more specific value for non-cron sources.
     */
    alertType?: string;
}

export interface RaiseAlertResult {
    ok: boolean;
    id?: string;
    error?: string;
}

// Map our four-level severity onto the three-level vocabulary the existing
// health_alerts schema uses (`info | warning | critical`). `error` collapses
// to `critical` so the digest still treats it as actionable.
function normalizeSeverity(sev: AlertSeverity): "info" | "warning" | "critical" {
    if (sev === "error" || sev === "critical") return "critical";
    if (sev === "warning") return "warning";
    return "info";
}

function db(): SupabaseClient | null {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) return null;
    return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Insert a row into `health_alerts`. Swallows DB errors so callers (which
 * are usually themselves in a failure path) don't double-fault.
 */
export async function raiseAlert(input: RaiseAlertInput): Promise<RaiseAlertResult> {
    const sb = db();
    if (!sb) {
        // No Supabase creds in this environment — log to stderr so the
        // operator at least sees the escalation in Vercel logs.
        console.error(
            `[health-alerts] (no-db) source=${input.source} severity=${input.severity} ${input.message}`,
        );
        return { ok: false, error: "supabase env vars missing" };
    }

    try {
        const { data, error } = await sb
            .from("health_alerts")
            .insert({
                connector_slug: input.source,
                alert_type: input.alertType ?? "cron_failed",
                severity: normalizeSeverity(input.severity),
                title: input.message,
                detail: input.message,
                payload: input.payload ?? null,
            })
            .select("id")
            .single();

        if (error) {
            console.error(
                `[health-alerts] insert failed source=${input.source} err=${error.message}`,
            );
            return { ok: false, error: error.message };
        }
        return { ok: true, id: (data as { id?: string } | null)?.id };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[health-alerts] insert threw source=${input.source} err=${msg}`);
        return { ok: false, error: msg };
    }
}
