"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/client";
import { Loader2, Sparkles, Search, X, ChevronLeft, ChevronRight, Trophy, Shield, Target, ArrowRight, Bookmark, EyeOff, Flame, ChevronUp, ChevronDown, Filter, CheckCircle2, Download, AlertTriangle, List, Table as TableIcon, Columns3, GripVertical } from "lucide-react";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { createPursuit } from "@/lib/pursue-utils";
import { Skeleton, SkeletonMatchCard } from "@/components/ui/Skeleton";
import clsx from "clsx";
import Link from "next/link";
import { ViewToggle, type ViewMode } from "@/components/matches/ViewToggle";
import { TableView, DEFAULT_COLUMN_KEYS, ALL_COLUMNS, type MatchRow } from "@/components/matches/TableView";
import { ListView } from "@/components/matches/ListView";
import { AIFilterBar, type AIFilters } from "@/components/matches/AIFilterBar";
import { BulkExportDialog } from "@/components/matches/BulkExportDialog";
import SavedViews from "@/components/SavedViews";
import { SET_ASIDE_OPTIONS, matchSetAside, setAsideBadgeTone } from "@/lib/set-aside-filters";

const supabase = createSupabaseClient();

const formatCurrency = (val: number | null | undefined) => {
    if (!val) return null;
    if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
    if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
    return `$${val.toLocaleString()}`;
};

const MAX_SELECTION = 20;

interface UserMatch extends MatchRow {
    score_breakdown: Record<string, number> | null;
    is_dismissed: boolean;
    opportunities: {
        id: string;
        title: string;
        agency: string;
        naics_code: string;
        psc_code: string | null;
        notice_type: string;
        response_deadline: string;
        posted_date: string | null;
        set_aside_code: string;
        place_of_performance_state: string;
        award_amount: number | null;
        estimated_value: number | null;
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
    const [filter, setFilter] = useState<"ALL" | "HOT" | "WARM" | "COLD" | "SAVED">("ALL");
    const [sortBy, setSortBy] = useState<"score" | "deadline" | "agency" | "notice_type">("score");
    const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
    const [showFilters, setShowFilters] = useState(false);
    const [filterNoticeType, setFilterNoticeType] = useState("");
    const [filterSetAside, setFilterSetAside] = useState("");
    const [filterState, setFilterState] = useState("");
    const [filterNaics, setFilterNaics] = useState("");
    const [filterMinScore, setFilterMinScore] = useState<number | null>(null);
    const [filterMaxDeadlineDays, setFilterMaxDeadlineDays] = useState<number | null>(null);
    const [pursuingIds, setPursuingIds] = useState<Set<string>>(new Set());
    const [pursuedIds, setPursuedIds] = useState<Set<string>>(new Set());
    const [generatingMatches, setGeneratingMatches] = useState(false);

    // View mode + columns
    const [viewMode, setViewMode] = useState<ViewMode>("card");
    const [visibleColumnKeys, setVisibleColumnKeys] = useState<string[]>(DEFAULT_COLUMN_KEYS);
    const [activeSavedViewId, setActiveSavedViewId] = useState<string | null>(null);

    // Selection / export
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [exportOpen, setExportOpen] = useState(false);
    const [selectionWarning, setSelectionWarning] = useState<string | null>(null);

    // AI filter
    const [aiPrompt, setAiPrompt] = useState<string | null>(null);

    const pageSize = 25;

    // Load persisted view + columns from localStorage
    useEffect(() => {
        if (!profileId) return;
        try {
            const savedView = localStorage.getItem(`matches:view:${profileId}`);
            if (savedView === "card" || savedView === "list" || savedView === "table") setViewMode(savedView);
            const savedCols = localStorage.getItem(`matches:columns:${profileId}`);
            if (savedCols) {
                const parsed = JSON.parse(savedCols);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    const valid = parsed.filter((k: string) => ALL_COLUMNS.some(c => c.key === k));
                    if (valid.length > 0) setVisibleColumnKeys(valid);
                }
            }
        } catch { /* ignore */ }
    }, [profileId]);

    // Persist
    useEffect(() => {
        if (!profileId) return;
        try { localStorage.setItem(`matches:view:${profileId}`, viewMode); } catch { /* ignore */ }
    }, [viewMode, profileId]);
    useEffect(() => {
        if (!profileId) return;
        try { localStorage.setItem(`matches:columns:${profileId}`, JSON.stringify(visibleColumnKeys)); } catch { /* ignore */ }
    }, [visibleColumnKeys, profileId]);

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

        // Use !inner on the opportunities join since we filter on opportunities.status —
        // without !inner Supabase returns matches with opportunities: null and the count
        // diverges from the rendered row count (per CLAUDE.md).
        let query = supabase
            .from("user_matches")
            .select(
                "id, score, classification, score_breakdown, is_saved, is_dismissed, " +
                "opportunities!inner(id, title, agency, naics_code, psc_code, notice_type, response_deadline, posted_date, set_aside_code, place_of_performance_state, award_amount, estimated_value)",
                { count: "exact" }
            )
            .eq("user_profile_id", profileId)
            .eq("is_dismissed", false)
            .in("opportunities.status", ["ACTIVE", "EXPIRING_SOON", "MARKET_RESEARCH", "DISCOVERED"]);

        if (filter === "HOT") {
            query = query.eq("classification", "HOT");
        } else if (filter === "WARM") {
            query = query.eq("classification", "WARM");
        } else if (filter === "COLD") {
            query = query.eq("classification", "COLD");
        } else if (filter === "SAVED") {
            query = query.eq("is_saved", true);
        }

        if (filterMinScore != null) {
            query = query.gte("score", filterMinScore);
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
            filtered = filtered.filter(m => matchSetAside(m.opportunities?.set_aside_code, filterSetAside));
        }
        if (filterState) {
            filtered = filtered.filter(m => m.opportunities?.place_of_performance_state === filterState);
        }
        if (filterNaics) {
            filtered = filtered.filter(m => m.opportunities?.naics_code?.startsWith(filterNaics));
        }
        if (filterMaxDeadlineDays != null) {
            const cutoff = Date.now() + filterMaxDeadlineDays * 24 * 60 * 60 * 1000;
            filtered = filtered.filter(m => {
                const d = m.opportunities?.response_deadline;
                if (!d) return false;
                const t = new Date(d).getTime();
                return t >= Date.now() && t <= cutoff;
            });
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
        const anyClientFilter = Boolean(activeSearch || filterNoticeType || filterSetAside || filterState || filterNaics || filterMaxDeadlineDays != null);
        setTotalCount(anyClientFilter ? filtered.length : (count || 0));
        setLoading(false);
    }, [profileId, page, activeSearch, filter, sortBy, sortDirection, filterNoticeType, filterSetAside, filterState, filterNaics, filterMinScore, filterMaxDeadlineDays]);

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
        setSelectedIds(prev => { const n = new Set(prev); n.delete(matchId); return n; });
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

    // Selection handlers
    const toggleSelect = (id: string) => {
        setSelectionWarning(null);
        setSelectedIds(prev => {
            const n = new Set(prev);
            if (n.has(id)) {
                n.delete(id);
            } else {
                if (n.size >= MAX_SELECTION) {
                    setSelectionWarning(`You can select at most ${MAX_SELECTION} opportunities per export.`);
                    return prev;
                }
                n.add(id);
            }
            return n;
        });
    };

    const toggleSelectAllOnPage = () => {
        setSelectionWarning(null);
        const pageIds = matches.map(m => m.id);
        const allSelected = pageIds.length > 0 && pageIds.every(id => selectedIds.has(id));
        if (allSelected) {
            setSelectedIds(prev => {
                const n = new Set(prev);
                pageIds.forEach(id => n.delete(id));
                return n;
            });
        } else {
            setSelectedIds(prev => {
                const n = new Set(prev);
                for (const id of pageIds) {
                    if (n.size >= MAX_SELECTION) {
                        setSelectionWarning(`Selection capped at ${MAX_SELECTION}. Deselect some to add more.`);
                        break;
                    }
                    n.add(id);
                }
                return n;
            });
        }
    };

    // AI filter apply
    const applyAIFilters = (f: AIFilters, prompt: string) => {
        // Reset legacy filters first
        setFilterNoticeType(f.notice_type || "");
        setFilterSetAside(f.set_aside || "");
        setFilterState(f.state || "");
        setFilterNaics(f.naics_code || "");
        setFilterMinScore(f.min_score ?? null);
        setFilterMaxDeadlineDays(f.max_deadline_days ?? null);
        if (f.keyword) {
            setSearchInput(f.keyword);
            setActiveSearch(f.keyword);
        }
        setAiPrompt(prompt);
        setShowFilters(true);
        setPage(1);
    };

    const clearAIFilter = () => {
        setFilterNoticeType("");
        setFilterSetAside("");
        setFilterState("");
        setFilterNaics("");
        setFilterMinScore(null);
        setFilterMaxDeadlineDays(null);
        setAiPrompt(null);
        setSearchInput("");
        setActiveSearch("");
        setPage(1);
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
        if (score >= 0.30) return "text-blue-600 bg-blue-50 border-blue-200";
        return "text-stone-500 bg-stone-50 border-stone-200";
    };

    const selectedArray = useMemo(() => Array.from(selectedIds), [selectedIds]);
    const allSelectedOnPage = matches.length > 0 && matches.every(m => selectedIds.has(m.id));

    if (loading && matches.length === 0) {
        return (
            <div className="max-w-[1600px] mx-auto pb-12 animate-in fade-in duration-500 px-1">
                <header className="mb-6">
                    <Skeleton className="h-8 w-48 rounded mb-2" />
                    <Skeleton className="h-4 w-72 rounded" />
                </header>
                <div className="space-y-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <SkeletonMatchCard key={i} />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-[1600px] mx-auto pb-12 animate-in fade-in duration-500 px-1">
            <header className="mb-6">
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tighter text-black flex items-center">
                    <Target className="mr-2 sm:mr-3 w-6 h-6 sm:w-8 sm:h-8" /> Your Matches
                    <span className="ml-3 text-sm font-sans font-medium bg-stone-100 px-3 py-1 rounded-full text-stone-500 border border-stone-200">
                        {totalCount.toLocaleString()}
                    </span>
                </h2>
                <div className="flex items-center justify-between mt-1">
                    <p className="text-stone-500 font-medium text-sm">
                        Opportunities scored against your profile. Browse every opportunity in <Link href="/opportunities" className="underline font-bold hover:text-black">Opportunities</Link>.
                        <InfoTooltip text="Scores combine NAICS match, keywords, certifications, geography, past performance, contract value fit, and more. HOT = 70%+ alignment. WARM = 50-69%. COLD = 30-49%." />
                    </p>
                    <button
                        type="button"
                        onClick={handleGenerateMatches}
                        disabled={generatingMatches}
                        className="bg-black text-white px-4 py-2 rounded-full text-xs font-bold inline-flex items-center disabled:opacity-60 flex-shrink-0 ml-4"
                    >
                        {generatingMatches ? (
                            <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> Scoring...</>
                        ) : (
                            <><Sparkles className="w-3 h-3 mr-1.5" /> Refresh Matches</>
                        )}
                    </button>
                </div>
            </header>

            {/* AI Filter Bar */}
            <AIFilterBar onApply={applyAIFilters} activePrompt={aiPrompt} onClear={clearAIFilter} />

            {/* Saved Views — HubSpot-style filter presets (drag to reorder, click to apply) */}
            <SavedViews
                page="matches"
                activeViewId={activeSavedViewId}
                currentFilterState={{
                    filter, sortBy, sortDirection, filterNoticeType, filterSetAside, filterState,
                    filterNaics, filterMinScore, filterMaxDeadlineDays, activeSearch,
                    viewMode, visibleColumnKeys,
                }}
                onApply={(state, viewId) => {
                    setActiveSavedViewId(viewId);
                    const s = state as Record<string, unknown>;
                    if (typeof s.filter === "string") setFilter(s.filter as typeof filter);
                    if (typeof s.sortBy === "string") setSortBy(s.sortBy as typeof sortBy);
                    if (typeof s.sortDirection === "string") setSortDirection(s.sortDirection as typeof sortDirection);
                    if (typeof s.filterNoticeType === "string") setFilterNoticeType(s.filterNoticeType);
                    if (typeof s.filterSetAside === "string") setFilterSetAside(s.filterSetAside);
                    if (typeof s.filterState === "string") setFilterState(s.filterState);
                    if (typeof s.filterNaics === "string") setFilterNaics(s.filterNaics);
                    if (typeof s.filterMinScore === "number" || s.filterMinScore === null) setFilterMinScore(s.filterMinScore as number | null);
                    if (typeof s.filterMaxDeadlineDays === "number" || s.filterMaxDeadlineDays === null) setFilterMaxDeadlineDays(s.filterMaxDeadlineDays as number | null);
                    if (typeof s.activeSearch === "string") { setActiveSearch(s.activeSearch); setSearchInput(s.activeSearch); }
                    if (typeof s.viewMode === "string") setViewMode(s.viewMode as typeof viewMode);
                    if (Array.isArray(s.visibleColumnKeys)) setVisibleColumnKeys(s.visibleColumnKeys as string[]);
                    setPage(1);
                }}
                onClear={() => setActiveSavedViewId(null)}
            />

            {/* Filter Tabs */}
            <section className="flex flex-wrap gap-2 mb-4 items-center">
                {([
                    { key: "ALL" as const, label: "All Matches", icon: Target },
                    { key: "HOT" as const, label: "Strong Matches", icon: Flame },
                    { key: "WARM" as const, label: "Good Matches", icon: Trophy },
                    { key: "COLD" as const, label: "Possible Matches", icon: Shield },
                    { key: "SAVED" as const, label: "Saved", icon: Bookmark },
                ]).map(tab => (
                    <button
                        type="button"
                        key={tab.key}
                        onClick={() => { setFilter(tab.key); setPage(1); }}
                        className={clsx(
                            "text-xs font-bold uppercase tracking-widest px-3 sm:px-4 py-2 rounded-full transition-all shadow-sm border flex items-center",
                            filter === tab.key ? "bg-black text-white border-black" : "bg-white text-stone-600 border-stone-200 hover:bg-stone-100 active:bg-stone-200"
                        )}
                    >
                        <tab.icon className="w-3 h-3 mr-1.5" />
                        {tab.label}
                    </button>
                ))}
                <div className="ml-auto">
                    <ViewToggle value={viewMode} onChange={setViewMode} />
                </div>
            </section>

            {/* Sort Bar */}
            <section className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-[10px] text-stone-400 uppercase tracking-widest mr-1">Sort by</span>
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
                            "text-xs font-bold px-3 py-1.5 rounded-full border transition-all flex items-center",
                            sortBy === opt.key ? "bg-black text-white border-black" : "bg-white text-stone-500 border-stone-200 hover:bg-stone-100"
                        )}
                    >
                        {opt.label}
                        {sortBy === opt.key && (sortDirection === "asc" ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />)}
                    </button>
                ))}
                <div className="ml-auto flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setShowFilters(!showFilters)}
                        className={clsx(
                            "text-xs font-bold px-3 py-1.5 rounded-full border transition-all flex items-center",
                            showFilters ? "bg-black text-white border-black" : "bg-white text-stone-500 border-stone-200 hover:bg-stone-100"
                        )}
                    >
                        <Filter className="w-3 h-3 mr-1.5" />
                        Filters
                    </button>
                </div>
            </section>

            {/* Advanced Filters */}
            {showFilters && (
                <section className="bg-white border border-stone-200 rounded-2xl p-4 flex flex-wrap gap-4 mb-4 animate-in slide-in-from-top-2 duration-300">
                    <div className="flex-1 min-w-[150px]">
                        <p className="text-[10px] text-stone-500 uppercase mb-2">Notice Type</p>
                        <select title="Notice Type" className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black" value={filterNoticeType} onChange={(e) => { setFilterNoticeType(e.target.value); setPage(1); }}>
                            <option value="">All Types</option>
                            <option value="Sources Sought">Sources Sought</option>
                            <option value="Presolicitation">Presolicitation</option>
                            <option value="Solicitation">Solicitation</option>
                            <option value="Combined Synopsis/Solicitation">Combined</option>
                        </select>
                    </div>
                    <div className="flex-1 min-w-[120px]">
                        <p className="text-[10px] text-stone-500 uppercase mb-2">Set-Aside</p>
                        <select title="Set-Aside" className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black" value={filterSetAside} onChange={(e) => { setFilterSetAside(e.target.value); setPage(1); }}>
                            <option value="">All</option>
                            {SET_ASIDE_OPTIONS.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex-1 min-w-[100px]">
                        <p className="text-[10px] text-stone-500 uppercase mb-2">State</p>
                        <select title="State" className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black" value={filterState} onChange={(e) => { setFilterState(e.target.value); setPage(1); }}>
                            <option value="">All</option>
                            {["AL","AK","AZ","AR","CA","CO","CT","DC","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"].map(s => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex-1 min-w-[120px]">
                        <p className="text-[10px] text-stone-500 uppercase mb-2">NAICS starts with</p>
                        <input type="text" placeholder="e.g. 5617" value={filterNaics} onChange={(e) => { setFilterNaics(e.target.value.replace(/[^0-9]/g, "").slice(0, 6)); setPage(1); }}
                            className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black font-mono" />
                    </div>
                    <div className="flex-1 min-w-[130px]">
                        <p className="text-[10px] text-stone-500 uppercase mb-2">Min Score</p>
                        <select title="Min Score" className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black" value={filterMinScore ?? ""} onChange={(e) => { setFilterMinScore(e.target.value ? Number(e.target.value) : null); setPage(1); }}>
                            <option value="">Any</option>
                            <option value="0.3">30%+</option>
                            <option value="0.5">50%+ (WARM)</option>
                            <option value="0.7">70%+ (HOT)</option>
                        </select>
                    </div>
                    <div className="flex-1 min-w-[130px]">
                        <p className="text-[10px] text-stone-500 uppercase mb-2">Closing in</p>
                        <select title="Max Deadline Days" className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black" value={filterMaxDeadlineDays ?? ""} onChange={(e) => { setFilterMaxDeadlineDays(e.target.value ? Number(e.target.value) : null); setPage(1); }}>
                            <option value="">Any</option>
                            <option value="7">7 days</option>
                            <option value="14">14 days</option>
                            <option value="30">30 days</option>
                            <option value="60">60 days</option>
                            <option value="90">90 days</option>
                        </select>
                    </div>
                    {(filterNoticeType || filterSetAside || filterState || filterNaics || filterMinScore != null || filterMaxDeadlineDays != null) && (
                        <button type="button" onClick={() => { setFilterNoticeType(""); setFilterSetAside(""); setFilterState(""); setFilterNaics(""); setFilterMinScore(null); setFilterMaxDeadlineDays(null); setPage(1); }} className="self-end px-3 py-2 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-full hover:bg-red-100">
                            Clear
                        </button>
                    )}
                </section>
            )}

            {/* Search */}
            <div className="bg-white p-2 rounded-full border border-stone-200 shadow-sm flex items-center mb-4 focus-within:ring-2 focus-within:ring-black focus-within:border-transparent transition-all">
                <Search className="w-5 h-5 text-stone-400 ml-3 sm:ml-4 mr-2" />
                <input
                    type="text"
                    placeholder="Search by title or agency..."
                    className="bg-transparent border-none outline-none w-full text-stone-700 text-sm"
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

            {/* Selection bar (for card + list views) */}
            {matches.length > 0 && viewMode !== "table" && (
                <div className="flex items-center gap-3 mb-2 px-1">
                    <label className="flex items-center gap-2 text-[11px] text-stone-500 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={allSelectedOnPage}
                            onChange={toggleSelectAllOnPage}
                            className="w-3.5 h-3.5 rounded border-stone-300 accent-black"
                        />
                        Select all on page
                    </label>
                    {selectedIds.size > 0 && (
                        <span className="text-[11px] text-stone-500">
                            {selectedIds.size} selected
                        </span>
                    )}
                </div>
            )}

            {/* Selection warning */}
            {selectionWarning && (
                <div className="mb-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg p-2 flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{selectionWarning}</span>
                    <button type="button" title="Dismiss warning" onClick={() => setSelectionWarning(null)} className="ml-auto text-amber-700 hover:text-amber-900">
                        <X className="w-3 h-3" />
                    </button>
                </div>
            )}

            {/* Empty States */}
            {matches.length === 0 && !loading && (
                <div className="bg-stone-50 border border-stone-200 border-dashed rounded-[24px] p-8 sm:p-12 text-center">
                    {filter === "SAVED" ? (
                        <>
                            <Bookmark className="w-10 h-10 text-stone-300 mx-auto mb-3" />
                            <p className="text-stone-500 mb-2">No saved matches yet.</p>
                            <p className="text-stone-400 text-sm">Click the bookmark icon on any match to save it for later.</p>
                        </>
                    ) : filter === "COLD" ? (
                        <>
                            <Shield className="w-10 h-10 text-blue-300 mx-auto mb-3" />
                            <p className="text-stone-500 mb-2">No COLD matches found.</p>
                            <p className="text-stone-400 text-sm">COLD matches (30-49% alignment) show opportunities with partial profile fit. Try generating matches to populate this list.</p>
                        </>
                    ) : (
                        <>
                            <Sparkles className="w-10 h-10 text-stone-300 mx-auto mb-3" />
                            <p className="text-stone-500 mb-2">No matches found yet</p>
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
                                            <Sparkles className="w-3.5 h-3.5 mr-2" />
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

            {/* Results — TABLE VIEW */}
            {matches.length > 0 && viewMode === "table" && (
                <TableView
                    matches={matches}
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelect}
                    onToggleSelectAll={toggleSelectAllOnPage}
                    visibleColumnKeys={visibleColumnKeys}
                    onVisibleColumnsChange={setVisibleColumnKeys}
                    onToggleSave={toggleSave}
                    onDismiss={dismissMatch}
                    pursuedIds={pursuedIds}
                    profileId={profileId}
                />
            )}

            {/* Results — LIST VIEW */}
            {matches.length > 0 && viewMode === "list" && (
                <ListView
                    matches={matches}
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelect}
                    onToggleSave={toggleSave}
                    onDismiss={dismissMatch}
                    pursuedIds={pursuedIds}
                />
            )}

            {/* Results — CARD VIEW */}
            {matches.length > 0 && viewMode === "card" && (
                <div className="space-y-2">
                    {matches.map((match) => {
                        const opp = match.opportunities;
                        if (!opp) return null;
                        const scorePercent = Math.round(match.score * 100);
                        const isSelected = selectedIds.has(match.id);
                        return (
                            <div key={match.id} className={clsx(
                                "bg-white border rounded-xl sm:rounded-2xl p-3 sm:p-4 transition-all shadow-sm group",
                                isSelected ? "border-amber-300 bg-amber-50/30" : "border-stone-200 hover:border-stone-300"
                            )}>
                                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                    {/* Selection + Score Badge */}
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => toggleSelect(match.id)}
                                            className="w-3.5 h-3.5 rounded border-stone-300 accent-black"
                                            title="Select for export"
                                        />
                                        <div className={clsx("flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-xl border-2 font-black text-sm sm:text-base", getScoreColor(match.score))}>
                                            {scorePercent}%
                                        </div>
                                    </div>

                                    {/* Content */}
                                    <Link href={`/opportunities/${opp.id}`} className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                            <span className={clsx(
                                                "text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-widest border",
                                                match.classification === "HOT"
                                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                    : match.classification === "WARM"
                                                    ? "bg-amber-50 text-amber-600 border-amber-200"
                                                    : "bg-blue-50 text-blue-600 border-blue-200"
                                            )}>
                                                {match.classification === "HOT" ? "Strong" : match.classification === "WARM" ? "Good" : "Possible"}
                                            </span>
                                            {opp.set_aside_code && (() => {
                                                const { tone } = setAsideBadgeTone(opp.set_aside_code);
                                                const toneClass =
                                                    tone === "violet" ? "bg-violet-100 text-violet-700 border-violet-200" :
                                                    tone === "emerald" ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
                                                    tone === "amber" ? "bg-amber-100 text-amber-700 border-amber-200" :
                                                    "bg-blue-100 text-blue-600 border-blue-200";
                                                return (
                                                    <span className={`text-[9px] font-bold border px-2 py-0.5 rounded uppercase ${toneClass}`}>
                                                        {opp.set_aside_code}
                                                    </span>
                                                );
                                            })()}
                                            {opp.notice_type && (
                                                <span className={clsx("text-[9px] px-2 py-0.5 rounded border uppercase tracking-widest", getNoticeColor(opp.notice_type))}>
                                                    {opp.notice_type}
                                                </span>
                                            )}
                                            {formatCurrency(opp.award_amount) && (
                                                <span className="text-[9px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-0.5 rounded">
                                                    {formatCurrency(opp.award_amount)}
                                                </span>
                                            )}
                                        </div>
                                        <p className="font-bold text-sm text-black line-clamp-1">{opp.title}</p>
                                        <p className="text-xs text-stone-500 line-clamp-1">{opp.agency || "Federal Agency"}</p>
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
                                        <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                            {pursuedIds.has(opp.id) ? (
                                                <span className="flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg text-[10px] font-bold">
                                                    <CheckCircle2 className="w-3 h-3" /> Pursuing
                                                </span>
                                            ) : (
                                                <button type="button" title="Start Pursuing"
                                                    onClick={(e) => { e.preventDefault(); handlePursue(opp.id, opp.notice_type); }}
                                                    disabled={pursuingIds.has(opp.id)}
                                                    className="p-1.5 rounded-lg text-stone-400 hover:text-black hover:bg-stone-100 transition-colors disabled:opacity-50">
                                                    {pursuingIds.has(opp.id) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
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
                                    <div className="flex sm:hidden sm:group-hover:flex mt-2 pt-2 border-t border-stone-100 gap-2 flex-wrap">
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
                    <p className="text-xs text-stone-500">
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

            {/* Floating Export Button */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-in slide-in-from-bottom-5 duration-200">
                    <div className="bg-black text-white rounded-full shadow-2xl flex items-center gap-2 pl-4 pr-1 py-1 border border-stone-700">
                        <span className="text-xs font-bold">
                            {selectedIds.size} / {MAX_SELECTION} selected
                        </span>
                        <button
                            type="button"
                            onClick={() => setSelectedIds(new Set())}
                            className="text-stone-400 hover:text-white p-1.5 rounded-full"
                            title="Clear selection"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setExportOpen(true)}
                            className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-full px-4 py-2 text-xs font-bold flex items-center gap-1.5 transition-colors"
                        >
                            <Download className="w-3.5 h-3.5" />
                            Export {selectedIds.size}
                        </button>
                    </div>
                </div>
            )}

            <BulkExportDialog
                open={exportOpen}
                matchIds={selectedArray}
                onClose={() => setExportOpen(false)}
            />
        </div>
    );
}
