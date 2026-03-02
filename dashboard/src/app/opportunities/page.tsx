"use client";

import { useEffect, useState, useCallback, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { Search, Filter, Loader2, LayoutGrid, List, Download, ArrowRight, X, Building, Target, FileText, Calendar, Link as LinkIcon, Sparkles, ChevronLeft, ChevronRight } from "lucide-react";
import clsx from "clsx";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ryxgjzehoijjvczqkhwr.supabase.co",
    // Use anon key for standard UI queries
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
    historical_bidders?: number;
    award_amount?: number;
    agencies?: { department: string; sub_tier?: string };
    opportunity_types?: { name: string };
    set_asides?: { code: string };
}

export default function OpportunitiesPage() {
    const router = useRouter();
    const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [searchInput, setSearchInput] = useState("");
    const [activeSearch, setActiveSearch] = useState(""); // Submitted search
    const [viewMode, setViewMode] = useState<"grid" | "list">("list");
    const [showFilters, setShowFilters] = useState(false);

    // Pagination
    const [page, setPage] = useState(1);
    const pageSize = 50;

    // Fast Pre-Filters (Masterguide)
    const [quickFilter, setQuickFilter] = useState<"ALL" | "EASY_WIN" | "HIGH_PROB">("ALL");

    // Detail Panel State
    const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);

    // Advanced Filters
    const [filterAgency, setFilterAgency] = useState("");
    const [filterType, setFilterType] = useState("");
    const [filterNaics, setFilterNaics] = useState("");
    const [filterDensity, setFilterDensity] = useState(""); // Low, Med, High

    const fetchOpportunities = useCallback(async () => {
        setLoading(true);
        try {
            let query = supabase
                .from("opportunities")
                .select("*, agencies(department, sub_tier), opportunity_types(name), set_asides(code)", { count: 'exact' });

            if (activeSearch) {
                // ILIKE on title or notice_id
                query = query.or(`title.ilike.%${activeSearch}%,notice_id.ilike.%${activeSearch}%`);
            }

            // Base constraint
            query = query.eq("is_archived", false);

            if (quickFilter === "EASY_WIN") {
                // Easy Win: Sources Sought or less than 5 historical bidders
                query = query.lt('historical_bidders', 5);
            }

            if (quickFilter === "HIGH_PROB") {
                // High Win Probability: Low competition and set-asides
                query = query.lt('historical_bidders', 8).not('set_aside_id', 'is', null);
            }

            if (filterAgency) {
                query = query.ilike("agency", `%${filterAgency}%`);
            }

            if (filterType) {
                query = query.eq("opportunity_type_id", filterType);
            }

            if (filterNaics) {
                query = query.ilike("naics_code", `%${filterNaics}%`);
            }

            if (filterDensity === "LOW") {
                query = query.lt("historical_bidders", 5);
            } else if (filterDensity === "MED") {
                query = query.gte("historical_bidders", 5).lt("historical_bidders", 10);
            } else if (filterDensity === "HIGH") {
                query = query.gte("historical_bidders", 10);
            }

            // Pagination boundaries
            const from = (page - 1) * pageSize;
            const to = from + pageSize - 1;

            const { data, count, error } = await query
                .order('posted_date', { ascending: false })
                .range(from, to);

            if (error) {
                console.error("Error fetching ops:", error);
            } else {
                setOpportunities(data || []);
                setTotalCount(count || 0);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [page, activeSearch, quickFilter, pageSize, filterAgency, filterType, filterNaics, filterDensity]);

    useEffect(() => {
        fetchOpportunities();
    }, [fetchOpportunities, filterAgency, filterType, filterNaics, filterDensity]);

    const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            setPage(1);
            setActiveSearch(searchInput);
        }
    };

    const handleExport = () => {
        if (opportunities.length === 0) return;
        const headers = ["Notice ID", "Title", "Agency", "Notice Type", "NAICS", "Deadline"];
        const csvRows = [headers.join(",")];
        for (const row of opportunities) {
            const agencyName = row.agency || "";
            const typeName = row.notice_type || "";
            const values = [
                `"${row.notice_id || ""}"`,
                `"${(row.title || "").replace(/"/g, '""')}"`,
                `"${agencyName.replace(/"/g, '""')}"`,
                `"${typeName}"`,
                `"${row.naics_code || ""}"`,
                `"${row.response_deadline || ""}"`
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
                                Data synced directly from SAM.gov APIs (Live)
                            </p>
                        </div>
                        <div className="flex space-x-3 items-center">
                            <div className="flex items-center bg-stone-100 p-1 rounded-full border border-stone-200">
                                <button title="Grid View" onClick={() => setViewMode("grid")} className={clsx("p-2 rounded-full transition-all", viewMode === "grid" ? "bg-white shadow-sm text-black" : "text-stone-500 hover:text-black")}>
                                    <LayoutGrid className="w-4 h-4" />
                                </button>
                                <button title="List View" onClick={() => setViewMode("list")} className={clsx("p-2 rounded-full transition-all", viewMode === "list" ? "bg-white shadow-sm text-black" : "text-stone-500 hover:text-black")}>
                                    <List className="w-4 h-4" />
                                </button>
                            </div>

                            <button title="Filters" onClick={() => setShowFilters(!showFilters)} className={clsx("flex items-center space-x-2 px-4 py-2.5 rounded-full border transition-all text-sm font-medium", showFilters ? "bg-black text-white border-black" : "bg-white text-stone-700 border-stone-200 hover:border-black")}>
                                <Filter className="w-4 h-4" />
                                <span className="font-typewriter">Filters</span>
                            </button>

                            <button title="Export" onClick={handleExport} className="flex items-center space-x-2 bg-stone-100 text-black px-4 py-2.5 rounded-full border border-stone-200 hover:border-stone-300 hover:bg-stone-200 transition-all text-sm font-bold">
                                <Download className="w-4 h-4" />
                                <span className="font-typewriter hidden sm:inline">Export Page</span>
                            </button>
                        </div>
                    </header>

                    {/* Pre-Filters Bar */}
                    <section className="bg-stone-50 border border-stone-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 mb-6">
                        <div className="flex items-center space-x-3">
                            <button
                                onClick={() => { setQuickFilter("ALL"); setPage(1); }}
                                className={clsx("text-xs font-bold font-typewriter uppercase tracking-widest px-4 py-2 rounded-full transition-all shadow-sm border", quickFilter === "ALL" ? "bg-black text-white border-black" : "bg-white text-stone-600 border-stone-200 hover:bg-stone-100")}
                            >
                                All Records
                            </button>
                            <button
                                onClick={() => { setQuickFilter("EASY_WIN"); setPage(1); }}
                                className={clsx("text-xs font-bold font-typewriter uppercase tracking-widest px-4 py-2 rounded-full transition-all shadow-sm border flex items-center", quickFilter === "EASY_WIN" ? "bg-amber-100 text-amber-900 border-amber-300" : "bg-white text-stone-600 border-stone-200 hover:bg-stone-100")}
                            >
                                <Sparkles className="w-3 h-3 mr-2" /> Easy Wins
                            </button>
                            <button
                                onClick={() => { setQuickFilter("HIGH_PROB"); setPage(1); }}
                                className={clsx("text-xs font-bold font-typewriter uppercase tracking-widest px-4 py-2 rounded-full transition-all shadow-sm border flex items-center", quickFilter === "HIGH_PROB" ? "bg-green-100 text-green-900 border-green-300" : "bg-white text-stone-600 border-stone-200 hover:bg-stone-100")}
                            >
                                <Target className="w-3 h-3 mr-2" /> High Win Prob (Low Comp)
                            </button>
                        </div>

                        {showFilters && (
                            <div className="flex flex-wrap gap-4 w-full animate-in slide-in-from-top-2 duration-300">
                                <div className="flex-1 min-w-[200px]">
                                    <p className="text-[10px] font-typewriter text-stone-500 uppercase mb-2">Agency Filter</p>
                                    <input
                                        type="text"
                                        placeholder="e.g. Dept of Defense"
                                        className="w-full bg-white border border-stone-200 rounded-2xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
                                        value={filterAgency}
                                        onChange={(e) => setFilterAgency(e.target.value)}
                                    />
                                </div>
                                <div className="flex-1 min-w-[200px]">
                                    <p className="text-[10px] font-typewriter text-stone-500 uppercase mb-2">Notice Type</p>
                                    <select
                                        title="Notice Type"
                                        className="w-full bg-white border border-stone-200 rounded-2xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
                                        value={filterType}
                                        onChange={(e) => setFilterType(e.target.value)}
                                    >
                                        <option value="">All Types</option>
                                        <option value="Sources Sought">Sources Sought</option>
                                        <option value="Solicitation">Solicitation</option>
                                        <option value="Special Notice">Special Notice</option>
                                        <option value="Presolicitation">Presolicitation</option>
                                    </select>
                                </div>
                                <div className="flex-1 min-w-[150px]">
                                    <p className="text-[10px] font-typewriter text-stone-500 uppercase mb-2">NAICS Override</p>
                                    <input
                                        type="text"
                                        placeholder="e.g. 541512"
                                        className="w-full bg-white border border-stone-200 rounded-2xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
                                        value={filterNaics}
                                        onChange={(e) => setFilterNaics(e.target.value)}
                                    />
                                </div>
                                <div className="flex-1 min-w-[150px]">
                                    <p className="text-[10px] font-typewriter text-stone-500 uppercase mb-2">Competition Density</p>
                                    <select
                                        title="Competition Density"
                                        className="w-full bg-white border border-stone-200 rounded-2xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
                                        value={filterDensity}
                                        onChange={(e) => setFilterDensity(e.target.value)}
                                    >
                                        <option value="">All Densities</option>
                                        <option value="LOW">Low (&lt;5 Bidders)</option>
                                        <option value="MED">Medium (5-9 Bidders)</option>
                                        <option value="HIGH">High (10+ Bidders)</option>
                                    </select>
                                </div>
                            </div>
                        )}
                    </section>

                    {/* Search Bar */}
                    <div className="bg-white p-2 rounded-full border border-stone-200 shadow-sm flex items-center mb-6 focus-within:ring-2 focus-within:ring-black focus-within:border-transparent transition-all">
                        <Search className="w-5 h-5 text-stone-400 ml-4 mr-2" />
                        <input
                            type="text"
                            placeholder="Press Enter to Search by Notice ID or Title..."
                            className="bg-transparent border-none outline-none w-full text-stone-700 font-typewriter text-sm"
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            onKeyDown={handleSearchKeyDown}
                        />
                        {activeSearch && (
                            <button title="Clear Search" onClick={() => { setSearchInput(""); setActiveSearch(""); setPage(1); }} className="p-2 text-stone-400 hover:text-black">
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
                            {/* Grid View */}
                            {viewMode === "grid" && (
                                <div className={clsx("grid gap-6 transition-all mb-6", selectedOpportunity ? "grid-cols-1 xl:grid-cols-2" : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3")}>
                                    {opportunities.map((op) => {
                                        const typeName = op.opportunity_types?.name || "UNKNOWN";
                                        const agencyName = op.agencies?.sub_tier || op.agencies?.department || "No Agency Info";
                                        return (
                                            <button
                                                key={op.id}
                                                onClick={() => setSelectedOpportunity(op)}
                                                onDoubleClick={() => router.push(`/opportunities/${op.id}`)}
                                                className={clsx(
                                                    "block group text-left h-full transition-all outline-none",
                                                    selectedOpportunity?.id === op.id ? "ring-2 ring-black rounded-[32px]" : ""
                                                )}
                                            >
                                                <div className="bg-white h-full p-6 rounded-[32px] border border-stone-200 shadow-sm group-hover:shadow-md group-hover:border-black transition-all flex flex-col justify-between">
                                                    <div>
                                                        <div className="flex justify-between items-start mb-3">
                                                            <span className="bg-stone-100 text-stone-600 font-typewriter text-[10px] px-2 py-1 rounded-md border border-stone-200 uppercase tracking-wider">
                                                                {typeName}
                                                            </span>
                                                            <span className="text-stone-400 font-mono text-xs">{op.notice_id}</span>
                                                        </div>
                                                        <h3 className="font-bold text-lg mb-2 line-clamp-2 leading-tight group-hover:text-stone-600 transition-colors">{op.title}</h3>
                                                        <p className="text-stone-500 text-sm line-clamp-1 mb-4">{agencyName}</p>
                                                    </div>

                                                    <div className="pt-4 border-t border-stone-100 flex justify-between items-center mt-auto">
                                                        <div className="space-y-1">
                                                            <p className="text-[10px] text-stone-400 font-typewriter uppercase">NAICS</p>
                                                            <p className="font-mono font-bold text-sm">{op.naics_code || "N/A"}</p>
                                                        </div>
                                                        <div className="space-y-1 text-right">
                                                            <p className="text-[10px] text-stone-400 font-typewriter uppercase">Deadline</p>
                                                            <p className="font-sans font-bold text-sm text-stone-700">
                                                                {op.response_deadline ? new Date(op.response_deadline).toLocaleDateString() : "TBD"}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {/* List View */}
                            {viewMode === "list" && (
                                <div className="bg-white rounded-[32px] border border-stone-200 shadow-sm overflow-hidden mb-6 flex-shrink-0">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 text-[10px] font-typewriter uppercase tracking-wider">
                                                <th className="py-4 px-6 font-bold">Notice ID</th>
                                                <th className="py-4 px-6 font-bold">Title / Agency</th>
                                                <th className="py-4 px-6 font-bold">Type</th>
                                                <th className="py-4 px-6 font-bold">NAICS</th>
                                                <th className="py-4 px-6 font-bold">Deadline</th>
                                                <th className="py-4 px-6 font-bold"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-stone-100 text-sm">
                                            {opportunities.map((op) => {
                                                const typeName = op.opportunity_types?.name || "UNKNOWN";
                                                const agencyName = op.agencies?.sub_tier || op.agencies?.department || "No Agency Info";
                                                return (
                                                    <tr key={op.id} onClick={() => setSelectedOpportunity(op)} onDoubleClick={() => router.push(`/opportunities/${op.id}`)} className={clsx("transition-colors group cursor-pointer", selectedOpportunity?.id === op.id ? "bg-stone-100" : "hover:bg-stone-50")}>
                                                        <td className="py-4 px-6 font-mono font-semibold text-xs">{op.notice_id}</td>
                                                        <td className="py-4 px-6">
                                                            <p className="font-bold text-black line-clamp-1 max-w-[200px] xl:max-w-md group-hover:text-stone-600">{op.title}</p>
                                                            <p className="text-stone-500 text-xs line-clamp-1 mt-1">{agencyName}</p>
                                                        </td>
                                                        <td className="py-4 px-6">
                                                            <span className="bg-stone-100 text-stone-600 font-typewriter text-[9px] px-2 py-1 rounded border border-stone-200 uppercase tracking-widest whitespace-nowrap">
                                                                {typeName}
                                                            </span>
                                                        </td>
                                                        <td className="py-4 px-6 font-mono font-bold text-xs">{op.naics_code || "---"}</td>
                                                        <td className="py-4 px-6 font-bold text-stone-700">
                                                            {op.response_deadline ? new Date(op.response_deadline).toLocaleDateString() : "TBD"}
                                                        </td>
                                                        <td className="py-4 px-6 text-right">
                                                            <div className={clsx("w-8 h-8 rounded-full flex items-center justify-center transition-all ml-auto", selectedOpportunity?.id === op.id ? "bg-black text-white" : "bg-transparent text-transparent group-hover:bg-black group-hover:text-white")}>
                                                                <ArrowRight className="w-4 h-4" />
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {opportunities.length === 0 && !loading && (
                                <div className="bg-stone-50 border border-stone-200 border-dashed rounded-[32px] p-12 text-center mt-auto mb-auto">
                                    <p className="text-stone-500 font-typewriter">No opportunities match the criteria.</p>
                                </div>
                            )}

                            {/* Pagination Controls */}
                            {totalPages > 1 && (
                                <div className="mt-auto pt-6 flex flex-col md:flex-row items-center justify-between px-2 gap-4">
                                    <p className="text-xs text-stone-500 font-typewriter">
                                        Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, totalCount)} of {totalCount.toLocaleString()} results
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
                            <span className="font-mono text-stone-400 text-xs">{selectedOpportunity.notice_id}</span>
                        </div>
                        <button
                            title="Close Window"
                            onClick={() => setSelectedOpportunity(null)}
                            className="p-2 hover:bg-stone-200 rounded-full transition-colors text-stone-500 hover:text-black"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="overflow-y-auto flex-1 p-6 custom-scrollbar space-y-8">
                        {/* Title & Agency */}
                        <div>
                            <h2 className="text-2xl font-bold font-typewriter tracking-tight text-black leading-tight mb-4">
                                {selectedOpportunity.title}
                            </h2>
                            <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center">
                                    <Building className="w-5 h-5 text-stone-600" />
                                </div>
                                <div>
                                    <p className="font-bold text-stone-800 text-sm leading-tight">
                                        {selectedOpportunity.agencies?.department || "Unknown Department"}
                                    </p>
                                    <p className="text-xs text-stone-400">
                                        {selectedOpportunity.agencies?.sub_tier || "Unknown Sub-tier"}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* AI Summary Mockup */}
                        <div className="bg-stone-900 text-white rounded-[32px] p-6 shadow-md relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-stone-700/30 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>

                            <h4 className="font-typewriter text-xs text-stone-400 uppercase tracking-widest mb-4 flex items-center">
                                <Sparkles className="w-4 h-4 mr-2 text-stone-300" /> Executive Intake Summary
                            </h4>

                            <div className="space-y-3 mb-5">
                                <div className="flex justify-between items-center bg-black/40 px-4 py-2 rounded-xl text-sm border border-stone-700/50">
                                    <span className="text-stone-400">Intent</span>
                                    <span className="font-bold text-right pl-4">{selectedOpportunity.opportunity_types?.name || "Solicitation"}</span>
                                </div>
                                <div className="flex justify-between items-center bg-black/40 px-4 py-2 rounded-xl text-sm border border-stone-700/50">
                                    <span className="text-stone-400">Set-Aside Target</span>
                                    <span className="font-bold">{selectedOpportunity.set_asides?.code || "Unrestricted"}</span>
                                </div>
                            </div>
                            <p className="text-sm text-stone-300 font-sans leading-relaxed">
                                Our semantic engine indicates {selectedOpportunity.agencies?.sub_tier || "the agency"} is actively scouting for qualified vendors under NAICS {selectedOpportunity.naics_code}. Priority status favors entities matching the {selectedOpportunity.set_asides?.code || 'Unrestricted'} classification.
                            </p>
                        </div>

                        {/* Metrics Grid */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-stone-50 border border-stone-200 p-4 rounded-2xl">
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1">NAICS Code</p>
                                <p className="font-mono font-bold text-base">{selectedOpportunity.naics_code || "---"}</p>
                            </div>
                            <div className="bg-stone-50 border border-stone-200 p-4 rounded-2xl">
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1">Set-Aside</p>
                                <p className="font-typewriter font-bold text-xs uppercase pt-1 line-clamp-1" title={selectedOpportunity.set_asides?.code || "NONE"}>
                                    {selectedOpportunity.set_asides?.code || "NONE"}
                                </p>
                            </div>
                            <div className="bg-stone-50 border border-stone-200 p-4 rounded-2xl">
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1 flex items-center">
                                    <Calendar className="w-3 h-3 mr-1" /> Posted
                                </p>
                                <p className="font-bold text-sm">
                                    {selectedOpportunity.posted_date ? new Date(selectedOpportunity.posted_date).toLocaleDateString() : "---"}
                                </p>
                            </div>
                            <div className="bg-stone-50 border border-stone-200 p-4 rounded-2xl border-l-4 border-l-stone-800">
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1 flex items-center">
                                    <Target className="w-3 h-3 mr-1" /> Deadline
                                </p>
                                <p className="font-bold text-sm text-black">
                                    {selectedOpportunity.response_deadline ? new Date(selectedOpportunity.response_deadline).toLocaleDateString() : "TBD"}
                                </p>
                            </div>
                        </div>

                        {/* Description (Scrollable) */}
                        <div className="border border-stone-200 rounded-2xl p-5 bg-white shadow-sm">
                            <h4 className="font-typewriter font-bold text-xs mb-4 flex items-center text-stone-800 uppercase tracking-wider">
                                <FileText className="w-4 h-4 mr-2" /> Notice Description
                            </h4>
                            <div className="text-sm text-stone-600 max-h-48 overflow-y-auto whitespace-pre-wrap font-sans">
                                {selectedOpportunity.description || "No detailed description provided by SAM.gov."}
                            </div>
                        </div>

                        {selectedOpportunity.link && (
                            <a
                                href={selectedOpportunity.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center space-x-2 text-sm font-bold font-typewriter bg-stone-100 border border-stone-200 w-full py-4 rounded-full hover:bg-stone-200 hover:border-stone-300 transition-all text-black mt-4"
                            >
                                <LinkIcon className="w-4 h-4" />
                                <span>View Data Source</span>
                            </a>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
