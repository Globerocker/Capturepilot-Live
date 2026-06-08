/**
 * Shared validation + audit helpers for /api/admin/queue/* action routes.
 *
 * Everything here is purely defensive: the admin gate already runs in the
 * route handler (assertAdmin), but these helpers stop a compromised admin
 * session (or a fat-finger) from passing arbitrary identifiers into the
 * worker_jobs table.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Whitelist of task_type values that admin queue actions are permitted to
 * mutate. Pulled from the Vercel + Railway worker handlers (May 26 platform).
 * Keep this in sync with:
 *   - src/app/api/cron/run_worker_jobs/route.ts  (HTTP_TASK_TYPES)
 *   - tools/playwright-worker/worker.js         (BROWSER_TASK_TYPES)
 *
 * If a new task_type is introduced, add it here so admins can retry/clear it.
 */
export const ALLOWED_TASK_TYPES: ReadonlySet<string> = new Set([
    // HTTP / Vercel consumer
    "classify_naics",
    "extract_structured_reqs",
    "extract_structured_reqs_county",
    "extract_structured_reqs_federal",
    "extract_structured_reqs_state",
    "extract_structured_reqs_city",
    "extract_keywords",
    "enrich_lead_brief",
    "enrich_lead_apollo",
    "analyze_attachments",
    // Browser / Railway consumer
    "scrape_portal_detail",
    "warm_cf_cookie",
]);

/**
 * Validates that `taskType` is a known worker_jobs task_type. Also enforces a
 * conservative character class (lowercase + digits + underscore, 3..64 chars)
 * to defang any future allow-list bypass that uses look-alike characters.
 *
 * Returns { ok: true } when valid, otherwise { ok: false, error }.
 */
export function validateTaskType(
    taskType: string | null | undefined,
): { ok: true; value: string } | { ok: false; error: string } {
    if (!taskType) {
        return { ok: false, error: "task_type required" };
    }
    const trimmed = taskType.trim();
    if (!/^[a-z][a-z0-9_]{2,63}$/.test(trimmed)) {
        return { ok: false, error: "task_type must be 3-64 chars, lowercase + underscore" };
    }
    if (!ALLOWED_TASK_TYPES.has(trimmed)) {
        return { ok: false, error: `task_type "${trimmed}" not in admin allow-list` };
    }
    return { ok: true, value: trimmed };
}

/**
 * Writes an audit row to client_activity_log for queue-admin actions. The
 * actor_id is the admin's auth user id; we look up their user_profile.id and
 * attach the row to themselves (system actions don't have a target client).
 *
 * Errors are logged but never thrown — audit-log write failure should not
 * abort the underlying action.
 */
export async function logQueueAction(
    sb: SupabaseClient,
    args: {
        authUserId: string;
        action: "queue_retry_failed" | "queue_clear_pending" | "queue_reap_stuck";
        taskType: string;
        description: string;
        metadata: Record<string, unknown>;
    },
): Promise<void> {
    try {
        const { data: profile } = await sb
            .from("user_profiles")
            .select("id")
            .eq("auth_user_id", args.authUserId)
            .maybeSingle();
        // user_profile_id is NOT NULL on client_activity_log — if the admin
        // somehow has no profile row, skip the audit write rather than crash.
        if (!profile?.id) {
            console.warn("[queue-admin] audit skipped: no user_profile for", args.authUserId);
            return;
        }
        const { error } = await sb.from("client_activity_log").insert({
            user_profile_id: profile.id,
            actor_id: args.authUserId,
            action: args.action,
            description: args.description,
            metadata: { ...args.metadata, task_type: args.taskType, source: "admin_queue_ui" },
        });
        if (error) {
            console.error("[queue-admin] audit insert failed:", error.message);
        }
    } catch (e) {
        console.error("[queue-admin] audit threw:", (e as Error).message);
    }
}
