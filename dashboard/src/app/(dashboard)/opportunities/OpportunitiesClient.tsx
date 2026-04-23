"use client";

import { useEffect, useState, useCallback, KeyboardEvent, useRef } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/client";
import { Search, Filter, Loader2, LayoutGrid, List, Download, X, Building, Target, FileText, Link as LinkIcon, Sparkles, ChevronLeft, ChevronRight, Flame, ChevronUp, ChevronDown, Sprout, Leaf, Sun, Award, Trophy, Layers, CheckCircle2 } from "lucide-react";
import clsx from "clsx";
import Link from "next/link";
import { createPursuit, getUserProfileId } from "@/lib/pursue-utils";
import { SkeletonTableRow } from "@/components/ui/Skeleton";
import { cleanDescription } from "@/utils/cleanDescription";
import { estimateContractValue } from "@/utils/estimateValue";
import { useResizableColumns } from "@/hooks/useResizableColumns";
import { AIFilterBar, type AIFilters } from "@/components/matches/AIFilterBar";
import SavedViews from "@/components/SavedViews";
import { SET_ASIDE_OPTIONS, buildIlikeFilter, setAsideBadgeTone } from "@/lib/set-aside-filters";

// Default pixel widths for the Opportunities list-view columns.
// Stored per-profile under `opportunities:colwidths:${profileId}` in localStorage.
const OPP_COLUMN_DEFAULTS: Record<string, number> = {
    posted_date: 110,
    title: 360,
    notice_type: 140,
    naics_code: 100,
    place_of_performance_state: 80,
    award_amount: 120,
    response_deadline: 120,
    winability: 120,
    data_rich: 100,
};

const supabase = createSupabaseClient();

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
    estimated_value?: number;
    award_amount?: number;
    department?: string;
    place_of_performance_state?: string;
    place_of_performance_city?: string;
    set_aside_code?: string;
    incumbent_contractor_name?: string;
    // Joined
    agencies?: { department: string; sub_tier?: string };
    opportunity_types?: { name: string };
    set_asides?: { code: string };
    // Computed
    _matchCount?: number;
    _dataScore?: number;
}

interface OpportunitiesClientProps {
    initialOpportunities: Opportunity[];
    initialCount: number;
}

export default function OpportunitiesClient({ initialOpportunities, initialCount }: OpportunitiesClientProps) {
    const router = useRouter();
    const [opportunities, setOpportunities] = useState<Opportunity[]>(initialOpportunities);
    const [totalCount, setTotalCount] = useState(initialCount);
    const [loading, setLoading] = useState(false);
    const [searchInput, setSearchInput] = useState("");
    const [activeSearch, setActiveSearch] = useState("");
    const [viewMode, setViewMode] = useState<"grid" | "list">(typeof window !== "undefined" && window.innerWidth < 768 ? "grid" : "list");
    const [showFilters, setShowFilters] = useState(false);

    // Pagination
    const [page, setPage] = useState(1);
    const pageSize = 50;

    // Quick Filters
    // Removed EASY_WINS / HAS_MATCHES — those were duplicating /matches functionality.
    // Opportunities is for browsing the full 57k corpus; match-scored filtering lives on /matches.
    const [quickFilter, setQuickFilter] = useState<"ALL" | "SOURCES_SOUGHT" | "ENRICHED">("ALL");

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
        if (nt.includes("sources sought") || nt.includes("rfi")) return { label: "Seed Planted", color: "bg-emerald-100 text-emerald-700 border-emerald-200", desc: "Early market research — best time to engage (6-18 months before award)", icon: Sprout };
        if (nt.includes("presolicitation")) return { label: "Growing", color: "bg-blue-100 text-blue-700 border-blue-200", desc: "Pre-solicitation phase — prepare your response (3-6 months before award)", icon: Leaf };
        if (nt.includes("solicitation") || nt.includes("combined") || nt.includes("synopsis")) return { label: "In Bloom", color: "bg-amber-100 text-amber-700 border-amber-200", desc: "Active bidding window — submit your proposal now", icon: Sun };
        if (nt.includes("award")) return { label: "Harvested", color: "bg-stone-800 text-stone-100 border-stone-700", desc: "Contract awarded — review for future rebids", icon: Award };
        return null;
    };

    // Detail Panel State
    const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
    const [profileId, setProfileId] = useState<string | null>(null);
    const [pursuitStatus, setPursuitStatus] = useState<"none" | "loading" | "pursuing" | "pursued">("none");

    // Load profile ID on mount
    useEffect(() => {
        getUserProfileId().then(id => setProfileId(id));
    }, []);

    // Resizable column widths (persisted per profile in localStorage).
    const { getWidth: getColWidth, getResizerProps: getColResizer, reset: resetColWidths, activeResizeKey } = useResizableColumns({
        storageKey: profileId ? `opportunities:colwidths:${profileId}` : null,
        defaults: OPP_COLUMN_DEFAULTS,
        min: 60,
        max: 900,
    });

    // Small helper so every header doesn't have to duplicate the resizer JSX.
    // Green state during active drag makes the direction feel obvious (left =
    // narrower, right = wider) which fixes the previous "awkward" feel.
    const ColResizer = ({ k }: { k: string }) => (
        <span
            {...getColResizer(k)}
            className={clsx(
                "group flex items-center justify-center",
                activeResizeKey === k ? "bg-emerald-500/30" : "hover:bg-emerald-200/50",
            )}
        >
            <span className={clsx(
                "h-full w-0.5 transition-colors",
                activeResizeKey === k ? "bg-emerald-600" : "bg-stone-200 group-hover:bg-emerald-500",
            )} />
        </span>
    );

    // Check pursuit status when opportunity is selected
    useEffect(() => {
        if (!selectedOpportunity || !profileId) { setPursuitStatus("none"); return; }
        setPursuitStatus("loading");
        supabase.from("user_pursuits")
            .select("id")
            .eq("user_profile_id", profileId)
            .eq("opportunity_id", selectedOpportunity.id)
            .single()
            .then(({ data }) => {
                setPursuitStatus(data ? "pursued" : "none");
            });
    }, [selectedOpportunity?.id, profileId]);

    // Advanced Filters
    const [filterAgency, setFilterAgency] = useState("");
    const [filterType, setFilterType] = useState("");
    const [filterNaics, setFilterNaics] = useState("");
    const [filterState, setFilterState] = useState("");
    const [filterSetAside, setFilterSetAside] = useState("");

    // AI filter prompt (natural-language → structured filter)
    const [aiPrompt, setAiPrompt] = useState<string | null>(null);
    const [activeSavedViewId, setActiveSavedViewId] = useState<string | null>(null);

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
            // Narrow column list — same set as the server initial page — skips
            // raw_json and other heavy columns the list view never reads.
            const LIST_COLS = "id, notice_id, title, agency, organization_code, notice_type, naics_code, response_deadline, posted_date, description, link, is_archived, estimated_value, award_amount, place_of_performance_state, place_of_performance_city, set_aside_code, incumbent_contractor_name, status, strategic_scoring";
            let query = supabase
                .from("opportunities")
                .select(LIST_COLS, { count: 'estimated' });

            if (activeSearch) {
                query = query.or(`title.ilike.%${activeSearch}%,notice_id.ilike.%${activeSearch}%,agency.ilike.%${activeSearch}%,description.ilike.%${activeSearch}%`);
            }

            query = query.eq("is_archived", false);

            // Quick filters
            if (quickFilter === "SOURCES_SOUGHT") {
                query = query.eq("notice_type", "Sources Sought");
            }
            if (quickFilter === "ENRICHED") {
                query = query.not("strategic_scoring", "is", null);
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
                const orExpr = buildIlikeFilter(filterSetAside);
                if (orExpr) {
                    query = query.or(orExpr);
                } else {
                    query = query.ilike("set_aside_code", `%${filterSetAside}%`);
                }
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

                setOpportunities(results);
                setTotalCount(count || 0);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [page, activeSearch, quickFilter, pageSize, filterAgency, filterType, filterNaics, filterState, filterSetAside, sortCol, sortDir]);

    const isInitialMount = useRef(true);

    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false;
            return;
        }
        fetchOpportunities();
    }, [fetchOpportunities]);


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

    const getWinability = (op: Opportunity): { label: string; color: string } => {
        let score = 0;
        const nt = (op.notice_type || "").toLowerCase();
        if (nt.includes("sources sought") || nt.includes("rfi")) score += 3;
        else if (nt.includes("presolicitation")) score += 2;
        else if (nt.includes("solicitation") || nt.includes("combined")) score += 1;
        if (op.set_aside_code && !op.set_aside_code.toLowerCase().includes("unrestricted")) score += 2;
        if (!op.incumbent_contractor_name) score += 1;
        if (op.award_amount && op.award_amount < 250000) score += 1;
        if (score >= 5) return { label: "High", color: "bg-green-100 text-green-700 border-green-200" };
        if (score >= 3) return { label: "Medium", color: "bg-amber-100 text-amber-700 border-amber-200" };
        return { label: "Low", color: "bg-stone-100 text-stone-500 border-stone-200" };
    };

    const totalPages = Math.ceil(totalCount / pageSize);

    const formatCurrency = (val: number | null | undefined) => {
        if (!val) return null;
        if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
        if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
        return `$${val.toLocaleString()}`;
    };

    return (
        <div className="flex gap-4 lg:gap-6 max-w-[1600px] mx-auto pb-12 items-start px-1">
            {/* Main Content Area */}
            <div className={clsx("transition-all duration-500 ease-in-out flex-1 flex flex-col", selectedOpportunity ? "hidden lg:flex lg:w-1/2 xl:w-2/3" : "w-full")}>
                <div className="animate-in fade-in duration-500 flex flex-col">
                    <header className="flex flex-col md:flex-row md:items-end justify-between mb-6 sm:mb-8 space-y-3 md:space-y-0">
                        <div>
                            <h2 className="text-2xl sm:text-3xl font-bold tracking-tighter text-black flex items-center">
                                Opportunities
                                <span className="ml-3 sm:ml-4 text-xs sm:text-sm font-sans font-medium bg-stone-100 px-2.5 sm:px-3 py-1 rounded-full text-stone-500 border border-stone-200">
                                    {totalCount.toLocaleString()}
                                </span>
                            </h2>
                            <p className="text-stone-500 mt-1 sm:mt-2 font-medium text-sm">
                                SAM.gov Federal Opportunities
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
                                <span className="font-medium">Filters</span>
                            </button>

                            <button type="button" title="Export" onClick={handleExport} className="flex items-center space-x-2 bg-stone-100 text-black px-4 py-2.5 rounded-full border border-stone-200 hover:border-stone-300 hover:bg-stone-200 transition-all text-sm font-bold">
                                <Download className="w-4 h-4" />
                                <span className="hidden sm:inline">Export</span>
                            </button>
                        </div>
                    </header>

                    {/* AI natural-language filter — "small business janitorial in TX closing in 30 days"
                        gets translated by /api/matches/ai-filter to the structured filter state below. */}
                    <AIFilterBar
                        activePrompt={aiPrompt}
                        onApply={(filters: AIFilters, prompt: string) => {
                            setAiPrompt(prompt);
                            if (filters.naics_code) setFilterNaics(filters.naics_code);
                            if (filters.set_aside) setFilterSetAside(filters.set_aside);
                            if (filters.state) setFilterState(filters.state);
                            if (filters.notice_type) setFilterType(filters.notice_type);
                            if (filters.keyword) { setSearchInput(filters.keyword); setActiveSearch(filters.keyword); }
                            setPage(1);
                        }}
                        onClear={() => {
                            setAiPrompt(null);
                            setFilterNaics(""); setFilterSetAside(""); setFilterState("");
                            setFilterType(""); setSearchInput(""); setActiveSearch("");
                            setPage(1);
                        }}
                    />

                    {/* Saved Views — HubSpot-style filter presets (drag to reorder, click to apply) */}
                    <SavedViews
                        page="opportunities"
                        activeViewId={activeSavedViewId}
                        currentFilterState={{
                            quickFilter, sortCol, sortDir, filterAgency, filterType,
                            filterNaics, filterState, filterSetAside, activeSearch, viewMode,
                        }}
                        onApply={(state, viewId) => {
                            setActiveSavedViewId(viewId);
                            const s = state as Record<string, unknown>;
                            if (typeof s.quickFilter === "string") setQuickFilter(s.quickFilter as typeof quickFilter);
                            if (typeof s.sortCol === "string") setSortCol(s.sortCol);
                            if (typeof s.sortDir === "string") setSortDir(s.sortDir as "asc" | "desc");
                            if (typeof s.filterAgency === "string") setFilterAgency(s.filterAgency);
                            if (typeof s.filterType === "string") setFilterType(s.filterType);
                            if (typeof s.filterNaics === "string") setFilterNaics(s.filterNaics);
                            if (typeof s.filterState === "string") setFilterState(s.filterState);
                            if (typeof s.filterSetAside === "string") setFilterSetAside(s.filterSetAside);
                            if (typeof s.activeSearch === "string") { setActiveSearch(s.activeSearch); setSearchInput(s.activeSearch); }
                            if (typeof s.viewMode === "string") setViewMode(s.viewMode as typeof viewMode);
                            setPage(1);
                        }}
                        onClear={() => setActiveSavedViewId(null)}
                    />

                    {/* Quick Filters + Sort Bar */}
                    <section className="bg-stone-50 border border-stone-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 mb-6">
                        <div className="flex items-center space-x-2 flex-wrap gap-2">
                            {([
                                { key: "ALL" as const, label: "All Records", icon: null },
                                { key: "SOURCES_SOUGHT" as const, label: "Sources Sought", icon: Sparkles },
                                { key: "ENRICHED" as const, label: "Enriched", icon: Target },
                            ]).map(tab => (
                                <button
                                    type="button"
                                    key={tab.key}
                                    onClick={() => { setQuickFilter(tab.key); setPage(1); }}
                                    className={clsx(
                                        "text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-full transition-all shadow-sm border flex items-center",
                                        quickFilter === tab.key ? "bg-black text-white border-black" : "bg-white text-stone-600 border-stone-200 hover:bg-stone-100"
                                    )}
                                >
                                    {tab.icon && <tab.icon className="w-3 h-3 mr-1.5" />}
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-stone-500">
                            <span>Sort by column headers</span>
                        </div>
                    </section>

                    {/* Advanced Filters Panel */}
                    {showFilters && (
                        <section className="bg-white border border-stone-200 rounded-2xl p-4 flex flex-wrap gap-4 mb-6 animate-in slide-in-from-top-2 duration-300">
                            <div className="flex-1 min-w-[180px]">
                                <p className="text-[10px] text-stone-500 uppercase mb-2">Agency</p>
                                <input
                                    type="text"
                                    placeholder="e.g. Defense"
                                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
                                    value={filterAgency}
                                    onChange={(e) => { setFilterAgency(e.target.value); setPage(1); }}
                                />
                            </div>
                            <div className="flex-1 min-w-[150px]">
                                <p className="text-[10px] text-stone-500 uppercase mb-2">Notice Type</p>
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
                                <p className="text-[10px] text-stone-500 uppercase mb-2">NAICS</p>
                                <input
                                    type="text"
                                    placeholder="e.g. 561720"
                                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
                                    value={filterNaics}
                                    onChange={(e) => { setFilterNaics(e.target.value); setPage(1); }}
                                />
                            </div>
                            <div className="flex-1 min-w-[120px]">
                                <p className="text-[10px] text-stone-500 uppercase mb-2">State</p>
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
                                <p className="text-[10px] text-stone-500 uppercase mb-2">Set-Aside</p>
                                <select
                                    title="Set-Aside"
                                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
                                    value={filterSetAside}
                                    onChange={(e) => { setFilterSetAside(e.target.value); setPage(1); }}
                                >
                                    <option value="">All</option>
                                    {SET_ASIDE_OPTIONS.map(o => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                </select>
                            </div>
                            {(filterAgency || filterType || filterNaics || filterState || filterSetAside) && (
                                <button
                                    type="button"
                                    onClick={() => { setFilterAgency(""); setFilterType(""); setFilterNaics(""); setFilterState(""); setFilterSetAside(""); setPage(1); }}
                                    className="self-end px-4 py-2 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-full hover:bg-red-100"
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
                            placeholder="Search by title, description, notice ID, or agency..."
                            className="bg-transparent border-none outline-none w-full text-stone-700 text-sm"
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
                        <div className="bg-white rounded-[32px] border border-stone-200 shadow-sm overflow-hidden mb-6">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 text-[10px] uppercase tracking-wider">
                                        <th className="py-4 px-5 font-bold">Posted</th>
                                        <th className="py-4 px-5 font-bold">Title / Agency</th>
                                        <th className="py-4 px-5 font-bold">Type</th>
                                        <th className="py-4 px-5 font-bold">NAICS</th>
                                        <th className="py-4 px-5 font-bold">State</th>
                                        <th className="py-4 px-5 font-bold hidden xl:table-cell">Value</th>
                                        <th className="py-4 px-5 font-bold">Deadline</th>
                                        <th className="py-4 px-5 font-bold">Winability</th>
                                        <th className="py-4 px-5 font-bold hidden 2xl:table-cell">Data</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-stone-100">
                                    {Array.from({ length: 8 }).map((_, i) => (
                                        <SkeletonTableRow key={i} />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="flex-1 pr-2 flex flex-col pb-4">
                            {/* List View */}
                            {viewMode === "list" && (
                                <div className="bg-white rounded-[32px] border border-stone-200 shadow-sm overflow-hidden mb-6 flex-shrink-0">
                                    <div className="flex items-center justify-end px-5 py-2 border-b border-stone-100 bg-stone-50">
                                        <button
                                            type="button"
                                            onClick={resetColWidths}
                                            title="Reset column widths"
                                            className="text-[10px] text-stone-500 hover:text-black font-bold uppercase tracking-widest inline-flex items-center gap-1.5"
                                        >
                                            ↔ Reset widths
                                        </button>
                                    </div>
                                    <div className="overflow-x-auto">
                                    <table className="text-left border-collapse" style={{ tableLayout: "fixed", width: "max-content", minWidth: "100%" }}>
                                        <thead className="sticky top-0 z-10">
                                            <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 text-[10px] uppercase tracking-wider">
                                                <th className={clsx("relative py-4 px-5 font-bold cursor-pointer hover:text-black select-none", activeResizeKey === "posted_date" && "bg-emerald-50")} style={{ width: getColWidth("posted_date") }} onClick={() => handleColumnSort("posted_date")}>
                                                    <span className="truncate pr-2 block">Posted <SortIndicator col="posted_date" /></span>
                                                    <ColResizer k="posted_date" />
                                                </th>
                                                <th className={clsx("relative py-4 px-5 font-bold", activeResizeKey === "title" && "bg-emerald-50")} style={{ width: getColWidth("title") }}>
                                                    <span className="truncate pr-2 block">Title / Agency</span>
                                                    <ColResizer k="title" />
                                                </th>
                                                <th className={clsx("relative py-4 px-5 font-bold cursor-pointer hover:text-black select-none", activeResizeKey === "notice_type" && "bg-emerald-50")} style={{ width: getColWidth("notice_type") }} onClick={() => handleColumnSort("notice_type")}>
                                                    <span className="truncate pr-2 block">Type <SortIndicator col="notice_type" /></span>
                                                    <ColResizer k="notice_type" />
                                                </th>
                                                <th className={clsx("relative py-4 px-5 font-bold cursor-pointer hover:text-black select-none", activeResizeKey === "naics_code" && "bg-emerald-50")} style={{ width: getColWidth("naics_code") }} onClick={() => handleColumnSort("naics_code")}>
                                                    <span className="truncate pr-2 block">NAICS <SortIndicator col="naics_code" /></span>
                                                    <ColResizer k="naics_code" />
                                                </th>
                                                <th className={clsx("relative py-4 px-5 font-bold cursor-pointer hover:text-black select-none", activeResizeKey === "place_of_performance_state" && "bg-emerald-50")} style={{ width: getColWidth("place_of_performance_state") }} onClick={() => handleColumnSort("place_of_performance_state")}>
                                                    <span className="truncate pr-2 block">State <SortIndicator col="place_of_performance_state" /></span>
                                                    <ColResizer k="place_of_performance_state" />
                                                </th>
                                                <th className={clsx("relative py-4 px-5 font-bold", activeResizeKey === "award_amount" && "bg-emerald-50")} style={{ width: getColWidth("award_amount") }}>
                                                    <span className="truncate pr-2 block">Value</span>
                                                    <ColResizer k="award_amount" />
                                                </th>
                                                <th className={clsx("relative py-4 px-5 font-bold cursor-pointer hover:text-black select-none", activeResizeKey === "response_deadline" && "bg-emerald-50")} style={{ width: getColWidth("response_deadline") }} onClick={() => handleColumnSort("response_deadline")}>
                                                    <span className="truncate pr-2 block">Deadline <SortIndicator col="response_deadline" /></span>
                                                    <ColResizer k="response_deadline" />
                                                </th>
                                                <th className={clsx("relative py-4 px-5 font-bold", activeResizeKey === "winability" && "bg-emerald-50")} style={{ width: getColWidth("winability") }}>
                                                    <span className="truncate pr-2 block">Winability</span>
                                                    <ColResizer k="winability" />
                                                </th>
                                                <th className={clsx("relative py-4 px-5 font-bold cursor-pointer hover:text-black select-none", activeResizeKey === "data_rich" && "bg-emerald-50")} style={{ width: getColWidth("data_rich") }} onClick={() => handleColumnSort("data_rich")}>
                                                    <span className="truncate pr-2 block">Data <SortIndicator col="data_rich" /></span>
                                                    <ColResizer k="data_rich" />
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-stone-100 text-sm">
                                            {opportunities.map((op) => {
                                                const typeName = op.notice_type || op.opportunity_types?.name || "UNKNOWN";
                                                const agencyName = op.agency || op.department || op.agencies?.sub_tier || op.agencies?.department || "Federal Agency";
                                                const dataScore = op._dataScore || 0;
                                                return (
                                                    <tr key={op.id} onClick={() => setSelectedOpportunity(op)} onDoubleClick={() => router.push(`/opportunities/${op.id}`)} className={clsx("transition-all duration-150 group cursor-pointer", selectedOpportunity?.id === op.id ? "bg-stone-100" : "hover:bg-stone-50 hover:shadow-sm")}>
                                                        <td className="py-3.5 px-5 font-mono text-xs text-stone-500 overflow-hidden" style={{ width: getColWidth("posted_date") }}>{op.posted_date ? new Date(op.posted_date).toLocaleDateString() : "---"}</td>
                                                        <td className="py-3.5 px-5 overflow-hidden" style={{ width: getColWidth("title") }}>
                                                            <p className="font-bold text-black line-clamp-1 group-hover:text-stone-600">{op.title}</p>
                                                            <p className="text-stone-500 text-xs line-clamp-1 mt-0.5">{agencyName}</p>
                                                        </td>
                                                        <td className="py-3.5 px-5 overflow-hidden" style={{ width: getColWidth("notice_type") }}>
                                                            <span className={clsx(
                                                                "text-[9px] px-2 py-1 rounded border uppercase tracking-widest whitespace-nowrap",
                                                                typeName === "Sources Sought" ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
                                                                typeName === "Presolicitation" ? "bg-blue-100 text-blue-700 border-blue-200" :
                                                                "bg-stone-100 text-stone-600 border-stone-200"
                                                            )}>
                                                                {typeName}
                                                            </span>
                                                        </td>
                                                        <td className="py-3.5 px-5 font-mono font-bold text-xs overflow-hidden" style={{ width: getColWidth("naics_code") }}>{op.naics_code || "---"}</td>
                                                        <td className="py-3.5 px-5 font-mono text-xs overflow-hidden" style={{ width: getColWidth("place_of_performance_state") }}>{op.place_of_performance_state || "---"}</td>
                                                        <td className="py-3.5 px-5 font-mono font-bold text-xs overflow-hidden" style={{ width: getColWidth("award_amount") }}>
                                                            {formatCurrency(op.award_amount) || <span className="text-stone-300">---</span>}
                                                        </td>
                                                        <td className="py-3.5 px-5 font-bold text-stone-700 text-xs overflow-hidden" style={{ width: getColWidth("response_deadline") }}>
                                                            {op.response_deadline ? new Date(op.response_deadline).toLocaleDateString() : "TBD"}
                                                        </td>
                                                        <td className="py-3.5 px-5 overflow-hidden" style={{ width: getColWidth("winability") }}>
                                                            {(() => {
                                                                const win = getWinability(op);
                                                                return (
                                                                    <span className={clsx("text-[9px] px-2 py-1 rounded border uppercase tracking-widest whitespace-nowrap", win.color)}>
                                                                        {win.label}
                                                                    </span>
                                                                );
                                                            })()}
                                                        </td>
                                                        <td className="py-3.5 px-5 overflow-hidden" style={{ width: getColWidth("data_rich") }}>
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
                                </div>
                            )}

                            {/* Grid View */}
                            {viewMode === "grid" && (
                                <div className={clsx("grid gap-5 transition-all mb-6", selectedOpportunity ? "grid-cols-1 xl:grid-cols-2" : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4")}>
                                    {opportunities.map((op) => {
                                        const typeName = op.notice_type || op.opportunity_types?.name || "UNKNOWN";
                                        const agencyName = op.agency || op.department || op.agencies?.sub_tier || op.agencies?.department || "Federal Agency";
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
                                                                "text-[9px] px-2 py-1 rounded border uppercase tracking-widest",
                                                                typeName === "Sources Sought" ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
                                                                typeName === "Presolicitation" ? "bg-blue-100 text-blue-700 border-blue-200" :
                                                                "bg-stone-100 text-stone-600 border-stone-200"
                                                            )}>
                                                                {typeName}
                                                            </span>
                                                            <div className="flex items-center gap-1.5">
                                                                {(() => {
                                                                    const win = getWinability(op);
                                                                    return (
                                                                        <span className={clsx("text-[9px] px-2 py-0.5 rounded border uppercase tracking-widest", win.color)}>
                                                                            Win: {win.label}
                                                                        </span>
                                                                    );
                                                                })()}
                                                                {(op.award_amount) && (
                                                                    <span className="font-mono font-bold text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded border border-green-200">{formatCurrency(op.award_amount)}</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <h3 className="font-bold text-base mb-2 line-clamp-2 leading-tight group-hover:text-stone-600 transition-colors">{op.title}</h3>
                                                        <p className="text-stone-500 text-sm line-clamp-1 mb-1">{agencyName}</p>
                                                        {op.posted_date && (
                                                            <p className="text-[10px] text-stone-400 font-mono">Posted {new Date(op.posted_date).toLocaleDateString()}</p>
                                                        )}
                                                    </div>
                                                    <div className="pt-3 border-t border-stone-100 flex justify-between items-center mt-3">
                                                        <div className="flex items-center space-x-2">
                                                            <span className="font-mono font-bold text-xs">{op.naics_code || "N/A"}</span>
                                                            {op.place_of_performance_state && (
                                                                <span className="font-mono text-xs bg-stone-100 border border-stone-200 px-2 py-0.5 rounded-full font-bold">{op.place_of_performance_state}</span>
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
                                    <p className="text-stone-500">No opportunities match the criteria.</p>
                                </div>
                            )}

                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div className="mt-auto pt-6 flex flex-col md:flex-row items-center justify-between px-2 gap-4">
                                    <p className="text-xs text-stone-500">
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
                <div className="fixed inset-0 z-50 lg:relative lg:inset-auto lg:z-auto w-full lg:w-1/2 xl:w-1/3 h-full lg:h-[calc(100vh-80px)] xl:h-[calc(100vh-120px)] lg:sticky lg:top-[40px] xl:top-[60px] bg-white lg:border lg:border-stone-200 shadow-2xl lg:rounded-[40px] flex flex-col overflow-hidden animate-in slide-in-from-right-16 duration-300">
                    <div className="p-6 border-b border-stone-100 flex justify-between items-center bg-stone-50/50 flex-shrink-0">
                        <div className="flex items-center space-x-2">
                            <span className="bg-black text-white text-[10px] px-2 py-1 rounded uppercase tracking-wider">
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
                            <h2 className="text-xl font-bold tracking-tight text-black leading-tight mb-3">
                                {selectedOpportunity.title}
                            </h2>
                            <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center">
                                    <Building className="w-5 h-5 text-stone-600" />
                                </div>
                                <div className="flex-1">
                                    <p className="font-bold text-stone-800 text-sm leading-tight">
                                        {selectedOpportunity.agency || selectedOpportunity.department || selectedOpportunity.agencies?.department || "Federal Agency"}
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
                                    <p className="text-[10px] text-stone-400 uppercase tracking-widest mb-1">Posted</p>
                                    <p className="font-bold text-sm">{new Date(selectedOpportunity.posted_date).toLocaleDateString()}</p>
                                </div>
                            )}
                            <div className="bg-stone-50 border border-stone-200 p-3 rounded-xl">
                                <p className="text-[10px] text-stone-400 uppercase tracking-widest mb-1">NAICS</p>
                                <p className="font-mono font-bold text-sm">{selectedOpportunity.naics_code || "---"}</p>
                            </div>
                            <div className="bg-stone-50 border border-stone-200 p-3 rounded-xl">
                                <p className="text-[10px] text-stone-400 uppercase tracking-widest mb-1">Notice Type</p>
                                <p className="font-bold text-xs pt-0.5">
                                    {selectedOpportunity.notice_type || selectedOpportunity.opportunity_types?.name || "N/A"}
                                </p>
                            </div>
                            <div className="bg-stone-50 border border-stone-200 p-3 rounded-xl">
                                <p className="text-[10px] text-stone-400 uppercase tracking-widest mb-1">Set-Aside</p>
                                <p className="font-bold text-xs pt-0.5">
                                    {selectedOpportunity.set_aside_code || selectedOpportunity.set_asides?.code || "Unrestricted"}
                                </p>
                                {(() => {
                                    const { tone, label } = setAsideBadgeTone(selectedOpportunity.set_aside_code);
                                    if (!label) return null;
                                    const toneClass =
                                        tone === "violet" ? "bg-violet-100 text-violet-700 border-violet-200" :
                                        tone === "emerald" ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
                                        tone === "amber" ? "bg-amber-100 text-amber-700 border-amber-200" :
                                        "bg-blue-100 text-blue-700 border-blue-200";
                                    return (
                                        <span className={`mt-1.5 inline-flex items-center gap-1 text-[9px] font-bold border px-2 py-0.5 rounded uppercase ${toneClass}`}>
                                            {label}
                                        </span>
                                    );
                                })()}
                            </div>
                            <div className="bg-stone-50 border border-stone-200 p-3 rounded-xl border-l-4 border-l-stone-800">
                                <p className="text-[10px] text-stone-400 uppercase tracking-widest mb-1">Deadline</p>
                                <p className="font-bold text-sm text-black">
                                    {selectedOpportunity.response_deadline ? new Date(selectedOpportunity.response_deadline).toLocaleDateString() : "TBD"}
                                </p>
                            </div>
                            {selectedOpportunity.place_of_performance_state && (
                                <div className="bg-stone-50 border border-stone-200 p-3 rounded-xl">
                                    <p className="text-[10px] text-stone-400 uppercase tracking-widest mb-1">Location</p>
                                    <p className="font-bold text-sm">{[selectedOpportunity.place_of_performance_city, selectedOpportunity.place_of_performance_state].filter(Boolean).join(", ")}</p>
                                </div>
                            )}
                            <div className="bg-green-50 border border-green-200 p-3 rounded-xl">
                                <p className="text-[10px] text-green-600 uppercase tracking-widest mb-1">
                                    {selectedOpportunity.award_amount ? "Contract Value" : "Est. Value"}
                                </p>
                                <p className="font-mono font-bold text-sm text-green-800">
                                    {selectedOpportunity.award_amount
                                        ? formatCurrency(selectedOpportunity.award_amount)
                                        : (() => {
                                            const est = estimateContractValue({
                                                naicsCode: selectedOpportunity.naics_code,
                                                setAsideCode: selectedOpportunity.set_aside_code,
                                                noticeType: selectedOpportunity.notice_type,
                                            });
                                            return est ? `~${formatCurrency(est.estimatedValue)}` : "TBD";
                                        })()
                                    }
                                    {!selectedOpportunity.award_amount && <span className="text-[9px] font-normal text-stone-400 ml-1">(est.)</span>}
                                </p>
                            </div>
                        </div>

                        {/* Incumbent Info */}
                        {selectedOpportunity.incumbent_contractor_name && (
                            <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
                                <p className="text-[10px] text-amber-600 uppercase tracking-widest mb-1">Incumbent Contractor</p>
                                <p className="font-bold text-sm text-amber-900">{selectedOpportunity.incumbent_contractor_name}</p>
                            </div>
                        )}

                        {/* Description */}
                        {selectedOpportunity.description && (
                            <div className="border border-stone-200 rounded-2xl p-5 bg-white shadow-sm">
                                <h4 className="font-bold text-xs mb-4 flex items-center text-stone-800 uppercase tracking-wider">
                                    <FileText className="w-4 h-4 mr-2" /> Description
                                </h4>
                                <div className="text-sm text-stone-600 max-h-48 overflow-y-auto whitespace-pre-wrap font-sans">
                                    {cleanDescription(selectedOpportunity.description)}
                                </div>
                            </div>
                        )}

                        {selectedOpportunity.link && (
                            <a
                                href={selectedOpportunity.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center space-x-2 text-sm font-bold bg-stone-100 border border-stone-200 w-full py-4 rounded-full hover:bg-stone-200 hover:border-stone-300 transition-all text-black"
                            >
                                <LinkIcon className="w-4 h-4" />
                                <span>View on SAM.gov</span>
                            </a>
                        )}
                    </div>

                    {/* Sticky Pursue Action Bar */}
                    <div className="border-t border-stone-200 p-4 bg-white flex-shrink-0">
                        {pursuitStatus === "pursued" ? (
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                    <span className="text-sm font-bold text-stone-700">In your pipeline</span>
                                </div>
                                <Link href="/pipeline" className="inline-flex items-center bg-black text-white font-bold px-4 py-2.5 rounded-full text-xs hover:bg-stone-800 transition-all">
                                    <Layers className="w-3 h-3 mr-1.5" /> View Pipeline
                                </Link>
                            </div>
                        ) : (
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => router.push(`/opportunities/${selectedOpportunity.id}`)}
                                    className="flex-1 inline-flex items-center justify-center bg-stone-100 text-stone-700 font-bold px-4 py-3 rounded-full text-xs hover:bg-stone-200 transition-all border border-stone-200"
                                >
                                    View Details
                                </button>
                                <button
                                    type="button"
                                    disabled={pursuitStatus === "loading" || pursuitStatus === "pursuing" || !profileId}
                                    onClick={async () => {
                                        if (!profileId || !selectedOpportunity) return;
                                        setPursuitStatus("pursuing");
                                        const result = await createPursuit(
                                            selectedOpportunity.id,
                                            selectedOpportunity.notice_type || "",
                                            profileId
                                        );
                                        setPursuitStatus(result.success ? "pursued" : "none");
                                    }}
                                    className="flex-1 inline-flex items-center justify-center bg-black text-white font-bold px-4 py-3 rounded-full text-xs hover:bg-stone-800 transition-all disabled:opacity-50"
                                >
                                    {pursuitStatus === "pursuing" ? (
                                        <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> Adding...</>
                                    ) : (
                                        <><Sparkles className="w-3 h-3 mr-1.5 text-emerald-400" /> Start Pursuing</>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
