"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
    MapPin, Users, Calendar, Target, Search, Sparkles,
    ArrowRight, Globe, Phone, Mail, Loader2, Briefcase, Shield,
    TrendingUp, Award, ChevronDown, Clock, Unlock, ExternalLink, DollarSign,
    Linkedin, Facebook, Twitter, Save, FileDown, CheckCircle2, User, Building2, Hash,
    Swords, AlertTriangle
} from "lucide-react";
import Image from "next/image";
import clsx from "clsx";
import { LeadMagnetForm } from "@/components/LeadMagnetForm";
import { OpportunityLandscape, ConversionBottomSection, type OpportunityStats } from "@/components/OpportunityLandscape";
import ReadinessScoreCard from "@/components/ReadinessScoreCard";
import NaicsEditModal from "@/components/NaicsEditModal";
import StartupPackOfferCard from "@/components/StartupPackOfferCard";

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
    ai_fit_summary?: string;
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
    };
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

function MatchCard({ match, rank }: { match: MatchData; rank: number }) {
    const [expanded, setExpanded] = useState(false);

    const samUrl = match.notice_id
        ? `https://sam.gov/opp/${match.notice_id}/view`
        : null;

    const formatCurrency = (amount: number) => {
        if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
        if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
        return `$${amount.toLocaleString()}`;
    };

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
                    <p className="text-xs text-stone-500 mt-0.5">{match.agency || "Federal Agency"}</p>
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
                    {/* Key details grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {match.notice_type && (
                            <div className="text-xs">
                                <p className="text-[10px] text-stone-400 uppercase">Type</p>
                                <p className="font-medium text-stone-700">{match.notice_type}</p>
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
                            <ExternalLink className="w-3.5 h-3.5" /> View on SAM.gov
                        </a>
                    )}
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
    // "Save as Competitor" state — must sit with the other useStates above the
    // early-return guards, otherwise the hook count differs between the loading
    // render (12 hooks) and the loaded render (14), which throws
    // "Rendered more hooks than during the previous render".
    const [savingCompetitor, setSavingCompetitor] = useState(false);
    const [competitorId, setCompetitorId] = useState<string | null>(null);
    const pollRef = useRef<number | null>(null);

    const analysisId = params.analysisId as string;

    useEffect(() => {
        if (!analysisId) return;
        let cancelled = false;

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
                        pollRef.current = window.setTimeout(poll, 3000);
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

    // Pipeline still running — show lightweight progress state
    if (IN_PROGRESS_STATUSES.has(data.status)) {
        const stageLabel: Record<string, string> = {
            crawling: "Crawling your website...",
            enriching: "Enriching with SAM.gov data...",
            classifying: "Classifying your industries...",
            scoring: "Scoring opportunities...",
            finding_opportunities: "Finding opportunities...",
            finding_competitors: "Finding your competitors...",
            generating: "Generating insights...",
        };
        return (
            <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
                <div className="text-center max-w-md">
                    <Loader2 className="w-10 h-10 text-emerald-500 animate-spin mx-auto mb-4" />
                    <h2 className="font-bold text-lg mb-1">Analyzing {data.company_name}</h2>
                    <p className="text-sm text-stone-500">{stageLabel[data.status] || "Processing..."}</p>
                </div>
            </div>
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
        window.open(`/api/prospects/pdf/${analysisId}`, "_blank");
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
                            <div className="flex items-center gap-2 flex-shrink-0">
                                {hasSam && (
                                    <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-3 py-1.5 rounded-lg border border-emerald-200">
                                        SAM.gov Verified
                                    </span>
                                )}
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
                        <p className="text-xs text-stone-500 mb-4 px-1">
                            Scored against NAICS: {selectedCodes.map((c) => (
                                <span key={c} className="font-mono font-bold bg-stone-100 px-1.5 py-0.5 rounded border border-stone-200 mx-0.5">{c}</span>
                            ))}
                        </p>
                    )}

                    {matches.length > 0 ? (
                        <div className="space-y-3 relative">
                            {visibleMatches.map((match, i) => (
                                <MatchCard key={match.opportunity_id} match={match} rank={i + 1} />
                            ))}
                            {!unlocked && gatedMatchCount > 0 && (
                                <div className="relative">
                                    {/* Render the next match blurred + locked overlay */}
                                    <div className="pointer-events-none select-none filter blur-[3px] opacity-50">
                                        {matches.slice(3, 5).map((match, i) => (
                                            <MatchCard key={match.opportunity_id} match={match} rank={i + 4} />
                                        ))}
                                    </div>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
                                        <div className="bg-white border-2 border-emerald-300 shadow-xl rounded-2xl px-6 py-5 max-w-sm">
                                            <Unlock className="w-6 h-6 text-emerald-600 mx-auto mb-2" />
                                            <p className="font-black text-base text-stone-900">
                                                +{gatedMatchCount} more opportunities locked
                                            </p>
                                            <p className="text-xs text-stone-500 mt-1.5 leading-relaxed">
                                                Submit your email above to unlock all matches, the full readiness breakdown and your $70 founder pack.
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
                                className="text-xs font-bold bg-white border border-stone-200 hover:border-emerald-400 hover:text-emerald-700 text-stone-700 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                            >
                                <Target className="w-3 h-3" /> Edit codes
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
                            Plus your $70 founder-pack offer — but only for the next few days.
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

            {/* NAICS edit modal */}
            {naicsEditOpen && (
                <NaicsEditModal
                    analysisId={analysisId}
                    initialCodes={naics.map(n => ({ code: n.code, label: n.label }))}
                    onClose={() => setNaicsEditOpen(false)}
                    onSaved={handleNaicsEditSaved}
                />
            )}
        </div>
    );
}
