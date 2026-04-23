"use client";

import { useState } from "react";
import { ClipboardCheck, Download, Loader2, RefreshCw } from "lucide-react";
import clsx from "clsx";
import LiveJobProgress, { type Job } from "@/components/jobs/LiveJobProgress";

interface ComplianceRow {
    section: string;
    requirement: string;
    obligation_verb: string;
    category: string;
    owner: string;
    addressable: "yes" | "no" | "partial" | "unknown";
    mitigation: string | null;
    proposal_section_ref: string;
}

interface Matrix {
    opportunity_title: string;
    total_requirements: number;
    by_category: Record<string, number>;
    by_owner: Record<string, number>;
    compliance_score: number;
    rows: ComplianceRow[];
}

const ADDR_STYLES: Record<ComplianceRow["addressable"], { bg: string; text: string; label: string }> = {
    yes: { bg: "bg-emerald-100", text: "text-emerald-800", label: "YES" },
    partial: { bg: "bg-amber-100", text: "text-amber-800", label: "PARTIAL" },
    no: { bg: "bg-red-100", text: "text-red-800", label: "GAP" },
    unknown: { bg: "bg-stone-100", text: "text-stone-600", label: "?" },
};

export default function ComplianceMatrixPanel({ noticeId }: { noticeId: string }) {
    const [matrix, setMatrix] = useState<Matrix | null>(null);
    const [loading, setLoading] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [jobId, setJobId] = useState<string | null>(null);

    async function generate(force = false) {
        setLoading(true);
        setError(null);
        setJobId(null);
        try {
            const res = await fetch("/api/ai/compliance-matrix", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ notice_id: noticeId, force, export: "json" }),
            });
            const data = await res.json();
            if (data.matrix) {
                // Cached hit — no job needed
                setMatrix(data.matrix as Matrix);
            } else if (data.jobId) {
                setJobId(data.jobId);
            } else {
                setError(data.error || "Failed to generate matrix");
            }
        } catch {
            setError("Network error — try again.");
        } finally {
            setLoading(false);
        }
    }

    const handleJobComplete = (job: Job) => {
        const result = job.result as { matrix?: Matrix } | null;
        if (result?.matrix) setMatrix(result.matrix);
        setJobId(null);
    };

    async function downloadXlsx() {
        setDownloading(true);
        try {
            const res = await fetch("/api/ai/compliance-matrix", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ notice_id: noticeId, export: "xlsx" }),
            });
            if (!res.ok) return;
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `compliance-matrix-${noticeId}.xlsx`;
            a.click();
            URL.revokeObjectURL(url);
        } finally {
            setDownloading(false);
        }
    }

    if (!matrix) {
        return (
            <div className="bg-white rounded-2xl border border-stone-200 p-6">
                <div className="flex items-start gap-3 mb-4">
                    <ClipboardCheck className="w-6 h-6 text-emerald-600 flex-shrink-0" />
                    <div>
                        <h3 className="font-bold text-stone-900">Compliance Matrix</h3>
                        <p className="text-sm text-stone-500 mt-1 leading-relaxed">
                            Parse Section L / M / C of this solicitation into a row-per-obligation matrix.
                            Export to XLSX for your proposal team.
                        </p>
                    </div>
                </div>
                {!jobId && (
                    <button
                        type="button"
                        onClick={() => generate(false)}
                        disabled={loading}
                        className="bg-emerald-600 text-white px-4 py-2 rounded-full text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1.5"
                    >
                        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ClipboardCheck className="w-3 h-3" />}
                        {loading ? "Starting…" : "Generate Matrix"}
                    </button>
                )}
                {jobId && (
                    <LiveJobProgress
                        jobId={jobId}
                        onComplete={handleJobComplete}
                        onFail={() => setJobId(null)}
                        className="mt-2"
                    />
                )}
                {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl border border-stone-200 p-6">
            <div className="flex items-start justify-between mb-4 gap-3">
                <div>
                    <h3 className="font-bold text-stone-900 flex items-center gap-2">
                        <ClipboardCheck className="w-5 h-5 text-emerald-600" />
                        Compliance Matrix
                    </h3>
                    <p className="text-xs text-stone-500 mt-1">
                        {matrix.total_requirements} obligations ·{" "}
                        <span className="font-bold text-emerald-700">{matrix.compliance_score}% addressable</span>
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={downloadXlsx}
                        disabled={downloading}
                        className="bg-stone-900 text-white px-3 py-1.5 rounded-full text-xs font-bold hover:bg-stone-700 disabled:opacity-50 inline-flex items-center gap-1.5"
                    >
                        {downloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                        XLSX
                    </button>
                    <button
                        type="button"
                        onClick={() => generate(true)}
                        disabled={loading}
                        className="bg-stone-100 text-stone-700 px-3 py-1.5 rounded-full text-xs font-bold hover:bg-stone-200 disabled:opacity-50 inline-flex items-center gap-1.5"
                    >
                        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        Regenerate
                    </button>
                </div>
            </div>

            {/* Regeneration job progress sits above the (stale) matrix so the user
                can still read the previous version while a new one builds. */}
            {jobId && (
                <LiveJobProgress
                    jobId={jobId}
                    onComplete={handleJobComplete}
                    onFail={() => setJobId(null)}
                    className="mb-4"
                />
            )}

            {/* Category + owner chips */}
            <div className="flex flex-wrap gap-1.5 mb-4">
                {Object.entries(matrix.by_category).map(([k, v]) => (
                    <span
                        key={k}
                        className="bg-stone-100 text-stone-700 text-[10px] font-bold px-2 py-0.5 rounded-full"
                    >
                        {k} · {v}
                    </span>
                ))}
            </div>

            {/* Rows table */}
            <div className="overflow-x-auto border border-stone-200 rounded-xl">
                <table className="w-full text-xs">
                    <thead className="bg-stone-50">
                        <tr>
                            <th className="text-left px-2 py-2 font-bold text-stone-600 uppercase text-[10px]">§</th>
                            <th className="text-left px-2 py-2 font-bold text-stone-600 uppercase text-[10px]">
                                Requirement
                            </th>
                            <th className="text-left px-2 py-2 font-bold text-stone-600 uppercase text-[10px]">
                                Owner
                            </th>
                            <th className="text-left px-2 py-2 font-bold text-stone-600 uppercase text-[10px]">
                                Addressable
                            </th>
                            <th className="text-left px-2 py-2 font-bold text-stone-600 uppercase text-[10px]">Ref</th>
                        </tr>
                    </thead>
                    <tbody>
                        {matrix.rows.map((r, i) => {
                            const style = ADDR_STYLES[r.addressable] || ADDR_STYLES.unknown;
                            return (
                                <tr
                                    key={i}
                                    className={clsx(
                                        "border-t border-stone-100",
                                        i % 2 === 0 ? "bg-white" : "bg-stone-50/40",
                                    )}
                                >
                                    <td className="px-2 py-2 font-mono text-[10px] text-stone-500 whitespace-nowrap">
                                        {r.section}
                                    </td>
                                    <td className="px-2 py-2 text-stone-800 leading-snug">
                                        <span className="font-bold text-emerald-700 uppercase text-[9px] tracking-wider">
                                            {r.obligation_verb}
                                        </span>{" "}
                                        {r.requirement}
                                        {r.mitigation && (
                                            <div className="text-[10px] text-amber-700 mt-1 italic">
                                                → {r.mitigation}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-2 py-2 text-stone-600 whitespace-nowrap">{r.owner}</td>
                                    <td className="px-2 py-2">
                                        <span
                                            className={clsx(
                                                style.bg,
                                                style.text,
                                                "text-[9px] font-bold px-1.5 py-0.5 rounded-full",
                                            )}
                                        >
                                            {style.label}
                                        </span>
                                    </td>
                                    <td className="px-2 py-2 text-stone-500 font-mono text-[10px]">
                                        {r.proposal_section_ref}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
