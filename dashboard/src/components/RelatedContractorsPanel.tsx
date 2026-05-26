"use client";

import { useEffect, useState } from "react";
import { Building2, Trophy, ExternalLink, Loader2, Award } from "lucide-react";

interface Contractor {
    slug: string;
    business_name: string;
    primary_naics: string | null;
    state: string | null;
    city: string | null;
    federal_score: number | null;
    total_awarded_amount: number | null;
    top_agency: string | null;
    badges: string[] | null;
}

function fmtMoney(n: number | null): string {
    const v = Number(n || 0);
    if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
    return `$${v.toFixed(0)}`;
}

/**
 * RelatedContractorsPanel — surfaces real US federal contractors from our
 * directory who match the opportunity context (NAICS / state / keywords).
 *
 * Designed for the opportunity detail page. Particularly valuable on SLED
 * opportunities that don't have a NAICS code (where the existing
 * MarketIntelligence widget can't render).
 *
 * Each card links to the contractor's public profile at
 * www.capturepilot.com/contractors/<slug>.
 */
export function RelatedContractorsPanel({
    naics,
    state,
    keywords,
}: {
    naics?: string | null;
    state?: string | null;
    keywords?: string[] | null;
}) {
    const [contractors, setContractors] = useState<Contractor[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const params = new URLSearchParams();
        if (naics) params.set("naics", naics);
        if (state) params.set("state", state);
        if (keywords && keywords.length > 0) params.set("keywords", keywords.slice(0, 5).join(","));
        params.set("limit", "5");

        // If we have NO filter at all, skip the fetch.
        if (!naics && !state && (!keywords || keywords.length === 0)) {
            setLoading(false);
            return;
        }

        (async () => {
            try {
                const res = await fetch(`/api/intelligence/related-contractors?${params.toString()}`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json() as { contractors?: Contractor[] };
                setContractors(data.contractors || []);
            } catch {
                // soft fail — panel just hides
            } finally {
                setLoading(false);
            }
        })();
    }, [naics, state, keywords]);

    if (loading) {
        return (
            <div className="bg-white border border-stone-200 rounded-2xl p-6 flex justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
            </div>
        );
    }

    if (contractors.length === 0) return null;

    return (
        <div className="bg-white border border-stone-200 rounded-2xl p-5">
            <h3 className="font-bold text-sm flex items-center gap-2 mb-1">
                <Award className="w-4 h-4 text-emerald-600" /> Who wins contracts like this?
                <span className="text-[9px] text-stone-400 uppercase ml-auto">From CapturePilot directory</span>
            </h3>
            <p className="text-xs text-stone-500 mb-4">
                Top federal contractors matched by {naics ? `NAICS ${naics}` : state ? `state ${state}` : "keywords"}.
                Reach out as a teaming partner or pitch yourself as their sub.
            </p>

            <div className="space-y-2">
                {contractors.map((c, i) => (
                    <a
                        key={c.slug}
                        href={`https://www.capturepilot.com/contractors/${c.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center gap-3 p-3 rounded-xl bg-stone-50 hover:bg-emerald-50 border border-transparent hover:border-emerald-200 transition-colors"
                    >
                        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-white border border-stone-200 flex items-center justify-center text-xs font-black text-stone-700">
                            #{i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2 flex-wrap">
                                <p className="font-bold text-sm text-stone-900 truncate group-hover:text-emerald-700">
                                    {c.business_name}
                                </p>
                                {c.federal_score !== null && (
                                    <span className="text-[9px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-200 px-1.5 py-0.5 rounded flex-shrink-0">
                                        {c.federal_score}/100
                                    </span>
                                )}
                            </div>
                            <p className="text-[11px] text-stone-500 truncate">
                                {c.state && <>{c.state}</>}
                                {c.top_agency && (
                                    <>
                                        {c.state && " · "}
                                        <Trophy className="w-2.5 h-2.5 inline" /> {c.top_agency}
                                    </>
                                )}
                            </p>
                        </div>
                        <div className="flex-shrink-0 text-right">
                            <p className="text-sm font-black text-stone-900 tabular-nums">{fmtMoney(c.total_awarded_amount)}</p>
                            <p className="text-[9px] text-stone-400 uppercase">Lifetime</p>
                        </div>
                        <ExternalLink className="w-3.5 h-3.5 text-stone-400 group-hover:text-emerald-600 flex-shrink-0" />
                    </a>
                ))}
            </div>

            <a
                href="https://www.capturepilot.com/contractors"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 text-xs text-emerald-700 font-bold hover:underline inline-flex items-center gap-1"
            >
                Browse 1,200+ federal contractors <ExternalLink className="w-3 h-3" />
            </a>
        </div>
    );
}
