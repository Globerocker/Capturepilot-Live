"use client";

import { useState } from "react";
import { RefreshCw, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import clsx from "clsx";

interface Props {
    opportunityId: string;
    /** When true, the button labels itself "Re-run enrichment". Otherwise "Enrich now". */
    hasExistingData?: boolean;
}

/**
 * Triggers a re-enrichment background job for a single opportunity from the
 * detail page. End-user equivalent of the admin "enrich-opportunity" endpoint —
 * lets the customer pull fresh description text, re-extract requirements, and
 * regenerate the AI win strategy on demand instead of waiting for cron.
 */
export default function ReenrichButton({ opportunityId, hasExistingData = false }: Props) {
    const [state, setState] = useState<"idle" | "starting" | "running" | "done" | "error">("idle");
    const [error, setError] = useState<string | null>(null);
    const [jobId, setJobId] = useState<string | null>(null);

    async function start() {
        setState("starting");
        setError(null);
        try {
            const res = await fetch(`/api/opportunities/${opportunityId}/enrich`, { method: "POST" });
            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                throw new Error(j.error || `HTTP ${res.status}`);
            }
            const data = await res.json() as { jobId: string };
            setJobId(data.jobId);
            setState("running");
            pollJob(data.jobId);
        } catch (e) {
            setError((e as Error).message);
            setState("error");
        }
    }

    async function pollJob(id: string) {
        // Short-poll the job until it completes (or fails). The global job
        // indicator (GlobalJobsIndicator) is the authoritative live UI;
        // this is just for the inline button state.
        for (let i = 0; i < 60; i++) {
            await new Promise(r => setTimeout(r, 3000));
            try {
                const r = await fetch(`/api/jobs/${id}`);
                if (!r.ok) continue;
                const j = await r.json() as { status: string; error?: string | null };
                if (j.status === "completed") {
                    setState("done");
                    // Reload so server-rendered page picks up the new fields
                    setTimeout(() => window.location.reload(), 800);
                    return;
                }
                if (j.status === "failed" || j.status === "canceled") {
                    setError(j.error || "Job failed");
                    setState("error");
                    return;
                }
            } catch { /* keep polling */ }
        }
        setError("Job timed out (3 min). Check the global jobs panel.");
        setState("error");
    }

    const label = state === "done" ? "Refreshed ✓"
        : state === "running" || state === "starting" ? "Enriching…"
        : state === "error" ? "Retry"
        : hasExistingData ? "Re-run enrichment" : "Enrich now";

    return (
        <div className="space-y-2">
            <button
                type="button"
                onClick={start}
                disabled={state === "starting" || state === "running"}
                className={clsx(
                    "inline-flex items-center gap-2 px-3 py-2 rounded-full text-xs font-bold border transition-all shadow-sm",
                    state === "done"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : state === "error"
                            ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                            : "bg-stone-900 text-white border-stone-900 hover:bg-stone-800 disabled:opacity-60",
                )}
                title="Fetches the full description from SAM.gov, re-extracts requirements, re-scores, regenerates AI strategy."
            >
                {state === "starting" || state === "running" ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : state === "done" ? <CheckCircle2 className="w-3.5 h-3.5" />
                    : state === "error" ? <AlertCircle className="w-3.5 h-3.5" />
                    : <RefreshCw className="w-3.5 h-3.5" />}
                {label}
            </button>
            {error && (
                <p className="text-xs text-red-600">{error}</p>
            )}
            {jobId && state === "running" && (
                <p className="text-[10px] text-stone-400">Running in background. You can leave this page.</p>
            )}
        </div>
    );
}
