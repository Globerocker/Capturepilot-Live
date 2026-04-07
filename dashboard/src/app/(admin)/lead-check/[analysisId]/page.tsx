"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
    Zap, MapPin, Users, Calendar, Target,
    ArrowRight, Globe, Phone, Mail, Loader2, Briefcase, Shield,
    TrendingUp, Award, ChevronDown, Clock, Unlock, ExternalLink, DollarSign,
    Linkedin, Facebook, Twitter, Save, FileDown, CheckCircle2, User, Building2, Hash
} from "lucide-react";
import clsx from "clsx";
import { LeadMagnetForm } from "@/components/LeadMagnetForm";

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
    crawler_confidence?: number;
    is_saved?: boolean;
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
                    "w-11 h-11 rounded-xl border-2 font-black font-typewriter text-sm flex items-center justify-center flex-shrink-0",
                    match.score >= 0.70 ? "text-emerald-600 bg-emerald-50 border-emerald-200" :
                    match.score >= 0.50 ? "text-amber-600 bg-amber-50 border-amber-200" :
                    "text-blue-600 bg-blue-50 border-blue-200"
                )}>
                    {Math.round(match.score * 100)}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                        <span className="text-[9px] font-typewriter text-stone-400">#{rank}</span>
                        <span className={clsx(
                            "text-[9px] font-typewriter font-bold px-2 py-0.5 rounded uppercase tracking-widest border",
                            match.classification === "HOT" ? "bg-red-50 text-red-600 border-red-200" :
                            match.classification === "WARM" ? "bg-amber-50 text-amber-600 border-amber-200" :
                            "bg-blue-50 text-blue-600 border-blue-200"
                        )}>
                            {match.classification}
                        </span>
                        {match.set_aside_code && (
                            <span className="text-[9px] font-typewriter font-bold bg-blue-100 text-blue-600 border border-blue-200 px-2 py-0.5 rounded uppercase">
                                {match.set_aside_code}
                            </span>
                        )}
                        {match.award_amount && match.award_amount > 0 && (
                            <span className="text-[9px] font-typewriter font-bold bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-0.5 rounded">
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

            {/* Expandable detail panel */}
            {expanded && (
                <div className="border-t border-stone-100 bg-stone-50/50 px-4 sm:px-5 py-4 space-y-3">
                    {/* Key details grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {match.notice_type && (
                            <div className="text-xs">
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase">Type</p>
                                <p className="font-medium text-stone-700">{match.notice_type}</p>
                            </div>
                        )}
                        {match.naics_code && (
                            <div className="text-xs">
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase">NAICS</p>
                                <p className="font-medium text-stone-700">{match.naics_code}</p>
                            </div>
                        )}
                        {match.response_deadline && (
                            <div className="text-xs">
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase">Deadline</p>
                                <p className="font-medium text-stone-700">{new Date(match.response_deadline).toLocaleDateString()}</p>
                            </div>
                        )}
                        {match.place_of_performance_state && (
                            <div className="text-xs">
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase">Location</p>
                                <p className="font-medium text-stone-700">{match.place_of_performance_state}</p>
                            </div>
                        )}
                        {match.award_amount && match.award_amount > 0 && (
                            <div className="text-xs">
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase">Est. Value</p>
                                <p className="font-bold text-emerald-600">{formatCurrency(match.award_amount)}</p>
                            </div>
                        )}
                        {match.set_aside_code && (
                            <div className="text-xs">
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase">Set-Aside</p>
                                <p className="font-medium text-stone-700">{match.set_aside_code}</p>
                            </div>
                        )}
                    </div>

                    {/* Score breakdown */}
                    {match.score_breakdown && Object.keys(match.score_breakdown).length > 0 && (
                        <div>
                            <p className="text-[10px] font-typewriter text-stone-400 uppercase mb-1.5">Match Score Breakdown</p>
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
                        <p className="text-[10px] font-typewriter text-stone-400 uppercase mb-1.5">Recommended Next Steps</p>
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

    const analysisId = params.analysisId as string;

    useEffect(() => {
        if (!analysisId) return;

        fetch(`/api/analyze-company/status/${analysisId}`)
            .then(async (res) => {
                if (!res.ok) throw new Error("Analysis not found");
                return res.json();
            })
            .then(setData)
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, [analysisId]);

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

    const crawl = data.crawl_data || {};
    const matches = (updatedMatches || data.preview_matches || []).slice(0, 5);
    const naics = data.inferred_naics || [];
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

    return (
        <div className="min-h-screen bg-stone-50">
            {/* Header */}
            <header className="px-4 sm:px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
                <Link href="/check" className="flex items-center space-x-2">
                    <Zap className="w-5 h-5 text-black" />
                    <span className="font-typewriter font-bold text-base">CapturePilot</span>
                    <span className="text-[9px] font-typewriter bg-stone-200 text-stone-600 px-2 py-0.5 rounded-full uppercase">Partner</span>
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
                                <h1 className="font-typewriter font-bold text-xl sm:text-2xl text-black mb-1">
                                    {data.company_name}
                                </h1>
                                <div className="flex items-center gap-3 flex-wrap">
                                    <a href={data.website} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1">
                                        <Globe className="w-3 h-3" /> {data.website.replace(/^https?:\/\//, "")}
                                    </a>
                                    {uei && (
                                        <span className="text-[10px] font-typewriter font-bold bg-stone-100 text-stone-600 border border-stone-200 px-2 py-0.5 rounded inline-flex items-center gap-1">
                                            <Hash className="w-3 h-3" /> UEI: {uei}
                                        </span>
                                    )}
                                    {cageCode && (
                                        <span className="text-[10px] font-typewriter font-bold bg-stone-100 text-stone-600 border border-stone-200 px-2 py-0.5 rounded inline-flex items-center gap-1">
                                            <Building2 className="w-3 h-3" /> CAGE: {cageCode}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                {hasSam && (
                                    <span className="bg-emerald-50 text-emerald-700 text-[10px] font-typewriter font-bold px-3 py-1.5 rounded-lg border border-emerald-200">
                                        SAM.gov Verified
                                    </span>
                                )}
                                <button
                                    type="button"
                                    onClick={handleSave}
                                    disabled={saving || !!isSaved}
                                    className={clsx(
                                        "text-[10px] font-typewriter font-bold px-3 py-1.5 rounded-lg border inline-flex items-center gap-1 transition-all",
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
                                    className="text-[10px] font-typewriter font-bold px-3 py-1.5 rounded-lg border bg-stone-100 text-stone-600 border-stone-200 hover:bg-stone-200 inline-flex items-center gap-1 transition-all print:hidden"
                                >
                                    <FileDown className="w-3 h-3" /> Export
                                </button>
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
                                    <p className="text-[10px] font-typewriter text-stone-400 uppercase">Location</p>
                                    <p className="font-bold text-sm">{crawl.detected_states.join(", ")}</p>
                                </div>
                            )}
                            {crawl.employee_signals && (
                                <div className="bg-stone-50 border border-stone-200 rounded-xl p-3">
                                    <Users className="w-4 h-4 text-stone-400 mb-1" />
                                    <p className="text-[10px] font-typewriter text-stone-400 uppercase">Employees</p>
                                    <p className="font-bold text-sm">~{crawl.employee_signals.estimate}</p>
                                </div>
                            )}
                            {crawl.founding_year && (
                                <div className="bg-stone-50 border border-stone-200 rounded-xl p-3">
                                    <Calendar className="w-4 h-4 text-stone-400 mb-1" />
                                    <p className="text-[10px] font-typewriter text-stone-400 uppercase">Est.</p>
                                    <p className="font-bold text-sm">{crawl.founding_year} ({new Date().getFullYear() - crawl.founding_year} yrs)</p>
                                </div>
                            )}
                            {crawl.pages_crawled && (
                                <div className="bg-stone-50 border border-stone-200 rounded-xl p-3">
                                    <Globe className="w-4 h-4 text-stone-400 mb-1" />
                                    <p className="text-[10px] font-typewriter text-stone-400 uppercase">Pages Analyzed</p>
                                    <p className="font-bold text-sm">{crawl.pages_crawled.length}</p>
                                </div>
                            )}
                        </div>

                        {/* Services */}
                        {crawl.services && crawl.services.length > 0 && (
                            <div>
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-2">Detected Services</p>
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
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-2">Certification Signals</p>
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

                        {/* Key Account Holder */}
                        {(contactPerson || leadership.length > 0) && (
                            <div>
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-2">
                                    <User className="w-3 h-3 inline mr-1" />Key Account Holder
                                    {samPocs.length > 0 && <span className="ml-2 text-emerald-500">(SAM.gov)</span>}
                                </p>
                                {(() => {
                                    const person = contactPerson || leadership[0];
                                    if (!person) return null;
                                    const genericPrefixes = ["info@", "contact@", "support@", "admin@", "sales@", "hello@", "office@", "hr@"];
                                    const personalContact = crawl.contacts?.find(c => c.email && !genericPrefixes.some(p => c.email!.startsWith(p)));
                                    const email = person.email || personalContact?.email;
                                    const phone = person.phone || sam?.phone || crawl.contacts?.find(c => c.phone)?.phone;
                                    const cp = profile.contact_person;
                                    const mobilePhone = cp?.mobile_phone;
                                    const directPhone = cp?.direct_phone;
                                    const linkedinUrl = cp?.linkedin_url;
                                    const enrichSource = cp?.source;
                                    return (
                                        <div className="bg-stone-50 border border-stone-200 rounded-xl p-4">
                                            <div className="flex items-start gap-3">
                                                <div className="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
                                                    {person.name.charAt(0).toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-bold text-sm text-black">{person.name}</p>
                                                        {enrichSource === "apollo" && (
                                                            <span className="text-[9px] font-typewriter font-bold bg-violet-50 text-violet-600 border border-violet-200 px-1.5 py-0.5 rounded">Apollo Verified</span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-stone-500">{person.title}</p>
                                                    <div className="flex flex-wrap gap-2 mt-2">
                                                        {email && (
                                                            <a href={`mailto:${email}`} className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                                                                <Mail className="w-3 h-3" /> {email}
                                                            </a>
                                                        )}
                                                        {mobilePhone && (
                                                            <a href={`tel:${mobilePhone}`} className="text-xs text-emerald-600 hover:underline inline-flex items-center gap-1">
                                                                <Phone className="w-3 h-3" /> {mobilePhone} <span className="text-[9px] text-emerald-400">(Mobile)</span>
                                                            </a>
                                                        )}
                                                        {directPhone && !mobilePhone && (
                                                            <a href={`tel:${directPhone}`} className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                                                                <Phone className="w-3 h-3" /> {directPhone} <span className="text-[9px] text-stone-400">(Direct)</span>
                                                            </a>
                                                        )}
                                                        {phone && !mobilePhone && !directPhone && (
                                                            <a href={`tel:${phone}`} className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                                                                <Phone className="w-3 h-3" /> {phone}
                                                            </a>
                                                        )}
                                                        {linkedinUrl && (
                                                            <a href={linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                                                                <Linkedin className="w-3 h-3" /> LinkedIn
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}
                                {/* Additional contacts (SAM POCs + crawler leadership, deduplicated) */}
                                {(() => {
                                    const mainName = contactPerson?.name?.toLowerCase() || "";
                                    const others = [
                                        ...samPocs.filter(p => p.name.toLowerCase() !== mainName).map(p => ({ ...p, source: "SAM.gov" as const })),
                                        ...leadership.filter(l => l.name.toLowerCase() !== mainName && !samPocs.some(s => s.name.toLowerCase() === l.name.toLowerCase())).map(l => ({ ...l, source: "Website" as const })),
                                    ].slice(0, 3);
                                    if (others.length === 0) return null;
                                    return (
                                        <div className="mt-2 space-y-1.5">
                                            {others.map((l, i) => (
                                                <div key={i} className="flex items-center gap-2 flex-wrap text-xs text-stone-600 px-3 py-1.5">
                                                    <span className="font-bold">{l.name}</span>
                                                    <span className="text-stone-400">—</span>
                                                    <span>{l.title}</span>
                                                    <span className="text-[9px] text-stone-300">({l.source})</span>
                                                    {l.email && (
                                                        <a href={`mailto:${l.email}`} title={`Email ${l.name}`} className="text-blue-600 hover:underline inline-flex items-center gap-1 ml-1">
                                                            <Mail className="w-3 h-3" /> <span className="sr-only">Email</span>
                                                        </a>
                                                    )}
                                                    {l.phone && (
                                                        <a href={`tel:${l.phone}`} title={`Call ${l.name}`} className="text-blue-600 hover:underline inline-flex items-center gap-1">
                                                            <Phone className="w-3 h-3" /> <span className="sr-only">Call</span>
                                                        </a>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })()}
                            </div>
                        )}

                        {/* General contact info (when no leadership found) */}
                        {!contactPerson && leadership.length === 0 && crawl.contacts && crawl.contacts.length > 0 && (
                            <div>
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-2">Contact Info Found</p>
                                <div className="flex flex-wrap gap-2">
                                    {crawl.contacts.filter(c => c.email).slice(0, 3).map((c, i) => (
                                        <a key={`e${i}`} href={`mailto:${c.email}`} className="text-xs bg-stone-50 text-stone-600 border border-stone-200 px-2.5 py-1 rounded-lg inline-flex items-center gap-1 hover:border-blue-300 transition-colors">
                                            <Mail className="w-3 h-3" /> {c.email}
                                        </a>
                                    ))}
                                    {crawl.contacts.filter(c => c.phone).slice(0, 2).map((c, i) => (
                                        <a key={`p${i}`} href={`tel:${c.phone}`} className="text-xs bg-stone-50 text-stone-600 border border-stone-200 px-2.5 py-1 rounded-lg inline-flex items-center gap-1 hover:border-blue-300 transition-colors">
                                            <Phone className="w-3 h-3" /> {c.phone}
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Government Spending History */}
                        {govSpending && govSpending.award_count > 0 && (
                            <div>
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-2">
                                    <DollarSign className="w-3 h-3 inline mr-1" />Federal Contract History
                                    {govSpending.searched_by === "uei" && <span className="ml-2 text-emerald-500">(UEI verified)</span>}
                                </p>
                                <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-3">
                                    {/* Summary stats */}
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="text-center">
                                            <p className="text-lg font-black text-stone-800">{govSpending.award_count}</p>
                                            <p className="text-[9px] font-typewriter text-stone-400 uppercase">Awards</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-lg font-black text-emerald-600">{fmtCurrency(govSpending.total_value)}</p>
                                            <p className="text-[9px] font-typewriter text-stone-400 uppercase">Total Value</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-lg font-black text-stone-800">{govSpending.agencies.length}</p>
                                            <p className="text-[9px] font-typewriter text-stone-400 uppercase">Agencies</p>
                                        </div>
                                    </div>

                                    {/* Last award */}
                                    {govSpending.last_award_date && (
                                        <div className="border-t border-stone-200 pt-3">
                                            <p className="text-[9px] font-typewriter text-stone-400 uppercase mb-1">Most Recent Award</p>
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
                                            <p className="text-[9px] font-typewriter text-stone-400 uppercase mb-2">Top Awards by Value</p>
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
                                            <p className="text-[9px] font-typewriter text-stone-400 uppercase mb-1.5">Agencies</p>
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

                        {/* Social Media Profiles */}
                        {(social.linkedin || social.facebook || social.twitter) && (
                            <div>
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-2">Social Profiles</p>
                                <div className="flex gap-2">
                                    {social.linkedin && (
                                        <a href={social.linkedin} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 px-3 py-2 rounded-xl hover:bg-blue-100 transition-colors">
                                            <Linkedin className="w-4 h-4" /> LinkedIn
                                        </a>
                                    )}
                                    {social.facebook && (
                                        <a href={social.facebook} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 px-3 py-2 rounded-xl hover:bg-blue-100 transition-colors">
                                            <Facebook className="w-4 h-4" /> Facebook
                                        </a>
                                    )}
                                    {social.twitter && (
                                        <a href={social.twitter} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-bold bg-stone-50 text-stone-700 border border-stone-200 px-3 py-2 rounded-xl hover:bg-stone-100 transition-colors">
                                            <Twitter className="w-4 h-4" /> Twitter/X
                                        </a>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Review & Confirm — pre-filled by crawler */}
                <LeadMagnetForm
                    analysisId={analysisId}
                    inferredProfile={data.inferred_profile || {}}
                    inferredNaics={naics}
                    crawlerConfidence={data.crawler_confidence}
                    onUpdate={(updated) => {
                        setUpdatedMatches(updated.updated_matches as MatchData[]);
                        setUpdatedCertRecs(updated.cert_recommendations as CertRecommendation[]);
                        setUpdatedEasyWins(updated.easy_wins as EasyWin[]);
                    }}
                />

                {/* Top 5 Matching Opportunities */}
                <div>
                    <h2 className="font-typewriter font-bold text-lg flex items-center mb-4 px-1">
                        <Zap className="w-5 h-5 mr-2" /> Best Matching Opportunities
                        {matches.length > 0 && (
                            <span className="ml-3 text-sm font-sans font-medium bg-emerald-100 px-3 py-1 rounded-full text-emerald-700 border border-emerald-200">
                                Top {matches.length}
                            </span>
                        )}
                    </h2>

                    {matches.length > 0 ? (
                        <div className="space-y-3">
                            {matches.map((match, i) => (
                                <MatchCard key={match.opportunity_id} match={match} rank={i + 1} />
                            ))}
                        </div>
                    ) : (
                        <div className="bg-stone-50 border border-stone-200 border-dashed rounded-2xl p-8 text-center">
                            <Briefcase className="w-10 h-10 text-stone-300 mx-auto mb-3" />
                            <p className="text-stone-500 font-typewriter mb-2">No matches found</p>
                            <p className="text-stone-400 text-sm">This company may not match any current federal opportunities.</p>
                        </div>
                    )}
                </div>

                {/* Easy Wins Section */}
                {easyWins.length > 0 && (
                    <div className="bg-white rounded-[28px] border border-stone-200 shadow-sm overflow-hidden">
                        <div className="bg-stone-50 border-b border-stone-100 px-5 sm:px-8 py-4">
                            <h2 className="font-typewriter font-bold text-base flex items-center">
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
                                                "text-[9px] font-typewriter font-bold px-2 py-0.5 rounded border uppercase",
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

                {/* Certification Recommendations */}
                {certRecs.length > 0 && (
                    <div className="bg-white rounded-[28px] border border-stone-200 shadow-sm overflow-hidden">
                        <div className="bg-stone-50 border-b border-stone-100 px-5 sm:px-8 py-4">
                            <h2 className="font-typewriter font-bold text-base flex items-center">
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
                                                    "text-[9px] font-typewriter font-bold px-2 py-0.5 rounded border uppercase",
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
                                            <p className="text-[10px] font-typewriter text-stone-400 uppercase">new opps</p>
                                        </div>
                                    </div>

                                    {rec.estimated_value > 0 && (
                                        <p className="text-xs text-stone-500 mb-2">
                                            Est. value: <span className="font-bold text-stone-700">${(rec.estimated_value / 1000000).toFixed(1)}M</span>
                                        </p>
                                    )}

                                    {rec.sample_opps.length > 0 && (
                                        <div className="space-y-1.5 mt-2 pt-2 border-t border-stone-100">
                                            <p className="text-[10px] font-typewriter text-stone-400 uppercase">Sample opportunities:</p>
                                            {rec.sample_opps.map((opp, j) => (
                                                <div key={j} className="flex items-center gap-2 text-xs">
                                                    <span className="text-[9px] font-typewriter font-bold bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded">
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
                        <div className="bg-stone-50 border-b border-stone-100 px-5 sm:px-8 py-4">
                            <h2 className="font-typewriter font-bold text-base flex items-center">
                                <Target className="w-4 h-4 mr-2 text-stone-400" /> Inferred NAICS Codes
                            </h2>
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

                {/* Bottom Actions */}
                <div className="flex flex-col sm:flex-row gap-3 pt-4">
                    <Link
                        href="/check"
                        className="flex-1 bg-black text-white rounded-2xl p-4 flex items-center justify-center gap-2 font-bold text-sm hover:bg-stone-800 transition-all"
                    >
                        <Zap className="w-4 h-4" /> Run Another Check
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
        </div>
    );
}
