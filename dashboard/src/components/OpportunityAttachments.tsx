"use client";

import { useState, useEffect, useRef } from "react";
import {
    Loader2,
    FileText,
    Download,
    AlertCircle,
    Paperclip,
    ChevronDown,
    Sparkles,
    CheckCircle2,
} from "lucide-react";
import clsx from "clsx";

interface Attachment {
    name: string;
    type: string;
    postedDate: string;
    url: string;
    size: string;
}

interface Props {
    noticeId: string;
    resourceLinks?: string[];
    defaultCollapsed?: boolean;
}

type JobStatus =
    | "pending"
    | "downloading"
    | "extracting"
    | "completed"
    | "failed";

interface JobState {
    id: string;
    status: JobStatus;
    files_total: number | null;
    files_done: number | null;
    current_file: string | null;
    requirement_count: number;
    error: string | null;
}

export default function OpportunityAttachments({
    noticeId,
    resourceLinks,
    defaultCollapsed = false,
}: Props) {
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [fetched, setFetched] = useState(false);
    const [collapsed, setCollapsed] = useState(defaultCollapsed);

    // Analyze-all state
    const [job, setJob] = useState<JobState | null>(null);
    const [starting, setStarting] = useState(false);
    const [analyzeError, setAnalyzeError] = useState("");
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (!noticeId || fetched) return;

        const fetchAttachments = async () => {
            setLoading(true);
            try {
                const res = await fetch(
                    `/api/sam/attachments?noticeId=${encodeURIComponent(noticeId)}`
                );
                const data = await res.json();

                if (!res.ok) {
                    setError(data.error || "Failed to load attachments");
                    setLoading(false);
                    setFetched(true);
                    return;
                }

                setAttachments(data.attachments || []);
            } catch {
                setError("Failed to connect to SAM.gov");
            }
            setLoading(false);
            setFetched(true);
        };

        fetchAttachments();
    }, [noticeId, fetched]);

    // Combine fetched SAM.gov attachments with any resource_links from DB
    const allLinks = [
        ...attachments,
        ...(resourceLinks || [])
            .filter((link) => !attachments.some((a) => a.url === link))
            .map((link) => {
                let fileName = "Attachment";
                try {
                    const urlObj = new URL(link);
                    const lastPart = urlObj.pathname.split("/").pop();
                    if (lastPart && lastPart.length > 0) {
                        fileName = decodeURIComponent(lastPart);
                    }
                } catch {
                    /* ignore */
                }
                return { name: fileName, type: "", postedDate: "", url: link, size: "" };
            }),
    ];

    const fileIcon = (name: string) => {
        const ext = name.split(".").pop()?.toLowerCase();
        if (ext === "pdf") return "text-red-500";
        if (ext === "doc" || ext === "docx") return "text-blue-500";
        if (ext === "xls" || ext === "xlsx") return "text-green-500";
        return "text-stone-400";
    };

    // Poll job status
    useEffect(() => {
        if (!job || job.status === "completed" || job.status === "failed") {
            if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
            }
            return;
        }

        const poll = async () => {
            try {
                const res = await fetch(`/api/attachments/analyze-all/status/${job.id}`);
                if (!res.ok) return;
                const data = await res.json();
                setJob({
                    id: data.id,
                    status: data.status,
                    files_total: data.files_total,
                    files_done: data.files_done,
                    current_file: data.current_file,
                    requirement_count: data.requirement_count || 0,
                    error: data.error,
                });

                if (data.status === "completed") {
                    // Notify the page to re-read the opportunity row
                    window.dispatchEvent(
                        new CustomEvent("attachments-analyzed", { detail: { noticeId } })
                    );
                }
            } catch {
                /* keep polling */
            }
        };

        poll();
        pollRef.current = setInterval(poll, 2500);
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, [job, noticeId]);

    const analyzableAttachments = allLinks.filter((a) => {
        if (!a.url) return false;
        const ext = a.name.split(".").pop()?.toLowerCase() || "";
        return ["pdf", "doc", "docx", "txt", "htm", "html", "md"].includes(ext) || !ext;
    });

    const handleAnalyzeAll = async () => {
        if (analyzableAttachments.length === 0) return;
        setStarting(true);
        setAnalyzeError("");
        try {
            const res = await fetch("/api/attachments/analyze-all", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    noticeId,
                    attachments: analyzableAttachments.map((a) => ({
                        name: a.name,
                        url: a.url,
                        type: a.type,
                    })),
                }),
            });
            const data = await res.json();
            if (!res.ok || !data.jobId) {
                setAnalyzeError(data.error || "Failed to start analysis");
                setStarting(false);
                return;
            }
            setJob({
                id: data.jobId,
                status: "pending",
                files_total: analyzableAttachments.length,
                files_done: 0,
                current_file: null,
                requirement_count: 0,
                error: null,
            });
        } catch {
            setAnalyzeError("Network error — try again");
        } finally {
            setStarting(false);
        }
    };

    const jobIsRunning = job && job.status !== "completed" && job.status !== "failed";
    const jobLabel = (() => {
        if (!job) return "";
        if (job.status === "pending") return "Queued…";
        if (job.status === "downloading")
            return `Downloading ${job.files_done ?? 0}/${job.files_total ?? 0}${
                job.current_file ? ` — ${job.current_file}` : ""
            }`;
        if (job.status === "extracting") return "Extracting requirements with AI…";
        if (job.status === "completed")
            return `Extracted ${job.requirement_count} requirements`;
        if (job.status === "failed") return job.error || "Analysis failed";
        return "";
    })();

    return (
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
            <button
                type="button"
                onClick={() => setCollapsed(!collapsed)}
                className="w-full bg-stone-50 border-b border-stone-100 px-4 sm:px-8 py-4 sm:py-5 flex items-center justify-between hover:bg-stone-100 transition-colors"
            >
                <h2 className="text-base sm:text-lg font-bold flex items-center text-stone-800">
                    <Paperclip className="w-5 h-5 mr-2 sm:mr-3 text-stone-400" /> Attachments &
                    Documents
                    {!loading && allLinks.length > 0 && (
                        <span className="ml-2 text-xs font-normal text-stone-400">
                            ({allLinks.length})
                        </span>
                    )}
                </h2>
                <ChevronDown
                    className={clsx(
                        "w-5 h-5 text-stone-400 transition-transform duration-200",
                        !collapsed && "rotate-180"
                    )}
                />
            </button>

            {!collapsed && (
                <div className="p-4 sm:p-8">
                    {loading && (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-5 h-5 animate-spin text-stone-400 mr-3" />
                            <span className="text-sm text-stone-500">
                                Loading attachments from SAM.gov...
                            </span>
                        </div>
                    )}

                    {error && !loading && allLinks.length === 0 && (
                        <div className="flex items-center text-amber-700 bg-amber-50 rounded-xl border border-amber-200 p-4">
                            <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
                            <span className="text-sm">{error}</span>
                        </div>
                    )}

                    {!loading && allLinks.length === 0 && !error && (
                        <div className="bg-stone-50 border border-stone-200 p-5 rounded-2xl text-center py-8">
                            <FileText className="w-8 h-8 text-stone-300 mx-auto mb-3" />
                            <p className="text-sm font-medium text-stone-500">
                                No attachments found on SAM.gov
                            </p>
                            <p className="text-xs text-stone-400 mt-1">
                                Attachments may be added later by the contracting office.
                            </p>
                        </div>
                    )}

                    {!loading && allLinks.length > 0 && (
                        <>
                            {/* Analyze-all bar */}
                            <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={handleAnalyzeAll}
                                        disabled={
                                            starting ||
                                            !!jobIsRunning ||
                                            analyzableAttachments.length === 0
                                        }
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                                    >
                                        {starting || jobIsRunning ? (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : job?.status === "completed" ? (
                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                        ) : (
                                            <Sparkles className="w-3.5 h-3.5" />
                                        )}
                                        {jobIsRunning
                                            ? "Analyzing…"
                                            : job?.status === "completed"
                                              ? "Re-analyze"
                                              : "Analyze all attachments"}
                                    </button>
                                    {job?.status === "completed" && (
                                        <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[11px] font-bold px-2.5 py-1 rounded-full border border-emerald-200">
                                            <CheckCircle2 className="w-3 h-3" />
                                            Extracted {job.requirement_count} requirement
                                            {job.requirement_count === 1 ? "" : "s"}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Progress indicator */}
                            {(jobIsRunning || job?.status === "failed") && (
                                <div
                                    className={clsx(
                                        "mb-4 rounded-xl border p-3 text-xs",
                                        job?.status === "failed"
                                            ? "border-red-200 bg-red-50 text-red-700"
                                            : "border-emerald-200 bg-emerald-50 text-emerald-800"
                                    )}
                                >
                                    <div className="flex items-center gap-2 font-medium">
                                        {job?.status === "failed" ? (
                                            <AlertCircle className="w-3.5 h-3.5" />
                                        ) : (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        )}
                                        <span>{jobLabel}</span>
                                    </div>
                                    {job?.files_total && job.status !== "failed" && (
                                        <div className="mt-2 w-full bg-emerald-100 rounded-full h-1.5 overflow-hidden">
                                            <div
                                                className="h-full bg-emerald-600 transition-all duration-300"
                                                style={{
                                                    width: `${
                                                        Math.min(
                                                            100,
                                                            ((job.files_done ?? 0) / job.files_total) *
                                                                100
                                                        )
                                                    }%`,
                                                }}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}

                            {analyzeError && (
                                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                                    {analyzeError}
                                </div>
                            )}

                            <div className="bg-stone-50 border border-stone-200 rounded-2xl divide-y divide-stone-200">
                                {allLinks.map((att, idx) => (
                                    <a
                                        key={idx}
                                        href={att.url || "#"}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center justify-between p-4 hover:bg-stone-100 transition-colors first:rounded-t-2xl last:rounded-b-2xl"
                                    >
                                        <div className="flex items-center min-w-0 flex-1">
                                            <FileText
                                                className={`w-5 h-5 mr-3 flex-shrink-0 ${fileIcon(att.name)}`}
                                            />
                                            <div className="min-w-0">
                                                <p className="font-medium text-sm text-stone-800 truncate">
                                                    {att.name}
                                                </p>
                                                <div className="flex items-center gap-3 mt-0.5">
                                                    {att.size && (
                                                        <span className="text-xs text-stone-400">
                                                            {att.size}
                                                        </span>
                                                    )}
                                                    {att.type && (
                                                        <span className="text-xs text-stone-400">
                                                            {att.type}
                                                        </span>
                                                    )}
                                                    {att.postedDate && (
                                                        <span className="text-xs text-stone-400">
                                                            {new Date(att.postedDate).toLocaleDateString()}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <Download className="w-4 h-4 text-blue-500 flex-shrink-0 ml-3" />
                                    </a>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
