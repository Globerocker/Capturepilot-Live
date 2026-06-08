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
 * Auth: admin shell layout already redirects non-admins; every called API
 * runs assertAdmin() too.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
    Activity, RefreshCw, Loader2, AlertCircle, AlertTriangle, CheckCircle2,
    Clock, Database, HardDrive, Plug, Workflow, Bell, Play, Hammer,
    ChevronRight,
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
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);

    // Action button busy + result state
    const [runOrchBusy, setRunOrchBusy] = useState(false);
    const [reapBusy, setReapBusy] = useState(false);
    const [toast, setToast] = useState<{ tone: "ok" | "err"; msg: string } | null>(null);

    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const load = useCallback(async () => {
        try {
            setErr(null);
            const res = await fetch("/api/admin/health/summary", { cache: "no-store" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            setSummary(data as HealthSummary);
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
        </div>
    );
}
