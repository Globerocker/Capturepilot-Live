"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseClient } from "@/lib/supabase/client";
import {
    ArrowLeft, Shield, Globe, Users, TrendingUp, ExternalLink,
    Loader2, MapPin, Target, Briefcase, Building2, LinkIcon,
} from "lucide-react";
import clsx from "clsx";

const supabase = createSupabaseClient();

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

interface OverlapOpp {
    id: string;
    title: string;
    agency: string | null;
    naics_code: string | null;
    notice_type: string | null;
    response_deadline: string | null;
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

export default function CompetitorDetailPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const competitorId = params?.id;

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [comp, setComp] = useState<Competitor | null>(null);
    const [bidTargets, setBidTargets] = useState<OverlapOpp[]>([]);

    const load = useCallback(async () => {
        if (!competitorId) return;
        setLoading(true);
        setError(null);

        // Auth gate
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            router.push("/login");
            return;
        }

        // Fetch the competitor. RLS will scope this to rows this user owns.
        const { data, error: fetchErr } = await supabase
            .from("client_competitors")
            .select("*")
            .eq("id", competitorId)
            .maybeSingle();

        if (fetchErr) {
            setError(`Failed to load competitor: ${fetchErr.message}`);
            setLoading(false);
            return;
        }
        if (!data) {
            setError("Competitor not found or you don't have access.");
            setLoading(false);
            return;
        }

        const typedComp = data as Competitor;
        setComp(typedComp);

        // Find likely bid targets — open opportunities on the same NAICS codes
        if (typedComp.naics_codes && typedComp.naics_codes.length > 0) {
            const { data: opps } = await supabase
                .from("opportunities")
                .select("id, title, agency, naics_code, notice_type, response_deadline")
                .in("naics_code", typedComp.naics_codes)
                .eq("is_archived", false)
                .order("response_deadline", { ascending: true, nullsFirst: false })
                .limit(12);
            setBidTargets((opps || []) as OverlapOpp[]);
        }

        setLoading(false);
    }, [competitorId, router]);

    useEffect(() => { load(); }, [load]);

    if (loading) {
        return (
            <div className="max-w-5xl mx-auto flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-8 h-8 animate-spin text-stone-400" />
            </div>
        );
    }

    if (error || !comp) {
        return (
            <div className="max-w-5xl mx-auto py-10 px-1">
                <Link href="/competitors" className="inline-flex items-center text-sm text-stone-500 hover:text-black mb-4">
                    <ArrowLeft className="w-4 h-4 mr-1" /> Back to Competitors
                </Link>
                <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
                    <p className="text-sm font-bold text-red-700 mb-1">Unable to load competitor</p>
                    <p className="text-xs text-red-600">{error || "Unknown error"}</p>
                </div>
            </div>
        );
    }

    const crawl = comp.crawl_data || {};
    const services = (crawl.services as Array<string | { name: string; description?: string }>) || [];
    const leadership = (crawl.leadership as Array<{ name: string; title: string }>) || [];
    const social = (crawl.social_links as Record<string, string>) || {};
    const pastClients = (crawl.past_clients as string[]) || [];
    const locations = (crawl.locations as string[]) || [];

    const presenceColors: Record<string, string> = {
        strong: "bg-emerald-100 text-emerald-700 border-emerald-200",
        moderate: "bg-amber-100 text-amber-700 border-amber-200",
        limited: "bg-blue-100 text-blue-700 border-blue-200",
        none: "bg-stone-100 text-stone-500 border-stone-200",
        unknown: "bg-stone-100 text-stone-400 border-stone-200",
    };

    return (
        <div className="max-w-5xl mx-auto pb-12 animate-in fade-in duration-500 px-1 space-y-6">
            <Link href="/competitors" className="inline-flex items-center text-sm text-stone-500 hover:text-black">
                <ArrowLeft className="w-4 h-4 mr-1" /> Back to Competitors
            </Link>

            {/* Header */}
            <div className="bg-white border border-stone-200 rounded-2xl p-6">
                <div className="flex items-start gap-4">
                    <div className={clsx(
                        "w-14 h-14 rounded-xl border-2 font-black text-base flex items-center justify-center flex-shrink-0",
                        comp.overlap_score >= 70 ? "text-red-600 bg-red-50 border-red-200" :
                            comp.overlap_score >= 40 ? "text-amber-600 bg-amber-50 border-amber-200" :
                                "text-blue-600 bg-blue-50 border-blue-200"
                    )}>
                        {comp.overlap_score}%
                    </div>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-2xl font-bold tracking-tight text-black">{comp.competitor_name}</h1>
                        {comp.description && (
                            <p className="text-sm text-stone-500 mt-1 leading-relaxed">{comp.description}</p>
                        )}
                        <div className="flex items-center gap-2 flex-wrap mt-3">
                            {comp.federal_presence && (
                                <span className={clsx("text-[10px] font-bold px-2 py-0.5 rounded border uppercase",
                                    presenceColors[comp.federal_presence] || presenceColors.unknown)}>
                                    Fed: {comp.federal_presence}
                                </span>
                            )}
                            {comp.uei && (
                                <span className="text-[10px] font-mono bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded">
                                    UEI: {comp.uei}
                                </span>
                            )}
                            {comp.cage_code && (
                                <span className="text-[10px] font-mono bg-stone-100 text-stone-600 border border-stone-200 px-2 py-0.5 rounded">
                                    CAGE: {comp.cage_code}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white rounded-xl border border-stone-200 p-4 text-center">
                    <p className="text-xl font-black text-stone-800">{comp.overlap_score}%</p>
                    <p className="text-[10px] text-stone-400 uppercase mt-1">NAICS Overlap</p>
                </div>
                <div className="bg-white rounded-xl border border-stone-200 p-4 text-center">
                    <p className="text-xl font-black text-stone-800">{formatEmployees(comp.employee_count)}</p>
                    <p className="text-[10px] text-stone-400 uppercase mt-1">Employees</p>
                </div>
                <div className="bg-white rounded-xl border border-stone-200 p-4 text-center">
                    <p className="text-xl font-black text-stone-800">{formatRevenue(comp.revenue_estimate)}</p>
                    <p className="text-[10px] text-stone-400 uppercase mt-1">Revenue</p>
                </div>
                <div className="bg-white rounded-xl border border-stone-200 p-4 text-center">
                    <p className="text-xl font-black text-stone-800 capitalize">{comp.federal_presence || "Unknown"}</p>
                    <p className="text-[10px] text-stone-400 uppercase mt-1">Fed Presence</p>
                </div>
            </div>

            {/* Services */}
            {services.length > 0 && (
                <div className="bg-white border border-stone-200 rounded-2xl p-5">
                    <h3 className="font-bold text-sm flex items-center gap-2 mb-3">
                        <Briefcase className="w-4 h-4 text-stone-400" /> Services
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {services.slice(0, 12).map((s, i) => {
                            if (typeof s === "string") {
                                return (
                                    <div key={i} className="bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-xs text-stone-700">
                                        {s}
                                    </div>
                                );
                            }
                            return (
                                <div key={i} className="bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">
                                    <p className="text-xs font-bold text-black">{s.name}</p>
                                    {s.description && <p className="text-[11px] text-stone-500 mt-0.5">{s.description}</p>}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Leadership */}
            {leadership.length > 0 && (
                <div className="bg-white border border-stone-200 rounded-2xl p-5">
                    <h3 className="font-bold text-sm flex items-center gap-2 mb-3">
                        <Users className="w-4 h-4 text-stone-400" /> Leadership
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {leadership.slice(0, 6).map((l, i) => (
                            <div key={i} className="flex items-center gap-3 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">
                                <div className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center text-xs font-bold text-stone-600 flex-shrink-0">
                                    {l.name.split(" ").map(p => p[0]).join("").slice(0, 2)}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs font-bold truncate">{l.name}</p>
                                    <p className="text-[11px] text-stone-500 truncate">{l.title}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* NAICS codes */}
            {comp.naics_codes && comp.naics_codes.length > 0 && (
                <div className="bg-white border border-stone-200 rounded-2xl p-5">
                    <h3 className="font-bold text-sm flex items-center gap-2 mb-3">
                        <Building2 className="w-4 h-4 text-stone-400" /> NAICS Codes
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                        {comp.naics_codes.map((n, i) => (
                            <span key={i} className="text-xs font-mono bg-stone-100 text-stone-700 border border-stone-200 px-2 py-1 rounded">
                                {n}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Past clients / locations */}
            {(pastClients.length > 0 || locations.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {pastClients.length > 0 && (
                        <div className="bg-white border border-stone-200 rounded-2xl p-5">
                            <h3 className="font-bold text-sm flex items-center gap-2 mb-3">
                                <Target className="w-4 h-4 text-stone-400" /> Past Clients
                            </h3>
                            <ul className="space-y-1 text-xs text-stone-600">
                                {pastClients.slice(0, 8).map((c, i) => <li key={i}>• {c}</li>)}
                            </ul>
                        </div>
                    )}
                    {locations.length > 0 && (
                        <div className="bg-white border border-stone-200 rounded-2xl p-5">
                            <h3 className="font-bold text-sm flex items-center gap-2 mb-3">
                                <MapPin className="w-4 h-4 text-stone-400" /> Locations
                            </h3>
                            <ul className="space-y-1 text-xs text-stone-600">
                                {locations.slice(0, 8).map((l, i) => <li key={i}>• {l}</li>)}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            {/* Likely Bid Targets */}
            {bidTargets.length > 0 && (
                <div className="bg-white border border-stone-200 rounded-2xl p-5">
                    <h3 className="font-bold text-sm flex items-center gap-2 mb-3">
                        <TrendingUp className="w-4 h-4 text-stone-400" /> Likely Bid Targets
                        <span className="text-[10px] text-stone-400 uppercase ml-auto">
                            Open opps on overlapping NAICS
                        </span>
                    </h3>
                    <div className="space-y-1.5">
                        {bidTargets.map(opp => (
                            <Link
                                key={opp.id}
                                href={`/opportunities/${opp.id}`}
                                className="block bg-stone-50 border border-stone-200 hover:border-stone-300 rounded-lg px-3 py-2 transition-colors"
                            >
                                <div className="flex items-center gap-2 flex-wrap">
                                    {opp.naics_code && (
                                        <span className="text-[10px] font-mono bg-white text-stone-500 border border-stone-200 px-1.5 py-0.5 rounded">
                                            {opp.naics_code}
                                        </span>
                                    )}
                                    {opp.notice_type && (
                                        <span className="text-[10px] font-bold text-stone-500 uppercase">{opp.notice_type}</span>
                                    )}
                                    {opp.response_deadline && (
                                        <span className="text-[10px] text-stone-500 ml-auto">
                                            Due {new Date(opp.response_deadline).toLocaleDateString()}
                                        </span>
                                    )}
                                </div>
                                <p className="text-sm font-bold text-black line-clamp-1 mt-0.5">{opp.title}</p>
                                <p className="text-[11px] text-stone-500 line-clamp-1">{opp.agency}</p>
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {/* External links */}
            <div className="flex flex-wrap gap-2 pt-2">
                {comp.website && (
                    <a
                        href={comp.website.startsWith("http") ? comp.website : `https://${comp.website}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-xs font-bold bg-white border border-stone-200 text-stone-700 px-3 py-2 rounded-lg hover:bg-stone-50 inline-flex items-center gap-1.5"
                    >
                        <Globe className="w-3 h-3" /> Website <ExternalLink className="w-3 h-3" />
                    </a>
                )}
                {comp.uei && (
                    <a
                        href={`https://sam.gov/entity/${comp.uei}/coreData`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-xs font-bold bg-white border border-blue-200 text-blue-700 px-3 py-2 rounded-lg hover:bg-blue-50 inline-flex items-center gap-1.5"
                    >
                        <Shield className="w-3 h-3" /> SAM.gov <ExternalLink className="w-3 h-3" />
                    </a>
                )}
                {social.linkedin && (
                    <a
                        href={social.linkedin}
                        target="_blank" rel="noopener noreferrer"
                        className="text-xs font-bold bg-white border border-stone-200 text-blue-700 px-3 py-2 rounded-lg hover:bg-blue-50 inline-flex items-center gap-1.5"
                    >
                        <LinkIcon className="w-3 h-3" /> LinkedIn <ExternalLink className="w-3 h-3" />
                    </a>
                )}
            </div>

            {comp.last_analyzed_at && (
                <p className="text-[10px] text-stone-400">
                    Last analyzed: {new Date(comp.last_analyzed_at).toLocaleString()}
                </p>
            )}
        </div>
    );
}
