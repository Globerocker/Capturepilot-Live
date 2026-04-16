"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import Link from "next/link";
import {
    ArrowLeft, Globe, Shield, Users, TrendingUp, ExternalLink, Loader2,
    Trash2, RefreshCw, MapPin, Phone, Mail, Award, Target, AlertTriangle,
    CheckCircle2, XCircle, Minus, Building2, Briefcase, LinkIcon
} from "lucide-react";
import { AnalysisProgressStepper, statusToStep } from "@/components/AnalysisProgressStepper";
import clsx from "clsx";

const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Competitor {
    id: string;
    user_profile_id: string;
    competitor_name: string;
    website: string | null;
    uei: string | null;
    cage_code: string | null;
    naics_codes: string[] | null;
    employee_count: string | null;
    revenue_estimate: string | null;
    description: string | null;
    overlap_score: number;
    federal_presence: string | null;
    crawl_data: Record<string, unknown> | null;
    last_analyzed_at: string | null;
    created_at: string;
}

function formatRevenue(raw: string | null): string {
    if (!raw) return "Unknown";
    if (raw.startsWith("$")) return raw;
    const num = parseFloat(raw.replace(/[^0-9.]/g, ""));
    if (isNaN(num)) return raw;
    if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(1)}B`;
    if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(0)}M`;
    if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
    return `$${num.toLocaleString()}`;
}

function formatEmployees(raw: string | null): string {
    if (!raw) return "Unknown";
    const num = parseInt(raw.replace(/[^0-9]/g, ""), 10);
    if (isNaN(num)) return raw;
    if (num >= 10_000) return `${(num / 1_000).toFixed(0)}K+`;
    return num.toLocaleString();
}

// Parse legacy naics_codes[] entries. Handles bare strings, objects, and
// JSON-stringified objects (a leftover from an earlier insert bug where object
// arrays were written to a TEXT[] column and came back as raw JSON text).
function parseNaicsCode(c: unknown): string | null {
    if (typeof c === "string") {
        const t = c.trim();
        if (/^\d{4,6}$/.test(t)) return t;
        if (t.startsWith("{")) {
            try {
                const obj = JSON.parse(t) as Record<string, unknown>;
                const code = String(obj.code || "").trim();
                if (/^\d{4,6}$/.test(code)) return code;
            } catch { /* fall through */ }
        }
        return null;
    }
    if (c && typeof c === "object") {
        const code = String((c as Record<string, unknown>).code || "").trim();
        if (/^\d{4,6}$/.test(code)) return code;
    }
    return null;
}

// Reject leadership entries that are actually blog posts / content cards picked
// up by the crawler (e.g. "GovCon Glossary", "Free Beginner Course"). Two-word
// capitalized strings pass the naive name heuristic, so we filter the known-bad
// marketing/educational vocabulary here.
const NON_PERSON_WORDS = /\b(guide|course|training|glossary|beginner|expert|tutorial|lesson|module|certificate|certification|schedule|registration|checklist|template|webinar|podcast|handbook|masterclass|capabilities|offerings|directory|overview|mission|vision|about|contact|home|career|careers|news|press|blog|resources|products|solutions|services|pricing|terms|privacy|policy|sitemap|company|team)\b/i;

function looksLikePerson(name: string): boolean {
    if (!name) return false;
    const parts = name.trim().split(/\s+/);
    if (parts.length < 2 || parts.length > 5) return false;
    if (!parts.every(p => /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'-]+$/.test(p))) return false;
    if (NON_PERSON_WORDS.test(name)) return false;
    if (/^[A-Z]{2,}$/.test(name)) return false;
    return true;
}

function filterLeadership(raw: unknown): Array<{ name: string; title: string }> {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const out: Array<{ name: string; title: string }> = [];
    for (const item of raw) {
        if (!item || typeof item !== "object") continue;
        const obj = item as Record<string, unknown>;
        const name = String(obj.name || obj.fullName || obj.full_name || "").trim();
        if (!name || !looksLikePerson(name)) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const rawTitle = obj.title || obj.role || obj.position;
        const title = rawTitle ? String(rawTitle).trim() : "";
        if (title && NON_PERSON_WORDS.test(title)) continue;
        out.push({ name, title });
    }
    return out;
}

// ---------------------------------------------------------------------------
// Competitive Analysis Builder (deterministic, from crawl_data)
// ---------------------------------------------------------------------------
function buildStrengths(comp: Competitor): string[] {
    const strengths: string[] = [];
    const crawl = comp.crawl_data || {};
    const services = (crawl.services as string[]) || [];
    const leadership = (crawl.leadership as Array<{ name: string; title: string }>) || [];
    const certs = (crawl.certifications as Array<{ type: string; confidence: number }>) || [];
    const samData = (crawl.sam_data as Record<string, unknown>) || {};

    if (services.length >= 5) {
        strengths.push(`Broad service portfolio (${services.length} capabilities identified)`);
    } else if (services.length >= 2) {
        strengths.push(`Defined service offerings (${services.length} capabilities)`);
    }

    if (comp.uei || (samData && Object.keys(samData).length > 0)) {
        strengths.push("SAM.gov registered entity - eligible for federal contracting");
    }

    if (comp.federal_presence === "strong") {
        strengths.push("Strong federal market presence with established government relationships");
    } else if (comp.federal_presence === "moderate") {
        strengths.push("Moderate federal presence - active in government market");
    }

    const empNum = parseInt((comp.employee_count || "0").replace(/[^0-9]/g, ""), 10);
    if (empNum >= 500) {
        strengths.push(`Large workforce (${formatEmployees(comp.employee_count)}) - significant delivery capacity`);
    } else if (empNum >= 50) {
        strengths.push(`Mid-size workforce (${formatEmployees(comp.employee_count)}) - solid delivery capability`);
    }

    const revNum = parseFloat((comp.revenue_estimate || "0").replace(/[^0-9.]/g, ""));
    if (revNum >= 10_000_000) {
        strengths.push(`Significant revenue scale (${formatRevenue(comp.revenue_estimate)})`);
    } else if (revNum >= 1_000_000) {
        strengths.push(`Established revenue base (${formatRevenue(comp.revenue_estimate)})`);
    }

    if (certs.length > 0) {
        strengths.push(`Holds ${certs.length} certification(s): ${certs.map(c => c.type).join(", ")}`);
    }

    if (leadership.length >= 2) {
        strengths.push("Identifiable leadership team with defined roles");
    }

    if (comp.naics_codes && comp.naics_codes.length >= 4) {
        strengths.push(`Diverse NAICS coverage (${comp.naics_codes.length} codes) across multiple industries`);
    }

    if (strengths.length === 0) {
        strengths.push("Limited public information available for strength assessment");
    }

    return strengths;
}

function buildWeaknesses(comp: Competitor): string[] {
    const weaknesses: string[] = [];
    const crawl = comp.crawl_data || {};
    const services = (crawl.services as string[]) || [];
    const certs = (crawl.certifications as Array<{ type: string; confidence: number }>) || [];

    if (!comp.uei) {
        weaknesses.push("Not registered on SAM.gov - cannot bid on federal contracts directly");
    }

    if (!comp.naics_codes || comp.naics_codes.length <= 2) {
        weaknesses.push("Limited NAICS code coverage - narrow industry classification");
    }

    if (certs.length === 0) {
        weaknesses.push("No set-aside certifications identified (8(a), HUBZone, SDVOSB, WOSB)");
    }

    const empNum = parseInt((comp.employee_count || "0").replace(/[^0-9]/g, ""), 10);
    if (empNum > 0 && empNum < 20) {
        weaknesses.push("Small workforce - may face capacity constraints on large contracts");
    }

    if (services.length < 2) {
        weaknesses.push("Limited service documentation - unclear capability breadth");
    }

    if (comp.federal_presence === "none" || comp.federal_presence === "unknown") {
        weaknesses.push("No established federal presence - lacks government contract track record");
    }

    const desc = (crawl.description as string) || comp.description || "";
    if (desc.length < 50) {
        weaknesses.push("Minimal web presence - limited public information available");
    }

    if (weaknesses.length === 0) {
        weaknesses.push("No significant weaknesses identified from available data");
    }

    return weaknesses;
}

function buildDifferentiators(comp: Competitor): string[] {
    const diffs: string[] = [];
    const crawl = comp.crawl_data || {};
    const services = (crawl.services as string[]) || [];
    const desc = (crawl.description as string) || comp.description || "";
    const certs = (crawl.certifications as Array<{ type: string; confidence: number }>) || [];
    const locations = (crawl.detected_states as string[]) || [];

    if (services.length > 0) {
        diffs.push(...services.slice(0, 5).map(s => `Service: ${s}`));
    }

    if (certs.length > 0) {
        certs.forEach(c => diffs.push(`Certification: ${c.type}`));
    }

    if (locations.length > 0) {
        diffs.push(`Geographic presence: ${locations.join(", ")}`);
    }

    if (desc.length > 100) {
        // Extract a key differentiator from the description
        const firstSentence = desc.split(/[.!?]/)[0];
        if (firstSentence && firstSentence.length > 20 && firstSentence.length < 200) {
            diffs.push(firstSentence.trim());
        }
    }

    if (diffs.length === 0) {
        diffs.push("Insufficient data to identify unique differentiators");
    }

    return diffs;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function CompetitorDetail() {
    const params = useParams();
    const router = useRouter();
    const competitorId = params.id as string;

    const [comp, setComp] = useState<Competitor | null>(null);
    const [loading, setLoading] = useState(true);
    const [userNaics, setUserNaics] = useState<string[]>([]);
    const [deleting, setDeleting] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // Re-analyze state
    const [reanalyzing, setReanalyzing] = useState(false);
    const [reanalyzeStep, setReanalyzeStep] = useState(0);
    const [reanalyzeError, setReanalyzeError] = useState("");
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

    const loadCompetitor = useCallback(async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: prof } = await supabase
            .from("user_profiles")
            .select("id, naics_codes")
            .eq("auth_user_id", user.id)
            .single();
        if (!prof) return;

        setUserNaics((prof.naics_codes as string[]) || []);

        const { data } = await supabase
            .from("client_competitors")
            .select("*")
            .eq("id", competitorId)
            .eq("user_profile_id", prof.id)
            .single();

        if (data) {
            setComp(data as Competitor);
        }
        setLoading(false);
    }, [competitorId]);

    useEffect(() => {
        loadCompetitor();
    }, [loadCompetitor]);

    // Re-analyze
    function handleReanalyze() {
        if (!comp || !comp.website) return;
        setReanalyzing(true);
        setReanalyzeError("");
        setReanalyzeStep(0);

        fetch("/api/analyze-company", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                website: comp.website,
                uei: comp.uei || undefined,
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
                    startReanalyzePolling(d.analysis_id);
                } else {
                    setReanalyzeError("Failed to start re-analysis.");
                    setReanalyzing(false);
                }
            })
            .catch((err) => {
                setReanalyzeError(err.message || "Something went wrong.");
                setReanalyzing(false);
            });
    }

    function startReanalyzePolling(analysisId: string) {
        stopPolling();
        pollRef.current = setInterval(async () => {
            try {
                const res = await fetch(`/api/analyze-company/status/${analysisId}`);
                if (!res.ok) return;
                const data = await res.json();

                if (data.status === "error") {
                    stopPolling();
                    setReanalyzeError(data.error_message || "Re-analysis failed.");
                    setReanalyzing(false);
                    return;
                }

                setReanalyzeStep(statusToStep(data.status));

                if (data.status === "complete") {
                    stopPolling();
                    await updateCompetitorFromAnalysis(data);
                }
            } catch {
                // ignore
            }
        }, 2000);
    }

    async function updateCompetitorFromAnalysis(data: Record<string, unknown>) {
        if (!comp) return;

        const crawlData = (data.crawl_data || {}) as Record<string, unknown>;
        const samData = (data.sam_data || {}) as Record<string, unknown>;

        const competitorName = (data.company_name as string) || comp.competitor_name;
        const uei = (samData.uei as string) || comp.uei || null;
        const description = (data.company_summary as string) || (crawlData.description as string) || comp.description;
        const inferredNaics = (data.inferred_naics as string[]) || comp.naics_codes || [];
        const employeeCount = (crawlData.employee_signals as string) || (crawlData.employee_count as string) || comp.employee_count;
        const revenueEstimate = (crawlData.revenue_signals as string) || (crawlData.revenue_estimate as string) || comp.revenue_estimate;

        // Same presence rule as initial insert — require USASpending award
        // history for "strong"; SAM-only registration is "moderate".
        const awardCount = Number((crawlData.usaspending_data as { award_count?: number } | null)?.award_count || 0);
        let federalPresence: string = comp.federal_presence || "unknown";
        if (awardCount >= 3) federalPresence = "strong";
        else if (awardCount >= 1 || (samData && Object.keys(samData).length > 0) || uei) federalPresence = "moderate";
        else if (!uei) federalPresence = "none";

        await supabase.from("client_competitors").update({
            competitor_name: competitorName,
            uei,
            description,
            naics_codes: inferredNaics,
            employee_count: employeeCount,
            revenue_estimate: revenueEstimate,
            federal_presence: federalPresence,
            crawl_data: crawlData,
            last_analyzed_at: new Date().toISOString(),
        }).eq("id", comp.id);

        await loadCompetitor();
        setReanalyzing(false);
        setReanalyzeStep(0);
    }

    // Delete
    async function handleDelete() {
        if (!comp) return;
        setDeleting(true);
        await supabase.from("client_competitors").delete().eq("id", comp.id);
        router.push("/portal/competitors");
    }

    // ---------------------------------------------------------------------------
    // RENDER
    // ---------------------------------------------------------------------------

    if (loading) {
        return (
            <div className="flex justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
            </div>
        );
    }

    if (!comp) {
        return (
            <div className="max-w-3xl mx-auto py-20 text-center">
                <AlertTriangle className="w-12 h-12 text-stone-300 mx-auto mb-4" />
                <h2 className="text-lg font-bold text-stone-700 mb-2">Competitor not found</h2>
                <p className="text-sm text-stone-500 mb-6">This competitor may have been removed or you do not have access.</p>
                <Link href="/portal/competitors" className="text-sm font-bold text-emerald-600 hover:text-emerald-700">
                    Back to competitors
                </Link>
            </div>
        );
    }

    const crawl = comp.crawl_data || {};
    const services = (crawl.services as string[]) || [];
    const leadership = filterLeadership(crawl.leadership);
    const social = (crawl.social_links as Record<string, string>) || {};
    const contacts = (crawl.contacts as Array<{ email?: string; phone?: string; name?: string }>) || [];
    const certs = (crawl.certifications as Array<{ type: string; confidence: number }>) || [];
    const locations = (crawl.detected_states as string[]) || [];
    const samData = (crawl.sam_data as Record<string, unknown>) || {};
    const usaspendingData = (crawl.usaspending_data as Record<string, unknown>) || {};
    const awards = (usaspendingData.results as Array<{ Award?: string; Awarding_Agency?: string; Total_Obligation?: number; Start_Date?: string; description?: string; award_description?: string; awarding_agency_name?: string; total_obligation?: number; period_of_performance_start_date?: string }>) || [];

    const strengths = buildStrengths(comp);
    const weaknesses = buildWeaknesses(comp);
    const differentiators = buildDifferentiators(comp);

    // NAICS overlap — parse legacy shapes (objects / JSON-strings) into bare codes.
    const compNaics = (comp.naics_codes || [])
        .map(parseNaicsCode)
        .filter((c): c is string => !!c);
    const userNaicsCodes = userNaics.map(c => c.replace(/\s.*/, "").trim());
    const overlappingNaics = compNaics.filter(c => userNaicsCodes.includes(c));
    const nonOverlappingNaics = compNaics.filter(c => !userNaicsCodes.includes(c));

    const presenceColors: Record<string, string> = {
        strong: "bg-emerald-100 text-emerald-700 border-emerald-200",
        moderate: "bg-amber-100 text-amber-700 border-amber-200",
        limited: "bg-blue-100 text-blue-700 border-blue-200",
        none: "bg-stone-100 text-stone-500 border-stone-200",
        unknown: "bg-stone-100 text-stone-400 border-stone-200",
    };

    return (
        <div className="max-w-5xl space-y-8 pb-12">
            {/* Back link */}
            <Link
                href="/portal/competitors"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-stone-500 hover:text-stone-700 transition-colors"
            >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Competitive Landscape
            </Link>

            {/* ================================================================
                HEADER SECTION
            ================================================================ */}
            <div className="bg-white border border-stone-200 rounded-2xl p-6 sm:p-8">
                <div className="flex flex-col sm:flex-row sm:items-start gap-5">
                    {/* Icon */}
                    <div className={clsx(
                        "w-16 h-16 rounded-2xl border-2 font-black text-lg flex items-center justify-center flex-shrink-0",
                        comp.overlap_score >= 70 ? "text-red-600 bg-red-50 border-red-200" :
                        comp.overlap_score >= 40 ? "text-amber-600 bg-amber-50 border-amber-200" :
                        "text-blue-600 bg-blue-50 border-blue-200"
                    )}>
                        {comp.overlap_score}%
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                        <h1 className="text-2xl sm:text-3xl font-bold text-stone-900 leading-tight">
                            {comp.competitor_name}
                        </h1>

                        {/* Badges row */}
                        <div className="flex flex-wrap items-center gap-2 mt-3">
                            {comp.website && (
                                <a
                                    href={comp.website.startsWith("http") ? comp.website : `https://${comp.website}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg hover:bg-emerald-100 inline-flex items-center gap-1 transition-colors"
                                >
                                    <Globe className="w-3 h-3" />
                                    {comp.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                                </a>
                            )}
                            {comp.uei && (
                                <span className="text-xs font-mono bg-blue-50 text-blue-600 border border-blue-200 px-2.5 py-1 rounded-lg">
                                    UEI: {comp.uei}
                                </span>
                            )}
                            {comp.cage_code && (
                                <span className="text-xs font-mono bg-purple-50 text-purple-600 border border-purple-200 px-2.5 py-1 rounded-lg">
                                    CAGE: {comp.cage_code}
                                </span>
                            )}
                            {comp.federal_presence && (
                                <span className={clsx("text-[10px] font-bold px-2.5 py-1 rounded-lg border uppercase",
                                    presenceColors[comp.federal_presence] || presenceColors.unknown
                                )}>
                                    Federal: {comp.federal_presence}
                                </span>
                            )}
                        </div>

                        {/* NAICS badges */}
                        {compNaics.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-3">
                                {compNaics.slice(0, 8).map((code, i) => (
                                    <span key={i} className="text-[10px] font-mono bg-stone-100 text-stone-600 border border-stone-200 px-2 py-0.5 rounded">
                                        {code}
                                    </span>
                                ))}
                                {compNaics.length > 8 && (
                                    <span className="text-[10px] text-stone-400">+{compNaics.length - 8} more</span>
                                )}
                            </div>
                        )}

                        {/* Stats row */}
                        <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-stone-500">
                            {comp.employee_count && (
                                <span className="inline-flex items-center gap-1">
                                    <Users className="w-4 h-4 text-stone-400" />
                                    {formatEmployees(comp.employee_count)} employees
                                </span>
                            )}
                            {comp.revenue_estimate && (
                                <span className="inline-flex items-center gap-1">
                                    <TrendingUp className="w-4 h-4 text-stone-400" />
                                    {formatRevenue(comp.revenue_estimate)} revenue
                                </span>
                            )}
                            {comp.last_analyzed_at && (
                                <span className="inline-flex items-center gap-1">
                                    <RefreshCw className="w-3.5 h-3.5 text-stone-400" />
                                    Analyzed {new Date(comp.last_analyzed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Re-Analyze button */}
                    <div className="flex-shrink-0">
                        {!reanalyzing && comp.website && (
                            <button
                                type="button"
                                onClick={handleReanalyze}
                                className="px-4 py-2.5 text-sm font-bold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors inline-flex items-center gap-2"
                            >
                                <RefreshCw className="w-4 h-4" /> Re-Analyze
                            </button>
                        )}
                    </div>
                </div>

                {/* Re-analyze progress */}
                {reanalyzing && (
                    <div className="mt-6 pt-6 border-t border-stone-100">
                        <p className="text-sm font-bold text-stone-700 mb-4">Re-analyzing {comp.competitor_name}...</p>
                        <div className="max-w-md">
                            <AnalysisProgressStepper currentStep={reanalyzeStep} />
                        </div>
                        {reanalyzeError && (
                            <p className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{reanalyzeError}</p>
                        )}
                    </div>
                )}
            </div>

            {/* ================================================================
                COMPETITIVE ANALYSIS
            ================================================================ */}
            <div className="bg-white border border-stone-200 rounded-2xl p-6 sm:p-8">
                <h2 className="text-lg font-bold text-stone-900 flex items-center gap-2 mb-6">
                    <Target className="w-5 h-5" /> Competitive Analysis
                </h2>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Strengths */}
                    <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-5">
                        <h3 className="text-sm font-bold text-emerald-800 flex items-center gap-1.5 mb-3">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Strengths
                        </h3>
                        <ul className="space-y-2">
                            {strengths.map((s, i) => (
                                <li key={i} className="text-xs text-emerald-700 leading-relaxed flex gap-2">
                                    <span className="text-emerald-400 mt-0.5 flex-shrink-0">+</span>
                                    <span>{s}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Weaknesses */}
                    <div className="bg-red-50/50 border border-red-100 rounded-xl p-5">
                        <h3 className="text-sm font-bold text-red-800 flex items-center gap-1.5 mb-3">
                            <XCircle className="w-4 h-4 text-red-500" /> Weaknesses
                        </h3>
                        <ul className="space-y-2">
                            {weaknesses.map((w, i) => (
                                <li key={i} className="text-xs text-red-700 leading-relaxed flex gap-2">
                                    <span className="text-red-400 mt-0.5 flex-shrink-0">-</span>
                                    <span>{w}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* USPs / Differentiators */}
                    <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-5">
                        <h3 className="text-sm font-bold text-blue-800 flex items-center gap-1.5 mb-3">
                            <Minus className="w-4 h-4 text-blue-500 rotate-90" /> Differentiators
                        </h3>
                        <ul className="space-y-2">
                            {differentiators.map((d, i) => (
                                <li key={i} className="text-xs text-blue-700 leading-relaxed flex gap-2">
                                    <span className="text-blue-400 mt-0.5 flex-shrink-0">&bull;</span>
                                    <span>{d}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>

            {/* ================================================================
                PAST AWARDS
            ================================================================ */}
            <div className="bg-white border border-stone-200 rounded-2xl p-6 sm:p-8">
                <h2 className="text-lg font-bold text-stone-900 flex items-center gap-2 mb-4">
                    <Award className="w-5 h-5" /> Past Awards
                </h2>

                {awards.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-stone-200">
                                    <th className="text-[10px] text-stone-400 uppercase pb-2 pr-4">Award</th>
                                    <th className="text-[10px] text-stone-400 uppercase pb-2 pr-4">Agency</th>
                                    <th className="text-[10px] text-stone-400 uppercase pb-2 pr-4">Value</th>
                                    <th className="text-[10px] text-stone-400 uppercase pb-2">Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                {awards.slice(0, 20).map((award, i) => (
                                    <tr key={i} className="border-b border-stone-100 last:border-0">
                                        <td className="py-2.5 pr-4 text-xs text-stone-700 max-w-[300px] truncate">
                                            {award.Award || award.award_description || award.description || "Federal Award"}
                                        </td>
                                        <td className="py-2.5 pr-4 text-xs text-stone-500">
                                            {award.Awarding_Agency || award.awarding_agency_name || "--"}
                                        </td>
                                        <td className="py-2.5 pr-4 text-xs font-mono text-stone-700">
                                            {(award.Total_Obligation || award.total_obligation)
                                                ? `$${(award.Total_Obligation || award.total_obligation || 0).toLocaleString()}`
                                                : "--"}
                                        </td>
                                        <td className="py-2.5 text-xs text-stone-500">
                                            {(award.Start_Date || award.period_of_performance_start_date)
                                                ? new Date(award.Start_Date || award.period_of_performance_start_date || "").toLocaleDateString("en-US", { month: "short", year: "numeric" })
                                                : "--"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : comp.uei ? (
                    <div className="bg-stone-50 border border-stone-200 rounded-xl p-6 text-center">
                        <Award className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                        <p className="text-sm text-stone-500">Award history analysis pending</p>
                        <p className="text-xs text-stone-400 mt-1">Federal award data will be populated during the next enrichment cycle.</p>
                        <a
                            href={`https://www.usaspending.gov/search/?filters=${encodeURIComponent(JSON.stringify({ recipient_search_text: [comp.competitor_name] }))}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 mt-3"
                        >
                            <ExternalLink className="w-3 h-3" /> View on USASpending.gov
                        </a>
                    </div>
                ) : (
                    <div className="bg-stone-50 border border-stone-200 rounded-xl p-6 text-center">
                        <Award className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                        <p className="text-sm text-stone-500">No UEI on file</p>
                        <p className="text-xs text-stone-400 mt-1">Award history requires a registered UEI to look up federal contracts.</p>
                    </div>
                )}
            </div>

            {/* ================================================================
                FEDERAL PRESENCE
            ================================================================ */}
            <div className="bg-white border border-stone-200 rounded-2xl p-6 sm:p-8">
                <h2 className="text-lg font-bold text-stone-900 flex items-center gap-2 mb-4">
                    <Shield className="w-5 h-5" /> Federal Presence
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* SAM Registration */}
                    <div className={clsx(
                        "rounded-xl border p-4",
                        comp.uei ? "bg-blue-50 border-blue-200" : "bg-stone-50 border-stone-200"
                    )}>
                        <div className="flex items-center gap-2 mb-2">
                            <Shield className={clsx("w-5 h-5", comp.uei ? "text-blue-600" : "text-stone-400")} />
                            <h3 className={clsx("text-sm font-bold", comp.uei ? "text-blue-800" : "text-stone-600")}>
                                SAM.gov Registration
                            </h3>
                        </div>
                        {comp.uei ? (
                            <div>
                                <p className="text-xs text-blue-600 font-mono mb-2">UEI: {comp.uei}</p>
                                {comp.cage_code && <p className="text-xs text-blue-600 font-mono mb-2">CAGE: {comp.cage_code}</p>}
                                <a
                                    href={`https://sam.gov/search/?q=${comp.uei}&index=ei`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs font-bold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
                                >
                                    <ExternalLink className="w-3 h-3" /> View on SAM.gov
                                </a>
                            </div>
                        ) : (
                            <p className="text-xs text-stone-500">Not registered or UEI unknown</p>
                        )}
                    </div>

                    {/* NAICS codes */}
                    <div className="bg-stone-50 border border-stone-200 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Briefcase className="w-5 h-5 text-stone-500" />
                            <h3 className="text-sm font-bold text-stone-700">NAICS Codes</h3>
                        </div>
                        {compNaics.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                                {compNaics.map((code, i) => (
                                    <span key={i} className="text-[10px] font-mono bg-white text-stone-600 border border-stone-200 px-2 py-0.5 rounded">
                                        {code}
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-stone-500">No NAICS codes identified</p>
                        )}
                    </div>

                    {/* Set-aside certifications */}
                    <div className="bg-stone-50 border border-stone-200 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Award className="w-5 h-5 text-stone-500" />
                            <h3 className="text-sm font-bold text-stone-700">Certifications</h3>
                        </div>
                        {certs.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                                {certs.map((c, i) => (
                                    <span key={i} className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-lg">
                                        {c.type}
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-stone-500">No set-aside certifications identified</p>
                        )}
                    </div>

                    {/* Locations */}
                    <div className="bg-stone-50 border border-stone-200 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <MapPin className="w-5 h-5 text-stone-500" />
                            <h3 className="text-sm font-bold text-stone-700">Locations</h3>
                        </div>
                        {locations.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                                {locations.map((loc, i) => (
                                    <span key={i} className="text-xs bg-white text-stone-600 border border-stone-200 px-2 py-0.5 rounded-lg">
                                        {loc}
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-stone-500">No locations identified</p>
                        )}
                    </div>
                </div>
            </div>

            {/* ================================================================
                CONTACT INFORMATION
            ================================================================ */}
            <div className="bg-white border border-stone-200 rounded-2xl p-6 sm:p-8">
                <h2 className="text-lg font-bold text-stone-900 flex items-center gap-2 mb-4">
                    <Building2 className="w-5 h-5" /> Contact Information
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Leadership */}
                    {leadership.length > 0 && (
                        <div className="bg-stone-50 border border-stone-200 rounded-xl p-4">
                            <h3 className="text-[10px] text-stone-400 uppercase mb-2">Leadership</h3>
                            <div className="space-y-2">
                                {leadership.map((l, i) => (
                                    <div key={i} className="text-xs text-stone-700">
                                        <span className="font-bold">{l.name}</span>
                                        <span className="text-stone-400 ml-1">-- {l.title}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Contact details */}
                    {(contacts.length > 0 || comp.website) && (
                        <div className="bg-stone-50 border border-stone-200 rounded-xl p-4">
                            <h3 className="text-[10px] text-stone-400 uppercase mb-2">Contact Details</h3>
                            <div className="space-y-2">
                                {contacts.map((c, i) => (
                                    <div key={i} className="text-xs text-stone-600 space-y-0.5">
                                        {c.name && <p className="font-bold text-stone-700">{c.name}</p>}
                                        {c.email && (
                                            <p className="inline-flex items-center gap-1">
                                                <Mail className="w-3 h-3 text-stone-400" />
                                                <a href={`mailto:${c.email}`} className="text-blue-600 hover:underline">{c.email}</a>
                                            </p>
                                        )}
                                        {c.phone && (
                                            <p className="inline-flex items-center gap-1">
                                                <Phone className="w-3 h-3 text-stone-400" /> {c.phone}
                                            </p>
                                        )}
                                    </div>
                                ))}
                                {comp.website && (
                                    <p className="text-xs inline-flex items-center gap-1 text-stone-600">
                                        <Globe className="w-3 h-3 text-stone-400" />
                                        <a
                                            href={comp.website.startsWith("http") ? comp.website : `https://${comp.website}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-600 hover:underline"
                                        >
                                            {comp.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                                        </a>
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Social links */}
                    {Object.keys(social).length > 0 && (
                        <div className="bg-stone-50 border border-stone-200 rounded-xl p-4">
                            <h3 className="text-[10px] text-stone-400 uppercase mb-2">Social Links</h3>
                            <div className="space-y-2">
                                {Object.entries(social).map(([platform, url]) => (
                                    <a
                                        key={platform}
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 capitalize"
                                    >
                                        <LinkIcon className="w-3 h-3" /> {platform}
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Empty state */}
                    {leadership.length === 0 && contacts.length === 0 && Object.keys(social).length === 0 && !comp.website && (
                        <div className="col-span-full bg-stone-50 border border-stone-200 rounded-xl p-6 text-center">
                            <Building2 className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                            <p className="text-xs text-stone-500">No contact information available</p>
                        </div>
                    )}
                </div>
            </div>

            {/* ================================================================
                NAICS OVERLAP
            ================================================================ */}
            {comp.naics_codes && comp.naics_codes.length > 0 && userNaics.length > 0 && (
                <div className="bg-white border border-stone-200 rounded-2xl p-6 sm:p-8">
                    <h2 className="text-lg font-bold text-stone-900 flex items-center gap-2 mb-2">
                        <Target className="w-5 h-5" /> NAICS Overlap
                    </h2>
                    <p className="text-xs text-stone-500 mb-4">
                        {overlappingNaics.length} of {compNaics.length} competitor NAICS codes overlap with your profile.
                    </p>

                    <div className="flex flex-wrap gap-2">
                        {overlappingNaics.map((code, i) => (
                            <span key={`o-${i}`} className="text-xs font-mono bg-emerald-50 text-emerald-700 border-2 border-emerald-300 px-3 py-1 rounded-lg font-bold">
                                {code}
                                <span className="text-[9px] ml-1 font-normal text-emerald-500">OVERLAP</span>
                            </span>
                        ))}
                        {nonOverlappingNaics.map((code, i) => (
                            <span key={`n-${i}`} className="text-xs font-mono bg-stone-50 text-stone-500 border border-stone-200 px-3 py-1 rounded-lg">
                                {code}
                            </span>
                        ))}
                    </div>

                    {overlappingNaics.length === 0 && (
                        <p className="text-xs text-stone-400 mt-2">No NAICS code overlap detected. This competitor operates in different industries.</p>
                    )}
                </div>
            )}

            {/* ================================================================
                ABOUT / DESCRIPTION
            ================================================================ */}
            {comp.description && (
                <div className="bg-white border border-stone-200 rounded-2xl p-6 sm:p-8">
                    <h2 className="text-lg font-bold text-stone-900 mb-3">About</h2>
                    <p className="text-sm text-stone-600 leading-relaxed whitespace-pre-line">{comp.description}</p>
                </div>
            )}

            {/* Services */}
            {services.length > 0 && (
                <div className="bg-white border border-stone-200 rounded-2xl p-6 sm:p-8">
                    <h2 className="text-lg font-bold text-stone-900 flex items-center gap-2 mb-4">
                        <Briefcase className="w-5 h-5" /> Services & Capabilities
                    </h2>
                    <div className="flex flex-wrap gap-2">
                        {services.map((s, i) => (
                            <span key={i} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-lg">
                                {s}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* ================================================================
                ACTIONS
            ================================================================ */}
            <div className="bg-white border border-stone-200 rounded-2xl p-6 sm:p-8">
                <h2 className="text-lg font-bold text-stone-900 mb-4">Actions</h2>
                <div className="flex flex-wrap gap-3">
                    {comp.website && !reanalyzing && (
                        <button
                            type="button"
                            onClick={handleReanalyze}
                            className="px-5 py-2.5 text-sm font-bold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors inline-flex items-center gap-2"
                        >
                            <RefreshCw className="w-4 h-4" /> Re-Analyze
                        </button>
                    )}

                    {comp.uei && (
                        <a
                            href={`https://sam.gov/search/?q=${comp.uei}&index=ei`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-5 py-2.5 text-sm font-bold bg-blue-50 text-blue-700 border border-blue-200 rounded-xl hover:bg-blue-100 transition-colors inline-flex items-center gap-2"
                        >
                            <ExternalLink className="w-4 h-4" /> View on SAM.gov
                        </a>
                    )}

                    <a
                        href={`https://www.usaspending.gov/search/?filters=${encodeURIComponent(JSON.stringify({ recipient_search_text: [comp.competitor_name] }))}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-5 py-2.5 text-sm font-bold bg-stone-50 text-stone-700 border border-stone-200 rounded-xl hover:bg-stone-100 transition-colors inline-flex items-center gap-2"
                    >
                        <ExternalLink className="w-4 h-4" /> USASpending
                    </a>

                    {/* Delete with confirmation */}
                    {!showDeleteConfirm ? (
                        <button
                            type="button"
                            onClick={() => setShowDeleteConfirm(true)}
                            className="px-5 py-2.5 text-sm font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 transition-colors inline-flex items-center gap-2 ml-auto"
                        >
                            <Trash2 className="w-4 h-4" /> Remove Competitor
                        </button>
                    ) : (
                        <div className="flex items-center gap-2 ml-auto bg-red-50 border border-red-200 rounded-xl px-4 py-2">
                            <span className="text-xs font-bold text-red-700">Are you sure?</span>
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={deleting}
                                className="px-3 py-1.5 text-xs font-bold bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors inline-flex items-center gap-1 disabled:opacity-50"
                            >
                                {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                Yes, remove
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowDeleteConfirm(false)}
                                className="px-3 py-1.5 text-xs font-medium text-stone-600 hover:text-stone-800 transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
