"use client";

import { useState, useEffect, useCallback } from "react";
import { Sparkles, Loader2, CheckCircle, AlertCircle } from "lucide-react";

interface EnrichButtonProps {
    opportunityId: string;
    currentStatus?: string | null;
}

export default function EnrichButton({ opportunityId, currentStatus }: EnrichButtonProps) {
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<string | null>(currentStatus || null);
    const [enrichedCount, setEnrichedCount] = useState(0);
    const [totalCount, setTotalCount] = useState(0);

    const pollStatus = useCallback(async () => {
        try {
            const res = await fetch(`/api/enrich/status/${opportunityId}`);
            if (res.ok) {
                const data = await res.json();
                setEnrichedCount(data.enriched_contractors || 0);
                setTotalCount(data.total_contractors || 0);
                if (data.job) {
                    setStatus(data.job.status);
                    if (data.job.status === "running") {
                        setLoading(true);
                    } else if (data.job.status === "completed" || data.job.status === "failed" || data.job.status === "partial") {
                        setLoading(false);
                    }
                }
            }
        } catch {
            // Silent fail on polling
        }
    }, [opportunityId]);

    useEffect(() => {
        // Poll on mount to get current state
        pollStatus();
    }, [pollStatus]);

    useEffect(() => {
        if (!loading) return;
        const interval = setInterval(pollStatus, 5000);
        return () => clearInterval(interval);
    }, [loading, pollStatus]);

    const handleEnrich = async () => {
        setLoading(true);
        setStatus("running");
        try {
            const res = await fetch(`/api/enrich/${opportunityId}`, { method: "POST" });
            const data = await res.json();
            if (data.success) {
                setStatus("completed");
                pollStatus();
            } else {
                setStatus("failed");
            }
        } catch {
            setStatus("failed");
        } finally {
            setLoading(false);
        }
    };

    const isCompleted = status === "completed" && enrichedCount > 0;
    const isRunning = loading || status === "running";
    const isFailed = status === "failed";

    return (
        <div className="flex items-center gap-3">
            <button
                onClick={handleEnrich}
                disabled={isRunning}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-typewriter text-sm font-bold transition-colors ${
                    isRunning
                        ? "bg-stone-300 text-stone-500 cursor-wait"
                        : isCompleted
                        ? "bg-emerald-600 text-white hover:bg-emerald-700"
                        : "bg-black text-white hover:bg-stone-800"
                }`}
            >
                {isRunning ? (
                    <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Enriching...
                    </>
                ) : isCompleted ? (
                    <>
                        <CheckCircle className="w-4 h-4" />
                        Re-Enrich
                    </>
                ) : (
                    <>
                        <Sparkles className="w-4 h-4" />
                        Enrich Now
                    </>
                )}
            </button>

            {isRunning && totalCount > 0 && (
                <span className="text-sm text-stone-500 font-typewriter">
                    {enrichedCount}/{totalCount} contractors...
                </span>
            )}

            {isCompleted && (
                <span className="text-sm text-emerald-600 font-typewriter">
                    {enrichedCount} contactable contractors
                </span>
            )}

            {isFailed && (
                <span className="flex items-center gap-1 text-sm text-red-500 font-typewriter">
                    <AlertCircle className="w-3 h-3" /> Enrichment failed
                </span>
            )}
        </div>
    );
}
