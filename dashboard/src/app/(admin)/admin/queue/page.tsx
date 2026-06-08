"use client";

/**
 * /admin/queue — Worker queue overview.
 *
 * Lives inside the (admin) layout (gated by the layout's account_type check)
 * and supersedes the older /admin/queue page that lived under (public). Each
 * task_type row is a Link to /admin/health/queue/[task_type] for drill-in,
 * actions, and per-status sample rows.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    Activity, Loader2, RefreshCw, Cookie, AlertTriangle, CheckCircle2,
    ChevronRight,
} from "lucide-react";
import clsx from "clsx";
import { HealthCard } from "@/components/admin/health/HealthCard";
import { ActionButton } from "@/components/admin/health/ActionButton";

interface QueueStats {
    ok: boolean;
    totals: { pending: number; running: number; done: number; failed: number; done_5m: number; done_30m: number; done_60m: number };
    by_task_type: Record<string, {
        pending: number; running: number; done: number; failed: number; skipped: number;
        done_5m: number; done_30m: number; done_60m: number;
    }>;
    portal_cookies: { count: number; hosts: { host: string; fetched_at: string; expires_at: string | null; use_count: number }[] };
    as_of: string;
}

export default function QueuePage() {
    const [data, setData] = useState<QueueStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    async function refresh() {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/queue-stats", { cache: "no-store" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            setData(json);
            setError(null);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        refresh();
        const t = setInterval(refresh, 10_000);
        return () => clearInterval(t);
    }, []);

    if (!data && loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 text-stone-400 animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="max-w-md mx-auto bg-rose-50 border border-rose-200 rounded-2xl p-6">
                <h1 className="font-bold text-rose-700 mb-2">Queue stats unavailable</h1>
                <p className="text-sm text-rose-600">{error}</p>
            </div>
        );
    }

    if (!data) return null;

    const totalRows = Object.values(data.by_task_type).reduce(
        (a, b) => a + b.pending + b.running + b.done + b.failed, 0,
    );

    return (
        <div className="w-full max-w-6xl mx-auto space-y-6">
            <header className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400 mb-1.5">Operations</p>
                    <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
                        <Activity className="w-6 h-6 text-emerald-600" /> Worker Queue
                    </h1>
                    <p className="text-sm text-stone-500 mt-1">
                        Auto-refreshes every 10s. Click any task type for drill-in, sample rows, and per-task actions. As of {new Date(data.as_of).toLocaleTimeString()}.
                    </p>
                </div>
                <ActionButton onClick={refresh} loading={loading} icon={RefreshCw}>Refresh</ActionButton>
            </header>

            {/* Top-line KPIs — reuses the shared HealthCard so this looks
                identical to the /admin/health env-health KPI strip. */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <HealthCard label="Pending" title="Awaiting" value={data.totals.pending.toLocaleString()} valueTone={data.totals.pending > 100 ? "warn" : "default"} />
                <HealthCard label="Running" title="In flight" value={data.totals.running.toLocaleString()} valueTone={data.totals.running > 0 ? "ok" : "default"} />
                <HealthCard label="Done (24h sample)" title="Completed" value={data.totals.done.toLocaleString()} valueTone="ok" />
                <HealthCard label="Failed" title="Errors" value={data.totals.failed.toLocaleString()} valueTone={data.totals.failed > 0 ? "error" : "default"} />
            </div>

            {/* Throughput */}
            <div className="bg-white rounded-[28px] border border-stone-200 p-5">
                <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-stone-500 mb-3">Throughput</h2>
                <div className="grid grid-cols-3 gap-3">
                    <Throughput label="last 5 min" value={data.totals.done_5m} />
                    <Throughput label="last 30 min" value={data.totals.done_30m} />
                    <Throughput label="last 60 min" value={data.totals.done_60m} />
                </div>
            </div>

            {/* Per-task-type table — every row is a Link to the detail page */}
            <div className="bg-white rounded-[28px] border border-stone-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-stone-100">
                    <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-stone-500">By task type</h2>
                    <p className="text-[10px] text-stone-400 mt-0.5">Sorted by active load (pending + running).</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-stone-50">
                            <tr className="text-left">
                                <th className="px-4 py-2 font-bold text-stone-600 text-[10px] uppercase tracking-wider">Task</th>
                                <th className="px-4 py-2 font-bold text-amber-700 text-[10px] uppercase tracking-wider">Pending</th>
                                <th className="px-4 py-2 font-bold text-blue-700 text-[10px] uppercase tracking-wider">Running</th>
                                <th className="px-4 py-2 font-bold text-emerald-700 text-[10px] uppercase tracking-wider">Done</th>
                                <th className="px-4 py-2 font-bold text-rose-700 text-[10px] uppercase tracking-wider">Failed</th>
                                <th className="px-4 py-2 font-bold text-emerald-600 text-[10px] uppercase tracking-wider">/5m</th>
                                <th className="px-4 py-2 font-bold text-emerald-600 text-[10px] uppercase tracking-wider">/60m</th>
                                <th className="px-4 py-2"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {Object.entries(data.by_task_type)
                                .sort((a, b) => (b[1].pending + b[1].running) - (a[1].pending + a[1].running))
                                .map(([task, b]) => (
                                    <tr
                                        key={task}
                                        className="border-t border-stone-100 hover:bg-emerald-50/40 cursor-pointer group transition-colors"
                                        onClick={(e) => {
                                            // Click anywhere in the row triggers navigation, except on
                                            // the explicit chevron link which already handles it.
                                            const target = e.target as HTMLElement;
                                            if (target.closest("a")) return;
                                            window.location.href = `/admin/health/queue/${encodeURIComponent(task)}`;
                                        }}
                                    >
                                        <td className="px-4 py-2 font-mono text-xs text-stone-800">
                                            <Link
                                                href={`/admin/health/queue/${encodeURIComponent(task)}`}
                                                className="hover:text-emerald-700 hover:underline"
                                            >
                                                {task}
                                            </Link>
                                        </td>
                                        <td className="px-4 py-2 font-mono text-stone-700">{b.pending}</td>
                                        <td className={clsx("px-4 py-2 font-mono", b.running > 0 ? "text-blue-700 font-bold" : "text-stone-400")}>{b.running}</td>
                                        <td className="px-4 py-2 font-mono text-stone-700">{b.done}</td>
                                        <td className={clsx("px-4 py-2 font-mono", b.failed > 0 ? "text-rose-700 font-bold" : "text-stone-400")}>{b.failed}</td>
                                        <td className="px-4 py-2 font-mono text-emerald-700">{b.done_5m}</td>
                                        <td className="px-4 py-2 font-mono text-emerald-700">{b.done_60m}</td>
                                        <td className="px-2 py-2 text-stone-300 group-hover:text-emerald-500">
                                            <ChevronRight className="w-4 h-4" />
                                        </td>
                                    </tr>
                                ))}
                            {Object.keys(data.by_task_type).length === 0 && (
                                <tr>
                                    <td colSpan={8} className="px-4 py-6 text-center text-stone-400 text-sm">
                                        No jobs in queue.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Portal cookies — kept exactly as in the legacy page */}
            <div className="bg-white rounded-[28px] border border-stone-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-stone-100 flex items-center gap-2">
                    <Cookie className="w-4 h-4 text-amber-600" />
                    <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-stone-500">
                        Portal cookies ({data.portal_cookies.count})
                    </h2>
                </div>
                {data.portal_cookies.hosts.length === 0 ? (
                    <div className="px-4 py-6 text-center text-stone-400 text-sm">No cookies cached yet.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-stone-50">
                                <tr className="text-left">
                                    <th className="px-4 py-2 font-bold text-stone-600 text-[10px] uppercase">Host</th>
                                    <th className="px-4 py-2 font-bold text-stone-600 text-[10px] uppercase">Fetched</th>
                                    <th className="px-4 py-2 font-bold text-stone-600 text-[10px] uppercase">Expires</th>
                                    <th className="px-4 py-2 font-bold text-stone-600 text-[10px] uppercase">Used</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.portal_cookies.hosts.map(h => {
                                    const expired = h.expires_at ? new Date(h.expires_at).getTime() < Date.now() : false;
                                    return (
                                        <tr key={h.host} className="border-t border-stone-100">
                                            <td className="px-4 py-2 font-mono text-xs">{h.host}</td>
                                            <td className="px-4 py-2 text-xs text-stone-500">{new Date(h.fetched_at).toLocaleTimeString()}</td>
                                            <td className={clsx(
                                                "px-4 py-2 text-xs flex items-center gap-1",
                                                expired ? "text-rose-600" : "text-emerald-700",
                                            )}>
                                                {expired ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                                                {h.expires_at ? new Date(h.expires_at).toLocaleTimeString() : "—"}
                                            </td>
                                            <td className="px-4 py-2 text-xs font-mono text-stone-700">{h.use_count}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <p className="text-xs text-stone-400 text-center pt-4">
                Total job rows in DB sample: {totalRows.toLocaleString()}
            </p>
        </div>
    );
}

function Throughput({ label, value }: { label: string; value: number }) {
    return (
        <div className="text-center">
            <p className="text-2xl font-black text-emerald-700 tabular-nums">{value.toLocaleString()}</p>
            <p className="text-[10px] text-stone-500 uppercase tracking-[0.18em] mt-1">{label}</p>
        </div>
    );
}
