"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/client";
import { Loader2, Zap, Search, X, ChevronLeft, ChevronRight, Trophy, Clock, Shield, Target, ArrowRight } from "lucide-react";
import clsx from "clsx";
import Link from "next/link";

const supabase = createSupabaseClient();

interface MatchedOpp {
    id: string;
    title: string;
    agency: string;
    naics_code: string;
    notice_type: string;
    response_deadline: string;
    set_aside_code: string;
    place_of_performance_state: string;
    award_amount: number | null;
}

export default function MyMatchesPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [opps, setOpps] = useState<MatchedOpp[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [userNaics, setUserNaics] = useState<string[]>([]);
    const [userState, setUserState] = useState("");
    const [searchInput, setSearchInput] = useState("");
    const [activeSearch, setActiveSearch] = useState("");
    const [page, setPage] = useState(1);
    const [filter, setFilter] = useState<"ALL" | "EASY_WINS" | "SET_ASIDE" | "URGENT">("ALL");
    const pageSize = 25;

    useEffect(() => {
        async function loadProfile() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { router.push("/login"); return; }

            const { data: profile } = await supabase
                .from("user_profiles")
                .select("naics_codes, state, target_states, sba_certifications")
                .eq("auth_user_id", user.id)
                .single();

            if (!profile) { router.push("/onboard"); return; }
            setUserNaics((profile as Record<string, unknown>).naics_codes as string[] || []);
            setUserState((profile as Record<string, unknown>).state as string || "");
        }
        loadProfile();
    }, [router]);

    const fetchMatches = useCallback(async () => {
        if (userNaics.length === 0) { setLoading(false); return; }
        setLoading(true);

        const today = new Date().toISOString().split("T")[0];

        let query = supabase
            .from("opportunities")
            .select("id, title, agency, naics_code, notice_type, response_deadline, set_aside_code, place_of_performance_state, award_amount", { count: "exact" })
            .eq("is_archived", false)
            .in("naics_code", userNaics);

        if (activeSearch) {
            query = query.or(`title.ilike.%${activeSearch}%,agency.ilike.%${activeSearch}%`);
        }

        if (filter === "EASY_WINS") {
            query = query.ilike("notice_type", "%Sources Sought%").not("set_aside_code", "is", null).gte("response_deadline", today);
        } else if (filter === "SET_ASIDE") {
            query = query.not("set_aside_code", "is", null);
        } else if (filter === "URGENT") {
            const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
            query = query.gte("response_deadline", today).lte("response_deadline", weekFromNow);
        }

        query = query.order("response_deadline", { ascending: true, nullsFirst: false });

        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        const { data, count } = await query.range(from, to);

        setOpps((data || []) as MatchedOpp[]);
        setTotalCount(count || 0);
        setLoading(false);
    }, [userNaics, page, activeSearch, filter]);

    useEffect(() => {
        if (userNaics.length > 0) fetchMatches();
    }, [fetchMatches, userNaics]);

    const totalPages = Math.ceil(totalCount / pageSize);

    const getNoticeColor = (type: string) => {
        if (!type) return "bg-stone-100 text-stone-500 border-stone-200";
        if (type.includes("Sources Sought")) return "bg-emerald-50 text-emerald-600 border-emerald-200";
        if (type.includes("Presolicitation")) return "bg-blue-50 text-blue-600 border-blue-200";
        if (type.includes("Solicitation") || type.includes("Combined")) return "bg-amber-50 text-amber-600 border-amber-200";
        return "bg-stone-100 text-stone-500 border-stone-200";
    };

    if (loading && opps.length === 0) {
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
                    Opportunities matching your NAICS codes ({userNaics.join(", ") || "none set"})
                </p>
            </header>

            {/* Filter Tabs */}
            <section className="flex flex-wrap gap-2 mb-4">
                {([
                    { key: "ALL" as const, label: "All Matches", icon: Target },
                    { key: "EASY_WINS" as const, label: "Easy Wins", icon: Trophy },
                    { key: "SET_ASIDE" as const, label: "Set-Aside", icon: Shield },
                    { key: "URGENT" as const, label: "Urgent", icon: Clock },
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

            {/* No NAICS set */}
            {userNaics.length === 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-[24px] p-6 sm:p-8 text-center">
                    <p className="text-amber-800 font-bold mb-2">No NAICS codes in your profile</p>
                    <p className="text-amber-600 text-sm mb-4">Add your NAICS codes so we can match you with relevant opportunities.</p>
                    <Link href="/settings" className="bg-black text-white px-6 py-2.5 rounded-full text-sm font-bold inline-flex items-center">
                        Update Profile <ArrowRight className="w-3 h-3 ml-2" />
                    </Link>
                </div>
            )}

            {/* Results */}
            {userNaics.length > 0 && (
                <div className="space-y-2">
                    {opps.length === 0 && !loading && (
                        <div className="bg-stone-50 border border-stone-200 border-dashed rounded-[24px] p-8 sm:p-12 text-center">
                            <p className="text-stone-500 font-typewriter">No matches found for this filter.</p>
                        </div>
                    )}
                    {opps.map((opp) => {
                        const isEasyWin = opp.notice_type?.includes("Sources Sought") && opp.set_aside_code;
                        return (
                            <Link
                                key={opp.id}
                                href={`/opportunities/${opp.id}`}
                                className="block bg-white hover:bg-stone-50 active:bg-stone-100 border border-stone-200 hover:border-stone-300 rounded-xl sm:rounded-2xl p-3 sm:p-4 transition-all shadow-sm"
                            >
                                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                            {isEasyWin && (
                                                <span className="text-[9px] font-typewriter font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded uppercase">Easy Win</span>
                                            )}
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
                                    </div>
                                    <div className="flex items-center gap-2 sm:gap-3 text-xs flex-shrink-0 flex-wrap sm:flex-nowrap">
                                        <span className="font-mono bg-stone-100 px-2 py-0.5 rounded text-stone-600 border border-stone-200">{opp.naics_code}</span>
                                        {opp.place_of_performance_state && (
                                            <span className="font-mono bg-stone-100 px-2 py-0.5 rounded text-stone-600 border border-stone-200">{opp.place_of_performance_state}</span>
                                        )}
                                        <span className="font-bold text-stone-700 whitespace-nowrap">
                                            {opp.response_deadline ? new Date(opp.response_deadline).toLocaleDateString() : "TBD"}
                                        </span>
                                        <ArrowRight className="w-3.5 h-3.5 text-stone-400 hidden sm:block" />
                                    </div>
                                </div>
                            </Link>
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
