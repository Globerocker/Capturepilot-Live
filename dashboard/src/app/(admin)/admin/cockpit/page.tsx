"use client";

/**
 * Sales Cockpit — the daily driver for a NON-TECHNICAL sales partner.
 *
 * LEFT: a prioritized lead queue, sorted by ICP-fit (the founder's "who do I
 * actually want to talk to" filter). Each row shows the company, an A/B/C tier
 * badge + score, the best live-match %, and a one-line "why".
 *
 * RIGHT (when a lead is selected): a per-lead card that reads top-to-bottom as a
 * numbered checklist a non-technical person can work through:
 *   1. WHO          — company, contact, links, ICP breakdown
 *   2. WHY THEM     — tier + live matches + the sharpest gap (the opener)
 *   3. LOOM ANGLE   — the gap + the matching Loom video, with a one-liner
 *   4. MESSAGE      — generate + edit an AI lead-in, copy it
 *   5. NOTES        — free notes + (optional) call transcript
 *   6. HAND-OFF     — push the contact + notes into HubSpot for Sergio
 *   7. CHECK PAGE   — (inbound leads only) link to their public result page
 *
 * Backed by:
 *   GET  /api/admin/cockpit/leads          — queue + single-lead detail
 *   POST /api/admin/cockpit/message         — AI lead-in (subject + body)
 *   POST /api/admin/cockpit/hubspot-push    — warm hand-off to HubSpot
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
    Target, Search, Loader2, Building2, Mail, Phone, Linkedin, Globe,
    AlertTriangle, Sparkles, Copy, Check, Send, ClipboardList, Video,
    ExternalLink, RefreshCw, User, Award, Users as UsersIcon, Trophy,
    ChevronRight, Filter, MapPin, FileText,
} from "lucide-react";
import clsx from "clsx";

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
    has_website: boolean;
    readiness_score?: number | null;
    check_page_url?: string;
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

/** Build the one-line "why" a partner reads at a glance on each queue row. */
function whyLine(l: Lead): string {
    const bits: string[] = [];
    // Lead with the strongest cert signal (veteran first).
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

// ───────────────────────── page ─────────────────────────

export default function CockpitPage() {
    // Queue state
    const [leads, setLeads] = useState<Lead[]>([]);
    const [total, setTotal] = useState(0);
    const [capped, setCapped] = useState(false);
    const [loadingQueue, setLoadingQueue] = useState(true);
    const [queueError, setQueueError] = useState<string | null>(null);

    // Filters
    const [source, setSource] = useState<"contractors" | "inbound">("contractors");
    const [q, setQ] = useState("");
    const [state, setState] = useState("");
    const [minIcp, setMinIcp] = useState(0);
    const [onlyWithMatches, setOnlyWithMatches] = useState(true);

    // Selection + detail
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [detail, setDetail] = useState<Lead | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [detailError, setDetailError] = useState<string | null>(null);

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Queue fetch ───────────────────────────────────────────────────────────
    const fetchQueue = useCallback(async () => {
        setLoadingQueue(true);
        setQueueError(null);
        const params = new URLSearchParams();
        params.set("source", source);
        if (q.trim()) params.set("q", q.trim());
        if (state.trim()) params.set("state", state.trim().toUpperCase());
        if (minIcp > 0) params.set("min_icp", String(minIcp));
        params.set("sort", "icp");
        params.set("pageSize", "100");
        // only_with_matches only applies to contractors; harmless for inbound.
        if (source === "contractors") {
            params.set("only_with_matches", onlyWithMatches ? "true" : "false");
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
    }, [source, q, state, minIcp, onlyWithMatches]);

    // Debounce filter changes so typing doesn't thrash the API.
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => { fetchQueue(); }, 300);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [fetchQueue]);

    // ── Detail fetch when a lead is selected ───────────────────────────────────
    const selectLead = useCallback(async (lead: Lead) => {
        setSelectedId(lead.id);
        // Show the queue row's data immediately while we re-fetch the full dossier.
        setDetail(lead);
        setDetailError(null);
        setLoadingDetail(true);
        try {
            const params = new URLSearchParams({ id: lead.id, source: lead.source });
            const res = await fetch(`/api/admin/cockpit/leads?${params}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
            if (data.lead) setDetail(data.lead);
        } catch (e) {
            // Keep the queue-row data on the screen; just note the refresh failed.
            setDetailError(e instanceof Error ? e.message : "Could not load full details");
        } finally {
            setLoadingDetail(false);
        }
    }, []);

    const clearFilters = () => {
        setQ("");
        setState("");
        setMinIcp(0);
        setOnlyWithMatches(true);
    };

    return (
        <div className="min-h-screen bg-stone-50">
            {/* Header */}
            <header className="bg-white border-b border-stone-200 px-4 sm:px-6 py-4">
                <div className="max-w-[1600px] mx-auto flex items-center justify-between flex-wrap gap-3">
                    <div>
                        <h1 className="font-bold text-xl flex items-center gap-2">
                            <Target className="w-5 h-5 text-orange-600" /> Sales Cockpit
                        </h1>
                        <p className="text-sm text-stone-500 mt-0.5">
                            Work the list top to bottom. Pick a company on the left, then follow the numbered steps on the right.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => fetchQueue()}
                        className="bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 font-bold px-3 py-2 rounded-lg inline-flex items-center gap-2 text-sm"
                    >
                        <RefreshCw className={clsx("w-4 h-4", loadingQueue && "animate-spin")} /> Refresh
                    </button>
                </div>
            </header>

            <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6">
                {/* ───────── LEFT: lead queue ───────── */}
                <section className="space-y-3 min-w-0">
                    {/* Filters */}
                    <div className="bg-white border border-stone-200 rounded-2xl p-4 space-y-4">
                        {/* Source toggle */}
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => { setSource("contractors"); setSelectedId(null); setDetail(null); }}
                                className={clsx(
                                    "px-3 py-2 rounded-lg text-sm font-bold border",
                                    source === "contractors"
                                        ? "bg-orange-600 text-white border-orange-600"
                                        : "bg-white text-stone-600 border-stone-200 hover:border-stone-300",
                                )}
                            >
                                Our DB
                            </button>
                            <button
                                type="button"
                                onClick={() => { setSource("inbound"); setSelectedId(null); setDetail(null); }}
                                className={clsx(
                                    "px-3 py-2 rounded-lg text-sm font-bold border",
                                    source === "inbound"
                                        ? "bg-orange-600 text-white border-orange-600"
                                        : "bg-white text-stone-600 border-stone-200 hover:border-stone-300",
                                )}
                            >
                                Inbound (website)
                            </button>
                        </div>

                        {/* Search */}
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                            <input
                                type="text"
                                placeholder="Search company name"
                                value={q}
                                onChange={e => setQ(e.target.value)}
                                className="w-full pl-9 pr-2 py-2 text-sm rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            {/* State */}
                            <div>
                                <label className="text-[10px] font-bold uppercase text-stone-500 tracking-wide flex items-center gap-1">
                                    <MapPin className="w-3 h-3" /> State
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. VA"
                                    value={state}
                                    onChange={e => setState(e.target.value.toUpperCase().slice(0, 2))}
                                    className="w-full mt-1 px-2 py-2 text-sm rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400"
                                />
                            </div>
                            {/* Min ICP */}
                            <div>
                                <label className="text-[10px] font-bold uppercase text-stone-500 tracking-wide flex items-center gap-1">
                                    <Filter className="w-3 h-3" /> Min fit
                                </label>
                                <select
                                    value={minIcp}
                                    onChange={e => setMinIcp(Number(e.target.value))}
                                    title="Minimum ICP fit"
                                    aria-label="Minimum ICP fit"
                                    className="w-full mt-1 px-2 py-2 text-sm rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400 bg-white"
                                >
                                    <option value={0}>Any</option>
                                    <option value={70}>A only (70+)</option>
                                    <option value={45}>A &amp; B (45+)</option>
                                </select>
                            </div>
                        </div>

                        {source === "contractors" && (
                            <label className="flex items-center justify-between gap-2 text-sm text-stone-700 cursor-pointer">
                                <span className="flex items-center gap-1.5 font-medium">
                                    <Trophy className="w-3.5 h-3.5 text-stone-400" /> Has live matches only
                                </span>
                                <input
                                    type="checkbox"
                                    checked={onlyWithMatches}
                                    onChange={() => setOnlyWithMatches(v => !v)}
                                    className="rounded border-stone-300"
                                />
                            </label>
                        )}

                        <div className="flex items-center justify-between text-xs text-stone-500">
                            <span>
                                <span className="font-bold text-stone-700">{total.toLocaleString()}</span> {total === 1 ? "lead" : "leads"} ready
                            </span>
                            <button type="button" onClick={clearFilters} className="hover:text-black underline">
                                Clear filters
                            </button>
                        </div>
                    </div>

                    {capped && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2 text-xs text-amber-800">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>There are more leads than we loaded here. Narrow by state or search to see the rest.</span>
                        </div>
                    )}

                    {/* Queue list */}
                    <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
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
                            <ul className="divide-y divide-stone-100 max-h-[calc(100vh-280px)] overflow-y-auto">
                                {leads.map(lead => {
                                    const isSelected = selectedId === lead.id;
                                    return (
                                        <li key={lead.id}>
                                            <button
                                                type="button"
                                                onClick={() => selectLead(lead)}
                                                className={clsx(
                                                    "w-full text-left px-4 py-3 hover:bg-stone-50 transition-colors flex items-start gap-3",
                                                    isSelected && "bg-orange-50/60 hover:bg-orange-50",
                                                )}
                                            >
                                                {/* Tier badge */}
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
                                                        <span className="font-bold text-stone-800 truncate">
                                                            {lead.company_name || "Unnamed company"}
                                                        </span>
                                                        {lead.best_match_pct != null && (
                                                            <span className="shrink-0 text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5">
                                                                {lead.best_match_pct}% fit
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-stone-500 mt-0.5 truncate">{whyLine(lead)}</p>
                                                    {lead.state && (
                                                        <p className="text-[10px] text-stone-400 mt-0.5">{lead.state}</p>
                                                    )}
                                                </div>
                                                <ChevronRight className={clsx("w-4 h-4 shrink-0 mt-2", isSelected ? "text-orange-500" : "text-stone-300")} />
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </section>

                {/* ───────── RIGHT: per-lead checklist card ───────── */}
                <section className="min-w-0">
                    {!detail ? (
                        <div className="bg-white border border-stone-200 rounded-2xl py-24 px-6 text-center text-stone-400 h-full flex flex-col items-center justify-center">
                            <Target className="w-10 h-10 text-stone-300 mb-3" />
                            <p className="font-medium text-stone-500">Pick a company on the left to get started.</p>
                            <p className="text-sm mt-1">The steps to work each lead show up here.</p>
                        </div>
                    ) : (
                        <LeadCard
                            key={detail.id}
                            lead={detail}
                            loading={loadingDetail}
                            detailError={detailError}
                        />
                    )}
                </section>
            </main>
        </div>
    );
}

// ───────────────────────── per-lead card ─────────────────────────

function LeadCard({ lead, loading, detailError }: { lead: Lead; loading: boolean; detailError: string | null }) {
    const contactName = lead.contact.name || "";

    return (
        <div className="space-y-5">
            {detailError && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2 text-xs text-amber-800">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>Showing what we have. Full details didn&apos;t reload: {detailError}</span>
                </div>
            )}

            {/* Title strip */}
            <div className="bg-white border border-stone-200 rounded-2xl p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h2 className="font-bold text-2xl text-stone-900 truncate">{lead.company_name || "Unnamed company"}</h2>
                            {loading && <Loader2 className="w-4 h-4 animate-spin text-stone-300" />}
                        </div>
                        <p className="text-sm text-stone-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                            {lead.state && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {lead.state}</span>}
                            {lead.source === "inbound"
                                ? <span className="inline-flex items-center gap-1 text-emerald-700 font-medium"><Sparkles className="w-3.5 h-3.5" /> Came to us (website lead)</span>
                                : <span className="inline-flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> SAM.gov firm</span>}
                        </p>
                    </div>
                    <div className={clsx("shrink-0 rounded-xl border px-3 py-2 text-center", TIER_STYLE[lead.icp_tier])}>
                        <div className="text-2xl font-black leading-none">{lead.icp_tier}</div>
                        <div className="text-[10px] font-bold mt-0.5">{lead.icp_score}/100 fit</div>
                    </div>
                </div>
            </div>

            <StepWho lead={lead} />
            <StepWhy lead={lead} />
            <StepLoom lead={lead} />
            <StepMessage lead={lead} />
            <StepNotesAndHandoff lead={lead} contactName={contactName} />
            {lead.source === "inbound" && lead.check_page_url && <StepCheckPage url={lead.check_page_url} />}
        </div>
    );
}

// ── Reusable step container with a big numbered badge ─────────────────────────

function Step({ n, title, icon: Icon, children }: {
    n: number;
    title: string;
    icon: React.ComponentType<{ className?: string }>;
    children: React.ReactNode;
}) {
    return (
        <div className="bg-white border border-stone-200 rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-4">
                <span className="shrink-0 w-8 h-8 rounded-full bg-stone-900 text-white font-black text-sm flex items-center justify-center">{n}</span>
                <h3 className="font-bold text-stone-900 flex items-center gap-2">
                    <Icon className="w-4 h-4 text-stone-400" /> {title}
                </h3>
            </div>
            {children}
        </div>
    );
}

// ── Step 1: WHO ───────────────────────────────────────────────────────────────

function StepWho({ lead }: { lead: Lead }) {
    return (
        <Step n={1} title="Who you're talking to" icon={User}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <Field label="Contact" value={lead.contact.name || "Name not on file"} />
                <Field label="Title" value={lead.contact.title || "—"} />
                <div>
                    <FieldLabel>Email</FieldLabel>
                    {lead.contact.email ? (
                        <a href={`mailto:${lead.contact.email}`} className="text-blue-700 hover:underline inline-flex items-center gap-1.5 break-all">
                            <Mail className="w-3.5 h-3.5 shrink-0" /> {lead.contact.email}
                        </a>
                    ) : (
                        <span className="text-rose-600 inline-flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5" /> No email on file
                        </span>
                    )}
                </div>
                <div>
                    <FieldLabel>Phone</FieldLabel>
                    {lead.contact.phone ? (
                        <a href={`tel:${lead.contact.phone}`} className="text-blue-700 hover:underline inline-flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5" /> {lead.contact.phone}
                        </a>
                    ) : (
                        <span className="text-stone-400">—</span>
                    )}
                </div>
                <div>
                    <FieldLabel>Website</FieldLabel>
                    {lead.website ? (
                        <a href={normalizeWebsiteHref(lead.website)} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline inline-flex items-center gap-1.5 break-all">
                            <Globe className="w-3.5 h-3.5 shrink-0" /> {lead.website} <ExternalLink className="w-3 h-3" />
                        </a>
                    ) : (
                        <span className="text-amber-700 inline-flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5" /> No website found
                        </span>
                    )}
                </div>
                <div>
                    <FieldLabel>LinkedIn</FieldLabel>
                    {lead.owner_linkedin ? (
                        <a href={lead.owner_linkedin} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline inline-flex items-center gap-1.5">
                            <Linkedin className="w-3.5 h-3.5" /> Owner profile <ExternalLink className="w-3 h-3" />
                        </a>
                    ) : (
                        <span className="text-stone-400">—</span>
                    )}
                </div>
            </div>

            {/* Quick firmographics */}
            <div className="flex flex-wrap gap-2 mt-4">
                {lead.federal_awards_count != null && (
                    <Pill icon={Award}>{lead.federal_awards_count} federal award{lead.federal_awards_count === 1 ? "" : "s"}</Pill>
                )}
                {lead.employee_count != null && lead.employee_count > 0 && (
                    <Pill icon={UsersIcon}>{lead.employee_count} employees</Pill>
                )}
                {lead.years_in_business != null && lead.years_in_business > 0 && (
                    <Pill icon={Building2}>{lead.years_in_business} yrs in business</Pill>
                )}
                {[...lead.sba_certifications, ...lead.certifications].slice(0, 4).map((c, i) => (
                    <Pill key={`${c}-${i}`} icon={Award}>{c}</Pill>
                ))}
            </div>

            {/* ICP breakdown — why this firm fits, factor by factor */}
            <div className="mt-5 border-t border-stone-100 pt-4">
                <FieldLabel>Why they&apos;re a fit (each factor)</FieldLabel>
                <div className="space-y-2 mt-2">
                    {lead.icp_breakdown.map((b, i) => {
                        const pct = b.max > 0 ? Math.round((b.points / b.max) * 100) : 0;
                        return (
                            <div key={i} className="text-sm">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="font-medium text-stone-700">{b.label}</span>
                                    <span className="text-xs font-bold text-stone-500">{b.points}/{b.max}</span>
                                </div>
                                <div className="h-1.5 rounded-full bg-stone-100 overflow-hidden mt-1">
                                    <div
                                        className={clsx(
                                            "h-full rounded-full",
                                            pct >= 70 ? "bg-emerald-500" : pct >= 35 ? "bg-amber-500" : "bg-stone-300",
                                        )}
                                        style={{ width: `${pct}%` }}
                                    />
                                </div>
                                <p className="text-xs text-stone-500 mt-1">{b.detail}</p>
                            </div>
                        );
                    })}
                </div>
            </div>
        </Step>
    );
}

// ── Step 2: WHY THEM (matches + gap) ──────────────────────────────────────────

function StepWhy({ lead }: { lead: Lead }) {
    return (
        <Step n={2} title="Why call them — your opener" icon={Trophy}>
            {lead.top_matches.length > 0 ? (
                <>
                    <FieldLabel>Live opportunities that fit them right now</FieldLabel>
                    <ul className="space-y-2 mt-2">
                        {lead.top_matches.map((m, i) => (
                            <li key={i} className="border border-stone-200 rounded-xl p-3">
                                <div className="flex items-start justify-between gap-2">
                                    <span className="font-medium text-stone-800 text-sm">{m.title}</span>
                                    <span className="shrink-0 text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5">
                                        {m.score_pct}% fit
                                    </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500 mt-1.5">
                                    {m.agency && <span className="inline-flex items-center gap-1"><Building2 className="w-3 h-3" /> {m.agency}</span>}
                                    {m.deadline && <span>Due {formatDeadline(m.deadline)}</span>}
                                    {m.naics && <span>NAICS {m.naics}</span>}
                                </div>
                            </li>
                        ))}
                    </ul>
                </>
            ) : (
                <p className="text-sm text-stone-500">
                    No live matches captured yet. Lead the conversation with the website gap below instead.
                </p>
            )}

            {lead.gap_hook && (
                <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <FieldLabel>The sharpest thing they&apos;re missing (use this)</FieldLabel>
                    <p className="text-sm text-stone-800 mt-1">{lead.gap_hook}</p>
                </div>
            )}

            {lead.findings_summary && (
                <div className="mt-4">
                    <FieldLabel>Quick briefing</FieldLabel>
                    <p className="text-sm text-stone-600 mt-1">{lead.findings_summary}</p>
                </div>
            )}
        </Step>
    );
}

// ── Step 3: LOOM ──────────────────────────────────────────────────────────────

function StepLoom({ lead }: { lead: Lead }) {
    return (
        <Step n={3} title="Loom video angle" icon={Video}>
            {lead.loom_url ? (
                <div className="space-y-3">
                    <p className="text-sm text-stone-600">
                        Their main gap is <span className="font-medium text-stone-800">{lead.gap_hook || "covered in this short video"}</span>.
                        Share this Loom and say: &ldquo;Recorded a 2-minute look at your site, here&apos;s the one thing I&apos;d fix first.&rdquo;
                    </p>
                    <a
                        href={lead.loom_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-bold px-4 py-2 rounded-lg text-sm"
                    >
                        <Video className="w-4 h-4" /> Open the Loom <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                </div>
            ) : (
                <p className="text-sm text-stone-500">
                    No matching Loom video for this lead. Skip this step and use the message below.
                </p>
            )}
        </Step>
    );
}

// ── Step 4: MESSAGE ───────────────────────────────────────────────────────────

function StepMessage({ lead }: { lead: Lead }) {
    const [tone, setTone] = useState<Tone>("warm_intro");
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [subject, setSubject] = useState("");
    const [bodyText, setBodyText] = useState("");
    const [generated, setGenerated] = useState(false);
    const [copied, setCopied] = useState<"subject" | "body" | "both" | null>(null);

    const generate = async () => {
        setGenerating(true);
        setError(null);
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
        } catch {
            // Clipboard can be blocked; no-op rather than crash.
        }
    };

    return (
        <Step n={4} title="Write a personalized message" icon={Sparkles}>
            {/* Tone picker */}
            <div>
                <FieldLabel>Pick the style</FieldLabel>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                    {TONE_OPTIONS.map(t => (
                        <button
                            key={t.value}
                            type="button"
                            onClick={() => setTone(t.value)}
                            className={clsx(
                                "text-left rounded-xl border p-3 transition-colors",
                                tone === t.value
                                    ? "border-orange-400 bg-orange-50"
                                    : "border-stone-200 hover:border-stone-300",
                            )}
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
                {generating
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Writing…</>
                    : <><Sparkles className="w-4 h-4" /> {generated ? "Rewrite message" : "Generate message"}</>}
            </button>

            {error && (
                <p className="mt-3 text-sm text-rose-600 inline-flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" /> {error}
                </p>
            )}

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
                            type="text"
                            value={subject}
                            onChange={e => setSubject(e.target.value)}
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
                            value={bodyText}
                            onChange={e => setBodyText(e.target.value)}
                            rows={10}
                            className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400 leading-relaxed"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => copy("both")}
                        className="inline-flex items-center gap-2 bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 font-bold px-3 py-2 rounded-lg text-sm"
                    >
                        {copied === "both" ? <><Check className="w-4 h-4 text-emerald-600" /> Copied subject + message</> : <><Copy className="w-4 h-4" /> Copy subject + message</>}
                    </button>
                </div>
            )}
        </Step>
    );
}

// ── Steps 5 + 6: NOTES + HUBSPOT HAND-OFF ─────────────────────────────────────

function StepNotesAndHandoff({ lead, contactName }: { lead: Lead; contactName: string }) {
    const [notes, setNotes] = useState("");
    const [transcript, setTranscript] = useState("");
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
            setResult({ ok: false, message: "No email on file for this lead — can't add them to HubSpot." });
            return;
        }
        setPushing(true);
        setResult(null);
        try {
            const { first, last } = splitName(contactName);
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
                const reason = data?.steps?.contact?.error || data?.error || "Something went wrong pushing to HubSpot.";
                setResult({ ok: false, message: reason });
            }
        } catch (e) {
            setResult({ ok: false, message: e instanceof Error ? e.message : "Could not reach HubSpot." });
        } finally {
            setPushing(false);
        }
    };

    return (
        <>
            <Step n={5} title="Your notes" icon={ClipboardList}>
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
            </Step>

            <Step n={6} title="Hand off to HubSpot" icon={Send}>
                <p className="text-sm text-stone-600 mb-4">
                    This adds the contact, saves your notes, and creates a follow-up task for Sergio. Do this once you&apos;ve made contact or want him to take it from here.
                </p>
                <button
                    type="button"
                    onClick={push}
                    disabled={pushing || !lead.contact.email}
                    className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-4 py-2.5 rounded-lg text-sm"
                >
                    {pushing
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                        : <><Send className="w-4 h-4" /> Send to HubSpot (warm)</>}
                </button>
                {!lead.contact.email && (
                    <p className="mt-2 text-xs text-rose-600 inline-flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" /> No email on file — find one first.
                    </p>
                )}
                {result && (
                    <div
                        className={clsx(
                            "mt-3 rounded-xl p-3 text-sm flex items-start gap-2",
                            result.ok ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-rose-50 border border-rose-200 text-rose-700",
                        )}
                    >
                        {result.ok ? <Check className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
                        <span className="font-medium">{result.message}</span>
                    </div>
                )}
            </Step>
        </>
    );
}

// ── Step 7: CHECK PAGE (inbound only) ─────────────────────────────────────────

function StepCheckPage({ url }: { url: string }) {
    return (
        <Step n={7} title="Their results page" icon={FileText}>
            <p className="text-sm text-stone-600 mb-3">
                This lead ran our website checker. Open the exact page they saw so you can talk to it directly.
            </p>
            <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 font-bold px-4 py-2 rounded-lg text-sm"
            >
                <ExternalLink className="w-4 h-4" /> Open check page
            </a>
        </Step>
    );
}

// ───────────────────────── tiny presentational helpers ─────────────────────────

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

function Pill({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
    return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-stone-100 text-stone-700 rounded-lg px-2.5 py-1">
            <Icon className="w-3.5 h-3.5 text-stone-400" /> {children}
        </span>
    );
}
