"use client";

/**
 * /admin/health/crons — list view of every scheduled cron in vercel.json,
 * cross-referenced with `cron_runs` for last-run + 24h success-rate metrics.
 *
 * Sister page of /admin/crons (telemetry-first). This page is health-first:
 * sorted worst-first, every row links to a per-cron detail page that exposes
 * the last 50 runs + a "Run now" button + a GitHub source link.
 *
 * Auth: admin shell layout already redirects non-admins; the underlying API
 * also runs `assertAdmin()`.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    Loader2, RefreshCw, Activity, ArrowLeft, CheckCircle2,
    AlertCircle, AlertTriangle, HelpCircle, ChevronRight, Search,
} from "lucide-react";
import clsx from "clsx";
import { HealthBadge, RunStatusBadge } from "@/components/admin/health/CronBadges";
import { ActionButton } from "@/components/admin/health/ActionButton";
import { fmtRelative, fmtInterval, fmtMs } from "@/lib/format-time";

interface CronOverview {
    route: string;
    schedule: string;
    schedule_label: string;
    expected_interval_ms: number | null;
    next_run_at: string | null;
    last_run_at: string | null;
    last_status: string | null;
    last_error: string | null;
    last_elapsed_ms: number | null;
    runs_24h: number;
    ok_24h: number;
    error_24h: number;
    success_rate_24h: number | null;
    runs_7d: number;
    health: "green" | "amber" | "red" | "unknown";
}

interface ApiResponse {
    crons: CronOverview[];
    total: number;
    generated_at: string;
}

export default function CronsHealthPage() {
    const [data, setData] = useState<ApiResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [filter, setFilter] = useState("");
    const [autoRefresh, setAutoRefresh] = useState(false);

    async function load() {
        setLoading(true);
        setErr(null);
        try {
            const res = await fetch("/api/admin/cron-detail", { cache: "no-store" });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
            setData(body);
        } catch (e) {
            setErr((e as Error).message);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { load(); }, []);
    useEffect(() => {
        if (!autoRefresh) return;
        const t = setInterval(load, 30_000);
        return () => clearInterval(t);
    }, [autoRefresh]);

    // Roll-up KPI counts for the header strip
    const total = data?.crons.length ?? 0;
    const green = data?.crons.filter(c => c.health === "green").length ?? 0;
    const amber = data?.crons.filter(c => c.health === "amber").length ?? 0;
    const red = data?.crons.filter(c => c.health === "red").length ?? 0;

    const filtered = (data?.crons || []).filter(c => {
        if (!filter.trim()) return true;
        const q = filter.toLowerCase();
        return c.route.toLowerCase().includes(q) || c.schedule_label.toLowerCase().includes(q);
    });

    return (
        <div className="w-full max-w-6xl mx-auto space-y-6">
            {/* Header */}
            <header className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <Link
                        href="/admin/health"
                        className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.18em] text-stone-400 mb-1.5 hover:text-emerald-600"
                    >
                        <ArrowLeft className="w-3 h-3" /> Health
                    </Link>
                    <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
                        <Activity className="w-6 h-6 text-emerald-600" /> Cron Health
                    </h1>
                    <p className="text-sm text-stone-500 mt-1">
                        Every scheduled cron from <code className="text-xs bg-stone-100 px-1 rounded">vercel.json</code>{" "}
                        joined with the last 7 days of <code className="text-xs bg-stone-100 px-1 rounded">cron_runs</code>.
                        Sorted worst-first. Click a row to inspect run history.
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <label className="inline-flex items-center gap-1.5 text-[11px] text-stone-600 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={autoRefresh}
                            onChange={e => setAutoRefresh(e.target.checked)}
                            className="rounded accent-emerald-600"
                        />
                        Auto-refresh 30s
                    </label>
                    <ActionButton onClick={load} loading={loading} icon={RefreshCw}>
                        Refresh
                    </ActionButton>
                </div>
            </header>

            {/* KPI strip */}
            {data && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-white border border-stone-200 rounded-[28px] p-4">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 mb-1" />
                        <p className="text-2xl font-black text-emerald-600 tabular-nums">{green}</p>
                        <p className="text-[10px] text-stone-500 uppercase tracking-wider">Fresh</p>
                    </div>
                    <div className="bg-white border border-stone-200 rounded-[28px] p-4">
                        <AlertTriangle className="w-4 h-4 text-amber-500 mb-1" />
                        <p className="text-2xl font-black text-amber-600 tabular-nums">{amber}</p>
                        <p className="text-[10px] text-stone-500 uppercase tracking-wider">Stale</p>
                    </div>
                    <div className="bg-white border border-stone-200 rounded-[28px] p-4">
                        <AlertCircle className="w-4 h-4 text-rose-500 mb-1" />
                        <p className="text-2xl font-black text-rose-600 tabular-nums">{red}</p>
                        <p className="text-[10px] text-stone-500 uppercase tracking-wider">Down</p>
                    </div>
                    <div className="bg-white border border-stone-200 rounded-[28px] p-4">
                        <Activity className="w-4 h-4 text-blue-500 mb-1" />
                        <p className="text-2xl font-black text-blue-600 tabular-nums">{total}</p>
                        <p className="text-[10px] text-stone-500 uppercase tracking-wider">Total Crons</p>
                    </div>
                </div>
            )}

            {err && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-2xl p-4">
                    {err}
                </div>
            )}

            {/* Filter input */}
            {data && (
                <div className="relative">
                    <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                        type="text"
                        placeholder="Filter by route name or schedule…"
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                        className="w-full bg-white border border-stone-200 rounded-2xl pl-9 pr-3 py-2 text-sm focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 outline-none"
                    />
                </div>
            )}

            {/* Cron list */}
            {data && (
                <div className="bg-white border border-stone-200 rounded-[28px] overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-stone-50 text-[10px] text-stone-400 uppercase tracking-wider">
                            <tr>
                                <th className="text-left px-4 py-2.5 font-bold">Route</th>
                                <th className="text-left px-3 py-2.5 font-bold">Schedule</th>
                                <th className="text-center px-3 py-2.5 font-bold">Health</th>
                                <th className="text-center px-3 py-2.5 font-bold">Last Run</th>
                                <th className="text-center px-3 py-2.5 font-bold">Last Status</th>
                                <th className="text-right px-3 py-2.5 font-bold">24h</th>
                                <th className="text-right px-3 py-2.5 font-bold">Success</th>
                                <th className="text-right px-3 py-2.5 font-bold">Next Run</th>
                                <th className="w-10" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100">
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="text-center text-stone-400 text-xs py-8">
                                        {data.crons.length === 0
                                            ? "No crons found in vercel.json"
                                            : `No crons match "${filter}"`}
                                    </td>
                                </tr>
                            ) : filtered.map(c => {
                                const slug = c.route.replace("/api/cron/", "");
                                const detailHref = `/admin/health/crons/${encodeURIComponent(slug)}`;
                                return (
                                    <tr
                                        key={c.route}
                                        className={clsx(
                                            "hover:bg-stone-50/60 transition-colors",
                                            c.health === "red" && "bg-rose-50/30",
                                            c.health === "amber" && "bg-amber-50/30",
                                        )}
                                    >
                                        <td className="px-4 py-2.5">
                                            <Link
                                                href={detailHref}
                                                className="font-mono text-xs text-stone-800 hover:text-emerald-700 font-semibold"
                                            >
                                                {slug}
                                            </Link>
                                        </td>
                                        <td className="px-3 py-2.5 text-xs text-stone-600">
                                            {c.schedule_label}
                                        </td>
                                        <td className="px-3 py-2.5 text-center">
                                            <HealthBadge health={c.health} />
                                        </td>
                                        <td className="px-3 py-2.5 text-center text-xs text-stone-600 tabular-nums">
                                            {fmtRelative(c.last_run_at)}
                                        </td>
                                        <td className="px-3 py-2.5 text-center">
                                            <RunStatusBadge status={c.last_status} />
                                        </td>
                                        <td className="px-3 py-2.5 text-right text-xs font-mono text-stone-700 tabular-nums">
                                            {c.runs_24h}
                                        </td>
                                        <td className="px-3 py-2.5 text-right text-xs font-mono tabular-nums">
                                            {c.success_rate_24h == null ? (
                                                <span className="text-stone-400">—</span>
                                            ) : (
                                                <span className={clsx(
                                                    c.success_rate_24h === 100 ? "text-emerald-700" :
                                                    c.success_rate_24h >= 80 ? "text-amber-700" :
                                                    "text-rose-700",
                                                )}>
                                                    {c.success_rate_24h}%
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2.5 text-right text-xs text-stone-500 tabular-nums">
                                            {c.next_run_at ? fmtInterval(new Date(c.next_run_at).getTime() - Date.now()) : "—"}
                                        </td>
                                        <td className="px-2 py-2.5 text-right">
                                            <Link
                                                href={detailHref}
                                                className="text-stone-300 hover:text-emerald-500 inline-flex"
                                                title="View detail"
                                            >
                                                <ChevronRight className="w-4 h-4" />
                                            </Link>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Legend */}
            {data && (
                <div className="flex flex-wrap items-center gap-3 text-[10px] text-stone-500">
                    <span className="font-bold uppercase tracking-widest text-stone-400">Health</span>
                    <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-emerald-500" /> last run ≤ 1.5× interval</span>
                    <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-amber-500" /> last run 1.5-3× interval</span>
                    <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-rose-500" /> last run &gt; 3× interval or never</span>
                    <span className="inline-flex items-center gap-1.5"><HelpCircle className="size-3 text-stone-400" /> schedule not parseable</span>
                </div>
            )}

            {data && (
                <p className="text-[10px] text-stone-400">
                    Generated {fmtRelative(data.generated_at)} · {fmtMs(data.crons.reduce((a, c) => a + (c.last_elapsed_ms || 0), 0))} total last-run time
                </p>
            )}

            {loading && !data && (
                <div className="flex justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
                </div>
            )}
        </div>
    );
}
