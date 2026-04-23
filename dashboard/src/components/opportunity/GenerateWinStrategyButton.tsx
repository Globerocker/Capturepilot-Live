"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import clsx from "clsx";

/**
 * On-demand AI Win Strategy trigger.
 * Calls /api/admin/enrich-opportunity/[id] which:
 *   1. Fetches description from SAM.gov if it's still a URL
 *   2. Extracts structured_requirements
 *   3. Computes strategic_scoring
 *   4. Generates ai_win_strategy via OpenAI
 * Then router.refresh() to re-render the detail page with new data.
 */
export default function GenerateWinStrategyButton({
    opportunityId,
    hasStrategy,
}: {
    opportunityId: string;
    hasStrategy: boolean;
}) {
    const router = useRouter();
    const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
    const [msg, setMsg] = useState<string | null>(null);

    async function trigger() {
        if (status === "loading") return;
        setStatus("loading");
        setMsg(null);
        try {
            const res = await fetch(`/api/admin/enrich-opportunity/${opportunityId}`, { method: "POST" });
            const data = await res.json();
            if (!res.ok || data.error) {
                setStatus("error");
                setMsg(data.error || `HTTP ${res.status}`);
                return;
            }
            const fields = (data.after?.fields_updated as string[]) || [];
            if (fields.includes("ai_win_strategy")) {
                setStatus("done");
                setMsg("Win strategy generated. Reloading…");
            } else {
                setStatus("done");
                setMsg(`Enriched: ${fields.filter(f => f !== "last_crawled_at").join(", ") || "scoring + requirements"}`);
            }
            setTimeout(() => router.refresh(), 800);
        } catch (e) {
            setStatus("error");
            setMsg((e as Error).message);
        }
    }

    return (
        <div className="flex flex-col items-end gap-1">
            <button
                type="button"
                onClick={trigger}
                disabled={status === "loading"}
                title={hasStrategy ? "Regenerate win strategy" : "Generate win strategy from current description"}
                className={clsx(
                    "inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border transition-colors",
                    status === "loading"
                        ? "bg-stone-800 text-stone-400 border-stone-700 cursor-wait"
                        : status === "done"
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-600/40"
                            : status === "error"
                                ? "bg-rose-500/20 text-rose-300 border-rose-600/40"
                                : "bg-emerald-500/10 text-emerald-300 border-emerald-600/40 hover:bg-emerald-500/20",
                )}
            >
                {status === "loading" && <Loader2 className="w-3 h-3 animate-spin" />}
                {status === "done" && <CheckCircle2 className="w-3 h-3" />}
                {status === "error" && <AlertCircle className="w-3 h-3" />}
                {status === "idle" && <Sparkles className="w-3 h-3" />}
                {status === "loading"
                    ? "Generating…"
                    : hasStrategy
                        ? "Regenerate"
                        : "Generate now"}
            </button>
            {msg && status !== "idle" && (
                <p className={clsx(
                    "text-[10px]",
                    status === "error" ? "text-rose-300" : "text-stone-400",
                )}>
                    {msg}
                </p>
            )}
        </div>
    );
}
