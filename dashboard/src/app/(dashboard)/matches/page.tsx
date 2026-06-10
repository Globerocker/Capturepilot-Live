"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/client";
import { Loader2, Sparkles, Search, X, ChevronLeft, ChevronRight, Trophy, Shield, Target, ArrowRight, Bookmark, EyeOff, Flame, ChevronUp, ChevronDown, Filter, CheckCircle2, Download, AlertTriangle, List, Table as TableIcon, Columns3, GripVertical, MapPin } from "lucide-react";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { createPursuit } from "@/lib/pursue-utils";
import { captureMatchEvent } from "@/lib/learning-capture";
import { Skeleton, SkeletonMatchCard } from "@/components/ui/Skeleton";
import clsx from "clsx";
import Link from "next/link";
import { ViewToggle, type ViewMode } from "@/components/matches/ViewToggle";
import { TableView, DEFAULT_COLUMN_KEYS, ALL_COLUMNS, type MatchRow } from "@/components/matches/TableView";
import { ListView } from "@/components/matches/ListView";
import { AIFilterBar, type AIFilters } from "@/components/matches/AIFilterBar";
import { BulkExportDialog } from "@/components/matches/BulkExportDialog";
import SavedViews from "@/components/SavedViews";
import { SavedSearchesMenu } from "@/components/matches/SavedSearchesMenu";
import SourceLevelSwitcher, { SOURCE_LEVEL_VALUES, type SourceLevel } from "@/components/SourceLevelSwitcher";
import { SET_ASIDE_OPTIONS, setAsideBadgeTone } from "@/lib/set-aside-filters";
import { showToast } from "@/components/GlobalToast";

const RESCORE_POLL_INTERVAL_MS = 3000;
const RESCORE_POLL_MAX_ATTEMPTS = 30;

type RescoreStatus = "pending" | "running" | "done" | "failed";

interface RescoreJob {
    id: string;
    status: RescoreStatus;
}

const supabase = createSupabaseClient();

const formatCurrency = (val: number | null | undefined) => {
    if (!val) return null;
    if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
    if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
    return `$${val.toLocaleString()}`;
};

// PostgREST .or() syntax uses commas to separate conditions and parens to group them.
// Strip anything that would break the parser before interpolating user input.
function sanitizeForOrSearch(s: string): string {
    return s.replace(/[,()'\\]/g, " ").trim();
}

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
        source: string | null;
    };
}


export default function MyMatchesPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
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
    const [sourceLevel, setSourceLevel] = useState<SourceLevel>("ALL");
    const [pursuingIds, setPursuingIds] = useState<Set<string>>(new Set());
    const [pursuedIds, setPursuedIds] = useState<Set<string>>(new Set());
    const [generatingMatches, setGeneratingMatches] = useState(false);
    const [rescoreJob, setRescoreJob] = useState<RescoreJob | null>(null);
    const rescorePollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const rescorePollAttemptsRef = useRef(0);

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

    // ─── URL <-> filter-state sync ──────────────────────────────────────
    // Read once on mount; subsequent writes go state -> URL via the effect
    // below. Shareable links FTW.
    const urlInitialized = useRef(false);
    useEffect(() => {
        if (urlInitialized.current) return;
        urlInitialized.current = true;
        const q = (k: string) => searchParams.get(k);
        const f = q("filter");
        if (f === "HOT" || f === "WARM" || f === "COLD" || f === "SAVED" || f === "ALL") setFilter(f);
        const sb = q("sort");
        if (sb === "score" || sb === "deadline" || sb === "agency" || sb === "notice_type") setSortBy(sb);
        const sd = q("dir");
        if (sd === "asc" || sd === "desc") setSortDirection(sd);
        const nt = q("notice_type"); if (nt) setFilterNoticeType(nt);
        const sa = q("set_aside"); if (sa) setFilterSetAside(sa);
        const st = q("state"); if (st) setFilterState(st);
        const naics = q("naics"); if (naics) setFilterNaics(naics);
        const ms = q("min_score"); if (ms) { const n = parseInt(ms, 10); if (!Number.isNaN(n)) setFilterMinScore(n); }
        const md = q("max_deadline"); if (md) { const n = parseInt(md, 10); if (!Number.isNaN(n)) setFilterMaxDeadlineDays(n); }
        const lv = q("level"); if (lv === "FEDERAL" || lv === "SLED" || lv === "ALL") setSourceLevel(lv);
        const s = q("q"); if (s) { setActiveSearch(s); setSearchInput(s); }
        const v = q("view");
        if (v === "card" || v === "list" || v === "table") setViewMode(v);
        // Reveal the filters drawer if anything non-default is set so users see what's active.
        if (nt || sa || st || naics || ms || md) setShowFilters(true);
    }, [searchParams]);

    // Push state -> URL whenever a filter changes. Skip initial render.
    useEffect(() => {
        if (!urlInitialized.current) return;
        const params = new URLSearchParams();
        if (filter !== "ALL") params.set("filter", filter);
        if (sortBy !== "score") params.set("sort", sortBy);
        if (sortDirection !== "desc") params.set("dir", sortDirection);
        if (filterNoticeType) params.set("notice_type", filterNoticeType);
        if (filterSetAside) params.set("set_aside", filterSetAside);
        if (filterState) params.set("state", filterState);
        if (filterNaics) params.set("naics", filterNaics);
        if (filterMinScore != null) params.set("min_score", String(filterMinScore));
        if (filterMaxDeadlineDays != null) params.set("max_deadline", String(filterMaxDeadlineDays));
        if (sourceLevel !== "ALL") params.set("level", sourceLevel);
        if (activeSearch) params.set("q", activeSearch);
        if (viewMode !== "card") params.set("view", viewMode);
        const qs = params.toString();
        const href = qs ? `?${qs}` : window.location.pathname;
        router.replace(href, { scroll: false });
    }, [filter, sortBy, sortDirection, filterNoticeType, filterSetAside, filterState, filterNaics, filterMinScore, filterMaxDeadlineDays, sourceLevel, activeSearch, viewMode, router]);

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

    // Debounce search input → activeSearch (250ms) so the fetch isn't fired on every
    // keystroke. Reset to page 1 whenever the active search actually changes.
    useEffect(() => {
        if (searchInput === activeSearch) return;
        const t = setTimeout(() => {
            setActiveSearch(searchInput);
            setPage(1);
        }, 250);
        return () => clearTimeout(t);
    }, [searchInput, activeSearch]);

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
                "opportunities!inner(id, title, agency, naics_code, psc_code, notice_type, response_deadline, posted_date, set_aside_code, place_of_performance_state, award_amount, estimated_value, source)",
                { count: "exact" }
            )
            .eq("user_profile_id", profileId)
            .eq("is_dismissed", false)
            .in("opportunities.status", ["ACTIVE", "EXPIRING_SOON", "MARKET_RESEARCH", "DISCOVERED"]);

        // Source-level filter (Federal vs State+Local+Education vs All)
        const levelSources = SOURCE_LEVEL_VALUES[sourceLevel];
        if (levelSources) {
            query = query.in("opportunities.source", levelSources);
        }

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

        // Push joined-table filters into the query BEFORE .range() so pagination + count
        // reflect the true filtered result set (audit #10). Without this, client-side
        // filtering of a single 25-row page often returned 0-3 matches even when thousands
        // matched in the DB.
        if (filterNoticeType) {
            query = query.eq("opportunities.notice_type", filterNoticeType);
        }
        if (filterSetAside) {
            // set_aside_code is a code string; partial match preserves prior UX where a
            // short token (e.g. "SBA") could match longer set-aside codes.
            query = query.ilike("opportunities.set_aside_code", `%${filterSetAside}%`);
        }
        if (filterState) {
            query = query.eq("opportunities.place_of_performance_state", filterState);
        }
        if (filterNaics) {
            query = query.like("opportunities.naics_code", `${filterNaics}%`);
        }
        if (filterMaxDeadlineDays != null) {
            const nowIso = new Date().toISOString();
            const cutoffIso = new Date(Date.now() + filterMaxDeadlineDays * 86400000).toISOString();
            query = query
                .gte("opportunities.response_deadline", nowIso)
                .lte("opportunities.response_deadline", cutoffIso);
        }
        if (activeSearch) {
            const safe = sanitizeForOrSearch(activeSearch);
            if (safe) {
                // .or() against a foreign table searches title OR agency on opportunities.
                // Sanitized above to strip commas/parens/quotes that break PostgREST syntax.
                query = query.or(
                    `title.ilike.%${safe}%,agency.ilike.%${safe}%`,
                    { foreignTable: "opportunities" }
                );
            }
        }

        // Move sort into the query so the soonest deadline / first-alphabetical agency
        // surfaces on page 1, not just within the current 25-row window.
        if (sortBy === "score") {
            query = query.order("score", { ascending: sortDirection === "asc" });
        } else if (sortBy === "deadline") {
            query = query.order("response_deadline", {
                ascending: sortDirection === "asc",
                foreignTable: "opportunities",
                nullsFirst: false,
            });
        } else if (sortBy === "agency") {
            query = query.order("agency", {
                ascending: sortDirection === "asc",
                foreignTable: "opportunities",
            });
        } else if (sortBy === "notice_type") {
            query = query.order("notice_type", {
                ascending: sortDirection === "asc",
                foreignTable: "opportunities",
            });
        }

        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        const { data, count } = await query.range(from, to);

        const rows = (data || []) as unknown as UserMatch[];
        setMatches(rows);
        setTotalCount(count || 0);
        setLoading(false);
    }, [profileId, page, activeSearch, filter, sortBy, sortDirection, filterNoticeType, filterSetAside, filterState, filterNaics, filterMinScore, filterMaxDeadlineDays, sourceLevel]);

    useEffect(() => {
        if (profileId) fetchMatches();
    }, [fetchMatches, profileId]);

    const toggleSave = async (matchId: string, currentlySaved: boolean) => {
        await supabase.from("user_matches").update({ is_saved: !currentlySaved }).eq("id", matchId);
        setMatches(prev => prev.map(m => m.id === matchId ? { ...m, is_saved: !currentlySaved } : m));
        if (!currentlySaved) captureMatchEvent(matchId, "saved");
    };

    const dismissMatch = async (matchId: string) => {
        await supabase.from("user_matches").update({ is_dismissed: true }).eq("id", matchId);
        captureMatchEvent(matchId, "dismissed");
        setMatches(prev => prev.filter(m => m.id !== matchId));
        setSelectedIds(prev => { const n = new Set(prev); n.delete(matchId); return n; });
        setTotalCount(prev => prev - 1);
    };

    const handlePursue = async (oppId: string, noticeType: string, matchId?: string) => {
        if (!profileId || pursuingIds.has(oppId) || pursuedIds.has(oppId)) return;
        setPursuingIds(prev => new Set(prev).add(oppId));
        const result = await createPursuit(oppId, noticeType, profileId);
        setPursuingIds(prev => { const n = new Set(prev); n.delete(oppId); return n; });
        if (result.success) {
            setPursuedIds(prev => new Set(prev).add(oppId));
            if (matchId) captureMatchEvent(matchId, "pursued");
        }
    };

    const stopRescorePolling = useCallback(() => {
        if (rescorePollTimerRef.current) {
            clearTimeout(rescorePollTimerRef.current);
            rescorePollTimerRef.current = null;
        }
        rescorePollAttemptsRef.current = 0;
    }, []);

    const pollRescoreStatus = useCallback(async (jobId: string) => {
        rescorePollAttemptsRef.current += 1;
        try {
            const res = await fetch(`/api/matches/refresh/status/${jobId}`);
            if (!res.ok) {
                throw new Error(`Status check failed (${res.status})`);
            }
            const body = await res.json() as {
                status?: RescoreStatus;
                error?: string;
                result?: { hot?: number; warm?: number; cold?: number; total_scored?: number };
            };
            const status = body.status;

            if (status === "done") {
                stopRescorePolling();
                setRescoreJob(null);
                setGeneratingMatches(false);
                const r = body.result || {};
                const hot = r.hot ?? 0;
                const warm = r.warm ?? 0;
                const cold = r.cold ?? 0;
                showToast(`${hot} HOT, ${warm} WARM, ${cold} COLD matches found`, "success");
                setPage(1);
                await fetchMatches();
                return;
            }

            if (status === "failed") {
                stopRescorePolling();
                setRescoreJob(null);
                setGeneratingMatches(false);
                showToast(body.error || "Rescore failed. Please try again.", "error");
                return;
            }

            // status === "pending" | "running" — keep polling unless we've hit the cap
            if (rescorePollAttemptsRef.current >= RESCORE_POLL_MAX_ATTEMPTS) {
                stopRescorePolling();
                setRescoreJob(null);
                setGeneratingMatches(false);
                showToast(
                    "Rescore is still running. Refresh the page in a minute to see updates.",
                    "info"
                );
                return;
            }

            setRescoreJob({ id: jobId, status: status || "running" });
            rescorePollTimerRef.current = setTimeout(
                () => { pollRescoreStatus(jobId); },
                RESCORE_POLL_INTERVAL_MS
            );
        } catch (err) {
            stopRescorePolling();
            setRescoreJob(null);
            setGeneratingMatches(false);
            const msg = err instanceof Error ? err.message : "Could not check rescore status.";
            showToast(msg, "error");
        }
    }, [fetchMatches, stopRescorePolling]);

    const handleMatchClick = (matchId: string) => {
        captureMatchEvent(matchId, "clicked");
    };

    const handleGenerateMatches = async () => {
        if (rescoreJob || generatingMatches) return;
        setGeneratingMatches(true);
        try {
            const res = await fetch("/api/matches/refresh", { method: "POST" });
            if (!res.ok) {
                const body = await res.json().catch(() => ({} as { error?: string }));
                throw new Error(body.error || `Could not queue rescore (${res.status})`);
            }
            const body = await res.json() as { job_id?: string; queued?: boolean; error?: string };
            if (!body.job_id) {
                throw new Error(body.error || "Rescore did not return a job id.");
            }
            setRescoreJob({ id: body.job_id, status: "pending" });
            rescorePollAttemptsRef.current = 0;
            rescorePollTimerRef.current = setTimeout(
                () => { pollRescoreStatus(body.job_id as string); },
                RESCORE_POLL_INTERVAL_MS
            );
        } catch (err) {
            setGeneratingMatches(false);
            setRescoreJob(null);
            const msg = err instanceof Error ? err.message : "Could not start rescore.";
            showToast(msg, "error");
        }
    };

    // Stop polling on unmount
    useEffect(() => {
        return () => { stopRescorePolling(); };
    }, [stopRescorePolling]);

    // Resume polling if a rescore job is already queued/running for this profile
    // (e.g. another tab triggered it). Fail-soft if the backend doesn't yet
    // expose a list-mode endpoint — the button just stays ready.
    useEffect(() => {
        if (!profileId || rescoreJob) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(
                    `/api/matches/refresh/status/active?user_profile_id=${encodeURIComponent(profileId)}`
                );
                if (!res.ok || cancelled) return;
                const body = await res.json() as { job_id?: string; status?: RescoreStatus };
                if (!body.job_id || cancelled) return;
                if (body.status === "pending" || body.status === "running") {
                    setRescoreJob({ id: body.job_id, status: body.status });
                    setGeneratingMatches(true);
                    rescorePollAttemptsRef.current = 0;
                    rescorePollTimerRef.current = setTimeout(
                        () => { pollRescoreStatus(body.job_id as string); },
                        RESCORE_POLL_INTERVAL_MS
                    );
                }
            } catch { /* fail-soft: button just shows ready */ }
        })();
        return () => { cancelled = true; };
    }, [profileId, rescoreJob, pollRescoreStatus]);

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
                    <div className="flex flex-col items-end ml-4">
                        <button
                            type="button"
                            onClick={handleGenerateMatches}
                            disabled={generatingMatches || rescoreJob !== null}
                            className="bg-black text-white px-4 py-2 rounded-full text-xs font-bold inline-flex items-center disabled:opacity-60 flex-shrink-0"
                        >
                            {generatingMatches || rescoreJob ? (
                                <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> Scoring...</>
                            ) : (
                                <><Sparkles className="w-3 h-3 mr-1.5" /> Refresh Matches</>
                            )}
                        </button>
                        <p className="text-[10px] text-stone-400 mt-1">
                            Updates automatically when you change your profile
                        </p>
                    </div>
                </div>
            </header>

            {/* Rescore banner */}
            {rescoreJob && (
                <div className="mb-4 flex items-center gap-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl px-4 py-3 animate-in fade-in slide-in-from-top-2 duration-300">
                    <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                    <p className="text-sm font-medium flex-1">
                        Rescoring matches… (this takes 30-60s)
                    </p>
                </div>
            )}

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

            {/* Saved Searches — server-persisted filter combos with daily email
                alerts. Distinct from SavedViews above (which is localStorage-only
                view presets). Plan-tier gates the count. */}
            <div className="mb-3 flex justify-end">
                <SavedSearchesMenu
                    currentFilters={{
                        filter, sortBy, sortDirection,
                        filterNoticeType, filterSetAside, filterState, filterNaics,
                        filterMinScore, filterMaxDeadlineDays, sourceLevel,
                        activeSearch,
                    }}
                    onApply={(s) => {
                        const obj = s as Record<string, unknown>;
                        if (typeof obj.filter === "string") setFilter(obj.filter as typeof filter);
                        if (typeof obj.sortBy === "string") setSortBy(obj.sortBy as typeof sortBy);
                        if (typeof obj.sortDirection === "string") setSortDirection(obj.sortDirection as typeof sortDirection);
                        if (typeof obj.filterNoticeType === "string") setFilterNoticeType(obj.filterNoticeType);
                        if (typeof obj.filterSetAside === "string") setFilterSetAside(obj.filterSetAside);
                        if (typeof obj.filterState === "string") setFilterState(obj.filterState);
                        if (typeof obj.filterNaics === "string") setFilterNaics(obj.filterNaics);
                        if (typeof obj.filterMinScore === "number" || obj.filterMinScore === null) setFilterMinScore(obj.filterMinScore as number | null);
                        if (typeof obj.filterMaxDeadlineDays === "number" || obj.filterMaxDeadlineDays === null) setFilterMaxDeadlineDays(obj.filterMaxDeadlineDays as number | null);
                        if (typeof obj.activeSearch === "string") { setActiveSearch(obj.activeSearch); setSearchInput(obj.activeSearch); }
                        setPage(1);
                    }}
                />
            </div>

            {/* Source-Level Switcher — Federal / State+Local+Education / All */}
            <section className="mb-3">
                <SourceLevelSwitcher
                    value={sourceLevel}
                    onChange={(next) => { setSourceLevel(next); setPage(1); }}
                />
            </section>

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

            {/* Active filter chips — shows what's narrowing the results so users
                don't get confused when filters in a collapsed drawer hide rows. */}
            {(filterNoticeType || filterSetAside || filterState || filterNaics || filterMinScore != null || filterMaxDeadlineDays != null || activeSearch) && (
                <section className="flex flex-wrap items-center gap-1.5 mb-3" aria-label="Active filters">
                    <span className="text-[10px] text-stone-400 uppercase tracking-widest mr-1">Active filters</span>
                    {activeSearch && (
                        <button
                            type="button"
                            onClick={() => { setActiveSearch(""); setSearchInput(""); setPage(1); }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-stone-100 text-stone-700 border border-stone-200 hover:bg-stone-200 transition"
                        >
                            search: <span className="font-mono">&quot;{activeSearch}&quot;</span> <X className="w-3 h-3" />
                        </button>
                    )}
                    {filterNoticeType && (
                        <button type="button" onClick={() => { setFilterNoticeType(""); setPage(1); }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition">
                            notice: {filterNoticeType} <X className="w-3 h-3" />
                        </button>
                    )}
                    {filterSetAside && (
                        <button type="button" onClick={() => { setFilterSetAside(""); setPage(1); }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition">
                            set-aside: {filterSetAside} <X className="w-3 h-3" />
                        </button>
                    )}
                    {filterState && (
                        <button type="button" onClick={() => { setFilterState(""); setPage(1); }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition">
                            state: {filterState} <X className="w-3 h-3" />
                        </button>
                    )}
                    {filterNaics && (
                        <button type="button" onClick={() => { setFilterNaics(""); setPage(1); }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 transition">
                            NAICS: {filterNaics} <X className="w-3 h-3" />
                        </button>
                    )}
                    {filterMinScore != null && (
                        <button type="button" onClick={() => { setFilterMinScore(null); setPage(1); }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition">
                            min score: {filterMinScore}% <X className="w-3 h-3" />
                        </button>
                    )}
                    {filterMaxDeadlineDays != null && (
                        <button type="button" onClick={() => { setFilterMaxDeadlineDays(null); setPage(1); }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 transition">
                            ≤ {filterMaxDeadlineDays} days to deadline <X className="w-3 h-3" />
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => {
                            setFilterNoticeType("");
                            setFilterSetAside("");
                            setFilterState("");
                            setFilterNaics("");
                            setFilterMinScore(null);
                            setFilterMaxDeadlineDays(null);
                            setActiveSearch("");
                            setSearchInput("");
                            setPage(1);
                        }}
                        className="text-xs text-stone-500 hover:text-stone-900 underline underline-offset-4 ml-2"
                    >
                        Clear all
                    </button>
                </section>
            )}

            {/* Empty States */}
            {matches.length === 0 && !loading && (() => {
                const anyFilterActive = !!(filterNoticeType || filterSetAside || filterState || filterNaics || filterMinScore != null || filterMaxDeadlineDays != null || activeSearch);
                const clearAll = () => {
                    setFilterNoticeType("");
                    setFilterSetAside("");
                    setFilterState("");
                    setFilterNaics("");
                    setFilterMinScore(null);
                    setFilterMaxDeadlineDays(null);
                    setActiveSearch("");
                    setSearchInput("");
                    setPage(1);
                };
                return (
                    <div className="bg-stone-50 border border-stone-200 border-dashed rounded-[24px] p-8 sm:p-12 text-center">
                        {anyFilterActive ? (
                            <>
                                <Filter className="w-10 h-10 text-stone-300 mx-auto mb-3" />
                                <p className="text-stone-500 mb-2 font-medium">No matches with these filters</p>
                                <p className="text-stone-400 text-sm mb-4">
                                    Try widening the search — your profile may match opportunities outside the current filter set.
                                </p>
                                <div className="flex items-center justify-center gap-2 flex-wrap mb-3">
                                    {filterMinScore != null && filterMinScore > 50 && (
                                        <button type="button" onClick={() => setFilterMinScore(50)}
                                            className="text-xs font-semibold px-3 py-1.5 rounded-full bg-white border border-stone-200 text-stone-700 hover:bg-stone-100">
                                            Lower min score to 50%
                                        </button>
                                    )}
                                    {filterState && (
                                        <button type="button" onClick={() => setFilterState("")}
                                            className="text-xs font-semibold px-3 py-1.5 rounded-full bg-white border border-stone-200 text-stone-700 hover:bg-stone-100">
                                            Drop the {filterState} state filter
                                        </button>
                                    )}
                                    {filterSetAside && (
                                        <button type="button" onClick={() => setFilterSetAside("")}
                                            className="text-xs font-semibold px-3 py-1.5 rounded-full bg-white border border-stone-200 text-stone-700 hover:bg-stone-100">
                                            Drop the set-aside filter
                                        </button>
                                    )}
                                    {filterNoticeType && (
                                        <button type="button" onClick={() => setFilterNoticeType("")}
                                            className="text-xs font-semibold px-3 py-1.5 rounded-full bg-white border border-stone-200 text-stone-700 hover:bg-stone-100">
                                            Drop the {filterNoticeType} type
                                        </button>
                                    )}
                                </div>
                                <button type="button" onClick={clearAll}
                                    className="bg-black text-white px-6 py-2.5 rounded-full text-sm font-bold inline-flex items-center">
                                    Clear all filters
                                </button>
                            </>
                        ) : filter === "SAVED" ? (
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
                                        disabled={generatingMatches || rescoreJob !== null}
                                        className="bg-black text-white px-6 py-2.5 rounded-full text-sm font-bold inline-flex items-center disabled:opacity-60"
                                    >
                                        {generatingMatches || rescoreJob ? (
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
                );
            })()}

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
                                    <Link href={`/opportunities/${opp.id}`} onClick={() => handleMatchClick(match.id)} className="flex-1 min-w-0">
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
                                            <span className="inline-flex items-center gap-1 bg-sky-50 text-sky-700 border border-sky-200 px-2 py-0.5 rounded font-semibold">
                                                <MapPin className="w-3 h-3" />
                                                {opp.place_of_performance_state}
                                            </span>
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
                                                    onClick={(e) => { e.preventDefault(); handlePursue(opp.id, opp.notice_type, match.id); }}
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
                            onClick={() => {
                                setExportOpen(true);
                                selectedIds.forEach(id => captureMatchEvent(id, "exported"));
                            }}
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
