/**
 * Recipe-driven auto-healer for health_alerts.
 *
 * Philosophy: most alerts we see are predictable infrastructure issues with
 * a known fix (throttle a cron, retry a probe, restart a job). Rather than
 * email the operator every time and wait for a manual fix, this module ships
 * a registry of fixes that the self_heal cron applies automatically.
 *
 * Each recipe receives the alert + a DB client, returns one of:
 *   - { status: "fixed",     action } — issue resolved, mark alert resolved
 *   - { status: "escalated", action } — recipe ran but couldn't fix; surface
 *                                       in morning digest as "needs attention"
 *   - { status: "no_recipe" }         — no automation defined yet; same as
 *                                       escalated but flagged so we know
 *                                       which alert types to write recipes
 *                                       for next
 *
 * The recipe matcher is intentionally loose (string-includes) so a slight
 * change in alert title/slug from the monitor doesn't silently lose coverage.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SbAny = SupabaseClient<any, any, any>;

export type AutoFixStatus = "fixed" | "escalated" | "no_recipe" | "error";

export interface AutoFixResult {
    status: AutoFixStatus;
    recipe_slug: string;
    action_taken: string;
    payload?: Record<string, unknown>;
}

export interface HealthAlertRow {
    id: string;
    connector_slug: string | null;
    alert_type: string;
    severity: string;
    title: string;
    detail: string | null;
    payload: Record<string, unknown> | null;
    fired_at: string;
}

interface Recipe {
    slug: string;
    matches: (alert: HealthAlertRow) => boolean;
    run: (alert: HealthAlertRow, sb: SbAny) => Promise<AutoFixResult>;
}

/**
 * Recipe registry — order matters; first match wins.
 *
 * Add a new recipe by appending here. Keep `matches` cheap (string compare)
 * and `run` idempotent — the self_heal cron may retry the same alert if it
 * stays unresolved across runs.
 */
const RECIPES: Recipe[] = [
    // ─── Firecrawl network/timeout — already fixed in lib/connectors.ts ─────
    {
        slug: "firecrawl_probe_timeout",
        matches: (a) =>
            (a.connector_slug || "").toLowerCase().includes("firecrawl") &&
            ((a.detail || "").toLowerCase().includes("network/timeout") ||
             (a.detail || "").toLowerCase().includes("timeout")),
        async run(alert) {
            // The fix shipped in commit b1758319 (probe timeout bump to 30s).
            // The next health_monitor run should observe the recovery itself
            // and write a "recovered" row. We don't need to do anything except
            // acknowledge so this alert doesn't trigger another email.
            return {
                status: "fixed",
                recipe_slug: this.slug,
                action_taken:
                    "Firecrawl probe timeout already bumped to 30s in lib/connectors.ts. " +
                    "Transient 6s timeouts are expected on cache misses; ignore.",
            };
        },
    },

    // ─── SAM 429 — confirm throttle is in place ─────────────────────────────
    {
        slug: "sam_throttle_check",
        matches: (a) =>
            (a.connector_slug || "").toLowerCase().includes("sam") &&
            ((a.detail || "").includes("429") ||
             (a.title || "").toLowerCase().includes("rate limit")),
        async run(alert) {
            // Throttle shipped in b1758319 — bulk_enrich_contractors_sam now
            // runs every 2h with batch=30. If we're still hitting 429 after
            // that change, the only fix is a third SAM key (manual).
            const firedAge = Date.now() - new Date(alert.fired_at).getTime();
            const hours = firedAge / 3_600_000;
            if (hours < 3) {
                // Fresh alert post-throttle — likely a tail-end 429 from
                // before the deploy took effect. Acknowledge silently.
                return {
                    status: "fixed",
                    recipe_slug: this.slug,
                    action_taken:
                        "Throttle to every-2h batch=30 deployed b1758319. " +
                        "Tail 429s within 3h of deploy are expected.",
                };
            }
            return {
                status: "escalated",
                recipe_slug: this.slug,
                action_taken:
                    "SAM 429 persisting >3h after throttle. Need third SAM_API_KEY_3 " +
                    "or further batch reduction. Request via https://api.sam.gov/registration",
                payload: { hours_since_fired: hours },
            };
        },
    },

    // ─── Stale cron — trigger it once via the admin endpoint ────────────────
    {
        slug: "cron_kick",
        matches: (a) =>
            a.alert_type === "stale_cron" ||
            (a.title || "").toLowerCase().includes("stale") ||
            (a.title || "").toLowerCase().includes("hasn't run"),
        async run(alert, sb) {
            const route = (alert.payload as { route?: string } | null)?.route ||
                          (alert.connector_slug || "");
            if (!route) {
                return {
                    status: "no_recipe",
                    recipe_slug: this.slug,
                    action_taken: "Stale cron alert without route identifier — can't kick",
                };
            }
            // Record the kick attempt; the actual trigger goes via the
            // existing /api/admin/cron-trigger endpoint. We don't fetch here
            // because Vercel cron handlers can't cleanly call other Vercel
            // routes mid-execution; we just log the recipe intent and let
            // the morning digest call attention if the route still hasn't run.
            const { data: lastRun } = await sb
                .from("cron_runs")
                .select("started_at")
                .eq("route", route)
                .order("started_at", { ascending: false })
                .limit(1)
                .maybeSingle();
            const lastRunIso = (lastRun as { started_at?: string } | null)?.started_at;
            const minutesSince = lastRunIso
                ? (Date.now() - new Date(lastRunIso).getTime()) / 60_000
                : 999;
            if (minutesSince < 30) {
                return {
                    status: "fixed",
                    recipe_slug: this.slug,
                    action_taken: `Cron ${route} ran ${Math.round(minutesSince)}m ago; alert is stale.`,
                };
            }
            return {
                status: "escalated",
                recipe_slug: this.slug,
                action_taken:
                    `Cron ${route} last ran ${Math.round(minutesSince)}m ago. ` +
                    `Trigger manually via /admin/crons or curl /api/admin/cron-trigger.`,
                payload: { route, minutes_since_last_run: Math.round(minutesSince) },
            };
        },
    },

    // ─── Expiry warnings — these need the user to rotate, always escalate ───
    {
        slug: "key_expiry_warn",
        matches: (a) => a.alert_type === "expiry_warning",
        async run(alert) {
            const slug = alert.connector_slug || "unknown";
            const rotateUrl = (alert.payload as { rotate_url?: string } | null)?.rotate_url;
            return {
                status: "escalated",
                recipe_slug: this.slug,
                action_taken:
                    `${slug} API key needs rotation. ` +
                    (rotateUrl ? `Rotate at ${rotateUrl}` : `Check /admin/connectors for the rotation URL.`),
                payload: { connector_slug: slug, rotate_url: rotateUrl },
            };
        },
    },

    // ─── Auth-failed (401/403) — always escalate ────────────────────────────
    {
        slug: "auth_failed",
        matches: (a) =>
            (a.detail || "").includes("auth failed") ||
            (a.detail || "").includes("HTTP 401") ||
            (a.detail || "").includes("HTTP 403"),
        async run(alert) {
            const slug = alert.connector_slug || "unknown";
            return {
                status: "escalated",
                recipe_slug: this.slug,
                action_taken:
                    `${slug} authentication failing. Likely a rotated/revoked key — ` +
                    `update via Vercel env vars and redeploy.`,
                payload: { connector_slug: slug, detail: alert.detail },
            };
        },
    },

    // ─── Recovery rows — auto-resolve silently ──────────────────────────────
    {
        slug: "recovery_ack",
        matches: (a) => a.alert_type === "recovery" || a.severity === "info",
        async run() {
            return {
                status: "fixed",
                recipe_slug: this.slug,
                action_taken: "Recovery event — connector self-healed.",
            };
        },
    },

    // ─── Cron route failed ───────────────────────────────────────────────────
    // Matches alert_type="cron_failed" with connector_slug like "cron:/api/cron/<route>".
    // We escalate with a direct link to the cron's log view in /admin/health.
    {
        slug: "cron_failed",
        matches: (a) =>
            a.alert_type === "cron_failed" ||
            (a.connector_slug || "").toLowerCase().startsWith("cron:/api/cron/"),
        async run(alert) {
            const raw = alert.connector_slug || "";
            // Strip leading "cron:" prefix if present so we get the bare /api/cron/... path.
            const route = raw.startsWith("cron:") ? raw.slice("cron:".length) : raw;
            const adminPath = `/admin/health/crons${route}`;
            return {
                status: "escalated",
                recipe_slug: this.slug,
                action_taken:
                    `Cron route ${route || "(unknown)"} failed. ` +
                    `Check ${adminPath} for recent logs.`,
                payload: { route, admin_path: adminPath },
            };
        },
    },

    // ─── Worker queue spike ──────────────────────────────────────────────────
    // Matches alert_type="worker_spike" connector_slug="worker_jobs".
    // Reports the failed-job count from the alert payload and links to /admin/health/queue.
    {
        slug: "worker_spike",
        matches: (a) =>
            a.alert_type === "worker_spike" ||
            (a.connector_slug || "").toLowerCase() === "worker_jobs",
        async run(alert) {
            const failed = (alert.payload as { failed_count?: number } | null)?.failed_count;
            const countStr = failed != null ? String(failed) : "multiple";
            return {
                status: "escalated",
                recipe_slug: this.slug,
                action_taken:
                    `Worker queue spike — ${countStr} jobs failed in the last hour. ` +
                    `Check /admin/health/queue for details.`,
                payload: { failed_count: failed },
            };
        },
    },
];

/**
 * Find the first matching recipe for an alert, or null if none match.
 * Exposed for testing.
 */
export function findRecipe(alert: HealthAlertRow): Recipe | null {
    return RECIPES.find(r => r.matches(alert)) || null;
}

/**
 * Run the auto-healer against a single alert. Always logs a row to
 * alert_autofixes (even for no_recipe) so the morning digest sees it.
 *
 * For status="fixed", also marks the alert resolved so it doesn't churn
 * in future runs.
 */
export async function autoHealAlert(alert: HealthAlertRow, sb: SbAny): Promise<AutoFixResult> {
    const recipe = findRecipe(alert);
    let result: AutoFixResult;
    if (!recipe) {
        result = {
            status: "no_recipe",
            recipe_slug: "none",
            action_taken: `Investigate at /admin/health (alert_type=${alert.alert_type}, slug=${alert.connector_slug || "n/a"}).`,
        };
    } else {
        try {
            result = await recipe.run(alert, sb);
        } catch (e) {
            result = {
                status: "error",
                recipe_slug: recipe.slug,
                action_taken: `Recipe threw: ${(e as Error).message}`,
            };
        }
    }

    await sb.from("alert_autofixes").insert({
        alert_id: alert.id,
        connector_slug: alert.connector_slug,
        recipe_slug: result.recipe_slug,
        status: result.status,
        action_taken: result.action_taken,
        payload: result.payload || null,
    });

    if (result.status === "fixed") {
        await sb.from("health_alerts")
            .update({ resolved_at: new Date().toISOString() })
            .eq("id", alert.id)
            .is("resolved_at", null);
    }

    return result;
}

/**
 * Returns true if the alert has a known recipe — used by health_monitor
 * to suppress the per-alert email. The self_heal cron will pick it up
 * within 30 minutes.
 *
 * Critical exemption: alerts containing "supabase" in the slug always
 * email immediately regardless of recipe — losing the DB is not something
 * to bury in a morning digest.
 */
export function shouldSuppressImmediateEmail(alert: HealthAlertRow): boolean {
    const slug = (alert.connector_slug || "").toLowerCase();
    if (slug.includes("supabase")) return false;
    if (alert.severity === "critical" && alert.alert_type === "status_change" &&
        (slug.includes("vercel") || slug.includes("dns"))) return false;
    return findRecipe(alert) !== null;
}
