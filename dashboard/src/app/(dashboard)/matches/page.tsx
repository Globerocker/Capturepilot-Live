"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/client";
import { Loader2, Zap, Search, X, ChevronLeft, ChevronRight, Trophy, Clock, Shield, Target, ArrowRight, Bookmark, EyeOff, Flame, ChevronUp, ChevronDown, Filter, CheckCircle2 } from "lucide-react";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { createPursuit } from "@/lib/pursue-utils";
import clsx from "clsx";
import Link from "next/link";

const supabase = createSupabaseClient();

interface UserMatch {
    id: string;
    score: number;
    classification: string;
    score_breakdown: Record<string, number> | null;
    is_saved: boolean;
    is_dismissed: boolean;
    opportunities: {
        id: string;
        title: string;
        agency: string;
        naics_code: string;
        notice_type: string;
        response_deadline: string;
        set_aside_code: string;
        place_of_performance_state: string;
        award_amount: number | null;
    };
}

export default function MyMatchesPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [matches, setMatches] = useState<UserMatch[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [profileId, setProfileId] = useState<string | null>(null);
    const [searchInput, setSearchInput] = useState("");
    const [activeSearch, setActiveSearch] = useState("");
    const [page, setPage] = useState(1);
    const [filter, setFilter] = useState<"ALL" | "HOT" | "WARM" | "SAVED">("ALL");
    const [sortBy, setSortBy] = useState<"score" | "deadline" | "agency" | "notice_type">("score");
    const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
    const [showFilters, setShowFilters] = useState(false);
    const [filterNoticeType, setFilterNoticeType] = useState("");
    const [filterSetAside, setFilterSetAside] = useState("");
    const [filterState, setFilterState] = useState("");
    const [pursuingIds, setPursuingIds] = useState<Set<string>>(new Set());
    const [pursuedIds, setPursuedIds] = useState<Set<string>>(new Set());
    const [generatingMatches, setGeneratingMatches] = useState(false);
    const pageSize = 25;

    useEffect(() => {
        async function loadProfile() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { router.push("/login"); return; }

            const { data: profile } = await supabase
                .from("user_profiles")
                .select("id")
                .eq("auth_user_id", user.id)
                .single();

            if (!profile) { router.push("/onboard"); return; }
            setProfileId((profile as Record<string, unknown>).id as string);
        }
        loadProfile();
    }, [router]);

    const fetchMatches = useCallback(async () => {
        if (!profileId) { setLoading(false); return; }
        setLoading(true);

        let query = supabase
            .from("user_matches")
            .select(
                "id, score, classification, score_breakdown, is_saved, is_dismissed, " +
                "opportunities(id, title, agency, naics_code, notice_type, response_deadline, set_aside_code, place_of_performance_state, award_amount)",
                { count: "exact" }
            )
            .eq("user_profile_id", profileId)
            .eq("is_dismissed", false);

        if (filter === "HOT") {
            query = query.eq("classification", "HOT");
        } else if (filter === "WARM") {
            query = query.eq("classification", "WARM");
        } else if (filter === "SAVED") {
            query = query.eq("is_saved", true);
        }

        query = query.order("score", { ascending: false });

        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        const { data, count } = await query.range(from, to);

        // Filter by search client-side (Supabase can't search joined fields easily)
        let filtered = (data || []) as unknown as UserMatch[];
        if (activeSearch) {
            const s = activeSearch.toLowerCase();
            filtered = filtered.filter(m =>
                m.opportunities?.title?.toLowerCase().includes(s) ||
                m.opportunities?.agency?.toLowerCase().includes(s)
            );
        }

        // Advanced filters (client-side on joined fields)
        if (filterNoticeType) {
            filtered = filtered.filter(m => m.opportunities?.notice_type === filterNoticeType);
        }
        if (filterSetAside) {
            filtered = filtered.filter(m => m.opportunities?.set_aside_code?.includes(filterSetAside));
        }
        if (filterState) {
            filtered = filtered.filter(m => m.opportunities?.place_of_performance_state === filterState);
        }

        // Client-side sorting
        if (sortBy !== "score") {
            filtered.sort((a, b) => {
                let aVal = "";
                let bVal = "";
                if (sortBy === "deadline") {
                    aVal = a.opportunities?.response_deadline || "9999";
                    bVal = b.opportunities?.response_deadline || "9999";
                } else if (sortBy === "agency") {
                    aVal = a.opportunities?.agency || "";
                    bVal = b.opportunities?.agency || "";
                } else if (sortBy === "notice_type") {
                    aVal = a.opportunities?.notice_type || "";
                    bVal = b.opportunities?.notice_type || "";
                }
                const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
                return sortDirection === "asc" ? cmp : -cmp;
            });
        } else if (sortDirection === "asc") {
            filtered.reverse();
        }

        setMatches(filtered);
        setTotalCount(activeSearch || filterNoticeType || filterSetAside || filterState ? filtered.length : (count || 0));
        setLoading(false);
    }, [profileId, page, activeSearch, filter, sortBy, sortDirection, filterNoticeType, filterSetAside, filterState]);

    useEffect(() => {
        if (profileId) fetchMatches();
    }, [fetchMatches, profileId]);

    const toggleSave = async (matchId: string, currentlySaved: boolean) => {
        await supabase.from("user_matches").update({ is_saved: !currentlySaved }).eq("id", matchId);
        setMatches(prev => prev.map(m => m.id === matchId ? { ...m, is_saved: !currentlySaved } : m));
    };

    const dismissMatch = async (matchId: string) => {
        await supabase.from("user_matches").update({ is_dismissed: true }).eq("id", matchId);
        setMatches(prev => prev.filter(m => m.id !== matchId));
        setTotalCount(prev => prev - 1);
    };

    const handlePursue = async (oppId: string, noticeType: string) => {
        if (!profileId || pursuingIds.has(oppId) || pursuedIds.has(oppId)) return;
        setPursuingIds(prev => new Set(prev).add(oppId));
        const result = await createPursuit(oppId, noticeType, profileId);
        setPursuingIds(prev => { const n = new Set(prev); n.delete(oppId); return n; });
        if (result.success) {
            setPursuedIds(prev => new Set(prev).add(oppId));
        }
    };

    const handleGenerateMatches = async () => {
        setGeneratingMatches(true);
        try {
            await fetch("/api/matches/refresh", { method: "POST" });
            await fetchMatches();
        } catch { /* ignore */ }
        setGeneratingMatches(false);
    };

    const totalPages = Math.ceil(totalCount / pageSize);

    const getNoticeColor = (type: string) => {
        if (!type) return "bg-stone-100 text-stone-500 border-stone-200";
        if (type.includes("Sources Sought")) return "bg-emerald-50 text-emerald-600 border-emerald-200";
        if (type.includes("Presolicitation")) return "bg-blue-50 text-blue-600 border-blue-200";
        if (type.includes("Solicitation") || type.includes("Combined")) return "bg-amber-50 text-amber-600 border-amber-200";
        return "bg-stone-100 text-stone-500 border-stone-200";
    };

    const getScoreColor = (score: number) => {
        if (score >= 0.70) return "text-emerald-600 bg-emerald-50 border-emerald-200";
        if (score >= 0.50) return "text-amber-600 bg-amber-50 border-amber-200";
        return "text-stone-500 bg-stone-50 border-stone-200";
    };

    if (loading && matches.length === 0) {
        return (
            <div className="flex justify-center items-center min-h-[400px]">
                <Loader2 className="w-10 h-10 animate-spin text-stone-400" />
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto pb-12 animate-in fade-in duration-500 px-1">
            <header className="mb-6">
                <h2 className="text-2xl sm:text-3xl font-bold font-typewriter tracking-tighter text-black flex items-center">
                    <Zap className="mr-2 sm:mr-3 w-6 h-6 sm:w-8 sm:h-8" /> My Matches
                    <span className="ml-3 text-sm font-sans font-medium bg-stone-100 px-3 py-1 rounded-full text-stone-500 border border-stone-200">
                        {totalCount.toLocaleString()}
                    </span>
                </h2>
                <p className="text-stone-500 mt-1 font-medium text-sm">
                    Opportunities scored and ranked based on your complete profile
                    <InfoTooltip text="Scores combine NAICS match, certifications, geography, past performance, contract value fit, and more. HOT = 70%+ alignment. WARM = 50-69%." />
                </p>
            </header>

            {/* Filter Tabs */}
            <section className="flex flex-wrap gap-2 mb-4">
                {([
                    { key: "ALL" as const, label: "All Matches", icon: Target },
                    { key: "HOT" as const, label: "HOT", icon: Flame },
                    { key: "WARM" as const, label: "WARM", icon: Trophy },
                    { key: "SAVED" as const, label: "Saved", icon: Bookmark },
                ]).map(tab => (
                    <button
                        type="button"
                        key={tab.key}
                        onClick={() => { setFilter(tab.key); setPage(1); }}
                        className={clsx(
                            "text-xs font-bold font-typewriter uppercase tracking-widest px-3 sm:px-4 py-2 rounded-full transition-all shadow-sm border flex items-center",
                            filter === tab.key ? "bg-black text-white border-black" : "bg-white text-stone-600 border-stone-200 hover:bg-stone-100 active:bg-stone-200"
                        )}
                    >
                        <tab.icon className="w-3 h-3 mr-1.5" />
                        {tab.label}
                    </button>
                ))}
            </section>

            {/* Sort Bar */}
            <section className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mr-1">Sort by</span>
                {([
                    { key: "score" as const, label: "Score" },
                    { key: "deadline" as const, label: "Deadline" },
                    { key: "agency" as const, label: "Agency" },
                    { key: "notice_type" as const, label: "Type" },
                ]).map(opt => (
                    <button
                        type="button"
                        key={opt.key}
                        onClick={() => {
                            if (sortBy === opt.key) {
                                setSortDirection(d => d === "asc" ? "desc" : "asc");
                            } else {
                                setSortBy(opt.key);
                                setSortDirection(opt.key === "score" ? "desc" : "asc");
                            }
                            setPage(1);
                        }}
                        className={clsx(
                            "text-xs font-typewriter font-bold px-3 py-1.5 rounded-full border transition-all flex items-center",
                            sortBy === opt.key ? "bg-black text-white border-black" : "bg-white text-stone-500 border-stone-200 hover:bg-stone-100"
                        )}
                    >
                        {opt.label}
                        {sortBy === opt.key && (sortDirection === "asc" ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />)}
                    </button>
                ))}
                <button
                    type="button"
                    onClick={() => setShowFilters(!showFilters)}
                    className={clsx(
                        "text-xs font-typewriter font-bold px-3 py-1.5 rounded-full border transition-all flex items-center ml-auto",
                        showFilters ? "bg-black text-white border-black" : "bg-white text-stone-500 border-stone-200 hover:bg-stone-100"
                    )}
                >
                    <Filter className="w-3 h-3 mr-1.5" />
                    Filters
                </button>
            </section>

            {/* Advanced Filters */}
            {showFilters && (
                <section className="bg-white border border-stone-200 rounded-2xl p-4 flex flex-wrap gap-4 mb-4 animate-in slide-in-from-top-2 duration-300">
                    <div className="flex-1 min-w-[150px]">
                        <p className="text-[10px] font-typewriter text-stone-500 uppercase mb-2">Notice Type</p>
                        <select title="Notice Type" className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black" value={filterNoticeType} onChange={(e) => { setFilterNoticeType(e.target.value); setPage(1); }}>
                            <option value="">All Types</option>
                            <option value="Sources Sought">Sources Sought</option>
                            <option value="Presolicitation">Presolicitation</option>
                            <option value="Solicitation">Solicitation</option>
                            <option value="Combined Synopsis/Solicitation">Combined</option>
                        </select>
                    </div>
                    <div className="flex-1 min-w-[120px]">
                        <p className="text-[10px] font-typewriter text-stone-500 uppercase mb-2">Set-Aside</p>
                        <select title="Set-Aside" className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black" value={filterSetAside} onChange={(e) => { setFilterSetAside(e.target.value); setPage(1); }}>
                            <option value="">All</option>
                            <option value="SBA">Small Business</option>
                            <option value="8A">8(a)</option>
                            <option value="SDVOSB">SDVOSB</option>
                            <option value="WOSB">WOSB</option>
                            <option value="HUBZone">HUBZone</option>
                        </select>
                    </div>
                    <div className="flex-1 min-w-[100px]">
                        <p className="text-[10px] font-typewriter text-stone-500 uppercase mb-2">State</p>
                        <select title="State" className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black" value={filterState} onChange={(e) => { setFilterState(e.target.value); setPage(1); }}>
                            <option value="">All</option>
                            {["AL","AK","AZ","AR","CA","CO","CT","DC","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"].map(s => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                    </div>
                    {(filterNoticeType || filterSetAside || filterState) && (
                        <button type="button" onClick={() => { setFilterNoticeType(""); setFilterSetAside(""); setFilterState(""); setPage(1); }} className="self-end px-3 py-2 text-xs font-bold font-typewriter text-red-600 bg-red-50 border border-red-200 rounded-full hover:bg-red-100">
                            Clear
                        </button>
                    )}
                </section>
            )}

            {/* Search */}
            <div className="bg-white p-2 rounded-full border border-stone-200 shadow-sm flex items-center mb-6 focus-within:ring-2 focus-within:ring-black focus-within:border-transparent transition-all">
                <Search className="w-5 h-5 text-stone-400 ml-3 sm:ml-4 mr-2" />
                <input
                    type="text"
                    placeholder="Search by title or agency..."
                    className="bg-transparent border-none outline-none w-full text-stone-700 font-typewriter text-sm"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { setPage(1); setActiveSearch(searchInput); } }}
                />
                {activeSearch && (
                    <button type="button" title="Clear search" onClick={() => { setSearchInput(""); setActiveSearch(""); setPage(1); }} className="p-2 text-stone-400 hover:text-black">
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Empty States */}
            {matches.length === 0 && !loading && (
                <div className="bg-stone-50 border border-stone-200 border-dashed rounded-[24px] p-8 sm:p-12 text-center">
                    {filter === "SAVED" ? (
                        <>
                            <Bookmark className="w-10 h-10 text-stone-300 mx-auto mb-3" />
                            <p className="text-stone-500 font-typewriter mb-2">No saved matches yet.</p>
                            <p className="text-stone-400 text-sm">Click the bookmark icon on any match to save it for later.</p>
                        </>
                    ) : (
                        <>
                            <Zap className="w-10 h-10 text-stone-300 mx-auto mb-3" />
                            <p className="text-stone-500 font-typewriter mb-2">No matches found yet</p>
                            <p className="text-stone-400 text-sm mb-4">
                                Generate matches based on your profile, or update your profile to improve results.
                            </p>
                            <div className="flex items-center justify-center gap-3 flex-wrap">
                                <button
                                    type="button"
                                    onClick={handleGenerateMatches}
                                    disabled={generatingMatches}
                                    className="bg-black text-white px-6 py-2.5 rounded-full text-sm font-bold inline-flex items-center disabled:opacity-60"
                                >
                                    {generatingMatches ? (
                                        <>
                                            <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                                            Calculating matches...
                                        </>
                                    ) : (
                                        <>
                                            <Zap className="w-3.5 h-3.5 mr-2" />
                                            Generate Matches
                                        </>
                                    )}
                                </button>
                                <Link href="/settings" className="bg-white text-stone-700 border border-stone-200 px-6 py-2.5 rounded-full text-sm font-bold inline-flex items-center hover:bg-stone-50">
                                    Update Profile <ArrowRight className="w-3 h-3 ml-2" />
                                </Link>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Results */}
            {matches.length > 0 && (
                <div className="space-y-2">
                    {matches.map((match) => {
                        const opp = match.opportunities;
                        if (!opp) return null;
                        const scorePercent = Math.round(match.score * 100);
                        return (
                            <div key={match.id} className="bg-white border border-stone-200 hover:border-stone-300 rounded-xl sm:rounded-2xl p-3 sm:p-4 transition-all shadow-sm group">
                                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                    {/* Score Badge */}
                                    <div className={clsx("flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-xl border-2 font-black font-typewriter text-sm sm:text-base flex-shrink-0", getScoreColor(match.score))}>
                                        {scorePercent}%
                                    </div>

                                    {/* Content */}
                                    <Link href={`/opportunities/${opp.id}`} className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                            <span className={clsx(
                                                "text-[9px] font-typewriter font-bold px-2 py-0.5 rounded uppercase tracking-widest border",
                                                match.classification === "HOT"
                                                    ? "bg-red-50 text-red-600 border-red-200"
                                                    : "bg-amber-50 text-amber-600 border-amber-200"
                                            )}>
                                                {match.classification}
                                            </span>
                                            {opp.set_aside_code && (
                                                <span className="text-[9px] font-typewriter font-bold bg-blue-100 text-blue-600 border border-blue-200 px-2 py-0.5 rounded uppercase">{opp.set_aside_code}</span>
                                            )}
                                            {opp.notice_type && (
                                                <span className={clsx("text-[9px] font-typewriter px-2 py-0.5 rounded border uppercase tracking-widest", getNoticeColor(opp.notice_type))}>
                                                    {opp.notice_type}
                                                </span>
                                            )}
                                        </div>
                                        <p className="font-bold text-sm text-black line-clamp-1">{opp.title}</p>
                                        <p className="text-xs text-stone-500 line-clamp-1">{opp.agency}</p>
                                    </Link>

                                    {/* Right Side */}
                                    <div className="flex items-center gap-2 sm:gap-3 text-xs flex-shrink-0 flex-wrap sm:flex-nowrap">
                                        <span className="font-mono bg-stone-100 px-2 py-0.5 rounded text-stone-600 border border-stone-200">{opp.naics_code}</span>
                                        {opp.place_of_performance_state && (
                                            <span className="font-mono bg-stone-100 px-2 py-0.5 rounded text-stone-600 border border-stone-200">{opp.place_of_performance_state}</span>
                                        )}
                                        <span className="font-bold text-stone-700 whitespace-nowrap">
                                            {opp.response_deadline ? new Date(opp.response_deadline).toLocaleDateString() : "TBD"}
                                        </span>

                                        {/* Actions */}
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {pursuedIds.has(opp.id) ? (
                                                <span className="flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg text-[10px] font-bold">
                                                    <CheckCircle2 className="w-3 h-3" /> Pursuing
                                                </span>
                                            ) : (
                                                <button type="button" title="Start Pursuing"
                                                    onClick={(e) => { e.preventDefault(); handlePursue(opp.id, opp.notice_type); }}
                                                    disabled={pursuingIds.has(opp.id)}
                                                    className="p-1.5 rounded-lg text-stone-400 hover:text-black hover:bg-stone-100 transition-colors disabled:opacity-50">
                                                    {pursuingIds.has(opp.id) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                                                </button>
                                            )}
                                            <button type="button" title={match.is_saved ? "Unsave" : "Save"}
                                                onClick={(e) => { e.preventDefault(); toggleSave(match.id, match.is_saved); }}
                                                className={clsx("p-1.5 rounded-lg transition-colors",
                                                    match.is_saved ? "text-amber-500 bg-amber-50" : "text-stone-400 hover:text-amber-500 hover:bg-amber-50"
                                                )}>
                                                <Bookmark className="w-3.5 h-3.5" fill={match.is_saved ? "currentColor" : "none"} />
                                            </button>
                                            <button type="button" title="Dismiss"
                                                onClick={(e) => { e.preventDefault(); dismissMatch(match.id); }}
                                                className="p-1.5 rounded-lg text-stone-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                                                <EyeOff className="w-3.5 h-3.5" />
                                            </button>
                                        </div>

                                        <ArrowRight className="w-3.5 h-3.5 text-stone-400 hidden sm:block" />
                                    </div>
                                </div>

                                {/* Score Breakdown (expandable on hover) */}
                                {match.score_breakdown && (
                                    <div className="hidden group-hover:flex mt-2 pt-2 border-t border-stone-100 gap-2 flex-wrap">
                                        {Object.entries(match.score_breakdown)
                                            .filter(([k]) => k !== "total")
                                            .map(([key, val]) => (
                                                <span key={key} className={clsx(
                                                    "text-[9px] font-mono px-1.5 py-0.5 rounded border",
                                                    val >= 0.7 ? "bg-emerald-50 text-emerald-600 border-emerald-200" :
                                                    val >= 0.4 ? "bg-amber-50 text-amber-600 border-amber-200" :
                                                    "bg-stone-50 text-stone-400 border-stone-200"
                                                )}>
                                                    {key}: {Math.round(val * 100)}%
                                                </span>
                                            ))
                                        }
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="mt-6 flex flex-col sm:flex-row items-center justify-between px-1 gap-3">
                    <p className="text-xs text-stone-500 font-typewriter">
                        Page {page} of {totalPages} ({totalCount.toLocaleString()} total)
                    </p>
                    <div className="flex items-center space-x-2">
                        <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                            className="px-4 py-2 bg-white border border-stone-200 rounded-full hover:bg-stone-50 disabled:opacity-50 transition-colors flex items-center font-bold text-sm">
                            <ChevronLeft className="w-4 h-4 mr-1" /> Prev
                        </button>
                        <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                            className="px-4 py-2 bg-white border border-stone-200 rounded-full hover:bg-stone-50 disabled:opacity-50 transition-colors flex items-center font-bold text-sm">
                            Next <ChevronRight className="w-4 h-4 ml-1" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
