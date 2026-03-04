"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { Loader2, ArrowRight, X, Building, CheckCircle2, PenTool, LayoutGrid, List, Briefcase, Sparkles, AlertCircle, ChevronDown, ChevronUp, Search, ChevronLeft, ChevronRight, Flame, Target, Globe, ExternalLink } from "lucide-react";
import clsx from "clsx";

export const dynamic = 'force-dynamic';

export default function MatchesPageWrapper() {
    return (
        <Suspense fallback={<div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-stone-400" /></div>}>
            <MatchesPage />
        </Suspense>
    );
}

interface MatchExt {
    id: string;
    score: number;
    classification: string;
    created_at: string;
    score_breakdown: Record<string, number> | null;
    opportunity_id: string;
    contractor_id: string;
    opportunities: {
        title: string;
        notice_id: string;
        response_deadline: string;
        naics_code: string;
        agency?: string;
        notice_type?: string;
    };
    contractors: {
        company_name: string;
        uei: string;
        city?: string;
        state?: string;
        naics_codes: string[];
        certifications: string[];
        business_url?: string;
    };
}

interface RawMatch {
    id: string;
    score: number;
    classification: string;
    created_at: string;
    score_breakdown: Record<string, number> | null;
    opportunity_id: string;
    contractor_id: string;
}

interface RawOpp {
    id: string;
    title: string;
    notice_id: string;
    response_deadline: string;
    naics_code: string;
    agency: string;
    notice_type: string;
}

interface RawCon {
    id: string;
    company_name: string;
    uei: string;
    city: string;
    state: string;
    naics_codes: string[];
    certifications: string[];
    business_url: string;
}

interface DraftPayload {
    type: string;
    content: string;
}

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ryxgjzehoijjvczqkhwr.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5eGdqemVob2lqanZjenFraHdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNDg0NTUsImV4cCI6MjA4NzYyNDQ1NX0.q0HivHixjE-A2MuQZlmlZOO2eLpQEm8c6XhQQQKaJsY"
);

function MatchesPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [matches, setMatches] = useState<MatchExt[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(true);

    // Read initial class filter from URL query param
    const initialClass = (searchParams.get("class")?.toUpperCase() || "ALL") as "ALL" | "HOT" | "WARM" | "COLD";

    // Filter & Search
    const [classFilter, setClassFilter] = useState<"ALL" | "HOT" | "WARM" | "COLD">(initialClass);
    const [searchInput, setSearchInput] = useState("");
    const [activeSearch, setActiveSearch] = useState("");
    const [sortBy, setSortBy] = useState<"score_desc" | "score_asc" | "deadline">("score_desc");

    // Pagination
    const [page, setPage] = useState(1);
    const pageSize = 25;

    // Panel state
    const [selectedMatch, setSelectedMatch] = useState<MatchExt | null>(null);
    const [drafting, setDrafting] = useState(false);
    const [drafts, setDrafts] = useState<DraftPayload[]>([]);
    const [showBreakdown, setShowBreakdown] = useState(true);
    const [viewMode, setViewMode] = useState("list");

    // Counts for tabs
    const [hotCount, setHotCount] = useState(0);
    const [warmCount, setWarmCount] = useState(0);
    const [coldCount, setColdCount] = useState(0);

    // Fetch tab counts once
    useEffect(() => {
        async function fetchCounts() {
            const [hot, warm, cold] = await Promise.all([
                supabase.from("matches").select("*", { count: 'exact', head: true }).eq("classification", "HOT"),
                supabase.from("matches").select("*", { count: 'exact', head: true }).eq("classification", "WARM"),
                supabase.from("matches").select("*", { count: 'exact', head: true }).eq("classification", "COLD"),
            ]);
            setHotCount(hot.count || 0);
            setWarmCount(warm.count || 0);
            setColdCount(cold.count || 0);
        }
        fetchCounts();
    }, []);

    const fetchMatches = useCallback(async () => {
        setLoading(true);
        try {
            // Step 1: Fetch flat match rows (no joins — avoids PGRST200 FK error)
            let query = supabase
                .from("matches")
                .select("id, score, classification, created_at, score_breakdown, opportunity_id, contractor_id", { count: 'exact' });

            if (classFilter !== "ALL") {
                query = query.eq("classification", classFilter);
            }

            if (sortBy === "score_desc") {
                query = query.order("score", { ascending: false });
            } else if (sortBy === "score_asc") {
                query = query.order("score", { ascending: true });
            }

            const from = (page - 1) * pageSize;
            const to = from + pageSize - 1;
            query = query.range(from, to);

            const { data: rawMatches, count, error } = await query;

            if (error) {
                console.error("Matches fetch error:", error);
                setLoading(false);
                return;
            }

            const matchRows = rawMatches || [];
            setTotalCount(count || 0);

            if (matchRows.length === 0) {
                setMatches([]);
                setLoading(false);
                return;
            }

            // Step 2: Collect unique IDs and fetch related data in parallel
            const typedMatches = matchRows as unknown as RawMatch[];
            const oppIds = [...new Set(typedMatches.map((m) => m.opportunity_id))];
            const conIds = [...new Set(typedMatches.map((m) => m.contractor_id))];

            const [oppRes, conRes] = await Promise.all([
                supabase.from("opportunities").select("id, title, notice_id, response_deadline, naics_code, agency, notice_type").in("id", oppIds),
                supabase.from("contractors").select("id, company_name, uei, city, state, naics_codes, certifications, business_url").in("id", conIds),
            ]);

            const oppMap = new Map((oppRes.data as unknown as RawOpp[] || []).map((o) => [o.id, o]));
            const conMap = new Map((conRes.data as unknown as RawCon[] || []).map((c) => [c.id, c]));

            // Step 3: Merge into MatchExt shape
            let results: MatchExt[] = typedMatches.map((m) => ({
                ...m,
                opportunities: oppMap.get(m.opportunity_id) || { title: "Unknown", notice_id: "", response_deadline: "", naics_code: "", agency: "", notice_type: "" },
                contractors: conMap.get(m.contractor_id) || { company_name: "Unknown", uei: "", city: "", state: "", naics_codes: [], certifications: [] },
            }));

            // Client-side search filter
            if (activeSearch) {
                const term = activeSearch.toLowerCase();
                results = results.filter(m =>
                    m.contractors?.company_name?.toLowerCase().includes(term) ||
                    m.opportunities?.title?.toLowerCase().includes(term) ||
                    m.opportunities?.notice_id?.toLowerCase().includes(term) ||
                    m.opportunities?.agency?.toLowerCase().includes(term)
                );
            }

            setMatches(results);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [page, classFilter, activeSearch, sortBy]);

    useEffect(() => {
        fetchMatches();
    }, [fetchMatches]);

    const handleGenerateDrafts = async () => {
        if (!selectedMatch) return;
        setDrafting(true);
        await new Promise(r => setTimeout(r, 2000));

        const opp = selectedMatch.opportunities;
        const con = selectedMatch.contractors;
        const deadline = opp.response_deadline ? new Date(opp.response_deadline).toLocaleDateString() : 'TBD';

        setDrafts([
            {
                type: "Cold Call Script",
                content: `Hey [Name], this is [Your Name] from Capture OS. I'm calling because our intelligence engine flagged ${con.company_name} as a top-tier structural fit for the new "${opp.title}" opportunity.\n\nYou have the exact NAICS ${opp.naics_code} and ${con.certifications?.[0] || 'capabilities'} the agency is looking for. Do you have 2 minutes to discuss a teaming strategy before the ${deadline} deadline?`
            },
            {
                type: "LinkedIn / SMS",
                content: `Hi [Name], saw ${con.company_name} is a high-probability fit for the ${opp.agency || 'agency'} "${opp.title}" contract (NAICS ${opp.naics_code}). We have a capture strategy ready. Open to a quick chat?`
            },
            {
                type: "Concise Email",
                content: `Subject: Teaming Opportunity: ${opp.notice_id} - ${opp.title}\n\nHi [Name],\n\nWe identified a high-probability match for ${con.company_name} on the recent ${opp.agency || 'agency'} Sources Sought.\n\nWhy you: Perfect NAICS alignment (${opp.naics_code}) and verified ${con.certifications?.[0] || 'capacity'} requirements.\n\nDeadline: ${deadline}.\n\nAre you open to a brief call tomorrow to review the capture strategy and PWin breakdown?\n\nBest,\n[Your Name]`
            }
        ]);
        setDrafting(false);
    };

    const getScoreColor = (score: number) => {
        const val = score * 100;
        if (val >= 70) return "text-green-600 bg-green-100 border-green-200";
        if (val >= 40) return "text-yellow-600 bg-yellow-100 border-yellow-200";
        return "text-red-600 bg-red-100 border-red-200";
    };

    const getDotColor = (cls: string) => {
        if (cls === "HOT") return "bg-red-500";
        if (cls === "WARM") return "bg-amber-500";
        return "bg-stone-400";
    };

    const generateMatchSummary = (match: MatchExt): string => {
        const bd = match.score_breakdown;
        if (!bd) return "Score breakdown unavailable.";
        const parts: string[] = [];
        if ((bd.naics ?? 0) >= 25) parts.push("strong NAICS code alignment");
        else if ((bd.naics ?? 0) >= 15) parts.push("partial NAICS overlap");
        if ((bd.geo ?? 0) >= 12) parts.push("close geographic proximity");
        if ((bd.capacity ?? 0) >= 15) parts.push("verified operational capacity");
        if ((bd.inactivity ?? 0) >= 15) parts.push("low recent federal activity (hungry for contracts)");
        if ((bd.notice_type ?? 0) >= 15) parts.push("early-stage opportunity (Sources Sought)");
        if ((bd.past_performance ?? 0) >= 15) parts.push("strong federal track record");
        if ((bd.density ?? 0) >= 12) parts.push("lower competition density");
        if (parts.length === 0) return "Marginal fit across scoring factors.";
        return "This pairing scores well due to " + parts.slice(0, 4).join(", ") + ".";
    };

    const totalPages = Math.ceil(totalCount / pageSize);
    const totalAll = hotCount + warmCount + coldCount;

    return (
        <div className="flex gap-6 max-w-[1600px] mx-auto pb-12 items-start">
            {/* Main Content Area */}
            <div className={clsx("transition-all duration-500 ease-in-out flex-1 flex flex-col", selectedMatch ? "hidden lg:flex lg:w-1/2 xl:w-7/12" : "w-full")}>
                <div className="animate-in fade-in duration-500">
                    <header className="flex items-end justify-between mb-6">
                        <div>
                            <h2 className="text-3xl font-bold font-typewriter tracking-tighter text-black flex items-center">
                                <CheckCircle2 className="mr-3 w-8 h-8" /> Active Matches
                                <span className="ml-4 text-sm font-sans font-medium bg-stone-100 px-3 py-1 rounded-full text-stone-500 border border-stone-200">
                                    {totalCount.toLocaleString()} Results
                                </span>
                            </h2>
                            <p className="text-stone-500 mt-2 font-medium">
                                Contractor-Opportunity Pairing Intelligence
                            </p>
                        </div>
                        <div className="flex items-center space-x-2">
                            <div className="flex items-center bg-stone-100 p-1 rounded-full border border-stone-200">
                                <button title="Grid View" onClick={() => setViewMode("grid")} className={clsx("p-2 rounded-full transition-all", viewMode === "grid" ? "bg-white shadow-sm text-black" : "text-stone-500 hover:text-black")}>
                                    <LayoutGrid className="w-4 h-4" />
                                </button>
                                <button title="List View" onClick={() => setViewMode("list")} className={clsx("p-2 rounded-full transition-all", viewMode === "list" ? "bg-white shadow-sm text-black" : "text-stone-500 hover:text-black")}>
                                    <List className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </header>

                    {/* Classification Tabs + Sort + Search */}
                    <section className="bg-stone-50 border border-stone-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 mb-6">
                        <div className="flex items-center space-x-2">
                            {([
                                { key: "ALL" as const, label: "All", count: totalAll, icon: null, color: "bg-black text-white border-black" },
                                { key: "HOT" as const, label: "HOT", count: hotCount, icon: Flame, color: "bg-red-100 text-red-900 border-red-300" },
                                { key: "WARM" as const, label: "WARM", count: warmCount, icon: Target, color: "bg-amber-100 text-amber-900 border-amber-300" },
                                { key: "COLD" as const, label: "COLD", count: coldCount, icon: null, color: "bg-stone-200 text-stone-700 border-stone-300" },
                            ]).map(tab => (
                                <button
                                    key={tab.key}
                                    onClick={() => { setClassFilter(tab.key); setPage(1); setSelectedMatch(null); }}
                                    className={clsx(
                                        "text-xs font-bold font-typewriter uppercase tracking-widest px-4 py-2 rounded-full transition-all shadow-sm border flex items-center",
                                        classFilter === tab.key ? tab.color : "bg-white text-stone-600 border-stone-200 hover:bg-stone-100"
                                    )}
                                >
                                    {tab.icon && <tab.icon className="w-3 h-3 mr-1.5" />}
                                    {tab.label}
                                    <span className="ml-2 text-[10px] opacity-70">({tab.count.toLocaleString()})</span>
                                </button>
                            ))}
                        </div>

                        <div className="flex items-center gap-3">
                            {/* Sort */}
                            <select
                                title="Sort By"
                                value={sortBy}
                                onChange={(e) => { setSortBy(e.target.value as typeof sortBy); setPage(1); }}
                                className="bg-white border border-stone-200 rounded-full px-3 py-2 text-xs font-bold font-typewriter outline-none focus:ring-2 focus:ring-black"
                            >
                                <option value="score_desc">Score: High to Low</option>
                                <option value="score_asc">Score: Low to High</option>
                            </select>
                        </div>
                    </section>

                    {/* Search Bar */}
                    <div className="bg-white p-2 rounded-full border border-stone-200 shadow-sm flex items-center mb-6 focus-within:ring-2 focus-within:ring-black focus-within:border-transparent transition-all">
                        <Search className="w-5 h-5 text-stone-400 ml-4 mr-2" />
                        <input
                            type="text"
                            placeholder="Search contractor, opportunity, notice ID, or agency..."
                            className="bg-transparent border-none outline-none w-full text-stone-700 font-typewriter text-sm"
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); setActiveSearch(searchInput); } }}
                        />
                        {activeSearch && (
                            <button title="Clear Search" onClick={() => { setSearchInput(""); setActiveSearch(""); setPage(1); }} className="p-2 text-stone-400 hover:text-black">
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>

                    {loading ? (
                        <div className="flex justify-center p-12">
                            <Loader2 className="w-8 h-8 animate-spin text-stone-400" />
                        </div>
                    ) : (
                        <>
                            {viewMode === "list" ? (
                            <div className="bg-white rounded-[32px] border border-stone-200 shadow-sm overflow-hidden flex flex-col">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-stone-200 bg-stone-50 text-stone-500 text-xs font-typewriter uppercase tracking-wider">
                                            <th className="p-5 font-medium">Score</th>
                                            <th className="p-5 font-medium">Contractor</th>
                                            <th className="p-5 font-medium">Opportunity</th>
                                            <th className="p-5 font-medium hidden xl:table-cell">NAICS</th>
                                            <th className="p-5 font-medium hidden lg:table-cell">Deadline</th>
                                            <th className="p-5 font-medium"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-stone-100 text-sm">
                                        {matches.length === 0 && (
                                            <tr>
                                                <td colSpan={6} className="p-12 text-center text-stone-400 font-typewriter">
                                                    No matches found. {activeSearch ? "Try a different search." : "Run the Scoring Engine to generate matches."}
                                                </td>
                                            </tr>
                                        )}
                                        {matches.map((m) => (
                                            <tr
                                                key={m.id}
                                                onClick={() => { setSelectedMatch(m); setDrafts([]); setShowBreakdown(true); }}
                                                onDoubleClick={() => router.push(`/matches/${m.opportunity_id}/${m.contractor_id}`)}
                                                className={clsx(
                                                    "transition-colors group cursor-pointer",
                                                    selectedMatch?.id === m.id ? "bg-stone-50" : "hover:bg-stone-50"
                                                )}
                                            >
                                                <td className="p-5 align-top">
                                                    <div className="flex items-center space-x-2">
                                                        <div className={clsx("w-2.5 h-2.5 rounded-full flex-shrink-0", getDotColor(m.classification))}></div>
                                                        <div>
                                                            <div className="font-bold text-lg font-mono leading-none">{Math.round(m.score * 100)}</div>
                                                            <div className="text-[9px] font-typewriter text-stone-400 uppercase tracking-widest mt-0.5">{m.classification}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-5 align-top">
                                                    <p className="font-bold text-stone-900 leading-tight line-clamp-1">
                                                        {m.contractors?.company_name}
                                                    </p>
                                                    <p className="text-stone-400 text-xs mt-0.5">
                                                        {[m.contractors?.city, m.contractors?.state].filter(Boolean).join(", ") || m.contractors?.uei}
                                                    </p>
                                                </td>
                                                <td className="p-5 align-top max-w-[300px]">
                                                    <p className="font-medium text-stone-800 line-clamp-1 mb-0.5">{m.opportunities?.title}</p>
                                                    <p className="text-stone-500 text-xs line-clamp-1">{m.opportunities?.agency || "Unknown Agency"}</p>
                                                </td>
                                                <td className="p-5 align-top hidden xl:table-cell">
                                                    <span className="text-xs font-mono bg-stone-100 text-stone-600 px-2 py-1 rounded border border-stone-200">
                                                        {m.opportunities?.naics_code || "---"}
                                                    </span>
                                                </td>
                                                <td className="p-5 align-top hidden lg:table-cell">
                                                    <span className="font-bold text-xs text-stone-700">
                                                        {m.opportunities?.response_deadline ? new Date(m.opportunities.response_deadline).toLocaleDateString() : "TBD"}
                                                    </span>
                                                </td>
                                                <td className="p-5 align-middle text-right">
                                                    <div className={clsx("inline-flex items-center space-x-1 border px-3 py-1.5 rounded-full transition-all text-xs font-bold font-typewriter", selectedMatch?.id === m.id ? "bg-black text-white border-black" : "bg-white border-stone-200 text-stone-700 group-hover:bg-black group-hover:text-white group-hover:border-black")}>
                                                        <span>View</span>
                                                        <ArrowRight className="w-3 h-3" />
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            ) : (
                            /* Grid View */
                            <div className={clsx("grid gap-4 transition-all", selectedMatch ? "grid-cols-1 xl:grid-cols-2" : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3")}>
                                {matches.length === 0 && (
                                    <div className="col-span-full bg-stone-50 border border-stone-200 border-dashed rounded-[32px] p-12 text-center">
                                        <p className="text-stone-500 font-typewriter">
                                            No matches found. {activeSearch ? "Try a different search." : "Run the Scoring Engine to generate matches."}
                                        </p>
                                    </div>
                                )}
                                {matches.map((m) => (
                                    <div
                                        key={m.id}
                                        onClick={() => { setSelectedMatch(m); setDrafts([]); setShowBreakdown(true); }}
                                        onDoubleClick={() => router.push(`/matches/${m.opportunity_id}/${m.contractor_id}`)}
                                        className={clsx(
                                            "bg-white p-5 rounded-[28px] border shadow-sm hover:shadow-md hover:border-black transition-all cursor-pointer flex flex-col justify-between",
                                            selectedMatch?.id === m.id ? "border-black ring-2 ring-black/10" : "border-stone-200"
                                        )}
                                    >
                                        <div>
                                            <div className="flex justify-between items-center mb-3">
                                                <div className="flex items-center space-x-2">
                                                    <div className={clsx("w-2.5 h-2.5 rounded-full flex-shrink-0", getDotColor(m.classification))}></div>
                                                    <span className="font-mono font-bold text-2xl">{Math.round(m.score * 100)}</span>
                                                    <span className="text-[9px] font-typewriter text-stone-400 uppercase tracking-widest">{m.classification}</span>
                                                </div>
                                            </div>
                                            <p className="font-bold text-black text-sm line-clamp-1 mb-0.5">{m.contractors?.company_name}</p>
                                            <p className="text-stone-400 text-xs mb-3">
                                                {[m.contractors?.city, m.contractors?.state].filter(Boolean).join(", ") || m.contractors?.uei}
                                            </p>
                                            <p className="font-medium text-stone-700 text-sm line-clamp-2 mb-1">{m.opportunities?.title}</p>
                                            <p className="text-stone-500 text-xs line-clamp-1">{m.opportunities?.agency || "Unknown Agency"}</p>
                                        </div>
                                        <div className="pt-3 border-t border-stone-100 mt-3 flex flex-wrap items-center justify-between gap-2">
                                            <span className="font-mono text-[10px] bg-stone-100 text-stone-600 px-2 py-0.5 rounded border border-stone-200">
                                                {m.opportunities?.naics_code || "---"}
                                            </span>
                                            {m.opportunities?.notice_type && (
                                                <span className="text-[9px] font-typewriter text-stone-400 uppercase tracking-widest">
                                                    {m.opportunities.notice_type}
                                                </span>
                                            )}
                                            <span className="font-bold text-xs text-stone-700">
                                                {m.opportunities?.response_deadline ? new Date(m.opportunities.response_deadline).toLocaleDateString() : "TBD"}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            )}

                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div className="mt-6 flex flex-col md:flex-row items-center justify-between px-2 gap-4">
                                    <p className="text-xs text-stone-500 font-typewriter">
                                        Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, totalCount)} of {totalCount.toLocaleString()} matches
                                    </p>
                                    <div className="flex items-center space-x-2">
                                        <button
                                            onClick={() => setPage(p => Math.max(1, p - 1))}
                                            disabled={page === 1}
                                            className="px-4 py-2 bg-white border border-stone-200 rounded-full hover:bg-stone-50 disabled:opacity-50 transition-colors flex items-center font-bold text-sm"
                                        >
                                            <ChevronLeft className="w-4 h-4 mr-1" /> Prev
                                        </button>
                                        <span className="text-xs font-mono px-4 text-stone-600">
                                            Page {page} of {totalPages}
                                        </span>
                                        <button
                                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                            disabled={page === totalPages}
                                            className="px-4 py-2 bg-white border border-stone-200 rounded-full hover:bg-stone-50 disabled:opacity-50 transition-colors flex items-center font-bold text-sm"
                                        >
                                            Next <ChevronRight className="w-4 h-4 ml-1" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Slide-Over Panel */}
            {selectedMatch && (
                <div className="w-full lg:w-1/2 xl:w-5/12 h-[calc(100vh-80px)] xl:h-[calc(100vh-120px)] sticky top-[40px] xl:top-[60px] bg-stone-50 border border-stone-200 shadow-2xl rounded-[40px] flex flex-col overflow-hidden animate-in slide-in-from-right-16 duration-300">
                    <div className="p-6 border-b border-stone-200 flex justify-between items-center bg-white shadow-sm z-10">
                        <div className="flex items-center space-x-3">
                            <span className={clsx(
                                "font-typewriter text-[10px] px-2 py-1 rounded font-bold border tracking-wider flex items-center shadow-sm",
                                getScoreColor(selectedMatch.score)
                            )}>
                                <div className={clsx("w-1.5 h-1.5 rounded-full mr-1.5", getDotColor(selectedMatch.classification))}></div>
                                {selectedMatch.classification} MATCH
                            </span>
                            <span className="font-mono text-stone-600 font-bold text-sm border bg-stone-50 px-3 py-1 rounded-md shadow-sm">
                                {Math.round(selectedMatch.score * 100)}<span className="text-stone-400 text-xs"> / 100</span>
                            </span>
                        </div>
                        <button
                            title="Close panel"
                            onClick={() => setSelectedMatch(null)}
                            className="p-2 bg-stone-100 hover:bg-stone-200 rounded-full transition-colors text-stone-500 hover:text-black"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="overflow-y-auto flex-1 p-6 custom-scrollbar space-y-6">
                        {/* Contractor Mini-Profile */}
                        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm hover:border-black transition-colors">
                            <h3 className="font-typewriter font-bold text-sm mb-4 flex items-center text-stone-800">
                                <Building className="w-4 h-4 mr-2" /> Contractor Target
                            </h3>
                            <p className="font-bold text-black text-lg">{selectedMatch.contractors.company_name}</p>
                            <p className="font-mono text-stone-500 text-xs mb-1">UEI: {selectedMatch.contractors.uei}</p>
                            {(selectedMatch.contractors.city || selectedMatch.contractors.state) && (
                                <p className="text-stone-400 text-xs">{[selectedMatch.contractors.city, selectedMatch.contractors.state].filter(Boolean).join(", ")}</p>
                            )}

                            <div className="border-t border-stone-100 pt-3 mt-3">
                                <p className="text-stone-500 font-typewriter text-[10px] uppercase mb-1">Certifications</p>
                                <div className="flex flex-wrap gap-1">
                                    {selectedMatch.contractors.certifications?.map((c: string) => (
                                        <span key={c} className="bg-black text-white px-2 py-0.5 rounded font-typewriter text-[9px] uppercase tracking-wider">{c}</span>
                                    ))}
                                    {(!selectedMatch.contractors.certifications || selectedMatch.contractors.certifications.length === 0) && (
                                        <span className="text-stone-400 text-xs italic">None listed</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Opportunity Mini-Profile */}
                        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm hover:border-black transition-colors">
                            <h3 className="font-typewriter font-bold text-sm mb-4 flex items-center text-stone-800">
                                <Briefcase className="w-4 h-4 mr-2" /> Federal Opportunity
                            </h3>
                            <p className="font-bold text-black line-clamp-2">{selectedMatch.opportunities.title}</p>
                            <p className="text-stone-500 text-sm mt-1">{selectedMatch.opportunities.agency || "Unknown Agency"}</p>

                            <div className="grid grid-cols-3 gap-3 mt-4 border-t border-stone-100 pt-4">
                                <div>
                                    <p className="text-stone-400 font-typewriter text-[10px] uppercase mb-1">NAICS</p>
                                    <p className="font-mono font-bold text-stone-800 text-sm">{selectedMatch.opportunities.naics_code}</p>
                                </div>
                                <div>
                                    <p className="text-stone-400 font-typewriter text-[10px] uppercase mb-1">Type</p>
                                    <p className="font-typewriter font-bold text-stone-800 text-xs">{selectedMatch.opportunities.notice_type || "N/A"}</p>
                                </div>
                                <div className="border-l-4 border-stone-800 pl-3">
                                    <p className="text-stone-400 font-typewriter text-[10px] uppercase mb-1">Deadline</p>
                                    <p className="font-sans font-bold text-red-600 text-sm">
                                        {selectedMatch.opportunities.response_deadline ? new Date(selectedMatch.opportunities.response_deadline).toLocaleDateString() : "TBD"}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2">
                            <button
                                onClick={() => router.push(`/matches/${selectedMatch.opportunity_id}/${selectedMatch.contractor_id}`)}
                                className="flex-1 flex items-center justify-center space-x-2 text-sm font-bold font-typewriter bg-black text-white py-3 rounded-full hover:bg-stone-800 transition-all"
                            >
                                <ArrowRight className="w-4 h-4" />
                                <span>View Details</span>
                            </button>
                            {selectedMatch.contractors.business_url && (
                                <a
                                    href={selectedMatch.contractors.business_url.startsWith('http') ? selectedMatch.contractors.business_url : `https://${selectedMatch.contractors.business_url}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-center space-x-1.5 text-xs font-bold font-typewriter bg-stone-100 border border-stone-200 px-4 py-3 rounded-full hover:bg-stone-200 transition-all"
                                >
                                    <Globe className="w-3.5 h-3.5" />
                                    <span>Website</span>
                                </a>
                            )}
                            {selectedMatch.opportunities.notice_id && (
                                <a
                                    href={`https://sam.gov/opp/${selectedMatch.opportunities.notice_id}/view`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-center space-x-1.5 text-xs font-bold font-typewriter bg-stone-100 border border-stone-200 px-4 py-3 rounded-full hover:bg-stone-200 transition-all"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    <span>SAM.gov</span>
                                </a>
                            )}
                        </div>

                        {/* Score Breakdown + AI Engine */}
                        <div className="bg-stone-900 rounded-3xl p-6 text-white relative shadow-xl overflow-hidden mt-4">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-stone-700/30 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>

                            <h3 className="font-typewriter font-bold text-sm mb-3 flex items-center text-stone-100">
                                <Sparkles className="w-4 h-4 mr-2 text-stone-400" /> Match Intelligence
                            </h3>

                            <p className="text-stone-400 font-sans text-xs mb-4 leading-relaxed">
                                {generateMatchSummary(selectedMatch)}
                            </p>

                            <div className="bg-black/40 border border-stone-700 rounded-xl mb-6 overflow-hidden">
                                <button
                                    onClick={() => setShowBreakdown(!showBreakdown)}
                                    className="w-full flex justify-between items-center p-4 hover:bg-stone-800/50 transition-colors text-left"
                                >
                                    <div className="flex items-center">
                                        <AlertCircle className="w-4 h-4 mr-2 text-stone-400" />
                                        <span className="font-bold text-sm">Score Breakdown</span>
                                    </div>
                                    {showBreakdown ? <ChevronUp className="w-4 h-4 text-stone-400" /> : <ChevronDown className="w-4 h-4 text-stone-400" />}
                                </button>

                                {showBreakdown && selectedMatch.score_breakdown && (
                                    <div className="p-4 border-t border-stone-800 bg-stone-900/50">
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                                            {[
                                                { name: "NAICS Fit", score: selectedMatch.score_breakdown.naics ?? 0, max: 30 },
                                                { name: "Geographic", score: selectedMatch.score_breakdown.geo ?? 0, max: 15 },
                                                { name: "Capacity", score: selectedMatch.score_breakdown.capacity ?? 0, max: 20 },
                                                { name: "Fed. Inactivity", score: selectedMatch.score_breakdown.inactivity ?? 0, max: 20 },
                                                { name: "Competition", score: selectedMatch.score_breakdown.density ?? 0, max: 15 },
                                                { name: "Notice Type", score: selectedMatch.score_breakdown.notice_type ?? 0, max: 20 },
                                                { name: "Past Performance", score: selectedMatch.score_breakdown.past_performance ?? 0, max: 20 },
                                                { name: "Incumbent Risk", score: selectedMatch.score_breakdown.incumbent_risk ?? 0, max: 15 },
                                            ].map((factor, idx) => {
                                                const pct = factor.max > 0 ? factor.score / factor.max : 0;
                                                return (
                                                    <div key={idx} className="flex justify-between items-center text-xs">
                                                        <span className="text-stone-400 truncate pr-2">{factor.name}</span>
                                                        <span className={clsx("font-mono font-bold", pct > 0.7 ? "text-green-400" : pct > 0.3 ? "text-yellow-500" : factor.score === 0 ? "text-stone-600" : "text-red-400")}>
                                                            {factor.score}<span className="text-stone-600">/{factor.max}</span>
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <div className="mt-3 pt-2 border-t border-stone-800 flex justify-between text-xs font-mono">
                                            <span className="text-stone-400">Total</span>
                                            <span className="text-white font-bold">{selectedMatch.score_breakdown.total ?? Math.round(selectedMatch.score * 140)}/140</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <p className="text-stone-400 font-sans text-xs mb-5 leading-relaxed">
                                Generate strategic outreach drafts for this pairing.
                            </p>

                            {drafts.length > 0 ? (
                                <div className="space-y-4">
                                    {drafts.map((draft, i) => (
                                        <div key={i} className="bg-white/5 border border-stone-700/50 p-4 rounded-2xl relative group">
                                            <span className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-2 block">{draft.type}</span>
                                            <p className="font-sans text-sm text-stone-200 leading-relaxed whitespace-pre-wrap pr-8">{draft.content}</p>
                                            <button
                                                title="Copy to Clipboard"
                                                onClick={() => navigator.clipboard.writeText(draft.content)}
                                                className="absolute top-4 right-4 bg-white/10 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-white/20 hover:scale-105 border border-white/10 shadow-sm"
                                            >
                                                <PenTool className="w-3 h-3 text-stone-300" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <button
                                    onClick={handleGenerateDrafts}
                                    disabled={drafting}
                                    className="w-full py-4 rounded-full bg-white text-black font-typewriter text-xs font-bold hover:bg-stone-100 transition-all flex items-center justify-center mt-2 group"
                                >
                                    {drafting ? (
                                        <><Loader2 className="w-4 h-4 mr-2 animate-spin text-stone-400" /> Processing...</>
                                    ) : (
                                        <>Generate AI Drafts <ArrowRight className="w-3 h-3 ml-2 text-stone-400 group-hover:text-black transition-colors" /></>
                                    )}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
