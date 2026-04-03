"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Layers, Loader2, ExternalLink, Clock, Plus } from "lucide-react";
import clsx from "clsx";

const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Pursuit {
    id: string;
    stage: string;
    priority: string;
    notes: string | null;
    created_at: string;
    opportunity: {
        title: string;
        agency: string;
        notice_id: string;
        set_aside_code: string;
        response_deadline: string;
        naics_code: string;
    };
}

const STAGES = [
    { key: "discovered", label: "Discovered", color: "bg-stone-100 text-stone-600 border-stone-200" },
    { key: "researching", label: "Researching", color: "bg-blue-50 text-blue-700 border-blue-200" },
    { key: "preparing", label: "Preparing Bid", color: "bg-amber-50 text-amber-700 border-amber-200" },
    { key: "submitted", label: "Submitted", color: "bg-violet-50 text-violet-700 border-violet-200" },
    { key: "awarded", label: "Won", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    { key: "lost", label: "Lost", color: "bg-red-50 text-red-600 border-red-200" },
];

export default function PortalPipeline() {
    const [pursuits, setPursuits] = useState<Pursuit[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data: prof } = await supabase.from("user_profiles").select("id").eq("auth_user_id", user.id).single();
            if (!prof) return;

            const { data } = await supabase
                .from("user_pursuits")
                .select(`
                    id, stage, priority, notes, created_at,
                    opportunity:opportunities!inner(title, agency, notice_id, set_aside_code, response_deadline, naics_code)
                `)
                .eq("user_profile_id", prof.id)
                .order("created_at", { ascending: false });

            setPursuits((data || []) as unknown as Pursuit[]);
            setLoading(false);
        })();
    }, []);

    if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>;

    const byStage = STAGES.map(s => ({
        ...s,
        items: pursuits.filter(p => p.stage === s.key),
    })).filter(s => s.items.length > 0);

    return (
        <div className="max-w-5xl space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-black font-typewriter flex items-center gap-2">
                    <Layers className="w-6 h-6" /> Pipeline
                </h1>
                <p className="text-sm text-stone-500 mt-1">
                    {pursuits.length} opportunities in your pipeline
                </p>
            </div>

            {pursuits.length === 0 && (
                <div className="bg-white border border-stone-200 rounded-2xl p-12 text-center">
                    <Layers className="w-12 h-12 text-stone-300 mx-auto mb-4" />
                    <p className="text-stone-500 text-sm mb-2">No opportunities in your pipeline yet.</p>
                    <p className="text-stone-400 text-xs">When our team starts pursuing opportunities for you, they&apos;ll appear here with their current status.</p>
                </div>
            )}

            {/* Kanban-style columns */}
            {byStage.length > 0 && (
                <div className="space-y-6">
                    {byStage.map(stage => (
                        <div key={stage.key}>
                            <div className="flex items-center gap-2 mb-3">
                                <span className={clsx("text-xs font-bold px-3 py-1 rounded-lg border", stage.color)}>
                                    {stage.label}
                                </span>
                                <span className="text-xs text-stone-400">{stage.items.length}</span>
                            </div>
                            <div className="space-y-2">
                                {stage.items.map(p => {
                                    const opp = (Array.isArray(p.opportunity) ? p.opportunity[0] : p.opportunity) as Pursuit["opportunity"];
                                    const daysLeft = opp?.response_deadline ? Math.ceil((new Date(opp.response_deadline).getTime() - Date.now()) / 86400000) : null;
                                    return (
                                        <div key={p.id} className="bg-white border border-stone-200 rounded-xl p-4 hover:border-stone-300 transition-colors">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="font-bold text-sm text-black line-clamp-2">{opp?.title || "Opportunity"}</h3>
                                                    <p className="text-xs text-stone-500 mt-0.5">{opp?.agency || ""}</p>
                                                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                                                        {opp?.naics_code && <span className="text-[10px] font-mono text-stone-400">NAICS: {opp.naics_code}</span>}
                                                        {opp?.set_aside_code && <span className="text-[10px] text-blue-600">{opp.set_aside_code.substring(0, 30)}</span>}
                                                        {daysLeft !== null && (
                                                            <span className={clsx("text-[10px] font-medium inline-flex items-center gap-0.5",
                                                                daysLeft <= 0 ? "text-red-500" : daysLeft <= 7 ? "text-red-600" : "text-stone-400"
                                                            )}>
                                                                <Clock className="w-3 h-3" />
                                                                {daysLeft <= 0 ? "Expired" : `${daysLeft}d left`}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {p.notes && <p className="text-xs text-stone-500 mt-2 italic">{p.notes}</p>}
                                                </div>
                                                {opp?.notice_id && (
                                                    <a href={`https://sam.gov/opp/${opp.notice_id}/view`} target="_blank" rel="noopener noreferrer"
                                                        className="text-blue-600 hover:text-blue-800 flex-shrink-0">
                                                        <ExternalLink className="w-4 h-4" />
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
