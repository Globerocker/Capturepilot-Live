"use client";

import { useEffect, useState } from "react";
import {
    Loader2, RefreshCw, CheckCircle2, AlertTriangle, AlertCircle, Clock,
    Activity, ChevronDown, ChevronRight, Play,
} from "lucide-react";
import clsx from "clsx";

interface RouteSummary {
    route: string;
    runs_7d: number;
    ok: number;
    error: number;
    partial: number;
    running: number;
    avg_ms: number | null;
    p50_ms: number | null;
    p95_ms: number | null;
    last_run: string | null;
    last_status: string | null;
    last_rows_out: number | null;
    total_rows_out_7d: number;
    last_error: string | null;
}

interface RecentRun {
    id: string;
    route: string;
    started_at: string;
    finished_at: string | null;
    status: string | null;
    rows_in: number | null;
    rows_out: number | null;
    error_message: string | null;
    elapsed_ms: number | null;
}

interface Data {
    summary: RouteSummary[];
    recent: RecentRun[];
    window_days: number;
    generated_at: string;
}

function StatusBadge({ status }: { status: string | null }) {
    const cfg = {
        ok: { icon: CheckCircle2, color: "text-emerald-700 bg-emerald-50 border-emerald-200", label: "ok" },
        error: { icon: AlertCircle, color: "text-rose-700 bg-rose-50 border-rose-200", label: "error" },
        partial: { icon: AlertTriangle, color: "text-amber-700 bg-amber-50 border-amber-200", label: "partial" },
        running: { icon: Clock, color: "text-blue-700 bg-blue-50 border-blue-200", label: "running" },
    } as const;
    const k = (status || "") as keyof typeof cfg;
    const c = cfg[k] || { icon: AlertCircle, color: "text-slate-700 bg-slate-50 border-slate-200", label: status || "—" };
    const Icon = c.icon;
    return (
        <span className={clsx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", c.color)}>
            <Icon className="size-3" />{c.label}
        </span>
    );
}

function fmtMs(ms: number | null): string {
    if (ms == null) return "—";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}

function fmtRelative(ts: string | null): string {
    if (!ts) return "—";
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
}

export default function CronsPage() {
    const [data, setData] = useState<Data | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [expandedRoute, setExpandedRoute] = useState<string | null>(null);
    const [autoRefresh, setAutoRefresh] = useState(false);
    // Track which routes are mid-trigger so we can disable buttons + show spinner.
    const [running, setRunning] = useState<Record<string, boolean>>({});
    const [lastResult, setLastResult] = useState<Record<string, { status: number; ms: number; msg: string }>>({});

    async function triggerRoute(route: string) {
        setRunning(r => ({ ...r, [route]: true }));
        try {
            const res = await fetch("/api/admin/cron-trigger", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ route }),
            });
            const body = await res.json();
            const payload = body.payload;
            const msg = typeof payload === "object" && payload
                ? Object.entries(payload).slice(0, 4).map(([k, v]) =>
                    `${k}=${typeof v === "object" ? JSON.stringify(v).slice(0, 30) : String(v).slice(0, 50)}`).join(" ")
                : String(payload).slice(0, 120);
            setLastResult(r => ({
                ...r,
                [route]: { status: body.status || res.status, ms: body.elapsed_ms || 0, msg: msg || "" },
            }));
        } catch (e) {
            setLastResult(r => ({ ...r, [route]: { status: 0, ms: 0, msg: (e as Error).message } }));
        } finally {
            setRunning(r => ({ ...r, [route]: false }));
            // refresh the summary so the new cron_runs row shows up
            void load();
        }
    }

    async function load() {
        setLoading(true);
        setErr(null);
        try {
            const res = await fetch("/api/admin/cron-runs", { cache: "no-store" });
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

    return (
        <div className="mx-auto max-w-7xl px-4 py-8">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
                        <Activity className="size-6 text-indigo-600" />
                        Cron Telemetry
                    </h1>
                    <p className="text-sm text-slate-600 mt-1">
                        Every cron run writes a row to <code className="text-xs bg-slate-100 px-1 rounded">cron_runs</code>.
                        Showing last 7 days.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={autoRefresh}
                            onChange={e => setAutoRefresh(e.target.checked)}
                            className="rounded"
                        />
                        Auto-refresh 30s
                    </label>
                    <button
                        onClick={load}
                        disabled={loading}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border border-slate-300 hover:bg-slate-50"
                    >
                        {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                        Refresh
                    </button>
                </div>
            </div>

            {err && (
                <div className="bg-rose-50 border border-rose-200 rounded-md p-4 mb-4 text-rose-900 text-sm">
                    {err}
                </div>
            )}

            {!data && loading && (
                <div className="flex items-center gap-2 text-slate-600">
                    <Loader2 className="size-4 animate-spin" /> loading…
                </div>
            )}

            {data && (
                <>
                    {/* Per-route summary */}
                    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden mb-8">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-slate-700 text-xs uppercase tracking-wide">
                                <tr>
                                    <th className="px-3 py-2 text-left font-medium">Route</th>
                                    <th className="px-3 py-2 text-left font-medium">Last Run</th>
                                    <th className="px-3 py-2 text-left font-medium">Status</th>
                                    <th className="px-3 py-2 text-right font-medium">Runs 7d</th>
                                    <th className="px-3 py-2 text-right font-medium">OK / Err / Part</th>
                                    <th className="px-3 py-2 text-right font-medium">Avg / p95</th>
                                    <th className="px-3 py-2 text-right font-medium">Rows 7d</th>
                                    <th className="px-3 py-2 text-right font-medium">Last Rows</th>
                                    <th className="px-3 py-2 text-center font-medium">Run</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.summary.length === 0 && (
                                    <tr><td colSpan={9} className="px-3 py-6 text-center text-slate-500">
                                        no cron runs yet — wait for the next scheduled cron, or trigger one manually
                                    </td></tr>
                                )}
                                {data.summary.map((s) => (
                                    <>
                                        <tr
                                            key={s.route}
                                            className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
                                            onClick={() => setExpandedRoute(expandedRoute === s.route ? null : s.route)}
                                        >
                                            <td className="px-3 py-2 font-mono text-xs text-slate-700">
                                                <span className="inline-flex items-center">
                                                    {expandedRoute === s.route
                                                        ? <ChevronDown className="size-3 mr-1" />
                                                        : <ChevronRight className="size-3 mr-1" />}
                                                    {s.route.replace("/api/cron/", "")}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 text-slate-600">{fmtRelative(s.last_run)}</td>
                                            <td className="px-3 py-2"><StatusBadge status={s.last_status} /></td>
                                            <td className="px-3 py-2 text-right tabular-nums">{s.runs_7d}</td>
                                            <td className="px-3 py-2 text-right tabular-nums text-xs">
                                                <span className="text-emerald-700">{s.ok}</span>
                                                {" / "}
                                                <span className="text-rose-700">{s.error}</span>
                                                {" / "}
                                                <span className="text-amber-700">{s.partial}</span>
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums text-xs text-slate-600">
                                                {fmtMs(s.avg_ms)} / {fmtMs(s.p95_ms)}
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums font-medium">{s.total_rows_out_7d.toLocaleString()}</td>
                                            <td className="px-3 py-2 text-right tabular-nums">{s.last_rows_out ?? "—"}</td>
                                            <td className="px-3 py-2 text-center">
                                                <button
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); triggerRoute(s.route); }}
                                                    disabled={!!running[s.route]}
                                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border border-slate-200 hover:bg-slate-100 disabled:opacity-50"
                                                    title="Trigger this cron now"
                                                >
                                                    {running[s.route] ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />}
                                                    Run
                                                </button>
                                            </td>
                                        </tr>
                                        {expandedRoute === s.route && s.last_error && (
                                            <tr key={s.route + "-err"} className="border-t border-rose-100 bg-rose-50">
                                                <td colSpan={9} className="px-3 py-2 text-xs text-rose-900 font-mono break-all">
                                                    <strong>Last error:</strong> {s.last_error}
                                                </td>
                                            </tr>
                                        )}
                                        {lastResult[s.route] && (
                                            <tr key={s.route + "-result"} className="border-t border-slate-100 bg-slate-50">
                                                <td colSpan={9} className="px-3 py-1.5 text-[11px] text-slate-700 font-mono break-all">
                                                    <span className={clsx(
                                                        "font-bold",
                                                        lastResult[s.route]!.status >= 200 && lastResult[s.route]!.status < 300 ? "text-emerald-700"
                                                            : lastResult[s.route]!.status >= 400 ? "text-rose-700" : "text-amber-700",
                                                    )}>
                                                        [{lastResult[s.route]!.status}]
                                                    </span>{" "}
                                                    {lastResult[s.route]!.ms}ms — {lastResult[s.route]!.msg}
                                                </td>
                                            </tr>
                                        )}
                                    </>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Recent runs timeline */}
                    <div>
                        <h2 className="text-sm font-medium text-slate-700 mb-2">Recent runs (last 200)</h2>
                        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                            <table className="w-full text-xs">
                                <thead className="bg-slate-50 text-slate-700 uppercase tracking-wide">
                                    <tr>
                                        <th className="px-3 py-2 text-left font-medium">When</th>
                                        <th className="px-3 py-2 text-left font-medium">Route</th>
                                        <th className="px-3 py-2 text-left font-medium">Status</th>
                                        <th className="px-3 py-2 text-right font-medium">Elapsed</th>
                                        <th className="px-3 py-2 text-right font-medium">Rows In</th>
                                        <th className="px-3 py-2 text-right font-medium">Rows Out</th>
                                        <th className="px-3 py-2 text-left font-medium">Error</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.recent.map((r) => (
                                        <tr key={r.id} className="border-t border-slate-100">
                                            <td className="px-3 py-1.5 text-slate-500 tabular-nums">{fmtRelative(r.started_at)}</td>
                                            <td className="px-3 py-1.5 font-mono text-slate-700">{r.route.replace("/api/cron/", "")}</td>
                                            <td className="px-3 py-1.5"><StatusBadge status={r.status} /></td>
                                            <td className="px-3 py-1.5 text-right tabular-nums">{fmtMs(r.elapsed_ms)}</td>
                                            <td className="px-3 py-1.5 text-right tabular-nums">{r.rows_in ?? "—"}</td>
                                            <td className="px-3 py-1.5 text-right tabular-nums">{r.rows_out ?? "—"}</td>
                                            <td className="px-3 py-1.5 text-rose-700 max-w-[300px] truncate">
                                                {r.error_message || ""}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <p className="mt-4 text-xs text-slate-400">
                        Generated at {new Date(data.generated_at).toLocaleString()}
                    </p>
                </>
            )}
        </div>
    );
}
