"use client";

import { useEffect, useState } from "react";
import { Activity, Loader2, RefreshCw, Cookie, AlertTriangle, CheckCircle2 } from "lucide-react";
import clsx from "clsx";

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
        const t = setInterval(refresh, 10_000); // auto-refresh every 10s
        return () => clearInterval(t);
    }, []);

    if (!data && loading) {
        return (
            <main className="min-h-screen bg-stone-50 flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-stone-400 animate-spin" />
            </main>
        );
    }

    if (error) {
        return (
            <main className="min-h-screen bg-stone-50 px-6 py-10">
                <div className="max-w-md mx-auto bg-red-50 border border-red-200 rounded-2xl p-6">
                    <h1 className="font-bold text-red-700 mb-2">Queue stats unavailable</h1>
                    <p className="text-sm text-red-600">{error}</p>
                </div>
            </main>
        );
    }

    if (!data) return null;

    const totalRows = Object.values(data.by_task_type).reduce((a, b) => a + b.pending + b.running + b.done + b.failed, 0);

    return (
        <main className="min-h-screen bg-stone-50 px-4 sm:px-6 py-8">
            <div className="max-w-6xl mx-auto space-y-6">
                <header className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="font-black text-2xl sm:text-3xl text-stone-900 flex items-center gap-2">
                            <Activity className="w-6 h-6 text-emerald-600" /> Worker Queue
                        </h1>
                        <p className="text-sm text-stone-500 mt-1">Auto-refreshes every 10s. As of {new Date(data.as_of).toLocaleTimeString()}.</p>
                    </div>
                    <button
                        onClick={refresh}
                        disabled={loading}
                        className="inline-flex items-center gap-1.5 text-xs font-bold bg-white border border-stone-300 hover:border-emerald-400 hover:text-emerald-700 text-stone-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                    >
                        <RefreshCw className={clsx("w-3 h-3", loading && "animate-spin")} /> Refresh
                    </button>
                </header>

                {/* Top-line metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <StatCard label="Pending" value={data.totals.pending} color="amber" />
                    <StatCard label="Running" value={data.totals.running} color="blue" pulse />
                    <StatCard label="Done (today)" value={data.totals.done} color="emerald" />
                    <StatCard label="Failed" value={data.totals.failed} color="red" />
                </div>

                {/* Throughput */}
                <div className="bg-white rounded-2xl border border-stone-200 p-4 sm:p-5">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-stone-500 mb-3">Throughput</h2>
                    <div className="grid grid-cols-3 gap-3">
                        <ThroughputCell label="last 5 min" value={data.totals.done_5m} />
                        <ThroughputCell label="last 30 min" value={data.totals.done_30m} />
                        <ThroughputCell label="last 60 min" value={data.totals.done_60m} />
                    </div>
                </div>

                {/* Per-task-type table */}
                <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
                    <div className="px-4 sm:px-5 py-3 border-b border-stone-100">
                        <h2 className="text-xs font-bold uppercase tracking-widest text-stone-500">By task type</h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-stone-50">
                                <tr className="text-left">
                                    <th className="px-4 py-2 font-bold text-stone-600 text-xs uppercase tracking-wider">Task</th>
                                    <th className="px-4 py-2 font-bold text-amber-700 text-xs uppercase tracking-wider">Pending</th>
                                    <th className="px-4 py-2 font-bold text-blue-700 text-xs uppercase tracking-wider">Running</th>
                                    <th className="px-4 py-2 font-bold text-emerald-700 text-xs uppercase tracking-wider">Done</th>
                                    <th className="px-4 py-2 font-bold text-red-700 text-xs uppercase tracking-wider">Failed</th>
                                    <th className="px-4 py-2 font-bold text-emerald-600 text-xs uppercase tracking-wider">/5m</th>
                                    <th className="px-4 py-2 font-bold text-emerald-600 text-xs uppercase tracking-wider">/60m</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Object.entries(data.by_task_type).sort((a, b) => (b[1].pending + b[1].running) - (a[1].pending + a[1].running)).map(([task, b]) => (
                                    <tr key={task} className="border-t border-stone-100">
                                        <td className="px-4 py-2 font-mono text-xs text-stone-800">{task}</td>
                                        <td className="px-4 py-2 font-mono text-stone-700">{b.pending}</td>
                                        <td className={clsx("px-4 py-2 font-mono", b.running > 0 ? "text-blue-700 font-bold" : "text-stone-400")}>{b.running}</td>
                                        <td className="px-4 py-2 font-mono text-stone-700">{b.done}</td>
                                        <td className={clsx("px-4 py-2 font-mono", b.failed > 0 ? "text-red-700" : "text-stone-400")}>{b.failed}</td>
                                        <td className="px-4 py-2 font-mono text-emerald-700">{b.done_5m}</td>
                                        <td className="px-4 py-2 font-mono text-emerald-700">{b.done_60m}</td>
                                    </tr>
                                ))}
                                {Object.keys(data.by_task_type).length === 0 && (
                                    <tr><td colSpan={7} className="px-4 py-6 text-center text-stone-400 text-sm">No jobs in queue.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Portal cookies */}
                <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
                    <div className="px-4 sm:px-5 py-3 border-b border-stone-100 flex items-center gap-2">
                        <Cookie className="w-4 h-4 text-amber-600" />
                        <h2 className="text-xs font-bold uppercase tracking-widest text-stone-500">Portal cookies ({data.portal_cookies.count})</h2>
                    </div>
                    {data.portal_cookies.hosts.length === 0 ? (
                        <div className="px-4 py-6 text-center text-stone-400 text-sm">No cookies cached yet.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-stone-50">
                                    <tr className="text-left">
                                        <th className="px-4 py-2 font-bold text-stone-600 text-xs uppercase">Host</th>
                                        <th className="px-4 py-2 font-bold text-stone-600 text-xs uppercase">Fetched</th>
                                        <th className="px-4 py-2 font-bold text-stone-600 text-xs uppercase">Expires</th>
                                        <th className="px-4 py-2 font-bold text-stone-600 text-xs uppercase">Used</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.portal_cookies.hosts.map(h => {
                                        const expired = h.expires_at ? new Date(h.expires_at).getTime() < Date.now() : false;
                                        return (
                                            <tr key={h.host} className="border-t border-stone-100">
                                                <td className="px-4 py-2 font-mono text-xs">{h.host}</td>
                                                <td className="px-4 py-2 text-xs text-stone-500">{new Date(h.fetched_at).toLocaleTimeString()}</td>
                                                <td className={clsx("px-4 py-2 text-xs flex items-center gap-1", expired ? "text-red-600" : "text-emerald-700")}>
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

                <p className="text-xs text-stone-400 text-center pt-4">Total job rows in DB sample: {totalRows.toLocaleString()}</p>
            </div>
        </main>
    );
}

function StatCard({ label, value, color, pulse }: { label: string; value: number; color: "amber"|"blue"|"emerald"|"red"; pulse?: boolean }) {
    const colors = {
        amber: "bg-amber-50 border-amber-200 text-amber-900",
        blue: "bg-blue-50 border-blue-200 text-blue-900",
        emerald: "bg-emerald-50 border-emerald-200 text-emerald-900",
        red: "bg-red-50 border-red-200 text-red-900",
    } as const;
    return (
        <div className={clsx("rounded-2xl border p-4 sm:p-5", colors[color], pulse && value > 0 && "animate-pulse")}>
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-70 mb-1">{label}</p>
            <p className="text-2xl sm:text-3xl font-black tabular-nums">{value.toLocaleString()}</p>
        </div>
    );
}

function ThroughputCell({ label, value }: { label: string; value: number }) {
    return (
        <div className="text-center">
            <p className="text-2xl font-black text-emerald-700 tabular-nums">{value.toLocaleString()}</p>
            <p className="text-[10px] text-stone-500 uppercase tracking-widest mt-1">{label}</p>
        </div>
    );
}
