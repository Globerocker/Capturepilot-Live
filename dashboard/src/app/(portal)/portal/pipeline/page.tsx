"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Layers, Loader2, ExternalLink, Clock, FileText } from "lucide-react";
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
        notice_type: string;
        set_aside_code: string;
        response_deadline: string;
        naics_code: string;
        status: string;
        sources_sought_flag: boolean;
    };
}

const STAGES = [
    { key: "discovered", label: "Discovered", color: "bg-stone-50", headerBg: "bg-stone-100", headerText: "text-stone-700", borderColor: "border-stone-200", dotColor: "bg-stone-400" },
    { key: "researching", label: "Researching", color: "bg-blue-50/50", headerBg: "bg-blue-100", headerText: "text-blue-700", borderColor: "border-blue-200", dotColor: "bg-blue-500" },
    { key: "preparing", label: "Preparing Bid", color: "bg-amber-50/50", headerBg: "bg-amber-100", headerText: "text-amber-700", borderColor: "border-amber-200", dotColor: "bg-amber-500" },
    { key: "submitted", label: "Submitted", color: "bg-violet-50/50", headerBg: "bg-violet-100", headerText: "text-violet-700", borderColor: "border-violet-200", dotColor: "bg-violet-500" },
    { key: "awarded", label: "Won", color: "bg-emerald-50/50", headerBg: "bg-emerald-100", headerText: "text-emerald-700", borderColor: "border-emerald-200", dotColor: "bg-emerald-500" },
    { key: "lost", label: "Lost", color: "bg-red-50/50", headerBg: "bg-red-100", headerText: "text-red-600", borderColor: "border-red-200", dotColor: "bg-red-400" },
];

const NOTICE_TYPE_LABELS: Record<string, { label: string; color: string }> = {
    "Sources Sought": { label: "Sources Sought", color: "bg-purple-100 text-purple-700 border-purple-200" },
    "Presolicitation": { label: "Pre-Solicitation", color: "bg-sky-100 text-sky-700 border-sky-200" },
    "Solicitation": { label: "Solicitation", color: "bg-orange-100 text-orange-700 border-orange-200" },
    "Combined Synopsis/Solicitation": { label: "Solicitation", color: "bg-orange-100 text-orange-700 border-orange-200" },
    "Award Notice": { label: "Award", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
};

type FilterType = "all" | "sources_sought" | "presolicitation" | "solicitation";

export default function PortalPipeline() {
    const [pursuits, setPursuits] = useState<Pursuit[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterType, setFilterType] = useState<FilterType>("all");

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
                    opportunity:opportunities!inner(title, agency, notice_id, notice_type, set_aside_code, response_deadline, naics_code, status, sources_sought_flag)
                `)
                .eq("user_profile_id", prof.id)
                .order("created_at", { ascending: false });

            setPursuits((data || []) as unknown as Pursuit[]);
            setLoading(false);
        })();
    }, []);

    if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>;

    // Filter out expired opportunities
    const now = Date.now();
    const activePursuits = pursuits.filter(p => {
        const opp = (Array.isArray(p.opportunity) ? p.opportunity[0] : p.opportunity) as Pursuit["opportunity"];
        if (!opp) return false;
        const status = opp.status || "";
        if (status === "EXPIRED" || status === "ARCHIVED") return false;
        const deadline = opp.response_deadline ? new Date(opp.response_deadline).getTime() : 0;
        if (deadline > 0 && deadline < now) return false;
        return true;
    });

    // Apply solicitation type filter
    const filtered = activePursuits.filter(p => {
        if (filterType === "all") return true;
        const opp = (Array.isArray(p.opportunity) ? p.opportunity[0] : p.opportunity) as Pursuit["opportunity"];
        const nt = (opp?.notice_type || "").toLowerCase();
        if (filterType === "sources_sought") return nt.includes("sources sought") || opp?.sources_sought_flag;
        if (filterType === "presolicitation") return nt.includes("presolicitation");
        if (filterType === "solicitation") return nt.includes("solicitation") && !nt.includes("presolicitation") && !nt.includes("sources sought");
        return true;
    });

    const byStage = STAGES.map(s => ({
        ...s,
        items: filtered.filter(p => p.stage === s.key),
    })).filter(s => s.items.length > 0);

    const totalActive = activePursuits.length;
    const expiredCount = pursuits.length - activePursuits.length;

    return (
        <div className="space-y-6">
            <div className="max-w-5xl">
                <h1 className="text-2xl font-bold text-black font-typewriter flex items-center gap-2">
                    <Layers className="w-6 h-6" /> Pipeline
                </h1>
                <p className="text-sm text-stone-500 mt-1">
                    {totalActive} active opportunities in your pipeline
                    {expiredCount > 0 && <span className="text-stone-400"> ({expiredCount} expired hidden)</span>}
                </p>

                {/* Solicitation type filters */}
                <div className="flex gap-2 mt-4 flex-wrap">
                    {([
                        { key: "all", label: "All" },
                        { key: "sources_sought", label: "Sources Sought" },
                        { key: "presolicitation", label: "Pre-Solicitation" },
                        { key: "solicitation", label: "Solicitation" },
                    ] as const).map(f => (
                        <button key={f.key} type="button" onClick={() => setFilterType(f.key)}
                            className={clsx("text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors",
                                filterType === f.key ? "bg-black text-white border-black" : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50"
                            )}>
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {filtered.length === 0 && (
                <div className="bg-white border border-stone-200 rounded-2xl p-12 text-center max-w-5xl">
                    <Layers className="w-12 h-12 text-stone-300 mx-auto mb-4" />
                    <p className="text-stone-500 text-sm mb-2">
                        {totalActive === 0 ? "No opportunities in your pipeline yet." : "No opportunities match this filter."}
                    </p>
                    <p className="text-stone-400 text-xs">When our team starts pursuing opportunities for you, they&apos;ll appear here with their current status.</p>
                </div>
            )}

            {/* Horizontal Kanban board */}
            {byStage.length > 0 && (
                <div className="overflow-x-auto pb-4 -mx-4 px-4">
                    <div className={clsx("flex gap-4", byStage.length >= 3 && "min-w-[900px]", byStage.length >= 4 && "min-w-[1200px]", byStage.length >= 5 && "min-w-[1500px]")}>
                        {byStage.map(stage => (
                            <div key={stage.key} className={clsx("flex-1 min-w-[280px] max-w-[340px] rounded-2xl border", stage.borderColor, stage.color)}>
                                {/* Column header */}
                                <div className={clsx("px-4 py-3 rounded-t-2xl flex items-center justify-between", stage.headerBg)}>
                                    <div className="flex items-center gap-2">
                                        <div className={clsx("w-2.5 h-2.5 rounded-full", stage.dotColor)} />
                                        <span className={clsx("text-sm font-bold", stage.headerText)}>{stage.label}</span>
                                    </div>
                                    <span className={clsx("text-xs font-black w-6 h-6 rounded-full flex items-center justify-center", stage.headerBg, stage.headerText)}>
                                        {stage.items.length}
                                    </span>
                                </div>

                                {/* Cards */}
                                <div className="p-2 space-y-2">
                                    {stage.items.map(p => {
                                        const opp = (Array.isArray(p.opportunity) ? p.opportunity[0] : p.opportunity) as Pursuit["opportunity"];
                                        const daysLeft = opp?.response_deadline ? Math.ceil((new Date(opp.response_deadline).getTime() - Date.now()) / 86400000) : null;
                                        const noticeInfo = NOTICE_TYPE_LABELS[opp?.notice_type || ""];

                                        return (
                                            <div key={p.id} className="bg-white rounded-xl p-3 border border-stone-100 shadow-sm hover:shadow-md transition-shadow">
                                                <h3 className="font-bold text-xs text-black line-clamp-2 leading-snug">{opp?.title || "Opportunity"}</h3>
                                                <p className="text-[10px] text-stone-500 mt-0.5 truncate">{opp?.agency || ""}</p>

                                                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                                    {noticeInfo && (
                                                        <span className={clsx("text-[9px] font-bold px-1.5 py-0.5 rounded border", noticeInfo.color)}>
                                                            {noticeInfo.label}
                                                        </span>
                                                    )}
                                                    {opp?.naics_code && (
                                                        <span className="text-[9px] font-mono text-stone-400 bg-stone-50 px-1.5 py-0.5 rounded">
                                                            {opp.naics_code}
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-stone-50">
                                                    {daysLeft !== null && (
                                                        <span className={clsx("text-[10px] font-bold inline-flex items-center gap-0.5",
                                                            daysLeft <= 7 ? "text-red-600" : daysLeft <= 30 ? "text-amber-600" : "text-emerald-600"
                                                        )}>
                                                            <Clock className="w-3 h-3" />
                                                            {daysLeft}d left
                                                        </span>
                                                    )}
                                                    {opp?.notice_id && (
                                                        <a href={`https://sam.gov/opp/${opp.notice_id}/view`} target="_blank" rel="noopener noreferrer"
                                                            title="View on SAM.gov" className="text-blue-500 hover:text-blue-700">
                                                            <ExternalLink className="w-3.5 h-3.5" />
                                                        </a>
                                                    )}
                                                </div>

                                                {p.notes && (
                                                    <p className="text-[10px] text-stone-400 mt-1.5 italic line-clamp-2">{p.notes}</p>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
