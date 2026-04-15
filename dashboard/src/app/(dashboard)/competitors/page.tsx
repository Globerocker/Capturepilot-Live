"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createSupabaseClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Shield, Globe, ExternalLink, Loader2, ChevronDown, TrendingUp, Search, Plus, LinkIcon, Users } from "lucide-react";
import { AnalysisProgressStepper, statusToStep } from "@/components/AnalysisProgressStepper";
import clsx from "clsx";

const supabase = createSupabaseClient();

interface Competitor {
    id: string;
    competitor_name: string;
    website: string | null;
    uei: string | null;
    naics_codes: string[] | null;
    employee_count: string | null;
    revenue_estimate: string | null;
    description: string | null;
    overlap_score: number;
    federal_presence: string | null;
    crawl_data: Record<string, unknown> | null;
    last_analyzed_at: string | null;
}

function formatRevenue(raw: string | null): string {
    if (!raw) return "?";
    if (raw.startsWith("$")) return raw;
    const num = parseFloat(raw.replace(/[^0-9.]/g, ""));
    if (isNaN(num)) return raw;
    if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(1)}B`;
    if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(0)}M`;
    if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
    return `$${num.toLocaleString()}`;
}

function formatEmployees(raw: string | null): string {
    if (!raw) return "?";
    const num = parseInt(raw.replace(/[^0-9]/g, ""), 10);
    if (isNaN(num)) return raw;
    if (num >= 10_000) return `${(num / 1_000).toFixed(0)}K+`;
    return num.toLocaleString();
}

export default function CompetitorsPage() {
    const router = useRouter();
    const [competitors, setCompetitors] = useState<Competitor[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [profileId, setProfileId] = useState<string | null>(null);

    // Add competitor form state
    const [showAddForm, setShowAddForm] = useState(false);
    const [addUrl, setAddUrl] = useState("");
    const [addUei, setAddUei] = useState("");
    const [analyzing, setAnalyzing] = useState(false);
    const [analysisStep, setAnalysisStep] = useState(0);
    const [analysisError, setAnalysisError] = useState("");
    const [analysisName, setAnalysisName] = useState("");
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const stopPolling = useCallback(() => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    }, []);

    useEffect(() => {
        return () => stopPolling();
    }, [stopPolling]);

    const loadCompetitors = useCallback(async (profId: string) => {
        const { data } = await supabase
            .from("client_competitors")
            .select("*")
            .eq("user_profile_id", profId)
            .order("overlap_score", { ascending: false });
        setCompetitors((data || []) as Competitor[]);
    }, []);

    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { router.push("/login"); return; }
            const { data: prof } = await supabase.from("user_profiles").select("id").eq("auth_user_id", user.id).single();
            if (!prof) { router.push("/onboard"); return; }
            setProfileId((prof as Record<string, unknown>).id as string);
            await loadCompetitors((prof as Record<string, unknown>).id as string);
            setLoading(false);
        })();
    }, [loadCompetitors, router]);

    function getDomain(url: string): string {
        try {
            return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
        } catch { return url; }
    }

    function startPolling(analysisId: string) {
        stopPolling();
        pollRef.current = setInterval(async () => {
            try {
                const res = await fetch(`/api/analyze-company/status/${analysisId}`);
                if (!res.ok) return;
                const data = await res.json();

                if (data.company_name && data.company_name.length > 1) {
                    setAnalysisName(data.company_name);
                }

                if (data.status === "error") {
                    stopPolling();
                    setAnalysisError(data.error_message || "Analysis failed. Please try again.");
                    setAnalyzing(false);
                    return;
                }

                const newStep = statusToStep(data.status);
                setAnalysisStep(newStep);

                if (data.status === "complete") {
                    stopPolling();
                    await saveCompetitorFromAnalysis(analysisId, data);
                }
            } catch {
                // Ignore transient poll errors
            }
        }, 2000);
    }

    async function saveCompetitorFromAnalysis(analysisId: string, data: Record<string, unknown>) {
        if (!profileId) return;

        const crawlData = (data.crawl_data || {}) as Record<string, unknown>;
        const samData = (data.sam_data || {}) as Record<string, unknown>;

        const competitorName = (data.company_name as string) || analysisName || getDomain(addUrl);
        const uei = (samData.uei as string) || addUei || null;
        const description = (data.company_summary as string) || (crawlData.description as string) || null;
        const inferredNaics = (data.inferred_naics as string[]) || [];
        const employeeCount = (crawlData.employee_signals as string) || (crawlData.employee_count as string) || null;
        const revenueEstimate = (crawlData.revenue_signals as string) || (crawlData.revenue_estimate as string) || null;

        let federalPresence = "unknown";
        if (samData && Object.keys(samData).length > 0) {
            federalPresence = "strong";
        } else if (uei) {
            federalPresence = "moderate";
        } else {
            federalPresence = "none";
        }

        const { error } = await supabase.from("client_competitors").insert({
            user_profile_id: profileId,
            competitor_name: competitorName,
            website: addUrl.startsWith("http") ? addUrl : `https://${addUrl}`,
            uei,
            description,
            naics_codes: inferredNaics,
            employee_count: employeeCount,
            revenue_estimate: revenueEstimate,
            federal_presence: federalPresence,
            crawl_data: crawlData,
            last_analyzed_at: new Date().toISOString(),
            overlap_score: 0,
        });

        if (error) {
            setAnalysisError("Failed to save competitor: " + error.message);
        } else {
            await loadCompetitors(profileId);
            setAddUrl("");
            setAddUei("");
            setShowAddForm(false);
        }

        setAnalyzing(false);
        setAnalysisStep(0);
        setAnalysisName("");
    }

    function handleAddSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!addUrl.trim()) return;

        let url = addUrl.trim();
        if (!/^https?:\/\//i.test(url)) url = "https://" + url;
        setAddUrl(url);

        setAnalyzing(true);
        setAnalysisError("");
        setAnalysisStep(0);
        setAnalysisName(getDomain(url));

        fetch("/api/analyze-company", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                website: url,
                uei: addUei.trim().toUpperCase() || undefined,
            }),
        })
            .then(async (res) => {
                if (!res.ok) {
                    const d = await res.json().catch(() => ({}));
                    throw new Error(d.error || `Analysis failed (${res.status})`);
                }
                return res.json();
            })
            .then((d) => {
                if (d.analysis_id) {
                    startPolling(d.analysis_id);
                } else {
                    setAnalysisError("Failed to start analysis.");
                    setAnalyzing(false);
                }
            })
            .catch((err) => {
                setAnalysisError(err.message || "Something went wrong.");
                setAnalyzing(false);
            });
    }

    const presenceColors: Record<string, string> = {
        strong: "bg-emerald-100 text-emerald-700 border-emerald-200",
        moderate: "bg-amber-100 text-amber-700 border-amber-200",
        limited: "bg-blue-100 text-blue-700 border-blue-200",
        none: "bg-stone-100 text-stone-500 border-stone-200",
        unknown: "bg-stone-100 text-stone-400 border-stone-200",
    };

    if (loading) return (
        <div className="max-w-[1600px] mx-auto space-y-6 animate-in fade-in duration-500 px-1">
            <div className="h-8 w-48 bg-stone-200 rounded animate-pulse" />
            <div className="h-4 w-72 bg-stone-100 rounded animate-pulse" />
            <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-24 bg-stone-100 rounded-2xl animate-pulse" />)}</div>
        </div>
    );

    return (
        <div className="max-w-[1600px] mx-auto space-y-6 animate-in fade-in duration-500 px-1">
            <header>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tighter text-black flex items-center">
                    <Shield className="mr-2 sm:mr-3 w-6 h-6 sm:w-8 sm:h-8" /> Competitors
                    <span className="ml-3 text-sm font-sans font-medium bg-stone-100 px-3 py-1 rounded-full text-stone-500 border border-stone-200">
                        {competitors.length}
                    </span>
                </h2>
                <p className="text-stone-500 mt-1 font-medium text-sm">
                    Track and analyze your competitors. Add any company by URL for instant analysis.
                </p>
            </header>

            {/* Add Competitor Form */}
            {!analyzing && (
                <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
                    {!showAddForm ? (
                        <button
                            type="button"
                            onClick={() => setShowAddForm(true)}
                            className="w-full p-4 flex items-center justify-center gap-2 text-sm font-bold text-emerald-700 hover:bg-emerald-50/50 transition-colors"
                        >
                            <Plus className="w-4 h-4" /> Add Competitor
                        </button>
                    ) : (
                        <form onSubmit={handleAddSubmit} className="p-5 space-y-4">
                            <div className="flex items-center gap-2 mb-1">
                                <Plus className="w-4 h-4 text-emerald-600" />
                                <h3 className="text-sm font-bold text-black">Add New Competitor</h3>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] text-stone-400 uppercase mb-1 block">
                                        Company Website URL <span className="text-red-500">*</span>
                                    </label>
                                    <div className="relative">
                                        <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                                        <input
                                            type="text"
                                            value={addUrl}
                                            onChange={(e) => setAddUrl(e.target.value)}
                                            placeholder="example.com"
                                            required
                                            className="w-full pl-10 pr-3 py-2.5 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] text-stone-400 uppercase mb-1 block">
                                        UEI (optional)
                                    </label>
                                    <div className="relative">
                                        <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                                        <input
                                            type="text"
                                            value={addUei}
                                            onChange={(e) => setAddUei(e.target.value)}
                                            placeholder="12-character UEI"
                                            maxLength={12}
                                            className="w-full pl-10 pr-3 py-2.5 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 font-mono uppercase"
                                        />
                                    </div>
                                </div>
                            </div>
                            {analysisError && (
                                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{analysisError}</p>
                            )}
                            <div className="flex items-center gap-2">
                                <button
                                    type="submit"
                                    className="px-5 py-2.5 text-sm font-bold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors inline-flex items-center gap-2"
                                >
                                    <Search className="w-4 h-4" /> Analyze Competitor
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setShowAddForm(false); setAnalysisError(""); }}
                                    className="px-4 py-2.5 text-sm font-medium text-stone-500 hover:text-stone-700 transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            )}

            {/* Analysis in progress */}
            {analyzing && (
                <div className="bg-white border border-stone-200 rounded-2xl p-6">
                    <div className="text-center mb-6">
                        <h3 className="font-bold text-lg">Analyzing {analysisName}</h3>
                        <p className="text-xs text-stone-500 mt-1">This typically takes 30-60 seconds</p>
                    </div>
                    <div className="max-w-md mx-auto">
                        <AnalysisProgressStepper currentStep={analysisStep} />
                    </div>
                    {analysisError && (
                        <div className="mt-4 text-center">
                            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 inline-block">{analysisError}</p>
                            <button
                                type="button"
                                onClick={() => { setAnalyzing(false); setAnalysisError(""); }}
                                className="block mx-auto mt-2 text-xs text-stone-500 hover:text-stone-700"
                            >
                                Try again
                            </button>
                        </div>
                    )}
                </div>
            )}

            {competitors.length === 0 && !analyzing && (
                <div className="bg-stone-50 border border-stone-200 border-dashed rounded-2xl p-12 text-center">
                    <Shield className="w-12 h-12 text-stone-300 mx-auto mb-4" />
                    <p className="text-stone-500 text-sm mb-2">No competitors tracked yet</p>
                    <p className="text-stone-400 text-xs">Add a competitor above to analyze their federal presence, NAICS overlap, and more.</p>
                </div>
            )}

            <div className="space-y-3">
                {competitors.map((comp) => {
                    const isExpanded = expandedId === comp.id;
                    const crawl = comp.crawl_data || {};
                    const services = (crawl.services as string[]) || [];
                    const leadership = (crawl.leadership as Array<{ name: string; title: string }>) || [];
                    const social = (crawl.social_links as Record<string, string>) || {};

                    return (
                        <div key={comp.id} className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
                            {/* Header */}
                            <button type="button" onClick={() => setExpandedId(isExpanded ? null : comp.id)}
                                className="w-full text-left p-5 flex items-center gap-4 hover:bg-stone-50/50 transition-colors">
                                <div className={clsx(
                                    "w-12 h-12 rounded-xl border-2 font-black text-sm flex items-center justify-center flex-shrink-0",
                                    comp.overlap_score >= 70 ? "text-red-600 bg-red-50 border-red-200" :
                                    comp.overlap_score >= 40 ? "text-amber-600 bg-amber-50 border-amber-200" :
                                    "text-blue-600 bg-blue-50 border-blue-200"
                                )}>
                                    {comp.overlap_score}%
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-bold text-sm text-black">{comp.competitor_name}</span>
                                        {comp.federal_presence && (
                                            <span className={clsx("text-[9px] font-bold px-2 py-0.5 rounded border uppercase",
                                                presenceColors[comp.federal_presence] || presenceColors.unknown
                                            )}>
                                                Fed: {comp.federal_presence}
                                            </span>
                                        )}
                                        {comp.uei && (
                                            <span className="text-[9px] font-mono bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded">
                                                UEI: {comp.uei}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-stone-500 mt-0.5 line-clamp-1">{comp.description || ""}</p>
                                    <div className="flex items-center gap-3 mt-1.5 text-xs text-stone-400">
                                        {comp.employee_count && <span><Users className="w-3 h-3 inline mr-0.5" />{formatEmployees(comp.employee_count)} employees</span>}
                                        {comp.revenue_estimate && <span><TrendingUp className="w-3 h-3 inline mr-0.5" />{formatRevenue(comp.revenue_estimate)}</span>}
                                        {comp.website && <span><Globe className="w-3 h-3 inline mr-0.5" />{comp.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>}
                                    </div>
                                </div>

                                <ChevronDown className={clsx("w-4 h-4 text-stone-400 transition-transform flex-shrink-0", isExpanded && "rotate-180")} />
                            </button>

                            {/* Detail panel */}
                            {isExpanded && (
                                <div className="border-t border-stone-100 bg-stone-50/50 p-5 space-y-4">
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        <div className="bg-white rounded-xl border border-stone-200 p-3 text-center">
                                            <p className="text-lg font-black text-stone-800">{comp.overlap_score}%</p>
                                            <p className="text-[9px] text-stone-400 uppercase">Overlap</p>
                                        </div>
                                        <div className="bg-white rounded-xl border border-stone-200 p-3 text-center">
                                            <p className="text-lg font-black text-stone-800">{formatEmployees(comp.employee_count)}</p>
                                            <p className="text-[9px] text-stone-400 uppercase">Employees</p>
                                        </div>
                                        <div className="bg-white rounded-xl border border-stone-200 p-3 text-center">
                                            <p className="text-lg font-black text-stone-800">{formatRevenue(comp.revenue_estimate)}</p>
                                            <p className="text-[9px] text-stone-400 uppercase">Revenue</p>
                                        </div>
                                        <div className="bg-white rounded-xl border border-stone-200 p-3 text-center">
                                            <p className="text-lg font-black text-stone-800 capitalize">{comp.federal_presence || "?"}</p>
                                            <p className="text-[9px] text-stone-400 uppercase">Fed Presence</p>
                                        </div>
                                    </div>

                                    {comp.uei && (
                                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center gap-3">
                                            <Shield className="w-5 h-5 text-blue-500 flex-shrink-0" />
                                            <div>
                                                <p className="text-xs font-bold text-blue-800">SAM.gov Registered</p>
                                                <p className="text-[10px] text-blue-600 font-mono">UEI: {comp.uei}</p>
                                            </div>
                                            <a href={`https://sam.gov/search/?q=${comp.uei}&index=ei`} target="_blank" rel="noopener noreferrer"
                                                title="Look up on SAM.gov"
                                                className="ml-auto text-xs font-bold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1">
                                                <ExternalLink className="w-3 h-3" /> SAM.gov
                                            </a>
                                        </div>
                                    )}
                                    {!comp.uei && (
                                        <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 flex items-center gap-3">
                                            <Shield className="w-5 h-5 text-stone-400 flex-shrink-0" />
                                            <div>
                                                <p className="text-xs font-medium text-stone-600">No UEI on file</p>
                                                <p className="text-[10px] text-stone-400">May not be registered on SAM.gov</p>
                                            </div>
                                        </div>
                                    )}

                                    {comp.description && (
                                        <div>
                                            <p className="text-[10px] text-stone-400 uppercase mb-1">About</p>
                                            <p className="text-sm text-stone-600 leading-relaxed">{comp.description}</p>
                                        </div>
                                    )}

                                    {services.length > 0 && (
                                        <div>
                                            <p className="text-[10px] text-stone-400 uppercase mb-1.5">Services</p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {services.slice(0, 8).map((s, i) => (
                                                    <span key={i} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-lg">{s}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {leadership.length > 0 && (
                                        <div>
                                            <p className="text-[10px] text-stone-400 uppercase mb-1.5">Leadership</p>
                                            <div className="space-y-1">
                                                {leadership.slice(0, 3).map((l, i) => (
                                                    <div key={i} className="text-xs text-stone-600">
                                                        <span className="font-bold">{l.name}</span> — {l.title}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {comp.naics_codes && comp.naics_codes.length > 0 && (
                                        <div>
                                            <p className="text-[10px] text-stone-400 uppercase mb-1.5">NAICS Codes</p>
                                            <div className="flex flex-wrap gap-1">
                                                {comp.naics_codes.map((c, i) => (
                                                    <span key={i} className="text-[10px] font-mono bg-stone-100 text-stone-600 border border-stone-200 px-2 py-0.5 rounded">{c}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex gap-2 pt-2 border-t border-stone-200 flex-wrap">
                                        {comp.website && (
                                            <a href={comp.website.startsWith("http") ? comp.website : `https://${comp.website}`} target="_blank" rel="noopener noreferrer"
                                                className="text-xs font-bold bg-white border border-stone-200 text-stone-700 px-3 py-1.5 rounded-lg hover:bg-stone-50 inline-flex items-center gap-1">
                                                <Globe className="w-3 h-3" /> Website
                                            </a>
                                        )}
                                        {social.linkedin && (
                                            <a href={social.linkedin} target="_blank" rel="noopener noreferrer"
                                                className="text-xs font-bold bg-white border border-stone-200 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-50 inline-flex items-center gap-1">
                                                LinkedIn
                                            </a>
                                        )}
                                    </div>

                                    {comp.last_analyzed_at && (
                                        <p className="text-[9px] text-stone-400">Last analyzed: {new Date(comp.last_analyzed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
