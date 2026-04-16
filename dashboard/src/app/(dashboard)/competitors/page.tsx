"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createSupabaseClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Shield, Globe, ChevronRight, TrendingUp, Plus, LinkIcon, Users, Search, Building2, GitCompareArrows, X } from "lucide-react";
import { AnalysisProgressStepper, statusToStep } from "@/components/AnalysisProgressStepper";
import BulkAddFromSam from "@/components/competitors/BulkAddFromSam";
import ComparisonTable from "@/components/competitors/ComparisonTable";
import { AwardCountBadge } from "@/components/AwardCountBadge";
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
    const [profileId, setProfileId] = useState<string | null>(null);
    const [userNaics, setUserNaics] = useState<string[]>([]);
    const [userStates, setUserStates] = useState<string[]>([]);

    // Add competitor form state
    const [showAddForm, setShowAddForm] = useState(false);
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [bulkFlash, setBulkFlash] = useState<string>("");
    const [addUrl, setAddUrl] = useState("");
    const [addUei, setAddUei] = useState("");
    const [analyzing, setAnalyzing] = useState(false);
    const [suggesting, setSuggesting] = useState(false);
    const [suggestions, setSuggestions] = useState<Array<{name: string; domain: string; reason: string}>>([]);
    const [analysisStep, setAnalysisStep] = useState(0);
    const [analysisError, setAnalysisError] = useState("");
    const [analysisName, setAnalysisName] = useState("");
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Comparison state
    const [compareIds, setCompareIds] = useState<string[]>([]);
    const [showComparison, setShowComparison] = useState(false);
    const MAX_COMPARE = 4;

    function toggleCompare(id: string) {
        setCompareIds(prev => {
            if (prev.includes(id)) return prev.filter(x => x !== id);
            if (prev.length >= MAX_COMPARE) return prev;
            return [...prev, id];
        });
    }

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
            const { data: prof } = await supabase.from("user_profiles").select("id, naics_codes, target_states, state").eq("auth_user_id", user.id).single();
            if (!prof) { router.push("/onboard"); return; }
            const p = prof as Record<string, unknown>;
            setProfileId(p.id as string);
            setUserNaics(((p.naics_codes as string[]) || []).slice(0, 3));
            const ts = (p.target_states as string[] | null) || null;
            if (ts && ts.length) setUserStates(ts.slice(0, 5));
            else if (p.state) setUserStates([p.state as string]);
            await loadCompetitors(p.id as string);
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
        // inferred_naics can come back as either ["541611", ...] or
        // [{code, label, confidence, matched_keywords}, ...]. Extract the
        // bare codes so the DB row matches the typed `string[]` contract.
        const rawInferred = (data.inferred_naics as unknown[]) || [];
        const inferredNaics = rawInferred
            .map(item => {
                if (typeof item === "string") return item;
                if (item && typeof item === "object" && "code" in item) {
                    const code = (item as { code: unknown }).code;
                    return typeof code === "string" ? code : null;
                }
                return null;
            })
            .filter((c): c is string => !!c && /^\d{4,6}$/.test(c));
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

        // Ask the keyword suggest endpoint for primary + secondary keywords based on
        // the crawled company data. Fire-and-wait (30s cap) so the competitor gets
        // saved with keywords baked into crawl_data for instant display on detail.
        let suggestedPrimary: string[] = [];
        let suggestedSecondary: string[] = [];
        try {
            const kwRes = await fetch("/api/keywords/suggest", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    company_name: competitorName,
                    company_description: description,
                    services: Array.isArray(crawlData.services) ? crawlData.services : [],
                    differentiators: Array.isArray(crawlData.differentiators) ? crawlData.differentiators : [],
                }),
                signal: AbortSignal.timeout(30_000),
            });
            if (kwRes.ok) {
                const body = await kwRes.json() as { primary?: string[]; secondary?: string[] };
                suggestedPrimary = body.primary || [];
                suggestedSecondary = body.secondary || [];
            }
        } catch { /* keyword extraction is best-effort */ }

        const crawlDataWithKeywords = {
            ...crawlData,
            primary_keywords: suggestedPrimary,
            secondary_keywords: suggestedSecondary,
        };

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
            crawl_data: crawlDataWithKeywords,
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

    async function handleSuggest() {
        setSuggesting(true);
        setSuggestions([]);
        try {
            const res = await fetch("/api/ai/competitor-suggest", { method: "POST", body: "{}" });
            const data = await res.json();
            if (data.success) setSuggestions(data.competitors);
            else alert(data.error);
        } catch (e: any) {
            alert(e.message);
        } finally {
            setSuggesting(false);
        }
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

            {bulkFlash && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-xl px-4 py-2.5 flex items-center justify-between animate-in fade-in duration-300">
                    <span>{bulkFlash}</span>
                    <button
                        type="button"
                        aria-label="Dismiss"
                        title="Dismiss"
                        onClick={() => setBulkFlash("")}
                        className="text-emerald-600 hover:text-emerald-900"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            {/* Add Competitor Form */}
            {!analyzing && (
                <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
                    {!showAddForm ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-stone-200">
                            <button
                                type="button"
                                onClick={() => setShowAddForm(true)}
                                className="w-full p-4 flex items-center justify-center gap-2 text-sm font-bold text-emerald-700 hover:bg-emerald-50/50 transition-colors"
                            >
                                <Plus className="w-4 h-4" /> Add Competitor
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowBulkModal(true)}
                                className="w-full p-4 flex items-center justify-center gap-2 text-sm font-bold text-stone-700 hover:bg-stone-50 transition-colors"
                            >
                                <Building2 className="w-4 h-4" /> Bulk Add from SAM.gov
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleAddSubmit} className="p-5 space-y-4">
                            <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                    <Plus className="w-4 h-4 text-emerald-600" />
                                    <h3 className="text-sm font-bold text-black">Add New Competitor</h3>
                                </div>
                                <button type="button" onClick={handleSuggest} disabled={suggesting} className="text-xs text-blue-600 border border-blue-200 bg-blue-50 px-3 py-1 rounded-full font-bold hover:bg-blue-100 disabled:opacity-50">
                                    {suggesting ? "Analyzing market..." : "Suggest via AI"}
                                </button>
                            </div>
                            
                            {suggestions.length > 0 && (
                                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                                    <h4 className="text-xs font-bold text-blue-900 mb-2 uppercase tracking-wide">Suggested Competitors</h4>
                                    <div className="space-y-2">
                                        {suggestions.map((s, i) => (
                                            <div key={i} className="flex items-center gap-3 bg-white p-2.5 rounded-lg border border-blue-100">
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-bold text-sm text-black">{s.name} <span className="text-stone-400 font-normal ml-1">{s.domain}</span></p>
                                                    <p className="text-[10px] text-stone-500 mt-0.5 line-clamp-1">{s.reason}</p>
                                                </div>
                                                <button type="button" onClick={() => { setAddUrl(s.domain); setSuggestions([]); }} className="text-xs bg-emerald-600 text-white font-bold px-3 py-1.5 rounded-md flex-shrink-0 hover:bg-emerald-700">Use</button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
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

            {/* Comparison Table */}
            {showComparison && compareIds.length >= 2 && (
                <ComparisonTable
                    competitors={competitors.filter(c => compareIds.includes(c.id))}
                    onClose={() => setShowComparison(false)}
                />
            )}

            <div className="space-y-3">
                {competitors.map((comp) => {
                    const isChecked = compareIds.includes(comp.id);
                    const disableCheck = !isChecked && compareIds.length >= MAX_COMPARE;
                    return (
                        <div
                            key={comp.id}
                            className={clsx(
                                "bg-white border rounded-2xl overflow-hidden transition-all",
                                isChecked
                                    ? "border-emerald-300 ring-2 ring-emerald-100"
                                    : "border-stone-200 hover:border-stone-300 hover:shadow-sm"
                            )}
                        >
                            <div className="w-full text-left p-5 flex items-center gap-4">
                                <label
                                    className={clsx(
                                        "flex-shrink-0 flex items-center justify-center",
                                        disableCheck ? "cursor-not-allowed opacity-40" : "cursor-pointer"
                                    )}
                                    title={disableCheck ? `Max ${MAX_COMPARE} competitors can be compared` : "Select for comparison"}
                                >
                                    <input
                                        type="checkbox"
                                        checked={isChecked}
                                        disabled={disableCheck}
                                        onChange={() => toggleCompare(comp.id)}
                                        className="w-4 h-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500/20"
                                        aria-label={`Select ${comp.competitor_name} for comparison`}
                                    />
                                </label>
                                <Link
                                    href={`/competitors/${comp.id}`}
                                    className="flex-1 min-w-0 flex items-center gap-4 group"
                                >
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
                                            <span className="font-bold text-sm text-black group-hover:text-emerald-700 transition-colors">{comp.competitor_name}</span>
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
                                            <AwardCountBadge name={comp.competitor_name} uei={comp.uei} />
                                        </div>
                                        <p className="text-xs text-stone-500 mt-0.5 line-clamp-1">{comp.description || ""}</p>
                                        <div className="flex items-center gap-3 mt-1.5 text-xs text-stone-400">
                                            {comp.employee_count && <span><Users className="w-3 h-3 inline mr-0.5" />{formatEmployees(comp.employee_count)} employees</span>}
                                            {comp.revenue_estimate && <span><TrendingUp className="w-3 h-3 inline mr-0.5" />{formatRevenue(comp.revenue_estimate)}</span>}
                                            {comp.website && <span><Globe className="w-3 h-3 inline mr-0.5" />{comp.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>}
                                        </div>
                                    </div>

                                    <ChevronRight className="w-4 h-4 text-stone-400 flex-shrink-0" />
                                </Link>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Floating compare button */}
            {compareIds.length >= 2 && !showComparison && (
                <button
                    type="button"
                    onClick={() => setShowComparison(true)}
                    className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-5 py-3 rounded-2xl shadow-lg hover:shadow-xl transition-all animate-in fade-in slide-in-from-bottom-4 duration-300"
                >
                    <GitCompareArrows className="w-4 h-4" />
                    Compare ({compareIds.length})
                </button>
            )}
            {compareIds.length > 0 && (
                <button
                    type="button"
                    onClick={() => { setCompareIds([]); setShowComparison(false); }}
                    className={clsx(
                        "fixed z-40 inline-flex items-center gap-1 text-xs font-medium text-stone-600 bg-white border border-stone-200 hover:border-stone-300 px-3 py-2 rounded-xl shadow-sm transition-all",
                        compareIds.length >= 2 && !showComparison ? "bottom-6 right-[11.5rem]" : "bottom-6 right-6"
                    )}
                >
                    <X className="w-3 h-3" /> Clear selection
                </button>
            )}

            {/* Bulk Add Modal */}
            <BulkAddFromSam
                open={showBulkModal}
                onClose={() => setShowBulkModal(false)}
                onAdded={async (count) => {
                    if (profileId) await loadCompetitors(profileId);
                    if (count > 0) setBulkFlash(`Added ${count} competitor${count === 1 ? "" : "s"} from SAM.gov.`);
                    else setBulkFlash("No new competitors added (all were duplicates).");
                }}
                defaultNaics={userNaics}
                defaultStates={userStates}
            />
        </div>
    );
}
