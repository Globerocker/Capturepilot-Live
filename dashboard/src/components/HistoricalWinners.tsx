"use client";

import { useEffect, useState } from "react";
import { Trophy, Loader2, AlertTriangle, Building } from "lucide-react";
import clsx from "clsx";

interface Winner {
    awardee: string;
    award_count: number;
    total_value: number;
    last_award_date: string | null;
    primary_agency: string | null;
    most_recent_title: string | null;
}

interface Summary {
    total_awards: number;
    total_value: number;
    unique_awardees: number;
    avg_award_value: number;
    top_concentration: number;
}

function fmtCurrency(n: number): string {
    if (!n) return "—";
    if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
    return `$${Math.round(n)}`;
}

/**
 * Shows companies that have historically won federal contracts under the same
 * NAICS code as the current opportunity. Rendered on the opportunity detail
 * page — helps the user see who the incumbents are and whether the market is
 * concentrated (few big winners) or fragmented (many small ones).
 */
export function HistoricalWinners({ naicsCode, currentAwardee, highlightSelf }: {
    naicsCode: string;
    currentAwardee?: string | null;
    // If the user's profile matches one of the winners, we can highlight it.
    highlightSelf?: string | null;
}) {
    const [data, setData] = useState<{ winners: Winner[]; summary: Summary } | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!naicsCode) { setLoading(false); return; }
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/opportunities/historical-winners?naics=${naicsCode}&limit=8`);
                if (!res.ok) { if (!cancelled) setLoading(false); return; }
                const body = await res.json() as { winners: Winner[]; summary: Summary };
                if (!cancelled) { setData(body); setLoading(false); }
            } catch {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [naicsCode]);

    if (loading) {
        return (
            <div className="bg-white border border-stone-200 rounded-2xl p-6 flex justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
            </div>
        );
    }
    if (!data || data.winners.length === 0) {
        return (
            <div className="bg-white border border-stone-200 rounded-2xl p-6 text-center">
                <p className="text-xs text-stone-500">
                    No historical award data for NAICS {naicsCode} in our corpus yet.
                </p>
            </div>
        );
    }

    const { winners, summary } = data;
    const self = highlightSelf?.trim().toLowerCase();
    const currentName = currentAwardee?.trim().toLowerCase();

    // Concentration label: >40% = concentrated, 20-40% moderate, <20% fragmented.
    const concentration = summary.top_concentration * 100;
    const marketShape =
        concentration >= 40 ? { label: "Concentrated", color: "text-red-600 bg-red-50 border-red-200" }
        : concentration >= 20 ? { label: "Moderate", color: "text-amber-600 bg-amber-50 border-amber-200" }
        : { label: "Fragmented", color: "text-emerald-600 bg-emerald-50 border-emerald-200" };

    return (
        <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-4">
            <div className="flex items-start gap-2 flex-wrap">
                <Trophy className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm">Who typically wins contracts like this</h3>
                    <p className="text-[11px] text-stone-500 mt-0.5 leading-tight">
                        Companies that won contracts under the same NAICS code (<span className="font-mono">{naicsCode}</span>) across all federal agencies in the last 3 years.
                        High concentration means a few incumbents dominate; fragmented means the market is competitive.
                    </p>
                </div>
                <span className={clsx(
                    "text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border flex-shrink-0",
                    marketShape.color,
                )}>
                    {marketShape.label} Market
                </span>
            </div>

            {/* Summary KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="bg-stone-50 rounded-xl p-3 text-center">
                    <p className="text-lg font-black text-black">{summary.total_awards}</p>
                    <p className="text-[9px] text-stone-400 uppercase">Past Awards</p>
                </div>
                <div className="bg-stone-50 rounded-xl p-3 text-center">
                    <p className="text-lg font-black text-emerald-600">{fmtCurrency(summary.total_value)}</p>
                    <p className="text-[9px] text-stone-400 uppercase">Total $</p>
                </div>
                <div className="bg-stone-50 rounded-xl p-3 text-center">
                    <p className="text-lg font-black text-black">{summary.unique_awardees}</p>
                    <p className="text-[9px] text-stone-400 uppercase">Winners</p>
                </div>
                <div className="bg-stone-50 rounded-xl p-3 text-center">
                    <p className="text-lg font-black text-black">{fmtCurrency(summary.avg_award_value)}</p>
                    <p className="text-[9px] text-stone-400 uppercase">Avg Award</p>
                </div>
            </div>

            {/* Winners list */}
            <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-2">
                    Top {winners.length} winners by award count
                </p>
                <div className="space-y-1">
                    {winners.map((w, i) => {
                        const isCurrent = currentName && w.awardee.toLowerCase().includes(currentName);
                        const isSelf = self && w.awardee.toLowerCase().includes(self);
                        return (
                            <div
                                key={w.awardee + i}
                                className={clsx(
                                    "flex items-center gap-3 px-3 py-2 rounded-xl border",
                                    isSelf ? "bg-emerald-50 border-emerald-200" :
                                    isCurrent ? "bg-blue-50 border-blue-200" :
                                    "bg-stone-50 border-stone-100",
                                )}
                            >
                                <span className="text-xs font-mono text-stone-400 w-5 flex-shrink-0">#{i + 1}</span>
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-sm text-black line-clamp-1">
                                        {w.awardee}
                                        {isSelf && <span className="ml-1.5 text-[9px] bg-emerald-600 text-white px-1.5 py-0.5 rounded uppercase">You</span>}
                                        {isCurrent && !isSelf && <span className="ml-1.5 text-[9px] bg-blue-600 text-white px-1.5 py-0.5 rounded uppercase">Incumbent</span>}
                                    </p>
                                    <div className="flex items-center gap-2 text-[10px] text-stone-500 mt-0.5">
                                        <span className="font-bold">{w.award_count} award{w.award_count === 1 ? "" : "s"}</span>
                                        <span>·</span>
                                        <span>{fmtCurrency(w.total_value)}</span>
                                        {w.primary_agency && (
                                            <>
                                                <span>·</span>
                                                <span className="inline-flex items-center gap-1 truncate">
                                                    <Building className="w-2.5 h-2.5" /> {w.primary_agency}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                                {w.last_award_date && (
                                    <span className="text-[10px] text-stone-400 flex-shrink-0">
                                        {new Date(w.last_award_date).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Win-strategy hint — cheap heuristic from the numbers we already have. */}
            <div className="border-t border-stone-100 pt-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-500" /> Win-strategy signal
                </p>
                <p className="text-xs text-stone-600 leading-relaxed">
                    {concentration >= 40 ? (
                        <>Market is dominated by <strong>{winners[0].awardee}</strong> ({Math.round(concentration)}% share). Consider teaming with them as a sub, or differentiating sharply on price/speed to displace.</>
                    ) : concentration >= 20 ? (
                        <>Top winners take a meaningful share but the market is open. Past performance relative to {winners[0].awardee} will matter — aim to match or beat their typical award value of {fmtCurrency(winners[0].total_value / winners[0].award_count)}.</>
                    ) : (
                        <>Fragmented market — {summary.unique_awardees} distinct winners across {summary.total_awards} awards. Good entry space for newcomers; focus on clearly defined scope and past performance rather than displacing a specific incumbent.</>
                    )}
                </p>
            </div>
        </div>
    );
}
