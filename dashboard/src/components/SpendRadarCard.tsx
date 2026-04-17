"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Radar, DollarSign, Flame, ArrowRight, Loader2 } from "lucide-react";

interface Agency {
    id: string;
    rank: number | null;
    agency_name: string;
    fiscal_year: number;
    fiscal_period: string;
    unobligated_balance_usd: number | string | null;
    hot_naics: string[];
    hot_opportunities: string | null;
    why_now: string | null;
    matches_profile: boolean;
    naics_match_count: number;
}

interface RadarResponse {
    agencies: Agency[];
    total_unobligated_usd: number;
    fiscal_year: number | null;
    fiscal_period: string | null;
    has_profile_matches: boolean;
}

function formatBillion(n: number | string | null): string {
    const v = Number(n || 0);
    if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
    if (v >= 1_000_000)     return `$${(v / 1_000_000).toFixed(0)}M`;
    return `$${v.toLocaleString()}`;
}

export function SpendRadarCard() {
    const [data, setData] = useState<RadarResponse | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch("/api/spend-radar");
                if (res.ok) setData(await res.json());
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    if (loading) {
        return (
            <section className="bg-gradient-to-br from-indigo-900 via-indigo-950 to-black text-white rounded-[24px] sm:rounded-[32px] p-5 sm:p-6 border border-indigo-900/40 shadow-sm">
                <div className="flex items-center gap-2 text-indigo-200">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-xs">Loading Year-End Spend Radar…</span>
                </div>
            </section>
        );
    }

    if (!data || !data.agencies.length) return null;

    const topMatches = data.agencies.filter(a => a.matches_profile).slice(0, 3);
    const otherTop  = data.agencies.filter(a => !a.matches_profile).slice(0, 3);
    const featured  = topMatches.length ? topMatches : data.agencies.slice(0, 3);

    return (
        <section className="bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-900 text-white rounded-[24px] sm:rounded-[32px] p-5 sm:p-6 border border-indigo-900/40 shadow-sm">
            <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Radar className="w-5 h-5 text-amber-300" />
                        <h3 className="text-lg font-bold tracking-tight">Year-End Spend Radar</h3>
                        <span className="text-[10px] font-bold bg-amber-300 text-indigo-950 px-2 py-0.5 rounded-full uppercase tracking-wide">
                            FY{data.fiscal_year} {data.fiscal_period}
                        </span>
                    </div>
                    <p className="text-xs text-indigo-200/80">
                        Agencies with the biggest unobligated balances — the "use it or lose it" pool driving December awards.
                    </p>
                </div>
                <div className="text-right">
                    <div className="text-[10px] uppercase tracking-widest text-indigo-300/80 font-bold">Total unobligated</div>
                    <div className="text-2xl font-bold text-amber-300 inline-flex items-center gap-1">
                        <DollarSign className="w-5 h-5" />{formatBillion(data.total_unobligated_usd)}
                    </div>
                </div>
            </div>

            {data.has_profile_matches && (
                <p className="text-[11px] text-amber-200 bg-amber-300/10 border border-amber-300/30 rounded-lg px-3 py-1.5 mb-3 inline-flex items-center gap-1.5">
                    <Flame className="w-3 h-3" /> {topMatches.length} agencies match your NAICS profile — prioritize outreach here first.
                </p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {featured.map(a => (
                    <div
                        key={a.id}
                        className={`rounded-2xl p-4 border ${
                            a.matches_profile
                                ? "bg-amber-300/10 border-amber-300/40"
                                : "bg-white/5 border-white/10"
                        }`}
                    >
                        <div className="flex items-start justify-between gap-2 mb-2">
                            <h4 className="font-bold text-sm leading-tight">{a.agency_name}</h4>
                            {a.matches_profile && (
                                <span className="text-[9px] font-bold bg-amber-300 text-indigo-950 px-1.5 py-0.5 rounded uppercase flex-shrink-0">
                                    {a.naics_match_count} match
                                </span>
                            )}
                        </div>
                        <div className="text-xl font-bold text-amber-300 mb-1.5">
                            {formatBillion(a.unobligated_balance_usd)}
                        </div>
                        {a.hot_opportunities && (
                            <p className="text-[11px] text-indigo-100/90 line-clamp-2 mb-2">{a.hot_opportunities}</p>
                        )}
                        {a.hot_naics.length > 0 && (
                            <div className="flex gap-1 flex-wrap">
                                {a.hot_naics.slice(0, 4).map(n => (
                                    <span key={n} className="text-[9px] font-mono bg-white/10 text-indigo-100 px-1.5 py-0.5 rounded">{n}</span>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {otherTop.length > 0 && topMatches.length > 0 && (
                <details className="mt-4 text-xs text-indigo-200">
                    <summary className="cursor-pointer hover:text-white">Show other top agencies ({data.agencies.length - topMatches.length})</summary>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
                        {data.agencies.filter(a => !a.matches_profile).map(a => (
                            <div key={a.id} className="flex items-center justify-between gap-3 text-[11px] border-b border-white/10 pb-1.5">
                                <span className="truncate">#{a.rank} {a.agency_name}</span>
                                <span className="font-bold text-amber-300 flex-shrink-0">{formatBillion(a.unobligated_balance_usd)}</span>
                            </div>
                        ))}
                    </div>
                </details>
            )}

            <div className="mt-4 flex items-center justify-between text-[11px] text-indigo-200/80">
                <span>Source: NDAA FY{data.fiscal_year}, Monthly Treasury Statement, GAO</span>
                <Link href="/partners?status=potential" className="text-amber-300 hover:text-amber-200 inline-flex items-center gap-1 font-bold">
                    Find teaming partners <ArrowRight className="w-3 h-3" />
                </Link>
            </div>
        </section>
    );
}
