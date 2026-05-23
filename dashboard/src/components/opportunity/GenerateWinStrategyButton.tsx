"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2 } from "lucide-react";
import clsx from "clsx";
import LiveJobProgress, { type Job } from "@/components/jobs/LiveJobProgress";

/**
 * Generates an AI win strategy for one opportunity as a background job.
 * Shows a live step-by-step progress stepper that persists across navigation
 * (state is in the DB row `background_jobs`). On completion → router.refresh()
 * to re-render the page with the new data.
 */
export default function GenerateWinStrategyButton({
    opportunityId,
    hasStrategy,
}: {
    opportunityId: string;
    hasStrategy: boolean;
}) {
    const router = useRouter();
    const [jobId, setJobId] = useState<string | null>(null);
    const [kickoffErr, setKickoffErr] = useState<string | null>(null);
    const [starting, setStarting] = useState(false);

    async function trigger() {
        if (starting || jobId) return;
        setStarting(true);
        setKickoffErr(null);
        try {
            // Use the user-facing endpoint; the admin variant is gated by assertAdmin
            // and 401's regular users. Both run the same pipeline.
            const res = await fetch(`/api/opportunities/${opportunityId}/enrich`, { method: "POST" });
            const data = await res.json();
            if (!res.ok || !data.jobId) {
                throw new Error(data.error || `HTTP ${res.status}`);
            }
            setJobId(data.jobId);
        } catch (e) {
            setKickoffErr((e as Error).message);
        } finally {
            setStarting(false);
        }
    }

    const handleComplete = (_job: Job) => {
        setTimeout(() => router.refresh(), 600);
    };

    return (
        <div className="flex flex-col items-end gap-2 w-full max-w-xs">
            {!jobId && (
                <button
                    type="button"
                    onClick={trigger}
                    disabled={starting}
                    title={hasStrategy ? "Regenerate win strategy" : "Generate win strategy from this opportunity's description + your profile"}
                    className={clsx(
                        "inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border transition-colors flex-shrink-0",
                        starting
                            ? "bg-stone-800 text-stone-400 border-stone-700 cursor-wait"
                            : "bg-emerald-500/10 text-emerald-300 border-emerald-600/40 hover:bg-emerald-500/20",
                    )}
                >
                    {starting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    {starting ? "Starting…" : hasStrategy ? "Regenerate" : "Generate now"}
                </button>
            )}
            {kickoffErr && !jobId && (
                <p className="text-[10px] text-rose-300 text-right max-w-[200px]">{kickoffErr}</p>
            )}
            {jobId && (
                <LiveJobProgress
                    jobId={jobId}
                    onComplete={handleComplete}
                    className="w-full"
                />
            )}
        </div>
    );
}
