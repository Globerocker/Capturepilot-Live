"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
    Zap, MapPin, Users, Calendar, Target,
    ArrowRight, Globe, Phone, Mail, Loader2, Briefcase, Shield,
    TrendingUp, Award, ChevronDown, ChevronUp, Clock, Unlock
} from "lucide-react";
import clsx from "clsx";

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
        leadership?: { name: string; title: string }[];
        social_links?: { linkedin?: string; facebook?: string; twitter?: string };
        pages_crawled?: string[];
    };
    sam_data: Record<string, unknown> | null;
    inferred_naics: { code: string; label: string; confidence: number; matched_keywords: string[] }[];
    preview_matches: {
        opportunity_id: string;
        title?: string;
        agency?: string;
        naics_code?: string;
        set_aside_code?: string;
        response_deadline?: string;
        notice_type?: string;
        score: number;
        classification: string;
        score_breakdown: Record<string, number>;
    }[];
    inferred_profile: Record<string, unknown>;
    cert_recommendations: CertRecommendation[];
    easy_wins: EasyWin[];
}

export default function CheckResultsPage() {
    const params = useParams();
    const [data, setData] = useState<AnalysisData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [showAllMatches, setShowAllMatches] = useState(false);

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

    const crawl = data.crawl_data || {};
    const matches = data.preview_matches || [];
    const visibleMatches = showAllMatches ? matches : matches.slice(0, 5);
    const hiddenCount = matches.length - 5;
    const naics = data.inferred_naics || [];
    const certs = crawl.certifications || [];
    const hasSam = !!data.sam_data && Object.keys(data.sam_data).length > 0;
    const easyWins = data.easy_wins || [];
    const certRecs = data.cert_recommendations || [];

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
                        <div className="flex items-start justify-between">
                            <div>
                                <h1 className="font-typewriter font-bold text-xl sm:text-2xl text-black mb-1">
                                    {data.company_name}
                                </h1>
                                <a href={data.website} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1">
                                    <Globe className="w-3 h-3" /> {data.website.replace(/^https?:\/\//, "")}
                                </a>
                            </div>
                            {hasSam && (
                                <span className="bg-emerald-50 text-emerald-700 text-[10px] font-typewriter font-bold px-3 py-1.5 rounded-lg border border-emerald-200">
                                    SAM.gov Verified
                                </span>
                            )}
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

                        {/* Contacts */}
                        {crawl.contacts && crawl.contacts.length > 0 && (
                            <div>
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-2">Contact Info Found</p>
                                <div className="flex flex-wrap gap-2">
                                    {crawl.contacts.filter(c => c.email).slice(0, 3).map((c, i) => (
                                        <span key={`e${i}`} className="text-xs bg-stone-50 text-stone-600 border border-stone-200 px-2.5 py-1 rounded-lg inline-flex items-center gap-1">
                                            <Mail className="w-3 h-3" /> {c.email}
                                        </span>
                                    ))}
                                    {crawl.contacts.filter(c => c.phone).slice(0, 2).map((c, i) => (
                                        <span key={`p${i}`} className="text-xs bg-stone-50 text-stone-600 border border-stone-200 px-2.5 py-1 rounded-lg inline-flex items-center gap-1">
                                            <Phone className="w-3 h-3" /> {c.phone}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Leadership */}
                        {crawl.leadership && crawl.leadership.length > 0 && (
                            <div>
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-2">Leadership</p>
                                <div className="flex flex-wrap gap-2">
                                    {crawl.leadership.map((l, i) => (
                                        <span key={i} className="text-xs bg-stone-50 text-stone-700 border border-stone-200 px-3 py-1.5 rounded-lg">
                                            <span className="font-bold">{l.name}</span> — {l.title}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
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

                {/* Matching Opportunities */}
                <div>
                    <h2 className="font-typewriter font-bold text-lg flex items-center mb-4 px-1">
                        <Zap className="w-5 h-5 mr-2" /> Matching Government Opportunities
                        <span className="ml-3 text-sm font-sans font-medium bg-emerald-100 px-3 py-1 rounded-full text-emerald-700 border border-emerald-200">
                            {matches.length} found
                        </span>
                    </h2>

                    {visibleMatches.length > 0 ? (
                        <div className="space-y-3">
                            {visibleMatches.map((match) => (
                                <div key={match.opportunity_id} className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 shadow-sm">
                                    <div className="flex items-start gap-3">
                                        <div className={clsx(
                                            "w-12 h-12 rounded-xl border-2 font-black font-typewriter text-sm flex items-center justify-center flex-shrink-0",
                                            match.score >= 0.70 ? "text-emerald-600 bg-emerald-50 border-emerald-200" :
                                            match.score >= 0.50 ? "text-amber-600 bg-amber-50 border-amber-200" :
                                            "text-blue-600 bg-blue-50 border-blue-200"
                                        )}>
                                            {Math.round(match.score * 100)}%
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
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
                                                {match.notice_type && (
                                                    <span className="text-[9px] font-typewriter bg-stone-100 text-stone-500 border border-stone-200 px-2 py-0.5 rounded uppercase">
                                                        {match.notice_type}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="font-bold text-sm text-black line-clamp-2">{match.title || "Untitled Opportunity"}</p>
                                            <p className="text-xs text-stone-500 mt-0.5">{match.agency || "Federal Agency"}</p>
                                            {match.response_deadline && (
                                                <p className="text-xs text-stone-400 mt-1">
                                                    Deadline: {new Date(match.response_deadline).toLocaleDateString()}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Score Breakdown */}
                                    {match.score_breakdown && Object.keys(match.score_breakdown).length > 0 && (
                                        <div className="flex gap-1.5 flex-wrap mt-3 pt-3 border-t border-stone-100">
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
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="bg-stone-50 border border-stone-200 border-dashed rounded-2xl p-8 text-center">
                            <Briefcase className="w-10 h-10 text-stone-300 mx-auto mb-3" />
                            <p className="text-stone-500 font-typewriter mb-2">No matches found</p>
                            <p className="text-stone-400 text-sm">This company may not match any current federal opportunities.</p>
                        </div>
                    )}

                    {/* See More Toggle */}
                    {hiddenCount > 0 && (
                        <button
                            type="button"
                            onClick={() => setShowAllMatches(!showAllMatches)}
                            className="mt-3 w-full bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-2xl p-3 text-sm font-bold text-stone-600 flex items-center justify-center gap-2 transition-colors"
                        >
                            {showAllMatches ? (
                                <>Show Less <ChevronUp className="w-4 h-4" /></>
                            ) : (
                                <>See {hiddenCount} More Matches <ChevronDown className="w-4 h-4" /></>
                            )}
                        </button>
                    )}
                </div>

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
                        href="https://calendly.com/americurial/intro-call"
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
