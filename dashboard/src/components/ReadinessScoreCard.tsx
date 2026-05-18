"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Shield, CheckCircle2, XCircle, TrendingUp } from "lucide-react";

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

const BENCHMARK = 7.2; // p75 of qualified SMBs on SAM.gov — replace with live stat later

type Band = "red" | "amber" | "emerald";

function getBand(score: number): Band {
    if (score >= 7) return "emerald";
    if (score >= 4) return "amber";
    return "red";
}

function getStamp(score: number): { text: string; sub: string } {
    if (score >= 9) return { text: "READY TO BID", sub: "Pursue prime contracts directly" };
    if (score >= 7) return { text: "READY TO BID", sub: "Start with Sources Sought + RFIs" };
    if (score >= 5) return { text: "ALMOST THERE", sub: "Fix 3 things and you're competitive" };
    if (score >= 3) return { text: "FOUNDATION STAGE", sub: "Sub-contract before going prime" };
    return { text: "NOT YET", sub: "Setup needed before bidding" };
}

const COLORS: Record<Band, {
    text: string;
    ring: string;
    stroke: string;
    softBg: string;
    border: string;
    chip: string;
    stamp: string;
    gradient: string;
}> = {
    emerald: {
        text: "text-emerald-600",
        ring: "ring-emerald-100",
        stroke: "stroke-emerald-500",
        softBg: "bg-emerald-50",
        border: "border-emerald-200",
        chip: "bg-emerald-50 text-emerald-700 border-emerald-200",
        stamp: "bg-emerald-500 text-white",
        gradient: "from-emerald-50/70 via-white to-emerald-50/30",
    },
    amber: {
        text: "text-amber-600",
        ring: "ring-amber-100",
        stroke: "stroke-amber-500",
        softBg: "bg-amber-50",
        border: "border-amber-200",
        chip: "bg-amber-50 text-amber-700 border-amber-200",
        stamp: "bg-amber-500 text-white",
        gradient: "from-amber-50/60 via-white to-amber-50/20",
    },
    red: {
        text: "text-red-600",
        ring: "ring-red-100",
        stroke: "stroke-red-500",
        softBg: "bg-red-50",
        border: "border-red-200",
        chip: "bg-red-50 text-red-700 border-red-200",
        stamp: "bg-red-500 text-white",
        gradient: "from-red-50/60 via-white to-stone-50",
    },
};

/**
 * Big readiness score card — animated radial gauge, color-coded verbal stamp,
 * benchmark comparison vs. p75 SMBs, factor-level breakdown.
 */
export default function ReadinessScoreCard({ score, breakdown }: Props) {
    const band = getBand(score);
    const c = COLORS[band];
    const stamp = getStamp(score);
    const pct = Math.max(0, Math.min(100, (score / 10) * 100));

    // Animate score count-up + ring fill on mount.
    const [displayScore, setDisplayScore] = useState(0);
    const [displayPct, setDisplayPct] = useState(0);

    useEffect(() => {
        const duration = 1100;
        const start = performance.now();
        let raf = 0;
        const tick = (now: number) => {
            const t = Math.min(1, (now - start) / duration);
            // ease-out cubic
            const eased = 1 - Math.pow(1 - t, 3);
            setDisplayScore(Math.round(score * eased * 10) / 10);
            setDisplayPct(pct * eased);
            if (t < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [score, pct]);

    const radius = 64;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (displayPct / 100) * circumference;
    const benchmarkPct = (BENCHMARK / 10) * 100;
    const aboveBenchmark = score >= BENCHMARK;

    return (
        <div className={clsx("rounded-[28px] border-2 shadow-sm overflow-hidden bg-gradient-to-br", c.border, c.gradient)}>
            <div className="bg-white/60 backdrop-blur-sm border-b border-stone-100/60 px-5 sm:px-8 py-4 flex items-center justify-between">
                <h2 className="font-bold text-base flex items-center">
                    <Shield className={clsx("w-4 h-4 mr-2", c.text)} />
                    Government Contracting Readiness
                </h2>
                <span className={clsx("text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full border", c.chip)}>
                    {stamp.text}
                </span>
            </div>

            <div className="p-5 sm:p-8">
                <div className="flex flex-col sm:flex-row gap-8 items-center sm:items-start">
                    {/* Big animated ring */}
                    <div className="flex flex-col items-center flex-shrink-0">
                        <div className="relative w-44 h-44">
                            <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
                                <circle
                                    cx="80"
                                    cy="80"
                                    r={radius}
                                    fill="none"
                                    className="stroke-stone-200"
                                    strokeWidth="12"
                                />
                                <circle
                                    cx="80"
                                    cy="80"
                                    r={radius}
                                    fill="none"
                                    className={c.stroke}
                                    strokeWidth="12"
                                    strokeLinecap="round"
                                    strokeDasharray={circumference}
                                    strokeDashoffset={offset}
                                />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <p className={clsx("text-6xl font-black leading-none tabular-nums", c.text)}>
                                    {displayScore.toFixed(1)}
                                </p>
                                <p className="text-[10px] text-stone-400 mt-1 uppercase tracking-widest">out of 10</p>
                            </div>
                        </div>
                        <p className={clsx("mt-4 text-sm font-bold text-center", c.text)}>
                            {breakdown?.interpretation || stamp.sub}
                        </p>

                        {/* Benchmark bar */}
                        <div className="mt-5 w-full max-w-[200px]">
                            <div className="flex justify-between text-[10px] text-stone-400 mb-1.5">
                                <span>You</span>
                                <span className="font-bold">P75: {BENCHMARK}</span>
                            </div>
                            <div className="relative h-1.5 bg-stone-200 rounded-full overflow-hidden">
                                <div
                                    className={clsx("absolute inset-y-0 left-0 transition-all duration-[1100ms] ease-out", c.stroke.replace("stroke-", "bg-"))}
                                    style={{ width: `${pct}%` }}
                                />
                                <div
                                    className="absolute top-0 bottom-0 w-px bg-stone-600"
                                    style={{ left: `${benchmarkPct}%` }}
                                />
                            </div>
                            <p className={clsx("text-[10px] mt-1.5 flex items-center gap-1", aboveBenchmark ? "text-emerald-600" : "text-stone-500")}>
                                {aboveBenchmark ? (
                                    <><TrendingUp className="w-3 h-3" /> Above top 25% of small biz</>
                                ) : (
                                    <>+{(BENCHMARK - score).toFixed(1)} pts to reach top 25%</>
                                )}
                            </p>
                        </div>
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
                                            "flex items-start gap-2.5 rounded-xl border px-3 py-2 transition-all",
                                            f.present
                                                ? "border-emerald-100 bg-emerald-50/50"
                                                : "border-stone-100 bg-white/60 hover:bg-amber-50/40 hover:border-amber-200 cursor-help",
                                        )}
                                        title={!f.present ? `Fix this and add +${f.points} to your score` : undefined}
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
                                                <p className={clsx("font-bold text-xs", f.present ? "text-black" : "text-stone-500")}>
                                                    {f.label}
                                                </p>
                                                <p className={clsx(
                                                    "text-[10px] font-mono font-bold flex-shrink-0",
                                                    f.present ? "text-emerald-600" : "text-amber-600"
                                                )}>
                                                    {f.present ? `+${f.points}` : `+${f.points} avail`}
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
