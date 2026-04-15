"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/client";
import { Loader2, Sparkles, Search, X, ChevronLeft, ChevronRight, Trophy, Shield, Target, ArrowRight, Bookmark, EyeOff, Flame, ChevronUp, ChevronDown, Filter, CheckCircle2, List, Table as TableIcon, Columns3, GripVertical } from "lucide-react";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { createPursuit } from "@/lib/pursue-utils";
import { Skeleton, SkeletonMatchCard } from "@/components/ui/Skeleton";
import clsx from "clsx";
import Link from "next/link";

const supabase = createSupabaseClient();

const formatCurrency = (val: number | null | undefined) => {
    if (!val) return null;
    if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
    if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
    return `$${val.toLocaleString()}`;
};

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
        psc_code: string | null;
        notice_type: string;
        response_deadline: string;
        posted_date: string | null;
        set_aside_code: string;
        place_of_performance_state: string;
        award_amount: number | null;
        estimated_value: number | null;
        source: string | null;
    };
}

type ColumnKey =
    | "score" | "title" | "agency" | "notice_type" | "set_aside"
    | "state" | "estimated_value" | "posted_date" | "response_deadline"
    | "naics" | "psc" | "source" | "actions";

interface ColumnDef {
    key: ColumnKey;
    label: string;
    defaultVisible: boolean;
}

const ALL_COLUMNS: ColumnDef[] = [
    { key: "score",            label: "Score",         defaultVisible: true  },
    { key: "title",            label: "Title",         defaultVisible: true  },
    { key: "agency",           label: "Agency",        defaultVisible: true  },
    { key: "notice_type",      label: "Notice Type",   defaultVisible: true  },
    { key: "set_aside",        label: "Set-Aside",     defaultVisible: false },
    { key: "state",            label: "Place of Perf.",defaultVisible: false },
    { key: "estimated_value",  label: "Est. Value",    defaultVisible: false },
    { key: "posted_date",      label: "Posted",        defaultVisible: false },
    { key: "response_deadline",label: "Deadline",      defaultVisible: true  },
    { key: "naics",            label: "NAICS",         defaultVisible: false },
    { key: "psc",              label: "PSC",           defaultVisible: false },
    { key: "source",           label: "Source",        defaultVisible: false },
    { key: "actions",          label: "Actions",       defaultVisible: true  },
];

const COLUMN_MAP: Record<ColumnKey, ColumnDef> = Object.fromEntries(ALL_COLUMNS.map(c => [c.key, c])) as Record<ColumnKey, ColumnDef>;

const DEFAULT_COLUMN_ORDER: ColumnKey[] = ALL_COLUMNS.map(c => c.key);
const DEFAULT_VISIBLE: ColumnKey[] = ALL_COLUMNS.filter(c => c.defaultVisible).map(c => c.key);

type ViewMode = "list" | "table";

function renderTableCell(
    key: ColumnKey,
    match: UserMatch,
    opp: UserMatch["opportunities"],
    ctx: {
        scorePercent: number;
        getScoreColor: (s: number) => string;
        getNoticeColor: (t: string) => string;
        formatCurrency: (v: number | null | undefined) => string | null;
        toggleSave: (matchId: string, currentlySaved: boolean) => void;
        dismissMatch: (matchId: string) => void;
        handlePursue: (oppId: string, noticeType: string) => void;
        pursuingIds: Set<string>;
        pursuedIds: Set<string>;
    }
): React.ReactNode {
    switch (key) {
        case "score":
            return (
                <span className={clsx("inline-flex items-center justify-center px-2 py-1 rounded-lg border-2 font-black text-xs", ctx.getScoreColor(match.score))}>
                    {ctx.scorePercent}%
                </span>
            );
        case "title":
            return (
                <Link href={`/opportunities/${opp.id}`} className="font-bold text-black hover:underline line-clamp-1 max-w-xs block">
                    {opp.title}
                </Link>
            );
        case "agency":
            return <span className="text-stone-600 line-clamp-1 max-w-[200px] block">{opp.agency || "—"}</span>;
        case "notice_type":
            return opp.notice_type ? (
                <span className={clsx("text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-widest", ctx.getNoticeColor(opp.notice_type))}>
                    {opp.notice_type}
                </span>
            ) : <span className="text-stone-400">—</span>;
        case "set_aside":
            return opp.set_aside_code ? (
                <span className="text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded uppercase">{opp.set_aside_code}</span>
            ) : <span className="text-stone-400">—</span>;
        case "state":
            return <span className="font-mono text-xs text-stone-600">{opp.place_of_performance_state || "—"}</span>;
        case "estimated_value": {
            const v = opp.estimated_value ?? opp.award_amount;
            const s = ctx.formatCurrency(v);
            return s ? <span className="font-bold text-emerald-700">{s}</span> : <span className="text-stone-400">—</span>;
        }
        case "posted_date":
            return opp.posted_date ? <span className="text-xs text-stone-600">{new Date(opp.posted_date).toLocaleDateString()}</span> : <span className="text-stone-400">—</span>;
        case "response_deadline":
            return opp.response_deadline ? <span className="font-bold text-xs text-stone-700">{new Date(opp.response_deadline).toLocaleDateString()}</span> : <span className="text-stone-400">TBD</span>;
        case "naics":
            return <span className="font-mono text-xs bg-stone-100 px-2 py-0.5 rounded border border-stone-200">{opp.naics_code || "—"}</span>;
        case "psc":
            return opp.psc_code ? <span className="font-mono text-xs bg-stone-100 px-2 py-0.5 rounded border border-stone-200">{opp.psc_code}</span> : <span className="text-stone-400">—</span>;
        case "source":
            return <span className="text-xs text-stone-500 uppercase">{opp.source || "SAM"}</span>;
        case "actions":
            return (
                <div className="flex items-center gap-1">
                    {ctx.pursuedIds.has(opp.id) ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg text-[10px] font-bold">
                            <CheckCircle2 className="w-3 h-3" /> Pursuing
                        </span>
                    ) : (
                        <button type="button" title="Pursue"
                            onClick={() => ctx.handlePursue(opp.id, opp.notice_type)}
                            disabled={ctx.pursuingIds.has(opp.id)}
                            className="p-1.5 rounded-lg text-stone-400 hover:text-black hover:bg-stone-100 disabled:opacity-50">
                            {ctx.pursuingIds.has(opp.id) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        </button>
                    )}
                    <button type="button" title={match.is_saved ? "Unsave" : "Save"}
                        onClick={() => ctx.toggleSave(match.id, match.is_saved)}
                        className={clsx("p-1.5 rounded-lg",
                            match.is_saved ? "text-amber-500 bg-amber-50" : "text-stone-400 hover:text-amber-500 hover:bg-amber-50"
                        )}>
                        <Bookmark className="w-3.5 h-3.5" fill={match.is_saved ? "currentColor" : "none"} />
                    </button>
                    <button type="button" title="Dismiss"
                        onClick={() => ctx.dismissMatch(match.id)}
                        className="p-1.5 rounded-lg text-stone-400 hover:text-red-500 hover:bg-red-50">
                        <EyeOff className="w-3.5 h-3.5" />
                    </button>
                </div>
            );
        default:
            return null;
    }
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
    const [pursuingIds, setPursuingIds] = useState<Set<string>>(new Set());
    const [pursuedIds, setPursuedIds] = useState<Set<string>>(new Set());
    const [generatingMatches, setGeneratingMatches] = useState(false);
    const [viewMode, setViewMode] = useState<ViewMode>("list");
    const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(DEFAULT_COLUMN_ORDER);
    const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(DEFAULT_VISIBLE);
    const [showColumnPicker, setShowColumnPicker] = useState(false);
    const [dragColumn, setDragColumn] = useState<ColumnKey | null>(null);
    const pageSize = 25;

    // Restore persisted view prefs per profile
    useEffect(() => {
        if (!profileId) return;
        try {
            const mode = localStorage.getItem(`matches:viewMode:${profileId}`);
            if (mode === "list" || mode === "table") setViewMode(mode);
            const order = localStorage.getItem(`matches:columnOrder:${profileId}`);
            if (order) {
                const parsed = JSON.parse(order) as string[];
                const valid = parsed.filter(k => (COLUMN_MAP as Record<string, unknown>)[k]) as ColumnKey[];
                // Append any new columns that weren't in saved order
                const missing = DEFAULT_COLUMN_ORDER.filter(k => !valid.includes(k));
                setColumnOrder([...valid, ...missing]);
            }
            const vis = localStorage.getItem(`matches:visibleColumns:${profileId}`);
            if (vis) {
                const parsed = JSON.parse(vis) as string[];
                const valid = parsed.filter(k => (COLUMN_MAP as Record<string, unknown>)[k]) as ColumnKey[];
                if (valid.length > 0) setVisibleColumns(valid);
            }
        } catch { /* ignore parse errors */ }
    }, [profileId]);

    useEffect(() => {
        if (!profileId) return;
        localStorage.setItem(`matches:viewMode:${profileId}`, viewMode);
    }, [viewMode, profileId]);

    useEffect(() => {
        if (!profileId) return;
        localStorage.setItem(`matches:columnOrder:${profileId}`, JSON.stringify(columnOrder));
    }, [columnOrder, profileId]);

    useEffect(() => {
        if (!profileId) return;
        localStorage.setItem(`matches:visibleColumns:${profileId}`, JSON.stringify(visibleColumns));
    }, [visibleColumns, profileId]);

    const toggleColumn = (key: ColumnKey) => {
        setVisibleColumns(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
    };

    const orderedVisibleColumns = useMemo(
        () => columnOrder.filter(k => visibleColumns.includes(k)),
        [columnOrder, visibleColumns]
    );

    const handleColumnDrop = (targetKey: ColumnKey) => {
        if (!dragColumn || dragColumn === targetKey) return;
        setColumnOrder(prev => {
            const from = prev.indexOf(dragColumn);
            const to = prev.indexOf(targetKey);
            if (from === -1 || to === -1) return prev;
            const next = [...prev];
            next.splice(from, 1);
            next.splice(to, 0, dragColumn);
            return next;
        });
        setDragColumn(null);
    };

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
                "opportunities(id, title, agency, naics_code, psc_code, notice_type, response_deadline, posted_date, set_aside_code, place_of_performance_state, award_amount, estimated_value, source)",
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
        if (score >= 0.30) return "text-blue-600 bg-blue-50 border-blue-200";
        return "text-stone-500 bg-stone-50 border-stone-200";
    };

    if (loading && matches.length === 0) {
        return (
            <div className="max-w-5xl mx-auto pb-12 animate-in fade-in duration-500 px-1">
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
        <div className="max-w-5xl mx-auto pb-12 animate-in fade-in duration-500 px-1">
            <header className="mb-6">
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tighter text-black flex items-center">
                    <Target className="mr-2 sm:mr-3 w-6 h-6 sm:w-8 sm:h-8" /> Opportunities
                    <span className="ml-3 text-sm font-sans font-medium bg-stone-100 px-3 py-1 rounded-full text-stone-500 border border-stone-200">
                        {totalCount.toLocaleString()}
                    </span>
                </h2>
                <div className="flex items-center justify-between mt-1">
                    <p className="text-stone-500 font-medium text-sm">
                        Opportunities scored and ranked based on your complete profile
                        <InfoTooltip text="Scores combine NAICS match, certifications, geography, past performance, contract value fit, and more. HOT = 70%+ alignment. WARM = 50-69%. COLD = 30-49%." />
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

            {/* Filter Tabs */}
            <section className="flex flex-wrap gap-2 mb-4">
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
                    {/* View toggle */}
                    <div className="inline-flex rounded-full border border-stone-200 bg-white overflow-hidden">
                        <button
                            type="button"
                            title="List view"
                            onClick={() => setViewMode("list")}
                            className={clsx(
                                "px-3 py-1.5 text-xs font-bold inline-flex items-center gap-1 transition-colors",
                                viewMode === "list" ? "bg-black text-white" : "text-stone-500 hover:bg-stone-50"
                            )}
                        >
                            <List className="w-3 h-3" /> List
                        </button>
                        <button
                            type="button"
                            title="Table view"
                            onClick={() => setViewMode("table")}
                            className={clsx(
                                "px-3 py-1.5 text-xs font-bold inline-flex items-center gap-1 transition-colors",
                                viewMode === "table" ? "bg-black text-white" : "text-stone-500 hover:bg-stone-50"
                            )}
                        >
                            <TableIcon className="w-3 h-3" /> Table
                        </button>
                    </div>
                    {viewMode === "table" && (
                        <button
                            type="button"
                            onClick={() => setShowColumnPicker(v => !v)}
                            className={clsx(
                                "text-xs font-bold px-3 py-1.5 rounded-full border transition-all inline-flex items-center gap-1",
                                showColumnPicker ? "bg-black text-white border-black" : "bg-white text-stone-500 border-stone-200 hover:bg-stone-100"
                            )}
                        >
                            <Columns3 className="w-3 h-3" /> Columns
                        </button>
                    )}
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

            {/* Column picker (table view only) */}
            {viewMode === "table" && showColumnPicker && (
                <section className="bg-white border border-stone-200 rounded-2xl p-4 mb-4 animate-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-bold text-stone-700 uppercase tracking-widest">Customize columns</p>
                        <button
                            type="button"
                            onClick={() => { setColumnOrder(DEFAULT_COLUMN_ORDER); setVisibleColumns(DEFAULT_VISIBLE); }}
                            className="text-[11px] font-bold text-stone-500 hover:text-black underline"
                        >
                            Reset
                        </button>
                    </div>
                    <p className="text-[11px] text-stone-400 mb-3">Drag the handle to reorder. Toggle the checkbox to show/hide.</p>
                    <ul className="space-y-1">
                        {columnOrder.map(key => {
                            const col = COLUMN_MAP[key];
                            const visible = visibleColumns.includes(key);
                            return (
                                <li
                                    key={key}
                                    draggable
                                    onDragStart={() => setDragColumn(key)}
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={() => handleColumnDrop(key)}
                                    onDragEnd={() => setDragColumn(null)}
                                    className={clsx(
                                        "flex items-center gap-2 px-2 py-1.5 rounded-lg border bg-stone-50 cursor-move",
                                        dragColumn === key ? "opacity-50 border-black" : "border-stone-200"
                                    )}
                                >
                                    <GripVertical className="w-3.5 h-3.5 text-stone-400" />
                                    <label className="flex-1 flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={visible}
                                            onChange={() => toggleColumn(key)}
                                            className="accent-black"
                                        />
                                        <span className="text-xs font-medium text-stone-700">{col.label}</span>
                                    </label>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            )}

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
                            <option value="SBA">Small Business</option>
                            <option value="8A">8(a)</option>
                            <option value="SDVOSB">SDVOSB</option>
                            <option value="WOSB">WOSB</option>
                            <option value="HUBZone">HUBZone</option>
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
                    {(filterNoticeType || filterSetAside || filterState) && (
                        <button type="button" onClick={() => { setFilterNoticeType(""); setFilterSetAside(""); setFilterState(""); setPage(1); }} className="self-end px-3 py-2 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-full hover:bg-red-100">
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

            {/* Results — Table view */}
            {matches.length > 0 && viewMode === "table" && (
                <div className="bg-white border border-stone-200 rounded-2xl overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-stone-50 border-b border-stone-200">
                            <tr>
                                {orderedVisibleColumns.map(key => (
                                    <th key={key} className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-stone-500 whitespace-nowrap">
                                        {COLUMN_MAP[key].label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {matches.map(match => {
                                const opp = match.opportunities;
                                if (!opp) return null;
                                const scorePercent = Math.round(match.score * 100);
                                return (
                                    <tr key={match.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                                        {orderedVisibleColumns.map(key => (
                                            <td key={key} className="px-3 py-2.5 align-middle whitespace-nowrap text-stone-700">
                                                {renderTableCell(key, match, opp, {
                                                    scorePercent,
                                                    getScoreColor,
                                                    getNoticeColor,
                                                    formatCurrency,
                                                    toggleSave,
                                                    dismissMatch,
                                                    handlePursue,
                                                    pursuingIds,
                                                    pursuedIds,
                                                })}
                                            </td>
                                        ))}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Results — List view */}
            {matches.length > 0 && viewMode === "list" && (
                <div className="space-y-2">
                    {matches.map((match) => {
                        const opp = match.opportunities;
                        if (!opp) return null;
                        const scorePercent = Math.round(match.score * 100);
                        return (
                            <div key={match.id} className="bg-white border border-stone-200 hover:border-stone-300 rounded-xl sm:rounded-2xl p-3 sm:p-4 transition-all shadow-sm group">
                                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                    {/* Score Badge */}
                                    <div className={clsx("flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-xl border-2 font-black text-sm sm:text-base flex-shrink-0", getScoreColor(match.score))}>
                                        {scorePercent}%
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
                                            {opp.set_aside_code && (
                                                <span className="text-[9px] font-bold bg-blue-100 text-blue-600 border border-blue-200 px-2 py-0.5 rounded uppercase">{opp.set_aside_code}</span>
                                            )}
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
        </div>
    );
}
