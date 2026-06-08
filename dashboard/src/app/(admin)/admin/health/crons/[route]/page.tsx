"use client";

/**
 * /admin/health/crons/[route] — per-cron detail.
 *
 * The dynamic segment is the slug (e.g. "ingest_sam"), not the full
 * /api/cron/<name> path — keeps URLs clean and avoids encoding slashes.
 *
 * What the page surfaces:
 *   - Schedule (humanized + raw cron expression) + next-run countdown
 *   - 24h success rate, runs in last 24h, last error
 *   - "Run now" button (POST /api/admin/cron-trigger)
 *   - "View source" link to GitHub (Globerocker/capturepilot-v3 main)
 *   - Last 50 cron_runs rows (timestamp, status, duration, truncated error)
 *
 * Pulls from /api/admin/cron-detail?route=/api/cron/<slug>.
 */

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
    Loader2, RefreshCw, ArrowLeft, Activity, Play, Github, Clock,
    AlertCircle, CheckCircle2, Calendar, Timer, Hash, ExternalLink,
} from "lucide-react";
import clsx from "clsx";
import { HealthBadge, RunStatusBadge } from "@/components/admin/health/CronBadges";
import { ActionButton } from "@/components/admin/health/ActionButton";
import { DataTable, type DataTableColumn } from "@/components/admin/health/DataTable";
import { fmtRelative, fmtInterval, fmtMs, fmtAbsolute } from "@/lib/format-time";

// Source link points at the globerocker remote on `main`. The cron handler
// lives at dashboard/src/app/api/cron/<slug>/route.ts.
const GITHUB_BASE = "https://github.com/Globerocker/capturepilot-v3/blob/main/dashboard/src/app/api/cron";

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

interface CronRunRow {
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

interface ApiResponse {
    cron: CronOverview;
    runs: CronRunRow[];
    generated_at: string;
}

export default function CronDetailPage() {
    const params = useParams<{ route: string }>();
    const slug = decodeURIComponent(params?.route || "");
    const fullRoute = `/api/cron/${slug}`;

    const [data, setData] = useState<ApiResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [triggering, setTriggering] = useState(false);
    const [triggerResult, setTriggerResult] = useState<{ status: number; ms: number; msg: string } | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setErr(null);
        try {
            const url = `/api/admin/cron-detail?route=${encodeURIComponent(fullRoute)}`;
            const res = await fetch(url, { cache: "no-store" });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
            setData(body);
        } catch (e) {
            setErr((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, [fullRoute]);

    useEffect(() => { load(); }, [load]);

    async function triggerNow() {
        setTriggering(true);
        setTriggerResult(null);
        try {
            const res = await fetch("/api/admin/cron-trigger", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ route: fullRoute }),
            });
            const body = await res.json();
            const payload = body.payload;
            const msg = typeof payload === "object" && payload
                ? Object.entries(payload).slice(0, 4).map(([k, v]) =>
                    `${k}=${typeof v === "object" ? JSON.stringify(v).slice(0, 40) : String(v).slice(0, 80)}`).join(" ")
                : String(payload).slice(0, 200);
            setTriggerResult({
                status: body.status || res.status,
                ms: body.elapsed_ms || 0,
                msg: msg || "",
            });
        } catch (e) {
            setTriggerResult({ status: 0, ms: 0, msg: (e as Error).message });
        } finally {
            setTriggering(false);
            // Refresh the detail view so the new cron_runs row is visible
            void load();
        }
    }

    const cron = data?.cron;
    const runs = data?.runs || [];

    // Run-history table — defines the columns once, reuses the shared DataTable.
    const columns: DataTableColumn<CronRunRow>[] = [
        {
            key: "started_at",
            header: "When",
            render: r => (
                <div className="flex flex-col">
                    <span className="text-stone-700 tabular-nums">{fmtRelative(r.started_at)}</span>
                    <span className="text-[10px] text-stone-400 tabular-nums">{fmtAbsolute(r.started_at)}</span>
                </div>
            ),
            width: "w-40",
        },
        {
            key: "status",
            header: "Status",
            align: "center",
            render: r => <RunStatusBadge status={r.status} />,
            width: "w-24",
        },
        {
            key: "elapsed_ms",
            header: "Duration",
            align: "right",
            render: r => <span className="font-mono tabular-nums">{fmtMs(r.elapsed_ms)}</span>,
            width: "w-24",
        },
        {
            key: "rows",
            header: "Rows in / out",
            align: "right",
            render: r => (
                <span className="font-mono text-stone-600 tabular-nums">
                    {r.rows_in ?? "—"} / {r.rows_out ?? "—"}
                </span>
            ),
            width: "w-28",
        },
        {
            key: "error_message",
            header: "Error",
            render: r => r.error_message ? (
                <span
                    className="text-rose-700 text-[11px] font-mono line-clamp-1 break-all"
                    title={r.error_message}
                >
                    {r.error_message.slice(0, 140)}
                </span>
            ) : <span className="text-stone-300">—</span>,
        },
    ];

    return (
        <div className="w-full max-w-6xl mx-auto space-y-6">
            {/* Header with breadcrumb back to list */}
            <header className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                    <Link
                        href="/admin/health/crons"
                        className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.18em] text-stone-400 mb-1.5 hover:text-emerald-600"
                    >
                        <ArrowLeft className="w-3 h-3" /> Cron Health
                    </Link>
                    <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
                        <Activity className="w-6 h-6 text-emerald-600 flex-shrink-0" />
                        <code className="text-xl font-mono">{slug}</code>
                    </h1>
                    <p className="text-sm text-stone-500 mt-1 font-mono">{fullRoute}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <a
                        href={`${GITHUB_BASE}/${slug}/route.ts`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-xl border bg-white text-stone-700 border-stone-200 hover:bg-stone-50 px-3 py-1.5 text-xs font-bold transition-colors"
                    >
                        <Github className="w-3.5 h-3.5" />
                        View source
                        <ExternalLink className="w-3 h-3 text-stone-400" />
                    </a>
                    <ActionButton onClick={load} loading={loading && !triggering} icon={RefreshCw}>
                        Refresh
                    </ActionButton>
                    <ActionButton
                        onClick={triggerNow}
                        loading={triggering}
                        icon={Play}
                        tone="primary"
                    >
                        Run now
                    </ActionButton>
                </div>
            </header>

            {err && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-2xl p-4">
                    {err}
                </div>
            )}

            {/* Trigger result toast — surfaces the cron's own response inline so
                you don't have to wait for the next refresh tick to see what
                happened. */}
            {triggerResult && (
                <div className={clsx(
                    "border rounded-2xl p-4 text-sm font-mono break-all",
                    triggerResult.status >= 200 && triggerResult.status < 300
                        ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                        : triggerResult.status >= 400
                        ? "bg-rose-50 border-rose-200 text-rose-900"
                        : "bg-amber-50 border-amber-200 text-amber-900",
                )}>
                    <p className="text-[10px] uppercase font-bold tracking-widest mb-1">Last manual run</p>
                    <p>
                        <span className="font-bold">[{triggerResult.status}]</span> in {triggerResult.ms}ms — {triggerResult.msg}
                    </p>
                </div>
            )}

            {/* KPI strip — health + success rate + 24h runs + next run */}
            {cron && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-white border border-stone-200 rounded-[28px] p-4">
                        <div className="flex items-center justify-between mb-1">
                            <Activity className="w-4 h-4 text-stone-400" />
                            <HealthBadge health={cron.health} />
                        </div>
                        <p className="text-[10px] text-stone-500 uppercase tracking-wider mt-2">Health</p>
                        <p className="text-xs text-stone-600 mt-1">
                            Expected every{" "}
                            <span className="font-semibold text-stone-700">
                                {fmtMs(cron.expected_interval_ms)}
                            </span>
                        </p>
                    </div>

                    <div className="bg-white border border-stone-200 rounded-[28px] p-4">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 mb-1" />
                        <p className="text-2xl font-black tabular-nums text-emerald-700">
                            {cron.success_rate_24h == null ? "—" : `${cron.success_rate_24h}%`}
                        </p>
                        <p className="text-[10px] text-stone-500 uppercase tracking-wider">Success 24h</p>
                        <p className="text-xs text-stone-500 mt-1">
                            {cron.ok_24h} ok · {cron.error_24h} err
                        </p>
                    </div>

                    <div className="bg-white border border-stone-200 rounded-[28px] p-4">
                        <Hash className="w-4 h-4 text-blue-500 mb-1" />
                        <p className="text-2xl font-black text-blue-700 tabular-nums">{cron.runs_24h}</p>
                        <p className="text-[10px] text-stone-500 uppercase tracking-wider">Runs 24h</p>
                        <p className="text-xs text-stone-500 mt-1">
                            {cron.runs_7d} in 7d
                        </p>
                    </div>

                    <div className="bg-white border border-stone-200 rounded-[28px] p-4">
                        <Clock className="w-4 h-4 text-stone-400 mb-1" />
                        <p className="text-lg font-black text-stone-900 tabular-nums">
                            {cron.next_run_at
                                ? fmtInterval(new Date(cron.next_run_at).getTime() - Date.now())
                                : "—"}
                        </p>
                        <p className="text-[10px] text-stone-500 uppercase tracking-wider mt-1">Next Run</p>
                        <p className="text-xs text-stone-500 mt-1 tabular-nums">
                            {cron.next_run_at ? fmtAbsolute(cron.next_run_at) : "—"}
                        </p>
                    </div>
                </div>
            )}

            {/* Schedule + last run summary */}
            {cron && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="bg-white border border-stone-200 rounded-[28px] p-5">
                        <div className="flex items-center gap-2 mb-2">
                            <Calendar className="w-4 h-4 text-stone-500" />
                            <h2 className="text-sm font-bold text-stone-900">Schedule</h2>
                        </div>
                        <p className="text-base font-semibold text-stone-800">{cron.schedule_label}</p>
                        <code className="block text-xs text-stone-500 bg-stone-50 rounded px-2 py-1 mt-2 font-mono">
                            {cron.schedule || "(missing from vercel.json)"}
                        </code>
                    </div>

                    <div className="bg-white border border-stone-200 rounded-[28px] p-5">
                        <div className="flex items-center gap-2 mb-2">
                            <Timer className="w-4 h-4 text-stone-500" />
                            <h2 className="text-sm font-bold text-stone-900">Last Run</h2>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <RunStatusBadge status={cron.last_status} />
                            <span className="text-sm text-stone-700 tabular-nums">
                                {fmtRelative(cron.last_run_at)}
                            </span>
                            {cron.last_elapsed_ms != null && (
                                <span className="text-xs text-stone-500">
                                    · {fmtMs(cron.last_elapsed_ms)}
                                </span>
                            )}
                        </div>
                        {cron.last_run_at && (
                            <p className="text-xs text-stone-500 mt-2 tabular-nums">
                                {fmtAbsolute(cron.last_run_at)}
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* Last error (if any) */}
            {cron?.last_error && (
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <AlertCircle className="w-4 h-4 text-rose-600" />
                        <h2 className="text-sm font-bold text-rose-900">Most recent error</h2>
                    </div>
                    <pre className="text-xs text-rose-900 font-mono whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                        {cron.last_error}
                    </pre>
                </div>
            )}

            {/* Run history — last 50 runs */}
            <section>
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-bold text-stone-900">Run history · last 50</h2>
                    <Link
                        href="/admin/crons"
                        className="text-[11px] text-stone-500 hover:text-emerald-600 inline-flex items-center gap-1"
                    >
                        Cross-route timeline <ExternalLink className="w-3 h-3" />
                    </Link>
                </div>
                <DataTable
                    columns={columns}
                    rows={runs}
                    rowKey={r => r.id}
                    emptyMessage={
                        cron && cron.runs_7d === 0
                            ? "No runs in the last 7 days. Hit Run now to trigger one."
                            : "No run history yet."
                    }
                />
            </section>

            {data && (
                <p className="text-[10px] text-stone-400">
                    Generated {fmtRelative(data.generated_at)}
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
