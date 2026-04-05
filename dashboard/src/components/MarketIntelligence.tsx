"use client";

import { useEffect, useState } from "react";
import { BarChart3, TrendingUp, TrendingDown, Minus, Building2, MapPin, Loader2, DollarSign } from "lucide-react";
import clsx from "clsx";

interface MarketData {
    summary: {
        total_spend: number;
        avg_yearly_spend: number;
        yoy_growth_pct: number;
        market_trend: string;
    };
    yearly_spend: Array<{ year: string; amount: number }>;
    top_agencies: Array<{ name: string; amount: number }>;
    top_states: Array<{ name: string; amount: number }>;
    top_recipients: Array<{ name: string; amount: number; count: number }>;
}

function fmtCurrency(n: number): string {
    if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toLocaleString()}`;
}

/**
 * MarketIntelligence — shows market size, trends, top buyers, competitors.
 * Uses /api/intelligence/market-size and /api/intelligence/fpds.
 *
 * Props:
 * - naicsCodes: string[] — NAICS codes to analyze
 * - companyName?: string — highlight this company in competitor list
 */
export function MarketIntelligence({ naicsCodes, companyName }: { naicsCodes: string[]; companyName?: string }) {
    const [marketData, setMarketData] = useState<MarketData | null>(null);
    const [competitorData, setCompetitorData] = useState<MarketData["top_recipients"]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!naicsCodes?.length) { setLoading(false); return; }

        (async () => {
            const [marketRes, fpdsRes] = await Promise.all([
                fetch(`/api/intelligence/market-size?naics=${naicsCodes.join(",")}&years=5`).then(r => r.json()).catch(() => null),
                fetch(`/api/intelligence/fpds?naics=${naicsCodes[0]}&years=3`).then(r => r.json()).catch(() => null),
            ]);

            if (marketRes?.success) {
                setMarketData(marketRes);
            }
            if (fpdsRes?.success) {
                setCompetitorData(fpdsRes.top_recipients || []);
            }
            setLoading(false);
        })();
    }, [naicsCodes]);

    if (loading) {
        return (
            <div className="bg-white border border-stone-200 rounded-2xl p-8 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
            </div>
        );
    }

    if (!marketData) {
        return (
            <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center">
                <p className="text-sm text-stone-400">No market data available for these NAICS codes.</p>
            </div>
        );
    }

    const { summary, yearly_spend, top_agencies, top_states } = marketData;
    const maxSpend = Math.max(...yearly_spend.map(y => y.amount), 1);
    const maxAgencySpend = Math.max(...top_agencies.map(a => a.amount), 1);

    const TrendIcon = summary.market_trend === "GROWING" ? TrendingUp : summary.market_trend === "DECLINING" ? TrendingDown : Minus;
    const trendColor = summary.market_trend === "GROWING" ? "text-emerald-600" : summary.market_trend === "DECLINING" ? "text-red-600" : "text-stone-500";

    return (
        <div className="space-y-4">
            {/* Market Summary */}
            <div className="bg-white border border-stone-200 rounded-2xl p-5">
                <h3 className="font-bold text-sm flex items-center gap-2 mb-4">
                    <BarChart3 className="w-4 h-4 text-stone-400" /> Market Intelligence
                    <span className="text-[9px] text-stone-400 font-typewriter uppercase ml-auto">Source: USASpending.gov</span>
                </h3>

                {/* KPI Row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                    <div className="bg-stone-50 rounded-xl p-3 text-center">
                        <p className="text-xl font-black text-emerald-600">{fmtCurrency(summary.total_spend)}</p>
                        <p className="text-[9px] text-stone-400 uppercase font-typewriter">Total Market (5yr)</p>
                    </div>
                    <div className="bg-stone-50 rounded-xl p-3 text-center">
                        <p className="text-xl font-black">{fmtCurrency(summary.avg_yearly_spend)}</p>
                        <p className="text-[9px] text-stone-400 uppercase font-typewriter">Avg/Year</p>
                    </div>
                    <div className="bg-stone-50 rounded-xl p-3 text-center">
                        <p className={clsx("text-xl font-black inline-flex items-center gap-1", trendColor)}>
                            <TrendIcon className="w-4 h-4" />
                            {Math.abs(summary.yoy_growth_pct)}%
                        </p>
                        <p className="text-[9px] text-stone-400 uppercase font-typewriter">YoY Growth</p>
                    </div>
                    <div className="bg-stone-50 rounded-xl p-3 text-center">
                        <p className={clsx("text-xl font-black", trendColor)}>{summary.market_trend}</p>
                        <p className="text-[9px] text-stone-400 uppercase font-typewriter">Trend</p>
                    </div>
                </div>

                {/* Spending Trend Chart (simple bar chart) */}
                {yearly_spend.length > 0 && (
                    <div>
                        <p className="text-[10px] font-typewriter text-stone-400 uppercase mb-2">Annual Federal Spending</p>
                        <div className="flex items-end gap-1 h-24">
                            {yearly_spend.map((y, i) => (
                                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                                    <span className="text-[8px] font-bold text-stone-500">{fmtCurrency(y.amount)}</span>
                                    <div
                                        className={clsx("w-full rounded-t transition-all",
                                            i === yearly_spend.length - 1 ? "bg-emerald-500" : "bg-stone-200"
                                        )}
                                        style={{ height: `${Math.max(4, (y.amount / maxSpend) * 80)}px` }}
                                    />
                                    <span className="text-[9px] text-stone-400">{y.year}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Top Agencies + States */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Top Agencies */}
                {top_agencies.length > 0 && (
                    <div className="bg-white border border-stone-200 rounded-2xl p-5">
                        <h4 className="font-bold text-sm flex items-center gap-2 mb-3">
                            <Building2 className="w-4 h-4 text-stone-400" /> Top Buying Agencies
                        </h4>
                        <div className="space-y-2">
                            {top_agencies.slice(0, 5).map((a, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-medium truncate">{a.name}</p>
                                        <div className="w-full bg-stone-100 rounded-full h-1.5 mt-1">
                                            <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${(a.amount / maxAgencySpend) * 100}%` }} />
                                        </div>
                                    </div>
                                    <span className="text-xs font-bold text-stone-600 flex-shrink-0">{fmtCurrency(a.amount)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Top Competitors */}
                {competitorData.length > 0 && (
                    <div className="bg-white border border-stone-200 rounded-2xl p-5">
                        <h4 className="font-bold text-sm flex items-center gap-2 mb-3">
                            <DollarSign className="w-4 h-4 text-stone-400" /> Top Contract Winners
                        </h4>
                        <div className="space-y-2">
                            {competitorData.slice(0, 5).map((r, i) => (
                                <div key={i} className={clsx("flex items-center gap-2 text-xs p-1.5 rounded",
                                    companyName && r.name.toLowerCase().includes(companyName.toLowerCase()) ? "bg-emerald-50 border border-emerald-200" : ""
                                )}>
                                    <span className="font-black text-stone-400 w-5">{i + 1}</span>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium truncate">{r.name}</p>
                                    </div>
                                    <span className="font-bold text-emerald-600">{fmtCurrency(r.amount)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Geographic Distribution */}
            {top_states.length > 0 && (
                <div className="bg-white border border-stone-200 rounded-2xl p-5">
                    <h4 className="font-bold text-sm flex items-center gap-2 mb-3">
                        <MapPin className="w-4 h-4 text-stone-400" /> Top States by Spending
                    </h4>
                    <div className="flex flex-wrap gap-2">
                        {top_states.slice(0, 10).map((s, i) => (
                            <div key={i} className="bg-stone-50 rounded-lg px-3 py-1.5 text-center">
                                <p className="text-xs font-bold">{s.name}</p>
                                <p className="text-[10px] text-stone-500">{fmtCurrency(s.amount)}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
