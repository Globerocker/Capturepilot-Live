"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Users, Globe, ExternalLink, Loader2, ChevronDown, Shield, TrendingUp, Search } from "lucide-react";
import clsx from "clsx";

const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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
    // If it's already a clean label like "$10M" just return it
    if (raw.startsWith("$")) return raw;
    // Try to parse numeric value
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

export default function PortalCompetitors() {
    const [competitors, setCompetitors] = useState<Competitor[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data: prof } = await supabase.from("user_profiles").select("id").eq("auth_user_id", user.id).single();
            if (!prof) return;

            const { data } = await supabase
                .from("client_competitors")
                .select("*")
                .eq("user_profile_id", prof.id)
                .order("overlap_score", { ascending: false });

            setCompetitors((data || []) as Competitor[]);
            setLoading(false);
        })();
    }, []);

    if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>;

    const presenceColors: Record<string, string> = {
        strong: "bg-emerald-100 text-emerald-700 border-emerald-200",
        moderate: "bg-amber-100 text-amber-700 border-amber-200",
        limited: "bg-blue-100 text-blue-700 border-blue-200",
        none: "bg-stone-100 text-stone-500 border-stone-200",
        unknown: "bg-stone-100 text-stone-400 border-stone-200",
    };

    return (
        <div className="max-w-5xl space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-black font-typewriter flex items-center gap-2">
                    <Users className="w-6 h-6" /> Competitive Landscape
                </h1>
                <p className="text-sm text-stone-500 mt-1">
                    {competitors.length} competitors tracked. Our team monitors their activity weekly.
                </p>
            </div>

            {competitors.length === 0 && (
                <div className="bg-white border border-stone-200 rounded-2xl p-12 text-center">
                    <Users className="w-12 h-12 text-stone-300 mx-auto mb-4" />
                    <p className="text-stone-500 text-sm">Competitor profiles will appear here once our team completes the analysis.</p>
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
                                {/* Overlap score */}
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
                                        <h3 className="font-bold text-sm text-black">{comp.competitor_name}</h3>
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
                                    {/* Key metrics */}
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        <div className="bg-white rounded-xl border border-stone-200 p-3 text-center">
                                            <p className="text-lg font-black text-stone-800">{comp.overlap_score}%</p>
                                            <p className="text-[9px] text-stone-400 uppercase font-typewriter">Overlap</p>
                                        </div>
                                        <div className="bg-white rounded-xl border border-stone-200 p-3 text-center">
                                            <p className="text-lg font-black text-stone-800">{formatEmployees(comp.employee_count)}</p>
                                            <p className="text-[9px] text-stone-400 uppercase font-typewriter">Employees</p>
                                        </div>
                                        <div className="bg-white rounded-xl border border-stone-200 p-3 text-center">
                                            <p className="text-lg font-black text-stone-800">{formatRevenue(comp.revenue_estimate)}</p>
                                            <p className="text-[9px] text-stone-400 uppercase font-typewriter">Revenue</p>
                                        </div>
                                        <div className="bg-white rounded-xl border border-stone-200 p-3 text-center">
                                            <p className="text-lg font-black text-stone-800 capitalize">{comp.federal_presence || "?"}</p>
                                            <p className="text-[9px] text-stone-400 uppercase font-typewriter">Fed Presence</p>
                                        </div>
                                    </div>

                                    {/* UEI / Identifiers */}
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
                                            <a href={`https://www.usaspending.gov/search/?filters=${encodeURIComponent(JSON.stringify({ recipient_search_text: [comp.competitor_name] }))}`}
                                                target="_blank" rel="noopener noreferrer" title="Look up on USASpending.gov"
                                                className="text-xs font-bold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1">
                                                <ExternalLink className="w-3 h-3" /> USASpending
                                            </a>
                                        </div>
                                    )}
                                    {!comp.uei && (
                                        <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 flex items-center gap-3">
                                            <Shield className="w-5 h-5 text-stone-400 flex-shrink-0" />
                                            <div>
                                                <p className="text-xs font-medium text-stone-600">No UEI on file</p>
                                                <p className="text-[10px] text-stone-400">May not be registered on SAM.gov or pending verification</p>
                                            </div>
                                            <a href={`https://sam.gov/search/?q=${encodeURIComponent(comp.competitor_name)}&index=ei`}
                                                target="_blank" rel="noopener noreferrer" title="Search SAM.gov"
                                                className="ml-auto text-xs font-bold text-stone-500 hover:text-stone-700 inline-flex items-center gap-1">
                                                <Search className="w-3 h-3" /> Search SAM
                                            </a>
                                        </div>
                                    )}

                                    {/* Description */}
                                    {comp.description && (
                                        <div>
                                            <p className="text-[10px] font-typewriter text-stone-400 uppercase mb-1">About</p>
                                            <p className="text-sm text-stone-600 leading-relaxed">{comp.description}</p>
                                        </div>
                                    )}

                                    {/* Services from crawl */}
                                    {services.length > 0 && (
                                        <div>
                                            <p className="text-[10px] font-typewriter text-stone-400 uppercase mb-1.5">Services</p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {services.slice(0, 8).map((s, i) => (
                                                    <span key={i} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-lg">{s}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Leadership from crawl */}
                                    {leadership.length > 0 && (
                                        <div>
                                            <p className="text-[10px] font-typewriter text-stone-400 uppercase mb-1.5">Leadership</p>
                                            <div className="space-y-1">
                                                {leadership.slice(0, 3).map((l, i) => (
                                                    <div key={i} className="text-xs text-stone-600">
                                                        <span className="font-bold">{l.name}</span> — {l.title}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* NAICS codes */}
                                    {comp.naics_codes && comp.naics_codes.length > 0 && (
                                        <div>
                                            <p className="text-[10px] font-typewriter text-stone-400 uppercase mb-1.5">NAICS Codes</p>
                                            <div className="flex flex-wrap gap-1">
                                                {comp.naics_codes.map((c, i) => (
                                                    <span key={i} className="text-[10px] font-mono bg-stone-100 text-stone-600 border border-stone-200 px-2 py-0.5 rounded">{c}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Links */}
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
