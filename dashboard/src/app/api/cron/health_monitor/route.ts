import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";
import { probes, daysUntilExpiry, EXPIRY_WARN_DAYS, type ProbeResult } from "@/lib/connectors";
import { sendHealthDigest } from "@/lib/health-digest";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Hourly health monitor.
 *
 * For each `api_connectors` row:
 *   1. Run the matching probe in `lib/connectors.ts`.
 *   2. Compare status with the previous last_status. If it CHANGED (e.g.
 *      ok → error, or error → ok), write a row to `health_alerts`.
 *   3. Check expires_at — if inside EXPIRY_WARN_DAYS (14d) and we haven't
 *      already fired an expiry alert for this connector, fire one.
 *   4. Update the connector row with current last_status / last_check_at /
 *      consecutive_fails counter.
 *
 * Separately, for cron freshness:
 *   - Read cron_runs to find any cron route whose last_run is older than
 *     2× its expected interval. Fire a `cron_stale` alert if no open one.
 *
 * Finally, if any NEW alerts were fired this run, batch them into a single
 * email digest to info@fillcart.de (configurable via HEALTH_ALERT_EMAIL).
 *
 * Idempotent: if no state changes, no alerts. Re-running is a no-op.
 */

const ALERT_EMAIL_TO = process.env.HEALTH_ALERT_EMAIL || "info@fillcart.de";

type ConnectorRow = {
    id: string;
    slug: string;
    label: string;
    env_var_name: string;
    enabled: boolean;
    rotation_days: number | null;
    expires_at: string | null;
    docs_url: string | null;
    rotate_url: string | null;
    last_status: string | null;
    consecutive_fails: number;
};

function db() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

export async function GET(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;

    const sb = db();
    const startedAt = new Date();
    const newAlerts: Array<{ slug: string; severity: string; title: string; detail?: string }> = [];

    // ─── Connector probes ────────────────────────────────────────────────────
    const { data: connectors, error: cErr } = await sb
        .from("api_connectors")
        .select("id, slug, label, env_var_name, enabled, rotation_days, expires_at, docs_url, rotate_url, last_status, consecutive_fails")
        .eq("enabled", true);

    if (cErr) {
        console.error("[health_monitor] fetch connectors failed", cErr);
        return NextResponse.json({ ok: false, error: cErr.message }, { status: 500 });
    }

    for (const c of (connectors as ConnectorRow[] | null) ?? []) {
        let result: ProbeResult;

        if (c.slug === "supabase") {
            // Inline check using the existing client.
            const { error } = await sb.from("opportunities").select("notice_id", { count: "exact", head: true }).limit(1);
            result = error ? { status: "error", detail: error.message } : { status: "ok" };
        } else {
            const probeFn = probes[c.slug];
            result = probeFn ? await probeFn() : { status: "unknown", detail: "no probe registered" };
        }

        // Status-change alert
        const prev = c.last_status;
        const cur = result.status;
        const wasOk = prev === "ok";
        const isOk = cur === "ok";
        if (prev && prev !== cur && cur !== "unknown" && cur !== "disabled") {
            if (wasOk && !isOk) {
                newAlerts.push({
                    slug: c.slug,
                    severity: "critical",
                    title: `${c.label} went from healthy → ${cur}`,
                    detail: result.detail,
                });
                await sb.from("health_alerts").insert({
                    connector_slug: c.slug,
                    alert_type: "status_change",
                    severity: "critical",
                    title: `${c.label} is failing`,
                    detail: result.detail || `Status transitioned ${prev} → ${cur}`,
                    payload: { prev, cur, env_var: c.env_var_name },
                });
            } else if (!wasOk && isOk) {
                // Recovery — informational, but still nice to email so the
                // operator knows it self-healed.
                newAlerts.push({
                    slug: c.slug,
                    severity: "info",
                    title: `${c.label} recovered`,
                });
                // Resolve any open critical alerts for this connector.
                await sb.from("health_alerts").update({ resolved_at: new Date().toISOString() })
                    .eq("connector_slug", c.slug)
                    .is("resolved_at", null);
                await sb.from("health_alerts").insert({
                    connector_slug: c.slug,
                    alert_type: "recovery",
                    severity: "info",
                    title: `${c.label} recovered`,
                    detail: `Now healthy`,
                });
            }
        }

        // Expiry warning
        const daysLeft = daysUntilExpiry(c.expires_at);
        if (daysLeft !== null && daysLeft <= EXPIRY_WARN_DAYS && c.enabled) {
            const { count: existing } = await sb
                .from("health_alerts")
                .select("id", { count: "exact", head: true })
                .eq("connector_slug", c.slug)
                .eq("alert_type", "expiry_warning")
                .is("resolved_at", null);
            if (!existing) {
                const sev = daysLeft <= 3 ? "critical" : "warning";
                newAlerts.push({
                    slug: c.slug,
                    severity: sev,
                    title: `${c.label} key expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
                    detail: c.rotate_url ? `Rotate at: ${c.rotate_url}` : undefined,
                });
                await sb.from("health_alerts").insert({
                    connector_slug: c.slug,
                    alert_type: "expiry_warning",
                    severity: sev,
                    title: `${c.label} expires in ${daysLeft} days`,
                    detail: c.rotate_url || c.docs_url,
                    payload: { days_left: daysLeft, env_var: c.env_var_name, rotate_url: c.rotate_url },
                });
            }
        }

        // Update connector row with latest probe outcome.
        const fails = cur === "error" ? (c.consecutive_fails || 0) + 1 : 0;
        await sb.from("api_connectors")
            .update({
                last_check_at: new Date().toISOString(),
                last_status: cur,
                last_detail: result.detail || null,
                consecutive_fails: fails,
                updated_at: new Date().toISOString(),
            })
            .eq("id", c.id);
    }

    // ─── Cron staleness ──────────────────────────────────────────────────────
    // "Anything fishy" threshold per the user's alignment: any cron whose last
    // run is older than its expected interval × 2 fires a `cron_stale` alert.
    // We approximate the expected interval as 24h for crons we haven't seen
    // in `cron_runs` lately — that's a generous floor and avoids false-positives
    // on weekly/monthly crons.
    try {
        const since = new Date(Date.now() - 48 * 3600_000).toISOString();
        const { data: recent } = await sb
            .from("cron_runs")
            .select("route, started_at, status")
            .gte("started_at", since)
            .order("started_at", { ascending: false })
            .limit(500);

        // Last run + status per route
        const latestPerRoute = new Map<string, { started_at: string; status: string | null }>();
        for (const r of (recent ?? []) as Array<{ route: string; started_at: string; status: string | null }>) {
            if (!latestPerRoute.has(r.route)) latestPerRoute.set(r.route, { started_at: r.started_at, status: r.status });
        }

        const TWENTY_FOUR_H_AGO = Date.now() - 24 * 3600_000;
        for (const [route, info] of latestPerRoute.entries()) {
            const lastMs = new Date(info.started_at).getTime();
            const stale = lastMs < TWENTY_FOUR_H_AGO;
            const failed = info.status && info.status !== "ok" && info.status !== "success";
            if (!stale && !failed) continue;

            // Open alert already?
            const { count: existing } = await sb
                .from("health_alerts")
                .select("id", { count: "exact", head: true })
                .eq("connector_slug", `cron:${route}`)
                .in("alert_type", ["cron_stale", "cron_failed"])
                .is("resolved_at", null);
            if (existing) continue;

            const title = stale
                ? `Cron ${route} hasn't run in 24h+`
                : `Cron ${route} last run failed (status=${info.status})`;
            newAlerts.push({
                slug: `cron:${route}`,
                severity: failed ? "critical" : "warning",
                title,
            });
            await sb.from("health_alerts").insert({
                connector_slug: `cron:${route}`,
                alert_type: stale ? "cron_stale" : "cron_failed",
                severity: failed ? "critical" : "warning",
                title,
                detail: `Last seen: ${info.started_at}`,
                payload: { route, last_run: info.started_at, last_status: info.status },
            });
        }
    } catch (e) {
        console.warn("[health_monitor] cron staleness check failed:", (e as Error).message);
    }

    // ─── Worker_jobs failure-rate spike ──────────────────────────────────────
    // If the failure rate over the last hour crosses 20% (and there's at
    // least 10 jobs to avoid false positives on small samples), fire a
    // `worker_spike` alert. Catches silent regressions like a scraper
    // breaking on every page or an enrichment endpoint going 500.
    try {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { data: recent } = await sb
            .from("worker_jobs")
            .select("status")
            .gte("finished_at", oneHourAgo);
        const rows = (recent || []) as Array<{ status: string }>;
        if (rows.length >= 10) {
            const failed = rows.filter(r => r.status === "failed").length;
            const failureRate = failed / rows.length;
            if (failureRate >= 0.20) {
                // Skip if we already fired this alert in the last 6h.
                const { count: existing } = await sb
                    .from("health_alerts")
                    .select("id", { count: "exact", head: true })
                    .eq("alert_type", "worker_spike")
                    .gte("fired_at", new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString());
                if (!existing) {
                    const pct = Math.round(failureRate * 100);
                    const sev = failureRate >= 0.5 ? "critical" : "warning";
                    newAlerts.push({
                        slug: "worker_jobs",
                        severity: sev,
                        title: `Worker queue failure rate spike: ${pct}%`,
                        detail: `${failed} of ${rows.length} jobs failed in the last hour.`,
                    });
                    await sb.from("health_alerts").insert({
                        connector_slug: "worker_jobs",
                        alert_type: "worker_spike",
                        severity: sev,
                        title: `Worker failure rate ${pct}%`,
                        detail: `${failed}/${rows.length} jobs failed in the last hour`,
                        payload: { failed, total: rows.length, rate: failureRate },
                    });
                }
            }
        }
    } catch (e) {
        console.warn("[health_monitor] worker-spike check failed:", (e as Error).message);
    }

    // ─── Email digest ────────────────────────────────────────────────────────
    if (newAlerts.length > 0) {
        try {
            await sendHealthDigest({ to: ALERT_EMAIL_TO, alerts: newAlerts });
            // Mark them emailed so we don't re-send next run.
            await sb.from("health_alerts")
                .update({ emailed: true })
                .gte("fired_at", startedAt.toISOString());
        } catch (e) {
            console.error("[health_monitor] email digest failed:", (e as Error).message);
        }
    }

    return NextResponse.json({
        ok: true,
        checked_connectors: connectors?.length ?? 0,
        new_alerts: newAlerts.length,
        duration_ms: Date.now() - startedAt.getTime(),
    });
}
