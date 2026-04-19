"use client";

import { useState } from "react";
import { Target, Loader2, RefreshCw, Trophy, AlertTriangle } from "lucide-react";
import clsx from "clsx";

interface MatrixRow {
    factor: string;
    factor_weight: string;
    opp_requirement: string;
    user_strength: string;
    assessment: "strong" | "moderate" | "weak" | "gap";
    gap_description: string | null;
    mitigation: string | null;
    citation_ideas: string[];
}

interface CapabilityMatrix {
    opportunity_title: string;
    overall_fit: "strong" | "moderate" | "weak" | "poor";
    total_factors: number;
    strong_count: number;
    moderate_count: number;
    weak_count: number;
    gap_count: number;
    top_risks: string[];
    top_strengths: string[];
    recommended_win_themes: string[];
    rows: MatrixRow[];
}

const FIT_STYLES: Record<CapabilityMatrix["overall_fit"], { bg: string; text: string; label: string; ring: string }> = {
    strong: { bg: "bg-emerald-100", text: "text-emerald-800", label: "STRONG FIT — BID", ring: "border-emerald-400" },
    moderate: { bg: "bg-amber-100", text: "text-amber-800", label: "MODERATE FIT", ring: "border-amber-400" },
    weak: { bg: "bg-orange-100", text: "text-orange-800", label: "WEAK FIT — TEAM UP", ring: "border-orange-400" },
    poor: { bg: "bg-red-100", text: "text-red-800", label: "POOR FIT — NO-BID", ring: "border-red-400" },
};

const ASSESS_STYLES: Record<MatrixRow["assessment"], { bg: string; text: string; label: string }> = {
    strong: { bg: "bg-emerald-100", text: "text-emerald-800", label: "Strong" },
    moderate: { bg: "bg-amber-100", text: "text-amber-800", label: "Moderate" },
    weak: { bg: "bg-orange-100", text: "text-orange-800", label: "Weak" },
    gap: { bg: "bg-red-100", text: "text-red-800", label: "Gap" },
};

export default function CapabilityMatrixPanel({ noticeId }: { noticeId: string }) {
    const [matrix, setMatrix] = useState<CapabilityMatrix | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function generate(force = false) {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/ai/capability-matrix", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ notice_id: noticeId, force }),
            });
            const data = await res.json();
            if (data.matrix) setMatrix(data.matrix as CapabilityMatrix);
            else setError(data.error || "Failed to generate matrix");
        } catch {
            setError("Network error — try again.");
        } finally {
            setLoading(false);
        }
    }

    if (!matrix) {
        return (
            <div className="bg-white rounded-2xl border border-stone-200 p-6">
                <div className="flex items-start gap-3 mb-4">
                    <Target className="w-6 h-6 text-emerald-600 flex-shrink-0" />
                    <div>
                        <h3 className="font-bold text-stone-900">Capability Matrix</h3>
                        <p className="text-sm text-stone-500 mt-1 leading-relaxed">
                            How well does your company fit this opportunity? Compares your capability statement +
                            profile to the RFP evaluation criteria, factor by factor.
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => generate(false)}
                    disabled={loading}
                    className="bg-emerald-600 text-white px-4 py-2 rounded-full text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                    {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Target className="w-3 h-3" />}
                    Assess My Fit
                </button>
                {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
            </div>
        );
    }

    const fit = FIT_STYLES[matrix.overall_fit];

    return (
        <div className={clsx("bg-white rounded-2xl border-2 p-6", fit.ring)}>
            <div className="flex items-start justify-between mb-4 gap-3">
                <div>
                    <h3 className="font-bold text-stone-900 flex items-center gap-2">
                        <Target className="w-5 h-5 text-emerald-600" />
                        Capability Matrix
                    </h3>
                    <span
                        className={clsx(
                            fit.bg,
                            fit.text,
                            "inline-flex mt-2 text-[10px] font-bold px-2.5 py-1 rounded-full",
                        )}
                    >
                        {fit.label}
                    </span>
                </div>
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

            {/* Count bar */}
            <div className="grid grid-cols-4 gap-2 mb-4">
                <Bar label="Strong" count={matrix.strong_count} color="bg-emerald-500" />
                <Bar label="Moderate" count={matrix.moderate_count} color="bg-amber-400" />
                <Bar label="Weak" count={matrix.weak_count} color="bg-orange-400" />
                <Bar label="Gap" count={matrix.gap_count} color="bg-red-500" />
            </div>

            {/* Strengths + risks */}
            <div className="grid md:grid-cols-2 gap-3 mb-4">
                <InsightCard
                    icon={Trophy}
                    iconClass="text-emerald-600"
                    title="Top strengths"
                    items={matrix.top_strengths}
                />
                <InsightCard
                    icon={AlertTriangle}
                    iconClass="text-red-500"
                    title="Biggest risks"
                    items={matrix.top_risks}
                />
            </div>

            {/* Win themes */}
            {matrix.recommended_win_themes.length > 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4">
                    <p className="text-xs font-bold text-emerald-900 uppercase tracking-wider mb-2">Win themes</p>
                    <ul className="space-y-1">
                        {matrix.recommended_win_themes.map((t, i) => (
                            <li key={i} className="text-xs text-emerald-800 leading-relaxed">
                                → {t}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Full matrix */}
            <details className="border border-stone-200 rounded-xl">
                <summary className="px-4 py-2 text-xs font-bold text-stone-700 cursor-pointer hover:bg-stone-50">
                    Full factor-by-factor breakdown ({matrix.total_factors})
                </summary>
                <div className="divide-y divide-stone-100">
                    {matrix.rows.map((r, i) => {
                        const style = ASSESS_STYLES[r.assessment];
                        return (
                            <div key={i} className="p-4">
                                <div className="flex items-center justify-between mb-1 gap-2">
                                    <p className="text-sm font-bold text-stone-900">{r.factor}</p>
                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                        <span className="text-[9px] text-stone-400 uppercase">{r.factor_weight}</span>
                                        <span
                                            className={clsx(
                                                style.bg,
                                                style.text,
                                                "text-[10px] font-bold px-2 py-0.5 rounded-full",
                                            )}
                                        >
                                            {style.label}
                                        </span>
                                    </div>
                                </div>
                                <p className="text-xs text-stone-600 leading-relaxed mb-1">
                                    <span className="font-bold">RFP:</span> {r.opp_requirement}
                                </p>
                                <p className="text-xs text-stone-600 leading-relaxed mb-1">
                                    <span className="font-bold">You:</span> {r.user_strength}
                                </p>
                                {r.gap_description && (
                                    <p className="text-xs text-red-700 leading-relaxed italic">
                                        Gap: {r.gap_description}
                                    </p>
                                )}
                                {r.mitigation && (
                                    <p className="text-xs text-amber-700 leading-relaxed mt-1">
                                        → {r.mitigation}
                                    </p>
                                )}
                                {r.citation_ideas.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {r.citation_ideas.map((c, j) => (
                                            <span
                                                key={j}
                                                className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full"
                                            >
                                                {c}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </details>
        </div>
    );
}

function Bar({ label, count, color }: { label: string; count: number; color: string }) {
    return (
        <div>
            <p className="text-[10px] text-stone-500 uppercase font-bold tracking-wider">{label}</p>
            <div className="flex items-baseline gap-1.5">
                <p className="text-xl font-black text-stone-900">{count}</p>
                <div className="flex-1 h-1.5 rounded-full bg-stone-100 overflow-hidden">
                    <div className={clsx("h-full", color)} style={{ width: `${Math.min(100, count * 20)}%` }} />
                </div>
            </div>
        </div>
    );
}

function InsightCard({
    icon: Icon,
    iconClass,
    title,
    items,
}: {
    icon: React.ElementType;
    iconClass: string;
    title: string;
    items: string[];
}) {
    return (
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-2">
                <Icon className={clsx("w-3.5 h-3.5", iconClass)} />
                <p className="text-[10px] font-bold uppercase tracking-wider text-stone-600">{title}</p>
            </div>
            <ul className="space-y-1">
                {items.length === 0 ? (
                    <li className="text-xs text-stone-400 italic">None identified</li>
                ) : (
                    items.map((s, i) => (
                        <li key={i} className="text-xs text-stone-700 leading-relaxed">
                            {s}
                        </li>
                    ))
                )}
            </ul>
        </div>
    );
}
