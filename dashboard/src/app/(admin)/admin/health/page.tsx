"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    Loader2, CheckCircle2, AlertTriangle, HelpCircle, RefreshCw,
    Activity, AlertCircle, ExternalLink,
} from "lucide-react";
import clsx from "clsx";

interface ServiceStatus {
    key: string;
    env_var: string;
    configured: boolean;
    reachable: "unknown" | "ok" | "error";
    detail?: string;
    last_check: string;
}

interface CronStat {
    route: string;
    last_run: string | null;
    last_status: string | null;
    runs_7d: number;
}

function fmtRelative(ts: string | null): string {
    if (!ts) return "never";
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
}

export default function EnvHealthPage() {
    const [checks, setChecks] = useState<ServiceStatus[] | null>(null);
    const [cronSummary, setCronSummary] = useState<CronStat[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    async function load() {
        setLoading(true);
        setErr(null);
        try {
            const res = await fetch("/api/admin/env-health", { cache: "no-store" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            setChecks(data.checks);
            setCronSummary(data.cron_summary || []);
        } catch (e) {
            setErr((e as Error).message);
        } finally {
            setLoading(false);
        }
    }
    useEffect(() => { load(); }, []);

    // Roll-up counts for the header strip
    const total = checks?.length ?? 0;
    const okCount = checks?.filter(c => c.configured && c.reachable === "ok").length ?? 0;
    const errCount = checks?.filter(c => c.configured && c.reachable === "error").length ?? 0;
    const unsetCount = checks?.filter(c => !c.configured).length ?? 0;

    return (
        <div className="w-full max-w-4xl mx-auto space-y-6">
            <header className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400 mb-1.5">Operations</p>
                    <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
                        <Activity className="w-6 h-6" /> Env Health
                    </h1>
                    <p className="text-sm text-stone-500 mt-1">
                        Live reachability checks against every third-party API we call, plus the latest run per cron. Each probe uses a 6-second timeout. No secret values are returned.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={load}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-stone-200 text-stone-700 text-xs font-bold hover:bg-stone-50 disabled:opacity-50"
                >
                    {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    Refresh
                </button>
            </header>

            {/* Roll-up KPIs */}
            {checks && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-white border border-stone-200 rounded-2xl p-4">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 mb-1" />
                        <p className="text-2xl font-black text-emerald-600">{okCount}</p>
                        <p className="text-[10px] text-stone-500 uppercase">Healthy</p>
                    </div>
                    <div className="bg-white border border-stone-200 rounded-2xl p-4">
                        <AlertCircle className="w-4 h-4 text-rose-500 mb-1" />
                        <p className="text-2xl font-black text-rose-600">{errCount}</p>
                        <p className="text-[10px] text-stone-500 uppercase">Failing</p>
                    </div>
                    <div className="bg-white border border-stone-200 rounded-2xl p-4">
                        <HelpCircle className="w-4 h-4 text-stone-400 mb-1" />
                        <p className="text-2xl font-black text-stone-500">{unsetCount}</p>
                        <p className="text-[10px] text-stone-500 uppercase">Not Configured</p>
                    </div>
                    <div className="bg-white border border-stone-200 rounded-2xl p-4">
                        <Activity className="w-4 h-4 text-blue-500 mb-1" />
                        <p className="text-2xl font-black text-blue-600">{total}</p>
                        <p className="text-[10px] text-stone-500 uppercase">Services</p>
                    </div>
                </div>
            )}

            {err && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl p-4">
                    {err}
                </div>
            )}

            {/* Service probes */}
            <section>
                <h2 className="text-sm font-bold text-stone-900 mb-3">Third-Party APIs</h2>
                <div className="space-y-2">
                    {(checks || []).map((c) => {
                        const stateColor =
                            !c.configured ? "bg-white border-stone-200" :
                            c.reachable === "ok" ? "bg-emerald-50 border-emerald-200" :
                            c.reachable === "error" ? "bg-rose-50 border-rose-200" :
                            "bg-amber-50 border-amber-200";

                        const Icon =
                            !c.configured ? HelpCircle :
                            c.reachable === "ok" ? CheckCircle2 :
                            c.reachable === "error" ? AlertTriangle :
                            HelpCircle;

                        const iconColor =
                            !c.configured ? "text-stone-400" :
                            c.reachable === "ok" ? "text-emerald-600" :
                            c.reachable === "error" ? "text-rose-600" :
                            "text-amber-600";

                        const label =
                            !c.configured ? "Not configured" :
                            c.reachable === "ok" ? "Reachable" :
                            c.reachable === "error" ? "Unreachable or unauthorized" :
                            "Not probed";

                        return (
                            <div key={c.env_var} className={clsx("p-3 rounded-xl border flex items-start gap-3", stateColor)}>
                                <Icon className={clsx("w-5 h-5 flex-shrink-0 mt-0.5", iconColor)} />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <p className="font-bold text-sm text-stone-900">{c.key}</p>
                                        <code className="text-[10px] bg-white px-1.5 py-0.5 rounded border border-stone-200 text-stone-500">{c.env_var}</code>
                                    </div>
                                    <p className="text-xs text-stone-600 mt-0.5">{label}</p>
                                    {c.detail && <p className="text-[10px] text-stone-500 mt-0.5">{c.detail}</p>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* Cron stalest-list */}
            {cronSummary && cronSummary.length > 0 && (
                <section>
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-bold text-stone-900">Cron — Last Run per Route (7d)</h2>
                        <Link href="/admin/crons" className="text-xs text-blue-600 hover:text-blue-800 inline-flex items-center gap-1">
                            Full telemetry <ExternalLink className="w-3 h-3" />
                        </Link>
                    </div>

                    {/* At-a-glance status grid — each square = one cron, color by
                        ok/error/stale. Lets you spot trouble across all 35-40 crons
                        in a single eye sweep, before drilling into the table below. */}
                    <div className="bg-white border border-stone-200 rounded-xl p-3 mb-3">
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500">
                                Status grid · {cronSummary.length} crons
                            </p>
                            <div className="flex items-center gap-3 text-[10px] text-stone-500">
                                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-500" /> ok</span>
                                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-amber-500" /> error</span>
                                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-rose-500" /> stale</span>
                                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-stone-300" /> unknown</span>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-1">
                            {cronSummary.map(c => {
                                const isErr = c.last_status === "error";
                                const stale = c.last_run && (Date.now() - new Date(c.last_run).getTime() > 86_400_000 * 2);
                                const ok = c.last_status === "ok" && !stale;
                                const cls = ok ? "bg-emerald-500 hover:bg-emerald-600"
                                    : stale ? "bg-rose-500 hover:bg-rose-600"
                                    : isErr ? "bg-amber-500 hover:bg-amber-600"
                                    : "bg-stone-300 hover:bg-stone-400";
                                return (
                                    <span
                                        key={c.route}
                                        title={`${c.route.replace("/api/cron/", "")} — ${c.last_status || "?"} (${fmtRelative(c.last_run)})`}
                                        className={clsx("inline-block w-3 h-3 rounded transition-colors cursor-help", cls)}
                                    />
                                );
                            })}
                        </div>
                    </div>

                    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-stone-50 text-[10px] text-stone-400 uppercase">
                                <tr>
                                    <th className="text-left px-3 py-2">Route</th>
                                    <th className="text-center px-3 py-2">Last Run</th>
                                    <th className="text-center px-3 py-2">Last Status</th>
                                    <th className="text-right px-3 py-2">Runs 7d</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-stone-50">
                                {cronSummary.map(c => {
                                    const isErr = c.last_status === "error";
                                    const stale = c.last_run && (Date.now() - new Date(c.last_run).getTime() > 86_400_000 * 2);
                                    return (
                                        <tr key={c.route} className={clsx("hover:bg-stone-50/50", (isErr || stale) && "bg-rose-50/40")}>
                                            <td className="px-3 py-2 font-mono text-xs text-stone-700">{c.route.replace("/api/cron/", "")}</td>
                                            <td className="text-center px-3 text-xs text-stone-600">{fmtRelative(c.last_run)}</td>
                                            <td className="text-center px-3">
                                                <span className={clsx(
                                                    "text-[9px] font-bold px-2 py-0.5 rounded uppercase",
                                                    c.last_status === "ok" ? "bg-emerald-100 text-emerald-700" :
                                                    c.last_status === "error" ? "bg-rose-100 text-rose-700" :
                                                    c.last_status === "partial" ? "bg-amber-100 text-amber-700" :
                                                    "bg-stone-100 text-stone-500"
                                                )}>
                                                    {c.last_status || "—"}
                                                </span>
                                            </td>
                                            <td className="text-right px-3 text-xs font-mono text-stone-600">{c.runs_7d}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            {loading && !checks && (
                <div className="flex justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
                </div>
            )}
        </div>
    );
}
