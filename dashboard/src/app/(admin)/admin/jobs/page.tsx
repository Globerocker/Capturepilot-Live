"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Activity, Clock, AlertTriangle, CheckCircle2, Loader2, PlayCircle,
    RefreshCw, Mail, FileText, Paperclip, Database, ListChecks,
} from "lucide-react";
import clsx from "clsx";

const POLL_MS = 10_000;

type TabKey = "crons" | "worker" | "email" | "attachment" | "rescore";

const TABS: { key: TabKey; label: string; icon: typeof Activity }[] = [
    { key: "crons", label: "Crons", icon: Clock },
    { key: "worker", label: "Worker Queue", icon: Database },
    { key: "email", label: "Email Queue", icon: Mail },
    { key: "attachment", label: "Attachment Jobs", icon: Paperclip },
    { key: "rescore", label: "Rescore Queue", icon: ListChecks },
];

type CronRow = {
    path: string;
    name: string;
    schedule: string;
    description: string;
    last_run: string | null;
    last_status: string | null;
    runs_7d: number;
    last_duration_ms: number | null;
};

type Throughput = { last5min: number; last30min: number; last60min: number };

type WorkerRow = { task_type: string; pending: number; running: number; done: number; failed: number; total: number };

type EmailRow = {
    id: string;
    email_address: string;
    template_key: string;
    sequence_key: string | null;
    status: string;
    scheduled_for: string;
    sent_at: string | null;
    failure_reason: string | null;
};

type AttachmentRow = {
    id: string;
    notice_id: string;
    status: string;
    files_total: number | null;
    files_done: number | null;
    current_file: string | null;
    error: string | null;
    created_at: string;
    completed_at: string | null;
};

type RescoreRow = {
    id: string;
    user_profile_id: string;
    status: string;
    current_section: string | null;
    completed_sections: number | null;
    total_sections: number | null;
    error: string | null;
    created_at: string;
    completed_at: string | null;
};

function timeAgo(iso: string | null): string {
    if (!iso) return "never";
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 0) return "just now";
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

function statusBadge(status: string | null | undefined) {
    if (!status) return <span className="text-stone-400 text-xs">—</span>;
    const palette: Record<string, string> = {
        ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
        done: "bg-emerald-50 text-emerald-700 border-emerald-200",
        completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
        sent: "bg-emerald-50 text-emerald-700 border-emerald-200",
        success: "bg-emerald-50 text-emerald-700 border-emerald-200",
        failed: "bg-red-50 text-red-700 border-red-200",
        error: "bg-red-50 text-red-700 border-red-200",
        canceled: "bg-stone-100 text-stone-600 border-stone-200",
        pending: "bg-amber-50 text-amber-700 border-amber-200",
        running: "bg-blue-50 text-blue-700 border-blue-200",
        writing: "bg-blue-50 text-blue-700 border-blue-200",
        downloading: "bg-blue-50 text-blue-700 border-blue-200",
        extracting: "bg-blue-50 text-blue-700 border-blue-200",
    };
    return (
        <span className={clsx(
            "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border",
            palette[status] || "bg-stone-100 text-stone-700 border-stone-200",
        )}>
            {status}
        </span>
    );
}

export default function AdminJobsPage() {
    const [tab, setTab] = useState<TabKey>("crons");
    const [payload, setPayload] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastFetched, setLastFetched] = useState<Date | null>(null);
    const [pendingTrigger, setPendingTrigger] = useState<string | null>(null);
    const [triggerResult, setTriggerResult] = useState<{ path: string; ok: boolean; message: string } | null>(null);

    const fetchTab = useCallback(async (which: TabKey) => {
        try {
            const res = await fetch(`/api/admin/jobs?tab=${which}`, { cache: "no-store" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed");
            setPayload(data);
            setError(null);
            setLastFetched(new Date());
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        setLoading(true);
        setPayload(null);
        fetchTab(tab);
    }, [tab, fetchTab]);

    useEffect(() => {
        const id = setInterval(() => fetchTab(tab), POLL_MS);
        return () => clearInterval(id);
    }, [tab, fetchTab]);

    const triggerCron = async (path: string) => {
        setPendingTrigger(path);
        setTriggerResult(null);
        try {
            const res = await fetch("/api/admin/jobs/trigger-cron", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                setTriggerResult({ path, ok: false, message: data.error || `HTTP ${data.status || res.status}` });
            } else {
                setTriggerResult({ path, ok: true, message: `Ran in ${data.elapsed_ms}ms (HTTP ${data.status})` });
            }
            // Refresh table so the new run appears.
            await fetchTab(tab);
        } catch (e) {
            setTriggerResult({ path, ok: false, message: (e as Error).message });
        } finally {
            setPendingTrigger(null);
        }
    };

    const headerCard = (
        <div className="bg-white border border-stone-200 rounded-xl p-5 flex flex-wrap items-center gap-4 justify-between">
            <div>
                <h1 className="text-xl font-bold flex items-center gap-2">
                    <Activity className="w-5 h-5" /> Background Jobs
                </h1>
                <p className="text-xs text-stone-500 mt-1">
                    Every background worker in one place. Auto-refreshes every 10s.
                    {lastFetched && <> Last update {timeAgo(lastFetched.toISOString())}.</>}
                </p>
            </div>
            <button
                type="button"
                onClick={() => fetchTab(tab)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-lg px-3 py-1.5"
            >
                <RefreshCw className="w-3.5 h-3.5" /> Refresh now
            </button>
        </div>
    );

    return (
        <div className="w-full space-y-4">
            {headerCard}

            {/* Tabs */}
            <div className="bg-white border border-stone-200 rounded-xl p-1 flex flex-wrap gap-1">
                {TABS.map((t) => {
                    const Icon = t.icon;
                    const active = tab === t.key;
                    return (
                        <button
                            key={t.key}
                            type="button"
                            onClick={() => setTab(t.key)}
                            className={clsx(
                                "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                                active ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100",
                            )}
                        >
                            <Icon className="w-4 h-4" /> {t.label}
                        </button>
                    );
                })}
            </div>

            {triggerResult && (
                <div className={clsx(
                    "rounded-xl border px-4 py-2 text-xs font-medium",
                    triggerResult.ok
                        ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                        : "bg-red-50 border-red-200 text-red-700",
                )}>
                    {triggerResult.ok ? <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" /> : <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />}
                    {triggerResult.path} — {triggerResult.message}
                </div>
            )}

            {/* Body */}
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                {loading ? (
                    <div className="p-10 flex items-center justify-center text-stone-400">
                        <Loader2 className="w-5 h-5 animate-spin" />
                    </div>
                ) : error ? (
                    <div className="p-6 text-sm text-red-600 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" /> {error}
                    </div>
                ) : (
                    <>
                        {tab === "crons" && <CronsTab payload={payload} pendingTrigger={pendingTrigger} onTrigger={triggerCron} />}
                        {tab === "worker" && <WorkerTab payload={payload} />}
                        {tab === "email" && <EmailTab payload={payload} onTriggerEmail={() => triggerCron("/api/cron/process_scheduled_emails")} pendingTrigger={pendingTrigger} />}
                        {tab === "attachment" && <AttachmentTab payload={payload} />}
                        {tab === "rescore" && <RescoreTab payload={payload} onTriggerRescore={() => triggerCron("/api/cron/score_matches")} pendingTrigger={pendingTrigger} />}
                    </>
                )}
            </div>
        </div>
    );
}

/* ------------------------------ Crons tab ------------------------------ */

function CronsTab({
    payload,
    pendingTrigger,
    onTrigger,
}: {
    payload: { rows: CronRow[]; has_history: boolean } | null;
    pendingTrigger: string | null;
    onTrigger: (path: string) => void;
}) {
    const rows = payload?.rows || [];
    const summary = useMemo(() => ({
        total: rows.length,
        failing: rows.filter((r) => r.last_status === "failed" || r.last_status === "error").length,
        healthy: rows.filter((r) => r.last_status === "ok" || r.last_status === "success" || r.last_status === "done").length,
        runs_7d: rows.reduce((s, r) => s + (r.runs_7d || 0), 0),
    }), [rows]);

    return (
        <>
            <StatStrip
                items={[
                    { label: "Crons", value: summary.total, tone: "stone" },
                    { label: "Healthy", value: summary.healthy, tone: "emerald" },
                    { label: "Failing", value: summary.failing, tone: "red" },
                    { label: "Runs / 7d", value: summary.runs_7d, tone: "stone" },
                ]}
            />
            {!payload?.has_history && (
                <div className="px-5 py-2 text-[11px] text-amber-700 bg-amber-50 border-y border-amber-100">
                    No <code className="font-mono">cron_runs</code> history table found — schedules below come from the static catalog. Run history will populate once the table exists.
                </div>
            )}
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-stone-50 text-stone-500 text-xs uppercase tracking-wider">
                        <tr>
                            <th className="text-left px-5 py-2 font-semibold">Route</th>
                            <th className="text-left px-3 py-2 font-semibold">Schedule</th>
                            <th className="text-left px-3 py-2 font-semibold">Last run</th>
                            <th className="text-left px-3 py-2 font-semibold">Status</th>
                            <th className="text-left px-3 py-2 font-semibold">Runs / 7d</th>
                            <th className="text-right px-5 py-2 font-semibold">Re-run</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                        {rows.map((r) => (
                            <tr key={r.path} className="hover:bg-stone-50">
                                <td className="px-5 py-3">
                                    <p className="font-mono text-stone-800">{r.name}</p>
                                    <p className="text-[11px] text-stone-500">{r.description}</p>
                                </td>
                                <td className="px-3 py-3 font-mono text-xs text-stone-600">{r.schedule}</td>
                                <td className="px-3 py-3 text-xs text-stone-600">{timeAgo(r.last_run)}</td>
                                <td className="px-3 py-3">{statusBadge(r.last_status)}</td>
                                <td className="px-3 py-3 text-stone-600">{r.runs_7d}</td>
                                <td className="px-5 py-3 text-right">
                                    <button
                                        type="button"
                                        onClick={() => onTrigger(r.path)}
                                        disabled={pendingTrigger === r.path}
                                        className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-lg px-2.5 py-1.5 disabled:opacity-50"
                                    >
                                        {pendingTrigger === r.path
                                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            : <PlayCircle className="w-3.5 h-3.5" />}
                                        Run
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

/* ----------------------------- Worker tab ----------------------------- */

function WorkerTab({ payload }: { payload: { rows: WorkerRow[]; throughput: Throughput; table_missing?: boolean } | null }) {
    if (payload?.table_missing) {
        return <EmptyTable message="No worker_jobs table on this deploy yet." />;
    }
    const rows = payload?.rows || [];
    const throughput = payload?.throughput || { last5min: 0, last30min: 0, last60min: 0 };
    const totals = rows.reduce((s, r) => ({
        pending: s.pending + r.pending,
        running: s.running + r.running,
        done: s.done + r.done,
        failed: s.failed + r.failed,
    }), { pending: 0, running: 0, done: 0, failed: 0 });

    return (
        <>
            <StatStrip
                items={[
                    { label: "Pending", value: totals.pending, tone: "amber" },
                    { label: "Running", value: totals.running, tone: "blue" },
                    { label: "Done", value: totals.done, tone: "emerald" },
                    { label: "Failed", value: totals.failed, tone: "red" },
                ]}
            />
            <ThroughputStrip throughput={throughput} />
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-stone-50 text-stone-500 text-xs uppercase tracking-wider">
                        <tr>
                            <th className="text-left px-5 py-2 font-semibold">Task type</th>
                            <th className="text-left px-3 py-2 font-semibold">Pending</th>
                            <th className="text-left px-3 py-2 font-semibold">Running</th>
                            <th className="text-left px-3 py-2 font-semibold">Done</th>
                            <th className="text-left px-3 py-2 font-semibold">Failed</th>
                            <th className="text-left px-5 py-2 font-semibold">Total</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                        {rows.length === 0 && (
                            <tr><td colSpan={6} className="px-5 py-8 text-center text-stone-400 text-sm">Queue is empty.</td></tr>
                        )}
                        {rows.map((r) => (
                            <tr key={r.task_type} className="hover:bg-stone-50">
                                <td className="px-5 py-3 font-mono text-xs text-stone-800">{r.task_type}</td>
                                <td className="px-3 py-3 text-amber-700">{r.pending}</td>
                                <td className="px-3 py-3 text-blue-700">{r.running}</td>
                                <td className="px-3 py-3 text-emerald-700">{r.done}</td>
                                <td className="px-3 py-3 text-red-700">{r.failed}</td>
                                <td className="px-5 py-3 text-stone-700 font-medium">{r.total}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

/* ----------------------------- Email tab ----------------------------- */

function EmailTab({
    payload,
    onTriggerEmail,
    pendingTrigger,
}: {
    payload: { rows: EmailRow[]; counts: { pending: number; failed: number; sent_last_hour: number }; throughput: Throughput } | null;
    onTriggerEmail: () => void;
    pendingTrigger: string | null;
}) {
    const rows = payload?.rows || [];
    const counts = payload?.counts || { pending: 0, failed: 0, sent_last_hour: 0 };
    const throughput = payload?.throughput || { last5min: 0, last30min: 0, last60min: 0 };

    return (
        <>
            <StatStrip
                items={[
                    { label: "Pending", value: counts.pending, tone: "amber" },
                    { label: "Sent last hour", value: counts.sent_last_hour, tone: "emerald" },
                    { label: "Failed", value: counts.failed, tone: "red" },
                ]}
                rightSlot={
                    <button
                        type="button"
                        onClick={onTriggerEmail}
                        disabled={pendingTrigger === "/api/cron/process_scheduled_emails"}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-lg px-3 py-1.5 disabled:opacity-50"
                    >
                        {pendingTrigger === "/api/cron/process_scheduled_emails"
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <PlayCircle className="w-3.5 h-3.5" />}
                        Drain queue now
                    </button>
                }
            />
            <ThroughputStrip throughput={throughput} />
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-stone-50 text-stone-500 text-xs uppercase tracking-wider">
                        <tr>
                            <th className="text-left px-5 py-2 font-semibold">Recipient</th>
                            <th className="text-left px-3 py-2 font-semibold">Template</th>
                            <th className="text-left px-3 py-2 font-semibold">Sequence</th>
                            <th className="text-left px-3 py-2 font-semibold">Scheduled</th>
                            <th className="text-left px-3 py-2 font-semibold">Sent</th>
                            <th className="text-left px-5 py-2 font-semibold">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                        {rows.length === 0 && (
                            <tr><td colSpan={6} className="px-5 py-8 text-center text-stone-400 text-sm">Nothing queued.</td></tr>
                        )}
                        {rows.map((r) => (
                            <tr key={r.id} className="hover:bg-stone-50">
                                <td className="px-5 py-3 text-stone-800 text-xs"><Mail className="w-3 h-3 inline mr-1 text-stone-400" />{r.email_address}</td>
                                <td className="px-3 py-3 text-xs text-stone-600 font-mono">{r.template_key}</td>
                                <td className="px-3 py-3 text-xs text-stone-500">{r.sequence_key || "—"}</td>
                                <td className="px-3 py-3 text-xs text-stone-500">{timeAgo(r.scheduled_for)}</td>
                                <td className="px-3 py-3 text-xs text-stone-500">{r.sent_at ? timeAgo(r.sent_at) : "—"}</td>
                                <td className="px-5 py-3">
                                    {statusBadge(r.status)}
                                    {r.failure_reason && <p className="text-[10px] text-red-600 mt-0.5">{r.failure_reason}</p>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

/* --------------------------- Attachment tab --------------------------- */

function AttachmentTab({ payload }: { payload: { rows: AttachmentRow[]; counts: { pending: number; running: number; completed: number; failed: number }; throughput: Throughput; table_missing?: boolean } | null }) {
    if (payload?.table_missing) {
        return <EmptyTable message="No attachment_analysis_jobs table on this deploy yet." />;
    }
    const rows = payload?.rows || [];
    const counts = payload?.counts || { pending: 0, running: 0, completed: 0, failed: 0 };
    const throughput = payload?.throughput || { last5min: 0, last30min: 0, last60min: 0 };

    return (
        <>
            <StatStrip
                items={[
                    { label: "Pending", value: counts.pending, tone: "amber" },
                    { label: "Running", value: counts.running, tone: "blue" },
                    { label: "Completed", value: counts.completed, tone: "emerald" },
                    { label: "Failed", value: counts.failed, tone: "red" },
                ]}
            />
            <ThroughputStrip throughput={throughput} />
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-stone-50 text-stone-500 text-xs uppercase tracking-wider">
                        <tr>
                            <th className="text-left px-5 py-2 font-semibold">Notice</th>
                            <th className="text-left px-3 py-2 font-semibold">Status</th>
                            <th className="text-left px-3 py-2 font-semibold">Files</th>
                            <th className="text-left px-3 py-2 font-semibold">Current file</th>
                            <th className="text-left px-3 py-2 font-semibold">Started</th>
                            <th className="text-left px-5 py-2 font-semibold">Finished</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                        {rows.length === 0 && (
                            <tr><td colSpan={6} className="px-5 py-8 text-center text-stone-400 text-sm">No analysis jobs yet.</td></tr>
                        )}
                        {rows.map((r) => (
                            <tr key={r.id} className="hover:bg-stone-50">
                                <td className="px-5 py-3 text-xs font-mono text-stone-800"><FileText className="w-3 h-3 inline mr-1 text-stone-400" />{r.notice_id}</td>
                                <td className="px-3 py-3">
                                    {statusBadge(r.status)}
                                    {r.error && <p className="text-[10px] text-red-600 mt-0.5 truncate max-w-xs">{r.error}</p>}
                                </td>
                                <td className="px-3 py-3 text-xs text-stone-600">{(r.files_done ?? 0)} / {(r.files_total ?? 0)}</td>
                                <td className="px-3 py-3 text-[11px] text-stone-500 truncate max-w-xs">{r.current_file || "—"}</td>
                                <td className="px-3 py-3 text-xs text-stone-500">{timeAgo(r.created_at)}</td>
                                <td className="px-5 py-3 text-xs text-stone-500">{r.completed_at ? timeAgo(r.completed_at) : "—"}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

/* ---------------------------- Rescore tab ---------------------------- */

function RescoreTab({
    payload,
    onTriggerRescore,
    pendingTrigger,
}: {
    payload: { rows: RescoreRow[]; counts: { pending: number; running: number; completed: number; failed: number }; throughput: Throughput; table: string } | null;
    onTriggerRescore: () => void;
    pendingTrigger: string | null;
}) {
    const rows = payload?.rows || [];
    const counts = payload?.counts || { pending: 0, running: 0, completed: 0, failed: 0 };
    const throughput = payload?.throughput || { last5min: 0, last30min: 0, last60min: 0 };

    return (
        <>
            <StatStrip
                items={[
                    { label: "Pending", value: counts.pending, tone: "amber" },
                    { label: "Running", value: counts.running, tone: "blue" },
                    { label: "Completed", value: counts.completed, tone: "emerald" },
                    { label: "Failed", value: counts.failed, tone: "red" },
                ]}
                rightSlot={
                    <button
                        type="button"
                        onClick={onTriggerRescore}
                        disabled={pendingTrigger === "/api/cron/score_matches"}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-lg px-3 py-1.5 disabled:opacity-50"
                    >
                        {pendingTrigger === "/api/cron/score_matches"
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <PlayCircle className="w-3.5 h-3.5" />}
                        Rescore everyone
                    </button>
                }
            />
            <ThroughputStrip throughput={throughput} />
            <div className="px-5 py-2 text-[11px] text-stone-500 bg-stone-50 border-y border-stone-100">
                Reading from <code className="font-mono">{payload?.table || "proposal_jobs"}</code>.
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-stone-50 text-stone-500 text-xs uppercase tracking-wider">
                        <tr>
                            <th className="text-left px-5 py-2 font-semibold">Profile</th>
                            <th className="text-left px-3 py-2 font-semibold">Status</th>
                            <th className="text-left px-3 py-2 font-semibold">Progress</th>
                            <th className="text-left px-3 py-2 font-semibold">Current</th>
                            <th className="text-left px-3 py-2 font-semibold">Started</th>
                            <th className="text-left px-5 py-2 font-semibold">Finished</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                        {rows.length === 0 && (
                            <tr><td colSpan={6} className="px-5 py-8 text-center text-stone-400 text-sm">No rescore jobs yet.</td></tr>
                        )}
                        {rows.map((r) => (
                            <tr key={r.id} className="hover:bg-stone-50">
                                <td className="px-5 py-3 text-xs font-mono text-stone-800">{r.user_profile_id.slice(0, 8)}…</td>
                                <td className="px-3 py-3">
                                    {statusBadge(r.status)}
                                    {r.error && <p className="text-[10px] text-red-600 mt-0.5 truncate max-w-xs">{r.error}</p>}
                                </td>
                                <td className="px-3 py-3 text-xs text-stone-600">{(r.completed_sections ?? 0)} / {(r.total_sections ?? 0)}</td>
                                <td className="px-3 py-3 text-[11px] text-stone-500 truncate max-w-xs">{r.current_section || "—"}</td>
                                <td className="px-3 py-3 text-xs text-stone-500">{timeAgo(r.created_at)}</td>
                                <td className="px-5 py-3 text-xs text-stone-500">{r.completed_at ? timeAgo(r.completed_at) : "—"}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

/* ----------------------------- shared bits ----------------------------- */

function StatStrip({
    items,
    rightSlot,
}: {
    items: { label: string; value: number; tone: "stone" | "emerald" | "red" | "amber" | "blue" }[];
    rightSlot?: React.ReactNode;
}) {
    const tones: Record<string, string> = {
        stone: "text-stone-800",
        emerald: "text-emerald-700",
        red: "text-red-700",
        amber: "text-amber-700",
        blue: "text-blue-700",
    };
    return (
        <div className="flex flex-wrap items-center gap-6 px-5 py-4 border-b border-stone-100">
            {items.map((i) => (
                <div key={i.label}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">{i.label}</p>
                    <p className={clsx("text-lg font-bold", tones[i.tone])}>{i.value.toLocaleString()}</p>
                </div>
            ))}
            {rightSlot && <div className="ml-auto">{rightSlot}</div>}
        </div>
    );
}

function ThroughputStrip({ throughput }: { throughput: Throughput }) {
    return (
        <div className="flex flex-wrap items-center gap-4 px-5 py-2 text-[11px] text-stone-500 bg-stone-50 border-b border-stone-100">
            <span className="font-semibold uppercase tracking-wider text-stone-400">Throughput</span>
            <span>5m: <strong className="text-stone-700">{throughput.last5min}</strong></span>
            <span>30m: <strong className="text-stone-700">{throughput.last30min}</strong></span>
            <span>60m: <strong className="text-stone-700">{throughput.last60min}</strong></span>
        </div>
    );
}

function EmptyTable({ message }: { message: string }) {
    return (
        <div className="p-10 text-center text-sm text-stone-400 flex flex-col items-center gap-2">
            <Database className="w-6 h-6 text-stone-300" />
            {message}
        </div>
    );
}
