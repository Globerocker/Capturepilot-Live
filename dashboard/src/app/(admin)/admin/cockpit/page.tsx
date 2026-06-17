"use client";

/**
 * Sales Cockpit V2 — the daily driver for a NON-TECHNICAL sales partner.
 *
 * Full-height two-pane workspace:
 *   LEFT  (lg+): a filter panel + a scrollable prioritized lead queue (own scroll).
 *   RIGHT (lg+): the selected lead's detail, TABBED (own scroll):
 *       • Matches  — top-3 live contracts, the sharpest gap, the briefing.
 *       • Company  — contact + firmographics + ICP-fit breakdown.
 *       • Assets   — research, one-pager site, capability statement, check page.
 *       • Outreach — AI message generator + send-email composer + notes/transcript.
 *
 * On mobile the list shows first; tapping a lead slides the detail in as a
 * full-screen panel with a back button.
 *
 * Top action bar (always visible on the detail header):
 *   [Send to HubSpot] [Open their website ↗] [Send email]
 *
 * A phone number opens a CALL NOTES modal (CallButton + notes); saving it folds
 * the notes/transcript into the Outreach tab so they flow to HubSpot.
 *
 * Backed by:
 *   GET  /api/admin/cockpit/leads            — queue + single-lead detail
 *   POST /api/admin/cockpit/message          — AI lead-in (subject + body)
 *   POST /api/admin/cockpit/hubspot-push     — warm hand-off to HubSpot
 *   POST /api/admin/cockpit/enrich           — fill LinkedIn + firmographics
 *   POST /api/admin/cockpit/rerun            — re-queue match scoring
 *   POST /api/admin/cockpit/research         — reviews + web presence
 *   POST /api/admin/cockpit/website          — build a shareable one-pager
 *   POST /api/admin/cockpit/materialize-check — synthesize a /check page
 *   POST /api/ai/capability-statement-for-contractor — SSE cap statement
 *   GET/POST /api/admin/cockpit/sender       — cockpit email sender identity
 *   POST /api/admin/cockpit/send-email       — fire the email as the sender
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Target, Search, Loader2, Building2, Mail, Phone, Linkedin, Globe,
    AlertTriangle, Sparkles, Copy, Check, Send, ClipboardList, Video,
    ExternalLink, RefreshCw, User, Award, Users as UsersIcon, Trophy,
    ChevronRight, Filter, MapPin, FileText, Wand2, RotateCcw, Download, X,
    Star, MessageSquare, LayoutTemplate, Package, ArrowLeft, Settings,
    DollarSign, CalendarClock, BadgeCheck, Info, ChevronDown, SlidersHorizontal,
} from "lucide-react";
import clsx from "clsx";
import CallButton, { type SavedCallLog } from "@/components/CallButton";
import { buildCapabilityPdf, type CapSection, type CapMetadata } from "@/components/capability/pdfBuilder";

// ───────────────────────── shared shapes (mirror the leads API) ─────────────

interface IcpBreakdownItem {
    label: string;
    points: number;
    max: number;
    detail: string;
}

interface LeadTopMatch {
    title: string;
    agency: string | null;
    score_pct: number;
    pwin: number | null;
    deadline: string | null;
    naics: string | null;
    opp_id: string | null;
}

interface ResearchSource {
    url: string;
    title: string;
    source_type: string;
}

interface LeadResearch {
    overall_sentiment: "positive" | "mixed" | "negative" | "unknown";
    rating: number | null;
    reviews_count: number | null;
    summary: string;
    what_they_do: string;
    sources: ResearchSource[];
    researched_at: string | null;
}

interface Lead {
    id: string;
    source: "contractors" | "inbound";
    uei: string | null;
    company_name: string | null;
    website: string | null;
    state: string | null;
    employee_count: number | null;
    years_in_business: number | null;
    federal_awards_count: number | null;
    certifications: string[];
    sba_certifications: string[];
    contact: { name: string | null; email: string | null; title: string | null; phone: string | null };
    icp_score: number;
    icp_tier: "A" | "B" | "C";
    icp_breakdown: IcpBreakdownItem[];
    top_matches: LeadTopMatch[];
    best_match_pct: number | null;
    match_count: number;
    gaps: string[];
    gap_hook: string | null;
    loom_url: string | null;
    findings_summary: string | null;
    owner_linkedin: string | null;
    company_linkedin?: string | null;
    has_website: boolean;
    total_federal_revenue?: number | null;
    total_federal_awards?: number | null;
    sam_registered?: boolean | null;
    sam_expiration?: string | null;
    sam_expiring_soon?: boolean;
    known?: { linkedin: boolean; email: boolean; phone: boolean; website: boolean };
    readiness_score?: number | null;
    check_page_url?: string;
    check_analysis_id?: string | null;
    research?: LeadResearch | null;
    website_url?: string | null;
    created_at?: string | null;
}

type Tone = "warm_intro" | "short" | "call_heads_up";

const TONE_OPTIONS: { value: Tone; label: string; help: string }[] = [
    { value: "warm_intro", label: "Warm intro", help: "Friendly first email. Names the match, no hard ask." },
    { value: "short", label: "Very short", help: "Two or three sentences, ends on a soft question." },
    { value: "call_heads_up", label: "Ask for a call", help: "Suggests a quick 10-minute call this week." },
];

// ───────────────────────── small helpers ─────────────────────────

const TIER_STYLE: Record<Lead["icp_tier"], string> = {
    A: "bg-emerald-100 text-emerald-800 border-emerald-300",
    B: "bg-amber-100 text-amber-800 border-amber-300",
    C: "bg-stone-100 text-stone-600 border-stone-300",
};

const FIT_TOOLTIP =
    "Fit (A/B/C) = the founder's ICP: veteran-owned + 8(a)/HUBZone/WOSB + 1-50 staff + 1-5 prior federal awards. A = bullseye, C = deprioritize.";

/** Build the one-line "why" a partner reads at a glance on each queue row. */
function whyLine(l: Lead): string {
    const bits: string[] = [];
    const certHay = [...l.certifications, ...l.sba_certifications].join(" ").toLowerCase();
    if (/sdvosb|service.?disabled/.test(certHay)) bits.push("SDVOSB");
    else if (/\bvosb\b|veteran/.test(certHay)) bits.push("VOSB");
    if (/8\(a\)|\b8a\b/.test(certHay)) bits.push("8(a)");
    else if (/hubzone/.test(certHay)) bits.push("HUBZone");
    else if (/\bwosb\b|\bedwosb\b|women.?owned/.test(certHay)) bits.push("WOSB");

    const awards = l.federal_awards_count ?? 0;
    if (awards > 0) bits.push(`${awards} award${awards === 1 ? "" : "s"}`);

    if (l.match_count > 0) bits.push(`${l.match_count} live match${l.match_count === 1 ? "" : "es"}`);
    else bits.push("no live matches yet");

    return bits.join(" · ");
}

function formatDeadline(d: string | null): string {
    if (!d) return "";
    try {
        const dt = new Date(d);
        if (Number.isNaN(dt.getTime())) return d;
        return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch {
        return d;
    }
}

function normalizeWebsiteHref(site: string): string {
    return /^https?:\/\//i.test(site) ? site : `https://${site}`;
}

function compactCurrency(n: number | null | undefined): string | null {
    if (n == null || !Number.isFinite(n) || n <= 0) return null;
    try {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            notation: "compact",
            maximumFractionDigits: 1,
        }).format(n);
    } catch {
        return `$${Math.round(n).toLocaleString()}`;
    }
}

// ───────────────────────── filter state ─────────────────────────

interface Filters {
    q: string;
    state: string;
    tier: "" | "A" | "B" | "C";
    yearsMin: string;
    yearsMax: string;
    empMin: string;
    empMax: string;
    awardsMin: string;
    awardsMax: string;
    revenueMin: string;
    samRegistered: boolean;
    expiringSoon: boolean;
    hasLinkedin: boolean;
    hasEmail: boolean;
    hasPhone: boolean;
    hasWebsite: boolean;
    onlyWithMatches: boolean;
}

const EMPTY_FILTERS: Filters = {
    q: "", state: "", tier: "",
    yearsMin: "", yearsMax: "", empMin: "", empMax: "", awardsMin: "", awardsMax: "", revenueMin: "",
    samRegistered: false, expiringSoon: false,
    hasLinkedin: false, hasEmail: false, hasPhone: false, hasWebsite: false,
    onlyWithMatches: true,
};

// ───────────────────────── page ─────────────────────────

type TabKey = "matches" | "company" | "assets" | "outreach";

export default function CockpitPage() {
    // Queue state
    const [leads, setLeads] = useState<Lead[]>([]);
    const [total, setTotal] = useState(0);
    const [capped, setCapped] = useState(false);
    const [loadingQueue, setLoadingQueue] = useState(true);
    const [queueError, setQueueError] = useState<string | null>(null);

    // Filters
    const [source, setSource] = useState<"contractors" | "inbound">("contractors");
    const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
    const [filtersOpen, setFiltersOpen] = useState(false);

    // Selection + detail
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [detail, setDetail] = useState<Lead | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [detailError, setDetailError] = useState<string | null>(null);

    // Sender (email identity) modal
    const [senderOpen, setSenderOpen] = useState(false);
    const [senderConfigured, setSenderConfigured] = useState<boolean | null>(null);

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const setF = useCallback(<K extends keyof Filters>(k: K, v: Filters[K]) => {
        setFilters(prev => ({ ...prev, [k]: v }));
    }, []);

    // ── Queue fetch ───────────────────────────────────────────────────────────
    const fetchQueue = useCallback(async () => {
        setLoadingQueue(true);
        setQueueError(null);
        const params = new URLSearchParams();
        params.set("source", source);
        params.set("sort", "icp");
        params.set("pageSize", "150");
        if (filters.q.trim()) params.set("q", filters.q.trim());
        if (filters.state.trim()) params.set("state", filters.state.trim().toUpperCase());
        if (filters.tier) params.set("tier", filters.tier);

        // Rich filters only apply to contractors. Harmless for inbound otherwise.
        if (source === "contractors") {
            params.set("only_with_matches", filters.onlyWithMatches ? "true" : "false");
            if (filters.yearsMin) params.set("years_min", filters.yearsMin);
            if (filters.yearsMax) params.set("years_max", filters.yearsMax);
            if (filters.empMin) params.set("emp_min", filters.empMin);
            if (filters.empMax) params.set("emp_max", filters.empMax);
            if (filters.awardsMin) params.set("awards_min", filters.awardsMin);
            if (filters.awardsMax) params.set("awards_max", filters.awardsMax);
            if (filters.revenueMin) params.set("revenue_min", filters.revenueMin);
            if (filters.samRegistered) params.set("sam_registered", "1");
            if (filters.expiringSoon) params.set("expiring_soon", "1");
            if (filters.hasLinkedin) params.set("has_linkedin", "1");
            if (filters.hasEmail) params.set("has_email", "1");
            if (filters.hasPhone) params.set("has_phone", "1");
            if (filters.hasWebsite) params.set("has_website", "1");
        }
        try {
            const res = await fetch(`/api/admin/cockpit/leads?${params}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
            setLeads(data.leads || []);
            setTotal(data.total || 0);
            setCapped(!!data.capped);
        } catch (e) {
            setLeads([]);
            setTotal(0);
            setCapped(false);
            setQueueError(e instanceof Error ? e.message : "Could not load leads");
        } finally {
            setLoadingQueue(false);
        }
    }, [source, filters]);

    // Debounce filter changes so typing doesn't thrash the API.
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => { fetchQueue(); }, 300);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [fetchQueue]);

    // Probe the sender once so the header badge + email composer know whether
    // a real from_email is set.
    useEffect(() => {
        let alive = true;
        fetch("/api/admin/cockpit/sender")
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (alive && d) setSenderConfigured(!!d.configured); })
            .catch(() => { /* non-fatal */ });
        return () => { alive = false; };
    }, [senderOpen]);

    // ── Detail fetch ────────────────────────────────────────────────────────
    const fetchDetail = useCallback(async (id: string, leadSource: "contractors" | "inbound") => {
        setDetailError(null);
        setLoadingDetail(true);
        try {
            const params = new URLSearchParams({ id, source: leadSource });
            const res = await fetch(`/api/admin/cockpit/leads?${params}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
            if (data.lead) setDetail(data.lead);
        } catch (e) {
            setDetailError(e instanceof Error ? e.message : "Could not load full details");
        } finally {
            setLoadingDetail(false);
        }
    }, []);

    const selectLead = useCallback(async (lead: Lead) => {
        setSelectedId(lead.id);
        setDetail(lead);
        await fetchDetail(lead.id, lead.source);
    }, [fetchDetail]);

    const switchSource = (s: "contractors" | "inbound") => {
        setSource(s);
        setSelectedId(null);
        setDetail(null);
    };

    const clearFilters = () =>
        setFilters(prev => ({ ...EMPTY_FILTERS, onlyWithMatches: prev.onlyWithMatches }));

    const activeFilterCount = useMemo(() => {
        let n = 0;
        if (filters.state) n++;
        if (filters.tier) n++;
        if (filters.yearsMin || filters.yearsMax) n++;
        if (filters.empMin || filters.empMax) n++;
        if (filters.awardsMin || filters.awardsMax) n++;
        if (filters.revenueMin) n++;
        if (filters.samRegistered) n++;
        if (filters.expiringSoon) n++;
        if (filters.hasLinkedin) n++;
        if (filters.hasEmail) n++;
        if (filters.hasPhone) n++;
        if (filters.hasWebsite) n++;
        return n;
    }, [filters]);

    return (
        <div className="h-screen flex flex-col bg-stone-50 overflow-hidden">
            {/* Header */}
            <header className="bg-white border-b border-stone-200 px-4 sm:px-6 py-3 shrink-0">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                        <h1 className="font-bold text-lg sm:text-xl flex items-center gap-2">
                            <Target className="w-5 h-5 text-orange-600 shrink-0" /> Sales Cockpit
                        </h1>
                        <p className="hidden sm:block text-sm text-stone-500 mt-0.5">
                            Pick a company on the left, then work the tabs on the right.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setSenderOpen(true)}
                            className={clsx(
                                "inline-flex items-center gap-2 border font-bold px-3 py-2 rounded-lg text-sm",
                                senderConfigured === false
                                    ? "bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100"
                                    : "bg-white border-stone-200 text-stone-700 hover:bg-stone-100",
                            )}
                            title="Configure the email sender identity"
                        >
                            <Settings className="w-4 h-4" />
                            <span className="hidden sm:inline">Email sender</span>
                            {senderConfigured === false && (
                                <span className="w-2 h-2 rounded-full bg-amber-500" aria-hidden />
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={() => fetchQueue()}
                            className="bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 font-bold px-3 py-2 rounded-lg inline-flex items-center gap-2 text-sm"
                        >
                            <RefreshCw className={clsx("w-4 h-4", loadingQueue && "animate-spin")} />
                            <span className="hidden sm:inline">Refresh</span>
                        </button>
                    </div>
                </div>
            </header>

            {/* Body: two-pane on lg+, single pane (list ⇄ detail) on mobile */}
            <div className="flex-1 min-h-0 flex">
                {/* ───────── LEFT: lead queue ───────── */}
                <aside
                    className={clsx(
                        "flex flex-col min-h-0 bg-white border-r border-stone-200",
                        "w-full lg:w-[400px] xl:w-[420px] shrink-0",
                        // On mobile, hide the list once a lead is selected.
                        detail ? "hidden lg:flex" : "flex",
                    )}
                >
                    <QueueFilters
                        source={source}
                        onSwitchSource={switchSource}
                        filters={filters}
                        setF={setF}
                        filtersOpen={filtersOpen}
                        setFiltersOpen={setFiltersOpen}
                        activeFilterCount={activeFilterCount}
                        total={total}
                        onClear={clearFilters}
                    />

                    {capped && (
                        <div className="mx-3 mt-2 bg-amber-50 border border-amber-200 rounded-xl p-2.5 flex items-start gap-2 text-xs text-amber-800 shrink-0">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>More leads than we loaded. Narrow by state or search to see the rest.</span>
                        </div>
                    )}

                    {/* Queue list (own scroll) */}
                    <div className="flex-1 min-h-0 overflow-y-auto">
                        {loadingQueue ? (
                            <div className="py-16 text-center">
                                <Loader2 className="w-6 h-6 animate-spin text-stone-400 mx-auto" />
                                <p className="text-sm text-stone-400 mt-2">Loading your list…</p>
                            </div>
                        ) : queueError ? (
                            <div className="py-12 px-4 text-center">
                                <AlertTriangle className="w-6 h-6 text-rose-400 mx-auto" />
                                <p className="text-sm text-rose-600 mt-2 font-medium">{queueError}</p>
                                <button type="button" onClick={() => fetchQueue()} className="mt-3 text-xs underline text-stone-500 hover:text-black">
                                    Try again
                                </button>
                            </div>
                        ) : leads.length === 0 ? (
                            <div className="py-16 px-4 text-center text-stone-400">
                                <Building2 className="w-7 h-7 mx-auto mb-2 text-stone-300" />
                                <p className="text-sm">No leads match these filters.</p>
                                <button type="button" onClick={clearFilters} className="mt-2 text-xs underline text-stone-500 hover:text-black">
                                    Clear filters
                                </button>
                            </div>
                        ) : (
                            <ul className="divide-y divide-stone-100">
                                {leads.map(lead => (
                                    <LeadRow
                                        key={lead.id}
                                        lead={lead}
                                        selected={selectedId === lead.id}
                                        onClick={() => selectLead(lead)}
                                    />
                                ))}
                            </ul>
                        )}
                    </div>
                </aside>

                {/* ───────── RIGHT: per-lead detail ───────── */}
                <section
                    className={clsx(
                        "flex-1 min-w-0 min-h-0 flex flex-col",
                        // On mobile, show the detail only once a lead is picked.
                        detail ? "flex" : "hidden lg:flex",
                    )}
                >
                    {!detail ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center text-stone-400 px-6">
                            <Target className="w-12 h-12 text-stone-300 mb-3" />
                            <p className="font-medium text-stone-500">Pick a company on the left to get started.</p>
                            <p className="text-sm mt-1">Their matches, firmographics, assets, and outreach show up here.</p>
                        </div>
                    ) : (
                        <LeadDetail
                            key={detail.id}
                            lead={detail}
                            loading={loadingDetail}
                            detailError={detailError}
                            senderConfigured={senderConfigured}
                            onOpenSender={() => setSenderOpen(true)}
                            onRefresh={() => fetchDetail(detail.id, detail.source)}
                            onBack={() => { setSelectedId(null); setDetail(null); }}
                        />
                    )}
                </section>
            </div>

            {senderOpen && <SenderModal onClose={() => setSenderOpen(false)} />}
        </div>
    );
}

// ───────────────────────── LEFT: filters ─────────────────────────

function QueueFilters({
    source, onSwitchSource, filters, setF, filtersOpen, setFiltersOpen,
    activeFilterCount, total, onClear,
}: {
    source: "contractors" | "inbound";
    onSwitchSource: (s: "contractors" | "inbound") => void;
    filters: Filters;
    setF: <K extends keyof Filters>(k: K, v: Filters[K]) => void;
    filtersOpen: boolean;
    setFiltersOpen: (v: boolean) => void;
    activeFilterCount: number;
    total: number;
    onClear: () => void;
}) {
    const isContractors = source === "contractors";
    return (
        <div className="border-b border-stone-200 p-3 space-y-3 shrink-0">
            {/* Source toggle */}
            <div className="grid grid-cols-2 gap-1 bg-stone-100 rounded-xl p-1">
                <button
                    type="button"
                    onClick={() => onSwitchSource("contractors")}
                    className={clsx(
                        "px-3 py-1.5 rounded-lg text-sm font-bold transition-colors",
                        isContractors ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700",
                    )}
                >
                    Our DB
                </button>
                <button
                    type="button"
                    onClick={() => onSwitchSource("inbound")}
                    className={clsx(
                        "px-3 py-1.5 rounded-lg text-sm font-bold transition-colors",
                        !isContractors ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700",
                    )}
                >
                    Inbound
                </button>
            </div>

            {/* Search + state */}
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                    <input
                        type="text"
                        placeholder="Search company"
                        value={filters.q}
                        onChange={e => setF("q", e.target.value)}
                        className="w-full pl-9 pr-2 py-2 text-sm rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400"
                    />
                </div>
                <input
                    type="text"
                    placeholder="VA"
                    aria-label="State"
                    value={filters.state}
                    onChange={e => setF("state", e.target.value.toUpperCase().slice(0, 2))}
                    className="w-16 px-2 py-2 text-sm rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400 text-center"
                />
            </div>

            {/* Tier pills with tooltip */}
            <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase text-stone-400 tracking-wide inline-flex items-center gap-1" title={FIT_TOOLTIP}>
                    Fit <Info className="w-3 h-3" />
                </span>
                <div className="flex gap-1">
                    {(["", "A", "B", "C"] as const).map(t => (
                        <button
                            key={t || "any"}
                            type="button"
                            onClick={() => setF("tier", t)}
                            title={t ? `Tier ${t}` : "Any tier"}
                            className={clsx(
                                "px-2.5 py-1 rounded-lg text-xs font-bold border",
                                filters.tier === t
                                    ? "bg-orange-600 text-white border-orange-600"
                                    : "bg-white text-stone-600 border-stone-200 hover:border-stone-300",
                            )}
                        >
                            {t || "Any"}
                        </button>
                    ))}
                </div>
            </div>

            {/* Advanced filters disclosure (contractors only) */}
            {isContractors && (
                <div>
                    <button
                        type="button"
                        onClick={() => setFiltersOpen(!filtersOpen)}
                        className="w-full flex items-center justify-between text-sm font-bold text-stone-600 hover:text-stone-900"
                    >
                        <span className="inline-flex items-center gap-1.5">
                            <SlidersHorizontal className="w-4 h-4 text-stone-400" /> More filters
                            {activeFilterCount > 0 && (
                                <span className="text-[10px] font-bold bg-orange-100 text-orange-700 rounded-full px-1.5 py-0.5">
                                    {activeFilterCount}
                                </span>
                            )}
                        </span>
                        <ChevronDown className={clsx("w-4 h-4 transition-transform", filtersOpen && "rotate-180")} />
                    </button>

                    {filtersOpen && (
                        <div className="mt-3 space-y-3">
                            <RangeRow label="Years in business" minV={filters.yearsMin} maxV={filters.yearsMax}
                                onMin={v => setF("yearsMin", v)} onMax={v => setF("yearsMax", v)} />
                            <RangeRow label="Employees" minV={filters.empMin} maxV={filters.empMax}
                                onMin={v => setF("empMin", v)} onMax={v => setF("empMax", v)} />
                            <RangeRow label="Past awards" minV={filters.awardsMin} maxV={filters.awardsMax}
                                onMin={v => setF("awardsMin", v)} onMax={v => setF("awardsMax", v)} />
                            <div>
                                <FieldLabel>Min federal revenue ($)</FieldLabel>
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    placeholder="e.g. 100000"
                                    value={filters.revenueMin}
                                    onChange={e => setF("revenueMin", e.target.value)}
                                    className="w-full mt-1 px-2 py-1.5 text-sm rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-2 pt-1">
                                <CheckRow label="SAM registered" checked={filters.samRegistered} onChange={v => setF("samRegistered", v)} />
                                <CheckRow label="Reg. expiring soon" checked={filters.expiringSoon} onChange={v => setF("expiringSoon", v)} />
                                <CheckRow label="Has LinkedIn" checked={filters.hasLinkedin} onChange={v => setF("hasLinkedin", v)} />
                                <CheckRow label="Has email" checked={filters.hasEmail} onChange={v => setF("hasEmail", v)} />
                                <CheckRow label="Has phone" checked={filters.hasPhone} onChange={v => setF("hasPhone", v)} />
                                <CheckRow label="Has website" checked={filters.hasWebsite} onChange={v => setF("hasWebsite", v)} />
                            </div>

                            <CheckRow label="Has live matches only" checked={filters.onlyWithMatches} onChange={v => setF("onlyWithMatches", v)} />
                        </div>
                    )}
                </div>
            )}

            <div className="flex items-center justify-between text-xs text-stone-500 pt-0.5">
                <span>
                    <span className="font-bold text-stone-700">{total.toLocaleString()}</span> {total === 1 ? "lead" : "leads"}
                </span>
                {(activeFilterCount > 0 || filters.q || filters.tier) && (
                    <button type="button" onClick={onClear} className="hover:text-black underline">
                        Clear filters
                    </button>
                )}
            </div>
        </div>
    );
}

function RangeRow({ label, minV, maxV, onMin, onMax }: {
    label: string; minV: string; maxV: string;
    onMin: (v: string) => void; onMax: (v: string) => void;
}) {
    return (
        <div>
            <FieldLabel>{label}</FieldLabel>
            <div className="mt-1 flex items-center gap-2">
                <input
                    type="number" inputMode="numeric" placeholder="Min" aria-label={`${label} min`}
                    value={minV} onChange={e => onMin(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400"
                />
                <span className="text-stone-300">–</span>
                <input
                    type="number" inputMode="numeric" placeholder="Max" aria-label={`${label} max`}
                    value={maxV} onChange={e => onMax(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400"
                />
            </div>
        </div>
    );
}

function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <label className="flex items-center gap-2 text-xs text-stone-700 cursor-pointer">
            <input type="checkbox" checked={checked} onChange={() => onChange(!checked)} className="rounded border-stone-300" />
            {label}
        </label>
    );
}

// ───────────────────────── LEFT: a single lead row ─────────────────────────

function LeadRow({ lead, selected, onClick }: { lead: Lead; selected: boolean; onClick: () => void }) {
    return (
        <li>
            <button
                type="button"
                onClick={onClick}
                className={clsx(
                    "w-full text-left px-3 py-3 hover:bg-stone-50 transition-colors flex items-start gap-3",
                    selected && "bg-orange-50/70 hover:bg-orange-50",
                )}
            >
                <div
                    className={clsx(
                        "shrink-0 w-10 h-10 rounded-xl border flex flex-col items-center justify-center font-black leading-none",
                        TIER_STYLE[lead.icp_tier],
                    )}
                    title={`ICP fit ${lead.icp_score}/100`}
                >
                    <span className="text-sm">{lead.icp_tier}</span>
                    <span className="text-[9px] font-bold opacity-70">{lead.icp_score}</span>
                </div>

                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="font-bold text-stone-800 truncate">{lead.company_name || "Unnamed company"}</span>
                        {lead.best_match_pct != null && (
                            <span className="shrink-0 text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5">
                                {lead.best_match_pct}%
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-stone-500 mt-0.5 truncate">{whyLine(lead)}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                        {lead.state && <span className="text-[10px] text-stone-400">{lead.state}</span>}
                        <PresenceDots lead={lead} />
                    </div>
                </div>
                <ChevronRight className={clsx("w-4 h-4 shrink-0 mt-3", selected ? "text-orange-500" : "text-stone-300")} />
            </button>
        </li>
    );
}

function PresenceDots({ lead }: { lead: Lead }) {
    const known = lead.known ?? {
        linkedin: !!(lead.owner_linkedin || lead.company_linkedin),
        email: !!lead.contact.email,
        phone: !!lead.contact.phone,
        website: !!lead.website,
    };
    const dots: { on: boolean; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
        { on: known.email, label: "Email", Icon: Mail },
        { on: known.phone, label: "Phone", Icon: Phone },
        { on: known.linkedin, label: "LinkedIn", Icon: Linkedin },
        { on: known.website, label: "Website", Icon: Globe },
    ];
    return (
        <span className="inline-flex items-center gap-1">
            {dots.map(({ on, label, Icon }) => (
                <span key={label} title={`${label}: ${on ? "known" : "missing"}`}>
                    <Icon className={clsx("w-3 h-3", on ? "text-emerald-500" : "text-stone-300")} />
                </span>
            ))}
        </span>
    );
}

// ───────────────────────── RIGHT: detail (tabbed) ─────────────────────────

function LeadDetail({
    lead, loading, detailError, senderConfigured, onOpenSender, onRefresh, onBack,
}: {
    lead: Lead;
    loading: boolean;
    detailError: string | null;
    senderConfigured: boolean | null;
    onOpenSender: () => void;
    onRefresh: () => void;
    onBack: () => void;
}) {
    const [tab, setTab] = useState<TabKey>("matches");

    // Shared outreach scratch — notes + transcript live here so the Call modal,
    // the HubSpot hand-off, and the email composer can all read/write them.
    const [notes, setNotes] = useState("");
    const [transcript, setTranscript] = useState("");

    // Call notes modal.
    const [callOpen, setCallOpen] = useState(false);

    // Email composer is prefilled by the AI message generator; keep it lifted so
    // the Outreach tab's two halves share one draft.
    const [emailSubject, setEmailSubject] = useState("");
    const [emailBody, setEmailBody] = useState("");

    const onCallSaved = useCallback((log: SavedCallLog) => {
        if (log.notes) setNotes(prev => (prev ? `${prev}\n\n${log.notes}` : log.notes));
        if (log.transcription) setTranscript(prev => (prev ? `${prev}\n\n${log.transcription}` : log.transcription));
    }, []);

    const TABS: { key: TabKey; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
        { key: "matches", label: "Matches", Icon: Trophy },
        { key: "company", label: "Company", Icon: User },
        { key: "assets", label: "Assets", Icon: Package },
        { key: "outreach", label: "Outreach", Icon: Sparkles },
    ];

    return (
        <div className="flex flex-col min-h-0 h-full">
            {/* Sticky header + action bar */}
            <div className="bg-white border-b border-stone-200 shrink-0">
                <div className="px-4 sm:px-6 pt-3 sm:pt-4 pb-3">
                    {/* Mobile back */}
                    <button
                        type="button"
                        onClick={onBack}
                        className="lg:hidden mb-2 inline-flex items-center gap-1.5 text-sm font-bold text-stone-500 hover:text-stone-900"
                    >
                        <ArrowLeft className="w-4 h-4" /> Back to list
                    </button>

                    <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <h2 className="font-bold text-xl sm:text-2xl text-stone-900 truncate">
                                    {lead.company_name || "Unnamed company"}
                                </h2>
                                {loading && <Loader2 className="w-4 h-4 animate-spin text-stone-300 shrink-0" />}
                            </div>
                            <div className="text-sm text-stone-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                                <span className={clsx("inline-flex items-center gap-1 font-bold border rounded-full px-2 py-0.5 text-xs", TIER_STYLE[lead.icp_tier])} title={FIT_TOOLTIP}>
                                    Fit {lead.icp_tier} · {lead.icp_score}
                                </span>
                                {lead.state && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {lead.state}</span>}
                                {lead.source === "inbound"
                                    ? <span className="inline-flex items-center gap-1 text-emerald-700 font-medium"><Sparkles className="w-3.5 h-3.5" /> Came to us</span>
                                    : <span className="inline-flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> SAM.gov firm</span>}
                            </div>
                        </div>
                    </div>

                    {/* Top action bar */}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <HubspotButton lead={lead} notes={notes} transcript={transcript} />
                        {lead.website ? (
                            <a
                                href={normalizeWebsiteHref(lead.website)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-bold px-3.5 py-2 rounded-lg text-sm"
                                title="Open their site to record a Loom walkthrough"
                            >
                                <Globe className="w-4 h-4" /> Open their website <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                        ) : (
                            <span className="inline-flex items-center gap-2 bg-stone-100 text-stone-400 font-bold px-3.5 py-2 rounded-lg text-sm cursor-not-allowed" title="No website on file">
                                <Globe className="w-4 h-4" /> No website on file
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={() => { setTab("outreach"); }}
                            className="inline-flex items-center gap-2 bg-stone-900 hover:bg-black text-white font-bold px-3.5 py-2 rounded-lg text-sm"
                        >
                            <Mail className="w-4 h-4" /> Send email
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="px-2 sm:px-4 flex gap-1 overflow-x-auto">
                    {TABS.map(({ key, label, Icon }) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setTab(key)}
                            className={clsx(
                                "px-3 sm:px-4 py-2.5 text-sm font-bold border-b-2 -mb-px inline-flex items-center gap-1.5 whitespace-nowrap transition-colors",
                                tab === key
                                    ? "border-orange-600 text-stone-900"
                                    : "border-transparent text-stone-400 hover:text-stone-700",
                            )}
                        >
                            <Icon className="w-4 h-4" /> {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tab body (own scroll) */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-5">
                <div className="max-w-4xl mx-auto">
                    {detailError && (
                        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2 text-xs text-amber-800">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>Showing what we have. Full details didn&apos;t reload: {detailError}</span>
                        </div>
                    )}

                    {tab === "matches" && <MatchesTab lead={lead} />}
                    {tab === "company" && (
                        <CompanyTab
                            lead={lead}
                            loading={loading}
                            onRefresh={onRefresh}
                            onOpenCall={() => setCallOpen(true)}
                        />
                    )}
                    {tab === "assets" && <AssetsTab lead={lead} onRefresh={onRefresh} />}
                    {tab === "outreach" && (
                        <OutreachTab
                            lead={lead}
                            senderConfigured={senderConfigured}
                            onOpenSender={onOpenSender}
                            notes={notes}
                            setNotes={setNotes}
                            transcript={transcript}
                            setTranscript={setTranscript}
                            onOpenCall={() => setCallOpen(true)}
                            emailSubject={emailSubject}
                            setEmailSubject={setEmailSubject}
                            emailBody={emailBody}
                            setEmailBody={setEmailBody}
                        />
                    )}
                </div>
            </div>

            {callOpen && (
                <CallNotesModal
                    lead={lead}
                    onClose={() => setCallOpen(false)}
                    onSaved={(log) => { onCallSaved(log); setCallOpen(false); }}
                />
            )}
        </div>
    );
}

// ───────────────────────── TAB: Matches ─────────────────────────

function MatchesTab({ lead }: { lead: Lead }) {
    return (
        <div className="space-y-5">
            {lead.gap_hook && (
                <Card>
                    <div className="flex items-start gap-3">
                        <span className="shrink-0 w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center">
                            <Sparkles className="w-5 h-5 text-amber-600" />
                        </span>
                        <div>
                            <FieldLabel>Your opener — the sharpest thing they&apos;re missing</FieldLabel>
                            <p className="text-base text-stone-800 mt-1 leading-relaxed">{lead.gap_hook}</p>
                        </div>
                    </div>
                </Card>
            )}

            <Card>
                <SectionHeading icon={Trophy} title="Live opportunities that fit them now" />
                {lead.top_matches.length > 0 ? (
                    <ul className="space-y-3">
                        {lead.top_matches.map((m, i) => (
                            <li key={i} className="border border-stone-200 rounded-xl p-4 hover:border-stone-300 transition-colors">
                                <div className="flex items-start justify-between gap-3">
                                    <span className="font-bold text-stone-800">{m.title}</span>
                                    <span className="shrink-0 text-xs font-black bg-blue-50 text-blue-700 border border-blue-200 rounded-lg px-2 py-1">
                                        {m.score_pct}% fit
                                    </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500 mt-2">
                                    {m.agency && <span className="inline-flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> {m.agency}</span>}
                                    {m.deadline && <span className="inline-flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" /> Due {formatDeadline(m.deadline)}</span>}
                                    {m.naics && <span>NAICS {m.naics}</span>}
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-stone-500">
                        No live matches captured yet. Lead the conversation with the website gap above instead.
                    </p>
                )}
            </Card>

            {lead.findings_summary && (
                <Card>
                    <SectionHeading icon={FileText} title="Quick briefing" />
                    <p className="text-sm text-stone-600 leading-relaxed">{lead.findings_summary}</p>
                </Card>
            )}
        </div>
    );
}

// ───────────────────────── TAB: Company ─────────────────────────

function CompanyTab({ lead, loading, onRefresh, onOpenCall }: {
    lead: Lead; loading: boolean; onRefresh: () => void; onOpenCall: () => void;
}) {
    const revenue = compactCurrency(lead.total_federal_revenue);
    return (
        <div className="space-y-5">
            <Card>
                <SectionHeading icon={User} title="Who you're talking to" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 text-sm">
                    <Field label="Contact" value={lead.contact.name || "Name not on file"} />
                    <Field label="Title" value={lead.contact.title || "—"} />
                    <div>
                        <FieldLabel>Email</FieldLabel>
                        {lead.contact.email ? (
                            <a href={`mailto:${lead.contact.email}`} className="text-blue-700 hover:underline inline-flex items-center gap-1.5 break-all mt-0.5">
                                <Mail className="w-3.5 h-3.5 shrink-0" /> {lead.contact.email}
                            </a>
                        ) : (
                            <span className="text-rose-600 inline-flex items-center gap-1.5 mt-0.5">
                                <AlertTriangle className="w-3.5 h-3.5" /> No email on file
                            </span>
                        )}
                    </div>
                    <div>
                        <FieldLabel>Phone</FieldLabel>
                        {lead.contact.phone ? (
                            <button
                                type="button"
                                onClick={onOpenCall}
                                className="text-blue-700 hover:underline inline-flex items-center gap-1.5 mt-0.5"
                                title="Open call notes"
                            >
                                <Phone className="w-3.5 h-3.5" /> {lead.contact.phone}
                            </button>
                        ) : (
                            <span className="text-stone-400 mt-0.5 block">—</span>
                        )}
                    </div>
                    <div>
                        <FieldLabel>Website</FieldLabel>
                        {lead.website ? (
                            <a href={normalizeWebsiteHref(lead.website)} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline inline-flex items-center gap-1.5 break-all mt-0.5">
                                <Globe className="w-3.5 h-3.5 shrink-0" /> {lead.website} <ExternalLink className="w-3 h-3" />
                            </a>
                        ) : (
                            <span className="text-amber-700 inline-flex items-center gap-1.5 mt-0.5">
                                <AlertTriangle className="w-3.5 h-3.5" /> No website found
                            </span>
                        )}
                    </div>
                    <div>
                        <FieldLabel>LinkedIn</FieldLabel>
                        {lead.owner_linkedin ? (
                            <a href={lead.owner_linkedin} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline inline-flex items-center gap-1.5 mt-0.5">
                                <Linkedin className="w-3.5 h-3.5" /> Owner profile <ExternalLink className="w-3 h-3" />
                            </a>
                        ) : (
                            <span className="text-stone-400 mt-0.5 block">—</span>
                        )}
                    </div>
                </div>

                {/* Certs */}
                {(lead.sba_certifications.length > 0 || lead.certifications.length > 0) && (
                    <div className="flex flex-wrap gap-2 mt-5">
                        {[...lead.sba_certifications, ...lead.certifications].slice(0, 6).map((c, i) => (
                            <Pill key={`${c}-${i}`} icon={Award}>{c}</Pill>
                        ))}
                    </div>
                )}
            </Card>

            {/* Firmographics */}
            <Card>
                <SectionHeading icon={Building2} title="Firmographics" />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <Stat icon={UsersIcon} label="Employees" value={lead.employee_count != null && lead.employee_count > 0 ? String(lead.employee_count) : "Unknown"} />
                    <Stat icon={Building2} label="Years in business" value={lead.years_in_business != null && lead.years_in_business > 0 ? String(lead.years_in_business) : "Unknown"} />
                    <Stat icon={Trophy} label="Federal awards" value={lead.total_federal_awards != null ? String(lead.total_federal_awards) : (lead.federal_awards_count != null ? String(lead.federal_awards_count) : "Unknown")} />
                    <Stat icon={DollarSign} label="Federal revenue" value={revenue || "Unknown"} />
                    <Stat
                        icon={BadgeCheck}
                        label="SAM registered"
                        value={lead.sam_registered == null ? "Unknown" : lead.sam_registered ? "Yes" : "No"}
                        tone={lead.sam_registered ? "good" : undefined}
                    />
                    <Stat
                        icon={CalendarClock}
                        label="SAM expires"
                        value={lead.sam_expiration ? formatDeadline(lead.sam_expiration) : "Unknown"}
                        tone={lead.sam_expiring_soon ? "warn" : undefined}
                    />
                </div>
                {lead.sam_expiring_soon && (
                    <p className="mt-3 text-xs text-amber-700 inline-flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" /> Their SAM registration expires within 90 days — a natural reason to reach out.
                    </p>
                )}
            </Card>

            {/* ICP-fit breakdown */}
            <Card>
                <SectionHeading icon={Target} title="Why they're a fit (each factor)" />
                <div className="space-y-3">
                    {lead.icp_breakdown.map((b, i) => {
                        const pct = b.max > 0 ? Math.round((b.points / b.max) * 100) : 0;
                        return (
                            <div key={i}>
                                <div className="flex items-center justify-between gap-2">
                                    <span className="font-medium text-stone-700 text-sm">{b.label}</span>
                                    <span className="text-xs font-bold text-stone-500">{b.points}/{b.max}</span>
                                </div>
                                <div className="h-2 rounded-full bg-stone-100 overflow-hidden mt-1">
                                    <div
                                        className={clsx("h-full rounded-full", pct >= 70 ? "bg-emerald-500" : pct >= 35 ? "bg-amber-500" : "bg-stone-300")}
                                        style={{ width: `${pct}%` }}
                                    />
                                </div>
                                <p className="text-xs text-stone-500 mt-1">{b.detail}</p>
                            </div>
                        );
                    })}
                </div>
            </Card>

            {/* Enrich + re-run — contractors only */}
            {lead.source === "contractors" && (
                <Card>
                    <SectionHeading icon={Wand2} title="Fill the gaps / refresh" />
                    <div className="space-y-5">
                        <EnrichControls lead={lead} onRefresh={onRefresh} refreshing={loading} />
                        <div className="border-t border-stone-100 pt-5">
                            <RerunControl lead={lead} />
                        </div>
                    </div>
                </Card>
            )}
        </div>
    );
}

// ── "Enrich now" ──────────────────────────────────────────────────────────────
function EnrichControls({ lead, onRefresh, refreshing }: { lead: Lead; onRefresh: () => void; refreshing: boolean }) {
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

    const enrich = async () => {
        setBusy(true);
        setResult(null);
        try {
            const res = await fetch("/api/admin/cockpit/enrich", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contractor_id: lead.id }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.ok) throw new Error(data?.error || `Failed (${res.status})`);
            const u = (data.updated || {}) as { employee_count?: number; years_in_business?: number; owner_linkedin?: string };
            const found: string[] = [];
            if (u.owner_linkedin) found.push("owner LinkedIn");
            if (u.employee_count != null) found.push(`${u.employee_count} employees`);
            if (u.years_in_business != null) found.push(`${u.years_in_business} yrs in business`);
            setResult({ ok: true, message: found.length ? `Found ${found.join(", ")}.` : "Checked — nothing new to add (already complete)." });
            onRefresh();
        } catch (e) {
            setResult({ ok: false, message: e instanceof Error ? e.message : "Enrichment failed" });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div>
            <button
                type="button"
                onClick={enrich}
                disabled={busy}
                className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-lg text-sm"
            >
                {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Enriching…</> : <><Wand2 className="w-4 h-4" /> Enrich now (LinkedIn + firmographics)</>}
            </button>
            <p className="text-xs text-stone-500 mt-1.5">
                Looks up the owner&apos;s LinkedIn and fills in employees / years in business when we can find them.
            </p>
            {result && (
                <div className={clsx("mt-2 rounded-lg px-3 py-2 text-xs flex items-start gap-2", result.ok ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-rose-50 border border-rose-200 text-rose-700")}>
                    {result.ok ? (refreshing ? <Loader2 className="w-3.5 h-3.5 shrink-0 mt-0.5 animate-spin" /> : <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" />) : <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                    <span className="font-medium">{result.message}</span>
                </div>
            )}
        </div>
    );
}

// ── "Re-run match" ─────────────────────────────────────────────────────────────
function RerunControl({ lead }: { lead: Lead }) {
    const [busy, setBusy] = useState(false);
    const [full, setFull] = useState(false);
    const [toast, setToast] = useState<{ ok: boolean; message: string } | null>(null);

    const rerun = async () => {
        setBusy(true);
        setToast(null);
        try {
            const res = await fetch("/api/admin/cockpit/rerun", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contractor_id: lead.id, full }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.ok) throw new Error(data?.error || `Failed (${res.status})`);
            setToast({
                ok: true,
                message: data.requeued === "full"
                    ? "Queued a full re-crawl + re-score. Refresh in a few minutes."
                    : "Queued a fresh match re-score. Refresh in a few minutes.",
            });
        } catch (e) {
            setToast({ ok: false, message: e instanceof Error ? e.message : "Re-run failed" });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div>
            <FieldLabel>Out of date?</FieldLabel>
            <div className="mt-2 flex flex-wrap items-center gap-3">
                <button
                    type="button"
                    onClick={rerun}
                    disabled={busy}
                    className="inline-flex items-center gap-2 bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 font-bold px-4 py-2 rounded-lg text-sm disabled:opacity-50"
                >
                    {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Queueing…</> : <><RotateCcw className="w-4 h-4" /> Re-run match</>}
                </button>
                <label className="inline-flex items-center gap-1.5 text-xs text-stone-600 cursor-pointer">
                    <input type="checkbox" checked={full} onChange={() => setFull(v => !v)} className="rounded border-stone-300" />
                    Full re-crawl (slower)
                </label>
            </div>
            {toast && (
                <div className={clsx("mt-2 rounded-lg px-3 py-2 text-xs flex items-start gap-2", toast.ok ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-rose-50 border border-rose-200 text-rose-700")}>
                    {toast.ok ? <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                    <span className="font-medium">{toast.message}</span>
                </div>
            )}
        </div>
    );
}

// ───────────────────────── TAB: Assets ─────────────────────────

function AssetsTab({ lead, onRefresh }: { lead: Lead; onRefresh: () => void }) {
    const isContractor = lead.source === "contractors";
    return (
        <div className="space-y-5">
            {isContractor && <ResearchAction lead={lead} onRefresh={onRefresh} highlight={lead.has_website === false} />}
            {isContractor && <WebsiteAction lead={lead} onRefresh={onRefresh} highlight={lead.has_website === false} />}
            {isContractor && <CapStatementCard lead={lead} />}
            {isContractor && <MaterializeCheckCard lead={lead} />}
            {lead.source === "inbound" && lead.check_page_url && <CheckPageCard url={lead.check_page_url} />}
            {!isContractor && (
                <Card>
                    <p className="text-sm text-stone-500">
                        Asset generation (research, one-pager, capability statement) is available for firms in our database.
                        This is an inbound website lead — use the Matches and Outreach tabs.
                    </p>
                </Card>
            )}
        </div>
    );
}

// ── Cap statement (SSE) ─────────────────────────────────────────────────────────
interface CapStatementSection {
    key?: string;
    title: string;
    content: string;
    status: "pending" | "running" | "done";
    word_count?: number;
}

function CapStatementCard({ lead }: { lead: Lead }) {
    const [open, setOpen] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sections, setSections] = useState<CapStatementSection[]>([]);
    const [metadata, setMetadata] = useState<CapMetadata | null>(null);
    const [copiedAll, setCopiedAll] = useState(false);
    const [downloading, setDownloading] = useState(false);

    const generate = async () => {
        setGenerating(true);
        setError(null);
        setSections([]);
        setMetadata(null);
        try {
            const res = await fetch("/api/ai/capability-statement-for-contractor", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contractor_id: lead.id }),
            });
            if (!res.ok || !res.body) throw new Error(res.statusText || `Failed (${res.status})`);

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                let idx: number;
                while ((idx = buffer.indexOf("\n\n")) !== -1) {
                    const rawEvt = buffer.slice(0, idx);
                    buffer = buffer.slice(idx + 2);
                    const lines = rawEvt.split("\n");
                    let event = "message";
                    let data = "";
                    for (const line of lines) {
                        if (line.startsWith("event:")) event = line.slice(6).trim();
                        else if (line.startsWith("data:")) data += line.slice(5).trim();
                    }
                    if (!data) continue;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    let payload: any;
                    try { payload = JSON.parse(data); } catch { continue; }

                    if (event === "meta") {
                        setMetadata(payload.metadata as CapMetadata);
                        const total = Number(payload.sections_total) || 0;
                        setSections(Array.from({ length: total }).map((_, i) => ({
                            title: "", content: "", status: i === 0 ? "running" : "pending",
                        })));
                    } else if (event === "section_start") {
                        setSections(prev => {
                            const next = [...prev];
                            next[payload.index] = { ...(next[payload.index] || { content: "" }), title: payload.title, key: payload.key, status: "running" };
                            return next;
                        });
                    } else if (event === "section_done") {
                        setSections(prev => {
                            const next = [...prev];
                            next[payload.index] = { title: payload.title, key: payload.key, content: payload.content || "", word_count: payload.word_count, status: "done" };
                            return next;
                        });
                    } else if (event === "error") {
                        setError(payload.message || "Generation error");
                    }
                }
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not draft the capability statement");
        } finally {
            setGenerating(false);
        }
    };

    const doneSections = sections.filter(s => s.status === "done" && s.content);

    const allText = () =>
        [
            metadata?.company_name ? `${metadata.company_name} — Capability Statement\n` : "",
            ...doneSections.map(s => `${s.title}\n${"-".repeat(s.title.length)}\n${s.content}`),
        ].filter(Boolean).join("\n\n");

    const copyAll = async () => {
        try {
            await navigator.clipboard.writeText(allText());
            setCopiedAll(true);
            setTimeout(() => setCopiedAll(false), 1800);
        } catch { /* clipboard may be blocked */ }
    };

    const downloadPdf = async () => {
        if (!metadata || doneSections.length === 0) return;
        setDownloading(true);
        try {
            const cleanSections: CapSection[] = doneSections.map(s => ({ title: s.title, content: s.content, key: s.key }));
            const blob = await buildCapabilityPdf(cleanSections, metadata);
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${(metadata.company_name || "capability-statement").replace(/[^a-z0-9]+/gi, "-")}-capability-statement.pdf`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            setError("PDF build failed: " + (e instanceof Error ? e.message : "unknown"));
        } finally {
            setDownloading(false);
        }
    };

    return (
        <Card>
            <SectionHeading icon={FileText} title="Draft a capability statement" />
            <p className="text-sm text-stone-600 mb-3">
                Generate a polished, federal-ready capability statement for this firm — hand it to them during outreach.
            </p>
            <button
                type="button"
                onClick={() => { setOpen(true); generate(); }}
                disabled={generating}
                className="inline-flex items-center gap-2 bg-stone-900 hover:bg-black disabled:opacity-50 text-white font-bold px-4 py-2.5 rounded-lg text-sm"
            >
                {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Drafting…</> : <><FileText className="w-4 h-4" /> {doneSections.length > 0 ? "Re-draft statement" : "Draft capability statement"}</>}
            </button>

            {error && (
                <p className="mt-3 text-sm text-rose-600 inline-flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> {error}</p>
            )}

            {open && (sections.length > 0 || generating) && (
                <div className="mt-4 border border-stone-200 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between gap-2 bg-stone-50 border-b border-stone-200 px-4 py-2.5">
                        <span className="text-sm font-bold text-stone-700">{metadata?.company_name || lead.company_name || "Capability statement"}</span>
                        <div className="flex items-center gap-3">
                            <button type="button" onClick={copyAll} disabled={doneSections.length === 0} className="text-xs text-stone-500 hover:text-black inline-flex items-center gap-1 disabled:opacity-40">
                                {copiedAll ? <><Check className="w-3.5 h-3.5 text-emerald-600" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy all</>}
                            </button>
                            <button type="button" onClick={downloadPdf} disabled={doneSections.length === 0 || downloading} className="text-xs text-stone-500 hover:text-black inline-flex items-center gap-1 disabled:opacity-40">
                                {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} PDF
                            </button>
                            <button type="button" onClick={() => setOpen(false)} title="Hide" aria-label="Hide capability statement" className="text-stone-400 hover:text-black">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                    <div className="max-h-[28rem] overflow-y-auto divide-y divide-stone-100">
                        {sections.map((s, i) => (
                            <div key={i} className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold uppercase text-stone-400 tracking-wide">{s.title || `Section ${i + 1}`}</span>
                                    {s.status === "running" && <Loader2 className="w-3 h-3 animate-spin text-stone-300" />}
                                    {s.status === "done" && s.word_count != null && <span className="text-[10px] text-stone-300">{s.word_count} words</span>}
                                </div>
                                {s.content
                                    ? <p className="text-sm text-stone-700 mt-1 whitespace-pre-wrap leading-relaxed">{s.content}</p>
                                    : s.status !== "pending"
                                        ? <p className="text-xs text-stone-400 mt-1">Writing…</p>
                                        : <p className="text-xs text-stone-300 mt-1">Waiting…</p>}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </Card>
    );
}

// ── Research (reviews + web presence) ─────────────────────────────────────────
function sentimentStyle(s: LeadResearch["overall_sentiment"]): { label: string; cls: string } {
    switch (s) {
        case "positive": return { label: "Positive", cls: "bg-emerald-100 text-emerald-800 border-emerald-300" };
        case "mixed": return { label: "Mixed", cls: "bg-amber-100 text-amber-800 border-amber-300" };
        case "negative": return { label: "Negative", cls: "bg-rose-100 text-rose-800 border-rose-300" };
        default: return { label: "No clear signal", cls: "bg-stone-100 text-stone-600 border-stone-300" };
    }
}

function Stars({ rating }: { rating: number }) {
    const full = Math.round(rating);
    return (
        <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex">
                {[0, 1, 2, 3, 4].map(i => (
                    <Star key={i} className={clsx("w-4 h-4", i < full ? "fill-amber-400 text-amber-400" : "text-stone-300")} />
                ))}
            </span>
            <span className="text-sm font-bold text-stone-800">{rating.toFixed(1)}/5</span>
        </span>
    );
}

function ResearchResultPanel({ research }: { research: LeadResearch }) {
    const sent = sentimentStyle(research.overall_sentiment);
    return (
        <div className="mt-3 border border-stone-200 rounded-xl p-4 bg-stone-50/60">
            <div className="flex flex-wrap items-center gap-3">
                {research.rating != null ? <Stars rating={research.rating} /> : <span className="text-sm text-stone-500">No star rating found</span>}
                {research.reviews_count != null && (
                    <span className="text-xs text-stone-500">{research.reviews_count.toLocaleString()} review{research.reviews_count === 1 ? "" : "s"}</span>
                )}
                <span className={clsx("text-[11px] font-bold border rounded-full px-2 py-0.5", sent.cls)}>{sent.label}</span>
            </div>
            {research.what_they_do && (
                <p className="text-sm text-stone-700 mt-3"><span className="font-medium">What they do:</span> {research.what_they_do}</p>
            )}
            {research.summary && <p className="text-sm text-stone-600 mt-2 leading-relaxed">{research.summary}</p>}
            {research.sources.length > 0 && (
                <div className="mt-3">
                    <FieldLabel>Where this came from</FieldLabel>
                    <ul className="mt-1.5 space-y-1">
                        {research.sources.slice(0, 6).map((s, i) => (
                            <li key={i}>
                                <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline inline-flex items-center gap-1.5 text-sm break-all">
                                    <ExternalLink className="w-3 h-3 shrink-0" />
                                    <span className="truncate max-w-[28rem]">{s.title || s.url}</span>
                                    <span className="text-[10px] text-stone-400 shrink-0">· {s.source_type}</span>
                                </a>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

function ResearchAction({ lead, onRefresh, highlight }: { lead: Lead; onRefresh: () => void; highlight: boolean }) {
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [research, setResearch] = useState<LeadResearch | null>(lead.research ?? null);

    useEffect(() => {
        setResearch(lead.research ?? null);
        setErr(null);
    }, [lead.id, lead.research]);

    const run = async () => {
        setBusy(true);
        setErr(null);
        try {
            const res = await fetch("/api/admin/cockpit/research", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contractor_id: lead.id }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.ok) throw new Error(data?.error || `Failed (${res.status})`);
            setResearch({
                overall_sentiment: data.sentiment ?? "unknown",
                rating: data.rating ?? null,
                reviews_count: data.reviews_count ?? null,
                summary: data.summary ?? "",
                what_they_do: data.what_they_do ?? "",
                sources: Array.isArray(data.sources) ? data.sources : [],
                researched_at: new Date().toISOString(),
            });
            onRefresh();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Research failed");
        } finally {
            setBusy(false);
        }
    };

    return (
        <Card className={highlight ? "ring-2 ring-orange-200" : undefined}>
            <div className="flex items-center gap-2">
                <MessageSquare className={clsx("w-4 h-4", highlight ? "text-orange-600" : "text-stone-400")} />
                <h3 className="font-bold text-stone-900">Research (reviews + web presence)</h3>
                {highlight && <span className="text-[10px] font-bold bg-orange-600 text-white rounded-full px-2 py-0.5">Lead with this</span>}
            </div>
            <p className="text-sm text-stone-500 mt-1">
                Pulls their public reviews, rating, and what people say — so you can open with &ldquo;I looked you up.&rdquo;
            </p>
            <button
                type="button"
                onClick={run}
                disabled={busy}
                className="mt-3 inline-flex items-center gap-2 bg-stone-900 hover:bg-black disabled:opacity-50 text-white font-bold px-4 py-2 rounded-lg text-sm"
            >
                {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Researching…</> : <><Search className="w-4 h-4" /> {research ? "Re-run research" : "Research this firm"}</>}
            </button>
            {err && <p className="mt-2 text-xs text-rose-600 inline-flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> {err}</p>}
            {research && <ResearchResultPanel research={research} />}
        </Card>
    );
}

// ── Build one-pager website ───────────────────────────────────────────────────
function WebsiteAction({ lead, onRefresh, highlight }: { lead: Lead; onRefresh: () => void; highlight: boolean }) {
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [url, setUrl] = useState<string | null>(lead.website_url ?? null);

    useEffect(() => {
        setUrl(lead.website_url ?? null);
        setErr(null);
        setCopied(false);
    }, [lead.id, lead.website_url]);

    const build = async () => {
        setBusy(true);
        setErr(null);
        try {
            const res = await fetch("/api/admin/cockpit/website", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contractor_id: lead.id }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.ok || !data.url) throw new Error(data?.error || `Failed (${res.status})`);
            setUrl(data.url as string);
            onRefresh();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Could not build the site");
        } finally {
            setBusy(false);
        }
    };

    const absoluteUrl = url ? (typeof window !== "undefined" ? `${window.location.origin}${url}` : url) : "";
    const copy = async () => {
        if (!absoluteUrl) return;
        try {
            await navigator.clipboard.writeText(absoluteUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch { /* clipboard may be blocked */ }
    };

    return (
        <Card className={highlight ? "ring-2 ring-orange-200" : undefined}>
            <div className="flex items-center gap-2">
                <LayoutTemplate className={clsx("w-4 h-4", highlight ? "text-orange-600" : "text-stone-400")} />
                <h3 className="font-bold text-stone-900">Build one-pager website</h3>
                {highlight && <span className="text-[10px] font-bold bg-orange-600 text-white rounded-full px-2 py-0.5">Great opener</span>}
            </div>
            <p className="text-sm text-stone-500 mt-1">
                Generates a clean, shareable site from what we know. Takes about a minute or two.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={build}
                    disabled={busy}
                    className="inline-flex items-center gap-2 bg-stone-900 hover:bg-black disabled:opacity-50 text-white font-bold px-4 py-2 rounded-lg text-sm"
                >
                    {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Building… (~1-2 min)</> : url ? <><RefreshCw className="w-4 h-4" /> Rebuild site</> : <><LayoutTemplate className="w-4 h-4" /> Build one-pager website</>}
                </button>
                {url && !busy && (
                    <>
                        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 font-bold px-4 py-2 rounded-lg text-sm">
                            <ExternalLink className="w-4 h-4" /> Open
                        </a>
                        <button type="button" onClick={copy} className="inline-flex items-center gap-2 bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 font-bold px-4 py-2 rounded-lg text-sm">
                            {copied ? <><Check className="w-4 h-4 text-emerald-600" /> Copied</> : <><Copy className="w-4 h-4" /> Copy link</>}
                        </button>
                    </>
                )}
            </div>
            {err && <p className="mt-2 text-xs text-rose-600 inline-flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> {err}</p>}
            {url && (
                <p className="mt-2 text-xs text-stone-600 bg-stone-100 rounded-lg px-3 py-2">
                    Paste this to them: &ldquo;Here&apos;s what your site could look like — built it for you.&rdquo;
                </p>
            )}
        </Card>
    );
}

// ── Materialize a shareable check page (contractors) ────────────────────────────
function MaterializeCheckCard({ lead }: { lead: Lead }) {
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [url, setUrl] = useState<string | null>(lead.check_analysis_id ? `/check/${lead.check_analysis_id}` : null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        setUrl(lead.check_analysis_id ? `/check/${lead.check_analysis_id}` : null);
        setErr(null);
        setCopied(false);
    }, [lead.id, lead.check_analysis_id]);

    const generate = async () => {
        setBusy(true);
        setErr(null);
        try {
            const res = await fetch("/api/admin/cockpit/materialize-check", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contractor_id: lead.id }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok || !body?.check_url) throw new Error(body?.error || `Failed (${res.status})`);
            setUrl(body.check_url as string);
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Could not build the page");
        } finally {
            setBusy(false);
        }
    };

    const absoluteUrl = url ? (typeof window !== "undefined" ? `${window.location.origin}${url}` : url) : "";
    const copy = async () => {
        if (!absoluteUrl) return;
        try {
            await navigator.clipboard.writeText(absoluteUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch { /* ignore */ }
    };

    return (
        <Card>
            <SectionHeading icon={FileText} title="Their results page" />
            <p className="text-sm text-stone-600 mb-3">
                This firm never ran our website checker. Build the same shareable results page from what we know — then send them the link.
            </p>
            {err && <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800 mb-3">{err}</div>}
            <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={generate} disabled={busy} className="inline-flex items-center gap-2 bg-stone-900 hover:bg-black text-white font-bold px-4 py-2 rounded-lg text-sm disabled:opacity-50">
                    {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Building…</> : url ? <><RefreshCw className="w-4 h-4" /> Rebuild page</> : <><Sparkles className="w-4 h-4" /> Build check page</>}
                </button>
                {url && (
                    <>
                        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 font-bold px-4 py-2 rounded-lg text-sm">
                            <ExternalLink className="w-4 h-4" /> Open page
                        </a>
                        <button type="button" onClick={copy} className="inline-flex items-center gap-2 bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 font-bold px-4 py-2 rounded-lg text-sm">
                            {copied ? <><Check className="w-4 h-4 text-emerald-600" /> Copied</> : <><Copy className="w-4 h-4" /> Copy link</>}
                        </button>
                    </>
                )}
            </div>
        </Card>
    );
}

// ── Check page (inbound) ────────────────────────────────────────────────────────
function CheckPageCard({ url }: { url: string }) {
    return (
        <Card>
            <SectionHeading icon={FileText} title="Their results page" />
            <p className="text-sm text-stone-600 mb-3">
                This lead ran our website checker. Open the exact page they saw so you can talk to it directly.
            </p>
            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 font-bold px-4 py-2 rounded-lg text-sm">
                <ExternalLink className="w-4 h-4" /> Open check page
            </a>
        </Card>
    );
}

// ───────────────────────── TAB: Outreach ─────────────────────────

function OutreachTab({
    lead, senderConfigured, onOpenSender,
    notes, setNotes, transcript, setTranscript, onOpenCall,
    emailSubject, setEmailSubject, emailBody, setEmailBody,
}: {
    lead: Lead;
    senderConfigured: boolean | null;
    onOpenSender: () => void;
    notes: string;
    setNotes: React.Dispatch<React.SetStateAction<string>>;
    transcript: string;
    setTranscript: React.Dispatch<React.SetStateAction<string>>;
    onOpenCall: () => void;
    emailSubject: string;
    setEmailSubject: (v: string) => void;
    emailBody: string;
    setEmailBody: (v: string) => void;
}) {
    return (
        <div className="space-y-5">
            <MessageGenerator lead={lead} onUseInComposer={(s, b) => { setEmailSubject(s); setEmailBody(b); }} />
            <EmailComposer
                lead={lead}
                senderConfigured={senderConfigured}
                onOpenSender={onOpenSender}
                subject={emailSubject}
                setSubject={setEmailSubject}
                body={emailBody}
                setBody={setEmailBody}
            />
            <NotesCard
                lead={lead}
                notes={notes}
                setNotes={setNotes}
                transcript={transcript}
                setTranscript={setTranscript}
                onOpenCall={onOpenCall}
            />
        </div>
    );
}

// ── AI message generator ──────────────────────────────────────────────────────
function MessageGenerator({ lead, onUseInComposer }: { lead: Lead; onUseInComposer: (subject: string, body: string) => void }) {
    const [tone, setTone] = useState<Tone>("warm_intro");
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [subject, setSubject] = useState("");
    const [bodyText, setBodyText] = useState("");
    const [generated, setGenerated] = useState(false);
    const [copied, setCopied] = useState<"subject" | "body" | "both" | null>(null);
    const [used, setUsed] = useState(false);

    const generate = async () => {
        setGenerating(true);
        setError(null);
        setUsed(false);
        try {
            const payload: Record<string, string> = { tone };
            if (lead.source === "inbound") payload.analysis_id = lead.id;
            else payload.contractor_id = lead.id;
            const res = await fetch("/api/admin/cockpit/message", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok || !data.ok) throw new Error(data?.error || `Request failed (${res.status})`);
            setSubject(data.subject || "");
            setBodyText(data.body || "");
            setGenerated(true);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not write the message");
        } finally {
            setGenerating(false);
        }
    };

    const copy = async (which: "subject" | "body" | "both") => {
        const text = which === "subject" ? subject : which === "body" ? bodyText : `Subject: ${subject}\n\n${bodyText}`;
        try {
            await navigator.clipboard.writeText(text);
            setCopied(which);
            setTimeout(() => setCopied(null), 1500);
        } catch { /* clipboard may be blocked */ }
    };

    return (
        <Card>
            <SectionHeading icon={Sparkles} title="Write a personalized message" />
            <div>
                <FieldLabel>Pick the style</FieldLabel>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                    {TONE_OPTIONS.map(t => (
                        <button
                            key={t.value}
                            type="button"
                            onClick={() => setTone(t.value)}
                            className={clsx("text-left rounded-xl border p-3 transition-colors", tone === t.value ? "border-orange-400 bg-orange-50" : "border-stone-200 hover:border-stone-300")}
                        >
                            <div className={clsx("text-sm font-bold", tone === t.value ? "text-orange-700" : "text-stone-700")}>{t.label}</div>
                            <div className="text-[11px] text-stone-500 mt-0.5 leading-snug">{t.help}</div>
                        </button>
                    ))}
                </div>
            </div>

            <button
                type="button"
                onClick={generate}
                disabled={generating}
                className="mt-4 inline-flex items-center gap-2 bg-stone-900 hover:bg-black disabled:opacity-50 text-white font-bold px-4 py-2.5 rounded-lg text-sm"
            >
                {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Writing…</> : <><Sparkles className="w-4 h-4" /> {generated ? "Rewrite message" : "Generate message"}</>}
            </button>

            {error && <p className="mt-3 text-sm text-rose-600 inline-flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> {error}</p>}

            {generated && (
                <div className="mt-4 space-y-3">
                    <div>
                        <div className="flex items-center justify-between">
                            <FieldLabel>Subject</FieldLabel>
                            <button type="button" onClick={() => copy("subject")} className="text-xs text-stone-500 hover:text-black inline-flex items-center gap-1">
                                {copied === "subject" ? <><Check className="w-3 h-3 text-emerald-600" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                            </button>
                        </div>
                        <input
                            type="text" value={subject} onChange={e => setSubject(e.target.value)}
                            aria-label="Generated subject" placeholder="Subject"
                            className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400 font-medium"
                        />
                    </div>
                    <div>
                        <div className="flex items-center justify-between">
                            <FieldLabel>Message</FieldLabel>
                            <button type="button" onClick={() => copy("body")} className="text-xs text-stone-500 hover:text-black inline-flex items-center gap-1">
                                {copied === "body" ? <><Check className="w-3 h-3 text-emerald-600" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                            </button>
                        </div>
                        <textarea
                            value={bodyText} onChange={e => setBodyText(e.target.value)} rows={10}
                            aria-label="Generated message body" placeholder="Message body"
                            className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400 leading-relaxed"
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => { onUseInComposer(subject, bodyText); setUsed(true); setTimeout(() => setUsed(false), 2000); }}
                            className="inline-flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white font-bold px-3 py-2 rounded-lg text-sm"
                        >
                            {used ? <><Check className="w-4 h-4" /> Loaded into composer</> : <><ChevronDown className="w-4 h-4" /> Use in email composer</>}
                        </button>
                        <button type="button" onClick={() => copy("both")} className="inline-flex items-center gap-2 bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 font-bold px-3 py-2 rounded-lg text-sm">
                            {copied === "both" ? <><Check className="w-4 h-4 text-emerald-600" /> Copied subject + message</> : <><Copy className="w-4 h-4" /> Copy subject + message</>}
                        </button>
                    </div>
                </div>
            )}
        </Card>
    );
}

// ── Email composer (sends as the configured cockpit sender) ─────────────────────
function EmailComposer({
    lead, senderConfigured, onOpenSender, subject, setSubject, body, setBody,
}: {
    lead: Lead;
    senderConfigured: boolean | null;
    onOpenSender: () => void;
    subject: string;
    setSubject: (v: string) => void;
    body: string;
    setBody: (v: string) => void;
}) {
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

    const canSend = !!lead.contact.email && !!subject.trim() && !!body.trim() && senderConfigured !== false;

    const send = async () => {
        if (!lead.contact.email) {
            setResult({ ok: false, message: "No email on file for this lead." });
            return;
        }
        setSending(true);
        setResult(null);
        try {
            const payload: Record<string, unknown> = {
                to_email: lead.contact.email,
                subject: subject.trim(),
                body,
                lead_company: lead.company_name || undefined,
            };
            if (lead.source === "inbound") payload.analysis_id = lead.id;
            else payload.contractor_id = lead.id;

            const res = await fetch("/api/admin/cockpit/send-email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.ok) throw new Error(data?.error || `Failed (${res.status})`);
            setResult({ ok: true, message: `Sent to ${lead.contact.email}.` });
        } catch (e) {
            setResult({ ok: false, message: e instanceof Error ? e.message : "Send failed" });
        } finally {
            setSending(false);
        }
    };

    return (
        <Card>
            <SectionHeading icon={Mail} title="Send the email" />

            {senderConfigured === false && (
                <div className="mb-3 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2 text-xs text-amber-800">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                        No sender email is configured yet, so sending is disabled.{" "}
                        <button type="button" onClick={onOpenSender} className="underline font-bold">Set the sender</button> first.
                    </span>
                </div>
            )}

            <div className="space-y-3">
                <div>
                    <FieldLabel>To</FieldLabel>
                    {lead.contact.email ? (
                        <div className="mt-1 px-3 py-2 text-sm rounded-lg border border-stone-200 bg-stone-50 text-stone-700">{lead.contact.email}</div>
                    ) : (
                        <div className="mt-1 px-3 py-2 text-sm rounded-lg border border-rose-200 bg-rose-50 text-rose-700 inline-flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5" /> No email on file
                        </div>
                    )}
                </div>
                <div>
                    <FieldLabel>Subject</FieldLabel>
                    <input
                        type="text" value={subject} onChange={e => setSubject(e.target.value)}
                        aria-label="Email subject" placeholder="Generate a message above, or type a subject"
                        className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400 font-medium"
                    />
                </div>
                <div>
                    <FieldLabel>Message</FieldLabel>
                    <textarea
                        value={body} onChange={e => setBody(e.target.value)} rows={9}
                        aria-label="Email body" placeholder="Message body — a tasteful branded footer is added automatically on send."
                        className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400 leading-relaxed"
                    />
                </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                    type="button"
                    onClick={send}
                    disabled={sending || !canSend}
                    className="inline-flex items-center gap-2 bg-stone-900 hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-4 py-2.5 rounded-lg text-sm"
                >
                    {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : <><Send className="w-4 h-4" /> Send email</>}
                </button>
                <button type="button" onClick={onOpenSender} className="text-xs text-stone-500 hover:text-black underline inline-flex items-center gap-1">
                    <Settings className="w-3.5 h-3.5" /> Sender settings
                </button>
            </div>

            {result && (
                <div className={clsx("mt-3 rounded-xl p-3 text-sm flex items-start gap-2", result.ok ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-rose-50 border border-rose-200 text-rose-700")}>
                    {result.ok ? <Check className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
                    <span className="font-medium">{result.message}</span>
                </div>
            )}
        </Card>
    );
}

// ── Notes + transcript (+ HubSpot is in the top action bar) ─────────────────────
function NotesCard({
    lead, notes, setNotes, transcript, setTranscript, onOpenCall,
}: {
    lead: Lead;
    notes: string;
    setNotes: React.Dispatch<React.SetStateAction<string>>;
    transcript: string;
    setTranscript: React.Dispatch<React.SetStateAction<string>>;
    onOpenCall: () => void;
}) {
    return (
        <Card>
            <div className="flex items-center justify-between gap-2 mb-3">
                <SectionHeading icon={ClipboardList} title="Notes & call transcript" noMargin />
                {lead.contact.phone && (
                    <button
                        type="button"
                        onClick={onOpenCall}
                        className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs"
                    >
                        <Phone className="w-3.5 h-3.5" /> Log a call
                    </button>
                )}
            </div>
            <p className="text-xs text-stone-500 mb-3">
                These flow into HubSpot when you use the &ldquo;Send to HubSpot&rdquo; button at the top.
            </p>

            <FieldLabel>Notes (anything worth remembering)</FieldLabel>
            <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={4}
                placeholder="e.g. Left a voicemail. Owner is a Navy vet, sounded interested in the VA janitorial match."
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400 leading-relaxed"
            />
            <FieldLabel className="mt-4">Call transcript (optional)</FieldLabel>
            <textarea
                value={transcript}
                onChange={e => setTranscript(e.target.value)}
                rows={4}
                placeholder="Paste a call summary or transcript here if you spoke with them."
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400 leading-relaxed"
            />
        </Card>
    );
}

// ───────────────────────── Top action: HubSpot ─────────────────────────

function HubspotButton({ lead, notes, transcript }: { lead: Lead; notes: string; transcript: string }) {
    const [pushing, setPushing] = useState(false);
    const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

    const splitName = (full: string): { first?: string; last?: string } => {
        const t = full.trim();
        if (!t) return {};
        const parts = t.split(/\s+/);
        if (parts.length === 1) return { first: parts[0] };
        return { first: parts[0], last: parts.slice(1).join(" ") };
    };

    const push = async () => {
        if (!lead.contact.email) {
            setResult({ ok: false, message: "No email on file — can't add to HubSpot." });
            setTimeout(() => setResult(null), 4000);
            return;
        }
        setPushing(true);
        setResult(null);
        try {
            const { first, last } = splitName(lead.contact.name || "");
            const payload: Record<string, unknown> = {
                email: lead.contact.email,
                company: lead.company_name || undefined,
                phone: lead.contact.phone || undefined,
                first_name: first,
                last_name: last,
                notes: notes.trim() || undefined,
                call_transcript: transcript.trim() || undefined,
            };
            if (lead.source === "inbound") payload.analysis_id = lead.id;
            else payload.contractor_id = lead.id;

            const res = await fetch("/api/admin/cockpit/hubspot-push", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (data.ok) {
                setResult({ ok: true, message: "In HubSpot — task on Sergio's phone." });
            } else {
                const reason = data?.steps?.contact?.error || data?.error || "Something went wrong.";
                setResult({ ok: false, message: reason });
            }
            setTimeout(() => setResult(null), 5000);
        } catch (e) {
            setResult({ ok: false, message: e instanceof Error ? e.message : "Could not reach HubSpot." });
            setTimeout(() => setResult(null), 5000);
        } finally {
            setPushing(false);
        }
    };

    return (
        <div className="relative">
            <button
                type="button"
                onClick={push}
                disabled={pushing || !lead.contact.email}
                title={!lead.contact.email ? "No email on file" : "Add the contact + notes to HubSpot"}
                className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-3.5 py-2 rounded-lg text-sm"
            >
                {pushing ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : <><Send className="w-4 h-4" /> Send to HubSpot</>}
            </button>
            {result && (
                <div
                    className={clsx(
                        "absolute left-0 top-full mt-2 z-10 w-72 rounded-xl p-3 text-xs flex items-start gap-2 shadow-lg border",
                        result.ok ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rose-50 border-rose-200 text-rose-700",
                    )}
                >
                    {result.ok ? <Check className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
                    <span className="font-medium">{result.message}</span>
                </div>
            )}
        </div>
    );
}

// ───────────────────────── Call notes modal ─────────────────────────

function CallNotesModal({ lead, onClose, onSaved }: { lead: Lead; onClose: () => void; onSaved: (log: SavedCallLog) => void }) {
    // Close on Escape.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40" />
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-stone-200 sticky top-0 bg-white">
                    <div className="min-w-0">
                        <h3 className="font-bold text-stone-900 flex items-center gap-2">
                            <Phone className="w-4 h-4 text-emerald-600" /> Call {lead.contact.name || lead.company_name || "lead"}
                        </h3>
                        {lead.contact.phone && <p className="text-xs text-stone-500 mt-0.5">{lead.contact.phone}</p>}
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close" className="text-stone-400 hover:text-black shrink-0">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-5">
                    <CallButton
                        contractorId={lead.source === "contractors" ? lead.id : undefined}
                        leadName={lead.contact.name || undefined}
                        leadPhone={lead.contact.phone || undefined}
                        onSaved={onSaved}
                    />
                    <p className="text-xs text-stone-500 mt-3">
                        When you save, the notes + transcript get folded into the Outreach tab so they flow to HubSpot.
                    </p>
                </div>
            </div>
        </div>
    );
}

// ───────────────────────── Sender settings modal ─────────────────────────

interface CockpitSender {
    from_email: string;
    from_name: string;
    reply_to: string;
    footer_html: string;
    physical_address: string;
}

function SenderModal({ onClose }: { onClose: () => void }) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const [configured, setConfigured] = useState<boolean | null>(null);
    const [sender, setSender] = useState<CockpitSender>({
        from_email: "", from_name: "", reply_to: "", footer_html: "", physical_address: "",
    });

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const res = await fetch("/api/admin/cockpit/sender");
                const data = await res.json();
                if (!res.ok) throw new Error(data?.error || `Failed (${res.status})`);
                if (!alive) return;
                const s = (data.sender || {}) as Partial<CockpitSender>;
                // Hide placeholder bracket values so the operator sees an empty field.
                const fromEmail = (s.from_email || "").includes("[") ? "" : (s.from_email || "");
                setSender({
                    from_email: fromEmail,
                    from_name: s.from_name || "",
                    reply_to: s.reply_to || "",
                    footer_html: s.footer_html || "",
                    physical_address: s.physical_address || "",
                });
                setConfigured(!!data.configured);
            } catch (e) {
                if (alive) setError(e instanceof Error ? e.message : "Could not load the sender");
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, []);

    const save = async () => {
        setSaving(true);
        setError(null);
        setSaved(false);
        try {
            const res = await fetch("/api/admin/cockpit/sender", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(sender),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || `Failed (${res.status})`);
            setConfigured(!!data.configured);
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save the sender");
        } finally {
            setSaving(false);
        }
    };

    const set = <K extends keyof CockpitSender>(k: K, v: CockpitSender[K]) => setSender(prev => ({ ...prev, [k]: v }));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40" />
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-stone-200 sticky top-0 bg-white">
                    <h3 className="font-bold text-stone-900 flex items-center gap-2">
                        <Settings className="w-4 h-4 text-stone-400" /> Email sender
                    </h3>
                    <button type="button" onClick={onClose} aria-label="Close" className="text-stone-400 hover:text-black">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-5">
                    <p className="text-sm text-stone-500 mb-4">
                        Cockpit emails go out from this identity (not the platform&apos;s noreply address). Sending stays disabled until a real <span className="font-medium text-stone-700">from email</span> is set.
                    </p>

                    {loading ? (
                        <div className="py-10 text-center">
                            <Loader2 className="w-6 h-6 animate-spin text-stone-400 mx-auto" />
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {configured === false && (
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 flex items-start gap-2">
                                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                    <span>No sender email set yet — add one below to enable sending.</span>
                                </div>
                            )}
                            <div>
                                <FieldLabel>From email (required)</FieldLabel>
                                <input
                                    type="email" value={sender.from_email} onChange={e => set("from_email", e.target.value)}
                                    placeholder="sergio@capturepilot.com"
                                    className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400"
                                />
                            </div>
                            <div>
                                <FieldLabel>From name</FieldLabel>
                                <input
                                    type="text" value={sender.from_name} onChange={e => set("from_name", e.target.value)}
                                    placeholder="Sergio · CapturePilot"
                                    className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400"
                                />
                            </div>
                            <div>
                                <FieldLabel>Reply-to (optional)</FieldLabel>
                                <input
                                    type="email" value={sender.reply_to} onChange={e => set("reply_to", e.target.value)}
                                    placeholder="defaults to the from email"
                                    className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400"
                                />
                            </div>
                            <div>
                                <FieldLabel>Physical mailing address (CAN-SPAM)</FieldLabel>
                                <input
                                    type="text" value={sender.physical_address} onChange={e => set("physical_address", e.target.value)}
                                    placeholder="CapturePilot, 1209 Orange Street, Wilmington, DE 19801"
                                    className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400"
                                />
                            </div>
                            <div>
                                <FieldLabel>Footer HTML (optional)</FieldLabel>
                                <textarea
                                    value={sender.footer_html} onChange={e => set("footer_html", e.target.value)} rows={3}
                                    placeholder="Optional extra HTML appended inside the email footer."
                                    className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400 font-mono"
                                />
                            </div>

                            {error && <p className="text-sm text-rose-600 inline-flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> {error}</p>}

                            <div className="flex items-center gap-3 pt-1">
                                <button
                                    type="button" onClick={save} disabled={saving}
                                    className="inline-flex items-center gap-2 bg-stone-900 hover:bg-black disabled:opacity-50 text-white font-bold px-4 py-2.5 rounded-lg text-sm"
                                >
                                    {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : saved ? <><Check className="w-4 h-4" /> Saved</> : <>Save sender</>}
                                </button>
                                <button type="button" onClick={onClose} className="text-sm text-stone-500 hover:text-black">Close</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ───────────────────────── tiny presentational helpers ─────────────────────────

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
    return <div className={clsx("bg-white border border-stone-200 rounded-2xl p-5", className)}>{children}</div>;
}

function SectionHeading({ icon: Icon, title, noMargin }: {
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    noMargin?: boolean;
}) {
    return (
        <h3 className={clsx("font-bold text-stone-900 flex items-center gap-2", !noMargin && "mb-4")}>
            <Icon className="w-4 h-4 text-stone-400" /> {title}
        </h3>
    );
}

function FieldLabel({ children, className }: { children: React.ReactNode; className?: string }) {
    return <div className={clsx("text-[10px] font-bold uppercase text-stone-400 tracking-wide", className)}>{children}</div>;
}

function Field({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <FieldLabel>{label}</FieldLabel>
            <div className="text-stone-800 mt-0.5">{value}</div>
        </div>
    );
}

function Stat({ icon: Icon, label, value, tone }: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: string;
    tone?: "good" | "warn";
}) {
    return (
        <div className="rounded-xl border border-stone-200 p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-stone-400 tracking-wide">
                <Icon className="w-3.5 h-3.5" /> {label}
            </div>
            <div className={clsx("mt-1 font-bold", tone === "good" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : "text-stone-900")}>
                {value}
            </div>
        </div>
    );
}

function Pill({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
    return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-stone-100 text-stone-700 rounded-lg px-2.5 py-1">
            <Icon className="w-3.5 h-3.5 text-stone-400" /> {children}
        </span>
    );
}
