"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import {
    Briefcase, ExternalLink, Loader2, Clock, MapPin, Star, Layers,
    Filter, Search, ChevronDown, Shield, TrendingUp,
} from "lucide-react";
import clsx from "clsx";

const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Match {
    id: string;
    opportunity_id: string;
    score: number;
    classification: string;
    is_saved: boolean;
    score_breakdown: Record<string, number> | null;
    opportunity: {
        notice_id: string;
        title: string;
        agency: string;
        notice_type: string;
        naics_code: string;
        set_aside_code: string;
        response_deadline: string;
        place_of_performance_state: string;
        award_amount: number;
        estimated_value: number;
        status: string;
        veteran_relevance_flag: boolean;
        small_business_relevance_flag: boolean;
        wosb_relevance_flag: boolean;
        sources_sought_flag: boolean;
    };
}

type FilterType = "all" | "hot" | "warm" | "saved" | "active" | "sources_sought" | "veteran" | "small_biz";

export default function PortalOpportunities() {
    const [matches, setMatches] = useState<Match[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<FilterType>("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [showFilters, setShowFilters] = useState(false);
    const [profileId, setProfileId] = useState("");

    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: prof } = await supabase
                .from("user_profiles")
                .select("id")
                .eq("auth_user_id", user.id)
                .single();
            if (!prof) return;
            setProfileId(prof.id);

            const { data } = await supabase
                .from("user_matches")
                .select(`
                    id, opportunity_id, score, classification, is_saved, score_breakdown,
                    opportunity:opportunities!inner(
                        notice_id, title, agency, notice_type, naics_code,
                        set_aside_code, response_deadline, place_of_performance_state,
                        award_amount, estimated_value, status,
                        veteran_relevance_flag, small_business_relevance_flag,
                        wosb_relevance_flag, sources_sought_flag
                    )
                `)
                .eq("user_profile_id", prof.id)
                .in("opportunity.status", ["ACTIVE", "EXPIRING_SOON", "MARKET_RESEARCH", "DISCOVERED"])
                .order("score", { ascending: false })
                .limit(200);

            setMatches((data || []) as unknown as Match[]);
            setLoading(false);
        })();
    }, []);

    const toggleSave = async (matchId: string, currentSaved: boolean) => {
        await supabase.from("user_matches").update({ is_saved: !currentSaved }).eq("id", matchId);
        setMatches(prev => prev.map(m => m.id === matchId ? { ...m, is_saved: !currentSaved } : m));
    };

    if (loading) {
        return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 text-stone-400 animate-spin" /></div>;
    }

    const fmtCurrency = (n: number) => {
        if (!n) return "";
        if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
        if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
        return `$${n.toLocaleString()}`;
    };

    // Apply filters
    let filtered = matches;
    if (filter === "hot") filtered = matches.filter(m => m.classification === "HOT");
    if (filter === "warm") filtered = matches.filter(m => m.classification === "WARM" || m.classification === "HOT");
    if (filter === "saved") filtered = matches.filter(m => m.is_saved);
    if (filter === "active") filtered = matches.filter(m => {
        const opp = Array.isArray(m.opportunity) ? m.opportunity[0] : m.opportunity;
        return opp?.status === "ACTIVE" || opp?.status === "EXPIRING_SOON";
    });
    if (filter === "sources_sought") filtered = matches.filter(m => {
        const opp = Array.isArray(m.opportunity) ? m.opportunity[0] : m.opportunity;
        return opp?.sources_sought_flag;
    });
    if (filter === "veteran") filtered = matches.filter(m => {
        const opp = Array.isArray(m.opportunity) ? m.opportunity[0] : m.opportunity;
        return opp?.veteran_relevance_flag;
    });
    if (filter === "small_biz") filtered = matches.filter(m => {
        const opp = Array.isArray(m.opportunity) ? m.opportunity[0] : m.opportunity;
        return opp?.small_business_relevance_flag;
    });

    // Search
    if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(m => {
            const opp = Array.isArray(m.opportunity) ? m.opportunity[0] : m.opportunity;
            return opp?.title?.toLowerCase().includes(q) || opp?.agency?.toLowerCase().includes(q) || opp?.naics_code?.includes(q);
        });
    }

    const filterButtons: { key: FilterType; label: string; count?: number }[] = [
        { key: "all", label: "All", count: matches.length },
        { key: "saved", label: "Saved", count: matches.filter(m => m.is_saved).length },
        { key: "active", label: "Active" },
        { key: "sources_sought", label: "Sources Sought" },
        { key: "veteran", label: "Veteran" },
        { key: "small_biz", label: "Small Biz" },
    ];

    return (
        <div className="max-w-5xl space-y-5">
            <div>
                <h1 className="text-2xl font-bold text-black font-typewriter flex items-center gap-2">
                    <Briefcase className="w-6 h-6" /> Your Matches
                </h1>
                <p className="text-sm text-stone-500 mt-1">
                    {filtered.length} matches found — showing best results for your profile
                </p>
            </div>

            {/* Search + Filters */}
            <div className="space-y-3">
                <div className="flex gap-2">
                    <div className="flex-1 relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                        <input
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Search by title, agency, or NAICS..."
                            className="w-full pl-9 pr-3 py-2.5 border border-stone-300 rounded-xl text-sm focus:outline-none focus:border-black"
                        />
                    </div>
                    <button type="button" onClick={() => setShowFilters(!showFilters)}
                        className="border border-stone-300 rounded-xl px-3 py-2 text-sm inline-flex items-center gap-1.5 hover:bg-stone-50">
                        <Filter className="w-4 h-4" /> Filters <ChevronDown className={clsx("w-3 h-3 transition-transform", showFilters && "rotate-180")} />
                    </button>
                </div>

                {showFilters && (
                    <div className="flex flex-wrap gap-2">
                        {filterButtons.map(fb => (
                            <button key={fb.key} type="button" onClick={() => setFilter(fb.key)}
                                className={clsx("text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors",
                                    filter === fb.key ? "bg-black text-white border-black" : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50"
                                )}>
                                {fb.label} {fb.count !== undefined && `(${fb.count})`}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Results */}
            {filtered.length === 0 && (
                <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center">
                    <p className="text-stone-500 text-sm">
                        {searchQuery ? "No matches found for your search." : "No opportunities match this filter."}
                    </p>
                </div>
            )}

            <div className="space-y-3">
                {filtered.map((m) => {
                    const opp = (Array.isArray(m.opportunity) ? m.opportunity[0] : m.opportunity) as Match["opportunity"];
                    if (!opp) return null;
                    const samUrl = `https://sam.gov/opp/${opp.notice_id}/view`;
                    const isPastDeadline = opp.response_deadline && new Date(opp.response_deadline) < new Date();
                    const daysLeft = opp.response_deadline ? Math.ceil((new Date(opp.response_deadline).getTime() - Date.now()) / 86400000) : null;
                    const value = opp.estimated_value || opp.award_amount;

                    return (
                        <div key={m.id} className={clsx("bg-white border rounded-2xl p-5 transition-all",
                            m.is_saved ? "border-amber-200 bg-amber-50/20" : "border-stone-200"
                        )}>
                            <div className="flex items-start gap-3">
                                {/* Score */}
                                <div className={clsx(
                                    "w-12 h-12 rounded-xl border-2 font-black text-sm flex items-center justify-center flex-shrink-0",
                                    m.score >= 0.70 ? "text-emerald-600 bg-emerald-50 border-emerald-200" :
                                    m.score >= 0.50 ? "text-amber-600 bg-amber-50 border-amber-200" :
                                    "text-blue-600 bg-blue-50 border-blue-200"
                                )}>
                                    {Math.round(m.score * 100)}
                                </div>

                                <div className="flex-1 min-w-0">
                                    {/* Badges */}
                                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                        <span className={clsx(
                                            "text-[9px] font-bold px-2 py-0.5 rounded uppercase border",
                                            m.classification === "HOT" ? "bg-red-50 text-red-600 border-red-200" :
                                            m.classification === "WARM" ? "bg-amber-50 text-amber-600 border-amber-200" :
                                            "bg-blue-50 text-blue-600 border-blue-200"
                                        )}>{m.classification}</span>
                                        {opp.set_aside_code && !opp.set_aside_code.toLowerCase().includes("none") && (
                                            <span className="text-[9px] font-bold bg-blue-100 text-blue-600 border border-blue-200 px-2 py-0.5 rounded uppercase">{opp.set_aside_code.substring(0, 30)}</span>
                                        )}
                                        {opp.veteran_relevance_flag && <span className="text-[9px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200 px-1.5 py-0.5 rounded"><Shield className="w-3 h-3 inline" /> VET</span>}
                                        {opp.wosb_relevance_flag && <span className="text-[9px] font-bold bg-pink-50 text-pink-600 border border-pink-200 px-1.5 py-0.5 rounded">WOSB</span>}
                                        {opp.sources_sought_flag && <span className="text-[9px] font-bold bg-violet-50 text-violet-600 border border-violet-200 px-1.5 py-0.5 rounded"><TrendingUp className="w-3 h-3 inline" /> EARLY</span>}
                                        {value > 0 && <span className="text-[9px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-0.5 rounded">{fmtCurrency(value)}</span>}
                                    </div>

                                    {/* Title + Agency */}
                                    <Link href={`/portal/opportunities/${m.opportunity_id}`} className="font-bold text-sm text-black line-clamp-2 hover:underline">{opp.title}</Link>
                                    <p className="text-xs text-stone-500 mt-0.5">{opp.agency || "Federal Agency"}</p>

                                    {/* Meta */}
                                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                                        {opp.notice_type && <span className="text-xs text-stone-400">{opp.notice_type}</span>}
                                        {opp.naics_code && <span className="text-xs text-stone-400">NAICS: {opp.naics_code}</span>}
                                        {opp.place_of_performance_state && (
                                            <span className="text-xs text-stone-400 inline-flex items-center gap-0.5"><MapPin className="w-3 h-3" />{opp.place_of_performance_state}</span>
                                        )}
                                        {daysLeft !== null && (
                                            <span className={clsx("text-xs inline-flex items-center gap-0.5 font-medium",
                                                isPastDeadline ? "text-red-500" : daysLeft <= 7 ? "text-red-600" : daysLeft <= 14 ? "text-amber-600" : "text-stone-400"
                                            )}>
                                                <Clock className="w-3 h-3" />
                                                {isPastDeadline ? "Expired" : `${daysLeft}d left`}
                                            </span>
                                        )}
                                    </div>

                                    {/* Score Breakdown — why this matched */}
                                    {m.score_breakdown && Object.keys(m.score_breakdown).length > 0 && (
                                        <div className="flex gap-1 flex-wrap mt-1.5">
                                            {Object.entries(m.score_breakdown).map(([key, val]) => (
                                                <span key={key} className={clsx(
                                                    "text-[9px] font-mono px-1.5 py-0.5 rounded border",
                                                    val >= 0.7 ? "bg-emerald-50 text-emerald-600 border-emerald-200" :
                                                    val >= 0.4 ? "bg-amber-50 text-amber-600 border-amber-200" :
                                                    "bg-stone-50 text-stone-400 border-stone-200"
                                                )}>
                                                    {key}: {Math.round(val * 100)}%
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className="flex flex-col items-center gap-2 flex-shrink-0">
                                    <button type="button" onClick={async () => {
                                        if (!profileId) return;
                                        await supabase.from("user_pursuits").upsert({
                                            user_profile_id: profileId,
                                            opportunity_id: m.opportunity_id,
                                            stage: "discovered",
                                            priority: m.score >= 0.6 ? "high" : "medium",
                                        }, { onConflict: "user_profile_id,opportunity_id" });
                                        toggleSave(m.id, false); // also save it
                                    }}
                                        title="Add to Pipeline"
                                        className="p-2 rounded-lg text-stone-300 hover:text-emerald-600 hover:bg-emerald-50 transition-colors">
                                        <Layers className="w-4 h-4" />
                                    </button>
                                    <button type="button" onClick={() => toggleSave(m.id, m.is_saved)}
                                        title={m.is_saved ? "Unsave" : "Save"}
                                        className={clsx("p-2 rounded-lg transition-colors",
                                            m.is_saved ? "text-amber-500 bg-amber-50" : "text-stone-300 hover:text-amber-500 hover:bg-amber-50"
                                        )}>
                                        <Star className={clsx("w-4 h-4", m.is_saved && "fill-amber-500")} />
                                    </button>
                                    <a href={samUrl} target="_blank" rel="noopener noreferrer"
                                        title="View on SAM.gov"
                                        className="p-2 rounded-lg text-stone-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                                        <ExternalLink className="w-4 h-4" />
                                    </a>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
