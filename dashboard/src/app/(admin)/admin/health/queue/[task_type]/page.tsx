"use client";

/**
 * /admin/health/queue/[task_type] — drill-down for a single worker_jobs task type.
 *
 *  - Status count tiles (pending/running/done/failed/skipped)
 *  - 24h throughput chart (done vs failed per hour, inline SVG bars)
 *  - Sample 20 most-recent failed rows with truncated last_error
 *  - Sample 5 most-recent running rows with age
 *  - Actions: Retry failed · Clear pending (typed-confirm) · Reap stuck
 */

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
    Activity, Loader2, RefreshCw, ArrowLeft, RotateCcw, Trash2, Zap,
    AlertCircle, Clock,
} from "lucide-react";
import clsx from "clsx";
import { HealthCard } from "@/components/admin/health/HealthCard";
import { ActionButton } from "@/components/admin/health/ActionButton";
import { StatusBadge } from "@/components/admin/health/StatusBadge";
import { DataTable, type DataTableColumn } from "@/components/admin/health/DataTable";

interface DetailData {
    ok: boolean;
    task_type: string;
    counts: { pending: number; running: number; done: number; failed: number; skipped: number };
    throughput_24h: { hour_start: string; done: number; failed: number }[];
    sample_failed: {
        id: string;
        finished_at: string | null;
        attempts: number;
        max_attempts: number;
        last_error: string | null;
        payload_summary: string;
    }[];
    sample_running: {
        id: string;
        started_at: string | null;
        age_seconds: number | null;
        attempts: number;
        payload_summary: string;
    }[];
    as_of: string;
}

function fmtAge(sec: number | null): string {
    if (sec == null) return "—";
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
    return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

function fmtRel(ts: string | null): string {
    if (!ts) return "—";
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
}

export default function QueueTaskDetailPage({
    params,
}: {
    params: Promise<{ task_type: string }>;
}) {
    const { task_type } = use(params);
    const taskType = decodeURIComponent(task_type);

    const [data, setData] = useState<DetailData | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    // action state
    const [retrying, setRetrying] = useState(false);
    const [reaping, setReaping] = useState(false);
    const [showClearModal, setShowClearModal] = useState(false);
    const [clearConfirm, setClearConfirm] = useState("");
    const [clearing, setClearing] = useState(false);
    const [actionMsg, setActionMsg] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(
                `/api/admin/queue/task-detail?task_type=${encodeURIComponent(taskType)}`,
                { cache: "no-store" },
            );
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
            setData(json);
            setErr(null);
        } catch (e) {
            setErr((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, [taskType]);

    useEffect(() => {
        load();
        const t = setInterval(load, 15_000);
        return () => clearInterval(t);
    }, [load]);

    async function handleRetryFailed() {
        if (!data || data.counts.failed === 0) return;
        setRetrying(true);
        setActionMsg(null);
        try {
            const res = await fetch(
                `/api/admin/queue/retry-failed?task_type=${encodeURIComponent(taskType)}`,
                { method: "POST" },
            );
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
            setActionMsg(`Re-enqueued ${json.retried} of ${json.candidates} (${json.skipped_due_to_active_duplicate} skipped — already active).`);
            await load();
        } catch (e) {
            setActionMsg(`Retry failed: ${(e as Error).message}`);
        } finally {
            setRetrying(false);
        }
    }

    async function handleReapStuck() {
        setReaping(true);
        setActionMsg(null);
        try {
            const res = await fetch(
                `/api/admin/queue/reap-stuck?task_type=${encodeURIComponent(taskType)}`,
                { method: "POST" },
            );
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
            setActionMsg(`Reaped ${json.requeued} requeued, ${json.failed} failed (global sweep, may include other task types).`);
            await load();
        } catch (e) {
            setActionMsg(`Reap failed: ${(e as Error).message}`);
        } finally {
            setReaping(false);
        }
    }

    async function handleClearPending() {
        if (clearConfirm !== taskType) return;
        setClearing(true);
        setActionMsg(null);
        try {
            const res = await fetch(
                `/api/admin/queue/clear-pending?task_type=${encodeURIComponent(taskType)}&confirm=${encodeURIComponent(taskType)}`,
                { method: "DELETE" },
            );
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
            setActionMsg(`Deleted ${json.deleted} pending row${json.deleted === 1 ? "" : "s"}.`);
            setShowClearModal(false);
            setClearConfirm("");
            await load();
        } catch (e) {
            setActionMsg(`Clear failed: ${(e as Error).message}`);
        } finally {
            setClearing(false);
        }
    }

    if (loading && !data) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 text-stone-400 animate-spin" />
            </div>
        );
    }

    if (err && !data) {
        return (
            <div className="max-w-md mx-auto bg-rose-50 border border-rose-200 rounded-2xl p-6">
                <h1 className="font-bold text-rose-700 mb-2">Detail unavailable</h1>
                <p className="text-sm text-rose-600">{err}</p>
                <Link href="/admin/queue" className="text-xs text-emerald-700 hover:underline mt-3 inline-block">← Back to queue</Link>
            </div>
        );
    }

    if (!data) return null;

    const failedCols: DataTableColumn<DetailData["sample_failed"][number]>[] = [
        { key: "when", header: "When", render: r => <span className="text-stone-500">{fmtRel(r.finished_at)}</span> },
        { key: "attempts", header: "Attempts", align: "center", render: r => <span className="font-mono">{r.attempts}/{r.max_attempts}</span> },
        { key: "payload", header: "Target", render: r => <span className="font-mono text-stone-700">{r.payload_summary || "—"}</span> },
        { key: "err", header: "Last error", render: r => <span className="text-rose-700 whitespace-pre-wrap break-words block max-w-md">{r.last_error || "—"}</span> },
    ];

    const runningCols: DataTableColumn<DetailData["sample_running"][number]>[] = [
        { key: "age", header: "Running for", render: r => (
            <span className={clsx(
                "font-mono inline-flex items-center gap-1",
                r.age_seconds && r.age_seconds > 600 ? "text-rose-700 font-bold" : "text-blue-700",
            )}>
                <Clock className="w-3 h-3" />
                {fmtAge(r.age_seconds)}
            </span>
        ) },
        { key: "started", header: "Started", render: r => <span className="text-stone-500">{fmtRel(r.started_at)}</span> },
        { key: "attempts", header: "Attempt", align: "center", render: r => <span className="font-mono">{r.attempts}</span> },
        { key: "payload", header: "Target", render: r => <span className="font-mono text-stone-700">{r.payload_summary || "—"}</span> },
    ];

    // Throughput chart sizing — single inline SVG so we don't pull in a chart lib
    const maxBar = Math.max(1, ...data.throughput_24h.map(b => b.done + b.failed));
    const chartW = 720;
    const chartH = 140;
    const barW = chartW / data.throughput_24h.length;

    return (
        <div className="w-full max-w-6xl mx-auto space-y-6">
            <Link
                href="/admin/queue"
                className="inline-flex items-center gap-1.5 text-xs text-stone-500 hover:text-emerald-700 transition-colors"
            >
                <ArrowLeft className="w-3 h-3" /> Back to all task types
            </Link>

            <header className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400 mb-1.5">Operations · Queue</p>
                    <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2 font-mono">
                        <Activity className="w-6 h-6 text-emerald-600" /> {taskType}
                    </h1>
                    <p className="text-sm text-stone-500 mt-1">
                        Auto-refreshes every 15s. As of {new Date(data.as_of).toLocaleTimeString()}.
                    </p>
                </div>
                <ActionButton onClick={load} loading={loading} icon={RefreshCw}>Refresh</ActionButton>
            </header>

            {/* Actions toolbar */}
            <div className="flex flex-wrap items-center gap-2 bg-white border border-stone-200 rounded-2xl p-3">
                <ActionButton
                    onClick={handleRetryFailed}
                    loading={retrying}
                    disabled={data.counts.failed === 0}
                    icon={RotateCcw}
                    tone="primary"
                >
                    Retry {data.counts.failed} failed
                </ActionButton>
                <ActionButton
                    onClick={() => setShowClearModal(true)}
                    disabled={data.counts.pending === 0}
                    icon={Trash2}
                    tone="danger"
                >
                    Clear {data.counts.pending} pending
                </ActionButton>
                <ActionButton
                    onClick={handleReapStuck}
                    loading={reaping}
                    icon={Zap}
                >
                    Reap stuck running
                </ActionButton>
                {actionMsg && (
                    <p className="text-xs text-stone-600 ml-2 flex-1 min-w-0">{actionMsg}</p>
                )}
            </div>

            {/* Status count tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <HealthCard label="Pending" title="Awaiting" value={data.counts.pending.toLocaleString()} valueTone={data.counts.pending > 100 ? "warn" : "default"} />
                <HealthCard label="Running" title="In flight" value={data.counts.running.toLocaleString()} valueTone={data.counts.running > 0 ? "ok" : "default"} />
                <HealthCard label="Done" title="Last 24h" value={data.counts.done.toLocaleString()} valueTone="ok" />
                <HealthCard label="Failed" title="Errors" value={data.counts.failed.toLocaleString()} valueTone={data.counts.failed > 0 ? "error" : "default"} />
                <HealthCard label="Skipped" title="Noop" value={data.counts.skipped.toLocaleString()} />
            </div>

            {/* Throughput chart */}
            <div className="bg-white rounded-[28px] border border-stone-200 p-5">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-stone-500">Throughput · last 24h</h2>
                    <div className="flex items-center gap-3 text-[10px] text-stone-500">
                        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-500" /> done</span>
                        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-rose-500" /> failed</span>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <svg width={chartW} height={chartH} className="block">
                        {data.throughput_24h.map((b, i) => {
                            const totalH = ((b.done + b.failed) / maxBar) * (chartH - 24);
                            const doneH = (b.done / maxBar) * (chartH - 24);
                            const failedH = (b.failed / maxBar) * (chartH - 24);
                            const x = i * barW;
                            return (
                                <g key={b.hour_start}>
                                    <title>
                                        {new Date(b.hour_start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                        {": "}
                                        {b.done} done, {b.failed} failed
                                    </title>
                                    {failedH > 0 && (
                                        <rect
                                            x={x + 2}
                                            y={chartH - totalH - 20}
                                            width={Math.max(2, barW - 4)}
                                            height={failedH}
                                            fill="#f43f5e"
                                            rx={1}
                                        />
                                    )}
                                    {doneH > 0 && (
                                        <rect
                                            x={x + 2}
                                            y={chartH - doneH - 20}
                                            width={Math.max(2, barW - 4)}
                                            height={doneH}
                                            fill="#10b981"
                                            rx={1}
                                        />
                                    )}
                                    {/* Hour label every 4th bucket so the axis stays readable */}
                                    {i % 4 === 0 && (
                                        <text
                                            x={x + barW / 2}
                                            y={chartH - 4}
                                            fontSize={9}
                                            fill="#a8a29e"
                                            textAnchor="middle"
                                        >
                                            {new Date(b.hour_start).getHours()}h
                                        </text>
                                    )}
                                </g>
                            );
                        })}
                    </svg>
                </div>
                <p className="text-[10px] text-stone-400 mt-2">
                    Total done last 24h: {data.throughput_24h.reduce((a, b) => a + b.done, 0).toLocaleString()}
                    {" · "}
                    Total failed last 24h: {data.throughput_24h.reduce((a, b) => a + b.failed, 0).toLocaleString()}
                </p>
            </div>

            {/* Running sample */}
            <section>
                <div className="flex items-center justify-between mb-2">
                    <h2 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                        <Loader2 className="w-4 h-4 text-blue-600" /> In-flight sample
                    </h2>
                    <span className="text-[10px] text-stone-400">{data.sample_running.length} of {data.counts.running} shown · oldest first</span>
                </div>
                <DataTable
                    rows={data.sample_running}
                    columns={runningCols}
                    rowKey={r => r.id}
                    emptyMessage="No running jobs right now."
                />
            </section>

            {/* Failed sample */}
            <section>
                <div className="flex items-center justify-between mb-2">
                    <h2 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-rose-600" /> Recent failures
                    </h2>
                    <div className="flex items-center gap-2">
                        <StatusBadge tone={data.counts.failed > 0 ? "error" : "ok"} label={`${data.counts.failed} total`} />
                        <span className="text-[10px] text-stone-400">{data.sample_failed.length} sampled</span>
                    </div>
                </div>
                <DataTable
                    rows={data.sample_failed}
                    columns={failedCols}
                    rowKey={r => r.id}
                    emptyMessage="No recent failures. Nice."
                />
            </section>

            {/* Clear pending typed-confirm modal */}
            {showClearModal && (
                <div
                    className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={() => !clearing && setShowClearModal(false)}
                >
                    <div
                        className="bg-white rounded-[28px] border border-rose-200 max-w-md w-full p-6 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-2 mb-3">
                            <Trash2 className="w-5 h-5 text-rose-600" />
                            <h3 className="font-bold text-stone-900">Clear pending jobs</h3>
                        </div>
                        <p className="text-sm text-stone-600 mb-4">
                            This will <strong className="text-rose-700">permanently delete</strong> all{" "}
                            <strong>{data.counts.pending}</strong> pending rows for{" "}
                            <code className="bg-stone-100 px-1.5 py-0.5 rounded text-xs font-mono">{taskType}</code>.
                            Running and done rows are not affected.
                        </p>
                        <label className="block text-xs font-bold text-stone-600 mb-1.5">
                            Type the task type to confirm:
                        </label>
                        <input
                            type="text"
                            value={clearConfirm}
                            onChange={(e) => setClearConfirm(e.target.value)}
                            placeholder={taskType}
                            autoFocus
                            className="w-full px-3 py-2 border border-stone-300 rounded-xl text-sm font-mono mb-4 focus:border-rose-400 focus:outline-none"
                        />
                        <div className="flex items-center justify-end gap-2">
                            <ActionButton
                                onClick={() => { setShowClearModal(false); setClearConfirm(""); }}
                                disabled={clearing}
                            >
                                Cancel
                            </ActionButton>
                            <ActionButton
                                onClick={handleClearPending}
                                loading={clearing}
                                disabled={clearConfirm !== taskType}
                                tone="danger"
                                icon={Trash2}
                            >
                                Delete {data.counts.pending} rows
                            </ActionButton>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
