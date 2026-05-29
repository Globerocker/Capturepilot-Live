"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseClient } from "@/lib/supabase/client";
import {
    ArrowLeft, Loader2, Shield, Globe, ExternalLink, TrendingUp, Users, Briefcase,
    MapPin, ChevronRight, Building, Target, Linkedin,
    Code, Wrench, Stethoscope, ShieldCheck, Cpu, Truck, Hammer, GraduationCap,
    Cloud, FileText, Plane, type LucideIcon, Crown,
} from "lucide-react";
import clsx from "clsx";
import { NAICS_CODES } from "@/lib/naics-codes";
import { PastAwardsPanel } from "@/components/PastAwardsPanel";
import { SubawardsPanel } from "@/components/SubawardsPanel";
import { ContractorDetailView } from "@/components/ContractorDetailView";

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

interface ServiceItem {
    name: string;
    description?: string;
}

function formatRevenue(raw: string | null): string {
    if (!raw) return "—";
    if (raw.startsWith("$")) return raw;
    const num = parseFloat(raw.replace(/[^0-9.]/g, ""));
    if (isNaN(num)) return raw;
    if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(1)}B`;
    if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(0)}M`;
    if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
    return `$${num.toLocaleString()}`;
}

function formatEmployees(raw: string | null): string {
    if (!raw) return "—";
    const num = parseInt(raw.replace(/[^0-9]/g, ""), 10);
    if (isNaN(num)) return raw;
    if (num >= 10_000) return `${(num / 1_000).toFixed(0)}K+`;
    return num.toLocaleString();
}

function lookupNaicsLabel(code: string): string {
    return NAICS_CODES.find(n => n.code === code)?.label || "";
}

function normalizeServices(raw: unknown): ServiceItem[] {
    if (!raw || !Array.isArray(raw)) return [];
    const out: ServiceItem[] = [];
    for (const s of raw) {
        if (typeof s === "string" && s.trim()) {
            out.push({ name: s.trim() });
            continue;
        }
        if (s && typeof s === "object") {
            const obj = s as Record<string, unknown>;
            const name = String(obj.name || obj.title || obj.label || "").trim();
            if (!name) continue;
            const description = obj.description || obj.summary || obj.detail;
            out.push({ name, description: description ? String(description) : undefined });
        }
    }
    return out;
}

// Coerces arbitrary JSON (strings, objects, mixed) into a flat string[].
// crawl_data shapes vary per crawler — objects here crash React with
// "Objects are not valid as a React child" if rendered directly.
function coerceStringArray(raw: unknown): string[] {
    if (!raw) return [];
    if (!Array.isArray(raw)) return [];
    const out: string[] = [];
    for (const item of raw) {
        if (typeof item === "string") {
            const t = item.trim();
            if (t) out.push(t);
        } else if (item && typeof item === "object") {
            const obj = item as Record<string, unknown>;
            const v = obj.name || obj.title || obj.label || obj.value || obj.text || obj.client || obj.location || obj.city;
            if (v) out.push(String(v).trim());
        }
    }
    return out;
}

interface LeaderItem { name: string; title?: string; bio?: string }

// Common non-person strings the crawler mistakes for names/titles. We reject
// entries where name or title matches these — they come from marketing copy,
// section headers, or company/association names that look like "First Last".
const NON_PERSON_PATTERNS = [
    /\b(inc|llc|ltd|corp|corporation|company|group|association|foundation|partners|services|solutions|systems|industries|holdings)\b/i,
    /\b(capabilities|offerings|directory|overview|mission|vision|about|contact|home|career|careers|news|press|blog|resources|products|solutions)\b/i,
    /\b(department|division|bureau|agency|office)\b/i,
    /\b(guide|course|training|glossary|beginner|expert|tutorial|lesson|module|certificate|certification|schedule|registration|checklist|template|workbook|ebook|webinar|podcast|handbook|masterclass)\b/i,
    /\b(get|buy|learn|read|watch|download|explore|discover|join|start|view|see|book|try|shop)\b/i,
    /^(the|our|your|their|this|that)\s/i,
];

// Parse a single naics_codes[] entry. Three legacy shapes appear in the wild:
//   1. bare code string:     "541611"
//   2. object:                { code: "541611", label: "...", confidence: 1 }
//   3. JSON-stringified obj: '{"code":"541611","label":"...",...}'  ← from an
//      old bug where object arrays were inserted into a TEXT[] column; Postgres
//      stringified each element. Display as raw text looks like garbage.
function parseNaicsEntry(c: unknown): { code: string; label?: string } | null {
    if (typeof c === "string") {
        const t = c.trim();
        if (/^\d{4,6}$/.test(t)) return { code: t };
        if (t.startsWith("{")) {
            try {
                const obj = JSON.parse(t) as Record<string, unknown>;
                const code = String(obj.code || "").trim();
                if (/^\d{4,6}$/.test(code)) {
                    return { code, label: obj.label ? String(obj.label) : undefined };
                }
            } catch { /* not JSON, fall through */ }
        }
        return null;
    }
    if (c && typeof c === "object") {
        const obj = c as Record<string, unknown>;
        const code = String(obj.code || "").trim();
        if (/^\d{4,6}$/.test(code)) {
            return { code, label: obj.label ? String(obj.label) : undefined };
        }
    }
    return null;
}

function looksLikeCompanyOrSection(s: string): boolean {
    if (!s) return true;
    if (s.length < 3 || s.length > 80) return true;
    for (const p of NON_PERSON_PATTERNS) if (p.test(s)) return true;
    // All-caps single word is usually an acronym/label, not a name.
    if (/^[A-Z]{2,}$/.test(s)) return true;
    // Has digits — real names don't.
    if (/\d/.test(s)) return true;
    return false;
}

function looksLikePersonName(name: string): boolean {
    if (!name) return false;
    const trimmed = name.trim();
    if (trimmed.length < 4) return false;
    // Require at least one space (first + last) and reasonable word count.
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2 || parts.length > 5) return false;
    // Each part should start with a letter.
    if (!parts.every(p => /^[A-Za-zÀ-ÿ]/.test(p))) return false;
    return !looksLikeCompanyOrSection(trimmed);
}

function normalizeLeadership(raw: unknown): LeaderItem[] {
    if (!raw || !Array.isArray(raw)) return [];
    const out: LeaderItem[] = [];
    const seen = new Set<string>();
    for (const item of raw) {
        if (typeof item === "string" && item.trim()) {
            const t = item.trim();
            if (!looksLikePersonName(t)) continue;
            if (seen.has(t.toLowerCase())) continue;
            seen.add(t.toLowerCase());
            out.push({ name: t });
            continue;
        }
        if (item && typeof item === "object") {
            const obj = item as Record<string, unknown>;
            const name = String(obj.name || obj.fullName || obj.full_name || "").trim();
            if (!name || !looksLikePersonName(name)) continue;
            if (seen.has(name.toLowerCase())) continue;
            seen.add(name.toLowerCase());

            const rawTitle = obj.title || obj.role || obj.position;
            let title = rawTitle ? String(rawTitle).trim() : undefined;
            // Drop obviously-bad titles (nav text, section headers). A good title
            // is usually a job-titles-ish phrase; reject ones with blacklist terms.
            if (title && looksLikeCompanyOrSection(title)) title = undefined;

            const rawBio = obj.bio || obj.summary;
            const bio = rawBio ? String(rawBio).trim() : undefined;

            out.push({ name, title, bio });
        }
    }
    return out;
}

// Service category inferred from the service name — drives the per-card
// icon + accent color. Order matters: first match wins.
const SERVICE_CATEGORIES: Array<{
    test: RegExp;
    icon: LucideIcon;
    accent: string;
    iconColor: string;
    label: string;
}> = [
    { test: /software|develop|code|web|app\b|cloud|saas|api\b|devops|data\s*eng/i,
        icon: Code, accent: "from-indigo-50 to-indigo-100/30 border-indigo-200", iconColor: "text-indigo-600", label: "Software" },
    { test: /cloud|aws|azure|gcp|kubernet|infra/i,
        icon: Cloud, accent: "from-sky-50 to-sky-100/30 border-sky-200", iconColor: "text-sky-600", label: "Cloud" },
    { test: /cyber|security|encrypt|penetrat|soc\b|pii|hipaa|nist/i,
        icon: ShieldCheck, accent: "from-rose-50 to-rose-100/30 border-rose-200", iconColor: "text-rose-600", label: "Cybersecurity" },
    { test: /ai\b|machine\s*learn|llm|gpt|neural|nlp|computer\s*vision/i,
        icon: Cpu, accent: "from-violet-50 to-violet-100/30 border-violet-200", iconColor: "text-violet-600", label: "AI / ML" },
    { test: /constru|build|hvac|electric|plumb|paint|roof|paving|landscap|grading/i,
        icon: Hammer, accent: "from-amber-50 to-amber-100/30 border-amber-200", iconColor: "text-amber-600", label: "Construction" },
    { test: /janitor|clean|facilit|grounds|custod/i,
        icon: Wrench, accent: "from-emerald-50 to-emerald-100/30 border-emerald-200", iconColor: "text-emerald-600", label: "Facilities" },
    { test: /medic|health|nurs|clinic|dental|pharm|biolog|laborator/i,
        icon: Stethoscope, accent: "from-teal-50 to-teal-100/30 border-teal-200", iconColor: "text-teal-600", label: "Healthcare" },
    { test: /transport|logist|truck|hauling|freight|deliver|courier/i,
        icon: Truck, accent: "from-orange-50 to-orange-100/30 border-orange-200", iconColor: "text-orange-600", label: "Logistics" },
    { test: /aviation|aircraft|aero|drone|uav|space/i,
        icon: Plane, accent: "from-blue-50 to-blue-100/30 border-blue-200", iconColor: "text-blue-600", label: "Aerospace" },
    { test: /train|educa|school|curricul|instruct|certif|coach/i,
        icon: GraduationCap, accent: "from-purple-50 to-purple-100/30 border-purple-200", iconColor: "text-purple-600", label: "Training" },
    { test: /consult|advis|profess|strateg|polic|research|analysis|writing|document/i,
        icon: FileText, accent: "from-stone-50 to-stone-100/40 border-stone-200", iconColor: "text-stone-600", label: "Consulting" },
];

function categorizeService(name: string): { icon: LucideIcon; accent: string; iconColor: string; label: string } {
    for (const cat of SERVICE_CATEGORIES) if (cat.test.test(name)) return cat;
    return { icon: Briefcase, accent: "from-stone-50 to-stone-100/40 border-stone-200", iconColor: "text-stone-500", label: "Service" };
}

const presenceColors: Record<string, string> = {
    primary: "bg-red-50 text-red-700 border-red-200",
    heavy: "bg-amber-50 text-amber-700 border-amber-200",
    moderate: "bg-amber-50 text-amber-700 border-amber-200",
    light: "bg-blue-50 text-blue-700 border-blue-200",
    none: "bg-stone-50 text-stone-500 border-stone-200",
    unknown: "bg-stone-50 text-stone-500 border-stone-200",
};

export default function CompetitorDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const [competitor, setCompetitor] = useState<Competitor | null>(null);
    const [loading, setLoading] = useState(true);
    const [relatedOpps, setRelatedOpps] = useState<Array<{ id: string; title: string; agency: string; naics_code: string }>>([]);

    useEffect(() => {
        async function load() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { router.push("/login"); return; }

            // Look up user's profile so we can scope the competitor query to them.
            // Without this filter, `.single()` throws PGRST116 (and the page silently
            // redirects) whenever a competitor's id doesn't belong to the current user
            // or RLS hides the row — which happens on every detail open.
            const { data: profile } = await supabase
                .from("user_profiles")
                .select("id")
                .eq("auth_user_id", user.id)
                .single();
            if (!profile) { router.push("/onboard"); return; }

            const { data } = await supabase
                .from("client_competitors")
                .select("*")
                .eq("id", id)
                .eq("user_profile_id", profile.id)
                .maybeSingle();

            if (!data) { router.push("/competitors"); return; }
            const comp = data as Competitor;
            setCompetitor(comp);

            // Load opportunities with matching NAICS codes (competitor's likely bid targets).
            // Existing rows may hold legacy shapes (objects, stringified JSON) — normalize
            // via parseNaicsEntry before querying.
            const compNaics = (Array.isArray(comp.naics_codes) ? comp.naics_codes : [])
                .map(parseNaicsEntry)
                .filter((e): e is NonNullable<typeof e> => !!e)
                .map(e => e.code);
            if (compNaics.length > 0) {
                const { data: opps } = await supabase
                    .from("opportunities")
                    .select("id, title, agency, naics_code")
                    .in("naics_code", compNaics)
                    .eq("is_archived", false)
                    .in("status", ["ACTIVE", "EXPIRING_SOON", "MARKET_RESEARCH"])
                    .limit(8);
                setRelatedOpps((opps || []) as typeof relatedOpps);
            }
            setLoading(false);
        }
        load();
    }, [id, router]);

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-[400px]">
                <Loader2 className="w-8 h-8 animate-spin text-stone-400" />
            </div>
        );
    }

    if (!competitor) return null;

    const crawl = competitor.crawl_data || {};
    const services = normalizeServices(crawl.services);
    const leadership = normalizeLeadership(crawl.leadership);
    const social = (crawl.social_links && typeof crawl.social_links === "object" && !Array.isArray(crawl.social_links))
        ? (crawl.social_links as Record<string, string>)
        : {};
    const certifications = coerceStringArray(crawl.certifications);
    const locations = coerceStringArray(crawl.locations);
    const pastClients = coerceStringArray(crawl.past_clients);
    const primaryKeywords = coerceStringArray(crawl.primary_keywords);
    const secondaryKeywords = coerceStringArray(crawl.secondary_keywords);
    const naicsEntries = (Array.isArray(competitor.naics_codes) ? competitor.naics_codes : [])
        .map(parseNaicsEntry)
        .filter((e): e is NonNullable<typeof e> => !!e);

    return (
        <div className="max-w-7xl mx-auto pb-12 space-y-6">
            {/* Back link */}
            <Link href="/competitors" className="inline-flex items-center gap-1.5 text-xs text-stone-500 hover:text-black transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" /> Back to competitors
            </Link>

            {/* Header card */}
            <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-start gap-4 min-w-0 flex-1">
                        <div className={clsx(
                            "w-16 h-16 rounded-2xl border-2 font-black text-lg flex items-center justify-center flex-shrink-0",
                            competitor.overlap_score >= 70 ? "text-red-600 bg-red-50 border-red-200" :
                            competitor.overlap_score >= 40 ? "text-amber-600 bg-amber-50 border-amber-200" :
                            "text-blue-600 bg-blue-50 border-blue-200"
                        )}>
                            {competitor.overlap_score}%
                        </div>
                        <div className="min-w-0">
                            <h1 className="text-xl sm:text-2xl font-bold text-black">{competitor.competitor_name}</h1>
                            {competitor.description && (
                                <p className="text-sm text-stone-600 mt-2 leading-relaxed">{competitor.description}</p>
                            )}
                            <div className="flex flex-wrap items-center gap-2 mt-3">
                                {competitor.federal_presence && (
                                    <span className={clsx("text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border",
                                        presenceColors[competitor.federal_presence] || presenceColors.unknown,
                                    )}>
                                        Federal: {competitor.federal_presence}
                                    </span>
                                )}
                                {competitor.uei && (
                                    <span className="text-[10px] font-mono bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full">
                                        UEI: {competitor.uei}
                                    </span>
                                )}
                                {certifications.slice(0, 5).map((c, i) => (
                                    <span key={i} className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full uppercase">
                                        {c}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                        {competitor.website && (
                            <a href={competitor.website.startsWith("http") ? competitor.website : `https://${competitor.website}`}
                               target="_blank" rel="noopener noreferrer"
                               className="text-xs font-bold text-stone-700 bg-white border border-stone-200 px-3 py-1.5 rounded-full inline-flex items-center gap-1 hover:bg-stone-50">
                                <Globe className="w-3.5 h-3.5" /> Website
                            </a>
                        )}
                        {competitor.uei && (
                            <a href={`https://sam.gov/search/?q=${competitor.uei}&index=ei`}
                               target="_blank" rel="noopener noreferrer"
                               className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-full inline-flex items-center gap-1 hover:bg-blue-100">
                                <Shield className="w-3.5 h-3.5" /> SAM.gov
                            </a>
                        )}
                        {social.linkedin && (
                            <a href={social.linkedin} target="_blank" rel="noopener noreferrer"
                               className="text-xs font-bold text-blue-700 bg-white border border-stone-200 px-3 py-1.5 rounded-full inline-flex items-center gap-1 hover:bg-stone-50">
                                <Linkedin className="w-3.5 h-3.5" /> LinkedIn
                            </a>
                        )}
                    </div>
                </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white border border-stone-200 rounded-2xl p-4">
                    <p className="text-[10px] uppercase text-stone-400 tracking-widest mb-1">Overlap</p>
                    <p className="text-2xl font-black text-black">{competitor.overlap_score}%</p>
                    <p className="text-[10px] text-stone-400 mt-1">NAICS + services similarity</p>
                </div>
                <div className="bg-white border border-stone-200 rounded-2xl p-4">
                    <p className="text-[10px] uppercase text-stone-400 tracking-widest mb-1 flex items-center gap-1"><Users className="w-3 h-3" /> Employees</p>
                    <p className="text-2xl font-black text-black">{formatEmployees(competitor.employee_count)}</p>
                </div>
                <div className="bg-white border border-stone-200 rounded-2xl p-4">
                    <p className="text-[10px] uppercase text-stone-400 tracking-widest mb-1 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Revenue</p>
                    <p className="text-2xl font-black text-black">{formatRevenue(competitor.revenue_estimate)}</p>
                </div>
                <div className="bg-white border border-stone-200 rounded-2xl p-4">
                    <p className="text-[10px] uppercase text-stone-400 tracking-widest mb-1 flex items-center gap-1"><Shield className="w-3 h-3" /> Fed Presence</p>
                    <p className="text-2xl font-black text-black capitalize">{competitor.federal_presence || "—"}</p>
                </div>
            </div>

            {/* Unified rich detail (Ollama strengths/weaknesses, POC,
                agency/NAICS breakdowns, active opps where they're the
                incumbent). Renders when we have a UEI. */}
            {competitor.uei && (
                <ContractorDetailView uei={competitor.uei} fallbackName={competitor.competitor_name} />
            )}

            {/* Federal award history — only when we don't have a UEI; the
                detail view above embeds PastAwardsPanel itself when UEI exists. */}
            {!competitor.uei && (
                <PastAwardsPanel name={competitor.competitor_name} uei={competitor.uei} />
            )}

            {/* Subaward / teaming relationships — who they sub for, who they hire. */}
            <SubawardsPanel name={competitor.competitor_name} uei={competitor.uei} />

            {/* Capability keywords (auto-extracted from crawl) */}
            {(primaryKeywords.length > 0 || secondaryKeywords.length > 0) && (
                <div className="bg-white border border-stone-200 rounded-2xl p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <Target className="w-4 h-4 text-stone-400" />
                        <h2 className="font-bold text-sm uppercase tracking-widest text-stone-700">Capability Keywords</h2>
                        <span className="ml-auto text-[10px] uppercase tracking-wide text-stone-400">Auto-extracted from website</span>
                    </div>
                    {primaryKeywords.length > 0 && (
                        <div className="mb-3">
                            <p className="text-[10px] uppercase tracking-widest text-emerald-700 mb-1.5 font-bold">Primary</p>
                            <div className="flex flex-wrap gap-1.5">
                                {primaryKeywords.map((kw, i) => (
                                    <span key={i} className="text-xs bg-emerald-50 text-emerald-900 border border-emerald-200 px-2.5 py-1 rounded-full font-medium">
                                        {kw}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                    {secondaryKeywords.length > 0 && (
                        <div>
                            <p className="text-[10px] uppercase tracking-widest text-stone-500 mb-1.5 font-bold">Secondary</p>
                            <div className="flex flex-wrap gap-1.5">
                                {secondaryKeywords.map((kw, i) => (
                                    <span key={i} className="text-xs bg-stone-50 text-stone-700 border border-stone-200 px-2.5 py-1 rounded-full">
                                        {kw}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Services — proper category cards with inferred icons */}
            {services.length > 0 && (
                <div className="bg-white border border-stone-200 rounded-2xl p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <Briefcase className="w-4 h-4 text-stone-400" />
                        <h2 className="font-bold text-sm uppercase tracking-widest text-stone-700">Services</h2>
                        <span className="ml-auto text-xs text-stone-400">{services.length}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {services.map((s, i) => {
                            const cat = categorizeService(s.name);
                            const Icon = cat.icon;
                            return (
                                <div
                                    key={i}
                                    className={clsx(
                                        "bg-gradient-to-br rounded-xl p-4 border shadow-sm hover:shadow-md transition-shadow",
                                        cat.accent,
                                    )}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className={clsx(
                                            "w-9 h-9 rounded-lg bg-white border border-white flex items-center justify-center flex-shrink-0 shadow-sm",
                                            cat.iconColor,
                                        )}>
                                            <Icon className="w-4 h-4" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2 mb-0.5">
                                                <p className="font-bold text-sm text-stone-900 leading-tight">{s.name}</p>
                                                <span className={clsx(
                                                    "text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-white/60 border border-white",
                                                    cat.iconColor,
                                                )}>{cat.label}</span>
                                            </div>
                                            {s.description && (
                                                <p className="text-xs text-stone-600 leading-relaxed mt-1">{s.description}</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Leadership */}
            {leadership.length > 0 && (
                <div className="bg-white border border-stone-200 rounded-2xl p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <Users className="w-4 h-4 text-stone-400" />
                        <h2 className="font-bold text-sm uppercase tracking-widest text-stone-700">Leadership</h2>
                        <span className="ml-auto text-xs text-stone-400">{leadership.length}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {leadership.map((l, i) => {
                            const isExecutive = /\b(CEO|CFO|CTO|COO|CIO|CMO|Founder|President|Owner|Principal|Partner)\b/i.test(l.title || "");
                            const initials = l.name?.split(" ").map(p => p[0]).slice(0, 2).join("") || "?";
                            return (
                                <div
                                    key={i}
                                    className={clsx(
                                        "rounded-xl p-4 border shadow-sm flex items-start gap-3",
                                        isExecutive
                                            ? "bg-gradient-to-br from-amber-50 to-amber-100/30 border-amber-200"
                                            : "bg-gradient-to-br from-stone-50 to-stone-100/40 border-stone-200",
                                    )}
                                >
                                    <div className={clsx(
                                        "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm shadow-sm",
                                        isExecutive
                                            ? "bg-gradient-to-br from-amber-500 to-amber-700 text-white"
                                            : "bg-white border border-stone-200 text-stone-600",
                                    )}>
                                        {initials}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <p className="font-bold text-sm text-stone-900 leading-tight">{l.name}</p>
                                            {isExecutive && <Crown className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />}
                                        </div>
                                        {l.title && <p className="text-xs text-stone-600 mt-0.5">{l.title}</p>}
                                        {l.bio && <p className="text-xs text-stone-500 mt-1.5 line-clamp-2">{l.bio}</p>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* NAICS codes with labels */}
            {naicsEntries.length > 0 && (
                <div className="bg-white border border-stone-200 rounded-2xl p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <Target className="w-4 h-4 text-stone-400" />
                        <h2 className="font-bold text-sm uppercase tracking-widest text-stone-700">NAICS Codes</h2>
                        <span className="ml-auto text-xs text-stone-400">{naicsEntries.length}</span>
                    </div>
                    <div className="space-y-1.5">
                        {naicsEntries.map((entry, i) => (
                            <div key={i} className="flex items-center gap-3 py-1.5 border-b border-stone-50 last:border-0">
                                <span className="font-mono text-xs bg-stone-100 text-stone-700 px-2 py-0.5 rounded font-bold flex-shrink-0">{entry.code}</span>
                                <span className="text-xs text-stone-600">{lookupNaicsLabel(entry.code) || entry.label || "—"}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Past clients */}
            {pastClients.length > 0 && (
                <div className="bg-white border border-stone-200 rounded-2xl p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <Building className="w-4 h-4 text-stone-400" />
                        <h2 className="font-bold text-sm uppercase tracking-widest text-stone-700">Past Clients</h2>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {pastClients.map((c, i) => (
                            <span key={i} className="text-xs bg-stone-50 text-stone-700 border border-stone-200 px-2.5 py-1 rounded-full">{c}</span>
                        ))}
                    </div>
                </div>
            )}

            {/* Locations */}
            {locations.length > 0 && (
                <div className="bg-white border border-stone-200 rounded-2xl p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <MapPin className="w-4 h-4 text-stone-400" />
                        <h2 className="font-bold text-sm uppercase tracking-widest text-stone-700">Locations</h2>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {locations.map((loc, i) => (
                            <span key={i} className="text-xs bg-stone-50 text-stone-700 border border-stone-200 px-2.5 py-1 rounded-full inline-flex items-center gap-1">
                                <MapPin className="w-3 h-3" /> {loc}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Opportunities they may be bidding on */}
            {relatedOpps.length > 0 && (
                <div className="bg-white border border-stone-200 rounded-2xl p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <Target className="w-4 h-4 text-stone-400" />
                        <h2 className="font-bold text-sm uppercase tracking-widest text-stone-700">Likely Bid Targets</h2>
                        <span className="ml-auto text-xs text-stone-400">Based on overlapping NAICS</span>
                    </div>
                    <div className="space-y-1.5">
                        {relatedOpps.map((o) => (
                            <Link key={o.id} href={`/opportunities/${o.id}`}
                                  className="flex items-center justify-between p-3 rounded-xl hover:bg-stone-50 border border-stone-100">
                                <div className="min-w-0 flex-1">
                                    <p className="font-bold text-sm text-black line-clamp-1">{o.title}</p>
                                    <p className="text-xs text-stone-500 line-clamp-1">{o.agency} · {o.naics_code}</p>
                                </div>
                                <ChevronRight className="w-4 h-4 text-stone-400 flex-shrink-0" />
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {competitor.last_analyzed_at && (
                <p className="text-[10px] text-stone-400 text-center">
                    Last analyzed {new Date(competitor.last_analyzed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    {competitor.website && (
                        <>
                            {" · "}
                            <a
                                href={competitor.website.startsWith("http") ? competitor.website : `https://${competitor.website}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline hover:text-black inline-flex items-center gap-1"
                            >
                                Open source <ExternalLink className="w-3 h-3" />
                            </a>
                        </>
                    )}
                </p>
            )}
        </div>
    );
}
