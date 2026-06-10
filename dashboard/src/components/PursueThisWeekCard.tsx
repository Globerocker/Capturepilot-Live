"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, ArrowRight, Loader2, Plus, CheckCircle2, Flame } from "lucide-react";
import { createSupabaseClient } from "@/lib/supabase/client";
import clsx from "clsx";

const supabase = createSupabaseClient();

interface PursuitReason {
    label: string;
    points: number;
}

interface Recommendation {
    opportunity_id: string;
    title: string;
    agency: string;
    naics_code: string | null;
    notice_type: string | null;
    set_aside_code: string | null;
    response_deadline: string | null;
    match_score: number;
    match_classification: string;
    pursuit_score: number;
    reasons: PursuitReason[];
}

export default function PursueThisWeekCard() {
    const [loading, setLoading] = useState(true);
    const [recs, setRecs] = useState<Recommendation[]>([]);
    const [adding, setAdding] = useState<string | null>(null);
    const [added, setAdded] = useState<Set<string>>(new Set());
    const [profileId, setProfileId] = useState<string | null>(null);

    useEffect(() => {
        async function load() {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) { setLoading(false); return; }

                const { data: profile } = await supabase
                    .from("user_profiles")
                    .select("id")
                    .eq("auth_user_id", user.id)
                    .single();
                if (profile) setProfileId((profile as { id: string }).id);

                const res = await fetch("/api/recommendations/pursue");
                if (res.ok) {
                    const json = await res.json();
                    setRecs((json.recommendations || []) as Recommendation[]);
                }
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []);

    const addToPipeline = async (oppId: string) => {
        if (!profileId) return;
        setAdding(oppId);
        try {
            const { error } = await supabase
                .from("user_pursuits")
                .insert({
                    user_profile_id: profileId,
                    opportunity_id: oppId,
                    stage: "discovered",
                    priority: "medium",
                });
            if (!error) {
                setAdded(prev => new Set(prev).add(oppId));
            }
        } finally {
            setAdding(null);
        }
    };

    if (loading) {
        return (
            <section className="bg-white rounded-[24px] sm:rounded-[32px] p-5 sm:p-6 border border-stone-200 shadow-sm">
                <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
                </div>
            </section>
        );
    }

    if (recs.length === 0) return null;

    const top3 = recs.slice(0, 3);

    return (
        <section className="bg-gradient-to-br from-amber-50 to-white rounded-[24px] sm:rounded-[32px] p-5 sm:p-6 border border-amber-200 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div>
                    <h3 className="font-bold text-base sm:text-lg flex items-center text-black">
                        <Flame className="w-5 h-5 mr-2 text-amber-500" />
                        Should pursue this week
                    </h3>
                    <p className="text-xs text-stone-500 mt-1">
                        Ranked by cert fit, agency history, NAICS, and deadline timing.
                    </p>
                </div>
                <Link
                    href="/matches"
                    className="text-xs font-bold bg-white border border-stone-200 px-4 py-2 rounded-full hover:bg-stone-50 transition-colors flex items-center self-start sm:self-auto"
                >
                    See all matches <ArrowRight className="w-3 h-3 ml-1" />
                </Link>
            </div>

            <div className="space-y-3">
                {top3.map(rec => {
                    const isAdded = added.has(rec.opportunity_id);
                    const isAdding = adding === rec.opportunity_id;
                    return (
                        <div
                            key={rec.opportunity_id}
                            className="bg-white border border-stone-200 rounded-2xl p-4 hover:border-stone-300 transition-all"
                        >
                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                        <span className={clsx(
                                            "text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border",
                                            rec.match_classification === "HOT"
                                                ? "bg-red-50 text-red-600 border-red-200"
                                                : "bg-amber-50 text-amber-700 border-amber-200",
                                        )}>
                                            {rec.match_classification}
                                        </span>
                                        <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200">
                                            +{rec.pursuit_score} pts
                                        </span>
                                        {rec.notice_type && (
                                            <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border bg-stone-50 text-stone-600 border-stone-200">
                                                {rec.notice_type}
                                            </span>
                                        )}
                                    </div>
                                    <Link
                                        href={`/opportunities/${rec.opportunity_id}`}
                                        className="block group"
                                    >
                                        <p className="font-bold text-sm text-black line-clamp-2 group-hover:underline">
                                            {rec.title}
                                        </p>
                                        <p className="text-xs text-stone-500 mt-0.5 line-clamp-1">
                                            {rec.agency}
                                            {rec.response_deadline && (
                                                <span className="ml-2 text-stone-400">
                                                    Due {new Date(rec.response_deadline).toLocaleDateString()}
                                                </span>
                                            )}
                                        </p>
                                    </Link>
                                    <ul className="mt-2 space-y-0.5">
                                        {rec.reasons.slice(0, 3).map((r, idx) => (
                                            <li key={idx} className="flex items-start gap-1.5 text-[11px] text-stone-600">
                                                <Sparkles className="w-3 h-3 text-amber-500 flex-shrink-0 mt-0.5" />
                                                <span>{r.label}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div className="flex-shrink-0">
                                    {isAdded ? (
                                        <Link
                                            href="/pipeline"
                                            className="inline-flex items-center bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold px-4 py-2 rounded-full text-xs hover:bg-emerald-100 transition-all"
                                        >
                                            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                                            In pipeline
                                        </Link>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => addToPipeline(rec.opportunity_id)}
                                            disabled={isAdding}
                                            className="inline-flex items-center bg-black text-white font-bold px-4 py-2 rounded-full text-xs hover:bg-stone-800 transition-all disabled:opacity-50"
                                        >
                                            {isAdding ? (
                                                <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Adding</>
                                            ) : (
                                                <><Plus className="w-3.5 h-3.5 mr-1.5" /> Add to pipeline</>
                                            )}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
