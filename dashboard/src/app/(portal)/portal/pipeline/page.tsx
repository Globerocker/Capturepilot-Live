"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import {
    Layers, Loader2, ExternalLink, Clock, ChevronDown, ChevronRight,
    Search, MessageSquare, Save, Plus, ArrowRight,
} from "lucide-react";
import clsx from "clsx";

const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/* ─── Types ─── */

interface Pursuit {
    id: string;
    opportunity_id: string;
    stage: string;
    priority: string;
    notes: string | null;
    created_at: string;
    stage_changed_at: string | null;
    opportunity: {
        title: string;
        agency: string;
        notice_id: string;
        notice_type: string;
        set_aside_code: string;
        response_deadline: string;
        naics_code: string;
        estimated_value: number;
    };
}

interface SearchResult {
    id: string;
    title: string;
    agency: string;
    notice_id: string;
    naics_code: string;
    estimated_value: number;
}

/* ─── Constants ─── */

const STAGES = [
    { key: "discovered", label: "Discovered", color: "bg-stone-100", dot: "bg-stone-400", text: "text-stone-700", border: "border-stone-200" },
    { key: "researching", label: "Research", color: "bg-blue-50", dot: "bg-blue-500", text: "text-blue-700", border: "border-blue-200" },
    { key: "contacted", label: "Contacted", color: "bg-cyan-50", dot: "bg-cyan-500", text: "text-cyan-700", border: "border-cyan-200" },
    { key: "in_contact", label: "In Contact", color: "bg-indigo-50", dot: "bg-indigo-500", text: "text-indigo-700", border: "border-indigo-200" },
    { key: "preparing", label: "Preparing Bid", color: "bg-amber-50", dot: "bg-amber-500", text: "text-amber-700", border: "border-amber-200" },
    { key: "needs_feedback", label: "Needs Feedback", color: "bg-orange-50", dot: "bg-orange-500", text: "text-orange-700", border: "border-orange-200" },
    { key: "submitted", label: "Submitted", color: "bg-violet-50", dot: "bg-violet-500", text: "text-violet-700", border: "border-violet-200" },
    { key: "negotiation", label: "Negotiation", color: "bg-pink-50", dot: "bg-pink-500", text: "text-pink-700", border: "border-pink-200" },
    { key: "awarded", label: "Won", color: "bg-emerald-50", dot: "bg-emerald-500", text: "text-emerald-700", border: "border-emerald-200" },
    { key: "lost", label: "Lost", color: "bg-red-50", dot: "bg-red-400", text: "text-red-600", border: "border-red-200" },
    { key: "no_bid", label: "No Bid", color: "bg-stone-50", dot: "bg-stone-300", text: "text-stone-500", border: "border-stone-100" },
];

const PRIORITY_OPTIONS = [
    { value: "high", label: "High", color: "text-red-600 bg-red-50 border-red-200" },
    { value: "medium", label: "Medium", color: "text-amber-600 bg-amber-50 border-amber-200" },
    { value: "low", label: "Low", color: "text-stone-500 bg-stone-50 border-stone-200" },
];

/* ─── Helpers ─── */

const fmtCurrency = (n: number) => {
    if (!n) return "";
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toLocaleString()}`;
};

const formatDate = (d: string | null) => {
    if (!d) return "";
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

/* ─── Component ─── */

export default function PortalPipeline() {
    const [pursuits, setPursuits] = useState<Pursuit[]>([]);
    const [loading, setLoading] = useState(true);
    const [profileId, setProfileId] = useState("");
    const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
    const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set());
    const [noteTexts, setNoteTexts] = useState<Record<string, string>>({});
    const [savingNotes, setSavingNotes] = useState<Record<string, boolean>>({});
    const [notesSaved, setNotesSaved] = useState<Record<string, boolean>>({});
    const [sendingFeedback, setSendingFeedback] = useState<string | null>(null);
    const [feedbackText, setFeedbackText] = useState("");

    // Add to pipeline search
    const [showAddSearch, setShowAddSearch] = useState(false);
    const [addSearchQuery, setAddSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [addingOppId, setAddingOppId] = useState<string | null>(null);

    /* ─── Load data ─── */
    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data: prof } = await supabase
                .from("user_profiles")
                .select("id")
                .eq("auth_user_id", user.id)
                .single();
            if (!prof) return;
            setProfileId(prof.id);

            const { data } = await supabase
                .from("user_pursuits")
                .select(`id, opportunity_id, stage, priority, notes, created_at, stage_changed_at,
                    opportunity:opportunities!inner(title, agency, notice_id, notice_type, set_aside_code, response_deadline, naics_code, estimated_value)`)
                .eq("user_profile_id", prof.id)
                .order("created_at", { ascending: false });

            const loaded = (data || []) as unknown as Pursuit[];
            setPursuits(loaded);

            // Init note texts
            const notes: Record<string, string> = {};
            loaded.forEach(p => { notes[p.id] = p.notes || ""; });
            setNoteTexts(notes);

            setLoading(false);
        })();
    }, []);

    /* ─── Grouped by stage ─── */
    const byStage = useMemo(() => {
        return STAGES.map(s => ({
            ...s,
            items: pursuits.filter(p => p.stage === s.key),
            totalValue: pursuits
                .filter(p => p.stage === s.key)
                .reduce((sum, p) => {
                    const opp = (Array.isArray(p.opportunity) ? p.opportunity[0] : p.opportunity) as Pursuit["opportunity"];
                    return sum + (opp?.estimated_value || 0);
                }, 0),
        }));
    }, [pursuits]);

    /* ─── Stage counts summary ─── */
    const stageCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        STAGES.forEach(s => { counts[s.key] = 0; });
        pursuits.forEach(p => { counts[p.stage] = (counts[p.stage] || 0) + 1; });
        return counts;
    }, [pursuits]);

    /* ─── Actions ─── */
    const changeStage = async (pursuitId: string, newStage: string) => {
        const now = new Date().toISOString();
        await supabase.from("user_pursuits").update({
            stage: newStage,
            stage_changed_at: now,
        }).eq("id", pursuitId);
        setPursuits(prev => prev.map(p =>
            p.id === pursuitId ? { ...p, stage: newStage, stage_changed_at: now } : p
        ));
    };

    const changePriority = async (pursuitId: string, newPriority: string) => {
        await supabase.from("user_pursuits").update({ priority: newPriority }).eq("id", pursuitId);
        setPursuits(prev => prev.map(p =>
            p.id === pursuitId ? { ...p, priority: newPriority } : p
        ));
    };

    const saveNotes = useCallback(async (pursuitId: string) => {
        const text = noteTexts[pursuitId] ?? "";
        setSavingNotes(prev => ({ ...prev, [pursuitId]: true }));
        await supabase.from("user_pursuits").update({ notes: text }).eq("id", pursuitId);
        setPursuits(prev => prev.map(p =>
            p.id === pursuitId ? { ...p, notes: text } : p
        ));
        setSavingNotes(prev => ({ ...prev, [pursuitId]: false }));
        setNotesSaved(prev => ({ ...prev, [pursuitId]: true }));
        setTimeout(() => setNotesSaved(prev => ({ ...prev, [pursuitId]: false })), 2000);
    }, [noteTexts]);

    const sendFeedback = async (pursuitId: string) => {
        if (!feedbackText.trim() || !profileId) return;
        const pursuit = pursuits.find(p => p.id === pursuitId);
        if (!pursuit) return;
        const opp = (Array.isArray(pursuit.opportunity) ? pursuit.opportunity[0] : pursuit.opportunity) as Pursuit["opportunity"];

        await supabase.from("client_tasks").insert({
            user_profile_id: profileId,
            title: `Feedback: ${opp?.title?.substring(0, 80) || "Pipeline Item"}`,
            description: feedbackText,
            category: "feedback",
            status: "pending",
            priority: pursuit.priority || "medium",
        });

        setFeedbackText("");
        setSendingFeedback(null);
    };

    const toggleCard = (id: string) => {
        setExpandedCards(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleStage = (key: string) => {
        setCollapsedStages(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };

    /* ─── Add to pipeline search ─── */
    const searchOpportunities = async (query: string) => {
        setAddSearchQuery(query);
        if (query.trim().length < 3) {
            setSearchResults([]);
            return;
        }
        setSearchLoading(true);
        const { data } = await supabase
            .from("opportunities")
            .select("id, title, agency, notice_id, naics_code, estimated_value")
            .in("status", ["ACTIVE", "EXPIRING_SOON", "MARKET_RESEARCH", "DISCOVERED"])
            .ilike("title", `%${query}%`)
            .limit(10);
        setSearchResults((data || []) as SearchResult[]);
        setSearchLoading(false);
    };

    const addToPipeline = async (oppId: string) => {
        if (!profileId) return;
        setAddingOppId(oppId);
        await supabase.from("user_pursuits").upsert({
            user_profile_id: profileId,
            opportunity_id: oppId,
            stage: "discovered",
            priority: "medium",
        }, { onConflict: "user_profile_id,opportunity_id" });

        // Reload pursuits
        const { data } = await supabase
            .from("user_pursuits")
            .select(`id, opportunity_id, stage, priority, notes, created_at, stage_changed_at,
                opportunity:opportunities!inner(title, agency, notice_id, notice_type, set_aside_code, response_deadline, naics_code, estimated_value)`)
            .eq("user_profile_id", profileId)
            .order("created_at", { ascending: false });

        const loaded = (data || []) as unknown as Pursuit[];
        setPursuits(loaded);
        loaded.forEach(p => {
            setNoteTexts(prev => ({ ...prev, [p.id]: prev[p.id] ?? p.notes ?? "" }));
        });

        setAddingOppId(null);
        setAddSearchQuery("");
        setSearchResults([]);
    };

    /* ─── Render ─── */

    if (loading) {
        return (
            <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
            </div>
        );
    }

    const activeCount = pursuits.filter(p => !["awarded", "lost", "no_bid"].includes(p.stage)).length;

    return (
        <div className="space-y-6 max-w-full">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold text-black flex items-center gap-2">
                        <Layers className="w-6 h-6" /> Pipeline
                    </h1>
                    <p className="text-sm text-stone-500 mt-1">
                        {activeCount} active deals, {pursuits.length} total
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setShowAddSearch(!showAddSearch)}
                        className={clsx(
                            "text-xs font-semibold px-3.5 py-2 rounded-xl border transition-colors inline-flex items-center gap-1.5",
                            showAddSearch
                                ? "bg-black text-white border-black"
                                : "bg-white text-stone-600 border-stone-200 hover:border-stone-400"
                        )}
                    >
                        <Plus className="w-3.5 h-3.5" /> Add to Pipeline
                    </button>
                    <Link
                        href="/portal/opportunities"
                        className="text-xs font-semibold px-3.5 py-2 rounded-xl border border-stone-200 text-stone-600 hover:border-stone-400 transition-colors inline-flex items-center gap-1.5"
                    >
                        <ArrowRight className="w-3.5 h-3.5" /> Browse Opportunities
                    </Link>
                </div>
            </div>

            {/* Stage Counts Summary Bar */}
            <div className="bg-white border border-stone-200 rounded-2xl p-4 overflow-x-auto">
                <div className="flex items-center gap-1 min-w-max">
                    {STAGES.filter(s => !["lost", "no_bid"].includes(s.key)).map((s, i, arr) => (
                        <div key={s.key} className="flex items-center">
                            <div className="flex items-center gap-1.5 px-2.5 py-1.5">
                                <div className={clsx("w-2 h-2 rounded-full", s.dot)} />
                                <span className="text-xs font-semibold text-stone-600 whitespace-nowrap">
                                    {stageCounts[s.key] || 0}
                                </span>
                                <span className="text-[10px] text-stone-400 whitespace-nowrap">{s.label}</span>
                            </div>
                            {i < arr.length - 1 && (
                                <ChevronRight className="w-3 h-3 text-stone-300 flex-shrink-0" />
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Add to Pipeline Search */}
            {showAddSearch && (
                <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm space-y-3">
                    <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Search opportunities to add</p>
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
                        <input
                            value={addSearchQuery}
                            onChange={e => searchOpportunities(e.target.value)}
                            placeholder="Search by opportunity title (min 3 characters)..."
                            className="w-full pl-10 pr-4 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-black bg-white"
                        />
                    </div>
                    {searchLoading && (
                        <div className="flex items-center gap-2 text-xs text-stone-400 py-2">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching...
                        </div>
                    )}
                    {searchResults.length > 0 && (
                        <div className="space-y-1.5 max-h-64 overflow-y-auto">
                            {searchResults.map(r => {
                                const alreadyAdded = pursuits.some(p => p.opportunity_id === r.id);
                                return (
                                    <div key={r.id} className="flex items-center justify-between gap-3 p-3 bg-stone-50 rounded-xl border border-stone-100">
                                        <div className="min-w-0">
                                            <p className="text-xs font-semibold text-stone-900 line-clamp-1">{r.title}</p>
                                            <p className="text-[10px] text-stone-500">{r.agency} {r.naics_code ? `| NAICS ${r.naics_code}` : ""} {r.estimated_value ? `| ${fmtCurrency(r.estimated_value)}` : ""}</p>
                                        </div>
                                        {alreadyAdded ? (
                                            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg whitespace-nowrap">
                                                In Pipeline
                                            </span>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => addToPipeline(r.id)}
                                                disabled={addingOppId === r.id}
                                                className="text-[10px] font-bold text-white bg-black px-2.5 py-1 rounded-lg hover:bg-stone-800 transition-colors whitespace-nowrap inline-flex items-center gap-1 disabled:opacity-50"
                                            >
                                                {addingOppId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                                                Add
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    {addSearchQuery.length >= 3 && !searchLoading && searchResults.length === 0 && (
                        <p className="text-xs text-stone-400 py-2">No opportunities found matching your search.</p>
                    )}
                </div>
            )}

            {/* Empty State */}
            {pursuits.length === 0 && (
                <div className="bg-white border border-stone-200 rounded-2xl p-12 text-center">
                    <Layers className="w-12 h-12 text-stone-300 mx-auto mb-4" />
                    <p className="text-stone-500 text-sm mb-2">No deals in your pipeline yet.</p>
                    <p className="text-stone-400 text-xs mb-4">
                        Add opportunities from the Opportunities page or use the search above to start building your pipeline.
                    </p>
                    <Link
                        href="/portal/opportunities"
                        className="text-xs font-semibold px-4 py-2 rounded-xl bg-black text-white hover:bg-stone-800 transition-colors inline-flex items-center gap-1.5"
                    >
                        <ArrowRight className="w-3.5 h-3.5" /> Browse Opportunities
                    </Link>
                </div>
            )}

            {/* Pipeline Stages (list view, grouped) */}
            {pursuits.length > 0 && (
                <div className="space-y-4">
                    {byStage.filter(s => s.items.length > 0).map(stage => {
                        const isCollapsed = collapsedStages.has(stage.key);

                        return (
                            <div key={stage.key} className={clsx("border rounded-2xl overflow-hidden", stage.border)}>
                                {/* Stage Header */}
                                <button
                                    type="button"
                                    onClick={() => toggleStage(stage.key)}
                                    className={clsx("w-full flex items-center justify-between px-5 py-3.5", stage.color)}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={clsx("w-3 h-3 rounded-full", stage.dot)} />
                                        <span className={clsx("text-sm font-bold", stage.text)}>
                                            {stage.label}
                                        </span>
                                        <span className="text-xs font-semibold text-stone-400 bg-white/60 px-2 py-0.5 rounded-lg">
                                            {stage.items.length} {stage.items.length === 1 ? "deal" : "deals"}
                                        </span>
                                        {stage.totalValue > 0 && (
                                            <span className="text-xs text-stone-400">
                                                {fmtCurrency(stage.totalValue)} total value
                                            </span>
                                        )}
                                    </div>
                                    <ChevronDown className={clsx(
                                        "w-4 h-4 text-stone-400 transition-transform",
                                        isCollapsed && "-rotate-90"
                                    )} />
                                </button>

                                {/* Stage Cards */}
                                {!isCollapsed && (
                                    <div className="divide-y divide-stone-100 bg-white">
                                        {stage.items.map(p => {
                                            const opp = (Array.isArray(p.opportunity) ? p.opportunity[0] : p.opportunity) as Pursuit["opportunity"];
                                            if (!opp) return null;
                                            const isExpanded = expandedCards.has(p.id);
                                            const daysLeft = opp.response_deadline
                                                ? Math.ceil((new Date(opp.response_deadline).getTime() - Date.now()) / 86400000)
                                                : null;
                                            const priorityDef = PRIORITY_OPTIONS.find(pr => pr.value === p.priority) || PRIORITY_OPTIONS[1];
                                            const isSaving = savingNotes[p.id];
                                            const isSaved = notesSaved[p.id];

                                            return (
                                                <div key={p.id} className="px-5">
                                                    {/* Card summary row */}
                                                    <div
                                                        className="flex items-center gap-4 py-4 cursor-pointer"
                                                        onClick={() => toggleCard(p.id)}
                                                    >
                                                        <ChevronRight className={clsx(
                                                            "w-4 h-4 text-stone-300 transition-transform flex-shrink-0",
                                                            isExpanded && "rotate-90"
                                                        )} />

                                                        {/* Priority badge */}
                                                        <span className={clsx(
                                                            "text-[9px] font-bold px-2 py-0.5 rounded border uppercase flex-shrink-0",
                                                            priorityDef.color
                                                        )}>
                                                            {priorityDef.label}
                                                        </span>

                                                        {/* Title + Agency */}
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm font-semibold text-stone-900 line-clamp-1">{opp.title}</p>
                                                            <p className="text-[11px] text-stone-500 truncate">{opp.agency}</p>
                                                        </div>

                                                        {/* Meta */}
                                                        <div className="flex items-center gap-3 flex-shrink-0">
                                                            {opp.estimated_value > 0 && (
                                                                <span className="text-xs font-semibold text-emerald-600">{fmtCurrency(opp.estimated_value)}</span>
                                                            )}
                                                            {daysLeft !== null && (
                                                                <span className={clsx(
                                                                    "text-xs font-semibold inline-flex items-center gap-1",
                                                                    daysLeft <= 0 ? "text-red-500" :
                                                                    daysLeft <= 7 ? "text-red-600" :
                                                                    daysLeft <= 30 ? "text-amber-600" : "text-stone-400"
                                                                )}>
                                                                    <Clock className="w-3 h-3" />
                                                                    {daysLeft <= 0 ? "Expired" : `${daysLeft}d`}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Expanded card detail */}
                                                    {isExpanded && (
                                                        <div className="pb-5 pl-8 space-y-4">
                                                            {/* Details grid */}
                                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-stone-50 rounded-xl">
                                                                {opp.naics_code && (
                                                                    <div>
                                                                        <p className="text-[10px] text-stone-400 uppercase font-semibold">NAICS</p>
                                                                        <p className="text-xs font-bold font-mono">{opp.naics_code}</p>
                                                                    </div>
                                                                )}
                                                                {opp.set_aside_code && (
                                                                    <div>
                                                                        <p className="text-[10px] text-stone-400 uppercase font-semibold">Set-Aside</p>
                                                                        <p className="text-xs font-bold">{opp.set_aside_code.substring(0, 30)}</p>
                                                                    </div>
                                                                )}
                                                                {opp.response_deadline && (
                                                                    <div>
                                                                        <p className="text-[10px] text-stone-400 uppercase font-semibold">Deadline</p>
                                                                        <p className="text-xs font-bold">{formatDate(opp.response_deadline)}</p>
                                                                    </div>
                                                                )}
                                                                {opp.estimated_value > 0 && (
                                                                    <div>
                                                                        <p className="text-[10px] text-stone-400 uppercase font-semibold">Value</p>
                                                                        <p className="text-xs font-bold text-emerald-600">{fmtCurrency(opp.estimated_value)}</p>
                                                                    </div>
                                                                )}
                                                                {opp.notice_type && (
                                                                    <div>
                                                                        <p className="text-[10px] text-stone-400 uppercase font-semibold">Notice Type</p>
                                                                        <p className="text-xs font-bold">{opp.notice_type}</p>
                                                                    </div>
                                                                )}
                                                                {p.stage_changed_at && (
                                                                    <div>
                                                                        <p className="text-[10px] text-stone-400 uppercase font-semibold">Stage Updated</p>
                                                                        <p className="text-xs font-bold">{formatDate(p.stage_changed_at)}</p>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Change Stage */}
                                                            <div>
                                                                <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-2">Move to Stage</p>
                                                                <div className="flex flex-wrap gap-1.5">
                                                                    {STAGES.map(s => (
                                                                        <button
                                                                            key={s.key}
                                                                            type="button"
                                                                            onClick={(e) => { e.stopPropagation(); changeStage(p.id, s.key); }}
                                                                            className={clsx(
                                                                                "text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-colors",
                                                                                p.stage === s.key
                                                                                    ? "bg-black text-white border-black"
                                                                                    : "bg-white text-stone-500 border-stone-200 hover:border-stone-400 hover:bg-stone-50"
                                                                            )}
                                                                        >
                                                                            {s.label}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>

                                                            {/* Priority */}
                                                            <div>
                                                                <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-2">Priority</p>
                                                                <div className="flex gap-1.5">
                                                                    {PRIORITY_OPTIONS.map(pr => (
                                                                        <button
                                                                            key={pr.value}
                                                                            type="button"
                                                                            onClick={(e) => { e.stopPropagation(); changePriority(p.id, pr.value); }}
                                                                            className={clsx(
                                                                                "text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-colors",
                                                                                p.priority === pr.value
                                                                                    ? "bg-black text-white border-black"
                                                                                    : "bg-white text-stone-500 border-stone-200 hover:border-stone-400 hover:bg-stone-50"
                                                                            )}
                                                                        >
                                                                            {pr.label}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>

                                                            {/* Notes */}
                                                            <div>
                                                                <div className="flex items-center justify-between mb-2">
                                                                    <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide">Notes</p>
                                                                    {isSaved && (
                                                                        <span className="text-[10px] font-semibold text-emerald-600 inline-flex items-center gap-1">
                                                                            <Save className="w-3 h-3" /> Saved
                                                                        </span>
                                                                    )}
                                                                    {p.notes && p.stage_changed_at && (
                                                                        <span className="text-[10px] text-stone-400">
                                                                            Last updated {formatDate(p.stage_changed_at)}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <textarea
                                                                    value={noteTexts[p.id] ?? ""}
                                                                    onChange={e => setNoteTexts(prev => ({ ...prev, [p.id]: e.target.value }))}
                                                                    onBlur={() => saveNotes(p.id)}
                                                                    onClick={e => e.stopPropagation()}
                                                                    placeholder="Add notes about this deal... (auto-saves on blur)"
                                                                    className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-xs h-24 resize-none focus:outline-none focus:border-black bg-white"
                                                                />
                                                                {isSaving && (
                                                                    <p className="text-[10px] text-stone-400 mt-1 inline-flex items-center gap-1">
                                                                        <Loader2 className="w-3 h-3 animate-spin" /> Saving...
                                                                    </p>
                                                                )}
                                                            </div>

                                                            {/* Send Feedback */}
                                                            <div>
                                                                {sendingFeedback === p.id ? (
                                                                    <div className="space-y-2 p-4 bg-orange-50 border border-orange-200 rounded-xl">
                                                                        <p className="text-[10px] font-semibold text-orange-600 uppercase tracking-wide inline-flex items-center gap-1">
                                                                            <MessageSquare className="w-3 h-3" /> Send Feedback to Team
                                                                        </p>
                                                                        <textarea
                                                                            value={feedbackText}
                                                                            onChange={e => setFeedbackText(e.target.value)}
                                                                            onClick={e => e.stopPropagation()}
                                                                            placeholder="Describe your feedback, questions, or concerns..."
                                                                            className="w-full border border-orange-200 rounded-lg px-3 py-2 text-xs h-20 resize-none focus:outline-none focus:border-orange-400 bg-white"
                                                                        />
                                                                        <div className="flex gap-2">
                                                                            <button
                                                                                type="button"
                                                                                onClick={(e) => { e.stopPropagation(); sendFeedback(p.id); }}
                                                                                disabled={!feedbackText.trim()}
                                                                                className="text-[10px] font-bold bg-orange-600 text-white px-3 py-1.5 rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 inline-flex items-center gap-1"
                                                                            >
                                                                                <MessageSquare className="w-3 h-3" /> Send Feedback
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={(e) => { e.stopPropagation(); setSendingFeedback(null); setFeedbackText(""); }}
                                                                                className="text-[10px] text-stone-500 hover:text-stone-700 px-2 py-1.5"
                                                                            >
                                                                                Cancel
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => { e.stopPropagation(); setSendingFeedback(p.id); }}
                                                                        className="text-xs font-semibold text-orange-600 hover:text-orange-800 bg-orange-50 hover:bg-orange-100 border border-orange-200 px-3.5 py-2 rounded-xl transition-colors inline-flex items-center gap-1.5"
                                                                    >
                                                                        <MessageSquare className="w-3.5 h-3.5" /> Send Feedback to Team
                                                                    </button>
                                                                )}
                                                            </div>

                                                            {/* Links */}
                                                            <div className="flex items-center gap-3 pt-2 border-t border-stone-100">
                                                                <Link
                                                                    href={`/portal/opportunities/${p.opportunity_id}`}
                                                                    onClick={e => e.stopPropagation()}
                                                                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
                                                                >
                                                                    View Details <ArrowRight className="w-3 h-3" />
                                                                </Link>
                                                                {opp.notice_id && (
                                                                    <a
                                                                        href={`https://sam.gov/opp/${opp.notice_id}/view`}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        onClick={e => e.stopPropagation()}
                                                                        className="text-xs font-semibold text-stone-500 hover:text-stone-700 inline-flex items-center gap-1"
                                                                    >
                                                                        <ExternalLink className="w-3 h-3" /> SAM.gov
                                                                    </a>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
