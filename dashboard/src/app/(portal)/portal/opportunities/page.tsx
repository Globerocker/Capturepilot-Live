"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import {
    Briefcase, ExternalLink, Loader2, Clock, MapPin, Star, Layers,
    Search, Shield, Filter, ChevronLeft, ChevronRight, X,
    ArrowUpDown, Calendar,
} from "lucide-react";
import clsx from "clsx";
import { Tooltip } from "@/components/Tooltip";

const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/* ─── Types ─── */

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
        posted_date: string;
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

type SortKey = "score" | "posted_date" | "deadline" | "value";

/* ─── Helpers ─── */

const fmtCurrency = (n: number) => {
    if (!n) return "";
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toLocaleString()}`;
};

const SET_ASIDE_OPTIONS = [
    { value: "", label: "All Set-Asides" },
    { value: "SBA", label: "Small Business" },
    { value: "SDVOSBC", label: "SDVOSB" },
    { value: "WOSB", label: "WOSB" },
    { value: "8A", label: "8(a)" },
    { value: "HZC", label: "HUBZone" },
    { value: "VSA", label: "Veteran-Owned" },
    { value: "EDWOSB", label: "EDWOSB" },
];

const NOTICE_TYPE_OPTIONS = [
    { value: "", label: "All Notice Types" },
    { value: "Sources Sought", label: "Sources Sought" },
    { value: "Presolicitation", label: "Presolicitation" },
    { value: "Solicitation", label: "Solicitation" },
    { value: "Award Notice", label: "Award Notice" },
    { value: "Combined Synopsis/Solicitation", label: "Combined Synopsis" },
    { value: "Special Notice", label: "Special Notice" },
];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
    { value: "score", label: "Match Score" },
    { value: "posted_date", label: "Posted Date" },
    { value: "deadline", label: "Deadline" },
    { value: "value", label: "Estimated Value" },
];

const PAGE_SIZE = 25;

/* ─── Component ─── */

export default function PortalOpportunities() {
    const [matches, setMatches] = useState<Match[]>([]);
    const [loading, setLoading] = useState(true);
    const [profileId, setProfileId] = useState("");
    const [userNaics, setUserNaics] = useState<string[]>([]);
    const [userCerts, setUserCerts] = useState<string[]>([]);
    const [addingToPipeline, setAddingToPipeline] = useState<string | null>(null);

    // Filter state
    const [searchQuery, setSearchQuery] = useState("");
    const [naicsFilter, setNaicsFilter] = useState("");
    const [agencyFilter, setAgencyFilter] = useState("");
    const [setAsideFilter, setSetAsideFilter] = useState("");
    const [noticeTypeFilter, setNoticeTypeFilter] = useState("");
    const [minValue, setMinValue] = useState("");
    const [maxValue, setMaxValue] = useState("");
    const [sortBy, setSortBy] = useState<SortKey>("score");
    const [page, setPage] = useState(1);
    const [filtersOpen, setFiltersOpen] = useState(false);

    /* ─── Load data ─── */
    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: prof } = await supabase
                .from("user_profiles")
                .select("id, sba_certifications, naics_codes, target_states")
                .eq("auth_user_id", user.id)
                .single();
            if (!prof) return;
            setProfileId(prof.id);
            setUserCerts((prof.sba_certifications || []) as string[]);
            setUserNaics((prof.naics_codes || []) as string[]);

            const { data } = await supabase
                .from("user_matches")
                .select(`
                    id, opportunity_id, score, classification, is_saved, score_breakdown,
                    opportunity:opportunities!inner(
                        notice_id, title, agency, notice_type, naics_code,
                        set_aside_code, response_deadline, posted_date,
                        place_of_performance_state,
                        award_amount, estimated_value, status,
                        veteran_relevance_flag, small_business_relevance_flag,
                        wosb_relevance_flag, sources_sought_flag
                    )
                `)
                .eq("user_profile_id", prof.id)
                .gte("score", 0.40)
                .in("opportunity.status", ["ACTIVE", "EXPIRING_SOON", "MARKET_RESEARCH", "DISCOVERED"])
                .order("score", { ascending: false });

            setMatches((data || []) as unknown as Match[]);
            setLoading(false);
        })();
    }, []);

    /* ─── Derived: unique agencies ─── */
    const uniqueAgencies = useMemo(() => {
        const set = new Set<string>();
        matches.forEach(m => {
            const opp = Array.isArray(m.opportunity) ? m.opportunity[0] : m.opportunity;
            if (opp?.agency) set.add(opp.agency);
        });
        return Array.from(set).sort();
    }, [matches]);

    /* ─── Filter + Sort ─── */
    const filtered = useMemo(() => {
        let result = [...matches];

        // Text search
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(m => {
                const opp = Array.isArray(m.opportunity) ? m.opportunity[0] : m.opportunity;
                return (
                    opp?.title?.toLowerCase().includes(q) ||
                    opp?.agency?.toLowerCase().includes(q) ||
                    opp?.naics_code?.includes(q) ||
                    opp?.notice_id?.toLowerCase().includes(q)
                );
            });
        }

        // NAICS filter
        if (naicsFilter) {
            result = result.filter(m => {
                const opp = Array.isArray(m.opportunity) ? m.opportunity[0] : m.opportunity;
                return opp?.naics_code === naicsFilter;
            });
        }

        // Agency filter
        if (agencyFilter) {
            result = result.filter(m => {
                const opp = Array.isArray(m.opportunity) ? m.opportunity[0] : m.opportunity;
                return opp?.agency === agencyFilter;
            });
        }

        // Set-aside filter
        if (setAsideFilter) {
            result = result.filter(m => {
                const opp = Array.isArray(m.opportunity) ? m.opportunity[0] : m.opportunity;
                const sa = (opp?.set_aside_code || "").toUpperCase();
                return sa.includes(setAsideFilter.toUpperCase());
            });
        }

        // Notice type filter
        if (noticeTypeFilter) {
            result = result.filter(m => {
                const opp = Array.isArray(m.opportunity) ? m.opportunity[0] : m.opportunity;
                return opp?.notice_type?.toLowerCase().includes(noticeTypeFilter.toLowerCase());
            });
        }

        // Value range
        if (minValue) {
            const min = parseFloat(minValue);
            if (!isNaN(min)) {
                result = result.filter(m => {
                    const opp = Array.isArray(m.opportunity) ? m.opportunity[0] : m.opportunity;
                    const val = opp?.estimated_value || opp?.award_amount || 0;
                    return val >= min;
                });
            }
        }
        if (maxValue) {
            const max = parseFloat(maxValue);
            if (!isNaN(max)) {
                result = result.filter(m => {
                    const opp = Array.isArray(m.opportunity) ? m.opportunity[0] : m.opportunity;
                    const val = opp?.estimated_value || opp?.award_amount || 0;
                    return val <= max;
                });
            }
        }

        // Sort
        result.sort((a, b) => {
            const oppA = (Array.isArray(a.opportunity) ? a.opportunity[0] : a.opportunity) as Match["opportunity"];
            const oppB = (Array.isArray(b.opportunity) ? b.opportunity[0] : b.opportunity) as Match["opportunity"];
            switch (sortBy) {
                case "score":
                    return b.score - a.score;
                case "posted_date":
                    return new Date(oppB?.posted_date || 0).getTime() - new Date(oppA?.posted_date || 0).getTime();
                case "deadline":
                    return new Date(oppA?.response_deadline || "9999-12-31").getTime() - new Date(oppB?.response_deadline || "9999-12-31").getTime();
                case "value":
                    return (oppB?.estimated_value || oppB?.award_amount || 0) - (oppA?.estimated_value || oppA?.award_amount || 0);
                default:
                    return 0;
            }
        });

        return result;
    }, [matches, searchQuery, naicsFilter, agencyFilter, setAsideFilter, noticeTypeFilter, minValue, maxValue, sortBy]);

    // Pagination
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

    // Reset page on filter change
    useEffect(() => { setPage(1); }, [searchQuery, naicsFilter, agencyFilter, setAsideFilter, noticeTypeFilter, minValue, maxValue, sortBy]);

    /* ─── Actions ─── */
    const toggleSave = async (matchId: string, currentSaved: boolean) => {
        await supabase.from("user_matches").update({ is_saved: !currentSaved }).eq("id", matchId);
        setMatches(prev => prev.map(m => m.id === matchId ? { ...m, is_saved: !currentSaved } : m));
    };

    const addToPipeline = async (m: Match) => {
        if (!profileId) return;
        setAddingToPipeline(m.opportunity_id);
        await supabase.from("user_pursuits").upsert({
            user_profile_id: profileId,
            opportunity_id: m.opportunity_id,
            stage: "discovered",
            priority: m.score >= 0.6 ? "high" : "medium",
        }, { onConflict: "user_profile_id,opportunity_id" });
        setTimeout(() => setAddingToPipeline(null), 1200);
    };

    const hasActiveFilters = naicsFilter || agencyFilter || setAsideFilter || noticeTypeFilter || minValue || maxValue;

    const clearFilters = () => {
        setNaicsFilter("");
        setAgencyFilter("");
        setSetAsideFilter("");
        setNoticeTypeFilter("");
        setMinValue("");
        setMaxValue("");
        setSearchQuery("");
        setSortBy("score");
    };

    /* ─── Render ─── */

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-6 h-6 text-stone-400 animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-5 max-w-full">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold text-black flex items-center gap-2">
                        <Briefcase className="w-6 h-6" /> Opportunities
                    </h1>
                    <p className="text-sm text-stone-500 mt-1">
                        Showing {filtered.length} of {matches.length} opportunities
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setFiltersOpen(!filtersOpen)}
                        className={clsx(
                            "text-xs font-semibold px-3.5 py-2 rounded-xl border transition-colors inline-flex items-center gap-1.5",
                            filtersOpen || hasActiveFilters
                                ? "bg-black text-white border-black"
                                : "bg-white text-stone-600 border-stone-200 hover:border-stone-400"
                        )}
                    >
                        <Filter className="w-3.5 h-3.5" />
                        Filters
                        {hasActiveFilters && (
                            <span className="bg-white/20 text-[10px] px-1.5 py-0.5 rounded-full ml-1">Active</span>
                        )}
                    </button>
                    {hasActiveFilters && (
                        <button
                            type="button"
                            onClick={clearFilters}
                            className="text-xs text-stone-500 hover:text-red-600 px-2 py-2 rounded-xl border border-stone-200 hover:border-red-200 transition-colors inline-flex items-center gap-1"
                        >
                            <X className="w-3 h-3" /> Clear
                        </button>
                    )}
                </div>
            </div>

            {/* Search Bar */}
            <div className="relative">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search by title, agency, or NAICS code..."
                    className="w-full pl-10 pr-4 py-3 border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-black bg-white shadow-sm"
                />
            </div>

            {/* Filters Panel */}
            {filtersOpen && (
                <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {/* NAICS Code */}
                        <div>
                            <label className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1.5 block"><Tooltip text="North American Industry Classification System. 6-digit codes that classify your business services. Government contracts are categorized by NAICS code — matching codes means you're eligible to bid.">NAICS Code</Tooltip></label>
                            <select
                                value={naicsFilter}
                                onChange={e => setNaicsFilter(e.target.value)}
                                aria-label="NAICS Code"
                                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-black bg-white"
                            >
                                <option value="">All NAICS Codes</option>
                                {userNaics.map(code => (
                                    <option key={code} value={code}>{code}</option>
                                ))}
                            </select>
                        </div>

                        {/* Agency */}
                        <div>
                            <label className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1.5 block">Agency</label>
                            <select
                                value={agencyFilter}
                                onChange={e => setAgencyFilter(e.target.value)}
                                aria-label="Agency"
                                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-black bg-white"
                            >
                                <option value="">All Agencies</option>
                                {uniqueAgencies.map(ag => (
                                    <option key={ag} value={ag}>{ag}</option>
                                ))}
                            </select>
                        </div>

                        {/* Set-Aside */}
                        <div>
                            <label className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1.5 block"><Tooltip text="Contracts reserved for specific business categories (veteran-owned, women-owned, small business, etc.). Less competition than full and open contracts.">Set-Aside</Tooltip></label>
                            <select
                                value={setAsideFilter}
                                onChange={e => setSetAsideFilter(e.target.value)}
                                aria-label="Set-Aside"
                                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-black bg-white"
                            >
                                {SET_ASIDE_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Notice Type */}
                        <div>
                            <label className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1.5 block"><Tooltip text="The type of notice on SAM.gov. Sources Sought = market research (best time to engage). Presolicitation = coming soon. Solicitation = active bid opportunity.">Notice Type</Tooltip></label>
                            <select
                                value={noticeTypeFilter}
                                onChange={e => setNoticeTypeFilter(e.target.value)}
                                aria-label="Notice Type"
                                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-black bg-white"
                            >
                                {NOTICE_TYPE_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Value Range */}
                        <div>
                            <label className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1.5 block">Min Value ($)</label>
                            <input
                                type="number"
                                value={minValue}
                                onChange={e => setMinValue(e.target.value)}
                                placeholder="e.g. 100000"
                                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-black bg-white"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1.5 block">Max Value ($)</label>
                            <input
                                type="number"
                                value={maxValue}
                                onChange={e => setMaxValue(e.target.value)}
                                placeholder="e.g. 5000000"
                                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-black bg-white"
                            />
                        </div>
                    </div>

                    {/* Sort */}
                    <div className="flex items-center gap-3 pt-2 border-t border-stone-100">
                        <ArrowUpDown className="w-3.5 h-3.5 text-stone-400" />
                        <span className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Sort by</span>
                        <div className="flex gap-1.5">
                            {SORT_OPTIONS.map(opt => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => setSortBy(opt.value)}
                                    className={clsx(
                                        "text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors",
                                        sortBy === opt.value
                                            ? "bg-black text-white border-black"
                                            : "bg-white text-stone-500 border-stone-200 hover:border-stone-400"
                                    )}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Results */}
            {filtered.length === 0 ? (
                <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center">
                    <Filter className="w-8 h-8 text-stone-300 mx-auto mb-3" />
                    <p className="text-stone-500 text-sm font-medium">
                        {searchQuery || hasActiveFilters
                            ? "No opportunities match your filters."
                            : "No opportunities found."}
                    </p>
                    {(searchQuery || hasActiveFilters) && (
                        <button
                            type="button"
                            onClick={clearFilters}
                            className="mt-3 text-xs text-blue-600 hover:text-blue-800 underline"
                        >
                            Clear all filters
                        </button>
                    )}
                </div>
            ) : (
                <>
                    <div className="space-y-3">
                        {paginated.map((m) => {
                            const opp = (Array.isArray(m.opportunity) ? m.opportunity[0] : m.opportunity) as Match["opportunity"];
                            if (!opp) return null;
                            const samUrl = `https://sam.gov/opp/${opp.notice_id}/view`;
                            const isPastDeadline = opp.response_deadline && new Date(opp.response_deadline) < new Date();
                            const daysLeft = opp.response_deadline
                                ? Math.ceil((new Date(opp.response_deadline).getTime() - Date.now()) / 86400000)
                                : null;
                            const value = opp.estimated_value || opp.award_amount;
                            const postedDate = opp.posted_date ? new Date(opp.posted_date).toLocaleDateString() : null;

                            // Score bar width
                            const scorePercent = Math.min(Math.round(m.score * 100), 100);

                            // Set-aside classification
                            const sa = (opp.set_aside_code || "").toLowerCase();
                            const isOpen = !sa || sa.includes("none") || sa.includes("full and open");
                            const certsLower = userCerts.map(c => c.toLowerCase());
                            const isEligible = isOpen || (
                                (sa.includes("8(a)") && certsLower.some(c => c.includes("8(a)") || c.includes("8a"))) ||
                                (sa.includes("sdvosb") && certsLower.some(c => c.includes("sdvosb"))) ||
                                (sa.includes("wosb") && certsLower.some(c => c.includes("wosb") || c.includes("edwosb"))) ||
                                (sa.includes("hubzone") && certsLower.some(c => c.includes("hubzone"))) ||
                                (sa.includes("vosb") && certsLower.some(c => c.includes("vosb"))) ||
                                (sa.includes("small business") && userCerts.length > 0)
                            );

                            const pipelineAdded = addingToPipeline === m.opportunity_id;

                            return (
                                <div
                                    key={m.id}
                                    className={clsx(
                                        "bg-white border rounded-2xl p-5 transition-all hover:shadow-md",
                                        m.is_saved ? "border-amber-200" : "border-stone-200"
                                    )}
                                >
                                    <div className="flex items-start gap-4">
                                        {/* Score Badge */}
                                        <div className="flex flex-col items-center flex-shrink-0 gap-1.5">
                                            <div
                                                className={clsx(
                                                    "w-14 h-14 rounded-xl border-2 font-black text-base flex items-center justify-center",
                                                    m.score >= 0.70 ? "text-emerald-600 bg-emerald-50 border-emerald-200" :
                                                    m.score >= 0.55 ? "text-amber-600 bg-amber-50 border-amber-200" :
                                                    "text-blue-600 bg-blue-50 border-blue-200"
                                                )}
                                            >
                                                {Math.round(m.score * 100)}<span className="text-[8px] font-medium opacity-60">/100</span>
                                            </div>
                                            <Tooltip text="HOT = strong match across NAICS, location, and eligibility. WARM = good potential but some factors don't align perfectly. COLD = worth monitoring but may not be a strong fit." icon={false}>
                                                <span
                                                    className={clsx(
                                                        "text-[9px] font-bold px-2 py-0.5 rounded uppercase border cursor-help",
                                                        m.classification === "HOT" ? "bg-red-50 text-red-600 border-red-200" :
                                                        m.classification === "WARM" ? "bg-amber-50 text-amber-600 border-amber-200" :
                                                        "bg-blue-50 text-blue-600 border-blue-200"
                                                    )}
                                                >
                                                    {m.classification}
                                                </span>
                                            </Tooltip>
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            {/* Badges row */}
                                            <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                                                {opp.naics_code && (
                                                    <Tooltip text="North American Industry Classification System. 6-digit codes that classify your business services. Matching codes means you're eligible to bid." icon={false}>
                                                        <span className="text-[9px] font-bold bg-stone-100 text-stone-600 border border-stone-200 px-2 py-0.5 rounded font-mono cursor-help">
                                                            NAICS {opp.naics_code}
                                                        </span>
                                                    </Tooltip>
                                                )}
                                                {opp.set_aside_code && !opp.set_aside_code.toLowerCase().includes("none") && (
                                                    <span
                                                        className={clsx(
                                                            "text-[9px] font-bold px-2 py-0.5 rounded uppercase border",
                                                            sa.includes("sdvosb") ? "bg-emerald-50 text-emerald-600 border-emerald-200" :
                                                            sa.includes("8(a)") || sa.includes("8a") ? "bg-violet-50 text-violet-600 border-violet-200" :
                                                            sa.includes("wosb") || sa.includes("edwosb") ? "bg-pink-50 text-pink-600 border-pink-200" :
                                                            sa.includes("hubzone") ? "bg-cyan-50 text-cyan-600 border-cyan-200" :
                                                            "bg-blue-50 text-blue-600 border-blue-200"
                                                        )}
                                                    >
                                                        {opp.set_aside_code.substring(0, 30)}
                                                    </span>
                                                )}
                                                {opp.notice_type && (
                                                    <span
                                                        className={clsx(
                                                            "text-[9px] font-bold px-2 py-0.5 rounded border",
                                                            opp.notice_type.toLowerCase().includes("sources sought")
                                                                ? "bg-violet-50 text-violet-600 border-violet-200"
                                                                : opp.notice_type.toLowerCase().includes("presolicitation")
                                                                    ? "bg-amber-50 text-amber-600 border-amber-200"
                                                                    : opp.notice_type.toLowerCase().includes("award")
                                                                        ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                                                                        : "bg-stone-50 text-stone-500 border-stone-200"
                                                        )}
                                                    >
                                                        {opp.notice_type}
                                                    </span>
                                                )}
                                                {opp.veteran_relevance_flag && (
                                                    <span className="text-[9px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200 px-1.5 py-0.5 rounded inline-flex items-center gap-0.5">
                                                        <Shield className="w-3 h-3" /> VET
                                                    </span>
                                                )}
                                                {opp.wosb_relevance_flag && (
                                                    <span className="text-[9px] font-bold bg-pink-50 text-pink-600 border border-pink-200 px-1.5 py-0.5 rounded">WOSB</span>
                                                )}
                                                {value > 0 && (
                                                    <span className="text-[9px] font-bold bg-stone-100 text-stone-600 border border-stone-200 px-2 py-0.5 rounded">
                                                        {fmtCurrency(value)}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Title */}
                                            <Link
                                                href={`/portal/opportunities/${m.opportunity_id}`}
                                                className="font-bold text-sm text-black line-clamp-2 hover:text-blue-700 hover:underline"
                                            >
                                                {opp.title}
                                            </Link>

                                            {/* Agency */}
                                            <p className="text-xs text-stone-500 mt-0.5">{opp.agency || "Federal Agency"}</p>

                                            {/* Meta row */}
                                            <div className="flex items-center gap-4 mt-2 flex-wrap">
                                                {postedDate && (
                                                    <span className="text-xs text-stone-400 inline-flex items-center gap-1">
                                                        <Calendar className="w-3 h-3" /> Posted {postedDate}
                                                    </span>
                                                )}
                                                {opp.place_of_performance_state && (
                                                    <span className="text-xs text-stone-400 inline-flex items-center gap-0.5">
                                                        <MapPin className="w-3 h-3" />{opp.place_of_performance_state}
                                                    </span>
                                                )}
                                                {daysLeft !== null && (
                                                    <span
                                                        className={clsx(
                                                            "text-xs inline-flex items-center gap-1 font-semibold",
                                                            isPastDeadline ? "text-red-500" :
                                                            daysLeft <= 7 ? "text-red-600" :
                                                            daysLeft <= 14 ? "text-amber-600" : "text-stone-400"
                                                        )}
                                                    >
                                                        <Clock className="w-3 h-3" />
                                                        {isPastDeadline
                                                            ? "Expired"
                                                            : `${daysLeft}d left`
                                                        }
                                                    </span>
                                                )}
                                                {isOpen
                                                    ? <span className="text-[9px] font-bold bg-stone-50 text-stone-500 border border-stone-200 px-1.5 py-0.5 rounded">Open Competition</span>
                                                    : isEligible
                                                        ? <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded">Eligible</span>
                                                        : <span className="text-[9px] font-bold bg-red-50 text-red-500 border border-red-200 px-1.5 py-0.5 rounded">Cert Needed</span>
                                                }
                                            </div>

                                            {/* Score bar */}
                                            <div className="mt-2.5 flex items-center gap-2">
                                                <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                                                    <div
                                                        className={clsx(
                                                            "h-full rounded-full transition-all",
                                                            m.score >= 0.70 ? "bg-emerald-500" :
                                                            m.score >= 0.55 ? "bg-amber-500" :
                                                            "bg-blue-500"
                                                        )}
                                                        style={{ width: `${scorePercent}%` }}
                                                    />
                                                </div>
                                                <span className="text-[10px] text-stone-400 font-mono w-8 text-right">{scorePercent}%</span>
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex flex-col items-center gap-2 flex-shrink-0 ml-auto">
                                            <button
                                                type="button"
                                                onClick={() => addToPipeline(m)}
                                                title="Add to Pipeline"
                                                className={clsx(
                                                    "p-2.5 rounded-xl transition-colors border",
                                                    pipelineAdded
                                                        ? "text-emerald-600 bg-emerald-50 border-emerald-200"
                                                        : "text-stone-300 hover:text-emerald-600 hover:bg-emerald-50 border-transparent hover:border-emerald-200"
                                                )}
                                            >
                                                <Layers className="w-4 h-4" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => toggleSave(m.id, m.is_saved)}
                                                title={m.is_saved ? "Unsave" : "Save"}
                                                className={clsx(
                                                    "p-2.5 rounded-xl transition-colors border",
                                                    m.is_saved
                                                        ? "text-amber-500 bg-amber-50 border-amber-200"
                                                        : "text-stone-300 hover:text-amber-500 hover:bg-amber-50 border-transparent hover:border-amber-200"
                                                )}
                                            >
                                                <Star className={clsx("w-4 h-4", m.is_saved && "fill-amber-500")} />
                                            </button>
                                            <a
                                                href={samUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                title="View on SAM.gov"
                                                className="p-2.5 rounded-xl text-stone-300 hover:text-blue-600 hover:bg-blue-50 transition-colors border border-transparent hover:border-blue-200"
                                            >
                                                <ExternalLink className="w-4 h-4" />
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between pt-4 border-t border-stone-100">
                            <p className="text-xs text-stone-400">
                                Page {safePage} of {totalPages} ({filtered.length} results)
                            </p>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setPage(Math.max(1, safePage - 1))}
                                    disabled={safePage <= 1}
                                    className={clsx(
                                        "inline-flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-lg border transition-colors",
                                        safePage <= 1
                                            ? "text-stone-300 border-stone-100 cursor-not-allowed"
                                            : "text-stone-600 border-stone-200 hover:border-stone-400 hover:bg-stone-50"
                                    )}
                                >
                                    <ChevronLeft className="w-3.5 h-3.5" /> Previous
                                </button>
                                <div className="flex items-center gap-1">
                                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                                        let pageNum: number;
                                        if (totalPages <= 5) {
                                            pageNum = i + 1;
                                        } else if (safePage <= 3) {
                                            pageNum = i + 1;
                                        } else if (safePage >= totalPages - 2) {
                                            pageNum = totalPages - 4 + i;
                                        } else {
                                            pageNum = safePage - 2 + i;
                                        }
                                        return (
                                            <button
                                                key={pageNum}
                                                type="button"
                                                onClick={() => setPage(pageNum)}
                                                className={clsx(
                                                    "w-8 h-8 rounded-lg text-xs font-semibold transition-colors",
                                                    pageNum === safePage
                                                        ? "bg-black text-white"
                                                        : "text-stone-500 hover:bg-stone-100"
                                                )}
                                            >
                                                {pageNum}
                                            </button>
                                        );
                                    })}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setPage(Math.min(totalPages, safePage + 1))}
                                    disabled={safePage >= totalPages}
                                    className={clsx(
                                        "inline-flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-lg border transition-colors",
                                        safePage >= totalPages
                                            ? "text-stone-300 border-stone-100 cursor-not-allowed"
                                            : "text-stone-600 border-stone-200 hover:border-stone-400 hover:bg-stone-50"
                                    )}
                                >
                                    Next <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
