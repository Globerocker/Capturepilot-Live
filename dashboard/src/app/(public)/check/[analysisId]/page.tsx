"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
    MapPin, Users, Calendar, Target, Search, Sparkles,
    ArrowRight, Globe, Phone, Mail, Loader2, Briefcase, Shield,
    TrendingUp, Award, ChevronDown, Clock, Unlock, ExternalLink, DollarSign,
    Linkedin, Facebook, Twitter, Save, FileDown, CheckCircle2, User, Building2, Hash,
    Swords, AlertTriangle, Lock,
} from "lucide-react";
import Image from "next/image";
import clsx from "clsx";
import { LeadMagnetForm } from "@/components/LeadMagnetForm";
import { OpportunityLandscape, ConversionBottomSection, type OpportunityStats } from "@/components/OpportunityLandscape";
import ReadinessScoreCard from "@/components/ReadinessScoreCard";
import NaicsEditModal from "@/components/NaicsEditModal";
import { trackWithCapi } from "@/lib/analytics";
import ProfileEditModal from "@/components/ProfileEditModal";
import StartupPackOfferCard from "@/components/StartupPackOfferCard";
import ConfirmFoundDataStep from "@/components/ConfirmFoundDataStep";
import AnalysisLoadingScreen from "@/components/AnalysisLoadingScreen";
import InlineCTA from "@/components/InlineCTA";

interface CertRecommendation {
    cert: string;
    cert_label: string;
    unlocked_count: number;
    estimated_value: number;
    sample_opps: { title: string; agency: string; set_aside_code: string }[];
    difficulty: "easy" | "moderate" | "complex";
    timeline: string;
}

interface EasyWin {
    title: string;
    description: string;
    impact: "high" | "medium" | "low";
    category: string;
}

interface MatchData {
    opportunity_id: string;
    title?: string;
    agency?: string;
    naics_code?: string;
    set_aside_code?: string;
    response_deadline?: string;
    notice_type?: string;
    award_amount?: number;
    notice_id?: string;
    place_of_performance_state?: string;
    description_url?: string;
    score: number;
    classification: string;
    score_breakdown: Record<string, number>;
    matched_keywords?: string[];
    ai_fit_summary?: string;
    /** Phase 4: eligibility flag — drives the "Not eligible" lock badge. */
    eligibility?: "eligible" | "not_eligible_cert" | "not_eligible_size";
    /** Certs the user would need to bid (only set when eligibility ≠ 'eligible'). */
    required_certifications?: string[];
    /** Phase 19: USAspending cross-reference flagged this as a likely recompete. */
    is_recompete?: boolean;
    /** Phase 19: name of the current incumbent (last awardee on this NAICS+agency+state combo). */
    incumbent_name?: string | null;
    /** 'sam' (federal) / 'sled' / 'grant' — drives source-tier badge. */
    source?: string | null;
    /** 'state' / 'county' / 'city' — refines the SLED badge label. */
    jurisdiction_level?: string | null;
    /** Portal URL for the opp (Bonfire / Socrata / NY State Contract Reporter
        / vendor site). For SLED rows we MUST link here — the notice_id is an
        internal hg-sled-* hash and a sam.gov URL would 404. */
    link?: string | null;
    /** Set by /api/cron/validate_sled_links — true when HEAD returned 404/410.
        UI hides the dead button and falls back to a Google search. */
    link_broken?: boolean | null;
}

/**
 * Treat anything starting with http(s):// as a fetch URL placeholder rather
 * than human-readable description text. SAM.gov returns descriptions as URLs
 * that need a second fetch — un-enriched rows still have the URL sitting in
 * opportunities.description, and rendering it as text reads as a bug.
 */
function isFetchUrl(s: string | null | undefined): boolean {
    if (!s) return false;
    return /^https?:\/\//i.test(s.trim());
}

/**
 * Clean agency name for display. Some opps come back with "GOV" or a single
 * letter from SAM's raw payload — treat those as empty. Otherwise return the
 * string as-is.
 */
function cleanAgency(raw: string | null | undefined): string {
    if (!raw) return "";
    const s = String(raw).trim();
    if (s.length < 3) return "";   // single letters, "GOV" tag, etc.
    if (s.toLowerCase() === "federal agency") return ""; // self-referential placeholder
    return s;
}

/**
 * Phase 13 — Strategic Brief panel rendered on /check above the matches list.
 * Identical content to the HubSpot Note pushed in Phase 5, but native on the
 * user's own result page so they don't need to bounce to HubSpot to see it.
 *
 * Layout: 3 columns on desktop (strengths / weaknesses / pitch angles),
 * stacks on mobile. Firmographics chip row below shows employees, founded
 * year, revenue band — with per-field source attribution ("Apollo", "SAM").
 */
function StrategicBriefPanel(props: {
    strengths: string[];
    weaknesses: string[];
    pitchAngles: string[];
    nailDownKeywords: string[];
    federalAgenciesServed: string[];
    revenueSignal: string | null;
    firmographics: {
        employee_count?: { value: number | null; source: string };
        revenue?: { value: number | null; source: string };
        revenue_band?: { value: string | null; source: string };
        founded_year?: { value: number | null; source: string };
        years_in_business?: { value: number | null; source: string };
        industries?: { value: string[] | null; source: string };
    } | null;
}) {
    const { strengths, weaknesses, pitchAngles, nailDownKeywords, federalAgenciesServed, revenueSignal, firmographics } = props;
    const fm = firmographics || {};
    const fmChips: Array<{ label: string; value: string; source: string }> = [];
    if (fm.employee_count?.value)      fmChips.push({ label: "Employees",   value: String(fm.employee_count.value),   source: fm.employee_count.source });
    if (fm.founded_year?.value)        fmChips.push({ label: "Founded",     value: String(fm.founded_year.value),     source: fm.founded_year.source });
    if (fm.years_in_business?.value)   fmChips.push({ label: "Years",       value: String(fm.years_in_business.value), source: fm.years_in_business.source });
    if (fm.revenue_band?.value)        fmChips.push({ label: "Revenue",     value: fm.revenue_band.value.replace(/_/g, "-").replace(/m/g, "M"), source: fm.revenue_band.source });
    if (fm.industries?.value && fm.industries.value.length > 0) {
        fmChips.push({ label: "Industry", value: fm.industries.value[0], source: fm.industries.source });
    }

    return (
        <div className="border border-emerald-200 bg-emerald-50/40 rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-bold uppercase tracking-widest text-emerald-700">Strategic Brief</h3>
                <span className="text-[10px] text-emerald-600/70">Auto-generated from your website + SAM + USAspending</span>
            </div>

            {/* Firmographics chip row */}
            {fmChips.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {fmChips.map(c => (
                        <span key={c.label} className="inline-flex items-center gap-1 bg-white border border-stone-200 px-2.5 py-1 rounded-lg text-[11px]">
                            <span className="text-stone-500 font-semibold">{c.label}:</span>
                            <span className="font-bold text-stone-900">{c.value}</span>
                            <span className="text-[9px] text-emerald-600 ml-1 uppercase">{c.source}</span>
                        </span>
                    ))}
                </div>
            )}

            {nailDownKeywords.length > 0 && (
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-1">What they do</p>
                    <div className="flex flex-wrap gap-1.5">
                        {nailDownKeywords.slice(0, 6).map(k => (
                            <span key={k} className="bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded text-[11px] font-medium">{k}</span>
                        ))}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {strengths.length > 0 && (
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 mb-2">💪 Strengths</p>
                        <ul className="space-y-1.5 text-sm text-stone-700 list-disc list-inside marker:text-emerald-500">
                            {strengths.slice(0, 6).map((s, i) => <li key={i} className="leading-snug">{s}</li>)}
                        </ul>
                    </div>
                )}
                {weaknesses.length > 0 && (
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700 mb-2">⚠️ Weaknesses</p>
                        <ul className="space-y-1.5 text-sm text-stone-700 list-disc list-inside marker:text-amber-500">
                            {weaknesses.slice(0, 6).map((w, i) => <li key={i} className="leading-snug">{w}</li>)}
                        </ul>
                    </div>
                )}
                {pitchAngles.length > 0 && (
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-blue-700 mb-2">🎯 Pitch angles</p>
                        <ul className="space-y-1.5 text-sm text-stone-700 list-disc list-inside marker:text-blue-500">
                            {pitchAngles.slice(0, 6).map((p, i) => <li key={i} className="leading-snug">{p}</li>)}
                        </ul>
                    </div>
                )}
            </div>

            {(federalAgenciesServed.length > 0 || revenueSignal) && (
                <div className="border-t border-emerald-200/50 pt-3 flex flex-wrap items-center gap-3 text-[11px] text-stone-600">
                    {federalAgenciesServed.length > 0 && (
                        <span><strong>Past federal:</strong> {federalAgenciesServed.join(", ")}</span>
                    )}
                    {revenueSignal && (
                        <span><strong>Revenue signal:</strong> {revenueSignal}</span>
                    )}
                </div>
            )}
        </div>
    );
}

/**
 * Phase 20 — Geo expansion banner. High-contrast cyan callout above the
 * matches list that quantifies the opportunity cost of single-state
 * targeting and names the top 3 states the user should add.
 */
function GeoExpansionBanner(props: {
    expansion: {
        total_potential_opps: number;
        suggestions: Array<{ state: string; opp_count: number }>;
        summary: string;
    };
}) {
    const { expansion } = props;
    if (expansion.suggestions.length === 0) return null;
    return (
        <div className="bg-cyan-50 border border-cyan-200 rounded-2xl p-4 sm:p-5">
            <div className="flex items-start gap-3">
                <div className="bg-cyan-500/15 p-2 rounded-lg flex-shrink-0">
                    <MapPin className="w-4 h-4 text-cyan-700" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold uppercase tracking-widest text-cyan-700 mb-1">Expand your geo reach</p>
                    <p className="text-sm text-stone-800 font-medium leading-snug mb-2">
                        {expansion.summary}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        {expansion.suggestions.slice(0, 5).map(s => (
                            <span key={s.state} className="inline-flex items-center gap-1 bg-white border border-cyan-200 px-2 py-0.5 rounded text-[11px] font-medium text-cyan-900">
                                {s.state} <span className="text-cyan-600 font-bold">+{s.opp_count}</span>
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

// Some SLED ingest paths store notice_type as a JSON-encoded blob like
// `{"description":"Solicitation"}` rather than a plain string. The scoring
// path tolerates it via .includes() but the UI shouldn't expose the curly
// braces. Always render through this helper.
function displayNoticeType(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const s = String(raw).trim();
    if (!s) return null;
    if (s.startsWith("{")) {
        try {
            const parsed = JSON.parse(s) as { description?: unknown };
            if (parsed && typeof parsed.description === "string" && parsed.description.trim()) {
                return parsed.description.trim();
            }
        } catch {
            const m = s.match(/"description"\s*:\s*"([^"]+)"/);
            if (m && m[1]) return m[1].trim();
        }
        return null; // unparseable JSON → hide rather than show braces
    }
    return s;
}

// Pick the right "view this opportunity" URL for a match. Federal rows use
// sam.gov; SLED / grant rows go straight to whatever portal originally listed
// them. Falls back to a Google search when we have no link (or the link was
// flagged broken by validate_sled_links) — better than no button at all.
function pickMatchUrl(m: MatchData): { url: string; label: string } | null {
    const src = (m.source || "").toLowerCase();
    const isFederalNoticeId = typeof m.notice_id === "string" && /^[0-9a-f]{32}$/i.test(m.notice_id);
    if ((src === "sam" || (!src && isFederalNoticeId)) && m.notice_id && isFederalNoticeId) {
        return { url: `https://sam.gov/opp/${m.notice_id}/view`, label: "View on SAM.gov" };
    }
    // SLED / grants / anything else — use the opp's persisted link unless
    // it's been flagged broken by the link-validator cron.
    if (m.link && !m.link_broken) {
        try {
            const host = new URL(m.link).hostname.replace(/^www\./, "");
            return { url: m.link, label: `View on ${host}` };
        } catch {
            return { url: m.link, label: "View Opportunity" };
        }
    }
    // Fallback: Google search for "<title> <agency>" — always gives the user
    // a way to click through. Better than a missing button on a card where
    // the title alone tells them what to search for.
    if (m.title) {
        const q = encodeURIComponent(`${m.title} ${m.agency || ""}`.trim());
        return { url: `https://www.google.com/search?q=${q}`, label: "Find on Google" };
    }
    return null;
}

// Source-tier badge config used on every match card. Reads opp.source +
// jurisdiction_level + agency heuristics so each row gets the most specific
// label possible. Tiers, in order of specificity:
//   Federal · State · County · City · Subcontracting · Grant · Other
function getSourceTier(m: { source?: string | null; agency?: string; jurisdiction_level?: string | null; notice_type?: string | null }): { tier: "federal" | "state" | "county" | "city" | "subcontract" | "grant" | "unknown"; label: string; color: string } {
    const s = (m.source || "").toLowerCase();
    const jl = (m.jurisdiction_level || "").toLowerCase();
    const agency = (m.agency || "").toLowerCase();

    // Subcontracting prime/SBA-network signals — visible cue that this is not
    // a direct-bid federal opp but a teaming / subcontracting lead.
    if (
        /\bsubcontract|subnet|dynamic small business|sba\s+subcontract|small business administration\s+sub/i.test(m.agency || "") ||
        /\bsubcontract/i.test(m.notice_type || "")
    ) {
        return { tier: "subcontract", label: "Subcontracting", color: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200" };
    }

    if (s === "grant") return { tier: "grant", label: "Grant", color: "bg-violet-50 text-violet-700 border-violet-200" };

    if (s === "sled") {
        if (jl === "state") return { tier: "state", label: "State", color: "bg-indigo-50 text-indigo-700 border-indigo-200" };
        if (jl === "county") return { tier: "county", label: "County", color: "bg-teal-50 text-teal-700 border-teal-200" };
        if (jl === "city") return { tier: "city", label: "City", color: "bg-cyan-50 text-cyan-700 border-cyan-200" };
        // Fall back to inferring from agency string when DB didn't populate level
        if (/\bcounty\b/.test(agency)) return { tier: "county", label: "County", color: "bg-teal-50 text-teal-700 border-teal-200" };
        if (/\bcity of\b|\btown of\b|\bvillage of\b|\bcity\s+services\b/.test(agency)) return { tier: "city", label: "City", color: "bg-cyan-50 text-cyan-700 border-cyan-200" };
        if (/\bstate of\b|department of (transportation|education|health|labor|administration)/.test(agency)) return { tier: "state", label: "State", color: "bg-indigo-50 text-indigo-700 border-indigo-200" };
        return { tier: "state", label: "State / Local", color: "bg-indigo-50 text-indigo-700 border-indigo-200" };
    }

    if (s === "sam" || (s === "" && m.agency && /\b(department of (defense|veterans|homeland|state|the (army|navy|air force|interior|treasury|justice|energy)|labor|education|commerce|transportation|agriculture|housing|health|the\s+interior))|\b(dept|federal|gsa|noaa|nasa|usda|usaf)\b/i.test(m.agency))) {
        return { tier: "federal", label: "Federal", color: "bg-blue-50 text-blue-700 border-blue-200" };
    }
    return { tier: "unknown", label: "Other", color: "bg-stone-50 text-stone-600 border-stone-200" };
}

interface ReadinessBreakdown {
    factors: Array<{ label: string; points: number; present: boolean; detail?: string }>;
    raw_points: number;
    total: number;
    interpretation: string;
}

interface CompetitorData {
    name: string;
    uei: string | null;
    cage_code: string | null;
    sam_registered: boolean;
    naics_codes: string[];
    naics_overlap_pct: number;
    total_awards: number;
    award_count: number;
    first_award_date: string | null;
    last_award_date: string | null;
    top_agency: string | null;
    strengths: string[];
    weaknesses: string[];
    state: string | null;
    website?: string | null;
    google_search_url?: string;
    source?: string;
    sba_certifications?: string[];
}

interface AnalysisData {
    id: string;
    status: string;
    company_name: string;
    website: string;
    company_summary: string;
    crawl_data: {
        description?: string;
        services?: string[];
        locations?: { address?: string; state?: string }[];
        detected_states?: string[];
        contacts?: { email?: string; phone?: string; name?: string; title?: string }[];
        certifications?: { type: string; confidence: number }[];
        employee_signals?: { estimate: number; source: string } | null;
        founding_year?: number | null;
        leadership?: { name: string; title: string; email?: string; phone?: string }[];
        social_links?: { linkedin?: string; facebook?: string; twitter?: string };
        pages_crawled?: string[];
        revenue_signals?: { estimate: number; source: string } | null;
        past_clients?: string[];
        // ── Phase 2/13 strategic profile (from deep-extract):
        nail_down_keywords?: string[];
        strengths?: string[];
        weaknesses?: string[];
        pitch_angles?: string[];
        revenue_signal?: string | null;
        federal_agencies_served?: string[];
        industries_served?: string[];
    };
    // ── Phase 8 firmographics cascade output (Apollo + SAM + OpenCorp + Wayback):
    firmographics?: {
        employee_count?: { value: number | null; source: string };
        revenue?: { value: number | null; source: string };
        revenue_band?: { value: string | null; source: string };
        founded_year?: { value: number | null; source: string };
        years_in_business?: { value: number | null; source: string };
        industries?: { value: string[] | null; source: string };
        first_seen_online?: { value: string | null; source: string };
        notes?: string[];
    } | null;
    // ── Phase 20 geo expansion suggestions:
    geo_expansion?: {
        total_potential_opps: number;
        suggestions: Array<{
            state: string;
            opp_count: number;
            naics_breakdown: Array<{ naics: string; count: number }>;
        }>;
        summary: string;
    } | null;
    sam_data: {
        uei?: string;
        cage_code?: string;
        company_name?: string;
        dba_name?: string;
        state?: string;
        city?: string;
        address_line_1?: string;
        zip_code?: string;
        phone?: string;
        naics_codes?: string[];
        sba_certifications?: string[];
        points_of_contact?: { name: string; title: string; email?: string; phone?: string }[];
    } | null;
    inferred_naics: { code: string; label: string; confidence: number; matched_keywords: string[] }[];
    selected_naics_codes?: string[] | null;
    preview_matches: MatchData[];
    inferred_profile: {
        company_name?: string;
        dba_name?: string;
        website?: string;
        uei?: string;
        cage_code?: string;
        state?: string;
        phone?: string;
        email?: string;
        contact_person?: { name: string; title: string; email?: string; phone?: string; mobile_phone?: string; direct_phone?: string; linkedin_url?: string; source?: string } | null;
        [key: string]: unknown;
    };
    cert_recommendations: CertRecommendation[];
    easy_wins: EasyWin[];
    opportunity_stats?: OpportunityStats | null;
    readiness_score?: number | null;
    readiness_breakdown?: ReadinessBreakdown | null;
    ai_match_summaries?: Record<string, string>;
    competitors?: CompetitorData[] | null;
    crawler_confidence?: number;
    is_saved?: boolean;
    error_message?: string;
    created_at?: string;
    lead_email?: string | null;
    lead_phone?: string | null;
    lead_captured_at?: string | null;
    startup_pack_unlocked_at?: string | null;
}

function CompetitorCard({ comp, rank }: { comp: CompetitorData; rank: number }) {
    const fmtCurrency = (amount: number) => {
        if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
        if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
        return `$${amount.toLocaleString()}`;
    };

    return (
        <div className="bg-white border border-stone-200 rounded-2xl shadow-sm p-4 sm:p-5">
            <div className="flex items-start gap-3 mb-3">
                <div className="flex-shrink-0 w-8 h-8 bg-stone-100 text-stone-600 rounded-lg flex items-center justify-center font-bold text-sm">
                    #{rank}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-sm text-black truncate">{comp.name}</p>
                        {comp.state && (
                            <span className="text-[9px] font-bold bg-stone-100 text-stone-600 border border-stone-200 px-2 py-0.5 rounded inline-flex items-center gap-1 uppercase">
                                <MapPin className="w-2.5 h-2.5" /> {comp.state}
                            </span>
                        )}
                        {comp.sam_registered ? (
                            <span className="text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded">
                                SAM Active
                            </span>
                        ) : (
                            <span className="text-[9px] font-bold bg-stone-50 text-stone-500 border border-stone-200 px-2 py-0.5 rounded">
                                SAM Unknown
                            </span>
                        )}
                        {comp.naics_overlap_pct > 0 && (
                            <span className="text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded">
                                {comp.naics_overlap_pct}% NAICS overlap
                            </span>
                        )}
                    </div>
                    {comp.uei && (
                        <p className="text-[10px] text-stone-400 font-mono mt-1">UEI: {comp.uei}</p>
                    )}
                </div>
            </div>

            {/* Award stats */}
            {comp.award_count > 0 && (
                <div className="flex items-center gap-3 mb-3 pb-3 border-b border-stone-100">
                    <div className="flex items-center gap-1.5">
                        <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
                        <p className="text-sm font-bold text-stone-800">{fmtCurrency(comp.total_awards)}</p>
                        <p className="text-xs text-stone-500">in {comp.award_count} awards</p>
                    </div>
                    {comp.top_agency && (
                        <div className="flex items-center gap-1 text-xs text-stone-500 truncate">
                            <Building2 className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{comp.top_agency}</span>
                        </div>
                    )}
                </div>
            )}

            {/* Website link */}
            <div className="mb-3">
                {comp.website ? (
                    <a
                        href={comp.website.startsWith("http") ? comp.website : `https://${comp.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800 hover:underline"
                    >
                        <Globe className="w-3 h-3" />
                        Visit website
                        <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                ) : comp.google_search_url ? (
                    <a
                        href={comp.google_search_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-stone-700 hover:underline"
                    >
                        <Search className="w-3 h-3" />
                        Find online
                        <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                ) : null}
            </div>

            {/* Strengths */}
            {comp.strengths.length > 0 && (
                <div className="mb-2">
                    <div className="flex flex-wrap gap-1.5">
                        {comp.strengths.map((s, i) => (
                            <span key={i} className="text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded inline-flex items-center gap-1">
                                <CheckCircle2 className="w-2.5 h-2.5" /> {s}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Weaknesses */}
            {comp.weaknesses.length > 0 && (
                <div>
                    <div className="flex flex-wrap gap-1.5">
                        {comp.weaknesses.map((w, i) => (
                            <span key={i} className="text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded inline-flex items-center gap-1">
                                <AlertTriangle className="w-2.5 h-2.5" /> {w}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function getNextSteps(noticeType?: string): string[] {
    const nt = (noticeType || "").toLowerCase();
    if (nt.includes("sources sought") || nt.includes("rfi")) {
        return [
            "Prepare and submit a capability statement",
            "Identify the Contracting Officer and make contact",
            "Find potential teaming partners with past performance",
        ];
    }
    if (nt.includes("presolicitation")) {
        return [
            "Research the incumbent contractor",
            "Prepare a capability statement",
            "Conduct a bid/no-bid analysis",
            "Identify teaming partners",
        ];
    }
    // Solicitation or combined
    return [
        "Review the Statement of Work (SOW)",
        "Conduct a go/no-go analysis",
        "Begin technical proposal draft",
        "Develop competitive pricing strategy",
    ];
}

// Render a description snippet (max ~280 chars) with the user's matched
// keywords + their primary NAICS labels bolded. Keeps the visible text
// short so the card stays compact while still showing WHY it's a match.
//
// Defensive: returns null on any unexpected input (string-coerce just in
// case a caller passes a non-string description_url payload from SAM).
function HighlightedSnippet({ text, terms, maxLen = 280 }: { text: string | null | undefined; terms: string[]; maxLen?: number }) {
    const safeText = typeof text === "string" ? text : (text == null ? "" : String(text));
    if (!safeText) return null;
    const safeTerms = (terms || []).map(t => (typeof t === "string" ? t : "")).filter(Boolean);

    const lc = safeText.toLowerCase();
    // Pick a snippet centered on the first matched term so the keyword is visible.
    let start = 0;
    let firstHit = -1;
    for (const t of safeTerms) {
        const idx = lc.indexOf(t.toLowerCase());
        if (idx >= 0 && (firstHit === -1 || idx < firstHit)) firstHit = idx;
    }
    if (firstHit >= 0 && safeText.length > maxLen) {
        start = Math.max(0, firstHit - 60);
        const space = safeText.indexOf(" ", start);
        if (space >= 0 && space - start < 25) start = space + 1;
    }
    let snippet = safeText.slice(start, start + maxLen).trim();
    if (start > 0) snippet = "…" + snippet;
    if (start + maxLen < safeText.length) snippet = snippet + "…";

    if (safeTerms.length === 0) return <span>{snippet}</span>;

    // Build the dedup'd lowercase term list — used both for the split regex
    // AND for the per-part highlight check (no stateful `re.test()` in the
    // map loop, which was buggy with the `g` flag's lastIndex behavior).
    const uniqTerms = Array.from(new Set(safeTerms.map(t => t.toLowerCase()))).filter(t => t.length >= 2);
    if (uniqTerms.length === 0) return <span>{snippet}</span>;

    const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let parts: string[];
    try {
        const re = new RegExp(`(${uniqTerms.map(escapeRe).join("|")})`, "gi");
        parts = snippet.split(re);
    } catch {
        // If for any reason the regex blows up (unicode edge cases, etc.),
        // fall back to the plain unbolded snippet rather than crashing the
        // entire result page.
        return <span>{snippet}</span>;
    }
    const termSet = new Set(uniqTerms);
    return (
        <span>
            {parts.map((part, i) =>
                termSet.has(part.toLowerCase())
                    // Phase 15 — louder highlight: bold + yellow-400 background,
                    // black text for contrast. Visually unmissable when scanning
                    // a long opp description.
                    ? <mark key={i} className="bg-yellow-300 text-stone-900 font-bold px-1 py-0.5 rounded shadow-sm">{part}</mark>
                    : <span key={i}>{part}</span>
            )}
        </span>
    );
}

// "Why this match" — explicit chip breakdown so the user sees the signals,
// not just a single AI sentence.
function WhyMatchPanel({ match, userNaicsLabels }: { match: MatchData; userNaicsLabels: Record<string, string> }) {
    const bd = match.score_breakdown || {};
    const reasons: Array<{ key: string; chip: React.ReactNode }> = [];

    // NAICS — show user's matching NAICS label when we can.
    if (match.naics_code && (bd.naics || 0) >= 0.6) {
        const label = userNaicsLabels[match.naics_code];
        const exact = (bd.naics || 0) >= 0.99;
        reasons.push({
            key: "naics",
            chip: (
                <span className="text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-md">
                    {exact ? "Exact NAICS" : "Adjacent NAICS"} <span className="font-mono">{match.naics_code}</span>{label ? <> — {label}</> : null}
                </span>
            ),
        });
    }

    // Matched keywords
    for (const kw of (match.matched_keywords || []).slice(0, 4)) {
        reasons.push({
            key: `kw-${kw}`,
            chip: (
                <span className="text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-md">
                    keyword <span className="italic">&ldquo;{kw}&rdquo;</span>
                </span>
            ),
        });
    }

    // Set-aside (only chip when the user actually qualifies for it)
    if (match.set_aside_code && (bd.set_aside || 0) >= 0.7) {
        reasons.push({
            key: "set_aside",
            chip: (
                <span className="text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded-md">
                    {match.set_aside_code} set-aside fits you
                </span>
            ),
        });
    }

    // Geo
    if ((bd.geo || 0) >= 0.9) {
        reasons.push({
            key: "geo",
            chip: (
                <span className="text-[10px] font-bold bg-stone-50 text-stone-700 border border-stone-200 px-2 py-0.5 rounded-md">
                    Location {match.place_of_performance_state || "matches"}
                </span>
            ),
        });
    }

    // Deadline urgency
    if ((bd.deadline_boost || 0) > 0 && match.response_deadline) {
        const days = Math.round((new Date(match.response_deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (days >= 1 && days <= 14) {
            reasons.push({
                key: "deadline",
                chip: (
                    <span className="text-[10px] font-bold bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-md">
                        Closes in {days}d — promoted
                    </span>
                ),
            });
        }
    }

    // ── Phase 18 — additional signals: jackpot, industry-agency, past-perf ──
    if ((bd.jackpot_bonus || 0) > 0) {
        reasons.push({
            key: "jackpot",
            chip: (
                <span className="text-[10px] font-bold bg-yellow-100 text-yellow-900 border border-yellow-300 px-2 py-0.5 rounded-md">
                    🔥 NAICS + keywords jackpot (+{Math.round((bd.jackpot_bonus || 0) * 100)}%)
                </span>
            ),
        });
    }
    if ((bd.industry_agency || 0) > 0) {
        reasons.push({
            key: "industry_agency",
            chip: (
                <span className="text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-md">
                    Industry × agency affinity (+{Math.round((bd.industry_agency || 0) * 100)}%)
                </span>
            ),
        });
    }
    if ((bd.past_performance || 0) >= 0.7) {
        reasons.push({
            key: "past_perf",
            chip: (
                <span className="text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-md">
                    Past performance fit
                </span>
            ),
        });
    }
    // Phase 19 — recompete badge (set by the recompete cross-reference)
    if (match.is_recompete) {
        reasons.push({
            key: "recompete",
            chip: (
                <span
                    className="text-[10px] font-bold bg-orange-50 text-orange-800 border border-orange-200 px-2 py-0.5 rounded-md"
                    title={match.incumbent_name ? `Likely recompete — current incumbent: ${match.incumbent_name}` : "Likely recompete of an existing contract"}
                >
                    🔁 Recompete{match.incumbent_name ? ` — incumbent: ${match.incumbent_name}` : ""}
                </span>
            ),
        });
    }

    if (reasons.length === 0) return null;
    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {reasons.map(r => <span key={r.key}>{r.chip}</span>)}
        </div>
    );
}

function MatchCard({ match, rank, hero, userNaicsLabels }: { match: MatchData; rank: number; hero?: boolean; userNaicsLabels?: Record<string, string> }) {
    const [expanded, setExpanded] = useState(false);

    // Source-aware "view opp" link. For SLED rows the notice_id is an internal
    // hash, so the old `https://sam.gov/opp/${notice_id}/view` construction
    // produced 404 URLs — now resolved via pickMatchUrl().
    const viewLink = pickMatchUrl(match);
    const samUrl = viewLink?.url || null;
    const samLabel = viewLink?.label || "View Opportunity";

    const formatCurrency = (amount: number) => {
        if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
        if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
        return `$${amount.toLocaleString()}`;
    };

    // Deadline countdown — only show when within 30 days. Color-coded.
    const deadlineInfo = (() => {
        if (!match.response_deadline) return null;
        const dt = new Date(match.response_deadline).getTime();
        if (Number.isNaN(dt)) return null;
        const days = Math.round((dt - Date.now()) / (1000 * 60 * 60 * 24));
        if (days < 0) return { days, label: "Closed", tone: "stone" as const };
        if (days <= 7) return { days, label: `Closes in ${days}d`, tone: "red" as const };
        if (days <= 30) return { days, label: `Closes in ${days}d`, tone: "amber" as const };
        return { days, label: `Closes in ${days}d`, tone: "stone" as const };
    })();

    if (hero) {
        // Highlight signals from matched_keywords + the user's NAICS label
        const highlightTerms = [
            ...(match.matched_keywords || []),
            ...(match.naics_code && userNaicsLabels?.[match.naics_code] ? [userNaicsLabels[match.naics_code]] : []),
        ];

        return (
            <div className="bg-white border border-stone-200 rounded-2xl shadow-md overflow-hidden">
                <div className="p-5 sm:p-6 space-y-3">
                    {/* Top row: rank + score + classification + deadline */}
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className={clsx(
                                "w-12 h-12 rounded-xl font-black text-base flex items-center justify-center flex-shrink-0",
                                match.score >= 0.70 ? "bg-gradient-to-br from-emerald-500 to-blue-600 text-white" :
                                match.score >= 0.50 ? "bg-gradient-to-br from-amber-400 to-amber-600 text-white" :
                                "bg-gradient-to-br from-blue-400 to-blue-600 text-white"
                            )}>
                                {Math.round(match.score * 100)}
                            </div>
                            <div>
                                <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                                    <span className="text-[10px] font-bold text-stone-400">#{rank}</span>
                                    <span className={clsx(
                                        "text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-widest border",
                                        match.classification === "HOT" ? "bg-red-50 text-red-600 border-red-200" :
                                        match.classification === "WARM" ? "bg-amber-50 text-amber-600 border-amber-200" :
                                        "bg-blue-50 text-blue-600 border-blue-200"
                                    )}>
                                        {match.classification}
                                    </span>
                                    {match.set_aside_code && (
                                        <span className="text-[9px] font-bold bg-blue-100 text-blue-700 border border-blue-200 px-2 py-0.5 rounded">
                                            {match.set_aside_code}
                                        </span>
                                    )}
                                    {match.award_amount && match.award_amount > 0 && (
                                        <span className="text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded">
                                            {formatCurrency(match.award_amount)}
                                        </span>
                                    )}
                                    {/* Phase 4: not-eligible lock badge — visible but unbiddable.
                                        Drives a "Get X cert" CTA so the user knows exactly which
                                        certification would unlock the match. Two flavors:
                                          - cert-restricted (8a, SDVOSB, WOSB, HUBZone …)
                                          - too-large-for-small-business */}
                                    {match.eligibility === "not_eligible_cert" && (
                                        <span
                                            className="text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded inline-flex items-center gap-1"
                                            title={match.required_certifications && match.required_certifications.length > 0
                                                ? `Requires ${match.required_certifications.join(" or ")} certification to bid`
                                                : "Set-aside requires a certification you don't currently hold"}
                                        >
                                            <Lock className="w-2.5 h-2.5" />
                                            {match.required_certifications && match.required_certifications.length > 0
                                                ? `Need ${match.required_certifications.slice(0, 2).join("/")}`
                                                : "Cert required"}
                                        </span>
                                    )}
                                    {match.eligibility === "not_eligible_size" && (
                                        <span
                                            className="text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded inline-flex items-center gap-1"
                                            title="Restricted to small businesses — your firm is too large per SBA size standards for this NAICS"
                                        >
                                            <Lock className="w-2.5 h-2.5" />
                                            Too large for SB
                                        </span>
                                    )}
                                    {/* Phase 9: keyword JACKPOT badge — when ≥2 keywords matched,
                                        this is the founder's "NAICS + keywords = jackpot" signal.
                                        Yellow flame visually screams "high-confidence match". */}
                                    {match.matched_keywords && match.matched_keywords.length >= 2 && (
                                        <span
                                            className="text-[9px] font-bold bg-yellow-100 text-yellow-900 border border-yellow-400 px-2 py-0.5 rounded inline-flex items-center gap-1"
                                            title={`Keywords matched: ${match.matched_keywords.join(", ")}`}
                                        >
                                            🔥 {match.matched_keywords.length} kw matches
                                        </span>
                                    )}
                                    {match.matched_keywords && match.matched_keywords.length === 1 && (
                                        <span
                                            className="text-[9px] font-bold bg-yellow-50 text-yellow-800 border border-yellow-200 px-2 py-0.5 rounded"
                                            title={`Keyword matched: ${match.matched_keywords[0]}`}
                                        >
                                            1 kw match
                                        </span>
                                    )}
                                </div>
                                <p className="text-[11px] text-stone-500">{cleanAgency(match.agency) || "Agency name pending"}</p>
                            </div>
                        </div>
                        {deadlineInfo && (
                            <span className={clsx(
                                "text-[10px] font-bold px-2.5 py-1 rounded-lg inline-flex items-center gap-1 flex-shrink-0 border",
                                deadlineInfo.tone === "red" ? "bg-red-50 text-red-700 border-red-200" :
                                deadlineInfo.tone === "amber" ? "bg-amber-50 text-amber-800 border-amber-200" :
                                "bg-stone-50 text-stone-600 border-stone-200"
                            )}>
                                <Clock className="w-3 h-3" />
                                {deadlineInfo.label}
                            </span>
                        )}
                    </div>

                    {/* Title */}
                    <h3 className="font-bold text-base sm:text-lg text-stone-900 leading-snug">
                        {match.title || "Untitled Opportunity"}
                    </h3>

                    {/* Why this match — explicit chip breakdown */}
                    {userNaicsLabels && (
                        <WhyMatchPanel match={match} userNaicsLabels={userNaicsLabels} />
                    )}

                    {/* Highlighted description snippet — but ONLY render if
                        description_url actually contains text content.
                        SAM.gov stores `description` as a fetch URL
                        (https://api.sam.gov/.../noticedesc?noticeid=...) for
                        un-enriched opps; rendering that URL as the description
                        text is the bug the user just reported. The "View on
                        SAM.gov" button below already covers the click-through
                        case, so hiding the raw URL is the right move. */}
                    {match.description_url && !isFetchUrl(match.description_url) && (
                        <p className="text-sm text-stone-700 leading-relaxed">
                            <HighlightedSnippet text={String(match.description_url)} terms={highlightTerms} maxLen={280} />
                        </p>
                    )}

                    {/* Phase 9: explicit matched-keywords chip row so the user
                        can SEE which of their nail-down keywords hit, not just
                        a count. Most useful for the "is this match real?" gut
                        check — if the matched keyword is super-specific
                        ("fleet maintenance for class-8 trucks"), trust is high. */}
                    {match.matched_keywords && match.matched_keywords.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                            <span className="text-stone-500 font-semibold uppercase tracking-widest">Matched keywords:</span>
                            {match.matched_keywords.slice(0, 6).map(k => (
                                <span
                                    key={k}
                                    className="bg-yellow-50 text-yellow-900 border border-yellow-200 px-2 py-0.5 rounded font-medium"
                                >{k}</span>
                            ))}
                        </div>
                    )}

                    {/* AI fit summary */}
                    {match.ai_fit_summary && (
                        <div className="bg-gradient-to-br from-emerald-50 to-blue-50 border border-emerald-100 rounded-xl p-3">
                            <div className="flex items-start gap-2">
                                <Sparkles className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                                <div className="min-w-0">
                                    <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-700 mb-0.5">Strategist&apos;s take</p>
                                    <p className="text-xs text-stone-700 leading-relaxed">{match.ai_fit_summary}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Footer: key facts + actions */}
                    <div className="flex items-center justify-between gap-3 pt-2 border-t border-stone-100">
                        <div className="flex items-center gap-2 text-[11px] text-stone-500 flex-wrap min-w-0">
                            {(() => {
                                const t = getSourceTier(match);
                                return (
                                    <span className={clsx("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border", t.color)}>
                                        {t.label}
                                    </span>
                                );
                            })()}
                            {displayNoticeType(match.notice_type) && <span>·</span>}
                            {displayNoticeType(match.notice_type) && <span>{displayNoticeType(match.notice_type)}</span>}
                            {match.naics_code && <span>·</span>}
                            {match.naics_code && <span className="font-mono">NAICS {match.naics_code}</span>}
                            {match.place_of_performance_state && <span>·</span>}
                            {match.place_of_performance_state && <span>{match.place_of_performance_state}</span>}
                        </div>
                        {samUrl && (
                            <a
                                href={samUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-stone-900 hover:bg-stone-700 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
                            >
                                {samLabel} <ExternalLink className="w-3 h-3" />
                            </a>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden transition-all">
            {/* Clickable header */}
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="w-full text-left p-4 sm:p-5 flex items-start gap-3 hover:bg-stone-50/50 transition-colors"
            >
                {/* Score badge */}
                <div className={clsx(
                    "w-11 h-11 rounded-xl border-2 font-black text-sm flex items-center justify-center flex-shrink-0",
                    match.score >= 0.70 ? "text-emerald-600 bg-emerald-50 border-emerald-200" :
                    match.score >= 0.50 ? "text-amber-600 bg-amber-50 border-amber-200" :
                    "text-blue-600 bg-blue-50 border-blue-200"
                )}>
                    {Math.round(match.score * 100)}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                        <span className="text-[9px] text-stone-400">#{rank}</span>
                        <span className={clsx(
                            "text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-widest border",
                            match.classification === "HOT" ? "bg-red-50 text-red-600 border-red-200" :
                            match.classification === "WARM" ? "bg-amber-50 text-amber-600 border-amber-200" :
                            "bg-blue-50 text-blue-600 border-blue-200"
                        )}>
                            {match.classification}
                        </span>
                        {/* Source-tier badge — Federal / State / County / City / etc.
                            Always visible so users immediately know whether they're
                            looking at a federal vs state-vs-local opportunity. */}
                        {(() => {
                            const tier = getSourceTier(match);
                            return (
                                <span className={clsx(
                                    "text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-widest border",
                                    tier.color,
                                )}>
                                    {tier.label}
                                </span>
                            );
                        })()}
                        {match.set_aside_code && (
                            <span className="text-[9px] font-bold bg-blue-100 text-blue-600 border border-blue-200 px-2 py-0.5 rounded uppercase">
                                {match.set_aside_code}
                            </span>
                        )}
                        {match.award_amount && match.award_amount > 0 && (
                            <span className="text-[9px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-0.5 rounded">
                                {formatCurrency(match.award_amount)}
                            </span>
                        )}
                    </div>
                    <p className="font-bold text-sm text-black line-clamp-2">{match.title || "Untitled Opportunity"}</p>
                    <p className="text-xs text-stone-500 mt-0.5">{cleanAgency(match.agency) || "Agency name pending"}</p>
                    {match.matched_keywords && match.matched_keywords.length > 0 && (
                        <p className="text-[10px] text-emerald-700 mt-1 truncate">
                            <span className="font-bold uppercase tracking-wider text-emerald-600">Matched:</span> {match.matched_keywords.slice(0, 4).join(" · ")}
                        </p>
                    )}
                </div>

                <ChevronDown className={clsx(
                    "w-4 h-4 text-stone-400 flex-shrink-0 mt-1 transition-transform duration-200",
                    expanded && "rotate-180"
                )} />
            </button>

            {/* AI fit summary — always visible on the card so users get instant value */}
            {match.ai_fit_summary && (
                <div className="px-4 sm:px-5 pb-4 -mt-2">
                    <div className="bg-gradient-to-br from-emerald-50 to-blue-50 border border-emerald-100 rounded-xl p-3">
                        <div className="flex items-start gap-2">
                            <Sparkles className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                            <div className="min-w-0">
                                <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-700 mb-0.5">Why this is a fit</p>
                                <p className="text-xs text-stone-700 leading-relaxed">{match.ai_fit_summary}</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Expandable detail panel */}
            {expanded && (
                <div className="border-t border-stone-100 bg-stone-50/50 px-4 sm:px-5 py-4 space-y-3">
                    {/* Description snippet — highlighted on the user's matched
                        keywords so they instantly see WHY it's relevant. Pulled
                        from description_url (which is the opportunity description
                        text on most ingest paths; helper tolerates the JSON-blob
                        shape used by some SLED sources). */}
                    {match.description_url && (
                        <div>
                            <p className="text-[10px] text-stone-400 uppercase mb-1.5">Description</p>
                            <div className="text-xs text-stone-700 leading-relaxed">
                                <HighlightedSnippet
                                    text={String(match.description_url)}
                                    terms={match.matched_keywords || []}
                                    maxLen={400}
                                />
                            </div>
                        </div>
                    )}

                    {/* Key details grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {displayNoticeType(match.notice_type) && (
                            <div className="text-xs">
                                <p className="text-[10px] text-stone-400 uppercase">Type</p>
                                <p className="font-medium text-stone-700">{displayNoticeType(match.notice_type)}</p>
                            </div>
                        )}
                        {match.naics_code && (
                            <div className="text-xs">
                                <p className="text-[10px] text-stone-400 uppercase">NAICS</p>
                                <p className="font-medium text-stone-700">{match.naics_code}</p>
                            </div>
                        )}
                        {match.response_deadline && (
                            <div className="text-xs">
                                <p className="text-[10px] text-stone-400 uppercase">Deadline</p>
                                <p className="font-medium text-stone-700">{new Date(match.response_deadline).toLocaleDateString()}</p>
                            </div>
                        )}
                        {match.place_of_performance_state && (
                            <div className="text-xs">
                                <p className="text-[10px] text-stone-400 uppercase">Location</p>
                                <p className="font-medium text-stone-700">{match.place_of_performance_state}</p>
                            </div>
                        )}
                        {match.award_amount && match.award_amount > 0 && (
                            <div className="text-xs">
                                <p className="text-[10px] text-stone-400 uppercase">Est. Value</p>
                                <p className="font-bold text-emerald-600">{formatCurrency(match.award_amount)}</p>
                            </div>
                        )}
                        {match.set_aside_code && (
                            <div className="text-xs">
                                <p className="text-[10px] text-stone-400 uppercase">Set-Aside</p>
                                <p className="font-medium text-stone-700">{match.set_aside_code}</p>
                            </div>
                        )}
                    </div>

                    {/* Matched keywords — shows the user the actual phrases that lit
                        up the keyword scorer, so they can judge whether the match is
                        real or coincidental at a glance. */}
                    {match.matched_keywords && match.matched_keywords.length > 0 && (
                        <div>
                            <p className="text-[10px] text-stone-400 uppercase mb-1.5">Why it matched — keywords found in this opportunity</p>
                            <div className="flex gap-1.5 flex-wrap">
                                {match.matched_keywords.slice(0, 8).map((kw) => (
                                    <span key={kw} className="text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                                        {kw}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Score breakdown */}
                    {match.score_breakdown && Object.keys(match.score_breakdown).length > 0 && (
                        <div>
                            <p className="text-[10px] text-stone-400 uppercase mb-1.5">Match Score Breakdown</p>
                            <div className="flex gap-1.5 flex-wrap">
                                {Object.entries(match.score_breakdown).map(([key, val]) => (
                                    <span key={key} className={clsx(
                                        "text-[9px] font-mono px-1.5 py-0.5 rounded border",
                                        val >= 0.7 ? "bg-emerald-50 text-emerald-600 border-emerald-200" :
                                        val >= 0.4 ? "bg-amber-50 text-amber-600 border-amber-200" :
                                        "bg-stone-50 text-stone-400 border-stone-200"
                                    )}>
                                        {key}: {Math.round(val * 100)}%
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Potential next steps */}
                    <div>
                        <p className="text-[10px] text-stone-400 uppercase mb-1.5">Recommended Next Steps</p>
                        <div className="space-y-1.5">
                            {getNextSteps(match.notice_type).map((step, i) => (
                                <div key={i} className="flex items-start gap-2 text-xs text-stone-600">
                                    <span className="text-[9px] font-bold bg-black text-white w-4 h-4 rounded flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                                    <span>{step}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* SAM.gov link */}
                    {samUrl && (
                        <a
                            href={samUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 border border-blue-200 px-3 py-2 rounded-xl transition-colors"
                        >
                            <ExternalLink className="w-3.5 h-3.5" /> {samLabel}
                        </a>
                    )}

                    {/* Inline CTA — bid help for the user's first concrete opportunity */}
                    <InlineCTA variant="bid_help" opportunityTitle={match.title} />
                </div>
            )}
        </div>
    );
}

// Statuses that mean the pipeline is still running (keep polling)
const IN_PROGRESS_STATUSES = new Set([
    "crawling",
    "enriching",
    "classifying",
    "scoring",
    "finding_opportunities",
    "finding_competitors",
    "generating",
]);

export default function CheckResultsPage() {
    const params = useParams();
    const [data, setData] = useState<AnalysisData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [updatedMatches, setUpdatedMatches] = useState<MatchData[] | null>(null);
    const [updatedCertRecs, setUpdatedCertRecs] = useState<CertRecommendation[] | null>(null);
    const [updatedEasyWins, setUpdatedEasyWins] = useState<EasyWin[] | null>(null);
    const [saved, setSaved] = useState(false);
    const [saving, setSaving] = useState(false);
    const [naicsEditOpen, setNaicsEditOpen] = useState(false);
    const [profileEditOpen, setProfileEditOpen] = useState(false);
    // "Save as Competitor" state — must sit with the other useStates above the
    // early-return guards, otherwise the hook count differs between the loading
    // render (12 hooks) and the loaded render (14), which throws
    // "Rendered more hooks than during the previous render".
    const [savingCompetitor, setSavingCompetitor] = useState(false);
    const [competitorId, setCompetitorId] = useState<string | null>(null);
    // PDF-export gate state — MUST be declared with the other hooks at the top
    // of the component. These were previously declared inline AFTER the early
    // conditional returns (loading / awaiting_confirmation / in-progress),
    // which caused React error #310 "rendered more hooks than during the
    // previous render" the first time status flipped to "complete".
    const [pdfGateOpen, setPdfGateOpen] = useState(false);
    const [pdfEmail, setPdfEmail] = useState("");
    const [pdfName, setPdfName] = useState("");
    const [pdfError, setPdfError] = useState("");
    const pollRef = useRef<number | null>(null);

    const analysisId = params.analysisId as string;

    useEffect(() => {
        if (!analysisId) return;
        let cancelled = false;
        // Track that the user reached the results route. Fires once per
        // mount — Meta sees "they got far enough to see results" which
        // is a stronger signal than just "they submitted the form".
        const w = window as unknown as { fbq?: (...args: unknown[]) => void };
        w.fbq?.("trackCustom", "QuickCheckResultsViewed", {
            analysis_id: analysisId,
            source: document.referrer || "direct",
        });

        const fetchOnce = async () => {
            try {
                const res = await fetch(`/api/analyze-company/status/${analysisId}`, {
                    cache: "no-store",
                });
                if (!res.ok) throw new Error("Analysis not found");
                const next = (await res.json()) as AnalysisData;
                if (cancelled) return;
                setData(next);
                setLoading(false);

                // Fire QuickCheckCompleted + standard Lead once when status
                // transitions to "complete" — strong soft-conversion signal
                // that separates engaged researchers from drive-by submitters.
                // Lead at completion is what Meta optimizes ad delivery for;
                // the custom event stays so we can build a separate audience
                // off "actually saw their report" vs "just started a check".
                if (next.status === "complete") {
                    const w2 = window as unknown as { fbq?: (...args: unknown[]) => void; __cp_qc_complete_fired?: boolean };
                    if (!w2.__cp_qc_complete_fired) {
                        w2.__cp_qc_complete_fired = true;
                        w2.fbq?.("trackCustom", "QuickCheckCompleted", { analysis_id: analysisId });
                        // Pixel + CAPI dual-fire. lead_email is the address the
                        // user gave when starting the check (if any) — Meta uses
                        // it to match to a Facebook user. Without it the event
                        // matches only on IP/UA/fbp, which is low-signal.
                        trackWithCapi("lead", {
                            user: { email: next.lead_email || null },
                            customData: {
                                content_name: "quick_check_completed",
                                content_category: "tool",
                                analysis_id: analysisId,
                            },
                        });
                    }
                }

                // Keep polling while the pipeline is still running
                if (IN_PROGRESS_STATUSES.has(next.status)) {
                    pollRef.current = window.setTimeout(fetchOnce, 3000);
                }
            } catch (err) {
                if (cancelled) return;
                setError((err as Error).message || "Failed to load");
                setLoading(false);
            }
        };

        fetchOnce();

        return () => {
            cancelled = true;
            if (pollRef.current) {
                clearTimeout(pollRef.current);
                pollRef.current = null;
            }
        };
    }, [analysisId]);

    // Called after the NAICS selection UI submits — kick off polling again
    const handleNaicsSubmitted = () => {
        setData((prev) => (prev ? { ...prev, status: "scoring" } : prev));
        if (pollRef.current) clearTimeout(pollRef.current);

        const poll = async () => {
            try {
                const res = await fetch(`/api/analyze-company/status/${analysisId}`, {
                    cache: "no-store",
                });
                if (res.ok) {
                    const next = (await res.json()) as AnalysisData;
                    setData(next);
                    if (IN_PROGRESS_STATUSES.has(next.status)) {
                        // Phase 17 — tighter cadence during scoring/generating
                        // so the progressive preview_matches landing pops in
                        // within 2s instead of 3s. Backs off once "finding_*"
                        // (longer-running phases) so we don't hammer the API.
                        const fast = next.status === "scoring" || next.status === "generating";
                        pollRef.current = window.setTimeout(poll, fast ? 2000 : 3500);
                    }
                }
            } catch { /* ignore */ }
        };
        pollRef.current = window.setTimeout(poll, 1500);
    };

    // Called after the NAICS edit modal saves — refetch data and close modal
    const handleNaicsEditSaved = async () => {
        try {
            const res = await fetch(`/api/analyze-company/status/${analysisId}`, {
                cache: "no-store",
            });
            if (res.ok) {
                const next = (await res.json()) as AnalysisData;
                setData(next);
                setUpdatedMatches(null);
                setUpdatedCertRecs(null);
                setUpdatedEasyWins(null);
            }
        } catch { /* ignore */ }
        setNaicsEditOpen(false);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-stone-50 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-stone-400 animate-spin" />
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
                <div className="text-center">
                    <p className="text-stone-500 mb-4">{error || "Analysis not found"}</p>
                    <Link href="/check" className="bg-black text-white px-6 py-3 rounded-2xl font-bold text-sm">
                        Run New Check
                    </Link>
                </div>
            </div>
        );
    }

    // AWAITING CONFIRMATION — the user reviews crawler output BEFORE we score.
    // This is the new mid-funnel step added 2026-05-18.
    if (data.status === "awaiting_confirmation") {
        const crawl = data.crawl_data as unknown as Record<string, unknown> | undefined;
        const capabilityKeywords = ((crawl?.capability_keywords as Array<{ keyword: string; tier?: "primary" | "secondary" }>) || []);
        return (
            <ConfirmFoundDataStep
                analysisId={analysisId}
                companyName={data.company_name}
                website={data.website}
                inferredNaics={data.inferred_naics || []}
                inferredProfile={data.inferred_profile || {}}
                capabilityKeywords={capabilityKeywords}
                crawlerConfidence={data.crawler_confidence}
                onSubmitted={() => {
                    // Optimistically flip status so the polling render takes over
                    setData((prev) => prev ? { ...prev, status: "scoring" } : prev);
                    if (pollRef.current) clearTimeout(pollRef.current);
                    const poll = async () => {
                        try {
                            const res = await fetch(`/api/analyze-company/status/${analysisId}`, { cache: "no-store" });
                            if (res.ok) {
                                const next = (await res.json()) as AnalysisData;
                                setData(next);
                                if (IN_PROGRESS_STATUSES.has(next.status)) {
                                    pollRef.current = window.setTimeout(poll, 3000);
                                }
                            }
                        } catch { /* ignore */ }
                    };
                    pollRef.current = window.setTimeout(poll, 2000);
                }}
            />
        );
    }

    // Pipeline still running — show the detailed progress UI with per-stage
    // descriptions, an overall progress bar, and a time-remaining countdown.
    if (IN_PROGRESS_STATUSES.has(data.status)) {
        return (
            <AnalysisLoadingScreen
                companyName={data.company_name}
                status={data.status}
            />
        );
    }

    // Set initial saved state from data
    const isSaved = saved || data.is_saved;

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await fetch("/api/prospects/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ analysis_id: analysisId }),
            });
            if (res.ok) setSaved(true);
        } catch { /* ignore */ }
        setSaving(false);
    };

    const handleExportPdf = () => {
        // If we already captured a lead, bypass the gate
        if (data.lead_email) {
            window.open(`/api/prospects/pdf/${analysisId}`, "_blank");
            return;
        }
        // Prefill from anything we already know (Apollo / SAM)
        const contact = (data.inferred_profile?.contact_person || {}) as Record<string, string>;
        setPdfEmail(contact.email || (data.inferred_profile?.email as string) || "");
        setPdfName(contact.name || "");
        setPdfError("");
        setPdfGateOpen(true);
    };

    const submitPdfGate = () => {
        const email = pdfEmail.trim();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setPdfError("Please enter a valid email");
            return;
        }
        if (!pdfName.trim()) {
            setPdfError("Please enter your name");
            return;
        }
        const qs = new URLSearchParams({ email, name: pdfName.trim() }).toString();
        window.open(`/api/prospects/pdf/${analysisId}?${qs}`, "_blank");
        setPdfGateOpen(false);
        // Locally flip the lead flag so subsequent clicks bypass the modal
        setData(prev => prev ? { ...prev, lead_email: email } : prev);
    };

    const handleSaveAsCompetitor = async () => {
        setSavingCompetitor(true);
        try {
            const res = await fetch("/api/competitors/from-analysis", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ analysis_id: analysisId }),
            });
            if (res.ok) {
                const body = await res.json() as { competitor_id?: string };
                if (body.competitor_id) setCompetitorId(body.competitor_id);
            } else if (res.status === 401) {
                window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
            }
        } catch { /* ignore */ }
        setSavingCompetitor(false);
    };

    const crawl = data.crawl_data || {};
    // Merge AI fit summaries onto the matches (summaries live in a separate JSONB column)
    const rawMatches = updatedMatches || data.preview_matches || [];
    const aiSummaries = data.ai_match_summaries || {};
    const matches = rawMatches.slice(0, 10).map((m) => ({
        ...m,
        ai_fit_summary: m.ai_fit_summary || aiSummaries[m.opportunity_id] || undefined,
    }));
    const naics = data.inferred_naics || [];
    const selectedCodes = data.selected_naics_codes || [];
    // Build a NAICS-code-to-label map so MatchCard can show "541511 — Custom
    // Computer Programming" instead of just the bare code.
    const userNaicsLabels: Record<string, string> = {};
    for (const n of naics) {
        if (n.code) userNaicsLabels[n.code] = n.label || n.code;
    }
    const readinessScore = typeof data.readiness_score === "number" ? data.readiness_score : null;
    const readinessBreakdown = data.readiness_breakdown || null;
    const certs = crawl.certifications || [];
    const hasSam = !!data.sam_data && Object.keys(data.sam_data).length > 0;
    const easyWins = updatedEasyWins || data.easy_wins || [];
    const certRecs = updatedCertRecs || data.cert_recommendations || [];

    const sam = data.sam_data;
    const profile = data.inferred_profile || {};
    const social = crawl.social_links || {};
    const leadership = crawl.leadership || [];
    const samPocs = sam?.points_of_contact || [];
    // Best key person: inferred contact_person > SAM.gov POC > crawler leadership
    const contactPerson = profile.contact_person || samPocs[0] || leadership[0] || null;
    const uei = sam?.uei || profile.uei || null;
    const cageCode = sam?.cage_code || profile.cage_code || null;
    const govSpending = (profile as Record<string, unknown>).gov_spending as {
        award_count: number; total_value: number; last_award_date: string | null;
        last_award_title: string | null; last_award_amount: number | null;
        last_award_agency: string | null; agencies: string[];
        top_awards: { title: string; amount: number; agency: string; date: string }[];
        searched_by: string;
    } | null;

    const impactColors = {
        high: "bg-red-50 text-red-700 border-red-200",
        medium: "bg-amber-50 text-amber-700 border-amber-200",
        low: "bg-blue-50 text-blue-700 border-blue-200",
    };

    const difficultyColors = {
        easy: "bg-emerald-50 text-emerald-700 border-emerald-200",
        moderate: "bg-amber-50 text-amber-700 border-amber-200",
        complex: "bg-red-50 text-red-700 border-red-200",
    };

    const fmtCurrency = (amount: number) => {
        if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
        if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
        return `$${amount.toLocaleString()}`;
    };

    // ── Soft-gate state ───────────────────────────────────────────────────────
    // The user sees Score + 3 matches before submitting the LeadMagnetForm.
    // After submit, everything else unlocks. updatedMatches is set by the form's
    // onUpdate callback (handleSubmit -> /api/lead-magnet/confirm).
    const leadCaptured = !!data.lead_captured_at || !!data.lead_email || updatedMatches !== null;
    const unlocked = leadCaptured;
    const visibleMatches = unlocked ? matches : matches.slice(0, 3);
    const gatedMatchCount = matches.length - visibleMatches.length;
    const startupPackOwned = !!data.startup_pack_unlocked_at;
    const analysisCreatedAt = data.created_at || new Date().toISOString();

    return (
        <div className="min-h-screen bg-stone-50">
            {/* Header */}
            <header className="px-4 sm:px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
                <Link href="/check" className="flex items-center space-x-2">
                    <Image src="/logo.png" alt="CP" width={20} height={20} className="rounded" />
                    <span className="font-bold text-base">CapturePilot</span>
                    <span className="text-[9px] bg-stone-200 text-stone-600 px-2 py-0.5 rounded-full uppercase">Partner</span>
                </Link>
                <Link
                    href="/check"
                    className="bg-black text-white px-4 py-2 rounded-full text-xs font-bold inline-flex items-center gap-1.5"
                >
                    New Check <ArrowRight className="w-3 h-3" />
                </Link>
            </header>

            <main className="max-w-5xl mx-auto px-4 pb-12 space-y-6 sm:space-y-8">
                {/* Company Profile Card */}
                <div className="bg-white rounded-[28px] border border-stone-200 shadow-sm overflow-hidden">
                    <div className="bg-stone-50 border-b border-stone-100 px-5 sm:px-8 py-5 sm:py-6">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <h1 className="font-bold text-xl sm:text-2xl text-black mb-1">
                                    {data.company_name}
                                </h1>
                                <div className="flex items-center gap-3 flex-wrap">
                                    <a href={data.website} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1">
                                        <Globe className="w-3 h-3" /> {data.website.replace(/^https?:\/\//, "")}
                                    </a>
                                    {uei && (
                                        <span className="text-[10px] font-bold bg-stone-100 text-stone-600 border border-stone-200 px-2 py-0.5 rounded inline-flex items-center gap-1">
                                            <Hash className="w-3 h-3" /> UEI: {uei}
                                        </span>
                                    )}
                                    {cageCode && (
                                        <span className="text-[10px] font-bold bg-stone-100 text-stone-600 border border-stone-200 px-2 py-0.5 rounded inline-flex items-center gap-1">
                                            <Building2 className="w-3 h-3" /> CAGE: {cageCode}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                                {hasSam && (
                                    <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-3 py-1.5 rounded-lg border border-emerald-200">
                                        SAM.gov Verified
                                    </span>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setProfileEditOpen(true)}
                                    className="text-[11px] font-bold px-3 py-1.5 rounded-lg border bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700 inline-flex items-center gap-1.5 transition-all print:hidden"
                                >
                                    <Target className="w-3 h-3" /> Edit Info & Re-Match
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSave}
                                    disabled={saving || !!isSaved}
                                    className={clsx(
                                        "text-[10px] font-bold px-3 py-1.5 rounded-lg border inline-flex items-center gap-1 transition-all",
                                        isSaved
                                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                            : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                                    )}
                                >
                                    {isSaved ? <CheckCircle2 className="w-3 h-3" /> : <Save className="w-3 h-3" />}
                                    {isSaved ? "Saved" : saving ? "Saving..." : "Save"}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleExportPdf}
                                    className="text-[10px] font-bold px-3 py-1.5 rounded-lg border bg-stone-100 text-stone-600 border-stone-200 hover:bg-stone-200 inline-flex items-center gap-1 transition-all print:hidden"
                                >
                                    <FileDown className="w-3 h-3" /> Export
                                </button>
                                {competitorId ? (
                                    <Link
                                        href={`/competitors/${competitorId}`}
                                        className="text-[10px] font-bold px-3 py-1.5 rounded-lg border bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 inline-flex items-center gap-1 transition-all print:hidden"
                                    >
                                        <Swords className="w-3 h-3" /> View Competitor
                                    </Link>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={handleSaveAsCompetitor}
                                        disabled={savingCompetitor}
                                        className="text-[10px] font-bold px-3 py-1.5 rounded-lg border bg-stone-900 text-white border-stone-900 hover:bg-black inline-flex items-center gap-1 transition-all print:hidden disabled:opacity-50"
                                    >
                                        <Swords className="w-3 h-3" /> {savingCompetitor ? "Saving…" : "Save as Competitor"}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="p-5 sm:p-8 space-y-5">
                        {data.company_summary && (
                            <p className="text-sm text-stone-600 leading-relaxed">{data.company_summary}</p>
                        )}

                        {/* ── Phase 13 — Strategic Brief panel (strengths/weaknesses/pitch_angles) ──
                            Surfaces the same call-ready POV that ships to HubSpot, so
                            users see it natively without bouncing to HubSpot. Only renders
                            if the deep-extract pipeline populated at least one field. */}
                        {(crawl.strengths?.length || crawl.weaknesses?.length || crawl.pitch_angles?.length) ? (
                            <StrategicBriefPanel
                                strengths={crawl.strengths || []}
                                weaknesses={crawl.weaknesses || []}
                                pitchAngles={crawl.pitch_angles || []}
                                nailDownKeywords={crawl.nail_down_keywords || []}
                                federalAgenciesServed={crawl.federal_agencies_served || []}
                                revenueSignal={crawl.revenue_signal || null}
                                firmographics={data.firmographics || null}
                            />
                        ) : null}

                        {/* ── Phase 20 — geo expansion banner ──
                            High-leverage nudge: most first-time bidders under-target
                            geographically. Shows top 3 states they're NOT yet targeting
                            ranked by opp count in their primary NAICS. Only renders if
                            at least 1 untapped state has ≥1 opp. */}
                        {data.geo_expansion && data.geo_expansion.total_potential_opps > 0 && (
                            <GeoExpansionBanner expansion={data.geo_expansion} />
                        )}

                        {/* Quick Stats */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {crawl.detected_states?.[0] && (
                                <div className="bg-stone-50 border border-stone-200 rounded-xl p-3">
                                    <MapPin className="w-4 h-4 text-stone-400 mb-1" />
                                    <p className="text-[10px] text-stone-400 uppercase">Location</p>
                                    <p className="font-bold text-sm">{crawl.detected_states.join(", ")}</p>
                                </div>
                            )}
                            {crawl.employee_signals && (
                                <div className="bg-stone-50 border border-stone-200 rounded-xl p-3">
                                    <Users className="w-4 h-4 text-stone-400 mb-1" />
                                    <p className="text-[10px] text-stone-400 uppercase">Employees</p>
                                    <p className="font-bold text-sm">~{crawl.employee_signals.estimate}</p>
                                </div>
                            )}
                            {crawl.founding_year && (
                                <div className="bg-stone-50 border border-stone-200 rounded-xl p-3">
                                    <Calendar className="w-4 h-4 text-stone-400 mb-1" />
                                    <p className="text-[10px] text-stone-400 uppercase">Est.</p>
                                    <p className="font-bold text-sm">{crawl.founding_year} ({new Date().getFullYear() - crawl.founding_year} yrs)</p>
                                </div>
                            )}
                            {crawl.pages_crawled && (
                                <div className="bg-stone-50 border border-stone-200 rounded-xl p-3">
                                    <Globe className="w-4 h-4 text-stone-400 mb-1" />
                                    <p className="text-[10px] text-stone-400 uppercase">Pages Analyzed</p>
                                    <p className="font-bold text-sm">{crawl.pages_crawled.length}</p>
                                </div>
                            )}
                        </div>

                        {/* Services */}
                        {crawl.services && crawl.services.length > 0 && (
                            <div>
                                <p className="text-[10px] text-stone-400 uppercase tracking-widest mb-2">Detected Services</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {crawl.services.slice(0, 10).map((s, i) => (
                                        <span key={i} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-lg">{s}</span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Certifications */}
                        {certs.length > 0 && (
                            <div>
                                <p className="text-[10px] text-stone-400 uppercase tracking-widest mb-2">Certification Signals</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {certs.map((c, i) => (
                                        <span key={i} className={clsx(
                                            "text-xs font-bold px-2.5 py-1 rounded-lg border",
                                            c.confidence >= 0.7 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"
                                        )}>
                                            {c.type} ({Math.round(c.confidence * 100)}%)
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Public contact — only show company-level info, no personal data */}
                        {sam?.phone && (
                            <div>
                                <p className="text-[10px] text-stone-400 uppercase tracking-widest mb-2">
                                    <Building2 className="w-3 h-3 inline mr-1" />Company Contact
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {sam.phone && (
                                        <span className="text-xs bg-stone-50 text-stone-600 border border-stone-200 px-2.5 py-1 rounded-lg inline-flex items-center gap-1">
                                            <Phone className="w-3 h-3" /> {sam.phone}
                                        </span>
                                    )}
                                    {data.website && (
                                        <a href={data.website} target="_blank" rel="noopener noreferrer" className="text-xs bg-stone-50 text-stone-600 border border-stone-200 px-2.5 py-1 rounded-lg inline-flex items-center gap-1 hover:border-blue-300 transition-colors">
                                            <Globe className="w-3 h-3" /> Website
                                        </a>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Government Spending History */}
                        {govSpending && govSpending.award_count > 0 && (
                            <div>
                                <p className="text-[10px] text-stone-400 uppercase tracking-widest mb-2">
                                    <DollarSign className="w-3 h-3 inline mr-1" />Federal Contract History
                                    {govSpending.searched_by === "uei" && <span className="ml-2 text-emerald-500">(UEI verified)</span>}
                                </p>
                                <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-3">
                                    {/* Summary stats */}
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="text-center">
                                            <p className="text-lg font-black text-stone-800">{govSpending.award_count}</p>
                                            <p className="text-[9px] text-stone-400 uppercase">Awards</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-lg font-black text-emerald-600">{fmtCurrency(govSpending.total_value)}</p>
                                            <p className="text-[9px] text-stone-400 uppercase">Total Value</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-lg font-black text-stone-800">{govSpending.agencies.length}</p>
                                            <p className="text-[9px] text-stone-400 uppercase">Agencies</p>
                                        </div>
                                    </div>

                                    {/* Last award */}
                                    {govSpending.last_award_date && (
                                        <div className="border-t border-stone-200 pt-3">
                                            <p className="text-[9px] text-stone-400 uppercase mb-1">Most Recent Award</p>
                                            <div className="flex items-start gap-2">
                                                <Award className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-bold text-stone-700 leading-tight">
                                                        {govSpending.last_award_title || "Award"}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                        <span className="text-[10px] text-stone-500">
                                                            <Calendar className="w-3 h-3 inline mr-0.5" />
                                                            {new Date(govSpending.last_award_date).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                                                        </span>
                                                        {govSpending.last_award_amount && (
                                                            <span className="text-[10px] font-bold text-emerald-600">
                                                                {fmtCurrency(govSpending.last_award_amount)}
                                                            </span>
                                                        )}
                                                        {govSpending.last_award_agency && (
                                                            <span className="text-[10px] text-stone-400">{govSpending.last_award_agency}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Top awards */}
                                    {govSpending.top_awards.length > 1 && (
                                        <div className="border-t border-stone-200 pt-3">
                                            <p className="text-[9px] text-stone-400 uppercase mb-2">Top Awards by Value</p>
                                            <div className="space-y-1.5">
                                                {govSpending.top_awards.slice(0, 3).map((award, i) => (
                                                    <div key={i} className="flex items-center justify-between text-xs">
                                                        <span className="text-stone-600 truncate flex-1 mr-2">{award.title || "Award"}</span>
                                                        <span className="font-bold text-stone-800 flex-shrink-0">{fmtCurrency(award.amount)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Agencies worked with */}
                                    {govSpending.agencies.length > 0 && (
                                        <div className="border-t border-stone-200 pt-3">
                                            <p className="text-[9px] text-stone-400 uppercase mb-1.5">Agencies</p>
                                            <div className="flex flex-wrap gap-1">
                                                {govSpending.agencies.slice(0, 6).map((agency, i) => (
                                                    <span key={i} className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-lg">
                                                        {agency}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Social links hidden from public view — data still enriched in admin */}
                    </div>
                </div>

                {/* Government Contracting Readiness Score */}
                {readinessScore !== null && (
                    <ReadinessScoreCard score={readinessScore} breakdown={readinessBreakdown} />
                )}

                {/* Inline CTA — fires when SAM.gov is the #1 fix. Most leads land here. */}
                {!hasSam && (
                    <InlineCTA variant="sam_registration" analysisId={analysisId} />
                )}

                {/* LEAD CAPTURE — only show until the user submits */}
                {!leadCaptured && (
                    <LeadMagnetForm
                        analysisId={analysisId}
                        inferredProfile={profile}
                        inferredNaics={naics}
                        crawlerConfidence={data.crawler_confidence}
                        requireContact
                        onUpdate={(d) => {
                            setUpdatedMatches(d.updated_matches as MatchData[]);
                            setUpdatedCertRecs(d.cert_recommendations as CertRecommendation[]);
                            setUpdatedEasyWins(d.easy_wins as EasyWin[]);
                        }}
                    />
                )}

                {/* Top Matching Opportunities — first 3 always visible, rest gated */}
                <div>
                    <h2 className="font-bold text-lg flex items-center mb-2 px-1">
                        <Target className="w-5 h-5 mr-2" /> Best Matching Opportunities
                        {matches.length > 0 && (
                            <span className="ml-3 text-sm font-sans font-medium bg-emerald-100 px-3 py-1 rounded-full text-emerald-700 border border-emerald-200">
                                Top {matches.length}
                            </span>
                        )}
                    </h2>
                    {selectedCodes.length > 0 && (
                        <p className="text-xs text-stone-500 mb-2 px-1">
                            Scored against NAICS: {selectedCodes.map((c) => (
                                <span key={c} className="font-mono font-bold bg-stone-100 px-1.5 py-0.5 rounded border border-stone-200 mx-0.5">{c}</span>
                            ))}
                        </p>
                    )}
                    {/* Coverage breakdown — surfaces that we now query across federal +
                        state/local + grant pipelines (post-Tag 6 SLED + RSS rollout). */}
                    {matches.length > 0 && (() => {
                        const tally: Record<string, number> = { federal: 0, state: 0, county: 0, city: 0, subcontract: 0, grant: 0, unknown: 0 };
                        for (const m of matches) tally[getSourceTier(m).tier] = (tally[getSourceTier(m).tier] || 0) + 1;
                        const items: Array<{ label: string; n: number; color: string }> = [
                            { label: "Federal", n: tally.federal, color: "bg-blue-50 text-blue-700 border-blue-200" },
                            { label: "State", n: tally.state, color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
                            { label: "County", n: tally.county, color: "bg-teal-50 text-teal-700 border-teal-200" },
                            { label: "City", n: tally.city, color: "bg-cyan-50 text-cyan-700 border-cyan-200" },
                            { label: "Subcontracting", n: tally.subcontract, color: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200" },
                            { label: "Grant", n: tally.grant, color: "bg-violet-50 text-violet-700 border-violet-200" },
                        ].filter(x => x.n > 0);
                        if (items.length === 0) return null;
                        return (
                            <div className="flex items-center gap-2 mb-4 px-1 flex-wrap">
                                <span className="text-[10px] uppercase tracking-widest text-stone-400 font-bold">Coverage</span>
                                {items.map((x) => (
                                    <span key={x.label} className={clsx("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border", x.color)}>
                                        <span>{x.label}</span>
                                        <span className="bg-white/80 rounded-full px-1.5 py-0 text-[10px]">{x.n}</span>
                                    </span>
                                ))}
                            </div>
                        );
                    })()}

                    {matches.length > 0 ? (
                        <div className="space-y-3 relative">
                            {visibleMatches.map((match, i) => (
                                <MatchCard
                                    key={match.opportunity_id}
                                    match={match}
                                    rank={i + 1}
                                    hero
                                    userNaicsLabels={userNaicsLabels}
                                />
                            ))}
                            {!unlocked && gatedMatchCount > 0 && (
                                <div className="relative">
                                    {/* Render the next match blurred + locked overlay */}
                                    <div className="pointer-events-none select-none filter blur-[3px] opacity-50">
                                        {matches.slice(3, 5).map((match, i) => (
                                            <MatchCard
                                                key={match.opportunity_id}
                                                match={match}
                                                rank={i + 4}
                                                hero
                                                userNaicsLabels={userNaicsLabels}
                                            />
                                        ))}
                                    </div>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
                                        <div className="bg-white border-2 border-emerald-300 shadow-xl rounded-2xl px-6 py-5 max-w-sm">
                                            <Unlock className="w-6 h-6 text-emerald-600 mx-auto mb-2" />
                                            <p className="font-black text-base text-stone-900">
                                                +{gatedMatchCount} more opportunities locked
                                            </p>
                                            <p className="text-xs text-stone-500 mt-1.5 leading-relaxed">
                                                Submit your email above to unlock all matches, the full readiness breakdown and your $70 Federal Launch Kit.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="bg-stone-50 border border-stone-200 border-dashed rounded-2xl p-8 text-center">
                            <Briefcase className="w-10 h-10 text-stone-300 mx-auto mb-3" />
                            <p className="text-stone-500 mb-2">No matches found</p>
                            <p className="text-stone-400 text-sm">This company may not match any current federal opportunities.</p>
                        </div>
                    )}
                </div>

                {/* STARTUP PACK OFFER — only shown once we have the lead */}
                {leadCaptured && (
                    <StartupPackOfferCard
                        analysisId={analysisId}
                        analysisCreatedAt={analysisCreatedAt}
                        leadEmail={data.lead_email || (profile.email as string | undefined)}
                        alreadyOwned={startupPackOwned}
                        downloadUrl={startupPackOwned ? `/startup-pack/success?aid=${analysisId}` : undefined}
                    />
                )}

                {/* Your Federal Opportunity Landscape — moved below the offer */}
                {unlocked && <OpportunityLandscape stats={data.opportunity_stats} />}

                {/* Top 5 Competitors — gated */}
                {unlocked && data.competitors && data.competitors.length > 0 && (
                    <div>
                        <h2 className="font-bold text-lg flex items-center mb-4 px-1">
                            <Swords className="w-5 h-5 mr-2" /> Top {data.competitors.length} Competitors
                            <span className="ml-3 text-sm font-sans font-medium bg-stone-100 px-3 py-1 rounded-full text-stone-700 border border-stone-200">
                                By federal awards
                            </span>
                        </h2>
                        <p className="text-xs text-stone-500 mb-4 px-1">
                            Companies competing for the same federal opportunities, based on NAICS overlap and past award history.
                        </p>
                        <div className="space-y-3">
                            {data.competitors.map((comp, i) => (
                                <CompetitorCard key={`${comp.name}-${i}`} comp={comp} rank={i + 1} />
                            ))}
                        </div>
                    </div>
                )}

                {/* Urgency / conversion bottom section — gated */}
                {unlocked && <ConversionBottomSection stats={data.opportunity_stats} />}

                {/* Easy Wins Section — gated */}
                {unlocked && easyWins.length > 0 && (
                    <div className="bg-white rounded-[28px] border border-stone-200 shadow-sm overflow-hidden">
                        <div className="bg-stone-50 border-b border-stone-100 px-5 sm:px-8 py-4">
                            <h2 className="font-bold text-base flex items-center">
                                <TrendingUp className="w-4 h-4 mr-2 text-emerald-500" /> Quick Wins to Improve Your Position
                            </h2>
                        </div>
                        <div className="p-5 sm:p-8 grid gap-3">
                            {easyWins.map((win, i) => (
                                <div key={i} className="flex items-start gap-3 p-3 bg-stone-50 rounded-xl border border-stone-100">
                                    <div className="flex-shrink-0 mt-0.5">
                                        {win.category === "registration" ? <Shield className="w-5 h-5 text-red-500" /> :
                                         win.category === "certifications" ? <Award className="w-5 h-5 text-amber-500" /> :
                                         win.category === "website" ? <Globe className="w-5 h-5 text-blue-500" /> :
                                         <TrendingUp className="w-5 h-5 text-emerald-500" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <p className="font-bold text-sm text-black">{win.title}</p>
                                            <span className={clsx(
                                                "text-[9px] font-bold px-2 py-0.5 rounded border uppercase",
                                                impactColors[win.impact]
                                            )}>
                                                {win.impact}
                                            </span>
                                        </div>
                                        <p className="text-xs text-stone-500 leading-relaxed">{win.description}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Certification Recommendations — gated */}
                {unlocked && certRecs.length > 0 && (
                    <div className="bg-white rounded-[28px] border border-stone-200 shadow-sm overflow-hidden">
                        <div className="bg-stone-50 border-b border-stone-100 px-5 sm:px-8 py-4">
                            <h2 className="font-bold text-base flex items-center">
                                <Unlock className="w-4 h-4 mr-2 text-blue-500" /> Certifications That Could Unlock Opportunities
                            </h2>
                        </div>
                        <div className="p-5 sm:p-8 space-y-4">
                            {certRecs.map((rec, i) => (
                                <div key={i} className="border border-stone-200 rounded-xl p-4 hover:border-stone-300 transition-colors">
                                    <div className="flex items-start justify-between mb-2">
                                        <div>
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <p className="font-bold text-sm text-black">{rec.cert_label}</p>
                                                <span className={clsx(
                                                    "text-[9px] font-bold px-2 py-0.5 rounded border uppercase",
                                                    difficultyColors[rec.difficulty]
                                                )}>
                                                    {rec.difficulty}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-3 text-xs text-stone-500">
                                                <span className="inline-flex items-center gap-1">
                                                    <Clock className="w-3 h-3" /> {rec.timeline}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <p className="font-black text-lg text-emerald-600">+{rec.unlocked_count}</p>
                                            <p className="text-[10px] text-stone-400 uppercase">new opps</p>
                                        </div>
                                    </div>

                                    {rec.estimated_value > 0 && (
                                        <p className="text-xs text-stone-500 mb-2">
                                            Est. value: <span className="font-bold text-stone-700">${(rec.estimated_value / 1000000).toFixed(1)}M</span>
                                        </p>
                                    )}

                                    {rec.sample_opps.length > 0 && (
                                        <div className="space-y-1.5 mt-2 pt-2 border-t border-stone-100">
                                            <p className="text-[10px] text-stone-400 uppercase">Sample opportunities:</p>
                                            {rec.sample_opps.map((opp, j) => (
                                                <div key={j} className="flex items-center gap-2 text-xs">
                                                    <span className="text-[9px] font-bold bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded">
                                                        {opp.set_aside_code}
                                                    </span>
                                                    <span className="text-stone-700 truncate">{opp.title}</span>
                                                    <span className="text-stone-400 flex-shrink-0 text-[10px]">{opp.agency}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* NAICS Classification */}
                {naics.length > 0 && (
                    <div className="bg-white rounded-[28px] border border-stone-200 shadow-sm overflow-hidden">
                        <div className="bg-stone-50 border-b border-stone-100 px-5 sm:px-8 py-4 flex items-center justify-between gap-3">
                            <h2 className="font-bold text-base flex items-center">
                                <Target className="w-4 h-4 mr-2 text-stone-400" /> Inferred NAICS Codes
                            </h2>
                            <button
                                type="button"
                                onClick={() => setNaicsEditOpen(true)}
                                className="text-xs font-bold bg-emerald-50 border border-emerald-300 hover:bg-emerald-100 hover:border-emerald-500 text-emerald-700 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                            >
                                <Target className="w-3 h-3" /> Edit & Re-Match
                            </button>
                        </div>
                        <div className="p-5 sm:p-8 space-y-3">
                            {naics.map((n) => (
                                <div key={n.code} className="flex items-center gap-3">
                                    <span className="font-mono text-sm font-bold bg-stone-100 px-2.5 py-1 rounded border border-stone-200 w-20 text-center flex-shrink-0">
                                        {n.code}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-black truncate">{n.label}</p>
                                        <div className="mt-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                                            <div
                                                className={clsx(
                                                    "h-full rounded-full transition-all",
                                                    n.confidence >= 0.7 ? "bg-emerald-500" : n.confidence >= 0.4 ? "bg-amber-500" : "bg-stone-400"
                                                )}
                                                style={{ width: `${Math.round(n.confidence * 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                    <span className={clsx(
                                        "text-xs font-bold flex-shrink-0",
                                        n.confidence >= 0.7 ? "text-emerald-600" : n.confidence >= 0.4 ? "text-amber-600" : "text-stone-500"
                                    )}>
                                        {Math.round(n.confidence * 100)}%
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Last-chance lead capture — only shown when gate is still active */}
                {!leadCaptured && (
                    <div className="bg-gradient-to-br from-emerald-50 to-blue-50 border-2 border-emerald-300 rounded-[28px] p-6 sm:p-8 text-center shadow-md">
                        <Unlock className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                        <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Still Locked</p>
                        <h3 className="font-black text-xl sm:text-2xl text-stone-900 mt-1">
                            Unlock the rest of your report
                        </h3>
                        <p className="text-sm text-stone-600 mt-2 max-w-md mx-auto">
                            7 more matches, federal landscape stats, competitor intel, easy-wins checklist and certification roadmap.
                            Plus your $70 Federal Launch Kit offer — but only for the next few days.
                        </p>
                        <a
                            href="#lead-form"
                            onClick={(e) => {
                                e.preventDefault();
                                document.querySelector("input[type=email]")?.scrollIntoView({ behavior: "smooth", block: "center" });
                            }}
                            className="mt-4 inline-flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-blue-600 text-white px-6 py-3 rounded-2xl font-bold text-sm shadow-md hover:opacity-95 transition-all"
                        >
                            <Mail className="w-4 h-4" /> Send My Full Report
                        </a>
                    </div>
                )}

                {/* Done-For-You — highest-ticket CTA, shown only to unlocked leads */}
                {unlocked && (
                    <InlineCTA variant="done_for_you" analysisId={analysisId} />
                )}

                {/* Bottom Actions */}
                <div className="flex flex-col sm:flex-row gap-3 pt-4">
                    <Link
                        href="/check"
                        className="flex-1 bg-black text-white rounded-2xl p-4 flex items-center justify-center gap-2 font-bold text-sm hover:bg-stone-800 transition-all"
                    >
                        <Search className="w-4 h-4" /> Run Another Check
                    </Link>
                    <a
                        href="https://calendly.com/capturepilot/strategy-call"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 bg-white border border-stone-200 rounded-2xl p-4 flex items-center justify-center gap-2 font-bold text-sm text-black hover:shadow-md transition-all"
                    >
                        <Shield className="w-4 h-4 text-blue-600" /> Book Strategy Call
                    </a>
                </div>
            </main>

            {/* NAICS edit modal — kept around for the inline "Edit codes" CTA
                next to the NAICS list. */}
            {naicsEditOpen && (
                <NaicsEditModal
                    analysisId={analysisId}
                    initialCodes={naics.map(n => ({ code: n.code, label: n.label }))}
                    onClose={() => setNaicsEditOpen(false)}
                    onSaved={handleNaicsEditSaved}
                />
            )}

            {/* Full profile editor — top-of-page CTA. Edits company name, state,
                primary keywords, NAICS codes, target states in one pass, then
                rescores against the new profile. */}
            {profileEditOpen && (
                <ProfileEditModal
                    analysisId={analysisId}
                    initialCompanyName={data.company_name || ""}
                    initialState={(profile.state as string | null) || ""}
                    initialPrimaryKeywords={((profile.primary_keywords as Array<{ keyword?: string }> | undefined) || [])
                        .map(k => String(k?.keyword || "").trim())
                        .filter(k => k.length >= 2)}
                    initialNaicsCodes={naics.map(n => ({ code: n.code, label: n.label }))}
                    initialTargetStates={(profile.target_states as string[] | undefined) || []}
                    initialSamRegistered={hasSam}
                    initialYearFounded={(() => {
                        const c = (crawl || {}) as Record<string, unknown>;
                        const fy = (c.founded_year as number | undefined) || (c.founding_year as number | undefined);
                        if (fy && fy > 1800) return fy;
                        const yib = profile.years_in_business as number | undefined;
                        if (yib && yib > 0) return new Date().getFullYear() - yib;
                        return null;
                    })()}
                    initialSbaCertifications={(() => {
                        const fromProfile = (profile.sba_certifications as string[] | undefined) || [];
                        if (fromProfile.length > 0) return fromProfile;
                        const fromSam = ((data.sam_data as { sba_certifications?: string[] } | null)?.sba_certifications) || [];
                        const c = (crawl || {}) as Record<string, unknown>;
                        const fromCrawl = ((c.certifications as Array<{ type: string }> | undefined) || []).map(c => c.type);
                        return [...fromSam, ...fromCrawl].filter((v, i, a) => a.indexOf(v) === i);
                    })()}
                    initialPastAwardsCount={(() => {
                        const gs = profile.gov_spending as { award_count?: number } | undefined;
                        return gs?.award_count || 0;
                    })()}
                    onClose={() => setProfileEditOpen(false)}
                    onSaved={async () => {
                        setProfileEditOpen(false);
                        await handleNaicsEditSaved();
                    }}
                />
            )}

            {/* PDF download gate — captures email + name before opening the PDF */}
            {pdfGateOpen && (
                <div
                    className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center px-4"
                    onClick={() => setPdfGateOpen(false)}
                >
                    <div
                        className="bg-white rounded-[28px] shadow-xl max-w-md w-full p-6 sm:p-7"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-2 mb-1">
                            <FileDown className="w-4 h-4 text-emerald-600" />
                            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Download PDF Report</p>
                        </div>
                        <h2 className="font-black text-xl text-stone-900">Where should we send your report?</h2>
                        <p className="text-sm text-stone-500 mt-2">
                            We&apos;ll generate a personalized PDF with your readiness score, top matches and recommended next steps.
                        </p>
                        <div className="mt-5 space-y-3">
                            <div>
                                <label className="block text-xs font-bold text-stone-600 mb-1.5">Your name</label>
                                <input
                                    type="text"
                                    value={pdfName}
                                    onChange={(e) => setPdfName(e.target.value)}
                                    placeholder="Jane Doe"
                                    className="w-full px-4 py-2.5 rounded-xl border-2 border-stone-200 text-sm focus:outline-none focus:ring-4 focus:ring-emerald-100 focus:border-emerald-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-stone-600 mb-1.5">Work email</label>
                                <input
                                    type="email"
                                    value={pdfEmail}
                                    onChange={(e) => setPdfEmail(e.target.value)}
                                    placeholder="you@company.com"
                                    className="w-full px-4 py-2.5 rounded-xl border-2 border-stone-200 text-sm focus:outline-none focus:ring-4 focus:ring-emerald-100 focus:border-emerald-500"
                                    autoFocus
                                />
                            </div>
                            {pdfError && (
                                <div className="bg-red-50 text-red-600 text-xs p-2.5 rounded-lg border border-red-200">
                                    {pdfError}
                                </div>
                            )}
                            <button
                                type="button"
                                onClick={submitPdfGate}
                                className="w-full bg-gradient-to-r from-emerald-600 to-blue-600 text-white py-3 rounded-2xl font-black text-sm hover:opacity-95 transition-all flex items-center justify-center gap-2 shadow-md"
                            >
                                <FileDown className="w-4 h-4" /> Download My PDF Report
                            </button>
                            <p className="text-[10px] text-stone-400 text-center">
                                Used to send your report. No spam · Unsubscribe anytime.
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
