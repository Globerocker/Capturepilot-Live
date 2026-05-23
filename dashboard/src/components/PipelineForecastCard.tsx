"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TrendingUp, Loader2, Target, Calendar, ExternalLink } from "lucide-react";
import clsx from "clsx";

interface Quarter {
    label: string;
    fy: number;
    q: 1 | 2 | 3 | 4;
    weighted_cents: number;
    raw_cents: number;
    pursuits: number;
}

interface TopPursuit {
    id: string;
    stage: string;
    pwin: number;
    value_cents: number;
    weighted_cents: number;
    close_date: string | null;
    title: string | null;
    agency: string | null;
    opportunity_id: string | null;
}

interface Forecast {
    quarters: Quarter[];
    top_pursuits: TopPursuit[];
    totals: {
        weighted_cents: number;
        raw_cents: number;
        active_pursuits: number;
    };
    generated_at: string;
}

function fmtUsdCents(cents: number): string {
    if (!cents) return "$0";
    const usd = cents / 100;
    if (usd >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(2)}B`;
    if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
    if (usd >= 1_000) return `$${(usd / 1_000).toFixed(0)}K`;
    return `$${usd.toLocaleString()}`;
}

export function PipelineForecastCard() {
    const [data, setData] = useState<Forecast | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch("/api/pipeline/forecast", { cache: "no-store" })
            .then(r => r.json())
            .then(d => {
                if (d.error) setError(d.error);
                else setData(d);
            })
            .catch(e => setError(e.message));
    }, []);

    if (error) {
        return (
            <div className="bg-white border border-stone-200 rounded-2xl p-5">
                <p className="text-xs text-rose-600">Forecast unavailable: {error}</p>
            </div>
        );
    }
    if (!data) {
        return (
            <div className="bg-white border border-stone-200 rounded-2xl p-5 flex items-center gap-2 text-xs text-stone-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading forecast…
            </div>
        );
    }
    if (data.totals.active_pursuits === 0) {
        return (
            <div className="bg-white border border-stone-200 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-stone-400" />
                    <h3 className="font-bold text-sm">Pipeline forecast</h3>
                </div>
                <p className="text-xs text-stone-500">
                    No active pursuits yet — start one from the <Link href="/matches" className="text-emerald-700 underline">matches</Link> page and it'll show up here with a predicted close date + PWin-weighted value.
                </p>
            </div>
        );
    }

    const maxQ = data.quarters.reduce((m, q) => Math.max(m, q.weighted_cents), 0);

    return (
        <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-stone-100 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                    <h3 className="font-bold text-sm">Pipeline forecast</h3>
                </div>
                <div className="text-xs text-stone-500">
                    Weighted <span className="font-bold text-stone-900 tabular-nums">{fmtUsdCents(data.totals.weighted_cents)}</span>
                    <span className="text-stone-400"> · raw {fmtUsdCents(data.totals.raw_cents)} across {data.totals.active_pursuits} pursuits</span>
                </div>
            </div>

            {/* Quarter bars */}
            <div className="p-5 space-y-2">
                {data.quarters.length === 0 ? (
                    <p className="text-xs text-stone-500">No pursuits have a predictable close date yet.</p>
                ) : (
                    data.quarters.map(q => {
                        const w = maxQ > 0 ? (q.weighted_cents / maxQ) * 100 : 0;
                        return (
                            <div key={`${q.fy}-${q.q}`} className="flex items-center gap-3 text-xs">
                                <span className="w-14 flex-shrink-0 font-mono text-stone-500">{q.label}</span>
                                <div className="flex-1 h-5 bg-stone-100 rounded-full overflow-hidden relative">
                                    <div
                                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500 to-emerald-400"
                                        style={{ width: `${w}%` }}
                                    />
                                </div>
                                <span className="w-20 text-right tabular-nums font-bold text-stone-700 flex-shrink-0">
                                    {fmtUsdCents(q.weighted_cents)}
                                </span>
                                <span className="w-12 text-right text-[10px] text-stone-400 flex-shrink-0">{q.pursuits} opps</span>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Top weighted pursuits */}
            {data.top_pursuits.length > 0 && (
                <div className="border-t border-stone-100 p-5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-2 flex items-center gap-1">
                        <Target className="w-3 h-3" /> Heaviest pursuits
                    </p>
                    <div className="space-y-1.5">
                        {data.top_pursuits.map(p => (
                            <Link
                                key={p.id}
                                href={p.opportunity_id ? `/opportunities/${p.opportunity_id}` : "/pipeline"}
                                className="flex items-center gap-2 text-xs hover:bg-stone-50 -mx-2 px-2 py-1 rounded-lg group"
                            >
                                <span className={clsx(
                                    "text-[9px] font-bold px-1.5 py-0.5 rounded border tabular-nums flex-shrink-0",
                                    p.pwin >= 50 ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                    p.pwin >= 25 ? "bg-amber-50 text-amber-700 border-amber-200" :
                                    "bg-stone-100 text-stone-600 border-stone-200",
                                )}>
                                    {p.pwin}% PWin
                                </span>
                                <span className="flex-1 truncate text-stone-700 group-hover:text-stone-900">
                                    {p.title || "(untitled)"}
                                    <span className="text-stone-400"> · {p.agency || "?"}</span>
                                </span>
                                <span className="tabular-nums font-bold text-stone-700 flex-shrink-0">{fmtUsdCents(p.weighted_cents)}</span>
                                {p.close_date && (
                                    <span className="text-[10px] text-stone-400 flex items-center gap-0.5 flex-shrink-0">
                                        <Calendar className="w-2.5 h-2.5" /> {p.close_date}
                                    </span>
                                )}
                                <ExternalLink className="w-3 h-3 text-stone-300 group-hover:text-stone-500 flex-shrink-0" />
                            </Link>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
