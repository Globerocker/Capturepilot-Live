"use client";

import { useState } from "react";
import { Target, CheckCircle2, Loader2, ArrowRight } from "lucide-react";
import clsx from "clsx";

interface InferredNaicsItem {
    code: string;
    label: string;
    confidence: number;
    matched_keywords?: string[];
}

interface Props {
    analysisId: string;
    inferredNaics: InferredNaicsItem[];
    onSubmitted: () => void;
}

/**
 * NAICS selection step — shown when analysis is in "awaiting_confirmation".
 * Lets the user pick 1-2 codes from the detected list, then calls the
 * select-naics endpoint to resume scoring.
 */
export default function NaicsSelectionGate({ analysisId, inferredNaics, onSubmitted }: Props) {
    const [selected, setSelected] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    // Top 8 inferred codes sorted by confidence desc
    const topCodes = [...inferredNaics]
        .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
        .slice(0, 8);

    const toggle = (code: string) => {
        setError("");
        setSelected((prev) => {
            if (prev.includes(code)) return prev.filter((c) => c !== code);
            if (prev.length >= 2) return [prev[1], code]; // rotate — keep most recent 2
            return [...prev, code];
        });
    };

    const handleSubmit = async () => {
        if (selected.length === 0) {
            setError("Pick at least one NAICS code.");
            return;
        }
        setSubmitting(true);
        setError("");
        try {
            const res = await fetch("/api/analyze-company/select-naics", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    analysis_id: analysisId,
                    naics_codes: selected,
                }),
            });
            if (!res.ok) {
                const payload = await res.json().catch(() => ({}));
                setError(payload.error || "Failed to save selection");
                setSubmitting(false);
                return;
            }
            onSubmitted();
        } catch {
            setError("Network error — try again.");
            setSubmitting(false);
        }
    };

    return (
        <div className="bg-white rounded-[28px] border border-stone-200 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-br from-emerald-50 to-blue-50 border-b border-stone-100 px-5 sm:px-8 py-6">
                <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-black text-white flex items-center justify-center flex-shrink-0">
                        <Target className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="font-bold text-xl sm:text-2xl text-black">
                            Select Your Primary Industry Codes
                        </h2>
                        <p className="text-sm text-stone-600 mt-1 leading-relaxed">
                            We detected these NAICS codes. Pick the 1-2 that best describe your
                            business for the most accurate matches.
                        </p>
                    </div>
                </div>
            </div>

            <div className="p-5 sm:p-8 space-y-4">
                {topCodes.length === 0 ? (
                    <div className="text-sm text-stone-500 text-center py-6">
                        No NAICS codes were detected. Try running the check again.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {topCodes.map((n) => {
                            const isSelected = selected.includes(n.code);
                            const confidencePct = Math.round((n.confidence || 0) * 100);
                            return (
                                <button
                                    key={n.code}
                                    type="button"
                                    onClick={() => toggle(n.code)}
                                    className={clsx(
                                        "text-left rounded-2xl border-2 p-4 transition-all relative",
                                        isSelected
                                            ? "border-emerald-500 bg-emerald-50 shadow-md"
                                            : "border-stone-200 bg-white hover:border-stone-300 hover:shadow-sm",
                                    )}
                                >
                                    {isSelected && (
                                        <div className="absolute top-3 right-3 text-emerald-600">
                                            <CheckCircle2 className="w-5 h-5" />
                                        </div>
                                    )}
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="font-mono text-sm font-black bg-stone-900 text-white px-2 py-0.5 rounded">
                                            {n.code}
                                        </span>
                                        <span
                                            className={clsx(
                                                "text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider",
                                                confidencePct >= 70
                                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                    : confidencePct >= 40
                                                      ? "bg-amber-50 text-amber-700 border-amber-200"
                                                      : "bg-stone-50 text-stone-500 border-stone-200",
                                            )}
                                        >
                                            {confidencePct}% match
                                        </span>
                                    </div>
                                    <p className="font-bold text-sm text-black leading-snug mb-1">
                                        {n.label}
                                    </p>
                                    {n.matched_keywords && n.matched_keywords.length > 0 && (
                                        <p className="text-[11px] text-stone-500 leading-relaxed">
                                            Signals: {n.matched_keywords.slice(0, 4).join(", ")}
                                        </p>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}

                {error && (
                    <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                        {error}
                    </div>
                )}

                <div className="flex items-center justify-between pt-2">
                    <p className="text-xs text-stone-500">
                        {selected.length === 0
                            ? "Pick 1 or 2 codes to continue"
                            : `${selected.length} selected (max 2)`}
                    </p>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={submitting || selected.length === 0}
                        className={clsx(
                            "inline-flex items-center gap-2 rounded-xl font-bold text-sm px-5 py-3 transition-all",
                            submitting || selected.length === 0
                                ? "bg-stone-200 text-stone-400 cursor-not-allowed"
                                : "bg-black text-white hover:bg-stone-800 shadow-sm",
                        )}
                    >
                        {submitting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Scoring...
                            </>
                        ) : (
                            <>
                                Find Matching Opportunities
                                <ArrowRight className="w-4 h-4" />
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
