"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, CheckCircle2, Circle, AlertCircle, Minus } from "lucide-react";
import clsx from "clsx";

export interface JobStep {
    key: string;
    label: string;
    status: "pending" | "running" | "done" | "skipped" | "error";
    duration_ms?: number | null;
    detail?: string | null;
    started_at?: string | null;
}

export interface Job {
    id: string;
    kind: string;
    title: string | null;
    status: "pending" | "running" | "completed" | "failed" | "canceled";
    progress_pct: number;
    completed_steps: number;
    total_steps: number;
    current_step: string | null;
    steps: JobStep[];
    result: unknown;
    error: string | null;
    started_at: string | null;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
}

const POLL_MS = 1500;

function fmtDuration(ms?: number | null): string | null {
    if (!ms || ms < 10) return null;
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}

function StepRow({ step, active }: { step: JobStep; active: boolean }) {
    const Icon =
        step.status === "done" ? CheckCircle2 :
        step.status === "error" ? AlertCircle :
        step.status === "skipped" ? Minus :
        step.status === "running" ? Loader2 :
        Circle;

    const color =
        step.status === "done" ? "text-emerald-600" :
        step.status === "error" ? "text-rose-600" :
        step.status === "skipped" ? "text-stone-400" :
        step.status === "running" ? "text-emerald-500" :
        "text-stone-300";

    const animate = step.status === "running" ? "animate-spin" : "";
    const dur = fmtDuration(step.duration_ms);

    return (
        <div className={clsx("flex items-start gap-3 py-2", active && "bg-emerald-50/60 -mx-3 px-3 rounded-lg")}>
            <Icon className={clsx("w-4 h-4 mt-0.5 flex-shrink-0", color, animate)} />
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <p className={clsx(
                        "text-sm",
                        step.status === "running" ? "font-bold text-stone-900" :
                        step.status === "done" ? "text-stone-700" :
                        step.status === "error" ? "text-rose-700 font-medium" :
                        step.status === "skipped" ? "text-stone-400 line-through" :
                        "text-stone-400"
                    )}>
                        {step.label}
                    </p>
                    {dur && step.status !== "running" && (
                        <span className="text-[10px] text-stone-400 font-mono">{dur}</span>
                    )}
                </div>
                {step.detail && (step.status === "running" || step.status === "error" || step.status === "done") && (
                    <p className={clsx(
                        "text-[11px] mt-0.5 leading-tight",
                        step.status === "error" ? "text-rose-600" : "text-stone-500",
                    )}>
                        {step.detail}
                    </p>
                )}
            </div>
        </div>
    );
}

/**
 * Subscribes to /api/jobs/[id] via polling. Renders a vertical stepper
 * with live status. Calls onComplete/onFail when the job terminates.
 * Safe to unmount and remount — polling picks up where it left off
 * because state lives in the DB row.
 */
export default function LiveJobProgress({
    jobId,
    onComplete,
    onFail,
    compact = false,
    className,
}: {
    jobId: string;
    onComplete?: (job: Job) => void;
    onFail?: (job: Job) => void;
    compact?: boolean;
    className?: string;
}) {
    const [job, setJob] = useState<Job | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const firedTerminalRef = useRef(false);

    useEffect(() => {
        let alive = true;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const poll = async () => {
            if (!alive) return;
            try {
                const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
                if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    throw new Error(body.error || `HTTP ${res.status}`);
                }
                const data = await res.json();
                const j = data.job as Job;
                if (!alive) return;
                setJob(j);
                setErr(null);

                if ((j.status === "completed" || j.status === "failed" || j.status === "canceled") && !firedTerminalRef.current) {
                    firedTerminalRef.current = true;
                    if (j.status === "completed") onComplete?.(j);
                    else onFail?.(j);
                }

                if (j.status === "pending" || j.status === "running") {
                    timer = setTimeout(poll, POLL_MS);
                }
            } catch (e) {
                if (!alive) return;
                setErr((e as Error).message);
                timer = setTimeout(poll, POLL_MS * 2);
            }
        };
        poll();
        return () => {
            alive = false;
            if (timer) clearTimeout(timer);
        };
    }, [jobId, onComplete, onFail]);

    if (err && !job) {
        return (
            <div className={clsx("bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 text-xs text-rose-700", className)}>
                {err}
            </div>
        );
    }
    if (!job) {
        return (
            <div className={clsx("bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-500 flex items-center gap-2", className)}>
                <Loader2 className="w-3 h-3 animate-spin" />
                Starting...
            </div>
        );
    }

    const isTerminal = job.status === "completed" || job.status === "failed" || job.status === "canceled";

    return (
        <div className={clsx("bg-white border border-stone-200 rounded-2xl p-4", className)}>
            {/* Header: title + progress bar */}
            <div className="flex items-center justify-between gap-3 mb-1">
                <div className="flex items-center gap-2 min-w-0">
                    {job.status === "running" || job.status === "pending" ? (
                        <Loader2 className="w-4 h-4 text-emerald-500 animate-spin flex-shrink-0" />
                    ) : job.status === "completed" ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    ) : (
                        <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                    )}
                    <p className="text-sm font-bold text-stone-900 truncate">{job.title || job.kind}</p>
                </div>
                <span className="text-[10px] font-mono text-stone-400 tabular-nums">
                    {job.completed_steps}/{job.total_steps}
                </span>
            </div>
            <div className="w-full h-1 bg-stone-100 rounded-full overflow-hidden mb-3">
                <div
                    className={clsx(
                        "h-full transition-all duration-500",
                        job.status === "failed" ? "bg-rose-500" : "bg-emerald-500",
                    )}
                    style={{ width: `${job.progress_pct}%` }}
                />
            </div>

            {/* Step list */}
            {!compact && (
                <div className="divide-y divide-stone-100">
                    {job.steps.map((s) => (
                        <StepRow key={s.key} step={s} active={s.key === job.current_step} />
                    ))}
                </div>
            )}

            {isTerminal && job.error && (
                <div className="mt-3 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-xs text-rose-800">
                    {job.error}
                </div>
            )}
        </div>
    );
}
