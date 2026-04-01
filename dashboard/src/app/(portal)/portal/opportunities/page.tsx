"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Briefcase, ExternalLink, Loader2, Clock, MapPin } from "lucide-react";
import clsx from "clsx";

const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Match {
    id: string;
    opportunity_id: string;
    score: number;
    classification: string;
    opportunity: {
        notice_id: string;
        title: string;
        agency: string;
        notice_type: string;
        naics_code: string;
        set_aside_code: string;
        response_deadline: string;
        place_of_performance_state: string;
        award_amount: number;
    };
}

export default function PortalOpportunities() {
    const [matches, setMatches] = useState<Match[]>([]);
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
                .from("user_matches")
                .select(`
                    id, opportunity_id, score, classification,
                    opportunity:opportunities!inner(
                        notice_id, title, agency, notice_type, naics_code,
                        set_aside_code, response_deadline, place_of_performance_state, award_amount
                    )
                `)
                .eq("user_profile_id", prof.id)
                .order("score", { ascending: false })
                .limit(50);

            setMatches((data || []) as unknown as Match[]);
            setLoading(false);
        })();
    }, []);

    if (loading) {
        return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 text-stone-400 animate-spin" /></div>;
    }

    const fmtCurrency = (n: number) => {
        if (!n) return "";
        if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
        if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
        return `$${n.toLocaleString()}`;
    };

    return (
        <div className="max-w-4xl space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-black font-typewriter flex items-center gap-2">
                    <Briefcase className="w-6 h-6" /> Opportunities
                </h1>
                <p className="text-sm text-stone-500 mt-1">
                    Federal opportunities matched to your company profile. Our team is actively pursuing the top matches.
                </p>
            </div>

            {matches.length === 0 && (
                <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center">
                    <p className="text-stone-500 text-sm">
                        No opportunities matched yet. Our team is working on finding the best matches for you.
                    </p>
                </div>
            )}

            <div className="space-y-3">
                {matches.map((m) => {
                    const opp = (Array.isArray(m.opportunity) ? m.opportunity[0] : m.opportunity) as Match["opportunity"];
                    if (!opp) return null;
                    const samUrl = `https://sam.gov/opp/${opp.notice_id}/view`;
                    const isPastDeadline = opp.response_deadline && new Date(opp.response_deadline) < new Date();

                    return (
                        <div key={m.id} className="bg-white border border-stone-200 rounded-2xl p-5">
                            <div className="flex items-start gap-3">
                                <div className={clsx(
                                    "w-11 h-11 rounded-xl border-2 font-black text-sm flex items-center justify-center flex-shrink-0",
                                    m.score >= 0.70 ? "text-emerald-600 bg-emerald-50 border-emerald-200" :
                                    m.score >= 0.50 ? "text-amber-600 bg-amber-50 border-amber-200" :
                                    "text-blue-600 bg-blue-50 border-blue-200"
                                )}>
                                    {Math.round(m.score * 100)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap mb-1">
                                        <span className={clsx(
                                            "text-[9px] font-bold px-2 py-0.5 rounded uppercase border",
                                            m.classification === "HOT" ? "bg-red-50 text-red-600 border-red-200" :
                                            m.classification === "WARM" ? "bg-amber-50 text-amber-600 border-amber-200" :
                                            "bg-blue-50 text-blue-600 border-blue-200"
                                        )}>{m.classification}</span>
                                        {opp.set_aside_code && (
                                            <span className="text-[9px] font-bold bg-blue-100 text-blue-600 border border-blue-200 px-2 py-0.5 rounded uppercase">{opp.set_aside_code}</span>
                                        )}
                                        {opp.award_amount > 0 && (
                                            <span className="text-[9px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-0.5 rounded">{fmtCurrency(opp.award_amount)}</span>
                                        )}
                                    </div>
                                    <h3 className="font-bold text-sm text-black">{opp.title}</h3>
                                    <p className="text-xs text-stone-500 mt-0.5">{opp.agency}</p>
                                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                                        {opp.notice_type && (
                                            <span className="text-xs text-stone-500">{opp.notice_type}</span>
                                        )}
                                        {opp.naics_code && (
                                            <span className="text-xs text-stone-400">NAICS: {opp.naics_code}</span>
                                        )}
                                        {opp.place_of_performance_state && (
                                            <span className="text-xs text-stone-400 inline-flex items-center gap-0.5"><MapPin className="w-3 h-3" />{opp.place_of_performance_state}</span>
                                        )}
                                        {opp.response_deadline && (
                                            <span className={clsx("text-xs inline-flex items-center gap-0.5", isPastDeadline ? "text-red-500" : "text-stone-400")}>
                                                <Clock className="w-3 h-3" />{new Date(opp.response_deadline).toLocaleDateString()}
                                                {isPastDeadline && " (expired)"}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <a href={samUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 flex-shrink-0">
                                    <ExternalLink className="w-3.5 h-3.5" /> SAM.gov
                                </a>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
