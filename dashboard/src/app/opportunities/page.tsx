"use client";

import { useEffect, useState, useCallback, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { Search, Filter, Loader2, LayoutGrid, List, Download, X, Building, Target, FileText, Link as LinkIcon, Sparkles, ChevronLeft, ChevronRight, Flame, Users, ChevronUp, ChevronDown, Sprout, Leaf, Sun, Award } from "lucide-react";
import clsx from "clsx";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ryxgjzehoijjvczqkhwr.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5eGdqemVob2lqanZjenFraHdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNDg0NTUsImV4cCI6MjA4NzYyNDQ1NX0.q0HivHixjE-A2MuQZlmlZOO2eLpQEm8c6XhQQQKaJsY"
);

interface Opportunity {
    id: string;
    notice_id: string;
    title: string;
    agency?: string;
    organization_code?: string;
    notice_type?: string;
    naics_code?: string;
    response_deadline?: string;
    posted_date?: string;
    description?: string;
    link?: string;
    is_archived?: boolean;
    award_amount?: number;
    place_of_performance_state?: string;
    place_of_performance_city?: string;
    set_aside_code?: string;
    enrichment_status?: string;
    incumbent_contractor_name?: string;
    notice_type_score?: number;
    past_performance_score?: number;
    // Joined
    agencies?: { department: string; sub_tier?: string };
    opportunity_types?: { name: string };
    set_asides?: { code: string };
    // Computed
    _matchCount?: number;
    _dataScore?: number;
}

interface MatchedContractor {
    id: string;
    contractor_id: string;
    opportunity_id: string;
    score: number;
    classification: string;
    contractors: {
        company_name: string;
        uei?: string;
        city?: string;
        state?: string;
        certifications?: string[];
    };
}

export default function OpportunitiesPage() {
    const router = useRouter();
    const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [searchInput, setSearchInput] = useState("");
    const [activeSearch, setActiveSearch] = useState("");
    const [viewMode, setViewMode] = useState<"grid" | "list">("list");
    const [showFilters, setShowFilters] = useState(false);

    // Pagination
    const [page, setPage] = useState(1);
    const pageSize = 50;

    // Quick Filters
    const [quickFilter, setQuickFilter] = useState<"ALL" | "HAS_MATCHES" | "SOURCES_SOUGHT" | "ENRICHED">("ALL");

    // Sort — column header click-to-sort
    const [sortCol, setSortCol] = useState<string>("posted_date");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

    const handleColumnSort = (col: string) => {
        if (sortCol === col) {
            setSortDir(d => d === "asc" ? "desc" : "asc");
        } else {
            setSortCol(col);
            setSortDir(col === "posted_date" ? "desc" : "asc");
        }
        setPage(1);
    };

    const SortIndicator = ({ col }: { col: string }) => {
        if (sortCol !== col) return null;
        return sortDir === "asc" ? <ChevronUp className="w-3 h-3 inline ml-0.5" /> : <ChevronDown className="w-3 h-3 inline ml-0.5" />;
    };

    // Lifecycle stage helper
    const getLifecycleStage = (noticeType?: string) => {
        if (!noticeType) return null;
        const nt = noticeType.toLowerCase();
        if (nt.includes("sources sought") || nt.includes("rfi")) return { label: "Seed Planted", color: "bg-emerald-100 text-emerald-700 border-emerald-200", desc: "6-18 months before award", icon: Sprout };
        if (nt.includes("presolicitation")) return { label: "Growing", color: "bg-blue-100 text-blue-700 border-blue-200", desc: "3-6 months before award", icon: Leaf };
        if (nt.includes("solicitation") || nt.includes("combined") || nt.includes("synopsis")) return { label: "In Bloom", color: "bg-amber-100 text-amber-700 border-amber-200", desc: "Active bidding window", icon: Sun };
        if (nt.includes("award")) return { label: "Harvested", color: "bg-stone-800 text-stone-100 border-stone-700", desc: "Contract awarded", icon: Award };
        return null;
    };

    // Detail Panel State
    const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
    const [matchedContractors, setMatchedContractors] = useState<MatchedContractor[]>([]);
    const [loadingContractors, setLoadingContractors] = useState(false);

    // Advanced Filters
    const [filterAgency, setFilterAgency] = useState("");
    const [filterType, setFilterType] = useState("");
    const [filterNaics, setFilterNaics] = useState("");
    const [filterState, setFilterState] = useState("");
    const [filterSetAside, setFilterSetAside] = useState("");

    // Calculate data richness score
    const calcDataScore = (op: Opportunity): number => {
        let score = 0;
        if (op.description) score += 20;
        if (op.agency) score += 10;
        if (op.naics_code) score += 10;
        if (op.notice_type) score += 5;
        if (op.place_of_performance_state) score += 10;
        if (op.place_of_performance_city) score += 5;
        if (op.set_aside_code) score += 10;
        if (op.award_amount) score += 15;
        if (op.response_deadline) score += 5;
        if (op.incumbent_contractor_name) score += 10;
        return score;
    };

    const fetchOpportunities = useCallback(async () => {
        setLoading(true);
        try {
            let query = supabase
                .from("opportunities")
                .select("*, agencies(department, sub_tier), opportunity_types(name), set_asides(code)", { count: 'exact' });

            if (activeSearch) {
                query = query.or(`title.ilike.%${activeSearch}%,notice_id.ilike.%${activeSearch}%,agency.ilike.%${activeSearch}%`);
            }

            query = query.eq("is_archived", false);

            // Quick filters
            if (quickFilter === "SOURCES_SOUGHT") {
                query = query.eq("notice_type", "Sources Sought");
            }
            if (quickFilter === "ENRICHED") {
                query = query.neq("enrichment_status", "none");
            }

            if (filterAgency) {
                query = query.ilike("agency", `%${filterAgency}%`);
            }
            if (filterType) {
                query = query.eq("notice_type", filterType);
            }
            if (filterNaics) {
                query = query.ilike("naics_code", `%${filterNaics}%`);
            }
            if (filterState) {
                query = query.eq("place_of_performance_state", filterState);
            }
            if (filterSetAside) {
                query = query.ilike("set_aside_code", `%${filterSetAside}%`);
            }

            // Sorting via column headers
            const dbSortable = ["posted_date", "response_deadline", "notice_type", "place_of_performance_state", "naics_code"];
            if (dbSortable.includes(sortCol)) {
                query = query.order(sortCol, { ascending: sortDir === "asc", nullsFirst: false });
            } else {
                query = query.order("posted_date", { ascending: false }); // data_rich sorted client-side
            }

            const from = (page - 1) * pageSize;
            const to = from + pageSize - 1;

            const { data, count, error } = await query.range(from, to);

            if (error) {
                console.error("Error fetching ops:", error);
            } else {
                let results = (data || []) as Opportunity[];

                // Calculate data scores
                results = results.map(op => ({ ...op, _dataScore: calcDataScore(op) }));

                // Client-side sort by data richness
                if (sortCol === "data_rich") {
                    results.sort((a, b) => sortDir === "desc" ? (b._dataScore || 0) - (a._dataScore || 0) : (a._dataScore || 0) - (b._dataScore || 0));
                }

                // For HAS_MATCHES filter, we need to check which have matches
                if (quickFilter === "HAS_MATCHES") {
                    const oppIds = results.map(r => r.id);
                    if (oppIds.length > 0) {
                        const { data: matchData } = await supabase
                            .from("matches")
                            .select("opportunity_id")
                            .in("opportunity_id", oppIds);
                        const matchedIds = new Set((matchData || []).map(m => m.opportunity_id));
                        results = results.filter(r => matchedIds.has(r.id));
                    }
                }

                setOpportunities(results);
                setTotalCount(quickFilter === "HAS_MATCHES" ? results.length : (count || 0));
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [page, activeSearch, quickFilter, pageSize, filterAgency, filterType, filterNaics, filterState, filterSetAside, sortCol, sortDir]);

    useEffect(() => {
        fetchOpportunities();
    }, [fetchOpportunities]);

    // Fetch matched contractors when an opportunity is selected
    useEffect(() => {
        if (!selectedOpportunity) {
            setMatchedContractors([]);
            return;
        }
        async function fetchMatches() {
            setLoadingContractors(true);
            const { data } = await supabase
                .from("matches")
                .select("id, contractor_id, opportunity_id, score, classification, contractors(company_name, uei, city, state, certifications)")
                .eq("opportunity_id", selectedOpportunity!.id)
                .order("score", { ascending: false })
                .limit(10);
            setMatchedContractors((data || []) as unknown as MatchedContractor[]);
            setLoadingContractors(false);
        }
        fetchMatches();
    }, [selectedOpportunity]);

    const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            setPage(1);
            setActiveSearch(searchInput);
        }
    };

    const handleExport = () => {
        if (opportunities.length === 0) return;
        const headers = ["Notice ID", "Title", "Agency", "Notice Type", "NAICS", "State", "Set-Aside", "Deadline", "Award Amount"];
        const csvRows = [headers.join(",")];
        for (const row of opportunities) {
            const values = [
                `"${row.notice_id || ""}"`,
                `"${(row.title || "").replace(/"/g, '""')}"`,
                `"${(row.agency || "").replace(/"/g, '""')}"`,
                `"${row.notice_type || ""}"`,
                `"${row.naics_code || ""}"`,
                `"${row.place_of_performance_state || ""}"`,
                `"${row.set_aside_code || ""}"`,
                `"${row.response_deadline || ""}"`,
                `"${row.award_amount || ""}"`
            ];
            csvRows.push(values.join(","));
        }
        const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `opportunities_page_${page}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const totalPages = Math.ceil(totalCount / pageSize);

    const formatCurrency = (val: number | null | undefined) => {
        if (!val) return null;
        if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
        if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
        return `$${val.toLocaleString()}`;
    };

    return (
        <div className="flex gap-6 max-w-[1600px] mx-auto pb-12 items-start">
            {/* Main Content Area */}
            <div className={clsx("transition-all duration-500 ease-in-out flex-1 flex flex-col", selectedOpportunity ? "hidden lg:flex lg:w-1/2 xl:w-2/3" : "w-full")}>
                <div className="animate-in fade-in duration-500 flex flex-col">
                    <header className="flex flex-col md:flex-row md:items-end justify-between mb-8 space-y-4 md:space-y-0">
                        <div>
                            <h2 className="text-3xl font-bold font-typewriter tracking-tighter text-black flex items-center">
                                Opportunities
                                <span className="ml-4 text-sm font-sans font-medium bg-stone-100 px-3 py-1 rounded-full text-stone-500 border border-stone-200">
                                    {totalCount.toLocaleString()} Records
                                </span>
                            </h2>
                            <p className="text-stone-500 mt-2 font-medium">
                                SAM.gov Federal Opportunities (Live)
                            </p>
                        </div>
                        <div className="flex space-x-3 items-center">
                            <div className="flex items-center bg-stone-100 p-1 rounded-full border border-stone-200">
                                <button type="button" title="Grid View" onClick={() => setViewMode("grid")} className={clsx("p-2 rounded-full transition-all", viewMode === "grid" ? "bg-white shadow-sm text-black" : "text-stone-500 hover:text-black")}>
                                    <LayoutGrid className="w-4 h-4" />
                                </button>
                                <button type="button" title="List View" onClick={() => setViewMode("list")} className={clsx("p-2 rounded-full transition-all", viewMode === "list" ? "bg-white shadow-sm text-black" : "text-stone-500 hover:text-black")}>
                                    <List className="w-4 h-4" />
                                </button>
                            </div>

                            <button type="button" title="Filters" onClick={() => setShowFilters(!showFilters)} className={clsx("flex items-center space-x-2 px-4 py-2.5 rounded-full border transition-all text-sm font-medium", showFilters ? "bg-black text-white border-black" : "bg-white text-stone-700 border-stone-200 hover:border-black")}>
                                <Filter className="w-4 h-4" />
                                <span className="font-typewriter">Filters</span>
                            </button>

                            <button type="button" title="Export" onClick={handleExport} className="flex items-center space-x-2 bg-stone-100 text-black px-4 py-2.5 rounded-full border border-stone-200 hover:border-stone-300 hover:bg-stone-200 transition-all text-sm font-bold">
                                <Download className="w-4 h-4" />
                                <span className="font-typewriter hidden sm:inline">Export</span>
                            </button>
                        </div>
                    </header>

                    {/* Quick Filters + Sort Bar */}
                    <section className="bg-stone-50 border border-stone-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 mb-6">
                        <div className="flex items-center space-x-2 flex-wrap gap-2">
                            {([
                                { key: "ALL" as const, label: "All Records", icon: null },
                                { key: "HAS_MATCHES" as const, label: "Has Matches", icon: Flame },
                                { key: "SOURCES_SOUGHT" as const, label: "Sources Sought", icon: Sparkles },
                                { key: "ENRICHED" as const, label: "Enriched", icon: Target },
                            ]).map(tab => (
                                <button
                                    type="button"
                                    key={tab.key}
                                    onClick={() => { setQuickFilter(tab.key); setPage(1); }}
                                    className={clsx(
                                        "text-xs font-bold font-typewriter uppercase tracking-widest px-4 py-2 rounded-full transition-all shadow-sm border flex items-center",
                                        quickFilter === tab.key ? "bg-black text-white border-black" : "bg-white text-stone-600 border-stone-200 hover:bg-stone-100"
                                    )}
                                >
                                    {tab.icon && <tab.icon className="w-3 h-3 mr-1.5" />}
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-stone-500 font-typewriter">
                            <span>Sort by column headers</span>
                        </div>
                    </section>

                    {/* Advanced Filters Panel */}
                    {showFilters && (
                        <section className="bg-white border border-stone-200 rounded-2xl p-4 flex flex-wrap gap-4 mb-6 animate-in slide-in-from-top-2 duration-300">
                            <div className="flex-1 min-w-[180px]">
                                <p className="text-[10px] font-typewriter text-stone-500 uppercase mb-2">Agency</p>
                                <input
                                    type="text"
                                    placeholder="e.g. Defense"
                                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
                                    value={filterAgency}
                                    onChange={(e) => { setFilterAgency(e.target.value); setPage(1); }}
                                />
                            </div>
                            <div className="flex-1 min-w-[150px]">
                                <p className="text-[10px] font-typewriter text-stone-500 uppercase mb-2">Notice Type</p>
                                <select
                                    title="Notice Type"
                                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
                                    value={filterType}
                                    onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
                                >
                                    <option value="">All Types</option>
                                    <option value="Sources Sought">Sources Sought</option>
                                    <option value="Solicitation">Solicitation</option>
                                    <option value="Special Notice">Special Notice</option>
                                    <option value="Presolicitation">Presolicitation</option>
                                    <option value="Award Notice">Award Notice</option>
                                </select>
                            </div>
                            <div className="flex-1 min-w-[120px]">
                                <p className="text-[10px] font-typewriter text-stone-500 uppercase mb-2">NAICS</p>
                                <input
                                    type="text"
                                    placeholder="e.g. 561720"
                                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
                                    value={filterNaics}
                                    onChange={(e) => { setFilterNaics(e.target.value); setPage(1); }}
                                />
                            </div>
                            <div className="flex-1 min-w-[120px]">
                                <p className="text-[10px] font-typewriter text-stone-500 uppercase mb-2">State</p>
                                <select
                                    title="State"
                                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
                                    value={filterState}
                                    onChange={(e) => { setFilterState(e.target.value); setPage(1); }}
                                >
                                    <option value="">All States</option>
                                    {["AL","AK","AZ","AR","CA","CO","CT","DC","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"].map(s => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex-1 min-w-[120px]">
                                <p className="text-[10px] font-typewriter text-stone-500 uppercase mb-2">Set-Aside</p>
                                <select
                                    title="Set-Aside"
                                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
                                    value={filterSetAside}
                                    onChange={(e) => { setFilterSetAside(e.target.value); setPage(1); }}
                                >
                                    <option value="">All</option>
                                    <option value="SBA">Small Business (SBA)</option>
                                    <option value="8A">8(a)</option>
                                    <option value="SDVOSB">SDVOSB</option>
                                    <option value="WOSB">WOSB</option>
                                    <option value="HUBZone">HUBZone</option>
                                </select>
                            </div>
                            {(filterAgency || filterType || filterNaics || filterState || filterSetAside) && (
                                <button
                                    type="button"
                                    onClick={() => { setFilterAgency(""); setFilterType(""); setFilterNaics(""); setFilterState(""); setFilterSetAside(""); setPage(1); }}
                                    className="self-end px-4 py-2 text-xs font-bold font-typewriter text-red-600 bg-red-50 border border-red-200 rounded-full hover:bg-red-100"
                                >
                                    Clear All
                                </button>
                            )}
                        </section>
                    )}

                    {/* Search Bar */}
                    <div className="bg-white p-2 rounded-full border border-stone-200 shadow-sm flex items-center mb-6 focus-within:ring-2 focus-within:ring-black focus-within:border-transparent transition-all">
                        <Search className="w-5 h-5 text-stone-400 ml-4 mr-2" />
                        <input
                            type="text"
                            placeholder="Search by title, notice ID, or agency..."
                            className="bg-transparent border-none outline-none w-full text-stone-700 font-typewriter text-sm"
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            onKeyDown={handleSearchKeyDown}
                        />
                        {activeSearch && (
                            <button type="button" title="Clear Search" onClick={() => { setSearchInput(""); setActiveSearch(""); setPage(1); }} className="p-2 text-stone-400 hover:text-black">
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>

                    {loading && opportunities.length === 0 ? (
                        <div className="flex justify-center p-12">
                            <Loader2 className="w-8 h-8 animate-spin text-stone-400" />
                        </div>
                    ) : (
                        <div className="flex-1 pr-2 flex flex-col pb-4">
                            {/* List View */}
                            {viewMode === "list" && (
                                <div className="bg-white rounded-[32px] border border-stone-200 shadow-sm overflow-hidden mb-6 flex-shrink-0">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 text-[10px] font-typewriter uppercase tracking-wider">
                                                <th className="py-4 px-5 font-bold cursor-pointer hover:text-black select-none" onClick={() => handleColumnSort("posted_date")}>Posted <SortIndicator col="posted_date" /></th>
                                                <th className="py-4 px-5 font-bold">Title / Agency</th>
                                                <th className="py-4 px-5 font-bold cursor-pointer hover:text-black select-none" onClick={() => handleColumnSort("notice_type")}>Type <SortIndicator col="notice_type" /></th>
                                                <th className="py-4 px-5 font-bold cursor-pointer hover:text-black select-none" onClick={() => handleColumnSort("naics_code")}>NAICS <SortIndicator col="naics_code" /></th>
                                                <th className="py-4 px-5 font-bold cursor-pointer hover:text-black select-none" onClick={() => handleColumnSort("place_of_performance_state")}>State <SortIndicator col="place_of_performance_state" /></th>
                                                <th className="py-4 px-5 font-bold hidden xl:table-cell">Value</th>
                                                <th className="py-4 px-5 font-bold cursor-pointer hover:text-black select-none" onClick={() => handleColumnSort("response_deadline")}>Deadline <SortIndicator col="response_deadline" /></th>
                                                <th className="py-4 px-5 font-bold cursor-pointer hover:text-black select-none" onClick={() => handleColumnSort("data_rich")}>Data <SortIndicator col="data_rich" /></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-stone-100 text-sm">
                                            {opportunities.map((op) => {
                                                const typeName = op.notice_type || op.opportunity_types?.name || "UNKNOWN";
                                                const agencyName = op.agency || op.agencies?.sub_tier || op.agencies?.department || "No Agency Info";
                                                const dataScore = op._dataScore || 0;
                                                return (
                                                    <tr key={op.id} onClick={() => setSelectedOpportunity(op)} onDoubleClick={() => router.push(`/opportunities/${op.id}`)} className={clsx("transition-colors group cursor-pointer", selectedOpportunity?.id === op.id ? "bg-stone-100" : "hover:bg-stone-50")}>
                                                        <td className="py-3.5 px-5 font-mono text-xs text-stone-500">{op.posted_date ? new Date(op.posted_date).toLocaleDateString() : "---"}</td>
                                                        <td className="py-3.5 px-5">
                                                            <p className="font-bold text-black line-clamp-1 max-w-[200px] xl:max-w-md group-hover:text-stone-600">{op.title}</p>
                                                            <p className="text-stone-500 text-xs line-clamp-1 mt-0.5">{agencyName}</p>
                                                        </td>
                                                        <td className="py-3.5 px-5">
                                                            <span className={clsx(
                                                                "font-typewriter text-[9px] px-2 py-1 rounded border uppercase tracking-widest whitespace-nowrap",
                                                                typeName === "Sources Sought" ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
                                                                typeName === "Presolicitation" ? "bg-blue-100 text-blue-700 border-blue-200" :
                                                                "bg-stone-100 text-stone-600 border-stone-200"
                                                            )}>
                                                                {typeName}
                                                            </span>
                                                        </td>
                                                        <td className="py-3.5 px-5 font-mono font-bold text-xs">{op.naics_code || "---"}</td>
                                                        <td className="py-3.5 px-5 font-mono text-xs">{op.place_of_performance_state || "---"}</td>
                                                        <td className="py-3.5 px-5 font-mono font-bold text-xs hidden xl:table-cell">
                                                            {formatCurrency(op.award_amount) || <span className="text-stone-300">---</span>}
                                                        </td>
                                                        <td className="py-3.5 px-5 font-bold text-stone-700 text-xs">
                                                            {op.response_deadline ? new Date(op.response_deadline).toLocaleDateString() : "TBD"}
                                                        </td>
                                                        <td className="py-3.5 px-5">
                                                            <div className="flex items-center space-x-1" title={`Data richness: ${dataScore}%`}>
                                                                <div className="w-12 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                                                                    <div className={clsx("h-full rounded-full", dataScore >= 60 ? "bg-green-500" : dataScore >= 30 ? "bg-amber-500" : "bg-stone-300")} style={{ width: `${dataScore}%` }} />
                                                                </div>
                                                                <span className="text-[10px] font-mono text-stone-400">{dataScore}</span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Grid View */}
                            {viewMode === "grid" && (
                                <div className={clsx("grid gap-5 transition-all mb-6", selectedOpportunity ? "grid-cols-1 xl:grid-cols-2" : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3")}>
                                    {opportunities.map((op) => {
                                        const typeName = op.notice_type || op.opportunity_types?.name || "UNKNOWN";
                                        const agencyName = op.agency || op.agencies?.sub_tier || op.agencies?.department || "No Agency Info";
                                        return (
                                            <button
                                                type="button"
                                                key={op.id}
                                                onClick={() => setSelectedOpportunity(op)}
                                                onDoubleClick={() => router.push(`/opportunities/${op.id}`)}
                                                className={clsx("block group text-left h-full transition-all outline-none", selectedOpportunity?.id === op.id ? "ring-2 ring-black rounded-[28px]" : "")}
                                            >
                                                <div className="bg-white h-full p-5 rounded-[28px] border border-stone-200 shadow-sm group-hover:shadow-md group-hover:border-black transition-all flex flex-col justify-between">
                                                    <div>
                                                        <div className="flex justify-between items-start mb-3">
                                                            <span className={clsx(
                                                                "font-typewriter text-[9px] px-2 py-1 rounded border uppercase tracking-widest",
                                                                typeName === "Sources Sought" ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
                                                                "bg-stone-100 text-stone-600 border-stone-200"
                                                            )}>
                                                                {typeName}
                                                            </span>
                                                            {op.award_amount && (
                                                                <span className="font-mono font-bold text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded border border-green-200">{formatCurrency(op.award_amount)}</span>
                                                            )}
                                                        </div>
                                                        <h3 className="font-bold text-base mb-2 line-clamp-2 leading-tight group-hover:text-stone-600 transition-colors">{op.title}</h3>
                                                        <p className="text-stone-500 text-sm line-clamp-1 mb-3">{agencyName}</p>
                                                    </div>
                                                    <div className="pt-3 border-t border-stone-100 flex justify-between items-center mt-auto">
                                                        <div className="flex items-center space-x-3">
                                                            <span className="font-mono font-bold text-xs">{op.naics_code || "N/A"}</span>
                                                            {op.place_of_performance_state && (
                                                                <span className="text-xs text-stone-400">{op.place_of_performance_state}</span>
                                                            )}
                                                        </div>
                                                        <span className="font-bold text-xs text-stone-700">
                                                            {op.response_deadline ? new Date(op.response_deadline).toLocaleDateString() : "TBD"}
                                                        </span>
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {opportunities.length === 0 && !loading && (
                                <div className="bg-stone-50 border border-stone-200 border-dashed rounded-[32px] p-12 text-center mt-auto mb-auto">
                                    <p className="text-stone-500 font-typewriter">No opportunities match the criteria.</p>
                                </div>
                            )}

                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div className="mt-auto pt-6 flex flex-col md:flex-row items-center justify-between px-2 gap-4">
                                    <p className="text-xs text-stone-500 font-typewriter">
                                        Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, totalCount)} of {totalCount.toLocaleString()} results
                                    </p>
                                    <div className="flex items-center space-x-2">
                                        <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-4 py-2 bg-white border border-stone-200 rounded-full hover:bg-stone-50 disabled:opacity-50 transition-colors flex items-center font-bold text-sm">
                                            <ChevronLeft className="w-4 h-4 mr-1" /> Prev
                                        </button>
                                        <span className="text-xs font-mono px-4 text-stone-600">Page {page} of {totalPages}</span>
                                        <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-4 py-2 bg-white border border-stone-200 rounded-full hover:bg-stone-50 disabled:opacity-50 transition-colors flex items-center font-bold text-sm">
                                            Next <ChevronRight className="w-4 h-4 ml-1" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Slide-Over Panel */}
            {selectedOpportunity && (
                <div className="w-full lg:w-1/2 xl:w-1/3 h-[calc(100vh-80px)] xl:h-[calc(100vh-120px)] sticky top-[40px] xl:top-[60px] bg-white border border-stone-200 shadow-2xl rounded-[40px] flex flex-col overflow-hidden animate-in slide-in-from-right-16 duration-300">
                    <div className="p-6 border-b border-stone-100 flex justify-between items-center bg-stone-50/50 flex-shrink-0">
                        <div className="flex items-center space-x-2">
                            <span className="bg-black text-white font-typewriter text-[10px] px-2 py-1 rounded uppercase tracking-wider">
                                Active View
                            </span>
                            <span className="font-mono text-stone-400 text-xs">{selectedOpportunity.notice_id?.slice(0, 16)}</span>
                        </div>
                        <button
                            type="button"
                            title="Close Window"
                            onClick={() => setSelectedOpportunity(null)}
                            className="p-2 hover:bg-stone-200 rounded-full transition-colors text-stone-500 hover:text-black"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="overflow-y-auto flex-1 p-6 custom-scrollbar space-y-6">
                        {/* Title & Agency */}
                        <div>
                            <h2 className="text-xl font-bold font-typewriter tracking-tight text-black leading-tight mb-3">
                                {selectedOpportunity.title}
                            </h2>
                            <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center">
                                    <Building className="w-5 h-5 text-stone-600" />
                                </div>
                                <div className="flex-1">
                                    <p className="font-bold text-stone-800 text-sm leading-tight">
                                        {selectedOpportunity.agency || selectedOpportunity.agencies?.department || "Unknown Department"}
                                    </p>
                                    {selectedOpportunity.agencies?.sub_tier && (
                                        <p className="text-xs text-stone-400">{selectedOpportunity.agencies.sub_tier}</p>
                                    )}
                                </div>
                                {selectedOpportunity.place_of_performance_state && (
                                    <span className="font-mono font-bold text-xs bg-stone-100 border border-stone-200 px-3 py-1.5 rounded-full">{selectedOpportunity.place_of_performance_state}</span>
                                )}
                            </div>
                        </div>

                        {/* Lifecycle Stage Badge */}
                        {(() => {
                            const stage = getLifecycleStage(selectedOpportunity.notice_type || selectedOpportunity.opportunity_types?.name);
                            if (!stage) return null;
                            const Icon = stage.icon;
                            return (
                                <div className={clsx("flex items-center space-x-3 p-4 rounded-xl border", stage.color)}>
                                    <Icon className="w-5 h-5 flex-shrink-0" />
                                    <div>
                                        <p className="font-bold text-sm">{stage.label}</p>
                                        <p className="text-xs opacity-75">{stage.desc}</p>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Metrics Grid */}
                        <div className="grid grid-cols-2 gap-3">
                            {selectedOpportunity.posted_date && (
                                <div className="bg-stone-50 border border-stone-200 p-3 rounded-xl">
                                    <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1">Posted</p>
                                    <p className="font-bold text-sm">{new Date(selectedOpportunity.posted_date).toLocaleDateString()}</p>
                                </div>
                            )}
                            <div className="bg-stone-50 border border-stone-200 p-3 rounded-xl">
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1">NAICS</p>
                                <p className="font-mono font-bold text-sm">{selectedOpportunity.naics_code || "---"}</p>
                            </div>
                            <div className="bg-stone-50 border border-stone-200 p-3 rounded-xl">
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1">Notice Type</p>
                                <p className="font-typewriter font-bold text-xs pt-0.5">
                                    {selectedOpportunity.notice_type || selectedOpportunity.opportunity_types?.name || "N/A"}
                                </p>
                            </div>
                            <div className="bg-stone-50 border border-stone-200 p-3 rounded-xl">
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1">Set-Aside</p>
                                <p className="font-typewriter font-bold text-xs pt-0.5">
                                    {selectedOpportunity.set_aside_code || selectedOpportunity.set_asides?.code || "Unrestricted"}
                                </p>
                            </div>
                            <div className="bg-stone-50 border border-stone-200 p-3 rounded-xl border-l-4 border-l-stone-800">
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1">Deadline</p>
                                <p className="font-bold text-sm text-black">
                                    {selectedOpportunity.response_deadline ? new Date(selectedOpportunity.response_deadline).toLocaleDateString() : "TBD"}
                                </p>
                            </div>
                            {selectedOpportunity.place_of_performance_state && (
                                <div className="bg-stone-50 border border-stone-200 p-3 rounded-xl">
                                    <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1">Location</p>
                                    <p className="font-bold text-sm">{[selectedOpportunity.place_of_performance_city, selectedOpportunity.place_of_performance_state].filter(Boolean).join(", ")}</p>
                                </div>
                            )}
                            {selectedOpportunity.award_amount && (
                                <div className="bg-green-50 border border-green-200 p-3 rounded-xl">
                                    <p className="text-[10px] font-typewriter text-green-600 uppercase tracking-widest mb-1">Est. Value</p>
                                    <p className="font-mono font-bold text-sm text-green-800">{formatCurrency(selectedOpportunity.award_amount)}</p>
                                </div>
                            )}
                        </div>

                        {/* Incumbent Info */}
                        {selectedOpportunity.incumbent_contractor_name && (
                            <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
                                <p className="text-[10px] font-typewriter text-amber-600 uppercase tracking-widest mb-1">Incumbent Contractor</p>
                                <p className="font-bold text-sm text-amber-900">{selectedOpportunity.incumbent_contractor_name}</p>
                            </div>
                        )}

                        {/* Matched Contractors */}
                        <div className="border border-stone-200 rounded-2xl p-5 bg-white shadow-sm">
                            <h4 className="font-typewriter font-bold text-xs mb-4 flex items-center text-stone-800 uppercase tracking-wider">
                                <Users className="w-4 h-4 mr-2" /> Matched Contractors
                                {matchedContractors.length > 0 && (
                                    <span className="ml-2 bg-stone-100 text-stone-500 font-mono text-[10px] px-2 py-0.5 rounded-full">{matchedContractors.length}</span>
                                )}
                            </h4>
                            {loadingContractors ? (
                                <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-stone-400" /></div>
                            ) : matchedContractors.length === 0 ? (
                                <p className="text-stone-400 text-xs font-typewriter">No matches yet. Run the Scoring Engine.</p>
                            ) : (
                                <div className="space-y-2">
                                    {matchedContractors.map((mc) => (
                                        <div key={mc.id} className="bg-stone-50 p-3 rounded-xl border border-stone-100 flex justify-between items-center hover:border-stone-300 transition-colors cursor-pointer" onClick={() => router.push(`/matches/${mc.opportunity_id}/${mc.contractor_id}`)}>
                                            <div>
                                                <p className="font-bold text-sm text-stone-900">{mc.contractors?.company_name}</p>
                                                <div className="flex items-center space-x-2 mt-0.5">
                                                    {mc.contractors?.city && <span className="text-xs text-stone-400">{mc.contractors.city}, {mc.contractors.state}</span>}
                                                    {mc.contractors?.certifications?.slice(0, 2).map(c => (
                                                        <span key={c} className="text-[9px] bg-black text-white px-1.5 py-0.5 rounded font-typewriter uppercase">{c}</span>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="flex items-center space-x-2">
                                                <span className={clsx("w-2 h-2 rounded-full", mc.classification === "HOT" ? "bg-red-500" : mc.classification === "WARM" ? "bg-amber-500" : "bg-stone-300")}></span>
                                                <span className="font-mono font-bold text-sm">{Math.round(mc.score * 100)}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Description */}
                        {selectedOpportunity.description && (
                            <div className="border border-stone-200 rounded-2xl p-5 bg-white shadow-sm">
                                <h4 className="font-typewriter font-bold text-xs mb-4 flex items-center text-stone-800 uppercase tracking-wider">
                                    <FileText className="w-4 h-4 mr-2" /> Description
                                </h4>
                                <div className="text-sm text-stone-600 max-h-48 overflow-y-auto whitespace-pre-wrap font-sans">
                                    {selectedOpportunity.description}
                                </div>
                            </div>
                        )}

                        {selectedOpportunity.link && (
                            <a
                                href={selectedOpportunity.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center space-x-2 text-sm font-bold font-typewriter bg-stone-100 border border-stone-200 w-full py-4 rounded-full hover:bg-stone-200 hover:border-stone-300 transition-all text-black"
                            >
                                <LinkIcon className="w-4 h-4" />
                                <span>View on SAM.gov</span>
                            </a>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
