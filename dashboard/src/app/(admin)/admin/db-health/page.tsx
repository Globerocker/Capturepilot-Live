"use client";

import { useEffect, useState } from "react";
import { Database, AlertTriangle, CheckCircle2, RefreshCw, Loader2, TrendingUp, Activity, Mail, Globe2, Sparkles } from "lucide-react";
import clsx from "clsx";

interface FillRate { field: string; populated: number; pct: number }
interface TableHealth { table: string; total: number; last_24h_inserted?: number; fill_rates?: FillRate[] }
interface IngestVelocity { label: string; last_24h: number; last_7d: number }

interface DbHealthResponse {
    generated_at: string;
    tables: TableHealth[];
    ingestion: IngestVelocity[];
    enrichment: Record<string, { populated: number; total: number; pct: number }>;
    worker_jobs: { pending: number; running: number; done_24h: number; failed_24h: number; failure_pct_24h: number };
    alerts: { open: number; recent: Array<{ slug: string; severity: string; message: string; created_at: string }> };
}

function fmtNum(n: number): string { return n.toLocaleString(); }
function fmtRel(ts: string): string {
    const ms = Date.now() - new Date(ts).getTime();
    if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
    return `${Math.floor(ms / 86_400_000)}d ago`;
}

function toneFor(pct: number, isFailure = false): string {
    if (isFailure) {
        if (pct >= 20) return "bg-rose-100 text-rose-800 border-rose-300";
        if (pct >= 5) return "bg-amber-100 text-amber-800 border-amber-300";
        return "bg-emerald-100 text-emerald-800 border-emerald-300";
    }
    if (pct >= 80) return "bg-emerald-100 text-emerald-800 border-emerald-300";
    if (pct >= 40) return "bg-amber-100 text-amber-800 border-amber-300";
    return "bg-rose-100 text-rose-800 border-rose-300";
}

export default function DbHealthPage() {
    const [data, setData] = useState<DbHealthResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    async function load() {
        setLoading(true);
        setErr(null);
        try {
            const r = await fetch("/api/admin/db-health", { cache: "no-store" });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            setData(await r.json());
        } catch (e) {
            setErr((e as Error).message);
        } finally {
            setLoading(false);
        }
    }
    useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
            <header className="flex items-center justify-between">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Admin · Diagnostics</p>
                    <h1 className="text-2xl sm:text-3xl font-black text-stone-900 mt-1 inline-flex items-center gap-2">
                        <Database className="w-7 h-7 text-stone-700" /> Database Health
                    </h1>
                    <p className="text-sm text-stone-500 mt-1">
                        Row counts · NULL rates · enrichment % · ingestion velocity · worker queue · open alerts.
                        {data && <> Last updated <strong>{fmtRel(data.generated_at)}</strong>.</>}
                    </p>
                </div>
                <button
                    onClick={load}
                    disabled={loading}
                    className="inline-flex items-center gap-2 bg-white border border-stone-200 hover:border-emerald-300 hover:bg-emerald-50 text-stone-700 hover:text-emerald-800 font-bold text-sm px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Refresh
                </button>
            </header>

            {err && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-800 inline-flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> Failed to load: {err}
                </div>
            )}

            {!data && loading && <div className="text-center text-stone-500 py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>}

            {data && (
                <>
                    {/* Top KPI row */}
                    <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {data.tables.map(t => (
                            <div key={t.table} className="bg-white border border-stone-200 rounded-2xl p-4">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">{t.table}</p>
                                <p className="text-2xl font-black text-stone-900 mt-1 tabular-nums">{fmtNum(t.total)}</p>
                                {t.last_24h_inserted != null && (
                                    <p className="text-[11px] text-emerald-700 mt-0.5">+{fmtNum(t.last_24h_inserted)} last 24h</p>
                                )}
                            </div>
                        ))}
                    </section>

                    {/* Enrichment progress */}
                    <section className="bg-white border border-stone-200 rounded-2xl p-5">
                        <h2 className="font-black text-lg text-stone-900 mb-3 inline-flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-emerald-600" /> Enrichment progress
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {Object.entries(data.enrichment).map(([key, v]) => (
                                <div key={key} className="border border-stone-100 rounded-xl p-3">
                                    <div className="flex items-center justify-between gap-2 mb-1.5">
                                        <p className="text-xs font-bold text-stone-700">{key.replace(/_/g, " ")}</p>
                                        <span className={clsx("text-[10px] font-bold px-2 py-0.5 rounded border", toneFor(v.pct))}>
                                            {v.pct}%
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-stone-500 tabular-nums">
                                        {fmtNum(v.populated)} of {fmtNum(v.total)}
                                    </p>
                                    <div className="mt-1.5 h-1.5 bg-stone-100 rounded overflow-hidden">
                                        <div
                                            className={clsx(
                                                "h-full transition-all",
                                                v.pct >= 80 ? "bg-emerald-500" : v.pct >= 40 ? "bg-amber-500" : "bg-rose-500",
                                            )}
                                            style={{ width: `${Math.min(100, v.pct)}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Worker queue */}
                    <section className="bg-white border border-stone-200 rounded-2xl p-5">
                        <h2 className="font-black text-lg text-stone-900 mb-3 inline-flex items-center gap-2">
                            <Activity className="w-5 h-5 text-blue-600" /> Worker queue (last 24h)
                        </h2>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            <div>
                                <p className="text-[10px] uppercase font-bold text-stone-400">Pending</p>
                                <p className="text-2xl font-black text-stone-900">{fmtNum(data.worker_jobs.pending)}</p>
                            </div>
                            <div>
                                <p className="text-[10px] uppercase font-bold text-stone-400">Running</p>
                                <p className="text-2xl font-black text-stone-900">{fmtNum(data.worker_jobs.running)}</p>
                            </div>
                            <div>
                                <p className="text-[10px] uppercase font-bold text-stone-400">Done 24h</p>
                                <p className="text-2xl font-black text-emerald-700">{fmtNum(data.worker_jobs.done_24h)}</p>
                            </div>
                            <div>
                                <p className="text-[10px] uppercase font-bold text-stone-400">Failed 24h</p>
                                <p className="text-2xl font-black text-stone-900">{fmtNum(data.worker_jobs.failed_24h)}</p>
                            </div>
                            <div>
                                <p className="text-[10px] uppercase font-bold text-stone-400">Failure rate</p>
                                <span className={clsx(
                                    "inline-block text-2xl font-black px-2 rounded",
                                    toneFor(data.worker_jobs.failure_pct_24h, true),
                                )}>
                                    {data.worker_jobs.failure_pct_24h}%
                                </span>
                            </div>
                        </div>
                    </section>

                    {/* Ingestion velocity */}
                    <section className="bg-white border border-stone-200 rounded-2xl p-5">
                        <h2 className="font-black text-lg text-stone-900 mb-3 inline-flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-emerald-600" /> Ingestion velocity
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            {data.ingestion.map(i => (
                                <div key={i.label} className="border border-stone-100 rounded-xl p-3">
                                    <p className="text-xs font-bold text-stone-700">{i.label}</p>
                                    <div className="flex items-baseline gap-3 mt-1">
                                        <span className="text-lg font-black text-stone-900 tabular-nums">+{fmtNum(i.last_24h)}</span>
                                        <span className="text-[10px] text-stone-400 uppercase">24h</span>
                                    </div>
                                    <p className="text-[11px] text-stone-500 mt-0.5">{fmtNum(i.last_7d)} this week</p>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Recent alerts */}
                    <section className="bg-white border border-stone-200 rounded-2xl p-5">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="font-black text-lg text-stone-900 inline-flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5 text-amber-600" /> Recent health alerts
                            </h2>
                            {data.alerts.open > 0 && (
                                <span className="text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200 px-2 py-1 rounded">
                                    {data.alerts.open} open
                                </span>
                            )}
                        </div>
                        {data.alerts.recent.length === 0 ? (
                            <p className="text-sm text-stone-500 inline-flex items-center gap-1.5">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> No alerts in recent history.
                            </p>
                        ) : (
                            <ul className="divide-y divide-stone-100">
                                {data.alerts.recent.map((a, i) => (
                                    <li key={i} className="py-2 flex items-start gap-3 text-sm">
                                        <span className={clsx(
                                            "text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-widest flex-shrink-0 mt-1",
                                            a.severity === "critical" || a.severity === "error" ? "bg-rose-100 text-rose-800" :
                                            a.severity === "warning" ? "bg-amber-100 text-amber-800" :
                                            "bg-stone-100 text-stone-700",
                                        )}>
                                            {a.severity}
                                        </span>
                                        <span className="font-bold text-stone-800 flex-shrink-0">{a.slug}</span>
                                        <span className="text-stone-600 flex-1 min-w-0 truncate">{a.message}</span>
                                        <span className="text-[10px] text-stone-400 flex-shrink-0">{a.created_at ? fmtRel(a.created_at) : ""}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </>
            )}
        </div>
    );
}
