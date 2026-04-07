// @ts-nocheck — Supabase join types
"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import {
    ArrowLeft, Building2, Calendar, Clock, MapPin, Shield, Target,
    ExternalLink, Loader2, FileText, CheckCircle2, XCircle,
    AlertCircle, Layers, DollarSign, TrendingUp, Award, Hash,
    ChevronDown, ChevronUp, User, Mail, Phone, Briefcase,
    BarChart3, Sparkles, RefreshCw, MessageSquarePlus, Globe,
    Lock, BadgeCheck, Timer, CircleDot, ArrowUpRight, Star,
    ShieldCheck, ShieldAlert, Minus, BookOpen, Users, Send,
} from "lucide-react";
import clsx from "clsx";
import OpportunityDescription from "@/components/OpportunityDescription";
import OpportunityAttachments from "@/components/OpportunityAttachments";

/* ------------------------------------------------------------------ */
/*  Supabase client                                                    */
/* ------------------------------------------------------------------ */
const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface Contact {
    name: string;
    title?: string;
    email?: string;
    phone?: string;
    isPrimary?: boolean;
    source: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function fmtCurrency(n: number): string {
    if (!n) return "";
    if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toLocaleString()}`;
}

function fmtDate(d: string | null | undefined): string {
    if (!d) return "--";
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function deadlineInfo(responseDeadline: string | null | undefined) {
    if (!responseDeadline) return { label: "TBD", daysLeft: null, isPast: false, isUrgent: false };
    const deadline = new Date(responseDeadline);
    const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / 86400000);
    const isPast = daysLeft < 0;
    const isUrgent = !isPast && daysLeft <= 7;
    let label = "";
    if (isPast) label = "Expired";
    else if (daysLeft === 0) label = "Due today";
    else if (daysLeft === 1) label = "1 day remaining";
    else label = `${daysLeft} days remaining`;
    return { label, daysLeft, isPast, isUrgent };
}

/* ------------------------------------------------------------------ */
/*  Badge component                                                    */
/* ------------------------------------------------------------------ */
function Badge({ children, variant = "default", className = "" }: {
    children: React.ReactNode;
    variant?: "default" | "green" | "red" | "amber" | "blue" | "violet" | "pink" | "emerald" | "hot" | "warm" | "cold";
    className?: string;
}) {
    const styles: Record<string, string> = {
        default: "bg-stone-100 text-stone-600 border-stone-200",
        green: "bg-emerald-50 text-emerald-700 border-emerald-200",
        red: "bg-red-50 text-red-700 border-red-200",
        amber: "bg-amber-50 text-amber-700 border-amber-200",
        blue: "bg-blue-50 text-blue-700 border-blue-200",
        violet: "bg-violet-50 text-violet-700 border-violet-200",
        pink: "bg-pink-50 text-pink-700 border-pink-200",
        emerald: "bg-emerald-100 text-emerald-800 border-emerald-300",
        hot: "bg-red-600 text-white border-red-700",
        warm: "bg-amber-500 text-white border-amber-600",
        cold: "bg-blue-500 text-white border-blue-600",
    };
    return (
        <span className={clsx(
            "inline-flex items-center text-[10px] font-bold px-2.5 py-0.5 rounded-full border uppercase tracking-wide",
            styles[variant] || styles.default,
            className
        )}>
            {children}
        </span>
    );
}

/* ------------------------------------------------------------------ */
/*  Skeleton loaders                                                   */
/* ------------------------------------------------------------------ */
function SkeletonBlock({ lines = 4, className = "" }: { lines?: number; className?: string }) {
    return (
        <div className={clsx("animate-pulse space-y-3", className)}>
            {Array.from({ length: lines }).map((_, i) => (
                <div key={i} className={clsx("h-3 rounded-full bg-stone-200", i === lines - 1 && "w-2/3")} />
            ))}
        </div>
    );
}

function AISkeleton() {
    return (
        <div className="space-y-6 animate-pulse">
            <div>
                <div className="h-3 w-24 bg-stone-700 rounded mb-3" />
                <div className="space-y-2">
                    <div className="h-3 bg-stone-700 rounded w-full" />
                    <div className="h-3 bg-stone-700 rounded w-5/6" />
                    <div className="h-3 bg-stone-700 rounded w-4/6" />
                </div>
            </div>
            <div>
                <div className="h-3 w-32 bg-stone-700 rounded mb-3" />
                <div className="space-y-2">
                    <div className="h-3 bg-stone-700 rounded w-full" />
                    <div className="h-3 bg-stone-700 rounded w-3/4" />
                </div>
            </div>
            <div>
                <div className="h-3 w-36 bg-stone-700 rounded mb-3" />
                <div className="space-y-2">
                    <div className="h-3 bg-stone-700 rounded w-5/6" />
                    <div className="h-3 bg-stone-700 rounded w-full" />
                </div>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Section wrapper                                                    */
/* ------------------------------------------------------------------ */
function Section({ title, icon: Icon, children, className = "", headerRight }: {
    title: string;
    icon: React.ElementType;
    children: React.ReactNode;
    className?: string;
    headerRight?: React.ReactNode;
}) {
    return (
        <div className={clsx("bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm", className)}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100 bg-stone-50/50">
                <h3 className="font-bold text-sm flex items-center gap-2.5 text-stone-800">
                    <Icon className="w-4 h-4 text-stone-400" />
                    {title}
                </h3>
                {headerRight}
            </div>
            <div className="p-5">{children}</div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Eligibility check item                                             */
/* ------------------------------------------------------------------ */
function EligItem({ status, label, detail }: {
    status: "pass" | "fail" | "partial" | "unknown";
    label: string;
    detail?: string;
}) {
    const iconMap = {
        pass: <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500 flex-shrink-0" />,
        fail: <XCircle className="w-4.5 h-4.5 text-red-500 flex-shrink-0" />,
        partial: <AlertCircle className="w-4.5 h-4.5 text-amber-500 flex-shrink-0" />,
        unknown: <Minus className="w-4.5 h-4.5 text-stone-300 flex-shrink-0" />,
    };
    const bgMap = {
        pass: "bg-emerald-50/60",
        fail: "bg-red-50/60",
        partial: "bg-amber-50/60",
        unknown: "bg-stone-50/60",
    };
    return (
        <div className={clsx("flex items-start gap-3 rounded-xl px-4 py-3", bgMap[status])}>
            <div className="mt-0.5">{iconMap[status]}</div>
            <div>
                <p className="text-sm font-semibold text-stone-800">{label}</p>
                {detail && <p className="text-xs text-stone-500 mt-0.5">{detail}</p>}
            </div>
        </div>
    );
}

/* ================================================================== */
/*  MAIN COMPONENT                                                     */
/* ================================================================== */
export default function PortalOpportunityDetail() {
    const params = useParams();
    const oppId = params.id as string;

    /* ---- Core state ---- */
    const [opp, setOpp] = useState<Record<string, any> | null>(null);
    const [loading, setLoading] = useState(true);
    const [profileId, setProfileId] = useState("");
    const [profile, setProfile] = useState<Record<string, any> | null>(null);
    const [matchData, setMatchData] = useState<Record<string, any> | null>(null);
    const [contacts, setContacts] = useState<Contact[]>([]);

    /* ---- Eligibility ---- */
    const [eligibility, setEligibility] = useState<Record<string, any> | null>(null);
    const [eligLoading, setEligLoading] = useState(false);
    const [eligError, setEligError] = useState(false);

    /* ---- AI Analysis ---- */
    const [aiSummary, setAiSummary] = useState<Record<string, any> | null>(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState("");

    /* ---- UI ---- */
    const [addedToPipeline, setAddedToPipeline] = useState(false);
    const [descExpanded, setDescExpanded] = useState(false);
    const [taskNote, setTaskNote] = useState("");
    const [taskSending, setTaskSending] = useState(false);
    const [taskSent, setTaskSent] = useState(false);

    /* ------------------------------------------------------------ */
    /*  Load opportunity, profile, match data, contacts              */
    /* ------------------------------------------------------------ */
    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Get profile
            const { data: prof } = await supabase
                .from("user_profiles")
                .select("id, company_name, sba_certifications, naics_codes, target_states, uei, cage_code")
                .eq("auth_user_id", user.id)
                .single();
            if (prof) {
                setProfileId(prof.id);
                setProfile(prof as Record<string, any>);
            }

            // Get opportunity
            const { data } = await supabase
                .from("opportunities")
                .select("*")
                .eq("id", oppId)
                .single();

            if (data) {
                setOpp(data);

                // Pre-load cached AI
                if (data.ai_win_strategy && Object.keys(data.ai_win_strategy).length > 0) {
                    setAiSummary(data.ai_win_strategy);
                }

                // Load match data if profile exists
                if (prof) {
                    const { data: match } = await supabase
                        .from("user_matches")
                        .select("score, classification, score_breakdown, is_saved")
                        .eq("user_profile_id", prof.id)
                        .eq("opportunity_id", oppId)
                        .maybeSingle();
                    if (match) setMatchData(match);
                }

                // Load contacts from DB
                const { data: dbContacts } = await supabase
                    .from("contacts")
                    .select("*")
                    .eq("notice_id", data.notice_id)
                    .order("is_primary", { ascending: false });

                // Extract POC from raw_json as fallback
                const rawJson = data.raw_json || {};
                const samPocs: any[] = [];
                if (rawJson.pointOfContact) {
                    const pocs = Array.isArray(rawJson.pointOfContact)
                        ? rawJson.pointOfContact
                        : [rawJson.pointOfContact];
                    for (const poc of pocs) {
                        if (poc.fullName || poc.email || poc.phone) {
                            samPocs.push(poc);
                        }
                    }
                }

                // Build unified contact list
                const unified: Contact[] = [];
                if (dbContacts && dbContacts.length > 0) {
                    for (const c of dbContacts) {
                        unified.push({
                            name: c.fullname || "Unknown",
                            title: c.title || undefined,
                            email: c.email || undefined,
                            phone: c.phone || undefined,
                            isPrimary: c.is_primary,
                            source: "database",
                        });
                    }
                }
                // Add SAM POCs not already in list
                for (const poc of samPocs) {
                    const alreadyExists = unified.some(
                        (c) => c.email === poc.email || c.name === poc.fullName
                    );
                    if (!alreadyExists) {
                        unified.push({
                            name: poc.fullName || "Unknown",
                            title: poc.title || undefined,
                            email: poc.email || undefined,
                            phone: poc.phone || undefined,
                            isPrimary: poc.type === "primary",
                            source: "sam.gov",
                        });
                    }
                }
                setContacts(unified);
            }

            setLoading(false);
        })();
    }, [oppId]);

    /* ------------------------------------------------------------ */
    /*  Auto-trigger eligibility                                     */
    /* ------------------------------------------------------------ */
    useEffect(() => {
        if (!profileId || !opp?.notice_id || eligibility || eligLoading) return;
        (async () => {
            setEligLoading(true);
            setEligError(false);
            try {
                const res = await fetch("/api/eligibility", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ user_profile_id: profileId, notice_id: opp.notice_id }),
                });
                const data = await res.json();
                if (data.success) setEligibility(data);
                else setEligError(true);
            } catch {
                setEligError(true);
            }
            setEligLoading(false);
        })();
    }, [profileId, opp?.notice_id]);

    /* ------------------------------------------------------------ */
    /*  Auto-trigger AI analysis                                     */
    /* ------------------------------------------------------------ */
    const loadAI = useCallback(async () => {
        if (!opp?.notice_id || aiLoading) return;
        setAiLoading(true);
        setAiError("");
        try {
            const res = await fetch("/api/ai/summarize-document", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ notice_id: opp.notice_id }),
            });
            const data = await res.json();
            if (data.success) setAiSummary(data.analysis);
            else setAiError("AI analysis unavailable for this opportunity.");
        } catch {
            setAiError("Could not load AI analysis.");
        }
        setAiLoading(false);
    }, [opp?.notice_id, aiLoading]);

    useEffect(() => {
        if (!opp?.notice_id || aiSummary || aiLoading) return;
        loadAI();
    }, [opp?.notice_id, aiSummary]);

    /* ------------------------------------------------------------ */
    /*  Actions                                                      */
    /* ------------------------------------------------------------ */
    const addToPipeline = async () => {
        if (!profileId || !oppId) return;
        await supabase.from("user_pursuits").upsert({
            user_profile_id: profileId,
            opportunity_id: oppId,
            stage: "discovered",
            priority: "medium",
        }, { onConflict: "user_profile_id,opportunity_id" });
        setAddedToPipeline(true);
        setTimeout(() => setAddedToPipeline(false), 4000);
    };

    const sendTaskNote = async () => {
        if (!profileId || !oppId || !taskNote.trim()) return;
        setTaskSending(true);
        await supabase.from("client_tasks").insert({
            client_id: profileId,
            title: `Question about: ${String(opp?.title || "").slice(0, 80)}`,
            description: taskNote,
            status: "pending",
            priority: "medium",
            related_opportunity_id: oppId,
        });
        setTaskSending(false);
        setTaskSent(true);
        setTaskNote("");
    };

    /* ------------------------------------------------------------ */
    /*  Loading / Error states                                       */
    /* ------------------------------------------------------------ */
    if (loading) return (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Loader2 className="w-10 h-10 animate-spin text-stone-300" />
            <p className="text-sm text-stone-400 font-medium">Loading opportunity details...</p>
        </div>
    );

    if (!opp) return (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
            <AlertCircle className="w-12 h-12 text-stone-300" />
            <p className="text-stone-500 font-medium">Opportunity not found</p>
            <Link href="/portal/opportunities" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                <ArrowLeft className="w-4 h-4" /> Back to Opportunities
            </Link>
        </div>
    );

    /* ------------------------------------------------------------ */
    /*  Derived data                                                 */
    /* ------------------------------------------------------------ */
    const dl = deadlineInfo(opp.response_deadline ? String(opp.response_deadline) : null);
    const value = Number(opp.estimated_value || opp.award_amount || 0);
    const reqs = (opp.structured_requirements || {}) as Record<string, any>;
    const samUrl = `https://sam.gov/opp/${opp.notice_id}/view`;
    const resourceLinks = Array.isArray(opp.resource_links)
        ? opp.resource_links
        : typeof opp.resource_links === "object" && opp.resource_links
            ? Object.values(opp.resource_links as Record<string, string>)
            : [];

    const hasSetAside = !!opp.set_aside_code && !String(opp.set_aside_code).toLowerCase().includes("none");
    const classification = matchData?.classification || null;
    const matchScore = matchData?.score || null;
    const scoreBreakdown = matchData?.score_breakdown || null;

    // Notice type color mapping
    const noticeTypeVariant = (nt: string): "violet" | "blue" | "amber" | "green" | "default" => {
        const lower = (nt || "").toLowerCase();
        if (lower.includes("sources sought") || lower.includes("rfi")) return "violet";
        if (lower.includes("presolicitation")) return "blue";
        if (lower.includes("solicitation") || lower.includes("combined")) return "green";
        if (lower.includes("award")) return "amber";
        return "default";
    };

    const classificationVariant = (c: string): "hot" | "warm" | "cold" => {
        if (c === "HOT") return "hot";
        if (c === "WARM") return "warm";
        return "cold";
    };

    const statusVariant = (s: string): "green" | "red" | "violet" | "amber" | "default" => {
        if (s === "ACTIVE") return "green";
        if (s === "EXPIRING_SOON") return "red";
        if (s === "MARKET_RESEARCH") return "violet";
        if (s === "AWARDED") return "amber";
        return "default";
    };

    /* ================================================================ */
    /*  RENDER                                                          */
    /* ================================================================ */
    return (
        <div className="w-full space-y-8 pb-12">

            {/* -------------------------------------------------------- */}
            {/*  Back navigation                                         */}
            {/* -------------------------------------------------------- */}
            <Link
                href="/portal/opportunities"
                className="inline-flex items-center gap-1.5 text-sm text-stone-400 hover:text-stone-700 transition-colors group"
            >
                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                Back to Opportunities
            </Link>

            {/* -------------------------------------------------------- */}
            {/*  HEADER SECTION — full width                             */}
            {/* -------------------------------------------------------- */}
            <div className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-6 sm:p-8">
                    {/* Badges row */}
                    <div className="flex items-center gap-2 flex-wrap mb-4">
                        <Badge variant={statusVariant(String(opp.status))}>
                            {String(opp.status)}
                        </Badge>
                        {opp.notice_type && (
                            <Badge variant={noticeTypeVariant(String(opp.notice_type))}>
                                {String(opp.notice_type)}
                            </Badge>
                        )}
                        {hasSetAside && (
                            <Badge variant="amber">
                                {String(opp.set_aside_code)}
                            </Badge>
                        )}
                        {opp.naics_code && (
                            <Badge variant="default">
                                NAICS {String(opp.naics_code)}
                            </Badge>
                        )}
                        {opp.psc_code && (
                            <Badge variant="default">
                                PSC {String(opp.psc_code)}
                            </Badge>
                        )}
                        {classification && (
                            <Badge variant={classificationVariant(classification)}>
                                <Star className="w-3 h-3 mr-1" />
                                {classification} MATCH
                            </Badge>
                        )}
                        {opp.veteran_relevance_flag && <Badge variant="emerald">VETERAN</Badge>}
                        {opp.wosb_relevance_flag && <Badge variant="pink">WOSB</Badge>}
                        {opp.small_business_relevance_flag && <Badge variant="blue">SMALL BUSINESS</Badge>}
                        {opp.sources_sought_flag && <Badge variant="violet">SOURCES SOUGHT</Badge>}
                    </div>

                    {/* Title */}
                    <h1 className="text-2xl sm:text-3xl font-black text-stone-900 leading-tight tracking-tight">
                        {String(opp.title)}
                    </h1>

                    {/* Agency */}
                    <div className="flex items-center gap-2 mt-3">
                        <Building2 className="w-4 h-4 text-stone-400" />
                        <p className="text-sm text-stone-600 font-medium">
                            {String(opp.agency || "Unknown Agency")}
                            {opp.sub_agency ? <span className="text-stone-400"> / {String(opp.sub_agency)}</span> : ""}
                            {opp.office ? <span className="text-stone-300"> / {String(opp.office)}</span> : ""}
                        </p>
                    </div>

                    {/* Key metrics bar */}
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mt-5 pt-5 border-t border-stone-100">
                        {/* Posted date */}
                        <div className="flex items-center gap-2 text-sm text-stone-500">
                            <Calendar className="w-4 h-4 text-stone-400" />
                            <span>Posted {fmtDate(opp.posted_date)}</span>
                        </div>

                        {/* Deadline with countdown */}
                        <div className={clsx(
                            "flex items-center gap-2 text-sm font-semibold",
                            dl.isPast ? "text-red-500" : dl.isUrgent ? "text-red-600" : "text-stone-700"
                        )}>
                            <Timer className={clsx("w-4 h-4", dl.isPast ? "text-red-400" : dl.isUrgent ? "text-red-500" : "text-stone-400")} />
                            <span>
                                {opp.response_deadline ? fmtDate(opp.response_deadline) : "No deadline"}
                                {dl.label !== "TBD" && (
                                    <span className={clsx(
                                        "ml-1.5 text-xs font-bold px-2 py-0.5 rounded-full",
                                        dl.isPast
                                            ? "bg-red-100 text-red-600"
                                            : dl.isUrgent
                                                ? "bg-red-100 text-red-600"
                                                : "bg-emerald-100 text-emerald-700"
                                    )}>
                                        {dl.label}
                                    </span>
                                )}
                            </span>
                        </div>

                        {/* Value */}
                        {value > 0 && (
                            <div className="flex items-center gap-2 text-sm text-stone-700 font-semibold">
                                <DollarSign className="w-4 h-4 text-stone-400" />
                                {fmtCurrency(value)}
                            </div>
                        )}

                        {/* Match score */}
                        {matchScore !== null && (
                            <div className="flex items-center gap-2 text-sm text-stone-700 font-semibold">
                                <BarChart3 className="w-4 h-4 text-stone-400" />
                                Score: {matchScore}
                            </div>
                        )}

                        {/* Solicitation number */}
                        {opp.solicitation_number && (
                            <div className="flex items-center gap-2 text-sm text-stone-500 font-mono">
                                <Hash className="w-4 h-4 text-stone-400" />
                                {String(opp.solicitation_number)}
                            </div>
                        )}

                        {/* Location */}
                        {opp.place_of_performance_state && (
                            <div className="flex items-center gap-2 text-sm text-stone-500">
                                <MapPin className="w-4 h-4 text-stone-400" />
                                {opp.place_of_performance_city ? `${String(opp.place_of_performance_city)}, ` : ""}
                                {String(opp.place_of_performance_state)}
                            </div>
                        )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-3 mt-6">
                        <button
                            type="button"
                            onClick={addToPipeline}
                            className={clsx(
                                "px-6 py-2.5 rounded-xl text-sm font-bold inline-flex items-center gap-2 transition-all duration-200",
                                addedToPipeline
                                    ? "bg-emerald-600 text-white shadow-lg shadow-emerald-200"
                                    : "bg-stone-900 text-white hover:bg-stone-800 shadow-lg shadow-stone-200"
                            )}
                        >
                            {addedToPipeline ? <CheckCircle2 className="w-4 h-4" /> : <Layers className="w-4 h-4" />}
                            {addedToPipeline ? "Added to Pipeline!" : "Add to Pipeline"}
                        </button>
                        <a
                            href={samUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-white border border-stone-200 text-stone-700 px-6 py-2.5 rounded-xl text-sm font-bold inline-flex items-center gap-2 hover:bg-stone-50 hover:border-stone-300 transition-colors"
                        >
                            <Globe className="w-4 h-4 text-blue-500" />
                            View on SAM.gov
                            <ArrowUpRight className="w-3.5 h-3.5 text-stone-400" />
                        </a>
                    </div>
                </div>
            </div>

            {/* -------------------------------------------------------- */}
            {/*  TWO-COLUMN LAYOUT                                       */}
            {/* -------------------------------------------------------- */}
            <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">

                {/* ====================================================== */}
                {/*  LEFT COLUMN — 70%                                      */}
                {/* ====================================================== */}
                <div className="lg:col-span-7 space-y-6">

                    {/* ---- Description (ALWAYS VISIBLE) ---- */}
                    <OpportunityDescription
                        noticeId={String(opp.notice_id)}
                        currentDescription={opp.description ? String(opp.description) : undefined}
                        defaultCollapsed={false}
                    />

                    {/* ---- Attachments ---- */}
                    <OpportunityAttachments
                        noticeId={String(opp.notice_id)}
                        resourceLinks={resourceLinks as string[]}
                        defaultCollapsed={false}
                    />

                    {/* ---- AI Analysis (AUTO-LOADED) ---- */}
                    <div className="bg-stone-900 rounded-2xl overflow-hidden shadow-sm">
                        <div className="flex items-center justify-between px-6 py-5 border-b border-stone-800">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                                    <Sparkles className="w-4 h-4 text-emerald-400" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-sm text-white">
                                        {aiLoading ? "Generating AI Analysis..." : "AI Win Strategy"}
                                    </h3>
                                    <p className="text-[11px] text-stone-500 mt-0.5">Powered by CapturePilot AI</p>
                                </div>
                            </div>
                            {aiLoading && <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />}
                        </div>

                        <div className="px-6 py-5">
                            {aiLoading && <AISkeleton />}

                            {aiError && !aiLoading && (
                                <div className="flex items-center justify-between">
                                    <p className="text-sm text-stone-500">{aiError}</p>
                                    <button
                                        type="button"
                                        onClick={loadAI}
                                        className="text-xs text-emerald-400 hover:text-emerald-300 font-medium inline-flex items-center gap-1.5 transition-colors"
                                    >
                                        <RefreshCw className="w-3 h-3" /> Retry
                                    </button>
                                </div>
                            )}

                            {!aiLoading && aiSummary && (
                                <div className="space-y-6">
                                    {/* Executive Summary */}
                                    {aiSummary.executive_summary && (
                                        <div>
                                            <p className="text-[10px] text-emerald-400 uppercase font-bold tracking-wider mb-2.5">
                                                Executive Summary
                                            </p>
                                            <p className="text-sm text-stone-300 leading-relaxed">
                                                {String(aiSummary.executive_summary)}
                                            </p>
                                        </div>
                                    )}

                                    {/* Key Requirements */}
                                    {(aiSummary.key_requirements as string[])?.length > 0 && (
                                        <div>
                                            <p className="text-[10px] text-stone-400 uppercase font-bold tracking-wider mb-2.5">
                                                Key Requirements
                                            </p>
                                            <div className="space-y-2">
                                                {(aiSummary.key_requirements as string[]).map((r: string, i: number) => (
                                                    <div key={i} className="flex items-start gap-2.5">
                                                        <CircleDot className="w-3 h-3 text-stone-600 mt-1 flex-shrink-0" />
                                                        <p className="text-sm text-stone-300">{r}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Evaluation Criteria */}
                                    {(aiSummary.evaluation_criteria as string[])?.length > 0 && (
                                        <div>
                                            <p className="text-[10px] text-amber-400 uppercase font-bold tracking-wider mb-2.5">
                                                Evaluation Criteria
                                            </p>
                                            <div className="space-y-2">
                                                {(aiSummary.evaluation_criteria as string[]).map((r: string, i: number) => (
                                                    <div key={i} className="flex items-start gap-2.5">
                                                        <Target className="w-3 h-3 text-amber-500 mt-1 flex-shrink-0" />
                                                        <p className="text-sm text-stone-300">{r}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Recommended Actions */}
                                    {(aiSummary.recommended_actions as string[])?.length > 0 && (
                                        <div>
                                            <p className="text-[10px] text-emerald-400 uppercase font-bold tracking-wider mb-2.5">
                                                Recommended Approach
                                            </p>
                                            <div className="space-y-2">
                                                {(aiSummary.recommended_actions as string[]).map((a: string, i: number) => (
                                                    <div key={i} className="flex items-start gap-2.5">
                                                        <span className="text-xs font-bold text-emerald-500 w-5 flex-shrink-0 text-right mt-0.5">{i + 1}.</span>
                                                        <p className="text-sm text-stone-300">{a}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Competition Level */}
                                    {aiSummary.competition_level && (
                                        <div className="flex items-center gap-3 pt-4 border-t border-stone-800">
                                            <span className="text-[10px] text-stone-500 uppercase font-bold">Competition Level</span>
                                            <span className={clsx(
                                                "text-xs font-bold px-3 py-1 rounded-full",
                                                aiSummary.competition_level === "LOW" ? "bg-emerald-900/50 text-emerald-300 border border-emerald-800" :
                                                aiSummary.competition_level === "HIGH" ? "bg-red-900/50 text-red-300 border border-red-800" :
                                                "bg-amber-900/50 text-amber-300 border border-amber-800"
                                            )}>
                                                {String(aiSummary.competition_level)}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ---- Contact Our Team ---- */}
                    <Section title="Contact Our Team About This" icon={MessageSquarePlus}>
                        {taskSent ? (
                            <div className="flex items-center gap-3 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                                <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                                <div>
                                    <p className="text-sm font-semibold">Message sent to your consulting team!</p>
                                    <p className="text-xs text-emerald-600 mt-0.5">You will see updates in your Tasks tab.</p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <p className="text-xs text-stone-500">
                                    Have a question or want our team to take action on this opportunity? Send a note and it will appear as a task for your consulting team.
                                </p>
                                <textarea
                                    value={taskNote}
                                    onChange={(e) => setTaskNote(e.target.value)}
                                    placeholder="e.g. Can we put together a teaming arrangement for this? / What is our competitive position? / Please review the SOW..."
                                    rows={3}
                                    className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:border-stone-300 transition-colors resize-none"
                                />
                                <button
                                    type="button"
                                    onClick={sendTaskNote}
                                    disabled={!taskNote.trim() || taskSending}
                                    className={clsx(
                                        "px-5 py-2.5 rounded-xl text-sm font-bold inline-flex items-center gap-2 transition-all",
                                        taskNote.trim()
                                            ? "bg-stone-900 text-white hover:bg-stone-800 shadow-sm"
                                            : "bg-stone-100 text-stone-400 cursor-not-allowed"
                                    )}
                                >
                                    {taskSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                    Send to Consulting Team
                                </button>
                            </div>
                        )}
                    </Section>
                </div>

                {/* ====================================================== */}
                {/*  RIGHT COLUMN — 30% sidebar                            */}
                {/* ====================================================== */}
                <div className="lg:col-span-3 space-y-6">

                    {/* ---- Match Score Breakdown ---- */}
                    {matchScore !== null && (
                        <Section title="Match Score" icon={BarChart3}>
                            <div className="text-center mb-4">
                                <div className={clsx(
                                    "inline-flex items-center justify-center w-20 h-20 rounded-2xl text-3xl font-black",
                                    classification === "HOT"
                                        ? "bg-red-50 text-red-600 border-2 border-red-200"
                                        : classification === "WARM"
                                            ? "bg-amber-50 text-amber-600 border-2 border-amber-200"
                                            : "bg-blue-50 text-blue-600 border-2 border-blue-200"
                                )}>
                                    {matchScore}
                                </div>
                                <p className="text-xs text-stone-400 mt-2 font-medium uppercase">{classification} Match</p>
                            </div>
                            {scoreBreakdown && typeof scoreBreakdown === "object" && (
                                <div className="space-y-2">
                                    {Object.entries(scoreBreakdown).map(([key, val]) => (
                                        <div key={key} className="flex items-center justify-between text-xs">
                                            <span className="text-stone-500 capitalize">{key.replace(/_/g, " ")}</span>
                                            <span className="font-bold text-stone-700">{String(val)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Section>
                    )}

                    {/* ---- Eligibility Check (AUTO-LOADED) ---- */}
                    <div className={clsx(
                        "bg-white border rounded-2xl overflow-hidden shadow-sm",
                        eligibility?.match_strength === "strong" ? "border-emerald-200" :
                        eligibility?.match_strength === "moderate" ? "border-amber-200" :
                        eligibility?.match_strength === "ineligible" ? "border-red-200" :
                        "border-stone-200"
                    )}>
                        <div className={clsx(
                            "flex items-center gap-3 px-5 py-4 border-b",
                            eligibility?.match_strength === "strong" ? "bg-emerald-50 border-emerald-100" :
                            eligibility?.match_strength === "moderate" ? "bg-amber-50 border-amber-100" :
                            eligibility?.match_strength === "ineligible" ? "bg-red-50 border-red-100" :
                            "bg-stone-50 border-stone-100"
                        )}>
                            {eligLoading ? (
                                <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
                            ) : eligibility?.eligible ? (
                                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                            ) : eligibility ? (
                                <ShieldAlert className="w-5 h-5 text-red-500" />
                            ) : (
                                <Shield className="w-5 h-5 text-stone-400" />
                            )}
                            <div>
                                <h3 className="font-bold text-sm text-stone-800">
                                    {eligLoading ? "Checking Eligibility..." :
                                     eligibility?.eligible ? "Eligible" :
                                     eligibility ? "Gaps Detected" :
                                     "Eligibility Check"}
                                </h3>
                                {eligibility?.match_strength && (
                                    <p className="text-[11px] text-stone-500">
                                        Strength: <span className="font-bold capitalize">{String(eligibility.match_strength)}</span>
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="p-4">
                            {eligLoading && <SkeletonBlock lines={4} />}

                            {eligError && !eligLoading && (
                                <p className="text-xs text-stone-400">Could not load eligibility data.</p>
                            )}

                            {!eligLoading && eligibility && (
                                <div className="space-y-2">
                                    {/* Qualifying factors */}
                                    {(eligibility.eligible_reasons as string[])?.map((r: string, i: number) => (
                                        <EligItem key={`pass-${i}`} status="pass" label={r} />
                                    ))}

                                    {/* Missing requirements */}
                                    {(eligibility.missing_requirements as string[])?.map((r: string, i: number) => (
                                        <EligItem key={`fail-${i}`} status="fail" label={r} />
                                    ))}

                                    {/* Recommendations */}
                                    {(eligibility.recommendations as string[])?.length > 0 && (
                                        <div className="mt-3 pt-3 border-t border-stone-100">
                                            <p className="text-[10px] font-bold text-amber-600 uppercase mb-2">Recommendations</p>
                                            {(eligibility.recommendations as string[]).map((r: string, i: number) => (
                                                <div key={i} className="flex items-start gap-2 text-xs text-stone-600 mb-1.5">
                                                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-amber-500" />
                                                    <span>{r}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ---- Contract Details ---- */}
                    <Section title="Contract Details" icon={Briefcase}>
                        <div className="space-y-3">
                            {[
                                { label: "Agency", value: String(opp.agency || "--") },
                                { label: "Sub-Agency", value: String(opp.sub_agency || "--") },
                                { label: "Office", value: String(opp.office || "--") },
                                { label: "NAICS", value: String(opp.naics_code || "--"), mono: true },
                                { label: "PSC Code", value: String(opp.psc_code || "--"), mono: true },
                                { label: "Set-Aside", value: hasSetAside ? String(opp.set_aside_code) : "Full & Open" },
                                { label: "Sol. #", value: String(opp.solicitation_number || "--"), mono: true },
                                { label: "Notice ID", value: String(opp.notice_id || "--"), mono: true },
                                { label: "Posted", value: fmtDate(opp.posted_date) },
                                { label: "Response Due", value: fmtDate(opp.response_deadline) },
                                { label: "Est. Value", value: value > 0 ? fmtCurrency(value) : "--" },
                            ].filter(item => item.value !== "--").map(({ label, value: val, mono }) => (
                                <div key={label} className="flex justify-between gap-3 text-xs">
                                    <span className="text-stone-400 flex-shrink-0">{label}</span>
                                    <span className={clsx(
                                        "font-medium text-stone-700 text-right break-all",
                                        mono && "font-mono text-[11px]"
                                    )}>
                                        {val}
                                    </span>
                                </div>
                            ))}
                            {opp.place_of_performance_state && (
                                <div className="flex justify-between gap-3 text-xs">
                                    <span className="text-stone-400">Location</span>
                                    <span className="font-medium text-stone-700 inline-flex items-center gap-1">
                                        <MapPin className="w-3 h-3" />
                                        {opp.place_of_performance_city ? `${String(opp.place_of_performance_city)}, ` : ""}
                                        {String(opp.place_of_performance_state)}
                                    </span>
                                </div>
                            )}
                        </div>
                    </Section>

                    {/* ---- Incumbent Info ---- */}
                    {opp.incumbent_contractor_name && (
                        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 shadow-sm">
                            <h3 className="font-bold text-sm text-amber-800 flex items-center gap-2 mb-3">
                                <AlertCircle className="w-4 h-4" /> Incumbent Contractor
                            </h3>
                            <p className="text-sm font-bold text-amber-900">{String(opp.incumbent_contractor_name)}</p>
                            {opp.incumbent_contractor_uei && (
                                <p className="text-xs text-amber-700 font-mono mt-1">UEI: {String(opp.incumbent_contractor_uei)}</p>
                            )}
                            {opp.incumbent_award_amount && (
                                <p className="text-xs text-amber-700 mt-1">
                                    Previous Award: <span className="font-bold">{fmtCurrency(Number(opp.incumbent_award_amount))}</span>
                                </p>
                            )}
                        </div>
                    )}

                    {/* ---- Contacts ---- */}
                    {contacts.length > 0 && (
                        <Section title={`Contacts (${contacts.length})`} icon={Users}>
                            <div className="space-y-4">
                                {contacts.map((contact, i) => (
                                    <div key={i} className={clsx(
                                        "rounded-xl p-3.5",
                                        contact.isPrimary ? "bg-blue-50/60 border border-blue-100" : "bg-stone-50 border border-stone-100"
                                    )}>
                                        <div className="flex items-center gap-2 mb-1">
                                            <User className="w-3.5 h-3.5 text-stone-400" />
                                            <span className="text-sm font-semibold text-stone-800">{contact.name}</span>
                                            {contact.isPrimary && (
                                                <span className="text-[9px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">PRIMARY</span>
                                            )}
                                        </div>
                                        {contact.title && (
                                            <p className="text-xs text-stone-500 ml-5.5 mb-1">{contact.title}</p>
                                        )}
                                        {contact.email && (
                                            <a
                                                href={`mailto:${contact.email}`}
                                                className="flex items-center gap-2 text-xs text-blue-600 hover:text-blue-800 ml-5.5 mb-0.5"
                                            >
                                                <Mail className="w-3 h-3" /> {contact.email}
                                            </a>
                                        )}
                                        {contact.phone && (
                                            <a
                                                href={`tel:${contact.phone}`}
                                                className="flex items-center gap-2 text-xs text-stone-600 hover:text-stone-800 ml-5.5"
                                            >
                                                <Phone className="w-3 h-3" /> {contact.phone}
                                            </a>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </Section>
                    )}

                    {/* ---- Structured Requirements ---- */}
                    {Object.keys(reqs).length > 0 && (
                        <Section title="Requirements" icon={BookOpen}>
                            <div className="space-y-2.5">
                                {reqs.bonding_required && (
                                    <div className="flex items-center gap-2.5 text-xs">
                                        <div className="w-6 h-6 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                                            <DollarSign className="w-3.5 h-3.5 text-amber-600" />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-stone-700">Bonding Required</p>
                                            {reqs.bonding_amount && <p className="text-stone-500">{String(reqs.bonding_amount)}</p>}
                                        </div>
                                    </div>
                                )}
                                {reqs.insurance_required && (
                                    <div className="flex items-center gap-2.5 text-xs">
                                        <div className="w-6 h-6 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                                            <Shield className="w-3.5 h-3.5 text-blue-600" />
                                        </div>
                                        <p className="font-semibold text-stone-700">Insurance Required</p>
                                    </div>
                                )}
                                {reqs.security_clearance && (
                                    <div className="flex items-center gap-2.5 text-xs">
                                        <div className="w-6 h-6 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                                            <Lock className="w-3.5 h-3.5 text-red-600" />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-stone-700">Security Clearance</p>
                                            <p className="text-stone-500">{String(reqs.security_clearance)}</p>
                                        </div>
                                    </div>
                                )}
                                {reqs.min_experience_years && (
                                    <div className="flex items-center gap-2.5 text-xs">
                                        <div className="w-6 h-6 rounded-lg bg-stone-100 flex items-center justify-center flex-shrink-0">
                                            <Clock className="w-3.5 h-3.5 text-stone-600" />
                                        </div>
                                        <p className="font-semibold text-stone-700">{String(reqs.min_experience_years)} years experience required</p>
                                    </div>
                                )}
                                {(reqs.certifications_required as string[])?.map((c: string, i: number) => (
                                    <div key={i} className="flex items-center gap-2.5 text-xs">
                                        <div className="w-6 h-6 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                                            <BadgeCheck className="w-3.5 h-3.5 text-emerald-600" />
                                        </div>
                                        <p className="font-semibold text-stone-700">{c}</p>
                                    </div>
                                ))}
                                {reqs.period_of_performance && (
                                    <div className="flex items-center gap-2.5 text-xs">
                                        <div className="w-6 h-6 rounded-lg bg-stone-100 flex items-center justify-center flex-shrink-0">
                                            <Calendar className="w-3.5 h-3.5 text-stone-600" />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-stone-700">Period of Performance</p>
                                            <p className="text-stone-500">{String(reqs.period_of_performance)}</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </Section>
                    )}

                    {/* ---- Quick Links ---- */}
                    <Section title="Quick Links" icon={ExternalLink}>
                        <div className="space-y-2">
                            <a
                                href={samUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-between p-3 rounded-xl bg-stone-50 hover:bg-stone-100 transition-colors group"
                            >
                                <div className="flex items-center gap-2.5">
                                    <Globe className="w-4 h-4 text-blue-500" />
                                    <span className="text-sm font-medium text-stone-700">SAM.gov Full Listing</span>
                                </div>
                                <ArrowUpRight className="w-3.5 h-3.5 text-stone-400 group-hover:text-stone-600 transition-colors" />
                            </a>
                            <Link
                                href="/portal/tasks"
                                className="flex items-center justify-between p-3 rounded-xl bg-stone-50 hover:bg-stone-100 transition-colors group"
                            >
                                <div className="flex items-center gap-2.5">
                                    <FileText className="w-4 h-4 text-stone-500" />
                                    <span className="text-sm font-medium text-stone-700">Your Tasks</span>
                                </div>
                                <ArrowUpRight className="w-3.5 h-3.5 text-stone-400 group-hover:text-stone-600 transition-colors" />
                            </Link>
                            <Link
                                href="/portal/opportunities"
                                className="flex items-center justify-between p-3 rounded-xl bg-stone-50 hover:bg-stone-100 transition-colors group"
                            >
                                <div className="flex items-center gap-2.5">
                                    <Layers className="w-4 h-4 text-stone-500" />
                                    <span className="text-sm font-medium text-stone-700">All Opportunities</span>
                                </div>
                                <ArrowUpRight className="w-3.5 h-3.5 text-stone-400 group-hover:text-stone-600 transition-colors" />
                            </Link>
                        </div>
                    </Section>
                </div>
            </div>

            {/* -------------------------------------------------------- */}
            {/*  Consulting CTA — full width footer                      */}
            {/* -------------------------------------------------------- */}
            <div className="bg-gradient-to-r from-stone-900 to-stone-800 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                        <Award className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                        <p className="text-sm text-white font-bold">Our team is managing your pursuit strategy.</p>
                        <p className="text-xs text-stone-400 mt-0.5">Check your Tasks tab for action items and updates from your consulting team.</p>
                    </div>
                </div>
                <Link
                    href="/portal/tasks"
                    className="bg-white text-stone-900 text-sm font-bold px-6 py-2.5 rounded-xl hover:bg-stone-100 transition-colors whitespace-nowrap inline-flex items-center gap-2 shadow-sm"
                >
                    View Tasks
                    <ArrowUpRight className="w-4 h-4" />
                </Link>
            </div>
        </div>
    );
}
