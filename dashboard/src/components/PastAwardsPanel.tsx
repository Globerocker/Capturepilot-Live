"use client";

import { useEffect, useState } from "react";
import { Trophy, Loader2, Building, ExternalLink, TrendingUp, Calendar } from "lucide-react";
import clsx from "clsx";

interface Agency { name: string; amount: number; count: number }
interface NaicsLine { code: string; description: string; amount: number; count: number }
interface RecentAward { award_id: string; agency: string; amount: number; date: string; naics_code: string; naics_description: string; internal_id: string }

interface RecipientAwards {
    recipient_name: string;
    years: number;
    source: "cache" | "live" | "live_error";
    summary: {
        award_count: number; total_value: number; agencies_count: number;
        naics_codes_count: number; last_award_date: string | null;
    };
    top_agencies: Agency[];
    top_naics: NaicsLine[];
    recent_awards: RecentAward[];
}

function fmt(n: number): string {
    if (!n) return "—";
    if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
    return `$${Math.round(n)}`;
}

/**
 * Shared past-awards panel. Mount on any page where we know a company name
 * (competitor, partner, Quick-Checker result). Makes a single USASpending
 * call via /api/intelligence/recipient-awards and renders:
 *   - Summary KPIs (award count, 5yr total, agency count)
 *   - Top agencies bar
 *   - Recent awards list with a USASpending deep-link
 *
 * Props: name (required) + uei (optional; improves matching accuracy).
 */
export function PastAwardsPanel({ name, uei, compact = false }: {
    name: string;
    uei?: string | null;
    compact?: boolean;
}) {
    const [data, setData] = useState<RecipientAwards | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!name) { setLoading(false); return; }
        let cancelled = false;
        (async () => {
            try {
                const q = new URLSearchParams({ name });
                if (uei) q.set("uei", uei);
                const res = await fetch(`/api/intelligence/recipient-awards?${q.toString()}`);
                if (!res.ok) { if (!cancelled) setLoading(false); return; }
                const body = await res.json() as RecipientAwards;
                if (!cancelled) { setData(body); setLoading(false); }
            } catch { if (!cancelled) setLoading(false); }
        })();
        return () => { cancelled = true; };
    }, [name, uei]);

    if (loading) {
        return (
            <div className={clsx("bg-white border border-stone-200 rounded-2xl p-5 flex justify-center", compact && "p-3")}>
                <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
            </div>
        );
    }
    if (!data || data.summary.award_count === 0) {
        return (
            <div className="bg-white border border-stone-200 rounded-2xl p-5 text-center">
                <Trophy className="w-5 h-5 text-stone-300 mx-auto mb-2" />
                <p className="text-xs text-stone-500">
                    No federal contract awards on record for <strong>{name}</strong> in the last {data?.years || 5} years.
                </p>
                <p className="text-[10px] text-stone-400 mt-1">Source: USASpending.gov</p>
            </div>
        );
    }

    const { summary, top_agencies, top_naics, recent_awards } = data;
    const maxAgency = Math.max(...top_agencies.map(a => a.amount), 1);

    return (
        <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-500" />
                <h3 className="font-bold text-sm">Federal Awards History</h3>
                <span className="ml-auto text-[9px] uppercase tracking-widest text-stone-400">
                    {data.years}-yr · USASpending.gov
                </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="bg-stone-50 rounded-xl p-3 text-center">
                    <p className="text-lg font-black text-black">{summary.award_count}</p>
                    <p className="text-[9px] text-stone-400 uppercase">Awards Won</p>
                </div>
                <div className="bg-stone-50 rounded-xl p-3 text-center">
                    <p className="text-lg font-black text-emerald-600">{fmt(summary.total_value)}</p>
                    <p className="text-[9px] text-stone-400 uppercase">Total $</p>
                </div>
                <div className="bg-stone-50 rounded-xl p-3 text-center">
                    <p className="text-lg font-black text-black">{summary.agencies_count}</p>
                    <p className="text-[9px] text-stone-400 uppercase">Agencies</p>
                </div>
                <div className="bg-stone-50 rounded-xl p-3 text-center">
                    <p className="text-lg font-black text-black">{summary.naics_codes_count}</p>
                    <p className="text-[9px] text-stone-400 uppercase">NAICS Codes</p>
                </div>
            </div>

            {summary.last_award_date && (
                <div className="flex items-center gap-1.5 text-[11px] text-stone-500">
                    <Calendar className="w-3 h-3" />
                    Most recent award: {new Date(summary.last_award_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </div>
            )}

            {/* Top agencies — amount-scaled bars so the user sees dominance at a glance. */}
            {top_agencies.length > 0 && !compact && (
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-1.5 flex items-center gap-1">
                        <Building className="w-3 h-3" /> Top buyers
                    </p>
                    <div className="space-y-1">
                        {top_agencies.slice(0, 5).map((a, i) => (
                            <div key={i} className="relative">
                                <div className="flex items-center justify-between text-xs relative z-10 px-2 py-1">
                                    <span className="truncate font-medium text-stone-800">{a.name}</span>
                                    <span className="text-stone-500 ml-2 flex-shrink-0">{fmt(a.amount)} <span className="text-[10px] text-stone-400">({a.count})</span></span>
                                </div>
                                <div
                                    className="absolute inset-0 bg-emerald-100 rounded"
                                    style={{ width: `${(a.amount / maxAgency) * 100}%`, opacity: 0.5 }}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* NAICS mix — shows how specialized they are. */}
            {top_naics.length > 0 && !compact && (
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-1.5 flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" /> Where they win (by NAICS)
                    </p>
                    <div className="space-y-0.5">
                        {top_naics.slice(0, 4).map((n, i) => (
                            <div key={i} className="flex items-center gap-3 text-[11px] py-1 border-b border-stone-50 last:border-0">
                                <span className="font-mono text-[10px] bg-stone-100 text-stone-700 px-1.5 py-0.5 rounded font-bold flex-shrink-0">{n.code}</span>
                                <span className="text-stone-600 flex-1 truncate">{n.description}</span>
                                <span className="text-stone-500 flex-shrink-0">{fmt(n.amount)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Recent awards with USASpending deep-link so the user can verify / dig deeper. */}
            {recent_awards.length > 0 && !compact && (
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-1.5">Recent contracts</p>
                    <div className="space-y-0.5">
                        {recent_awards.slice(0, 5).map((a, i) => (
                            <a
                                key={i}
                                href={a.internal_id ? `https://www.usaspending.gov/award/${a.internal_id}` : undefined}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 text-[11px] py-1 px-2 rounded hover:bg-stone-50 border-b border-stone-50 last:border-0"
                            >
                                <span className="font-mono text-[10px] text-stone-400 flex-shrink-0">{a.date?.slice(0, 10) || "—"}</span>
                                <span className="truncate flex-1 text-stone-700">{a.agency}</span>
                                <span className="text-emerald-700 font-bold flex-shrink-0">{fmt(a.amount)}</span>
                                {a.internal_id && <ExternalLink className="w-2.5 h-2.5 text-stone-400 flex-shrink-0" />}
                            </a>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
