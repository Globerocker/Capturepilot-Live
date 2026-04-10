"use client";

import clsx from "clsx";
import { Shield, CheckCircle2, XCircle } from "lucide-react";

interface ReadinessFactor {
    label: string;
    points: number;
    present: boolean;
    detail?: string;
}

interface ReadinessBreakdown {
    factors: ReadinessFactor[];
    raw_points: number;
    total: number;
    interpretation: string;
}

interface Props {
    score: number;
    breakdown: ReadinessBreakdown | null;
}

/**
 * Big readiness score card — shows a 0-10 number colored by band,
 * a one-line interpretation, and a breakdown of factor contributions.
 */
export default function ReadinessScoreCard({ score, breakdown }: Props) {
    const band: "red" | "amber" | "emerald" =
        score >= 7 ? "emerald" : score >= 4 ? "amber" : "red";

    const colorByBand: Record<typeof band, { bg: string; text: string; ring: string; soft: string; border: string }> = {
        red: {
            bg: "bg-red-500",
            text: "text-red-600",
            ring: "ring-red-200",
            soft: "bg-red-50",
            border: "border-red-200",
        },
        amber: {
            bg: "bg-amber-500",
            text: "text-amber-600",
            ring: "ring-amber-200",
            soft: "bg-amber-50",
            border: "border-amber-200",
        },
        emerald: {
            bg: "bg-emerald-500",
            text: "text-emerald-600",
            ring: "ring-emerald-200",
            soft: "bg-emerald-50",
            border: "border-emerald-200",
        },
    };
    const c = colorByBand[band];

    return (
        <div className="bg-white rounded-[28px] border border-stone-200 shadow-sm overflow-hidden">
            <div className="bg-stone-50 border-b border-stone-100 px-5 sm:px-8 py-4">
                <h2 className="font-bold text-base flex items-center">
                    <Shield className="w-4 h-4 mr-2 text-stone-400" />
                    Government Contracting Readiness
                </h2>
            </div>
            <div className="p-5 sm:p-8">
                <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start">
                    {/* Big number */}
                    <div className="flex flex-col items-center flex-shrink-0">
                        <div
                            className={clsx(
                                "w-32 h-32 rounded-full flex flex-col items-center justify-center ring-8",
                                c.soft,
                                c.ring,
                            )}
                        >
                            <p className={clsx("text-5xl font-black leading-none", c.text)}>{score}</p>
                            <p className="text-xs text-stone-500 mt-1 uppercase tracking-wider">out of 10</p>
                        </div>
                        <p className={clsx("mt-3 text-sm font-bold", c.text)}>
                            {breakdown?.interpretation || ""}
                        </p>
                    </div>

                    {/* Breakdown */}
                    <div className="flex-1 min-w-0 w-full">
                        <p className="text-[10px] text-stone-400 uppercase tracking-widest mb-2">
                            Score Breakdown
                        </p>
                        {breakdown && breakdown.factors && breakdown.factors.length > 0 ? (
                            <div className="space-y-2">
                                {breakdown.factors.map((f, i) => (
                                    <div
                                        key={i}
                                        className={clsx(
                                            "flex items-start gap-2.5 rounded-xl border px-3 py-2",
                                            f.present ? "border-emerald-100 bg-emerald-50/40" : "border-stone-100 bg-stone-50",
                                        )}
                                    >
                                        <div className="flex-shrink-0 mt-0.5">
                                            {f.present ? (
                                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                            ) : (
                                                <XCircle className="w-4 h-4 text-stone-300" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-baseline justify-between gap-2">
                                                <p
                                                    className={clsx(
                                                        "font-bold text-xs",
                                                        f.present ? "text-black" : "text-stone-500",
                                                    )}
                                                >
                                                    {f.label}
                                                </p>
                                                <p
                                                    className={clsx(
                                                        "text-[10px] font-mono font-bold flex-shrink-0",
                                                        f.points > 0 ? "text-emerald-600" : "text-stone-400",
                                                    )}
                                                >
                                                    {f.points > 0 ? `+${f.points}` : f.points}
                                                </p>
                                            </div>
                                            {f.detail && (
                                                <p className="text-[11px] text-stone-500 mt-0.5 leading-snug">
                                                    {f.detail}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-stone-500 italic">
                                Breakdown unavailable.
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
