"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Loader2, CheckCircle2, AlertCircle, FileText, Clock, X, ChevronDown, ChevronRight } from "lucide-react";
import clsx from "clsx";

export interface ProposalJobStatus {
    id: string;
    notice_id: string;
    status: "pending" | "writing" | "completed" | "failed";
    sections_requested: string[];
    // content is populated server-side as each section finishes so we can
    // render a live preview before the whole proposal completes.
    sections_completed: Array<{ title: string; content?: string; word_count: number; completed_at: string }>;
    sections_errored: Array<{ section: string; error: string }>;
    current_section: string | null;
    total_sections: number | null;
    completed_sections: number;
    error: string | null;
    created_at: string;
    updated_at: string;
    completed_at: string | null;
    result?: {
        proposal_title: string;
        agency: string;
        sections: Array<{ title: string; content: string; word_count: number }>;
        compliance_matrix: Array<{ requirement: string; addressed_in: string; status: string }>;
        total_word_count: number;
        estimated_pages: number;
    };
}

interface Props {
    jobId: string;
    onComplete?: (status: ProposalJobStatus) => void;
    onFail?: (status: ProposalJobStatus) => void;
    onDismiss?: () => void;
    pollIntervalMs?: number;
}

/**
 * Live progress card for a background proposal generation job.
 * Polls /api/ai/write-proposal/status/:jobId until the job completes or fails.
 * Calls onComplete / onFail exactly once per job.
 */
export default function ProposalJobProgress({
    jobId,
    onComplete,
    onFail,
    onDismiss,
    pollIntervalMs = 2500,
}: Props) {
    const [status, setStatus] = useState<ProposalJobStatus | null>(null);
    const [pollError, setPollError] = useState<string | null>(null);
    const notifiedRef = useRef(false);
    // Tracks which completed sections the user has expanded. Live-preview
    // content is rendered inline when the section row is clicked.
    const [expandedSection, setExpandedSection] = useState<string | null>(null);

    const poll = useCallback(async () => {
        try {
            const res = await fetch(`/api/ai/write-proposal/status/${jobId}`, { cache: "no-store" });
            if (!res.ok) {
                if (res.status === 404) {
                    setPollError("Job not found.");
                    return "stop" as const;
                }
                setPollError(`Status ${res.status}`);
                return "continue" as const;
            }
            const data = (await res.json()) as ProposalJobStatus;
            setStatus(data);
            setPollError(null);
            if (data.status === "completed" || data.status === "failed") {
                return "stop" as const;
            }
            return "continue" as const;
        } catch (e) {
            setPollError((e as Error).message);
            return "continue" as const;
        }
    }, [jobId]);

    useEffect(() => {
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const tick = async () => {
            if (cancelled) return;
            const result = await poll();
            if (cancelled) return;
            if (result === "continue") {
                timer = setTimeout(tick, pollIntervalMs);
            }
        };
        tick();

        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [poll, pollIntervalMs]);

    // Fire the completion callback exactly once
    useEffect(() => {
        if (!status || notifiedRef.current) return;
        if (status.status === "completed") {
            notifiedRef.current = true;
            onComplete?.(status);
        } else if (status.status === "failed") {
            notifiedRef.current = true;
            onFail?.(status);
        }
    }, [status, onComplete, onFail]);

    if (!status) {
        return (
            <div className="bg-white border border-stone-200 rounded-2xl p-5 flex items-center gap-3 shadow-sm">
                <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
                <div className="text-sm text-stone-500">Loading job status{pollError ? ` — ${pollError}` : "..."}</div>
            </div>
        );
    }

    const total = status.total_sections || status.sections_requested.length || 1;
    const done = status.completed_sections || 0;
    const pct = Math.min(100, Math.round((done / total) * 100));
    const isActive = status.status === "pending" || status.status === "writing";
    const isCompleted = status.status === "completed";
    const isFailed = status.status === "failed";

    return (
        <div
            className={clsx(
                "bg-white border rounded-2xl p-5 shadow-sm",
                isCompleted && "border-emerald-300",
                isFailed && "border-red-300",
                isActive && "border-stone-200",
            )}
        >
            <div className="flex items-start gap-3 mb-4">
                <div
                    className={clsx(
                        "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
                        isCompleted && "bg-emerald-50 border border-emerald-200",
                        isFailed && "bg-red-50 border border-red-200",
                        isActive && "bg-stone-50 border border-stone-200",
                    )}
                >
                    {isCompleted ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    ) : isFailed ? (
                        <AlertCircle className="w-5 h-5 text-red-600" />
                    ) : (
                        <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-stone-400" />
                        <h3 className="font-bold text-sm text-black">
                            {isCompleted
                                ? "Proposal ready"
                                : isFailed
                                  ? "Proposal generation failed"
                                  : "Writing your proposal"}
                        </h3>
                    </div>
                    <p className="text-xs text-stone-500 mt-0.5">
                        {isActive && status.current_section
                            ? `Currently writing: ${status.current_section}`
                            : isActive
                              ? "Preparing to write..."
                              : isCompleted
                                ? `${status.result?.total_word_count?.toLocaleString() || 0} words, ~${status.result?.estimated_pages || 0} pages`
                                : status.error || "An unknown error occurred"}
                    </p>
                </div>
                {onDismiss && (isCompleted || isFailed) && (
                    <button
                        type="button"
                        onClick={onDismiss}
                        className="text-stone-400 hover:text-stone-600 p-1"
                        aria-label="Dismiss"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Progress bar */}
            <div className="mb-4">
                <div className="flex items-center justify-between text-[11px] text-stone-500 mb-1.5">
                    <span className="font-mono">{done} / {total} sections</span>
                    <span className="font-mono font-bold">{pct}%</span>
                </div>
                <div className="w-full h-2 bg-stone-100 rounded-full overflow-hidden">
                    <div
                        className={clsx(
                            "h-full transition-all duration-500 ease-out",
                            isCompleted ? "bg-emerald-500" : isFailed ? "bg-red-500" : "bg-emerald-500",
                        )}
                        style={{ width: `${pct}%` }}
                    />
                </div>
            </div>

            {/* Section list */}
            {status.sections_requested.length > 0 && (
                <div className="space-y-1.5">
                    {status.sections_requested.map((sectionTitle) => {
                        const completed = status.sections_completed.find(c => c.title === sectionTitle);
                        const errored = status.sections_errored.find(e => e.section === sectionTitle);
                        const isCurrent = isActive && status.current_section === sectionTitle;

                        const hasContent = !!completed?.content;
                        const isExpanded = expandedSection === sectionTitle;
                        return (
                            <div key={sectionTitle}>
                                <div
                                    onClick={() => {
                                        if (hasContent) setExpandedSection(isExpanded ? null : sectionTitle);
                                    }}
                                    className={clsx(
                                        "flex items-center gap-2 px-3 py-2 rounded-lg border text-xs",
                                        completed && "bg-emerald-50/60 border-emerald-200",
                                        errored && "bg-red-50 border-red-200",
                                        isCurrent && !completed && !errored && "bg-emerald-50/40 border-emerald-200",
                                        !completed && !errored && !isCurrent && "bg-stone-50 border-stone-200",
                                        hasContent && "cursor-pointer hover:bg-emerald-100/60",
                                        isExpanded && "rounded-b-none",
                                    )}
                                >
                                    {completed ? (
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                                    ) : errored ? (
                                        <AlertCircle className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />
                                    ) : isCurrent ? (
                                        <Loader2 className="w-3.5 h-3.5 text-emerald-500 animate-spin flex-shrink-0" />
                                    ) : (
                                        <Clock className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
                                    )}
                                    <span
                                        className={clsx(
                                            "flex-1 font-medium",
                                            completed && "text-emerald-900",
                                            errored && "text-red-800",
                                            !completed && !errored && !isCurrent && "text-stone-500",
                                            isCurrent && !completed && !errored && "text-emerald-800",
                                        )}
                                    >
                                        {sectionTitle}
                                    </span>
                                    {completed && (
                                        <span className="text-[10px] text-emerald-600 font-mono">
                                            {completed.word_count.toLocaleString()} words
                                        </span>
                                    )}
                                    {errored && (
                                        <span className="text-[10px] text-red-600 font-mono truncate max-w-[160px]">
                                            {errored.error}
                                        </span>
                                    )}
                                    {hasContent && (
                                        isExpanded
                                            ? <ChevronDown className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                                            : <ChevronRight className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                                    )}
                                </div>
                                {hasContent && isExpanded && (
                                    <div className="border border-t-0 border-emerald-200 bg-white rounded-b-lg px-4 py-3 -mt-px">
                                        <pre className="whitespace-pre-wrap font-sans text-xs text-stone-700 leading-relaxed max-h-[400px] overflow-y-auto">
                                            {completed!.content}
                                        </pre>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {pollError && isActive && (
                <p className="mt-3 text-[10px] text-stone-400">Polling: {pollError}</p>
            )}
        </div>
    );
}
