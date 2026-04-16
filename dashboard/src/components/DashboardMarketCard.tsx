"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus, Loader2 } from "lucide-react";
import clsx from "clsx";

interface MarketSummary {
    summary: {
        total_spend: number;
        avg_yearly_spend: number;
        yoy_growth_pct: number;
        market_trend: "GROWING" | "DECLINING" | "STABLE";
    };
    yearly_spend: Array<{ year: string; amount: number }>;
    top_agencies: Array<{ name: string; amount: number }>;
}

function fmt(n: number): string {
    if (!n) return "—";
    if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
    return `$${Math.round(n)}`;
}

/**
 * Compact dashboard card showing 5-year federal spend across the user's
 * target NAICS codes. Lighter-weight than the full MarketIntelligence
 * component — meant for the dashboard KPI column, not deep drilldown.
 */
export function DashboardMarketCard({ naicsCodes }: { naicsCodes: string[] }) {
    const [data, setData] = useState<MarketSummary | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!naicsCodes?.length) { setLoading(false); return; }
        let cancelled = false;
        (async () => {
            try {
                const naicsParam = naicsCodes.slice(0, 5).join(",");
                const res = await fetch(`/api/intelligence/market-size?naics=${naicsParam}&years=5`);
                if (res.ok) {
                    const body = await res.json() as MarketSummary;
                    if (!cancelled) setData(body);
                }
            } catch { /* ignore */ }
            if (!cancelled) setLoading(false);
        })();
        return () => { cancelled = true; };
    }, [naicsCodes]);

    if (!naicsCodes?.length) return null;

    if (loading) {
        return (
            <div className="bg-white rounded-2xl border border-stone-200 p-5 h-full flex items-center justify-center min-h-[180px]">
                <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
            </div>
        );
    }

    if (!data || (data.summary?.total_spend || 0) === 0) {
        return (
            <div className="bg-white rounded-2xl border border-stone-200 p-5 h-full">
                <h3 className="font-bold text-sm text-stone-500 mb-1">Your Market</h3>
                <p className="text-xs text-stone-400">No federal spend data for your NAICS codes yet. We refresh this nightly.</p>
            </div>
        );
    }

    const { summary, yearly_spend, top_agencies } = data;
    const TrendIcon = summary.market_trend === "GROWING" ? TrendingUp : summary.market_trend === "DECLINING" ? TrendingDown : Minus;
    const trendColor = summary.market_trend === "GROWING" ? "text-emerald-600" : summary.market_trend === "DECLINING" ? "text-red-600" : "text-stone-500";
    const maxYear = Math.max(...yearly_spend.map(y => y.amount), 1);

    return (
        <div className="bg-white rounded-2xl border border-stone-200 p-5 h-full">
            <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-sm">Your Market</h3>
                <span className="text-[9px] uppercase tracking-widest text-stone-400">
                    {naicsCodes.slice(0, 3).join(", ")}{naicsCodes.length > 3 ? ` +${naicsCodes.length - 3}` : ""}
                </span>
            </div>
            <div className="mb-3">
                <p className="text-3xl font-black text-black tracking-tight">{fmt(summary.total_spend)}</p>
                <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-[11px] text-stone-500">5-year federal spend</p>
                    <span className={clsx("inline-flex items-center gap-1 text-[10px] font-bold", trendColor)}>
                        <TrendIcon className="w-3 h-3" />
                        {summary.yoy_growth_pct > 0 ? "+" : ""}{summary.yoy_growth_pct}% YoY
                    </span>
                </div>
            </div>
            {/* Tiny sparkline bars — not pixel-perfect, just a visual hint of direction. */}
            <div className="flex items-end gap-1 h-10 mb-3">
                {yearly_spend.map(y => (
                    <div key={y.year} className="flex-1 flex flex-col items-center gap-0.5">
                        <div
                            className="w-full bg-emerald-400 rounded-t"
                            style={{ height: `${Math.max(4, (y.amount / maxYear) * 100)}%` }}
                            title={`${y.year}: ${fmt(y.amount)}`}
                        />
                        <span className="text-[8px] text-stone-400">{y.year.slice(-2)}</span>
                    </div>
                ))}
            </div>
            {top_agencies.length > 0 && (
                <div>
                    <p className="text-[10px] uppercase tracking-widest text-stone-400 mb-1.5">Top buyers</p>
                    <div className="space-y-1">
                        {top_agencies.slice(0, 3).map((a, i) => (
                            <div key={i} className="flex items-center justify-between text-[11px]">
                                <span className="truncate text-stone-700 font-medium">{a.name}</span>
                                <span className="text-stone-500 font-mono ml-2 flex-shrink-0">{fmt(a.amount)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
