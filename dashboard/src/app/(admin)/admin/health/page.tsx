"use client";

/**
 * /admin/health — the HUB. Six category tiles, each a live KPI snapshot
 * that deep-links into its own detail page. Auto-refreshes every 30s.
 *
 * Hero shows the global rollup (X / Y crons green, Z failed jobs, open alerts).
 * Quick-action bar above the grid lets the operator nudge the system without
 * leaving the page:
 *   - "Run orchestrator now" → fires /api/cron/enrichment_orchestrator via the
 *     admin cron-trigger proxy (uses the service key behind the scenes).
 *   - "Reap all stuck jobs" → calls /api/admin/queue/reap-stuck once per task
 *     type and sums the result.
 *   - "Refresh all KPIs" → triggers an immediate summary refetch.
 *
 * Below the category grid the page surfaces three observability blocks that
 * used to be hidden behind /api/admin/env-health JSON:
 *   - Data quality — null %s for ai_win_strategy + opportunity_score with a
 *     "Run backfill" button per tile (POST /api/admin/backfill-enrichment).
 *   - Queue depth — top 5 worker_jobs lanes by pending count + 24h drain.
 *   - Cron last-run table — stalest routes first, deep-links to crons page.
 *
 * A red Sentry-style banner renders at the top when any queue lane has
 * >5000 pending AND zero drain in the last hour (consumer wedged).
 *
 * Auth: admin shell layout already redirects non-admins; every called API
 * runs assertAdmin() too.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
    Activity, RefreshCw, Loader2, AlertCircle, AlertTriangle, CheckCircle2,
    Clock, Database, HardDrive, Plug, Workflow, Bell, Play, Hammer,
    ChevronRight, Gauge, Layers, Siren, ShieldAlert,
} from "lucide-react";
import clsx from "clsx";

interface CategoryKpi {
    status: "green" | "amber" | "red" | "unknown";
    kpis: Array<{ label: string; value: number | string; tone?: "ok" | "warn" | "error" }>;
    detail?: string;
}

interface HealthSummary {
    generated_at: string;
    overall: {
        status: "green" | "amber" | "red";
        headline: string;
        green_count: number;
        amber_count: number;
        red_count: number;
    };
    crons: CategoryKpi;
    queue: CategoryKpi;
    integrations: CategoryKpi;
    database: CategoryKpi;
    storage: CategoryKpi;
    alerts: CategoryKpi;
}

interface DataQualityKpi {
    key: string;
    null_pct: number | null;
    null_count: number | null;
    total: number | null;
    detail?: string;
    last_check: string;
}

interface CronStat {
    route: string;
    last_run: string | null;
    last_status: string | null;
    runs_7d: number;
}

interface RateLimitedKey {
    route: string;
    ip: string;
    hit_count: number;
}

interface EnvHealthPayload {
    data_quality?: DataQualityKpi[];
    cron_summary?: CronStat[];
    rate_limited_keys?: RateLimitedKey[];
}

interface TaskTypeStat {
    pending: number;
    running: number;
    done: number;
    failed: number;
    skipped: number;
    done_5m: number;
    done_30m: number;
    done_60m: number;
    done_24h: number;
}

interface QueueStatsPayload {
    ok: boolean;
    totals: { pending: number; running: number; done: number; failed: number; done_60m: number; done_24h: number };
    by_task_type: Record<string, TaskTypeStat>;
}

const REFRESH_MS = 30_000;

// task_types we'll sweep when "Reap all stuck jobs" is clicked. Mirrors the
// ALLOWED_TASK_TYPES set in lib/worker-jobs/admin-actions.ts.
const REAP_TASK_TYPES = [
    "classify_naics",
    "extract_structured_reqs",
    "extract_keywords",
    "enrich_lead_brief",
    "enrich_lead_apollo",
    "analyze_attachments",
    "scrape_portal_detail",
    "warm_cf_cookie",
];

function fmtRelative(ts: string | null): string {
    if (!ts) return "never";
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
}

// Color bands as documented in the W2.2 wire-up: data-quality tiles go red
// past 30 % null, queue-depth tiles go red past 1000 pending. Anything below
// the green threshold is "ok and shipping" — operator can move on.
function bandForPct(pct: number | null): "green" | "amber" | "red" | "unknown" {
    if (pct == null) return "unknown";
    if (pct < 5) return "green";
    if (pct <= 30) return "amber";
    return "red";
}

function bandForQueue(pending: number): "green" | "amber" | "red" {
    if (pending < 100) return "green";
    if (pending <= 1000) return "amber";
    return "red";
}

function bandClasses(band: "green" | "amber" | "red" | "unknown"): { ring: string; text: string; bg: string; label: string } {
    if (band === "green") return { ring: "border-emerald-200", text: "text-emerald-700", bg: "bg-emerald-50", label: "OK" };
    if (band === "amber") return { ring: "border-amber-200", text: "text-amber-700", bg: "bg-amber-50", label: "Degraded" };
    if (band === "red")   return { ring: "border-rose-200",    text: "text-rose-700",    bg: "bg-rose-50",    label: "Action needed" };
    return                       { ring: "border-stone-200",   text: "text-stone-500",   bg: "bg-stone-50",   label: "No data" };
}

function StatusDot({ status }: { status: CategoryKpi["status"] }) {
    const cls =
        status === "green" ? "bg-emerald-500"
        : status === "amber" ? "bg-amber-500"
        : status === "red" ? "bg-rose-500"
        : "bg-stone-300";
    return (
        <span className={clsx("inline-block w-2.5 h-2.5 rounded-full", cls)} aria-hidden />
    );
}

function CategoryCard({
    icon: Icon,
    title,
    href,
    cat,
}: {
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    href: string;
    cat: CategoryKpi;
}) {
    const accent =
        cat.status === "green" ? "hover:border-emerald-300"
        : cat.status === "amber" ? "hover:border-amber-300"
        : cat.status === "red" ? "hover:border-rose-300"
        : "hover:border-stone-300";

    return (
        <Link
            href={href}
            className={clsx(
                "block bg-white border border-stone-200 rounded-[28px] p-5 transition-all hover:shadow-sm group",
                accent,
            )}
        >
            <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                    <Icon className="w-4 h-4 text-stone-500 flex-shrink-0" />
                    <h3 className="text-sm font-bold text-stone-900 truncate">{title}</h3>
                </div>
                <StatusDot status={cat.status} />
            </div>

            <div className="grid grid-cols-3 gap-2 mb-3">
                {cat.kpis.slice(0, 3).map((k, i) => {
                    const valueColor =
                        k.tone === "ok" ? "text-emerald-700"
                        : k.tone === "warn" ? "text-amber-700"
                        : k.tone === "error" ? "text-rose-700"
                        : "text-stone-900";
                    return (
                        <div key={i} className="min-w-0">
                            <p className={clsx("text-xl font-black tabular-nums truncate", valueColor)}>
                                {k.value}
                            </p>
                            <p className="text-[9px] text-stone-500 uppercase font-bold tracking-wider truncate">
                                {k.label}
                            </p>
                        </div>
                    );
                })}
            </div>

            <div className="flex items-center justify-between text-xs">
                <span className="text-stone-500 truncate">{cat.detail ?? " "}</span>
                <span className="text-stone-400 group-hover:text-emerald-600 transition-colors inline-flex items-center gap-1 font-bold flex-shrink-0">
                    Open <ChevronRight className="w-3 h-3" />
                </span>
            </div>
        </Link>
    );
}

export default function HealthHubPage() {
    const [summary, setSummary] = useState<HealthSummary | null>(null);
    const [envHealth, setEnvHealth] = useState<EnvHealthPayload | null>(null);
    const [queueStats, setQueueStats] = useState<QueueStatsPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);

    // Action button busy + result state
    const [runOrchBusy, setRunOrchBusy] = useState(false);
    const [reapBusy, setReapBusy] = useState(false);
    const [backfillBusy, setBackfillBusy] = useState(false);
    const [toast, setToast] = useState<{ tone: "ok" | "err"; msg: string } | null>(null);

    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const load = useCallback(async () => {
        try {
            setErr(null);
            // Fan out the three calls in parallel — env-health is the slowest
            // (probes upstream APIs) but data-quality lives there too, so we
            // can't skip it. queue-stats is cheap (single Supabase query).
            const [summaryRes, envRes, queueRes] = await Promise.all([
                fetch("/api/admin/health/summary", { cache: "no-store" }),
                fetch("/api/admin/env-health", { cache: "no-store" }),
                fetch("/api/admin/queue-stats", { cache: "no-store" }),
            ]);
            const summaryData = await summaryRes.json();
            if (!summaryRes.ok) throw new Error(summaryData.error || `HTTP ${summaryRes.status}`);
            setSummary(summaryData as HealthSummary);
            if (envRes.ok) {
                setEnvHealth(await envRes.json() as EnvHealthPayload);
            }
            if (queueRes.ok) {
                setQueueStats(await queueRes.json() as QueueStatsPayload);
            }
            setLastRefreshed(new Date().toISOString());
        } catch (e) {
            setErr((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
        intervalRef.current = setInterval(load, REFRESH_MS);
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            intervalRef.current = null;
        };
    }, [load]);

    // Auto-dismiss toasts so the hub doesn't pile up stale messages.
    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 5500);
        return () => clearTimeout(t);
    }, [toast]);

    async function runOrchestrator() {
        if (runOrchBusy) return;
        setRunOrchBusy(true);
        try {
            const res = await fetch("/api/admin/cron-trigger", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ route: "/api/cron/enrichment_orchestrator" }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            const ms = typeof data.elapsed_ms === "number" ? Math.round(data.elapsed_ms) : null;
            setToast({ tone: "ok", msg: `Orchestrator finished${ms !== null ? ` in ${ms} ms` : ""}` });
            // Refresh KPIs once the work has settled.
            load();
        } catch (e) {
            setToast({ tone: "err", msg: `Orchestrator failed: ${(e as Error).message}` });
        } finally {
            setRunOrchBusy(false);
        }
    }

    async function reapAllStuck() {
        if (reapBusy) return;
        setReapBusy(true);
        // reap_stale_jobs is global per call; we still loop the task_type
        // allow-list so the audit log records who reaped what (and so any
        // future per-task-type reaper drops in without UI changes).
        let totalRequeued = 0;
        let totalFailed = 0;
        const errors: string[] = [];
        try {
            for (const tt of REAP_TASK_TYPES) {
                try {
                    const res = await fetch(`/api/admin/queue/reap-stuck?task_type=${encodeURIComponent(tt)}&stale_minutes=10`, {
                        method: "POST",
                    });
                    const data = await res.json();
                    if (!res.ok || !data.ok) {
                        errors.push(`${tt}: ${data.error || res.status}`);
                        continue;
                    }
                    totalRequeued += Number(data.requeued || 0);
                    totalFailed += Number(data.failed || 0);
                    // Reaper is global; one call sweeps every type. Bail after the
                    // first successful sweep to avoid 7 redundant audit entries.
                    break;
                } catch (e) {
                    errors.push(`${tt}: ${(e as Error).message}`);
                }
            }
            if (errors.length === REAP_TASK_TYPES.length) {
                throw new Error(errors[0] || "All reap attempts failed");
            }
            setToast({
                tone: "ok",
                msg: `Reaper finished: ${totalRequeued} requeued, ${totalFailed} marked failed`,
            });
            load();
        } catch (e) {
            setToast({ tone: "err", msg: `Reap failed: ${(e as Error).message}` });
        } finally {
            setReapBusy(false);
        }
    }

    async function runBackfill(only: "strategic" | "requirements" | "both" = "both") {
        if (backfillBusy) return;
        setBackfillBusy(true);
        try {
            const res = await fetch("/api/admin/backfill-enrichment", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ limit: 5000, only }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            const updated = (data.scoring_updated ?? 0) + (data.reqs_updated ?? 0);
            setToast({
                tone: "ok",
                msg: `Backfill finished: ${updated} rows updated (${data.scoring_updated ?? 0} scoring, ${data.reqs_updated ?? 0} requirements)`,
            });
            load();
        } catch (e) {
            setToast({ tone: "err", msg: `Backfill failed: ${(e as Error).message}` });
        } finally {
            setBackfillBusy(false);
        }
    }

    // Sentry-style alert: surface lanes that are sitting on >5000 pending jobs
    // AND haven't drained anything in the last hour. The combination is the
    // signal — pending alone is just a backlog; pending + no drain means the
    // consumer is wedged.
    const stuckLanes: Array<{ task_type: string; pending: number }> = (() => {
        if (!queueStats?.by_task_type) return [];
        return Object.entries(queueStats.by_task_type)
            .filter(([, s]) => s.pending > 5000 && s.done_60m === 0)
            .map(([task_type, s]) => ({ task_type, pending: s.pending }))
            .sort((a, b) => b.pending - a.pending);
    })();

    const overallStatus = summary?.overall.status;
    const overallIcon =
        overallStatus === "green" ? CheckCircle2
        : overallStatus === "amber" ? AlertTriangle
        : overallStatus === "red" ? AlertCircle
        : Activity;
    const overallColor =
        overallStatus === "green" ? "text-emerald-600"
        : overallStatus === "amber" ? "text-amber-600"
        : overallStatus === "red" ? "text-rose-600"
        : "text-stone-400";

    const OverallIcon = overallIcon;

    return (
        <div className="w-full max-w-5xl mx-auto space-y-6">
            {/* Hero */}
            <header className="space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400 mb-1.5">Operations</p>
                        <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
                            <Activity className="w-6 h-6" /> System Health
                        </h1>
                        <p className="text-sm text-stone-500 mt-1">
                            One-screen view of every cron, queue, integration, table, bucket, and alert. Auto-refresh every {REFRESH_MS / 1000}s.
                        </p>
                    </div>
                    <div className="text-xs text-stone-500 flex items-center gap-1.5">
                        <Clock className="w-3 h-3" />
                        {lastRefreshed ? `Updated ${fmtRelative(lastRefreshed)}` : "Loading…"}
                    </div>
                </div>

                {/* Global rollup strip */}
                {summary && (
                    <div className="bg-white border border-stone-200 rounded-[28px] p-5 flex items-center gap-4 flex-wrap">
                        <OverallIcon className={clsx("w-8 h-8 flex-shrink-0", overallColor)} />
                        <div className="flex-1 min-w-0">
                            <p className={clsx(
                                "text-[10px] font-bold uppercase tracking-[0.18em] mb-0.5",
                                overallStatus === "green" ? "text-emerald-600"
                                : overallStatus === "amber" ? "text-amber-600"
                                : "text-rose-600",
                            )}>
                                {overallStatus === "green" ? "All systems operational"
                                : overallStatus === "amber" ? "Degraded"
                                : "Action needed"}
                            </p>
                            <p className="text-sm text-stone-700 truncate">{summary.overall.headline || "—"}</p>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                            <span className="inline-flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                <span className="font-bold tabular-nums">{summary.overall.green_count}</span>
                                <span className="text-stone-500">green</span>
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-amber-500" />
                                <span className="font-bold tabular-nums">{summary.overall.amber_count}</span>
                                <span className="text-stone-500">degraded</span>
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-rose-500" />
                                <span className="font-bold tabular-nums">{summary.overall.red_count}</span>
                                <span className="text-stone-500">failing</span>
                            </span>
                        </div>
                    </div>
                )}
            </header>

            {/* Sentry-style stuck-lane alert — only renders when a lane has
                >5000 pending AND zero drain in the last hour. Picks up the
                cases the category roll-up smooths over. */}
            {stuckLanes.length > 0 && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-[28px] p-5 flex items-start gap-3">
                    <Siren className="w-6 h-6 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-rose-600 mb-1">Queue stalled</p>
                        <p className="text-sm font-bold mb-1.5">
                            {stuckLanes.length === 1
                                ? `Lane "${stuckLanes[0].task_type}" is wedged`
                                : `${stuckLanes.length} lanes are wedged`}
                        </p>
                        <p className="text-xs text-rose-700 mb-2">
                            Pending {">"} 5000 and nothing drained in the last hour. The consumer is probably crashed — check the Railway worker or run the orchestrator.
                        </p>
                        <ul className="text-xs space-y-0.5">
                            {stuckLanes.slice(0, 5).map((l) => (
                                <li key={l.task_type} className="flex items-center gap-2">
                                    <span className="font-mono font-bold">{l.task_type}</span>
                                    <span className="tabular-nums">{l.pending.toLocaleString()} pending</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}

            {/* Quick actions */}
            <section className="flex items-center gap-2 flex-wrap">
                <button
                    type="button"
                    onClick={runOrchestrator}
                    disabled={runOrchBusy}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 text-white border border-emerald-600 text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {runOrchBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    Run orchestrator now
                </button>
                <button
                    type="button"
                    onClick={reapAllStuck}
                    disabled={reapBusy}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-stone-200 text-stone-700 text-xs font-bold hover:bg-stone-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {reapBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Hammer className="w-3.5 h-3.5" />}
                    Reap all stuck jobs
                </button>
                <button
                    type="button"
                    onClick={load}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-stone-200 text-stone-700 text-xs font-bold hover:bg-stone-50 disabled:opacity-50"
                >
                    {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Refresh all KPIs
                </button>

                {toast && (
                    <div
                        className={clsx(
                            "ml-auto text-xs font-medium px-3 py-1.5 rounded-xl border",
                            toast.tone === "ok"
                                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                                : "bg-rose-50 border-rose-200 text-rose-700",
                        )}
                    >
                        {toast.msg}
                    </div>
                )}
            </section>

            {err && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl p-4">
                    {err}
                </div>
            )}

            {/* Category grid */}
            {summary ? (
                <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <CategoryCard icon={Clock}    title="Crons"        href="/admin/health/crons"        cat={summary.crons} />
                    <CategoryCard icon={Workflow} title="Worker Queue" href="/admin/health/queue"        cat={summary.queue} />
                    <CategoryCard icon={Plug}     title="Integrations" href="/admin/health/integrations" cat={summary.integrations} />
                    <CategoryCard icon={Database} title="Database"     href="/admin/health/database"     cat={summary.database} />
                    <CategoryCard icon={HardDrive} title="Storage"     href="/admin/health/storage"      cat={summary.storage} />
                    <CategoryCard icon={Bell}     title="Alerts"       href="/admin/health/alerts"       cat={summary.alerts} />
                </section>
            ) : (
                loading && (
                    <div className="flex justify-center py-12">
                        <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
                    </div>
                )
            )}

            {/* Data quality — null %s for ai_win_strategy + opportunity_score.
                These were the two columns that silently regressed in April
                (audit fixes #8 + #9); surfacing them here keeps the burndown
                visible so it can't regress again without anyone noticing. */}
            {envHealth?.data_quality && envHealth.data_quality.length > 0 && (
                <section className="space-y-3">
                    <div className="flex items-center gap-2">
                        <Gauge className="w-4 h-4 text-stone-500" />
                        <h2 className="text-sm font-bold text-stone-900">Data quality</h2>
                        <span className="text-xs text-stone-500">— null coverage on key opportunity columns</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {envHealth.data_quality.map((dq) => {
                            const band = bandForPct(dq.null_pct);
                            const cls = bandClasses(band);
                            const friendlyName =
                                dq.key === "null_ai_win_strategy_pct" ? "AI win strategy" :
                                dq.key === "null_opportunity_score_pct" ? "Opportunity score" :
                                dq.key;
                            const backfillTarget: "strategic" | "requirements" | "both" =
                                dq.key === "null_ai_win_strategy_pct" ? "strategic"
                                : dq.key === "null_opportunity_score_pct" ? "strategic"
                                : "both";
                            return (
                                <div
                                    key={dq.key}
                                    className={clsx(
                                        "bg-white border rounded-[28px] p-5 space-y-3",
                                        cls.ring,
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400 mb-1">{friendlyName}</p>
                                            <p className={clsx("text-3xl font-black tabular-nums", cls.text)}>
                                                {dq.null_pct == null ? "—" : `${dq.null_pct}%`}
                                            </p>
                                            <p className="text-xs text-stone-500 mt-0.5">
                                                {dq.null_count != null && dq.total != null
                                                    ? `${dq.null_count.toLocaleString()} / ${dq.total.toLocaleString()} null`
                                                    : "no signal"}
                                            </p>
                                        </div>
                                        <span className={clsx(
                                            "text-[10px] font-bold uppercase tracking-[0.18em] px-2 py-1 rounded-lg",
                                            cls.bg, cls.text,
                                        )}>
                                            {cls.label}
                                        </span>
                                    </div>
                                    {dq.detail && (
                                        <p className="text-xs text-stone-500">{dq.detail}</p>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => runBackfill(backfillTarget)}
                                        disabled={backfillBusy || band === "green"}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-900 text-white text-xs font-bold hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {backfillBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                                        Run backfill (5000 rows)
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* Queue depth — top 5 lanes by pending count plus their 24-hour
                drain rate. Color band keys off pending; drain is the secondary
                signal that catches "lots pending but the consumer is fine". */}
            {queueStats?.by_task_type && (
                <section className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <Layers className="w-4 h-4 text-stone-500" />
                            <h2 className="text-sm font-bold text-stone-900">Queue depth</h2>
                            <span className="text-xs text-stone-500">— top 5 worker_jobs lanes by pending</span>
                        </div>
                        <Link
                            href="/admin/queue"
                            className="text-xs text-emerald-700 hover:text-emerald-800 font-bold inline-flex items-center gap-1"
                        >
                            Open queue <ChevronRight className="w-3 h-3" />
                        </Link>
                    </div>
                    <div className="bg-white border border-stone-200 rounded-[28px] p-5">
                        {(() => {
                            const top = Object.entries(queueStats.by_task_type)
                                .map(([task_type, s]) => ({ task_type, ...s }))
                                .sort((a, b) => b.pending - a.pending)
                                .slice(0, 5);
                            if (top.length === 0 || top[0].pending === 0) {
                                return (
                                    <p className="text-sm text-stone-500">No pending jobs in any lane. Queue is idle.</p>
                                );
                            }
                            return (
                                <ul className="divide-y divide-stone-100">
                                    {top.map((lane) => {
                                        const band = bandForQueue(lane.pending);
                                        const cls = bandClasses(band);
                                        return (
                                            <li key={lane.task_type} className="py-3 first:pt-0 last:pb-0 flex items-center gap-4">
                                                <span className={clsx("w-2.5 h-2.5 rounded-full flex-shrink-0",
                                                    band === "green" ? "bg-emerald-500"
                                                    : band === "amber" ? "bg-amber-500"
                                                    : "bg-rose-500",
                                                )} aria-hidden />
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-mono text-sm font-bold text-stone-900 truncate">{lane.task_type}</p>
                                                    <p className="text-[11px] text-stone-500">
                                                        {lane.running.toLocaleString()} running · {lane.failed.toLocaleString()} failed · {lane.done_24h.toLocaleString()} drained 24h
                                                    </p>
                                                </div>
                                                <div className="text-right">
                                                    <p className={clsx("text-lg font-black tabular-nums", cls.text)}>
                                                        {lane.pending.toLocaleString()}
                                                    </p>
                                                    <p className="text-[9px] text-stone-500 uppercase font-bold tracking-wider">pending</p>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            );
                        })()}
                    </div>
                </section>
            )}

            {/* Top rate-limited keys (last 60s). Reads from the
                `top_rate_limited_60s` view (migration 142) so the operator can
                spot an IP hammering a public endpoint without diving into
                Vercel logs. Counts above the per-route maxPerMin show as red. */}
            {envHealth?.rate_limited_keys && envHealth.rate_limited_keys.length > 0 && (
                <section className="space-y-3">
                    <div className="flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-stone-500" />
                        <h2 className="text-sm font-bold text-stone-900">Rate-limited keys</h2>
                        <span className="text-xs text-stone-500">— top callers hitting <span className="font-mono">protectCrawl</span> in the last 60s</span>
                    </div>
                    <div className="bg-white border border-stone-200 rounded-[28px] overflow-hidden">
                        <table className="w-full text-xs">
                            <thead className="bg-stone-50 text-stone-500 uppercase tracking-wider">
                                <tr>
                                    <th className="text-left font-bold px-4 py-2">Route</th>
                                    <th className="text-left font-bold px-4 py-2">IP</th>
                                    <th className="text-right font-bold px-4 py-2">Hits (60s)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-stone-100">
                                {envHealth.rate_limited_keys.slice(0, 10).map((r, i) => {
                                    // Anything above 5 in a 60s window is louder than
                                    // any single user form-fill should be; flag in amber.
                                    // Above 10 = almost certainly automated, flag red.
                                    const tone =
                                        r.hit_count > 10 ? "text-rose-700"
                                        : r.hit_count > 5 ? "text-amber-700"
                                        : "text-stone-700";
                                    return (
                                        <tr key={`${r.route}-${r.ip}-${i}`}>
                                            <td className="px-4 py-2 font-mono font-bold text-stone-900 truncate max-w-xs">{r.route}</td>
                                            <td className="px-4 py-2 font-mono text-stone-600 truncate max-w-xs">{r.ip}</td>
                                            <td className={clsx("px-4 py-2 text-right font-black tabular-nums", tone)}>
                                                {r.hit_count.toLocaleString()}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            {/* Cron summary — stalest-first table of every route that ran in
                the last 7 days. Lets the operator spot a route that silently
                stopped firing without bouncing to /admin/health/crons. */}
            {envHealth?.cron_summary && envHealth.cron_summary.length > 0 && (
                <section className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-stone-500" />
                            <h2 className="text-sm font-bold text-stone-900">Cron last-run</h2>
                            <span className="text-xs text-stone-500">— stalest routes first (7-day window)</span>
                        </div>
                        <Link
                            href="/admin/health/crons"
                            className="text-xs text-emerald-700 hover:text-emerald-800 font-bold inline-flex items-center gap-1"
                        >
                            Full cron health <ChevronRight className="w-3 h-3" />
                        </Link>
                    </div>
                    <div className="bg-white border border-stone-200 rounded-[28px] overflow-hidden">
                        <table className="w-full text-xs">
                            <thead className="bg-stone-50 text-stone-500 uppercase tracking-wider">
                                <tr>
                                    <th className="text-left font-bold px-4 py-2">Route</th>
                                    <th className="text-left font-bold px-4 py-2">Last run</th>
                                    <th className="text-left font-bold px-4 py-2">Status</th>
                                    <th className="text-right font-bold px-4 py-2">Runs 7d</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-stone-100">
                                {envHealth.cron_summary.slice(0, 12).map((c) => {
                                    const ok = c.last_status === "ok" || c.last_status === "success";
                                    return (
                                        <tr key={c.route}>
                                            <td className="px-4 py-2 font-mono text-stone-900 truncate max-w-xs">{c.route}</td>
                                            <td className="px-4 py-2 text-stone-700">{fmtRelative(c.last_run)}</td>
                                            <td className={clsx(
                                                "px-4 py-2 font-bold",
                                                ok ? "text-emerald-700" : c.last_status ? "text-rose-700" : "text-stone-400",
                                            )}>
                                                {c.last_status ?? "—"}
                                            </td>
                                            <td className="px-4 py-2 text-right tabular-nums text-stone-700">{c.runs_7d}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}
        </div>
    );
}
