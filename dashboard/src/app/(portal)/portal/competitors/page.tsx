"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Users, Globe, ExternalLink, Loader2 } from "lucide-react";
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
    last_analyzed_at: string | null;
}

export default function PortalCompetitors() {
    const [competitors, setCompetitors] = useState<Competitor[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: prof } = await supabase
                .from("user_profiles")
                .select("id")
                .eq("auth_user_id", user.id)
                .single();
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

    if (loading) {
        return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 text-stone-400 animate-spin" /></div>;
    }

    const presenceColors: Record<string, string> = {
        strong: "bg-emerald-100 text-emerald-700 border-emerald-200",
        moderate: "bg-amber-100 text-amber-700 border-amber-200",
        limited: "bg-blue-100 text-blue-700 border-blue-200",
        none: "bg-stone-100 text-stone-500 border-stone-200",
        unknown: "bg-stone-100 text-stone-400 border-stone-200",
    };

    return (
        <div className="max-w-4xl space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-black font-typewriter flex items-center gap-2">
                    <Users className="w-6 h-6" /> Competitor Intelligence
                </h1>
                <p className="text-sm text-stone-500 mt-1">
                    Companies competing in your market space. Our team continuously monitors their activity.
                </p>
            </div>

            {competitors.length === 0 && (
                <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center">
                    <p className="text-stone-500 text-sm">
                        Our team is researching your competitive landscape. Competitor profiles will appear here soon.
                    </p>
                </div>
            )}

            <div className="space-y-4">
                {competitors.map((comp) => (
                    <div key={comp.id} className="bg-white border border-stone-200 rounded-2xl p-5">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="font-bold text-sm text-black">{comp.competitor_name}</h3>
                                    {comp.overlap_score > 0 && (
                                        <span className={clsx(
                                            "text-[10px] font-bold px-2 py-0.5 rounded border",
                                            comp.overlap_score >= 70 ? "bg-red-50 text-red-600 border-red-200" :
                                            comp.overlap_score >= 40 ? "bg-amber-50 text-amber-600 border-amber-200" :
                                            "bg-blue-50 text-blue-600 border-blue-200"
                                        )}>
                                            {comp.overlap_score}% overlap
                                        </span>
                                    )}
                                    {comp.federal_presence && (
                                        <span className={clsx("text-[10px] font-bold px-2 py-0.5 rounded border uppercase", presenceColors[comp.federal_presence] || presenceColors.unknown)}>
                                            Fed: {comp.federal_presence}
                                        </span>
                                    )}
                                </div>
                                {comp.description && (
                                    <p className="text-xs text-stone-600 mt-1 leading-relaxed">{comp.description}</p>
                                )}
                                <div className="flex items-center gap-3 mt-2 flex-wrap">
                                    {comp.website && (
                                        <a href={comp.website.startsWith("http") ? comp.website : `https://${comp.website}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                                            <Globe className="w-3 h-3" /> {comp.website.replace(/^https?:\/\//, "")}
                                        </a>
                                    )}
                                    {comp.employee_count && (
                                        <span className="text-xs text-stone-500">~{comp.employee_count} employees</span>
                                    )}
                                    {comp.revenue_estimate && (
                                        <span className="text-xs text-stone-500">{comp.revenue_estimate} revenue</span>
                                    )}
                                </div>
                                {comp.naics_codes && comp.naics_codes.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {comp.naics_codes.map((c, i) => (
                                            <span key={i} className="text-[10px] bg-stone-100 text-stone-500 border border-stone-200 px-1.5 py-0.5 rounded">{c}</span>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {comp.uei && (
                                <a href={`https://sam.gov/search/?q=${comp.uei}&page=1`} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 flex-shrink-0">
                                    <ExternalLink className="w-3.5 h-3.5" /> SAM.gov
                                </a>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
