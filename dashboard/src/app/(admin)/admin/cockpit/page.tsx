"use client";

/**
 * Sales Cockpit V3 — the daily driver for a NON-TECHNICAL sales rep whose job is:
 *   understand the lead → email them → record a Loom → call them → push to HubSpot.
 *
 * Full-height two-pane workspace:
 *   LEFT  (lg+): a filter panel + a scrollable prioritized lead queue (own scroll).
 *   RIGHT (lg+): the selected lead's detail, TABBED (own scroll):
 *       • Company  (DEFAULT — the rep's home base) — header + action bar, the
 *                  briefing, contact block, firmographics + past awards + revenue,
 *                  one "Research & fill the gaps" button, and outreach inline
 *                  (generate → edit → send email + notes/transcript).
 *       • Matches  — foldable contract cards (collapsed: title/agency/fit%; expand:
 *                  deadline/NAICS/set-aside/value/why-it-fits + View on SAM.gov).
 *       • Assets   — one-pager site, capability statement, check page.
 *
 * On mobile the list shows first; tapping a lead slides the detail in as a
 * full-screen panel with a back button.
 *
 * DENSITY: cards are tight; grids go multi-column on xl to use a 27" screen,
 * comfortable on laptop, single-column on mobile. No giant empty frames.
 *
 * VANISHING-LEAD FIX: after Research/Enrich/Rerun (or any in-detail mutation) we
 * patch the lead IN PLACE in the loaded queue array from the detail re-fetch — we
 * never re-run the filtered list query (which could drop a lead whose employee
 * count / ICP just changed under an active filter). A manual "Refresh queue"
 * re-applies filters on demand.
 *
 * INBOUND ROBUSTNESS: every contractor-only field (top_matches, past_awards,
 * research, LinkedIn, SAM, asset generators) is guarded for source==='inbound'
 * so an inbound detail never throws.
 *
 * Backed by:
 *   GET  /api/admin/cockpit/leads            — queue + single-lead detail
 *   POST /api/admin/cockpit/message          — AI lead-in (subject + body)
 *   POST /api/admin/cockpit/hubspot-push     — warm hand-off to HubSpot
 *   POST /api/admin/cockpit/enrich           — research + fill LinkedIn + firmographics (ONE pass)
 *   POST /api/admin/cockpit/rerun            — re-queue match scoring
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
    ChevronRight, MapPin, FileText, Wand2, RotateCcw, Download, X,
    Star, LayoutTemplate, Package, ArrowLeft, Settings,
    DollarSign, CalendarClock, BadgeCheck, Info, ChevronDown, SlidersHorizontal,
    Tag, Plus, PhoneCall, MessageSquare, TrendingUp, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import clsx from "clsx";
import CallButton, { type SavedCallLog } from "@/components/CallButton";
import { buildCapabilityPdf, type CapSection, type CapMetadata } from "@/components/capability/pdfBuilder";
import { certInfo } from "@/lib/cert-glossary";
import { NAICS_CODES, searchNaics } from "@/lib/naics-codes";

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
    set_aside?: string | null;
    value?: number | string | null;
    /** REAL canonical URL (opportunities.link, the 404 fix); null when broken/unknown. */
    real_link?: string | null;
    /** Trimmed solicitation description (~400 chars). */
    description?: string | null;
    /** Top extracted keywords for the opp. */
    keywords?: string[];
    /** 1-3 plain "why it fits" bullets. */
    why?: string[];
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
    legal_name?: string | null;
    website: string | null;
    /** Best-effort site: stored URL, else derived from a company email domain. */
    derived_website?: string | null;
    /** 'stored' (real column) | 'email' (likely site, label it) | null. */
    derived_website_source?: "stored" | "email" | null;
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
    track_record?: string[];
    owner_linkedin: string | null;
    company_linkedin?: string | null;
    booking_url?: string | null;
    sam_entity_url?: string | null;
    /** Past federal awards + USASpending revenue streams (contractors; empty-ish for inbound). */
    past_awards?: {
        total_count: number | null;
        total_volume: number | null;
        last_award_date: string | null;
        top_agencies: Array<{ name: string; amount: number | null }>;
        top_naics: Array<{ code: string; label: string; amount: number | null }>;
    };
    /** The single most-recent FPDS award (contractors, detail path only). */
    last_award?: {
        date: string | null;
        agency: string | null;
        amount: number | null;
        naics: string | null;
        description: string | null;
        piid: string | null;
        url: string | null;
    } | null;
    awards_count?: number | null;
    company_address?: string | null;
    company_history?: string | null;
    estimated_revenue?: number | null;
    has_website: boolean;
    total_federal_revenue?: number | null;
    total_federal_awards?: number | null;
    sam_registered?: boolean | null;
    sam_expiration?: string | null;
    sam_expiring_soon?: boolean;
    // ── SAM-REFRESH lane (V4.1 leads API) ──
    registration_status?: string | null;    // authoritative SAM 'Active' | 'Inactive' | null
    registered_since?: string | null;        // sam_registration_date ("registered since")
    sam_days_to_expiry?: number | null;       // days from now to expiration (negative if lapsed)
    sam_status_label?: string | null;         // human badge from the API
    known?: { linkedin: boolean; email: boolean; phone: boolean; website: boolean };
    readiness_score?: number | null;
    check_page_url?: string;
    check_analysis_id?: string | null;
    research?: LeadResearch | null;
    website_url?: string | null;
    created_at?: string | null;
    /** This admin has starred the contractor (contractors source only). */
    saved?: boolean;
    /** Contractor capability keywords (text[], migration 183). */
    capability_keywords?: string[];
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
    "ICP fit — how good a CUSTOMER they are for us: veteran-owned + 8(a) + ≤50 staff + 1–5 past awards. (Separate from the match %, which is what they could win.)";

/** Title-case a company name without mangling acronyms / mixed-case brands. */
function toTitleCaseCompany(name: string | null | undefined): string {
    const n = (name || "").trim();
    if (!n) return "";
    // Only re-case names that are entirely upper- or lower-case (SAM style); leave
    // already-mixed-case brands ("McKinsey LLC") alone.
    const isAllUpper = n === n.toUpperCase();
    const isAllLower = n === n.toLowerCase();
    if (!isAllUpper && !isAllLower) return n;
    const SMALL = new Set(["llc", "inc", "corp", "co", "of", "and", "the", "for"]);
    const ACRONYMS = new Set(["llc", "inc", "corp", "usa", "us", "it", "hvac", "dba", "pllc", "lp", "llp"]);
    return n
        .toLowerCase()
        .split(/\s+/)
        .map((w, i) => {
            const bare = w.replace(/[^a-z0-9]/gi, "");
            if (ACRONYMS.has(bare)) return w.toUpperCase();
            if (i > 0 && SMALL.has(bare)) return w;
            return w.charAt(0).toUpperCase() + w.slice(1);
        })
        .join(" ");
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

/** A clean tel: href from a free-form phone string (keeps digits + leading +). */
function telHref(phone: string): string {
    return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

function compactCurrency(n: number | string | null | undefined): string | null {
    const num = typeof n === "string" ? Number(n.replace(/[^0-9.-]/g, "")) : n;
    if (num == null || !Number.isFinite(num) || num <= 0) return null;
    try {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            notation: "compact",
            maximumFractionDigits: 1,
        }).format(num);
    } catch {
        return `$${Math.round(num).toLocaleString()}`;
    }
}

/** Short year-only date ("2019") for the "on SAM since" line. */
function formatYear(d: string | null | undefined): string | null {
    if (!d) return null;
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return null;
    return String(dt.getFullYear());
}

/** Whole years since a date (e.g. "registered since 2019" → 7). null when unknown. */
function yearsSince(d: string | null | undefined): number | null {
    if (!d) return null;
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return null;
    const ms = Date.now() - dt.getTime();
    if (ms <= 0) return 0;
    return Math.floor(ms / (365.25 * 86400000));
}

/**
 * Derived SAM-registration presentation for the cockpit. Combines the
 * authoritative registration_status with days-to-expiry / expiring-soon to pick a
 * single semantic "state" the hero + firmographics both render off of:
 *   • 'lapsed'  — status Inactive OR days-to-expiry negative → red, "reactivate to bid"
 *   • 'expiring'— expiring within 90 days (and not lapsed)    → amber, urgent hook
 *   • 'active'  — registered + not expiring soon              → green
 *   • 'unknown' — no SAM data on file                         → neutral
 */
type SamState = "active" | "expiring" | "lapsed" | "unknown";

interface SamView {
    state: SamState;
    /** authoritative status text when present ('Active' | 'Inactive'). */
    statusText: string | null;
    /** "2019" or null. */
    sinceYear: string | null;
    /** whole years on SAM, or null. */
    sinceYears: number | null;
    /** days to expiry (negative = lapsed), or null. */
    daysToExpiry: number | null;
    /** formatted expiration date, or null. */
    expirationLabel: string | null;
}

function samView(lead: Lead): SamView {
    const status = (lead.registration_status || "").trim() || null;
    const days = lead.sam_days_to_expiry ?? daysToExpiryLocal(lead.sam_expiration);
    const lapsed =
        (status && status.toLowerCase() !== "active") || (days != null && days < 0);
    const expiringSoon = !lapsed && (lead.sam_expiring_soon || (days != null && days >= 0 && days <= 90));

    // Has ANY SAM signal? (status, expiry date, or sam_registered flag)
    const hasSignal = !!status || !!lead.sam_expiration || lead.sam_registered === true;

    let state: SamState;
    if (!hasSignal) state = "unknown";
    else if (lapsed) state = "lapsed";
    else if (expiringSoon) state = "expiring";
    else state = "active";

    return {
        state,
        statusText: status,
        sinceYear: formatYear(lead.registered_since),
        sinceYears: yearsSince(lead.registered_since),
        daysToExpiry: days,
        expirationLabel: lead.sam_expiration ? formatDeadline(lead.sam_expiration) : null,
    };
}

/** Local days-to-expiry fallback when the API didn't compute it. */
function daysToExpiryLocal(expiration: string | null | undefined): number | null {
    if (!expiration) return null;
    const t = new Date(expiration).getTime();
    if (Number.isNaN(t)) return null;
    return Math.ceil((t - Date.now()) / 86400000);
}

/**
 * The one-line hero SAM hook the rep reads first. Mirrors the semantic state:
 *   lapsed   → "SAM registration LAPSED — reactivate to bid"
 *   expiring → "On SAM since 2019 · expires in 41 days"
 *   active   → "Active on SAM since 2019" (no urgency)
 *   unknown  → null (hero omits the line)
 */
function samHook(v: SamView): string | null {
    const since = v.sinceYear ? `on SAM since ${v.sinceYear}` : "registered on SAM";
    if (v.state === "lapsed") {
        return "SAM registration LAPSED — reactivate to bid";
    }
    if (v.state === "expiring") {
        const d = v.daysToExpiry;
        const tail = d != null ? `expires in ${d} day${d === 1 ? "" : "s"}` : "expiring soon";
        return `Registered ${since} · ${tail}`;
    }
    if (v.state === "active") {
        return `Active ${since}`;
    }
    return null;
}

/** SBA/veteran cert label the headline can name (e.g. "SDVOSB-eligible"). */
function topCertLabel(lead: Lead): string | null {
    const hay = [...lead.certifications, ...lead.sba_certifications].join(" ").toLowerCase();
    if (/sdvosb|service.?disabled/.test(hay)) return "SDVOSB";
    if (/8\(a\)|\b8a\b/.test(hay)) return "8(a)";
    if (/hubzone/.test(hay)) return "HUBZone";
    if (/\bedwosb\b/.test(hay)) return "EDWOSB";
    if (/\bwosb\b|women.?owned/.test(hay)) return "WOSB";
    if (/\bvosb\b|veteran/.test(hay)) return "VOSB";
    return null;
}

/**
 * The bold one-line headline at the top of the hero. Composes the fit verdict
 * with the best live match % and the sharpest cert so the rep gets the verdict in
 * one read: "Strong fit — 89% top match, SDVOSB-eligible".
 */
function heroHeadline(lead: Lead): string {
    const verdict =
        lead.icp_tier === "A" ? "Strong fit"
        : lead.icp_tier === "B" ? "Worth a look"
        : "Lower priority";
    const bits: string[] = [];
    if (lead.best_match_pct != null) bits.push(`${lead.best_match_pct}% top match`);
    const cert = topCertLabel(lead);
    if (cert) bits.push(`${cert}-eligible`);
    return bits.length ? `${verdict} — ${bits.join(", ")}` : verdict;
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
    /** Selected NAICS codes (2-6 digit). Wired to the leads API repeated `naics` param. */
    naics: string[];
    /** "Registered on SAM in last N months" → registered_within_months. "" = off. */
    registeredWithinMonths: string;
    /** "Awarded in last 12 months" toggle → awarded_within_months=12. */
    awardedLast12mo: boolean;
}

const EMPTY_FILTERS: Filters = {
    q: "", state: "", tier: "",
    yearsMin: "", yearsMax: "", empMin: "", empMax: "", awardsMin: "", awardsMax: "", revenueMin: "",
    samRegistered: false, expiringSoon: false,
    hasLinkedin: false, hasEmail: false, hasPhone: false, hasWebsite: false,
    onlyWithMatches: true,
    naics: [], registeredWithinMonths: "", awardedLast12mo: false,
};

/** One-line "why" a rep reads at a glance on each queue row. */
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

// ───────────────────────── page ─────────────────────────

type TabKey = "company" | "matches" | "growth" | "keywords" | "assets";
type LeadSource = "contractors" | "inbound" | "saved";

// Resizable left-rail bounds (lg+). Width persists to localStorage.
const RAIL_STORAGE_KEY = "cp_cockpit_rail_w";
const RAIL_COLLAPSE_KEY = "cp_cockpit_rail_collapsed";
const RAIL_MIN_W = 300;
const RAIL_MAX_W = 560;
const RAIL_DEFAULT_W = 380;
function clampRailWidth(n: number): number {
    return Math.max(RAIL_MIN_W, Math.min(RAIL_MAX_W, Math.round(n)));
}

export default function CockpitPage() {
    // Queue state
    const [leads, setLeads] = useState<Lead[]>([]);
    const [total, setTotal] = useState(0);
    const [capped, setCapped] = useState(false);
    const [loadingQueue, setLoadingQueue] = useState(true);
    const [queueError, setQueueError] = useState<string | null>(null);

    // Filters
    const [source, setSource] = useState<LeadSource>("contractors");
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

    // Resizable left rail (lg+). Persisted to localStorage; clamped 300–560px.
    // The custom width only applies on lg+ (mobile keeps the full-width slide-over).
    const [railWidth, setRailWidth] = useState(RAIL_DEFAULT_W);
    const [resizing, setResizing] = useState(false);
    const [isLg, setIsLg] = useState(false);
    // Collapse the lead rail entirely → full-width detail (clean for Loom).
    const [railCollapsed, setRailCollapsed] = useState(false);
    const toggleRail = useCallback(() => {
        setRailCollapsed(c => {
            const next = !c;
            try { localStorage.setItem(RAIL_COLLAPSE_KEY, next ? "1" : "0"); } catch { /* ignore */ }
            return next;
        });
    }, []);
    useEffect(() => {
        try {
            const raw = localStorage.getItem(RAIL_STORAGE_KEY);
            if (raw) {
                const n = Number(raw);
                if (Number.isFinite(n)) setRailWidth(clampRailWidth(n));
            }
            setRailCollapsed(localStorage.getItem(RAIL_COLLAPSE_KEY) === "1");
        } catch { /* localStorage unavailable */ }
        if (typeof window === "undefined" || !window.matchMedia) return;
        const mq = window.matchMedia("(min-width: 1024px)");
        const onChange = () => setIsLg(mq.matches);
        onChange();
        mq.addEventListener("change", onChange);
        return () => mq.removeEventListener("change", onChange);
    }, []);
    const startResize = useCallback((e: React.PointerEvent) => {
        e.preventDefault();
        setResizing(true);
        const startX = e.clientX;
        const startW = railWidth;
        const onMove = (ev: PointerEvent) => {
            const next = clampRailWidth(startW + (ev.clientX - startX));
            setRailWidth(next);
        };
        const onUp = () => {
            setResizing(false);
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            setRailWidth(w => {
                try { localStorage.setItem(RAIL_STORAGE_KEY, String(w)); } catch { /* ignore */ }
                return w;
            });
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    }, [railWidth]);

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
            // NAICS multi-select → repeated `naics` params (API accepts repeated/comma).
            for (const code of filters.naics) params.append("naics", code);
            // Recently SAM-registered (last N months) + awarded in last 12 months.
            if (filters.registeredWithinMonths) params.set("registered_within_months", filters.registeredWithinMonths);
            if (filters.awardedLast12mo) params.set("awarded_within_months", "12");
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

    /**
     * VANISHING-LEAD FIX — patch a lead in place in the loaded queue array from a
     * detail re-fetch instead of re-running the filtered list query. A lead whose
     * employee_count / ICP / presence just changed under an active filter would
     * otherwise drop off the list mid-work; this keeps it visible. The manual
     * "Refresh queue" button (fetchQueue) is the only thing that re-applies filters.
     */
    const patchLeadInQueue = useCallback((updated: Lead) => {
        setLeads(prev => {
            const idx = prev.findIndex(l => l.id === updated.id && l.source === updated.source);
            if (idx === -1) return prev; // not in current page — nothing to patch
            const next = [...prev];
            next[idx] = { ...next[idx], ...updated };
            return next;
        });
    }, []);

    // ── Detail fetch (also patches the queue row in place) ─────────────────────
    const fetchDetail = useCallback(async (id: string, leadSource: LeadSource) => {
        setDetailError(null);
        setLoadingDetail(true);
        try {
            const params = new URLSearchParams({ id, source: leadSource });
            const res = await fetch(`/api/admin/cockpit/leads?${params}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
            if (data.lead) {
                setDetail(data.lead);
                patchLeadInQueue(data.lead);
            }
        } catch (e) {
            setDetailError(e instanceof Error ? e.message : "Could not load full details");
        } finally {
            setLoadingDetail(false);
        }
    }, [patchLeadInQueue]);

    const selectLead = useCallback(async (lead: Lead) => {
        setSelectedId(lead.id);
        setDetail(lead);
        await fetchDetail(lead.id, lead.source);
    }, [fetchDetail]);

    const switchSource = (s: LeadSource) => {
        setSource(s);
        setSelectedId(null);
        setDetail(null);
    };

    /** Patch a single field of the selected detail + its queue row (e.g. star toggle). */
    const patchDetail = useCallback((partial: Partial<Lead>) => {
        setDetail(prev => {
            if (!prev) return prev;
            const next = { ...prev, ...partial };
            patchLeadInQueue(next);
            return next;
        });
    }, [patchLeadInQueue]);

    const clearFilters = () =>
        setFilters(prev => ({ ...EMPTY_FILTERS, onlyWithMatches: prev.onlyWithMatches }));

    /**
     * Toggle the saved-star for a contractor. Optimistically patches the queue row
     * (and the detail if it's the selected lead), then fires the POST. On the
     * "Saved" source we drop an un-saved lead from the list immediately.
     */
    const toggleSaved = useCallback(async (lead: Lead) => {
        if (lead.source !== "contractors") return;
        const nextSaved = !lead.saved;
        // Optimistic UI.
        setLeads(prev => {
            if (source === "saved" && !nextSaved) {
                return prev.filter(l => !(l.id === lead.id && l.source === lead.source));
            }
            return prev.map(l => (l.id === lead.id && l.source === lead.source ? { ...l, saved: nextSaved } : l));
        });
        setDetail(prev => (prev && prev.id === lead.id && prev.source === lead.source ? { ...prev, saved: nextSaved } : prev));
        try {
            await fetch("/api/admin/cockpit/saved", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contractor_id: lead.id, action: nextSaved ? "save" : "unsave" }),
            });
        } catch {
            // Roll back on failure.
            setLeads(prev => prev.map(l => (l.id === lead.id && l.source === lead.source ? { ...l, saved: lead.saved } : l)));
            setDetail(prev => (prev && prev.id === lead.id && prev.source === lead.source ? { ...prev, saved: lead.saved } : prev));
        }
    }, [source]);

    // A/B/C breakdown of the loaded queue — so the count reads "3 A · 40 B · …"
    // instead of a meaningless flat "1,000".
    const tierCounts = useMemo(() => {
        const c = { A: 0, B: 0, C: 0 };
        for (const l of leads) if (l.icp_tier === "A" || l.icp_tier === "B" || l.icp_tier === "C") c[l.icp_tier]++;
        return c;
    }, [leads]);

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
        if (filters.naics.length) n++;
        if (filters.registeredWithinMonths) n++;
        if (filters.awardedLast12mo) n++;
        return n;
    }, [filters]);

    return (
        <div className="h-screen flex flex-col bg-stone-50 overflow-hidden">
            {/* Header */}
            <header className="bg-white border-b border-stone-200 px-4 sm:px-6 py-2.5 shrink-0">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                        <h1 className="font-bold text-lg flex items-center gap-2">
                            <Target className="w-5 h-5 text-orange-600 shrink-0" /> Sales Cockpit
                        </h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={toggleRail}
                            title={railCollapsed ? "Show the lead list" : "Hide the lead list (full-width detail, clean for Loom)"}
                            className="hidden lg:inline-flex items-center gap-2 bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 font-bold px-3 py-1.5 rounded-lg text-sm"
                        >
                            {railCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
                            <span className="hidden xl:inline">{railCollapsed ? "Show list" : "Hide list"}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setSenderOpen(true)}
                            className={clsx(
                                "inline-flex items-center gap-2 border font-bold px-3 py-1.5 rounded-lg text-sm",
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
                            title="Re-apply your filters and reload the list"
                            className="bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 font-bold px-3 py-1.5 rounded-lg inline-flex items-center gap-2 text-sm"
                        >
                            <RefreshCw className={clsx("w-4 h-4", loadingQueue && "animate-spin")} />
                            <span className="hidden sm:inline">Refresh queue</span>
                        </button>
                    </div>
                </div>
            </header>

            {/* Body: two-pane on lg+, single pane (list ⇄ detail) on mobile */}
            <div className={clsx("flex-1 min-h-0 flex", resizing && "select-none cursor-col-resize")}>
                {/* ───────── LEFT: lead queue ───────── */}
                <aside
                    style={isLg ? { width: railWidth } : undefined}
                    className={clsx(
                        "flex flex-col min-h-0 bg-white border-r border-stone-200",
                        "w-full lg:shrink-0",
                        // On mobile, hide the list once a lead is selected.
                        detail ? "hidden lg:flex" : "flex",
                        // Collapsed (lg only) → hide the rail entirely for a full-width
                        // detail. `!` beats the lg:flex above regardless of source order.
                        railCollapsed && "lg:!hidden",
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
                        tierCounts={tierCounts}
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
                                        key={`${lead.source}:${lead.id}`}
                                        lead={lead}
                                        selected={selectedId === lead.id}
                                        onClick={() => selectLead(lead)}
                                        onToggleSaved={() => toggleSaved(lead)}
                                    />
                                ))}
                            </ul>
                        )}
                    </div>
                </aside>

                {/* ───────── Drag handle (lg+ only) — resize the queue rail ───────── */}
                <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize the lead queue"
                    onPointerDown={startResize}
                    className={clsx(
                        "hidden lg:flex shrink-0 w-1.5 cursor-col-resize items-center justify-center group relative -ml-px z-10",
                        resizing ? "bg-orange-200" : "hover:bg-orange-100",
                        railCollapsed && "lg:!hidden",
                    )}
                    title="Drag to resize"
                >
                    <span className={clsx(
                        "h-10 w-0.5 rounded-full transition-colors",
                        resizing ? "bg-orange-500" : "bg-stone-300 group-hover:bg-orange-400",
                    )} />
                </div>

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
                            <p className="text-sm mt-1">Their briefing, contact, firmographics, and outreach show up here.</p>
                        </div>
                    ) : (
                        <LeadDetail
                            key={`${detail.source}:${detail.id}`}
                            lead={detail}
                            loading={loadingDetail}
                            detailError={detailError}
                            senderConfigured={senderConfigured}
                            onOpenSender={() => setSenderOpen(true)}
                            onRefresh={() => fetchDetail(detail.id, detail.source)}
                            onBack={() => { setSelectedId(null); setDetail(null); }}
                            onToggleSaved={() => toggleSaved(detail)}
                            onPatchDetail={patchDetail}
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
    activeFilterCount, total, tierCounts, onClear,
}: {
    source: LeadSource;
    onSwitchSource: (s: LeadSource) => void;
    filters: Filters;
    setF: <K extends keyof Filters>(k: K, v: Filters[K]) => void;
    filtersOpen: boolean;
    setFiltersOpen: (v: boolean) => void;
    activeFilterCount: number;
    total: number;
    tierCounts: { A: number; B: number; C: number };
    onClear: () => void;
}) {
    const isContractors = source === "contractors";
    const SOURCES: { key: LeadSource; label: string }[] = [
        { key: "contractors", label: "Our DB" },
        { key: "inbound", label: "Inbound" },
        { key: "saved", label: "Saved" },
    ];
    return (
        <div className="border-b border-stone-200 p-3 space-y-2.5 shrink-0">
            {/* Source toggle */}
            <div className="grid grid-cols-3 gap-1 bg-stone-100 rounded-xl p-1">
                {SOURCES.map(({ key, label }) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => onSwitchSource(key)}
                        className={clsx(
                            "px-2 py-1.5 rounded-lg text-sm font-bold transition-colors inline-flex items-center justify-center gap-1",
                            source === key ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700",
                        )}
                    >
                        {key === "saved" && <Star className={clsx("w-3.5 h-3.5", source === key && "fill-amber-400 text-amber-400")} />}
                        {label}
                    </button>
                ))}
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

                            {/* NAICS multi-select — searchable by code or keyword, chips below. */}
                            <NaicsMultiSelect
                                selected={filters.naics}
                                onChange={(codes) => setF("naics", codes)}
                            />

                            {/* SAM registration recency. */}
                            <div>
                                <FieldLabel>Registered on SAM in last…</FieldLabel>
                                <select
                                    value={filters.registeredWithinMonths}
                                    onChange={e => setF("registeredWithinMonths", e.target.value)}
                                    aria-label="Registered on SAM within the last N months"
                                    className="w-full mt-1 px-2 py-1.5 text-sm rounded-lg border border-stone-200 bg-white focus:outline-none focus:border-stone-400"
                                >
                                    <option value="">Any time</option>
                                    <option value="3">3 months</option>
                                    <option value="6">6 months</option>
                                    <option value="12">12 months</option>
                                    <option value="24">24 months</option>
                                </select>
                            </div>

                            <CheckRow label="Awarded in last 12 months" checked={filters.awardedLast12mo} onChange={v => setF("awardedLast12mo", v)} />

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
                <span className="inline-flex items-center gap-1.5 flex-wrap">
                    <span><span className="font-bold text-stone-700">{total.toLocaleString()}</span> {total === 1 ? "lead" : "leads"}</span>
                    {(tierCounts.A + tierCounts.B + tierCounts.C) > 0 && (
                        <span className="text-stone-400">
                            · <span className="font-bold text-emerald-700">{tierCounts.A}</span> A
                            · <span className="font-bold text-amber-700">{tierCounts.B}</span> B
                            · <span className="text-stone-500">{tierCounts.C}</span> C
                        </span>
                    )}
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

/**
 * Searchable NAICS multi-select for the cockpit filter panel. Mirrors the
 * partners-page picker: a disclosure button → search box (code + keyword aliases
 * via searchNaics) → checkable list, with removable chips below. Selected codes
 * flow to the leads API as repeated `naics` params (contractor-pool predicate).
 */
function NaicsMultiSelect({ selected, onChange }: { selected: string[]; onChange: (codes: string[]) => void }) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, [open]);

    const results = useMemo(() => {
        if (!query.trim()) return NAICS_CODES.filter(n => n.popular).slice(0, 30);
        return searchNaics(query).slice(0, 50);
    }, [query]);

    const toggle = (code: string) => {
        onChange(selected.includes(code) ? selected.filter(c => c !== code) : [...selected, code]);
    };

    return (
        <div ref={ref} className="relative">
            <FieldLabel>NAICS codes</FieldLabel>
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className="w-full mt-1 px-2 py-1.5 text-sm rounded-lg border border-stone-200 hover:border-stone-300 text-left flex items-center justify-between"
            >
                <span className="truncate">
                    {selected.length === 0
                        ? <span className="text-stone-400">Any NAICS</span>
                        : <span className="font-medium text-stone-700">{selected.length} selected</span>}
                </span>
                <ChevronDown className={clsx("w-4 h-4 text-stone-400 transition-transform shrink-0 ml-2", open && "rotate-180")} />
            </button>

            {selected.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                    {selected.map(c => (
                        <span key={c} className="inline-flex items-center bg-stone-800 text-white text-[10px] font-mono px-2 py-0.5 rounded-full">
                            {c}
                            <button type="button" onClick={() => toggle(c)} className="ml-1.5 hover:text-rose-300" title={`Remove ${c}`} aria-label={`Remove ${c}`}>
                                <X className="w-2.5 h-2.5" />
                            </button>
                        </span>
                    ))}
                </div>
            )}

            {open && (
                <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-stone-200 rounded-xl shadow-lg max-h-72 overflow-hidden flex flex-col">
                    <div className="p-2 border-b border-stone-100">
                        <input
                            autoFocus
                            type="text"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Search code or keyword (IT, janitorial, HVAC…)"
                            className="w-full border border-stone-200 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-stone-900/10"
                        />
                    </div>
                    <div className="overflow-y-auto flex-1">
                        {results.length === 0 ? (
                            <p className="text-xs text-stone-400 p-4 text-center">No matches</p>
                        ) : (
                            results.map(n => (
                                <button
                                    type="button"
                                    key={n.code}
                                    onClick={() => toggle(n.code)}
                                    className={clsx(
                                        "w-full text-left px-2.5 py-2 text-sm hover:bg-stone-50 flex items-center gap-2 border-b border-stone-50 last:border-0",
                                        selected.includes(n.code) && "bg-emerald-50",
                                    )}
                                >
                                    {selected.includes(n.code)
                                        ? <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                        : <span className="w-3.5 shrink-0" />}
                                    <span className="font-mono text-xs text-stone-500 shrink-0">{n.code}</span>
                                    <span className="text-xs truncate">{n.label}</span>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ───────────────────────── LEFT: a single lead row ─────────────────────────

function LeadRow({ lead, selected, onClick, onToggleSaved }: { lead: Lead; selected: boolean; onClick: () => void; onToggleSaved: () => void }) {
    const canSave = lead.source === "contractors";
    return (
        <li>
            <div
                className={clsx(
                    "w-full px-3 py-2.5 hover:bg-stone-50 transition-colors flex items-start gap-3",
                    selected && "bg-orange-50/70 hover:bg-orange-50",
                )}
            >
                <button type="button" onClick={onClick} className="flex items-start gap-3 min-w-0 flex-1 text-left">
                    <div
                        className={clsx(
                            "shrink-0 w-9 h-9 rounded-xl border flex flex-col items-center justify-center font-black leading-none",
                            TIER_STYLE[lead.icp_tier],
                        )}
                        title={`ICP fit ${lead.icp_score}/100`}
                    >
                        <span className="text-sm">{lead.icp_tier}</span>
                        <span className="text-[9px] font-bold opacity-70">{lead.icp_score}</span>
                    </div>

                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-stone-800 truncate">{toTitleCaseCompany(lead.company_name) || "Unnamed company"}</span>
                            {lead.best_match_pct != null && (
                                <span className="shrink-0 text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5">
                                    {lead.best_match_pct}%
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-stone-500 mt-0.5 truncate">{whyLine(lead)}</p>
                        <div className="flex items-center gap-2 mt-1">
                            {lead.state && <span className="text-[10px] text-stone-400">{lead.state}</span>}
                            <PresenceDots lead={lead} />
                        </div>
                    </div>
                </button>
                <div className="flex flex-col items-center gap-1 shrink-0">
                    {canSave && (
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onToggleSaved(); }}
                            title={lead.saved ? "Remove from saved" : "Save to shortlist"}
                            aria-label={lead.saved ? "Remove from saved" : "Save to shortlist"}
                            className="p-1 rounded-lg hover:bg-stone-100"
                        >
                            <Star className={clsx("w-4 h-4", lead.saved ? "fill-amber-400 text-amber-400" : "text-stone-300 hover:text-stone-400")} />
                        </button>
                    )}
                    <button type="button" onClick={onClick} aria-label="Open lead" className="p-1">
                        <ChevronRight className={clsx("w-4 h-4", selected ? "text-orange-500" : "text-stone-300")} />
                    </button>
                </div>
            </div>
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
    onToggleSaved, onPatchDetail,
}: {
    lead: Lead;
    loading: boolean;
    detailError: string | null;
    senderConfigured: boolean | null;
    onOpenSender: () => void;
    onRefresh: () => void;
    onBack: () => void;
    onToggleSaved: () => void;
    onPatchDetail: (partial: Partial<Lead>) => void;
}) {
    // Company is the rep's home base → default tab.
    const [tab, setTab] = useState<TabKey>("company");

    // Shared outreach scratch — notes + transcript live here so the Call modal,
    // the HubSpot hand-off, and the email composer can all read/write them.
    const [notes, setNotes] = useState("");
    const [transcript, setTranscript] = useState("");

    // Call notes modal. autoStart fires the recorder on mount (the top-bar "Call"
    // button); a phone-number click opens it WITHOUT auto-starting.
    const [callOpen, setCallOpen] = useState(false);
    const [callAutoStart, setCallAutoStart] = useState(false);
    const openCall = useCallback((autoStart: boolean) => { setCallAutoStart(autoStart); setCallOpen(true); }, []);

    // Email composer is prefilled by the AI message generator; keep it lifted so
    // the Company tab's outreach block survives a tab switch.
    const [emailSubject, setEmailSubject] = useState("");
    const [emailBody, setEmailBody] = useState("");
    // Resource attachments selected from the Assets tab — flow into the email send.
    const [emailAttachments, setEmailAttachments] = useState<{ title: string; url: string }[]>([]);

    // Asset → draft actions (Assets tab acts on the live email draft, then jumps
    // the rep back to the Company tab so they see the change).
    const insertAssetLink = useCallback((title: string, url: string) => {
        setEmailBody(prev => {
            const line = `${title}: ${url}`;
            return prev && prev.trim() ? `${prev}\n\n${line}` : line;
        });
        setTab("company");
    }, [setTab]);
    const attachAsset = useCallback((title: string, url: string) => {
        setEmailAttachments(prev => (prev.some(a => a.url === url) ? prev : [...prev, { title, url }]));
        setTab("company");
    }, [setTab]);

    const onCallSaved = useCallback((log: SavedCallLog) => {
        if (log.notes) setNotes(prev => (prev ? `${prev}\n\n${log.notes}` : log.notes));
        if (log.transcription) setTranscript(prev => (prev ? `${prev}\n\n${log.transcription}` : log.transcription));
    }, []);

    const companyName = toTitleCaseCompany(lead.company_name) || "Unnamed company";
    const isContractor = lead.source === "contractors";

    const TABS: { key: TabKey; label: string; Icon: React.ComponentType<{ className?: string }>; count?: number }[] = [
        { key: "company", label: "Company", Icon: User },
        { key: "matches", label: "Matches", Icon: Trophy, count: lead.top_matches.length || undefined },
        ...(isContractor ? [{ key: "growth" as const, label: "Growth", Icon: TrendingUp }] : []),
        ...(isContractor ? [{ key: "keywords" as const, label: "Keywords", Icon: Tag, count: lead.capability_keywords?.length || undefined }] : []),
        { key: "assets", label: "Assets", Icon: Package },
    ];

    return (
        <div className="flex flex-col min-h-0 h-full">
            {/* Sticky header + tabs */}
            <div className="bg-white border-b border-stone-200 shrink-0">
                <div className="px-4 sm:px-6 pt-2.5 pb-2">
                    {/* Mobile back */}
                    <button
                        type="button"
                        onClick={onBack}
                        className="lg:hidden mb-2 inline-flex items-center gap-1.5 text-sm font-bold text-stone-500 hover:text-stone-900"
                    >
                        <ArrowLeft className="w-4 h-4" /> Back to list
                    </button>

                    {/* Tight header strip: company + fit + state + source */}
                    <div className="flex items-center gap-2 flex-wrap">
                        {isContractor && (
                            <button
                                type="button"
                                onClick={onToggleSaved}
                                title={lead.saved ? "Remove from saved" : "Save to shortlist"}
                                aria-label={lead.saved ? "Remove from saved" : "Save to shortlist"}
                                className="shrink-0 p-1 rounded-lg hover:bg-stone-100"
                            >
                                <Star className={clsx("w-5 h-5", lead.saved ? "fill-amber-400 text-amber-400" : "text-stone-300 hover:text-stone-400")} />
                            </button>
                        )}
                        <h2 className="font-bold text-lg sm:text-xl text-stone-900 truncate min-w-0">{companyName}</h2>
                        {loading && <Loader2 className="w-4 h-4 animate-spin text-stone-300 shrink-0" />}
                        <CertTooltip blurb={FIT_TOOLTIP}>
                            <span className={clsx("inline-flex items-center gap-1 font-bold border rounded-full px-2 py-0.5 text-xs cursor-help", TIER_STYLE[lead.icp_tier])}>
                                Fit {lead.icp_tier} · {lead.icp_score} <Info className="w-3 h-3" />
                            </span>
                        </CertTooltip>
                        {lead.state && <span className="text-sm text-stone-500 inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {lead.state}</span>}
                        {lead.source === "inbound"
                            ? <span className="text-sm inline-flex items-center gap-1 text-emerald-700 font-medium"><Sparkles className="w-3.5 h-3.5" /> Came to us</span>
                            : <span className="text-sm text-stone-500 inline-flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> SAM.gov firm</span>}
                    </div>
                </div>

                {/* Tabs */}
                <div className="px-2 sm:px-4 flex gap-1 overflow-x-auto">
                    {TABS.map(({ key, label, Icon, count }) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setTab(key)}
                            className={clsx(
                                "px-3 sm:px-4 py-2 text-sm font-bold border-b-2 -mb-px inline-flex items-center gap-1.5 whitespace-nowrap transition-colors",
                                tab === key
                                    ? "border-orange-600 text-stone-900"
                                    : "border-transparent text-stone-400 hover:text-stone-700",
                            )}
                        >
                            <Icon className="w-4 h-4" /> {label}
                            {count != null && (
                                <span className={clsx("text-[10px] font-bold rounded-full px-1.5 py-0.5", tab === key ? "bg-orange-100 text-orange-700" : "bg-stone-100 text-stone-500")}>{count}</span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tab body (own scroll). No max-w clamp — use the full width on 27". */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4">
                {detailError && (
                    <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2 text-xs text-amber-800">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>Showing what we have. Full details didn&apos;t reload: {detailError}</span>
                    </div>
                )}

                {tab === "company" && (
                    <CompanyTab
                        lead={lead}
                        loading={loading}
                        senderConfigured={senderConfigured}
                        onOpenSender={onOpenSender}
                        onRefresh={onRefresh}
                        onOpenCall={() => openCall(false)}
                        onStartCall={() => openCall(true)}
                        notes={notes}
                        setNotes={setNotes}
                        transcript={transcript}
                        setTranscript={setTranscript}
                        emailSubject={emailSubject}
                        setEmailSubject={setEmailSubject}
                        emailBody={emailBody}
                        setEmailBody={setEmailBody}
                        attachments={emailAttachments}
                        setAttachments={setEmailAttachments}
                    />
                )}
                {tab === "matches" && <MatchesTab lead={lead} />}
                {tab === "growth" && <GrowthTab lead={lead} onInsertHook={(line) => { setEmailBody(prev => prev && prev.trim() ? `${prev}\n\n${line}` : line); setTab("company"); }} />}
                {tab === "keywords" && (
                    <KeywordsTab lead={lead} notes={notes} transcript={transcript} onPatchDetail={onPatchDetail} />
                )}
                {tab === "assets" && <AssetsTab lead={lead} onRefresh={onRefresh} onInsertLink={insertAssetLink} onAttach={attachAsset} />}
            </div>

            {callOpen && (
                <CallNotesModal
                    lead={lead}
                    autoStart={callAutoStart}
                    onClose={() => setCallOpen(false)}
                    onSaved={(log) => { onCallSaved(log); setCallOpen(false); }}
                />
            )}
        </div>
    );
}

// ───────────────────────── TAB: Company (the rep's home base) ─────────────────────────

function CompanyTab({
    lead, loading, senderConfigured, onOpenSender, onRefresh, onOpenCall, onStartCall,
    notes, setNotes, transcript, setTranscript,
    emailSubject, setEmailSubject, emailBody, setEmailBody, attachments, setAttachments,
}: {
    lead: Lead;
    loading: boolean;
    senderConfigured: boolean | null;
    onOpenSender: () => void;
    onRefresh: () => void;
    onOpenCall: () => void;
    onStartCall: () => void;
    notes: string;
    setNotes: React.Dispatch<React.SetStateAction<string>>;
    transcript: string;
    setTranscript: React.Dispatch<React.SetStateAction<string>>;
    emailSubject: string;
    setEmailSubject: (v: string) => void;
    emailBody: string;
    setEmailBody: (v: string) => void;
    attachments: { title: string; url: string }[];
    setAttachments: React.Dispatch<React.SetStateAction<{ title: string; url: string }[]>>;
}) {
    const isContractor = lead.source === "contractors";
    return (
        <div className="space-y-4">
            {/* TOP ACTION BAR */}
            <div className="flex flex-wrap items-center gap-2">
                <HubspotButton lead={lead} notes={notes} transcript={transcript} />
                {/* Call — only when we actually have a number to dial. Clicking dials
                    the rep's device (tel:) AND opens the notepad with transcription
                    auto-started. No phone → no button (nothing to call). */}
                {lead.contact.phone && (
                    <a
                        href={telHref(lead.contact.phone)}
                        onClick={onStartCall}
                        className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3.5 py-2 rounded-lg text-sm"
                        title={`Call ${lead.contact.phone} — dials your phone and opens the notepad`}
                    >
                        <PhoneCall className="w-4 h-4" /> Call
                    </a>
                )}
                {/* Research & fill gaps — moved up from the bottom card (contractors only). */}
                {isContractor && <ResearchButton lead={lead} onRefresh={onRefresh} refreshing={loading} />}
                {lead.derived_website ? (
                    <a
                        href={normalizeWebsiteHref(lead.derived_website)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-bold px-3.5 py-2 rounded-lg text-sm"
                        title={lead.derived_website_source === "email"
                            ? `Likely site (from their email domain) — ${lead.derived_website}`
                            : "Open their site to record a Loom walkthrough"}
                    >
                        <Video className="w-4 h-4" />
                        {lead.derived_website_source === "email" ? "Open likely site" : "Open their website"}
                        <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                ) : (
                    <span className="inline-flex items-center gap-2 bg-stone-100 text-stone-400 font-bold px-3.5 py-2 rounded-lg text-sm cursor-not-allowed" title="No website on file">
                        <Globe className="w-4 h-4" /> No website on file
                    </span>
                )}
                {lead.sam_entity_url && (
                    <a
                        href={lead.sam_entity_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 border border-stone-200 hover:border-stone-300 hover:bg-stone-50 text-stone-700 font-bold px-3 py-2 rounded-lg text-sm"
                        title="Open this entity's official SAM.gov record"
                    >
                        <BadgeCheck className="w-4 h-4 text-stone-400" /> SAM.gov <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                )}
            </div>

            {/* THE BRIEFING — moved here from Matches; it never belonged there. */}
            <BriefingCard lead={lead} />

            {/* Two-column workspace on xl: left = who/firmographics, right = outreach. */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
                {/* LEFT COLUMN */}
                <div className="space-y-4 min-w-0">
                    <ContactCard lead={lead} onStartCall={onStartCall} />
                    <CompanyDetailCard lead={lead} notes={notes} setNotes={setNotes} />
                    <FirmographicsCard lead={lead} />
                    {isContractor && <PastAwardsCard lead={lead} />}
                    {isContractor && <RevenueStreamsCard lead={lead} />}
                    <IcpBreakdownCard lead={lead} />
                    {/* Persisted research output surfaces here once a run completes. */}
                    {isContractor && lead.research && (
                        <Card>
                            <SectionHeading icon={Wand2} title="What we found" />
                            <ResearchResultPanel research={lead.research} />
                        </Card>
                    )}
                </div>

                {/* RIGHT COLUMN — outreach lives inline on the rep's home base. */}
                <div className="space-y-4 min-w-0">
                    <MessageGenerator lead={lead} onUseInComposer={(s, b) => { setEmailSubject(s); setEmailBody(b); }} />
                    <EmailComposer
                        lead={lead}
                        senderConfigured={senderConfigured}
                        onOpenSender={onOpenSender}
                        subject={emailSubject}
                        setSubject={setEmailSubject}
                        body={emailBody}
                        setBody={setEmailBody}
                        attachments={attachments}
                        setAttachments={setAttachments}
                    />
                    <NotesCard
                        lead={lead}
                        notes={notes}
                        setNotes={setNotes}
                        transcript={transcript}
                        setTranscript={setTranscript}
                        onOpenCall={onOpenCall}
                    />
                    {isContractor && <RerunCard lead={lead} />}
                </div>
            </div>
        </div>
    );
}

// ── Company detail block (address / history / est. revenue + transcription notes) ─
function CompanyDetailCard({ lead, notes, setNotes }: {
    lead: Lead;
    notes: string;
    setNotes: React.Dispatch<React.SetStateAction<string>>;
}) {
    const estRevenue = compactCurrency(lead.estimated_revenue);
    const hasProfile = !!(lead.company_address || lead.company_history || estRevenue);
    return (
        <Card>
            <SectionHeading icon={Building2} title="Company" />
            {hasProfile ? (
                <div className="space-y-3">
                    {lead.company_address && (
                        <div>
                            <FieldLabel className="inline-flex items-center gap-1.5"><MapPin className="w-3 h-3" /> Address</FieldLabel>
                            <p className="text-sm text-stone-700 mt-0.5">{lead.company_address}</p>
                        </div>
                    )}
                    {estRevenue && (
                        <div>
                            <FieldLabel className="inline-flex items-center gap-1.5"><DollarSign className="w-3 h-3" /> Estimated revenue</FieldLabel>
                            <p className="text-sm text-stone-700 mt-0.5">{estRevenue}</p>
                        </div>
                    )}
                    {lead.company_history && (
                        <div>
                            <FieldLabel className="inline-flex items-center gap-1.5"><FileText className="w-3 h-3" /> Company history</FieldLabel>
                            <p className="text-sm text-stone-600 leading-relaxed mt-0.5">{lead.company_history}</p>
                        </div>
                    )}
                </div>
            ) : (
                <p className="text-sm text-stone-400 -mt-1">No company profile captured yet — run Research &amp; fill gaps.</p>
            )}
            {/* Transcription notes — reuses the shared notes state so it flows to HubSpot. */}
            <div className="mt-3 pt-3 border-t border-stone-100">
                <FieldLabel className="inline-flex items-center gap-1.5"><ClipboardList className="w-3 h-3" /> Transcription notes</FieldLabel>
                <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Jot down anything from the call — it's the same notepad as the Notes card and flows to HubSpot."
                    className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400 leading-relaxed"
                />
            </div>
        </Card>
    );
}

// ── The HERO briefing — the first thing the rep reads ────────────────────────────
//
// Dominant block at the top of the Company tab. Stacks, sharpest-first:
//   1. company name + Fit tier/score chip + the verdict headline
//      ("Strong fit — 89% top match, SDVOSB-eligible")
//   2. the SHARPEST GAP (gap_hook) as the opener line — big, dark
//   3. the SAM-registration HOOK — green (active) / amber (expiring) / red (lapsed)
//   4. the single best live match (title · agency · fit %)
//   5. findings_summary as a quiet secondary line
//
// Uses the stone/orange theme + size/weight so it dominates the column, not a
// gray subtitle. Inbound leads (no gap/SAM) fall back to a readiness opener.
function BriefingCard({ lead }: { lead: Lead }) {
    const sam = samView(lead);
    const samLine = samHook(sam);
    const bestMatch = pickBestMatch(lead);
    const hasGap = !!lead.gap_hook;
    const headline = heroHeadline(lead);

    // SAM hook color treatment by state.
    const samTone =
        sam.state === "lapsed"
            ? "bg-rose-100 text-rose-800 border-rose-300"
            : sam.state === "expiring"
                ? "bg-amber-100 text-amber-900 border-amber-300"
                : sam.state === "active"
                    ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                    : "bg-stone-100 text-stone-600 border-stone-300";
    const SamIcon = sam.state === "lapsed" ? AlertTriangle : sam.state === "expiring" ? CalendarClock : BadgeCheck;

    // Inbound has no gap/SAM — give the rep the readiness opener instead.
    const inboundFallback = lead.source === "inbound" && !hasGap && !samLine;

    return (
        <div className="relative overflow-hidden rounded-2xl border border-stone-300 bg-gradient-to-br from-stone-900 via-stone-900 to-stone-800 text-white shadow-sm">
            {/* subtle orange wash on the right */}
            <div className="pointer-events-none absolute -right-12 -top-12 w-48 h-48 rounded-full bg-orange-500/20 blur-3xl" aria-hidden />
            <div className="relative p-4 sm:p-5">
                {/* 1 — verdict line: name + fit chip + headline */}
                <div className="flex items-center gap-2 flex-wrap">
                    <span className={clsx(
                        "inline-flex items-center gap-1 font-black border rounded-full px-2.5 py-0.5 text-xs",
                        TIER_STYLE[lead.icp_tier],
                    )}>
                        Fit {lead.icp_tier} · {lead.icp_score}
                    </span>
                    <span className="text-sm font-semibold text-orange-300">{headline}</span>
                </div>

                {/* 2 — the sharpest gap, the opener (big + dominant) */}
                {hasGap ? (
                    <div className="mt-3">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-orange-300/90">
                            <Sparkles className="w-3.5 h-3.5" /> Your opener
                        </div>
                        <p className="mt-1 text-xl sm:text-2xl font-bold leading-snug text-white">
                            {lead.gap_hook}
                        </p>
                    </div>
                ) : inboundFallback && lead.readiness_score != null ? (
                    <div className="mt-3">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300/90">
                            <Sparkles className="w-3.5 h-3.5" /> They came to us
                        </div>
                        <p className="mt-1 text-lg sm:text-xl font-bold leading-snug text-white">
                            Ran our checker · scored {lead.readiness_score}/100 readiness — open their results (Assets) and talk to it.
                        </p>
                    </div>
                ) : null}

                {/* 3 + 4 — the SAM hook + the single best live match, side by side on sm+ */}
                {(samLine || bestMatch) && (
                    <div className="mt-3 flex flex-wrap items-stretch gap-2">
                        {samLine && (
                            <span className={clsx(
                                "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-bold",
                                samTone,
                            )}>
                                <SamIcon className="w-4 h-4 shrink-0" /> {samLine}
                            </span>
                        )}
                        {bestMatch && (
                            <span className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-1.5 text-sm max-w-full">
                                <Trophy className="w-4 h-4 shrink-0 text-orange-300" />
                                <span className="min-w-0 truncate font-medium text-white" title={bestMatch.title}>
                                    {bestMatch.title}
                                </span>
                                {bestMatch.agency && (
                                    <span className="hidden sm:inline shrink-0 text-white/60">· {bestMatch.agency}</span>
                                )}
                                <span className="shrink-0 font-black text-orange-300">{bestMatch.score_pct}%</span>
                            </span>
                        )}
                    </div>
                )}

                {/* 5 — findings_summary, quiet secondary line */}
                {lead.findings_summary && (
                    <p className="mt-3 text-sm leading-relaxed text-stone-300 border-t border-white/10 pt-3">
                        {lead.findings_summary}
                    </p>
                )}
            </div>
        </div>
    );
}

/** The single best live match for the hero — highest score, with a real title. */
function pickBestMatch(lead: Lead): LeadTopMatch | null {
    const matches = Array.isArray(lead.top_matches) ? lead.top_matches : [];
    if (!matches.length) return null;
    return matches.reduce((best, m) => (m.score_pct > best.score_pct ? m : best), matches[0]);
}

// ── Contact block ────────────────────────────────────────────────────────────────
function ContactCard({ lead, onStartCall }: { lead: Lead; onStartCall: () => void }) {
    const trackRecord = Array.isArray(lead.track_record) ? lead.track_record : [];
    return (
        <Card>
            <SectionHeading icon={User} title="Who you're talking to" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <Field label="Contact" value={toTitleCaseCompany(lead.contact.name) || "Name not on file"} />
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
                        <a
                            href={telHref(lead.contact.phone)}
                            onClick={onStartCall}
                            className="text-blue-700 hover:underline inline-flex items-center gap-1.5 mt-0.5"
                            title={`Call ${lead.contact.phone} — dials your phone and opens the notepad`}
                        >
                            <Phone className="w-3.5 h-3.5" /> {lead.contact.phone}
                        </a>
                    ) : lead.booking_url ? (
                        <a
                            href={lead.booking_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-violet-700 hover:underline inline-flex items-center gap-1.5 mt-0.5"
                            title="No phone on file — they take meetings via this scheduler"
                        >
                            <CalendarClock className="w-3.5 h-3.5" /> Book a meeting <ExternalLink className="w-3 h-3" />
                        </a>
                    ) : (
                        <span className="text-stone-400 mt-0.5 block">No phone on file</span>
                    )}
                </div>
                <div>
                    <FieldLabel>Website</FieldLabel>
                    {lead.derived_website ? (
                        <>
                            <a
                                href={normalizeWebsiteHref(lead.derived_website)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-700 hover:underline inline-flex items-center gap-1.5 break-all mt-0.5"
                                title={lead.derived_website_source === "email" ? "Derived from their email domain — verify before sharing" : undefined}
                            >
                                <Globe className="w-3.5 h-3.5 shrink-0" />
                                {lead.derived_website.replace(/^https?:\/\//i, "")} <ExternalLink className="w-3 h-3" />
                            </a>
                            {lead.derived_website_source === "email" && (
                                <span className="block text-[11px] text-stone-400 mt-0.5">likely site (from email)</span>
                            )}
                        </>
                    ) : (
                        <span className="text-amber-700 inline-flex items-center gap-1.5 mt-0.5">
                            <AlertTriangle className="w-3.5 h-3.5" /> No website found
                        </span>
                    )}
                </div>
                {lead.legal_name && lead.legal_name !== lead.company_name && (
                    <Field label="Legal name" value={lead.legal_name} />
                )}
                {/* Owner LinkedIn + Company LinkedIn — SEPARATE rows; owner shows "not found" when null. */}
                <div>
                    <FieldLabel>Owner / POC LinkedIn</FieldLabel>
                    {lead.owner_linkedin ? (
                        <a href={lead.owner_linkedin} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline inline-flex items-center gap-1.5 mt-0.5">
                            <Linkedin className="w-3.5 h-3.5" /> Owner profile <ExternalLink className="w-3 h-3 text-stone-400" />
                        </a>
                    ) : (
                        <span className="text-stone-400 inline-flex items-center gap-1.5 mt-0.5 text-xs">
                            <Info className="w-3.5 h-3.5 shrink-0" /> not found
                        </span>
                    )}
                </div>
                <div>
                    <FieldLabel>Company LinkedIn</FieldLabel>
                    {lead.company_linkedin ? (
                        <a href={lead.company_linkedin} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline inline-flex items-center gap-1.5 mt-0.5">
                            <Linkedin className="w-3.5 h-3.5" /> Company page <ExternalLink className="w-3 h-3 text-stone-400" />
                        </a>
                    ) : (
                        <span className="text-stone-400 inline-flex items-center gap-1.5 mt-0.5 text-xs">
                            <Info className="w-3.5 h-3.5 shrink-0" /> not found
                        </span>
                    )}
                </div>
            </div>

            {/* Certs + track-record chips */}
            {(lead.sba_certifications.length > 0 || lead.certifications.length > 0 || trackRecord.length > 0) && (
                <div className="flex flex-wrap gap-2 mt-4">
                    {[...lead.sba_certifications, ...lead.certifications].slice(0, 6).map((c, i) => (
                        <CertBadge key={`cert-${c}-${i}`} code={c} />
                    ))}
                    {trackRecord.slice(0, 4).map((t, i) => (
                        <Pill key={`tr-${i}`} icon={Trophy}>{t}</Pill>
                    ))}
                </div>
            )}
        </Card>
    );
}

// ── Firmographics ──────────────────────────────────────────────────────────────
function FirmographicsCard({ lead }: { lead: Lead }) {
    const revenue = compactCurrency(lead.total_federal_revenue);
    const estRevenue = compactCurrency(lead.estimated_revenue);
    const isContractor = lead.source === "contractors";
    return (
        <Card>
            <SectionHeading icon={Building2} title="Firmographics" />
            {/* SAM registration — prominent, the expiring-soon filter's payoff. */}
            {isContractor && <SamRegistrationBlock lead={lead} />}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <Stat icon={UsersIcon} label="Employees" value={lead.employee_count != null && lead.employee_count > 0 ? String(lead.employee_count) : "Unknown"} />
                <Stat icon={Building2} label="Years in business" value={lead.years_in_business != null && lead.years_in_business > 0 ? String(lead.years_in_business) : "Unknown"} />
                <Stat icon={Trophy} label="Federal awards" value={lead.total_federal_awards != null ? String(lead.total_federal_awards) : (lead.federal_awards_count != null ? String(lead.federal_awards_count) : "Unknown")} />
                {isContractor && <Stat icon={DollarSign} label="Federal revenue" value={revenue || "Unknown"} />}
                {/* Only show Est. revenue when it's a DIFFERENT figure — both fields
                    fall back to total award volume, so they were showing the same
                    number twice. */}
                {estRevenue && lead.estimated_revenue !== lead.total_federal_revenue && (
                    <Stat icon={DollarSign} label="Est. revenue" value={estRevenue} />
                )}
            </div>
        </Card>
    );
}

// ── SAM registration block — the headline of the firmographics card ──────────────
//
// Status badge (green Active / red Lapsed/Inactive / amber Expiring), the
// "on SAM since {year} · {N} years" tenure line, and the expiry countdown with an
// amber/red treatment when expiring-soon or lapsed. This is what the
// expiring-soon FILTER pays off into — so it leads the card, not buried in a tile.
function SamRegistrationBlock({ lead }: { lead: Lead }) {
    const v = samView(lead);

    // No SAM signal at all — keep it honest, one quiet line.
    if (v.state === "unknown") {
        return (
            <div className="mb-3 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 flex items-center gap-2 text-sm text-stone-500">
                <BadgeCheck className="w-4 h-4 text-stone-300 shrink-0" />
                <span>SAM registration unknown — run Research &amp; fill gaps.</span>
            </div>
        );
    }

    const lapsed = v.state === "lapsed";
    const expiring = v.state === "expiring";

    const frame = lapsed
        ? "border-rose-300 bg-rose-50"
        : expiring
            ? "border-amber-300 bg-amber-50"
            : "border-emerald-300 bg-emerald-50";
    const badge = lapsed
        ? "bg-rose-600 text-white"
        : expiring
            ? "bg-amber-500 text-white"
            : "bg-emerald-600 text-white";
    const BadgeI = lapsed ? AlertTriangle : BadgeCheck;
    const badgeText = lapsed
        ? (v.statusText && v.statusText.toLowerCase() !== "active" ? v.statusText : "Lapsed")
        : (v.statusText || "Active");

    // Expiry line tone: red when lapsed, amber when expiring, neutral otherwise.
    const expiryTone = lapsed ? "text-rose-700" : expiring ? "text-amber-800" : "text-stone-600";
    const days = v.daysToExpiry;
    const expiryDays =
        days == null ? null
        : days < 0 ? `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`
        : `${days} day${days === 1 ? "" : "s"}`;

    return (
        <div className={clsx("mb-3 rounded-xl border p-3", frame)}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-stone-500 inline-flex items-center gap-1.5">
                        <BadgeCheck className="w-3.5 h-3.5" /> SAM registration
                    </span>
                    <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-black", badge)}>
                        <BadgeI className="w-3 h-3" /> {badgeText}
                    </span>
                </div>
                {/* Tenure: "on SAM since 2019 · 7 yrs" */}
                {v.sinceYear && (
                    <span className="text-xs text-stone-600 inline-flex items-center gap-1.5">
                        <CalendarClock className="w-3.5 h-3.5 text-stone-400" />
                        On SAM since <span className="font-bold text-stone-800">{v.sinceYear}</span>
                        {v.sinceYears != null && v.sinceYears > 0 && (
                            <span className="text-stone-400">· {v.sinceYears} yr{v.sinceYears === 1 ? "" : "s"}</span>
                        )}
                    </span>
                )}
            </div>
            {/* Expiry countdown — the payoff for the expiring-soon filter. */}
            {(v.expirationLabel || expiryDays) && (
                <p className={clsx("mt-2 text-sm font-bold inline-flex items-center gap-1.5", expiryTone)}>
                    <CalendarClock className="w-4 h-4 shrink-0" />
                    {lapsed ? (
                        <>Expired {v.expirationLabel || ""}{expiryDays ? ` · ${expiryDays}` : ""} — reactivate to bid</>
                    ) : (
                        <>Expires {v.expirationLabel || "soon"}{expiryDays ? ` · ${expiryDays}` : ""}</>
                    )}
                </p>
            )}
            {expiring && (
                <p className="mt-1.5 text-xs text-amber-700">
                    Within 90 days — a natural reason to reach out.
                </p>
            )}
        </div>
    );
}

// ── ICP-fit breakdown ──────────────────────────────────────────────────────────
function IcpBreakdownCard({ lead }: { lead: Lead }) {
    if (!Array.isArray(lead.icp_breakdown) || lead.icp_breakdown.length === 0) return null;
    return (
        <Card>
            <SectionHeading icon={Target} title="Why they're a fit (each factor)" />
            <div className="space-y-2.5">
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
    );
}

// ── Past federal awards ─────────────────────────────────────────────────────────
function PastAwardsCard({ lead }: { lead: Lead }) {
    const pa = lead.past_awards;
    const la = lead.last_award;
    // total_count / total_volume fall back to the surfaced firmographic columns so the
    // card still renders for rows where past_awards wasn't populated but the totals were.
    // awards_count (live FPDS count) wins over the stored firmographic count when present.
    const totalCount = lead.awards_count ?? pa?.total_count ?? lead.total_federal_awards ?? lead.federal_awards_count ?? null;
    const totalVolume = pa?.total_volume ?? lead.total_federal_revenue ?? null;
    const lastAwardDate = la?.date ?? pa?.last_award_date ?? null;
    const hasAny = (totalCount != null && totalCount > 0) || (totalVolume != null && totalVolume > 0) || !!lastAwardDate || !!la;
    if (!hasAny) return null;
    return (
        <Card>
            <SectionHeading icon={Trophy} title="Past federal awards" />
            <div className="grid grid-cols-3 gap-2.5">
                <Stat icon={Award} label="Total awards" value={totalCount != null && totalCount > 0 ? String(totalCount) : "—"} />
                <Stat icon={DollarSign} label="Federal revenue" value={compactCurrency(totalVolume) || "—"} />
                <Stat icon={CalendarClock} label="Last award" value={lastAwardDate ? formatDeadline(lastAwardDate) : "—"} />
            </div>

            {/* Most-recent award detail (FPDS) — the "I saw your recent win" opener. */}
            {la && (la.agency || la.amount != null || la.description) && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                            <FieldLabel className="inline-flex items-center gap-1.5"><Trophy className="w-3 h-3" /> Most recent award</FieldLabel>
                            <p className="text-sm text-stone-800 mt-1 font-medium">
                                {la.agency || "Federal agency"}
                                {la.amount != null && <span className="text-stone-500 font-normal"> · {compactCurrency(la.amount)}</span>}
                                {la.date && <span className="text-stone-500 font-normal"> · {formatDeadline(la.date)}</span>}
                            </p>
                            {la.description && <p className="text-xs text-stone-600 mt-1 leading-relaxed">{la.description}</p>}
                            {la.piid && <p className="text-[11px] text-stone-400 mt-1">PIID {la.piid}</p>}
                        </div>
                        {la.url && (
                            <a
                                href={la.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="shrink-0 inline-flex items-center gap-1.5 border border-stone-200 hover:border-stone-300 hover:bg-white text-stone-700 font-medium px-2.5 py-1.5 rounded-lg text-xs"
                                title="Open this award on USASpending.gov"
                            >
                                <ExternalLink className="w-3.5 h-3.5 text-stone-400" /> USASpending
                            </a>
                        )}
                    </div>
                </div>
            )}
        </Card>
    );
}

// ── USASpending revenue streams ───────────────────────────────────────────────
/** One labeled bar row in a revenue-stream list (relative-width bar by $). */
function RevenueBar({ label, sublabel, amount, max }: {
    label: string; sublabel?: string | null; amount: number | null; max: number;
}) {
    const pct = amount != null && amount > 0 && max > 0 ? Math.max(4, Math.round((amount / max) * 100)) : 0;
    return (
        <div>
            <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-stone-700 text-sm truncate" title={label}>{label}</span>
                <span className="text-xs font-bold text-stone-500 shrink-0">{compactCurrency(amount) || "—"}</span>
            </div>
            {sublabel && <p className="text-[11px] text-stone-400 truncate" title={sublabel}>{sublabel}</p>}
            <div className="h-2 rounded-full bg-stone-100 overflow-hidden mt-1">
                <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

function RevenueStreamsCard({ lead }: { lead: Lead }) {
    const agencies = lead.past_awards?.top_agencies ?? [];
    const naics = lead.past_awards?.top_naics ?? [];
    if (agencies.length === 0 && naics.length === 0) return null;
    const maxAgency = Math.max(1, ...agencies.map((a) => a.amount ?? 0));
    const maxNaics = Math.max(1, ...naics.map((n) => n.amount ?? 0));
    return (
        <Card>
            <SectionHeading icon={DollarSign} title="Revenue streams (USASpending)" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                {agencies.length > 0 && (
                    <div>
                        <FieldLabel className="mb-2">Top agencies</FieldLabel>
                        <div className="space-y-2.5">
                            {agencies.map((a, i) => (
                                <RevenueBar key={`${a.name}-${i}`} label={a.name} amount={a.amount} max={maxAgency} />
                            ))}
                        </div>
                    </div>
                )}
                {naics.length > 0 && (
                    <div>
                        <FieldLabel className="mb-2">Top NAICS</FieldLabel>
                        <div className="space-y-2.5">
                            {naics.map((n, i) => (
                                <RevenueBar key={`${n.code}-${i}`} label={n.label || n.code} sublabel={n.label ? n.code : null} amount={n.amount} max={maxNaics} />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </Card>
    );
}

// ── "Research & fill the gaps" — top-bar BUTTON (enrich also researches) ──────────
// Moved out of the bottom card per founder feedback: it now lives in the Company
// tab top action bar. Result shows as a transient popover under the button; the
// persisted research panel renders in the left column once the detail re-fetches.
function ResearchButton({ lead, onRefresh, refreshing }: { lead: Lead; onRefresh: () => void; refreshing: boolean }) {
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

    useEffect(() => { setResult(null); }, [lead.id]);

    const run = async () => {
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
            const u = (data.updated || {}) as {
                employee_count?: number; years_in_business?: number; owner_linkedin?: string;
                company_linkedin?: string; phone?: string; poc_email?: string;
                phones?: string[]; emails?: string[]; track_record?: string[]; legal_name?: string;
            };
            const r = (data.research || null) as { rating?: number | null } | null;

            const found: string[] = [];
            if (u.owner_linkedin) found.push("owner LinkedIn");
            if (u.company_linkedin) found.push("company LinkedIn");
            if (u.phone) found.push(`phone ${u.phone}`);
            else if (u.phones?.length) found.push(`${u.phones.length} phone${u.phones.length > 1 ? "s" : ""}`);
            if (u.poc_email) found.push("email");
            if (u.employee_count != null) found.push(`${u.employee_count} employees`);
            if (u.years_in_business != null) found.push(`${u.years_in_business} yrs in business`);
            if (u.legal_name) found.push(`legal name "${u.legal_name}"`);
            if (u.track_record?.length) found.push(`${u.track_record.length} track-record stat${u.track_record.length > 1 ? "s" : ""}`);
            if (r?.rating != null) found.push(`${r.rating}★ rating`);
            setResult({ ok: true, message: found.length ? `Found ${found.join(", ")}.` : "Checked — nothing new to add." });
            // Patch the queue row + detail in place via the detail re-fetch (surfaces
            // the research panel + filled gaps; vanishing-lead fix).
            onRefresh();
            setTimeout(() => setResult(null), 6000);
        } catch (e) {
            setResult({ ok: false, message: e instanceof Error ? e.message : "Research failed" });
            setTimeout(() => setResult(null), 6000);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="relative">
            <button
                type="button"
                onClick={run}
                disabled={busy}
                title="Deep-crawl their site + look up the owner's LinkedIn, firmographics and reviews"
                className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold px-3.5 py-2 rounded-lg text-sm"
            >
                {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Researching…</> : <><Wand2 className="w-4 h-4" /> {lead.research ? "Re-run research" : "Research & fill gaps"}</>}
            </button>
            {result && (
                <div className={clsx(
                    "absolute left-0 top-full mt-2 z-10 w-72 rounded-xl p-3 text-xs flex items-start gap-2 shadow-lg border",
                    result.ok ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rose-50 border-rose-200 text-rose-700",
                )}>
                    {result.ok ? (refreshing ? <Loader2 className="w-3.5 h-3.5 shrink-0 mt-0.5 animate-spin" /> : <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" />) : <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                    <span className="font-medium">{result.message}</span>
                </div>
            )}
        </div>
    );
}

// ── "Re-run match" ─────────────────────────────────────────────────────────────
function RerunCard({ lead }: { lead: Lead }) {
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
        <Card>
            <SectionHeading icon={RotateCcw} title="Matches out of date?" noMargin />
            <div className="mt-3 flex flex-wrap items-center gap-3">
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
        </Card>
    );
}

// ───────────────────────── TAB: Matches (foldable cards) ─────────────────────────

function MatchesTab({ lead }: { lead: Lead }) {
    if (lead.top_matches.length === 0) {
        // Inbound robustness: no top_matches → readiness/preview fallback, never a wall.
        return (
            <Card>
                <SectionHeading icon={Trophy} title="Live opportunities that fit them now" />
                {lead.source === "inbound" && lead.readiness_score != null ? (
                    <p className="text-sm text-stone-500">
                        No preview matches captured for this inbound lead. Their checker readiness score was{" "}
                        <span className="font-bold text-stone-700">{lead.readiness_score}/100</span> — open their results page on the Assets tab.
                    </p>
                ) : (
                    <p className="text-sm text-stone-500">
                        No live matches captured yet. Lead the conversation with the website gap in the Company briefing instead.
                    </p>
                )}
            </Card>
        );
    }
    return (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
            {lead.top_matches.map((m, i) => (
                <MatchCard key={`${m.opp_id ?? "m"}-${i}`} match={m} />
            ))}
        </div>
    );
}

function MatchCard({ match }: { match: LeadTopMatch }) {
    // Folded OUT by default — the match detail (why it fits, keywords, links) is
    // the most demo-worthy part of the cockpit, so lead with it expanded.
    const [open, setOpen] = useState(true);
    // Use the FIXED canonical link (opportunities.link, joined by notice_id) — never
    // a constructed sam.gov/opp/<id> URL (the 404 bug). Null → "link unavailable".
    const realLink = match.real_link ?? null;
    const value = compactCurrency(match.value);
    const why = Array.isArray(match.why) ? match.why : [];
    const keywords = Array.isArray(match.keywords) ? match.keywords : [];
    const setAsideInfo = match.set_aside ? certInfo(match.set_aside) : null;
    return (
        <div className="border border-stone-200 rounded-xl overflow-hidden bg-white">
            {/* Collapsed header — title + agency + fit % */}
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="w-full text-left px-4 py-3 hover:bg-stone-50 transition-colors flex items-start gap-3"
            >
                <ChevronRight className={clsx("w-4 h-4 shrink-0 mt-0.5 text-stone-400 transition-transform", open && "rotate-90")} />
                <div className="min-w-0 flex-1">
                    <span className="font-bold text-stone-800 block">{match.title}</span>
                    {match.agency && (
                        <span className="text-xs text-stone-500 inline-flex items-center gap-1 mt-0.5">
                            <Building2 className="w-3.5 h-3.5" /> {match.agency}
                        </span>
                    )}
                </div>
                <span className="shrink-0 text-xs font-black bg-blue-50 text-blue-700 border border-blue-200 rounded-lg px-2 py-1">
                    {match.score_pct}% fit
                </span>
            </button>

            {/* Expanded body */}
            {open && (
                <div className="px-4 pb-4 pt-1 border-t border-stone-100 space-y-3">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-stone-600 pt-3">
                        {match.deadline && <span className="inline-flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5 text-stone-400" /> Due {formatDeadline(match.deadline)}</span>}
                        {match.naics && <span className="inline-flex items-center gap-1"><Package className="w-3.5 h-3.5 text-stone-400" /> NAICS {match.naics}</span>}
                        {match.set_aside && (
                            setAsideInfo ? (
                                <CertTooltip blurb={setAsideInfo.blurb}>
                                    <span className="inline-flex items-center gap-1 cursor-help"><BadgeCheck className="w-3.5 h-3.5 text-stone-400" /> {match.set_aside} <Info className="w-3 h-3 text-stone-300" /></span>
                                </CertTooltip>
                            ) : (
                                <span className="inline-flex items-center gap-1"><BadgeCheck className="w-3.5 h-3.5 text-stone-400" /> {match.set_aside}</span>
                            )
                        )}
                        {value && <span className="inline-flex items-center gap-1"><DollarSign className="w-3.5 h-3.5 text-stone-400" /> {value}</span>}
                        {match.pwin != null && <span className="inline-flex items-center gap-1"><Target className="w-3.5 h-3.5 text-stone-400" /> {match.pwin}% pWin</span>}
                    </div>

                    {match.description && (
                        <div>
                            <FieldLabel>What it's for</FieldLabel>
                            <p className="text-sm text-stone-600 leading-relaxed mt-1">{match.description}</p>
                        </div>
                    )}

                    {keywords.length > 0 && (
                        <div>
                            <FieldLabel>Top keywords</FieldLabel>
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                                {keywords.slice(0, 8).map((k, i) => (
                                    <span key={`${k}-${i}`} className="inline-flex items-center text-[11px] font-medium bg-stone-100 text-stone-600 rounded-full px-2 py-0.5">{k}</span>
                                ))}
                            </div>
                        </div>
                    )}

                    {why.length > 0 && (
                        <div>
                            <FieldLabel>Why it's a good fit</FieldLabel>
                            <ul className="mt-1.5 space-y-1">
                                {why.map((w, i) => (
                                    <li key={i} className="text-sm text-stone-600 leading-relaxed flex items-start gap-1.5">
                                        <Check className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-500" /> {w}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {realLink ? (
                        <a
                            href={realLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 border border-stone-200 hover:border-stone-300 hover:bg-stone-50 text-stone-700 font-medium px-3 py-1.5 rounded-lg text-sm"
                        >
                            <ExternalLink className="w-3.5 h-3.5 text-stone-400" /> View opportunity
                        </a>
                    ) : (
                        <span className="inline-flex items-center gap-2 text-stone-400 text-sm" title="No canonical link on file for this notice">
                            <Info className="w-3.5 h-3.5" /> link unavailable
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}

// ───────────────────────── TAB: Keywords (contractors) ─────────────────────────

// Common English stop-words to drop when pulling candidate keywords from notes.
const KW_STOPWORDS = new Set([
    "the", "and", "for", "with", "that", "this", "they", "their", "them", "from", "have", "has",
    "was", "were", "are", "you", "your", "our", "can", "will", "would", "should", "could", "about",
    "into", "over", "under", "than", "then", "there", "here", "what", "when", "where", "which", "who",
    "how", "why", "not", "but", "all", "any", "out", "off", "via", "per", "also", "just", "like", "got",
    "get", "very", "much", "many", "some", "more", "most", "such", "been", "being", "does", "did", "doing",
    "him", "her", "his", "she", "its", "it's", "i'm", "we're", "they're", "call", "called", "said", "talk",
    "talked", "spoke", "left", "voicemail", "email", "phone", "going", "good", "great", "okay", "yeah",
]);

/**
 * Pull candidate keywords from free-text notes/transcript so the rep can one-click
 * add the ones that matter. Heuristic, deliberately simple:
 *   • capture multi-word phrases that look like services ("hvac maintenance")
 *   • single tokens ≥4 chars that aren't stop-words and aren't already keywords
 * Returns a deduped, lowercased list, longest/most-specific first, capped at 12.
 */
function extractCandidateKeywords(text: string, existing: string[]): string[] {
    const have = new Set(existing.map((k) => k.toLowerCase().trim()));
    const cleaned = text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ");
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    const candidates = new Set<string>();

    // 2-word phrases (e.g. "janitorial services", "cyber security").
    for (let i = 0; i < tokens.length - 1; i++) {
        const a = tokens[i], b = tokens[i + 1];
        if (a.length < 3 || b.length < 3) continue;
        if (KW_STOPWORDS.has(a) || KW_STOPWORDS.has(b)) continue;
        const phrase = `${a} ${b}`;
        if (!have.has(phrase)) candidates.add(phrase);
    }
    // Single meaningful tokens.
    for (const t of tokens) {
        if (t.length < 4 || KW_STOPWORDS.has(t)) continue;
        if (/^\d+$/.test(t)) continue;
        if (!have.has(t)) candidates.add(t);
    }
    return Array.from(candidates)
        .sort((a, b) => b.length - a.length)
        .slice(0, 12);
}

function KeywordsTab({ lead, notes, transcript, onPatchDetail }: {
    lead: Lead;
    notes: string;
    transcript: string;
    onPatchDetail: (partial: Partial<Lead>) => void;
}) {
    const [keywords, setKeywords] = useState<string[]>(lead.capability_keywords ?? []);
    const [input, setInput] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => { setKeywords(lead.capability_keywords ?? []); }, [lead.id, lead.capability_keywords]);

    // Candidate keywords from the shared notes + transcript scratch (filter out ones
    // we already have on the contractor).
    const candidates = useMemo(
        () => extractCandidateKeywords([notes, transcript].filter(Boolean).join(" "), keywords),
        [notes, transcript, keywords],
    );

    const persist = useCallback(async (add: string[], remove: string[]) => {
        setBusy(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/cockpit/keywords", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contractor_id: lead.id, add, remove }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.ok) throw new Error(data?.error || `Failed (${res.status})`);
            const next: string[] = Array.isArray(data.capability_keywords) ? data.capability_keywords : keywords;
            setKeywords(next);
            // Keep the detail (and queue row) in sync so a tab switch doesn't revert.
            onPatchDetail({ capability_keywords: next });
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save keywords");
        } finally {
            setBusy(false);
        }
    }, [lead.id, keywords, onPatchDetail]);

    const addKeyword = (raw: string) => {
        const k = raw.toLowerCase().trim();
        if (!k || keywords.includes(k)) { setInput(""); return; }
        persist([k], []);
        setInput("");
    };

    const removeKeyword = (k: string) => persist([], [k]);

    return (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
            <Card>
                <SectionHeading icon={Tag} title="Capability keywords" />
                <p className="text-sm text-stone-500 -mt-2 mb-3">
                    These drive reverse-matching — the words we match this firm against live opportunities. Add what you learn on calls; remove anything off-base.
                </p>

                {keywords.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                        {keywords.map((k) => (
                            <span key={k} className="inline-flex items-center gap-1.5 text-sm font-medium bg-stone-100 text-stone-700 rounded-lg pl-2.5 pr-1.5 py-1">
                                {k}
                                <button
                                    type="button"
                                    onClick={() => removeKeyword(k)}
                                    disabled={busy}
                                    aria-label={`Remove ${k}`}
                                    title={`Remove ${k}`}
                                    className="rounded-full hover:bg-stone-200 p-0.5 disabled:opacity-50"
                                >
                                    <X className="w-3 h-3 text-stone-500" />
                                </button>
                            </span>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-stone-400">No keywords yet — add a few below.</p>
                )}

                <form
                    onSubmit={(e) => { e.preventDefault(); addKeyword(input); }}
                    className="mt-4 flex items-center gap-2"
                >
                    <div className="relative flex-1">
                        <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="e.g. janitorial services"
                            className="w-full pl-9 pr-2 py-2 text-sm rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={busy || !input.trim()}
                        className="inline-flex items-center gap-1.5 bg-stone-900 hover:bg-black disabled:opacity-50 text-white font-bold px-3.5 py-2 rounded-lg text-sm"
                    >
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add
                    </button>
                </form>

                {error && <p className="mt-2 text-xs text-rose-600 inline-flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> {error}</p>}
            </Card>

            {/* Pull keywords from the call notes/transcript. */}
            <Card>
                <SectionHeading icon={Sparkles} title="Pull keywords from your notes" />
                <p className="text-sm text-stone-500 -mt-2 mb-3">
                    Candidates pulled from the Notes + transcript on the Company tab. Click one to add it as a capability keyword.
                </p>
                {candidates.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                        {candidates.map((c) => (
                            <button
                                key={c}
                                type="button"
                                onClick={() => addKeyword(c)}
                                disabled={busy}
                                className="inline-flex items-center gap-1.5 text-sm font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 rounded-lg px-2.5 py-1 disabled:opacity-50"
                            >
                                <Plus className="w-3.5 h-3.5" /> {c}
                            </button>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-stone-400">
                        Nothing to suggest yet. Jot call notes or paste a transcript on the Company tab and they&apos;ll show up here.
                    </p>
                )}
            </Card>
        </div>
    );
}

// ───────────────────────── TAB: Growth ─────────────────────────
interface GrowthRoadmap {
    data_gaps: { key: string; hook: string }[];
    cert_unlock: { cert: string; cert_label: string; unlocked_count: number; estimated_value: number; difficulty: string; timeline: string }[];
    adjacent_naics: { code: string; label: string; opp_count: number }[];
    geo_expansion: { total_potential_opps: number; suggestions: { state: string; opp_count: number }[]; summary: string };
    email_hook: string | null;
    computed_at: string;
}

function fmtUsdCompact(n: number | null | undefined): string {
    if (!n || !Number.isFinite(n)) return "";
    if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
    return `$${Math.round(n)}`;
}

const DIFFICULTY_STYLE: Record<string, string> = {
    easy: "bg-emerald-50 text-emerald-700 border-emerald-200",
    moderate: "bg-amber-50 text-amber-700 border-amber-200",
    complex: "bg-rose-50 text-rose-700 border-rose-200",
};

/**
 * Growth-gap roadmap for a contractor lead: data gaps we can fix + growth levers
 * with live-opportunity counts (cert-unlock, adjacent NAICS, geo expansion) +
 * a copyable email hook. Lazy-fetches /api/admin/cockpit/growth on open.
 */
function GrowthTab({ lead, onInsertHook }: { lead: Lead; onInsertHook: (line: string) => void }) {
    const [roadmap, setRoadmap] = useState<GrowthRoadmap | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [copied, setCopied] = useState(false);

    const load = useCallback(async (refresh: boolean) => {
        if (refresh) setRefreshing(true); else setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({ contractor_id: lead.id });
            if (refresh) params.set("refresh", "1");
            const res = await fetch(`/api/admin/cockpit/growth?${params}`);
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.ok) throw new Error(data?.error || `Failed (${res.status})`);
            setRoadmap(data.roadmap as GrowthRoadmap);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not build the roadmap");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [lead.id]);

    useEffect(() => { void load(false); }, [load]);

    const copyHook = async () => {
        if (!roadmap?.email_hook) return;
        try {
            await navigator.clipboard.writeText(roadmap.email_hook);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
        } catch { /* clipboard may be blocked */ }
    };

    if (loading) {
        return (
            <div className="py-16 text-center text-stone-400">
                <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                <p className="text-sm mt-2">Building their growth roadmap…</p>
            </div>
        );
    }
    if (error) {
        return (
            <Card>
                <p className="text-sm text-rose-600 inline-flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> {error}</p>
                <button type="button" onClick={() => load(false)} className="mt-2 text-xs underline text-stone-500 hover:text-black">Try again</button>
            </Card>
        );
    }
    if (!roadmap) return null;

    const hasLevers = roadmap.cert_unlock.length > 0 || roadmap.adjacent_naics.length > 0 || roadmap.geo_expansion.total_potential_opps > 0;

    return (
        <div className="space-y-4">
            {/* Email hook — the sharpest single line. */}
            {roadmap.email_hook && (
                <Card>
                    <SectionHeading icon={Sparkles} title="The hook" />
                    <p className="text-sm text-stone-700 leading-relaxed">{roadmap.email_hook}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => onInsertHook(roadmap.email_hook!)} className="inline-flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white font-bold px-3 py-2 rounded-lg text-sm">
                            <Plus className="w-4 h-4" /> Insert into email
                        </button>
                        <button type="button" onClick={copyHook} className="inline-flex items-center gap-2 bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 font-bold px-3 py-2 rounded-lg text-sm">
                            {copied ? <><Check className="w-4 h-4 text-emerald-600" /> Copied</> : <><Copy className="w-4 h-4" /> Copy</>}
                        </button>
                    </div>
                </Card>
            )}

            {/* Layer 2 — growth levers with live counts. */}
            <Card>
                <div className="flex items-center justify-between">
                    <SectionHeading icon={TrendingUp} title="Growth levers" />
                    <button type="button" onClick={() => load(true)} disabled={refreshing} className="text-xs text-stone-500 hover:text-black inline-flex items-center gap-1 disabled:opacity-50">
                        {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Refresh
                    </button>
                </div>
                <p className="text-[11px] text-stone-400 -mt-1 mb-3">Live-opportunity counts are approximate (a directional floor), not a quote.</p>

                {!hasLevers ? (
                    <p className="text-sm text-stone-400">No clear growth levers from the current opportunity set for their NAICS.</p>
                ) : (
                    <div className="space-y-4">
                        {/* Cert-unlock */}
                        {roadmap.cert_unlock.length > 0 && (
                            <div>
                                <FieldLabel>Certifications that would unlock more</FieldLabel>
                                <ul className="mt-2 space-y-2">
                                    {roadmap.cert_unlock.map((rec) => (
                                        <li key={rec.cert} className="border border-stone-200 rounded-xl p-3">
                                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                                <span className="font-bold text-stone-800 text-sm">{rec.cert_label}</span>
                                                <span className={clsx("text-[10px] font-bold uppercase tracking-wide border rounded px-1.5 py-0.5", DIFFICULTY_STYLE[rec.difficulty] || "bg-stone-100 text-stone-500 border-stone-200")}>
                                                    {rec.difficulty} · {rec.timeline}
                                                </span>
                                            </div>
                                            <p className="text-sm text-stone-600 mt-1">
                                                ≈ <span className="font-bold text-stone-900">{rec.unlocked_count.toLocaleString()}</span> live set-aside opps in their lane
                                                {rec.estimated_value > 0 && <> · ~{fmtUsdCompact(rec.estimated_value)} in value</>}
                                            </p>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Adjacent NAICS */}
                        {roadmap.adjacent_naics.length > 0 && (
                            <div>
                                <FieldLabel>Adjacent work they&apos;re not capturing</FieldLabel>
                                <ul className="mt-2 space-y-1.5">
                                    {roadmap.adjacent_naics.map((a) => (
                                        <li key={a.code} className="flex items-center justify-between gap-2 text-sm border border-stone-200 rounded-lg px-3 py-2">
                                            <span className="text-stone-700 min-w-0 truncate"><span className="font-mono text-xs text-stone-500">{a.code}</span> {a.label}</span>
                                            <span className="text-stone-500 shrink-0">≈ {a.opp_count.toLocaleString()} opps</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Geo expansion */}
                        {roadmap.geo_expansion.total_potential_opps > 0 && (
                            <div>
                                <FieldLabel>States worth expanding into</FieldLabel>
                                {roadmap.geo_expansion.summary && <p className="text-xs text-stone-500 mt-1">{roadmap.geo_expansion.summary}</p>}
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                    {roadmap.geo_expansion.suggestions.slice(0, 6).map((s) => (
                                        <span key={s.state} className="inline-flex items-center gap-1 bg-stone-100 border border-stone-200 rounded-lg px-2 py-1 text-xs text-stone-700">
                                            <MapPin className="w-3 h-3 text-stone-400" /> {s.state} · {s.opp_count.toLocaleString()}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </Card>

            {/* Layer 1 — data gaps checklist. */}
            <Card>
                <SectionHeading icon={ClipboardList} title="Gaps we can fix" />
                {roadmap.data_gaps.length === 0 ? (
                    <p className="text-sm text-stone-400">No obvious data gaps — their profile is in decent shape.</p>
                ) : (
                    <ul className="space-y-2">
                        {roadmap.data_gaps.map((g) => (
                            <li key={g.key} className="flex items-start gap-2 text-sm text-stone-700">
                                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                <span className="leading-snug">{g.hook}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </Card>
        </div>
    );
}

// ───────────────────────── TAB: Assets ─────────────────────────

function AssetsTab({ lead, onRefresh, onInsertLink, onAttach }: {
    lead: Lead;
    onRefresh: () => void;
    onInsertLink: (title: string, url: string) => void;
    onAttach: (title: string, url: string) => void;
}) {
    const isContractor = lead.source === "contractors";
    return (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
            {/* CapturePilot resource library — best-fit collateral to attach to outreach. */}
            <div className="xl:col-span-2">
                <AssetsLibraryCard lead={lead} onInsertLink={onInsertLink} onAttach={onAttach} />
            </div>
            {isContractor && <WebsiteAction lead={lead} onRefresh={onRefresh} highlight={lead.has_website === false} />}
            {isContractor && <CapStatementCard lead={lead} />}
            {isContractor && <MaterializeCheckCard lead={lead} />}
            {lead.source === "inbound" && lead.check_page_url && <CheckPageCard url={lead.check_page_url} />}
            {!isContractor && (
                <Card>
                    <p className="text-sm text-stone-500">
                        Asset generation (one-pager, capability statement) is available for firms in our database.
                        This is an inbound website lead — use the Company and Matches tabs.
                    </p>
                </Card>
            )}
        </div>
    );
}

// ── CapturePilot resource library (admin-curated assets) ─────────────────────────
interface CockpitAsset {
    id: string;
    title: string;
    url: string;
    kind: string;
    description: string | null;
    tags: string[];
    naics: string[];
    is_active: boolean;
    fit_score?: number;
}

const ASSET_KIND_LABEL: Record<string, string> = {
    whitepaper: "Whitepaper",
    lead_magnet: "Lead magnet",
    guide: "Guide",
    template: "Template",
};

/**
 * Best-fit CapturePilot resources for this lead. Builds the targeting signal from
 * the lead's NAICS (match NAICS + top-revenue NAICS) and keywords (gaps + certs),
 * hits GET /api/admin/cockpit/assets, and lists the assets with a one-click copy
 * of the share URL so the rep can drop it into the email composer.
 */
function AssetsLibraryCard({ lead, onInsertLink, onAttach }: {
    lead: Lead;
    onInsertLink: (title: string, url: string) => void;
    onAttach: (title: string, url: string) => void;
}) {
    const [assets, setAssets] = useState<CockpitAsset[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [actedId, setActedId] = useState<string | null>(null);
    const flash = (id: string) => { setActedId(id); setTimeout(() => setActedId(p => (p === id ? null : p)), 1600); };

    // Targeting signal — memoized so we don't refetch on unrelated re-renders.
    const { naics, keywords } = useMemo(() => {
        const naicsSet = new Set<string>();
        for (const m of lead.top_matches) if (m.naics) naicsSet.add(String(m.naics));
        for (const n of lead.past_awards?.top_naics ?? []) if (n.code) naicsSet.add(String(n.code));
        if (lead.last_award?.naics) naicsSet.add(String(lead.last_award.naics));
        const kw = new Set<string>();
        for (const c of [...lead.sba_certifications, ...lead.certifications]) {
            const t = c.toLowerCase();
            if (/8\(a\)|\b8a\b/.test(t)) kw.add("8a");
            if (/hubzone/.test(t)) kw.add("hubzone");
            if (/wosb|women.?owned/.test(t)) kw.add("wosb");
            if (/sdvosb|vosb|veteran|service.?disabled/.test(t)) kw.add("sdvosb");
        }
        for (const g of lead.gaps ?? []) {
            const t = g.toLowerCase();
            if (/cap.?statement|capability/.test(t)) kw.add("capability-statement");
            if (/sam|registration/.test(t)) kw.add("sam");
            if (/website|site/.test(t)) kw.add("website");
        }
        return { naics: Array.from(naicsSet), keywords: Array.from(kw) };
    }, [lead.top_matches, lead.past_awards, lead.last_award, lead.sba_certifications, lead.certifications, lead.gaps]);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        setError(null);
        const params = new URLSearchParams();
        if (keywords.length) params.set("keywords", keywords.join(","));
        if (naics.length) params.set("naics", naics.join(","));
        fetch(`/api/admin/cockpit/assets?${params}`)
            .then(async (r) => {
                const d = await r.json();
                if (!r.ok) throw new Error(d?.error || `Failed (${r.status})`);
                return d;
            })
            .then((d) => { if (alive) setAssets(Array.isArray(d.assets) ? d.assets : []); })
            .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "Could not load resources"); })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [keywords, naics]);

    const copyUrl = async (a: CockpitAsset) => {
        try {
            await navigator.clipboard.writeText(a.url);
            setCopiedId(a.id);
            setTimeout(() => setCopiedId((id) => (id === a.id ? null : id)), 1800);
        } catch { /* clipboard may be blocked */ }
    };

    return (
        <Card>
            <SectionHeading icon={Package} title="Resources to send them" />
            <p className="text-sm text-stone-500 -mt-2 mb-3">
                CapturePilot guides, templates and lead magnets — ranked by fit. Insert a link into your draft, attach the file to the email, or copy the URL.
            </p>
            {loading ? (
                <div className="py-6 text-center text-stone-400">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                </div>
            ) : error ? (
                <p className="text-sm text-rose-600 inline-flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> {error}</p>
            ) : assets.length === 0 ? (
                <p className="text-sm text-stone-400">No resources in the library yet.</p>
            ) : (
                <ul className="space-y-2">
                    {assets.map((a) => (
                        <li key={a.id} className="border border-stone-200 rounded-xl p-3 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-stone-800 text-sm">{a.title}</span>
                                    <span className="text-[10px] font-bold uppercase tracking-wide bg-stone-100 text-stone-500 rounded px-1.5 py-0.5">
                                        {ASSET_KIND_LABEL[a.kind] || a.kind}
                                    </span>
                                    {a.fit_score != null && a.fit_score > 0 && (
                                        <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded px-1.5 py-0.5 inline-flex items-center gap-1">
                                            <Sparkles className="w-3 h-3" /> Best fit
                                        </span>
                                    )}
                                </div>
                                {a.description && <p className="text-xs text-stone-500 mt-1 leading-relaxed">{a.description}</p>}
                            </div>
                            <div className="shrink-0 flex flex-wrap items-center justify-end gap-1.5 max-w-[230px]">
                                <button
                                    type="button"
                                    onClick={() => { onInsertLink(a.title, a.url); flash(a.id); }}
                                    title="Insert this link into the email draft"
                                    className="inline-flex items-center gap-1 bg-orange-600 hover:bg-orange-700 text-white font-bold px-2.5 py-1.5 rounded-lg text-xs"
                                >
                                    {actedId === a.id ? <><Check className="w-3.5 h-3.5" /> Added</> : <><Plus className="w-3.5 h-3.5" /> Insert link</>}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { onAttach(a.title, a.url); flash(a.id); }}
                                    title="Attach this file to the email"
                                    className="inline-flex items-center gap-1 border border-stone-200 hover:border-stone-300 hover:bg-stone-50 text-stone-600 font-medium px-2.5 py-1.5 rounded-lg text-xs"
                                >
                                    <FileText className="w-3.5 h-3.5" /> Attach
                                </button>
                                <button
                                    type="button"
                                    onClick={() => copyUrl(a)}
                                    title="Copy share link"
                                    className="inline-flex items-center gap-1 border border-stone-200 hover:border-stone-300 hover:bg-stone-50 text-stone-600 font-medium px-2.5 py-1.5 rounded-lg text-xs"
                                >
                                    {copiedId === a.id ? <><Check className="w-3.5 h-3.5 text-emerald-600" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                                </button>
                                <a
                                    href={a.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Open resource"
                                    className="inline-flex items-center gap-1 border border-stone-200 hover:border-stone-300 hover:bg-stone-50 text-stone-600 font-medium px-2.5 py-1.5 rounded-lg text-xs"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
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
            <p className="text-sm text-stone-600 -mt-2 mb-3">
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
                        <span className="text-sm font-bold text-stone-700">{metadata?.company_name || toTitleCaseCompany(lead.company_name) || "Capability statement"}</span>
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

// ── Research result panel (shared — used inline on Company) ──────────────────────
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
                Generates a clean, shareable site (with their past performance + clients) from what we know. Takes about a minute or two.
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
            <p className="text-sm text-stone-600 -mt-2 mb-3">
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
            <p className="text-sm text-stone-600 -mt-2 mb-3">
                This lead ran our website checker. Open the exact page they saw so you can talk to it directly.
            </p>
            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 font-bold px-4 py-2 rounded-lg text-sm">
                <ExternalLink className="w-4 h-4" /> Open check page
            </a>
        </Card>
    );
}

// ───────────────────────── Outreach pieces (inline on Company) ─────────────────────────

// ── AI message generator ──────────────────────────────────────────────────────
type EmailTemplate =
    | "intro" | "award_congrats" | "short_nudge" | "deadline" | "helpful_resource"
    | "recompete" | "set_aside_edge" | "low_competition" | "expiring_sam";

const TEMPLATE_OPTIONS: { value: EmailTemplate; label: string; help: string }[] = [
    { value: "intro", label: "Intro", help: "First cold lead-in. Leads with the best live match." },
    { value: "award_congrats", label: "Award congrats", help: "Opens by congratulating a recent federal win." },
    { value: "short_nudge", label: "Short nudge", help: "A 3-sentence follow-up. They've heard from us before." },
    { value: "deadline", label: "Deadline", help: "Heads-up that one of their matches closes soon." },
    { value: "helpful_resource", label: "Helpful resource", help: "Leads with sharing a useful guide. Attach/insert it from the Assets tab." },
    { value: "recompete", label: "Recompete", help: "A contract in their lane is up for recompete. Incumbents are beatable." },
    { value: "set_aside_edge", label: "Set-aside edge", help: "They hold a cert they're not leveraging. Point them at set-aside work." },
    { value: "low_competition", label: "Low competition", help: "Opps with few bidders right now. The easy lanes most firms miss." },
    { value: "expiring_sam", label: "Expiring SAM", help: "Their SAM registration is lapsing. Heads-up before they go dark." },
];

type OutreachChannel = "email" | "linkedin" | "sms";
const CHANNEL_OPTIONS: { value: OutreachChannel; label: string; icon: typeof Mail }[] = [
    { value: "email", label: "Email", icon: Mail },
    { value: "linkedin", label: "LinkedIn", icon: Linkedin },
    { value: "sms", label: "SMS", icon: MessageSquare },
];

/** Rough GSM segment estimate (160 chars/seg, 153 when concatenated). */
function smsSegments(len: number): number {
    if (len <= 160) return len === 0 ? 0 : 1;
    return Math.ceil(len / 153);
}

function MessageGenerator({ lead, onUseInComposer }: { lead: Lead; onUseInComposer: (subject: string, body: string) => void }) {
    const [channel, setChannel] = useState<OutreachChannel>("email");
    const [tone, setTone] = useState<Tone>("warm_intro");
    const [template, setTemplate] = useState<EmailTemplate>("intro");
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [rateLimited, setRateLimited] = useState(false);
    const [subject, setSubject] = useState("");
    const [bodyText, setBodyText] = useState("");
    const [generated, setGenerated] = useState(false);
    const [copied, setCopied] = useState<"subject" | "body" | "both" | null>(null);
    const [used, setUsed] = useState(false);
    // SMS send state
    const [smsSending, setSmsSending] = useState(false);
    const [smsResult, setSmsResult] = useState<{ ok: boolean; message: string } | null>(null);

    const linkedinUrl = lead.owner_linkedin || lead.company_linkedin || null;
    const phone = lead.contact.phone || null;

    const generate = async (tpl: EmailTemplate = template, ch: OutreachChannel = channel) => {
        setGenerating(true);
        setError(null);
        setRateLimited(false);
        setUsed(false);
        setSmsResult(null);
        try {
            const payload: Record<string, string> = { tone, template: tpl, channel: ch };
            if (lead.source === "inbound") payload.analysis_id = lead.id;
            else payload.contractor_id = lead.id;
            const res = await fetch("/api/admin/cockpit/message", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.ok) {
                if (data?.code === 429 || res.status === 429 || res.status === 502) {
                    setRateLimited(true);
                    throw new Error("Our writer is busy right now — give it a few seconds and try again.");
                }
                throw new Error(data?.error || `Request failed (${res.status})`);
            }
            setSubject(data.subject || "");
            setBodyText(data.body || "");
            setGenerated(true);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not write the message");
        } finally {
            setGenerating(false);
        }
    };

    const pickChannel = (ch: OutreachChannel) => {
        if (ch === channel) return;
        setChannel(ch);
        setGenerated(false);
        setError(null);
        setSmsResult(null);
        // SMS has no room for the full intro — default it to the short nudge.
        if (ch === "sms" && template === "intro") setTemplate("short_nudge");
    };

    const pickTemplate = (tpl: EmailTemplate) => {
        setTemplate(tpl);
        generate(tpl);
    };

    const copy = async (which: "subject" | "body" | "both") => {
        const text = which === "subject" ? subject : which === "body" ? bodyText : `Subject: ${subject}\n\n${bodyText}`;
        try {
            await navigator.clipboard.writeText(text);
            setCopied(which);
            setTimeout(() => setCopied(null), 1500);
        } catch { /* clipboard may be blocked */ }
    };

    const sendSms = async () => {
        if (!phone) return;
        setSmsSending(true);
        setSmsResult(null);
        try {
            const payload: Record<string, string> = { to: phone, body: bodyText, lead_company: lead.company_name || "" };
            if (lead.source === "inbound") payload.analysis_id = lead.id;
            else payload.contractor_id = lead.id;
            const res = await fetch("/api/admin/cockpit/send-sms", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.ok) throw new Error(data?.error || `Failed (${res.status})`);
            setSmsResult({ ok: true, message: `Texted ${phone}.` });
        } catch (e) {
            setSmsResult({ ok: false, message: e instanceof Error ? e.message : "SMS send failed" });
        } finally {
            setSmsSending(false);
        }
    };

    const isEmail = channel === "email";
    const headings: Record<OutreachChannel, string> = {
        email: "Write a personalized email",
        linkedin: "Write a LinkedIn message",
        sms: "Write a personalized SMS",
    };

    return (
        <Card>
            <SectionHeading icon={Sparkles} title={headings[channel]} />

            {/* Channel selector — reshapes length, format, and how it's sent. */}
            <div className="grid grid-cols-3 gap-1 bg-stone-100 rounded-xl p-1">
                {CHANNEL_OPTIONS.map(c => {
                    const Icon = c.icon;
                    return (
                        <button
                            key={c.value}
                            type="button"
                            onClick={() => pickChannel(c.value)}
                            className={clsx(
                                "inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition-colors",
                                channel === c.value ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700",
                            )}
                        >
                            <Icon className="w-3.5 h-3.5" /> {c.label}
                        </button>
                    );
                })}
            </div>

            {/* Channel hint */}
            <p className="text-[11px] text-stone-500 mt-2 leading-snug">
                {isEmail && "Full email — subject line, the live match list with links, and a soft call offer."}
                {channel === "linkedin" && "Short DM — no subject. References the top match; we add one compact line + a one-line offer. Copy it into LinkedIn."}
                {channel === "sms" && "Tiny text — no subject, no links. Great as a follow-up after a connect or a missed call. Sends from your Twilio number."}
            </p>

            {/* Template variants — each re-generates with that opener shape. */}
            <div className="mt-3">
                <FieldLabel>Pick a template</FieldLabel>
                <div className="flex flex-wrap gap-1.5 mt-2">
                    {TEMPLATE_OPTIONS.map(t => (
                        <button
                            key={t.value}
                            type="button"
                            onClick={() => pickTemplate(t.value)}
                            disabled={generating}
                            title={t.help}
                            className={clsx(
                                "rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-50",
                                template === t.value ? "border-orange-400 bg-orange-50 text-orange-700" : "border-stone-200 text-stone-600 hover:border-stone-300",
                            )}
                        >
                            {generating && template === t.value ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" /> : t.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tone only matters for the longer email/LinkedIn forms. */}
            {channel !== "sms" && (
                <div className="mt-3">
                    <FieldLabel>Pick the style</FieldLabel>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                        {TONE_OPTIONS.map(t => (
                            <button
                                key={t.value}
                                type="button"
                                onClick={() => setTone(t.value)}
                                className={clsx("text-left rounded-xl border p-2.5 transition-colors", tone === t.value ? "border-orange-400 bg-orange-50" : "border-stone-200 hover:border-stone-300")}
                            >
                                <div className={clsx("text-sm font-bold", tone === t.value ? "text-orange-700" : "text-stone-700")}>{t.label}</div>
                                <div className="text-[11px] text-stone-500 mt-0.5 leading-snug">{t.help}</div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <button
                type="button"
                onClick={() => generate()}
                disabled={generating}
                className="mt-3 inline-flex items-center gap-2 bg-stone-900 hover:bg-black disabled:opacity-50 text-white font-bold px-4 py-2.5 rounded-lg text-sm"
            >
                {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Writing…</> : <><Sparkles className="w-4 h-4" /> {generated ? "Rewrite" : "Generate"}</>}
            </button>

            {error && (
                <div className={clsx(
                    "mt-3 rounded-xl p-3 text-sm flex items-start gap-2",
                    rateLimited ? "bg-amber-50 border border-amber-200 text-amber-800" : "text-rose-600",
                )}>
                    {rateLimited ? <RefreshCw className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
                    <span className="font-medium">{error}{rateLimited && (
                        <> <button type="button" onClick={() => generate()} className="underline font-bold">Try again</button></>
                    )}</span>
                </div>
            )}

            {generated && (
                <div className="mt-4 space-y-3">
                    {isEmail && (
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
                    )}
                    <div>
                        <div className="flex items-center justify-between">
                            <FieldLabel>Message{channel === "sms" && (
                                <span className={clsx("ml-2 font-normal", bodyText.length > 320 ? "text-rose-500" : "text-stone-400")}>
                                    {bodyText.length} chars · {smsSegments(bodyText.length)} SMS
                                </span>
                            )}</FieldLabel>
                            <button type="button" onClick={() => copy("body")} className="text-xs text-stone-500 hover:text-black inline-flex items-center gap-1">
                                {copied === "body" ? <><Check className="w-3 h-3 text-emerald-600" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                            </button>
                        </div>
                        <textarea
                            value={bodyText} onChange={e => setBodyText(e.target.value)} rows={channel === "sms" ? 4 : channel === "linkedin" ? 6 : 9}
                            aria-label="Generated message body" placeholder="Message body"
                            className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400 leading-relaxed"
                        />
                    </div>

                    {/* Channel-specific actions */}
                    <div className="flex flex-wrap items-center gap-2">
                        {isEmail && (
                            <>
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
                            </>
                        )}

                        {channel === "linkedin" && (
                            <>
                                <button type="button" onClick={() => copy("body")} className="inline-flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white font-bold px-3 py-2 rounded-lg text-sm">
                                    {copied === "body" ? <><Check className="w-4 h-4" /> Copied</> : <><Copy className="w-4 h-4" /> Copy message</>}
                                </button>
                                {linkedinUrl ? (
                                    <a href={linkedinUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-[#0a66c2] hover:bg-[#084d94] text-white font-bold px-3 py-2 rounded-lg text-sm">
                                        <Linkedin className="w-4 h-4" /> Open LinkedIn
                                    </a>
                                ) : (
                                    <span className="text-xs text-stone-400 inline-flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> No LinkedIn on file — copy + search</span>
                                )}
                            </>
                        )}

                        {channel === "sms" && (
                            <>
                                <button type="button" onClick={() => copy("body")} className="inline-flex items-center gap-2 bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 font-bold px-3 py-2 rounded-lg text-sm">
                                    {copied === "body" ? <><Check className="w-4 h-4 text-emerald-600" /> Copied</> : <><Copy className="w-4 h-4" /> Copy</>}
                                </button>
                                {phone ? (
                                    <button
                                        type="button"
                                        onClick={sendSms}
                                        disabled={smsSending || !bodyText.trim()}
                                        className="inline-flex items-center gap-2 bg-stone-900 hover:bg-black disabled:opacity-50 text-white font-bold px-3 py-2 rounded-lg text-sm"
                                    >
                                        {smsSending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : <><Send className="w-4 h-4" /> Send SMS to {phone}</>}
                                    </button>
                                ) : (
                                    <span className="text-xs text-stone-400 inline-flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> No phone on file</span>
                                )}
                            </>
                        )}
                    </div>

                    {smsResult && (
                        <div className={clsx(
                            "rounded-xl p-2.5 text-sm flex items-start gap-2",
                            smsResult.ok ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-rose-50 border border-rose-200 text-rose-700",
                        )}>
                            {smsResult.ok ? <Check className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
                            <span className="font-medium">{smsResult.message}</span>
                        </div>
                    )}
                </div>
            )}
        </Card>
    );
}

// ── Email composer (sends as the configured cockpit sender) ─────────────────────
function EmailComposer({
    lead, senderConfigured, onOpenSender, subject, setSubject, body, setBody, attachments, setAttachments,
}: {
    lead: Lead;
    senderConfigured: boolean | null;
    onOpenSender: () => void;
    subject: string;
    setSubject: (v: string) => void;
    body: string;
    setBody: (v: string) => void;
    attachments: { title: string; url: string }[];
    setAttachments: React.Dispatch<React.SetStateAction<{ title: string; url: string }[]>>;
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
            if (attachments.length) payload.attachments = attachments.map(a => ({ url: a.url, title: a.title }));
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
                {attachments.length > 0 && (
                    <div>
                        <FieldLabel>Attachments</FieldLabel>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                            {attachments.map((a) => (
                                <span key={a.url} className="inline-flex items-center gap-1.5 bg-stone-100 border border-stone-200 rounded-lg pl-2.5 pr-1.5 py-1 text-xs text-stone-700">
                                    <Package className="w-3.5 h-3.5 text-stone-400" />
                                    <span className="max-w-[180px] truncate" title={a.title || a.url}>{a.title || a.url}</span>
                                    <button
                                        type="button"
                                        onClick={() => setAttachments(prev => prev.filter(x => x.url !== a.url))}
                                        className="text-stone-400 hover:text-rose-600"
                                        aria-label={`Remove ${a.title || a.url}`}
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </span>
                            ))}
                        </div>
                        <p className="text-[11px] text-stone-400 mt-1">Pulled from the Assets tab. The file is fetched and attached when you send.</p>
                    </div>
                )}
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

// ── Notes + transcript (HubSpot button is in the top action bar) ─────────────────
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
            <div className="flex items-center justify-between gap-2 mb-2">
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
                These flow into HubSpot when you use the &ldquo;Send to HubSpot&rdquo; button at the top of this tab.
            </p>

            <FieldLabel>Notes (anything worth remembering)</FieldLabel>
            <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder="e.g. Left a voicemail. Owner is a Navy vet, sounded interested in the VA janitorial match."
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400 leading-relaxed"
            />
            <FieldLabel className="mt-3">Call transcript (optional)</FieldLabel>
            <textarea
                value={transcript}
                onChange={e => setTranscript(e.target.value)}
                rows={3}
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

function CallNotesModal({ lead, autoStart, onClose, onSaved }: { lead: Lead; autoStart?: boolean; onClose: () => void; onSaved: (log: SavedCallLog) => void }) {
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
                            <Phone className="w-4 h-4 text-emerald-600" /> Call {toTitleCaseCompany(lead.contact.name) || toTitleCaseCompany(lead.company_name) || "lead"}
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
                        autoStart={autoStart}
                        onSaved={onSaved}
                    />
                    <p className="text-xs text-stone-500 mt-3">
                        When you save, the notes + transcript get folded into the Company tab so they flow to HubSpot.
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

// "sergio@capturepilot.com" → ["sergio", "capturepilot.com"]; "" → ["", ""].
function splitEmail(email: string): [string, string] {
    const at = (email || "").indexOf("@");
    if (at < 0) return [email || "", ""];
    return [email.slice(0, at), email.slice(at + 1)];
}

function SenderModal({ onClose }: { onClose: () => void }) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const [configured, setConfigured] = useState<boolean | null>(null);
    const [domains, setDomains] = useState<{ name: string; status: string }[]>([]);
    const [replyOptions, setReplyOptions] = useState<string[]>([]);
    // From-address is composed from a local part + a verified domain when domains exist.
    const [fromLocal, setFromLocal] = useState("");
    const [fromDomain, setFromDomain] = useState("");
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

                const verified = Array.isArray(data.domains) ? data.domains : [];
                setDomains(verified);
                setReplyOptions(Array.isArray(data.reply_options) ? data.reply_options : []);

                // Seed the from-address builder from the saved email.
                const [local, dom] = splitEmail(fromEmail);
                setFromLocal(local);
                // If the saved domain is one of the verified ones, preselect it;
                // otherwise default to the first verified domain (if any).
                const domNames = verified.map((d: { name: string }) => d.name);
                setFromDomain(dom && domNames.includes(dom) ? dom : (domNames[0] || dom || ""));
            } catch (e) {
                if (alive) setError(e instanceof Error ? e.message : "Could not load the sender");
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, []);

    // When verified domains exist the from-address is built from local@domain;
    // otherwise we fall back to the free-text sender.from_email field.
    const composedFromEmail = domains.length > 0 && fromLocal.trim() && fromDomain
        ? `${fromLocal.trim()}@${fromDomain}`
        : sender.from_email.trim();

    const save = async () => {
        setSaving(true);
        setError(null);
        setSaved(false);
        try {
            const payload = { ...sender, from_email: composedFromEmail };
            const res = await fetch("/api/admin/cockpit/sender", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || `Failed (${res.status})`);
            setConfigured(!!data.configured);
            setSender(prev => ({ ...prev, from_email: composedFromEmail }));
            if (Array.isArray(data.reply_options)) setReplyOptions(data.reply_options);
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
                                {domains.length > 0 ? (
                                    <>
                                        <div className="flex items-stretch gap-2 mt-1">
                                            <input
                                                type="text" value={fromLocal} onChange={e => setFromLocal(e.target.value.replace(/@.*$/, "").trim())}
                                                placeholder="sergio"
                                                className="flex-1 px-3 py-2 text-sm rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400"
                                            />
                                            <span className="self-center text-stone-400 text-sm">@</span>
                                            <select
                                                value={fromDomain} onChange={e => setFromDomain(e.target.value)}
                                                title="Sending domain" aria-label="Sending domain"
                                                className="px-2 py-2 text-sm rounded-lg border border-stone-200 bg-white focus:outline-none focus:border-stone-400"
                                            >
                                                {domains.map(d => (
                                                    <option key={d.name} value={d.name}>{d.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <p className="mt-1 text-xs text-stone-400">
                                            {composedFromEmail ? <>Sends as <span className="font-medium text-stone-600">{composedFromEmail}</span></> : "Pick a local part + verified domain."}
                                        </p>
                                    </>
                                ) : (
                                    <input
                                        type="email" value={sender.from_email} onChange={e => set("from_email", e.target.value)}
                                        placeholder="sergio@capturepilot.com"
                                        className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400"
                                    />
                                )}
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
                                    type="email" list="cockpit-reply-options"
                                    value={sender.reply_to} onChange={e => set("reply_to", e.target.value)}
                                    placeholder="defaults to the from email — pick a saved inbox or type one"
                                    className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400"
                                />
                                <datalist id="cockpit-reply-options">
                                    {replyOptions.map(opt => <option key={opt} value={opt} />)}
                                </datalist>
                                {replyOptions.length > 0 && (
                                    <p className="mt-1 text-xs text-stone-400">Saved inboxes: {replyOptions.join(", ")}</p>
                                )}
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
    return <div className={clsx("bg-white border border-stone-200 rounded-2xl p-4", className)}>{children}</div>;
}

function SectionHeading({ icon: Icon, title, noMargin }: {
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    noMargin?: boolean;
}) {
    return (
        <h3 className={clsx("font-bold text-stone-900 flex items-center gap-2", !noMargin && "mb-3")}>
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
        <div className="rounded-xl border border-stone-200 p-2.5">
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

/**
 * Hover tooltip wrapper — wraps any child (a cert badge, the fit chip) and shows a
 * styled popover with `blurb` on hover/focus. Uses native `title` too so the text is
 * available without JS / on touch. Group-hover keeps it dependency-free.
 */
function CertTooltip({ blurb, children }: { blurb: string; children: React.ReactNode }) {
    return (
        <span className="relative inline-flex group" tabIndex={0} title={blurb}>
            {children}
            <span
                role="tooltip"
                className="pointer-events-none absolute left-0 top-full mt-1.5 z-30 hidden group-hover:block group-focus:block w-64 rounded-lg bg-stone-900 text-white text-[11px] leading-snug font-normal normal-case tracking-normal px-3 py-2 shadow-xl"
            >
                {blurb}
            </span>
        </span>
    );
}

/**
 * A certification badge with a hover tooltip explaining what the cert means
 * (certInfo from the cert-glossary). Falls back to the raw code when unknown.
 */
function CertBadge({ code }: { code: string }) {
    const info = certInfo(code);
    const label = info?.label || code;
    const blurb = info?.blurb || `Certification: ${code}`;
    return (
        <CertTooltip blurb={blurb}>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-stone-100 text-stone-700 rounded-lg px-2.5 py-1 cursor-help">
                <Award className="w-3.5 h-3.5 text-stone-400" /> {label}
            </span>
        </CertTooltip>
    );
}
