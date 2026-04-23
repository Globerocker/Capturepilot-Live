"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, Mic, ClipboardCheck, ShieldCheck, FileText, X, CheckCircle2, AlertCircle, Activity } from "lucide-react";
import clsx from "clsx";

const POLL_MS = 2500;

interface JobSummary {
    id: string;
    kind: string;
    title: string | null;
    status: "pending" | "running" | "completed" | "failed" | "canceled";
    progress_pct: number;
    current_step: string | null;
    completed_steps: number;
    total_steps: number;
    updated_at: string;
    error?: string | null;
}

const KIND_META: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
    ai_win_strategy:    { icon: Sparkles,       color: "text-emerald-400" },
    voice_brief:        { icon: Mic,            color: "text-blue-400" },
    compliance_matrix:  { icon: ClipboardCheck, color: "text-amber-400" },
    capability_matrix:  { icon: ShieldCheck,    color: "text-indigo-400" },
    capture_brief:      { icon: FileText,       color: "text-purple-400" },
    ai_proposal:        { icon: FileText,       color: "text-rose-400" },
};

function kindLabel(kind: string): string {
    switch (kind) {
        case "ai_win_strategy": return "Win Strategy";
        case "voice_brief": return "Voice Brief";
        case "compliance_matrix": return "Compliance Matrix";
        case "capability_matrix": return "Capability Matrix";
        case "capture_brief": return "Capture Brief";
        case "ai_proposal": return "Proposal";
        default: return kind.replace(/_/g, " ");
    }
}

/**
 * Floating bottom-right pill that tracks every background job the user
 * has in flight. Click to expand into a card showing per-job progress
 * bars. Persists across every dashboard page so users can start a job,
 * tab away, and watch progress from anywhere.
 */
export default function GlobalJobsIndicator() {
    const [jobs, setJobs] = useState<JobSummary[]>([]);
    const [expanded, setExpanded] = useState(false);
    const [recentlyDone, setRecentlyDone] = useState<JobSummary[]>([]);
    const seenTerminalRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        let alive = true;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const poll = async () => {
            if (!alive) return;
            try {
                const res = await fetch("/api/jobs?status=pending,running", { cache: "no-store" });
                if (res.ok) {
                    const data = await res.json();
                    const next = (data.jobs || []) as JobSummary[];
                    if (!alive) return;
                    setJobs(next);
                }
                // Separately poll recent terminal jobs for 60s after they finish so
                // the user sees the "completed" confirmation even if they switch
                // pages right when it lands.
                const resT = await fetch("/api/jobs?status=completed,failed", { cache: "no-store" });
                if (resT.ok) {
                    const data = await resT.json();
                    const recent = ((data.jobs || []) as JobSummary[]).filter(j => {
                        const age = Date.now() - new Date(j.updated_at).getTime();
                        return age < 60_000 && !seenTerminalRef.current.has(`${j.id}:stale`);
                    });
                    if (alive) setRecentlyDone(recent);
                }
            } catch {
                // swallow — best-effort
            } finally {
                if (alive) timer = setTimeout(poll, POLL_MS);
            }
        };
        poll();
        return () => {
            alive = false;
            if (timer) clearTimeout(timer);
        };
    }, []);

    const dismissDone = (id: string) => {
        seenTerminalRef.current.add(`${id}:stale`);
        setRecentlyDone(prev => prev.filter(j => j.id !== id));
    };

    const activeCount = jobs.length;
    const doneCount = recentlyDone.length;
    if (activeCount === 0 && doneCount === 0) return null;

    return (
        <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
            {/* Expanded card */}
            {expanded && (
                <div className="bg-white/95 backdrop-blur-md border border-stone-200 rounded-2xl shadow-2xl w-80 max-h-[60vh] overflow-y-auto animate-in slide-in-from-bottom-2 fade-in duration-200">
                    <div className="sticky top-0 bg-white/95 backdrop-blur-md border-b border-stone-100 px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Activity className="w-3.5 h-3.5 text-stone-500" />
                            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500">
                                Background jobs
                            </p>
                        </div>
                        <button type="button" onClick={() => setExpanded(false)} className="text-stone-400 hover:text-stone-700" aria-label="Collapse">
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                    <div className="p-2 space-y-1.5">
                        {recentlyDone.map((job) => {
                            const meta = KIND_META[job.kind] || { icon: FileText, color: "text-stone-400" };
                            const Icon = meta.icon;
                            return (
                                <div key={job.id} className={clsx(
                                    "p-3 rounded-xl border flex items-start gap-2",
                                    job.status === "completed" ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200",
                                )}>
                                    {job.status === "completed"
                                        ? <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                                        : <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <Icon className="w-3 h-3 text-stone-500" />
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                                                {kindLabel(job.kind)}
                                            </p>
                                        </div>
                                        <p className="text-xs font-semibold text-stone-900 mt-0.5 line-clamp-2">
                                            {job.title || job.kind}
                                        </p>
                                        {job.status === "failed" && job.error && (
                                            <p className="text-[10px] text-rose-600 mt-0.5 line-clamp-2">{job.error}</p>
                                        )}
                                    </div>
                                    <button type="button" onClick={() => dismissDone(job.id)} className="text-stone-400 hover:text-stone-700 flex-shrink-0" aria-label="Dismiss">
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            );
                        })}

                        {jobs.map((job) => {
                            const meta = KIND_META[job.kind] || { icon: FileText, color: "text-stone-400" };
                            const Icon = meta.icon;
                            const label = job.current_step
                                ? job.current_step.replace(/_/g, " ")
                                : job.status === "pending" ? "Starting..." : "Running";
                            return (
                                <div key={job.id} className="p-3 bg-stone-50 border border-stone-200 rounded-xl">
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <Loader2 className={clsx("w-3.5 h-3.5 animate-spin", meta.color)} />
                                        <Icon className="w-3 h-3 text-stone-500" />
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                                            {kindLabel(job.kind)}
                                        </p>
                                        <span className="ml-auto text-[10px] font-mono text-stone-400 tabular-nums">
                                            {job.completed_steps}/{job.total_steps}
                                        </span>
                                    </div>
                                    <p className="text-xs font-semibold text-stone-900 line-clamp-1">
                                        {job.title || job.kind}
                                    </p>
                                    <p className="text-[10px] text-stone-500 mt-0.5">
                                        {label}
                                    </p>
                                    <div className="w-full h-1 bg-stone-200 rounded-full overflow-hidden mt-2">
                                        <div
                                            className="h-full bg-emerald-500 transition-all duration-500"
                                            style={{ width: `${job.progress_pct}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Collapsed pill */}
            <button
                type="button"
                onClick={() => setExpanded(e => !e)}
                className={clsx(
                    "group flex items-center gap-2 pl-3 pr-4 py-2 rounded-full shadow-lg transition-all text-xs font-bold",
                    activeCount > 0
                        ? "bg-stone-900 text-white hover:bg-stone-800"
                        : "bg-emerald-600 text-white hover:bg-emerald-700",
                )}
                aria-label="Toggle background jobs panel"
            >
                {activeCount > 0
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <CheckCircle2 className="w-3.5 h-3.5" />}
                <span>
                    {activeCount > 0
                        ? `${activeCount} running`
                        : `${doneCount} just finished`}
                </span>
            </button>
        </div>
    );
}
