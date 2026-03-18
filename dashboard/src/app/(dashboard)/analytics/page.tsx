"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/client";
import { BarChart3, Loader2, Target, TrendingUp, CheckCircle2, Clock, DollarSign, Layers, Zap, PieChart } from "lucide-react";
import clsx from "clsx";
import Link from "next/link";
import ServiceCTA from "@/components/ui/ServiceCTA";

const supabase = createSupabaseClient();

interface PipelineStats {
    total: number;
    byStage: Record<string, number>;
    totalValue: number;
    awarded: number;
    lost: number;
    noBid: number;
}

interface ActionStats {
    total: number;
    completed: number;
    pending: number;
    highPriority: number;
    byCategory: Record<string, { total: number; completed: number }>;
}

interface MatchStats {
    totalOpps: number;
    naicsMatched: number;
    easyWins: number;
    urgent: number;
}

const STAGE_COLORS: Record<string, string> = {
    discovered: "bg-stone-200",
    researching: "bg-blue-400",
    preparing: "bg-amber-400",
    submitted: "bg-purple-400",
    awarded: "bg-emerald-400",
    lost: "bg-red-400",
    no_bid: "bg-stone-300",
};

const CATEGORY_COLORS: Record<string, string> = {
    research: "bg-blue-400",
    document: "bg-amber-400",
    outreach: "bg-purple-400",
    compliance: "bg-red-400",
    teaming: "bg-emerald-400",
};

export default function AnalyticsPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [pipeline, setPipeline] = useState<PipelineStats>({ total: 0, byStage: {}, totalValue: 0, awarded: 0, lost: 0, noBid: 0 });
    const [actions, setActions] = useState<ActionStats>({ total: 0, completed: 0, pending: 0, highPriority: 0, byCategory: {} });
    const [matches, setMatches] = useState<MatchStats>({ totalOpps: 0, naicsMatched: 0, easyWins: 0, urgent: 0 });

    useEffect(() => {
        async function load() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { router.push("/login"); return; }

            const { data: profile } = await supabase
                .from("user_profiles")
                .select("id, naics_codes")
                .eq("auth_user_id", user.id)
                .single();

            if (!profile) { router.push("/onboard"); return; }

            const profileId = (profile as Record<string, unknown>).id as string;
            const userNaics = ((profile as Record<string, unknown>).naics_codes || []) as string[];
            const today = new Date().toISOString().split("T")[0];

            // Parallel data fetches
            const [pursuitRes, actionRes, opsRes, naicsRes, easyRes, urgentRes] = await Promise.all([
                supabase.from("user_pursuits")
                    .select("stage, opportunities(award_amount)")
                    .eq("user_profile_id", profileId),
                supabase.from("user_action_items")
                    .select("status, priority, category")
                    .eq("user_profile_id", profileId),
                supabase.from("opportunities").select("*", { count: "exact", head: true }).eq("is_archived", false),
                userNaics.length > 0
                    ? supabase.from("opportunities").select("*", { count: "exact", head: true }).eq("is_archived", false).in("naics_code", userNaics)
                    : Promise.resolve({ count: 0 }),
                supabase.from("opportunities").select("*", { count: "exact", head: true })
                    .eq("is_archived", false).ilike("notice_type", "%Sources Sought%")
                    .not("set_aside_code", "is", null).gte("response_deadline", today),
                supabase.from("opportunities").select("*", { count: "exact", head: true })
                    .eq("is_archived", false)
                    .lte("response_deadline", new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString())
                    .gte("response_deadline", today),
            ]);

            // Pipeline stats
            const pursuits = (pursuitRes.data || []) as any[];
            const byStage: Record<string, number> = {};
            let totalValue = 0;
            let awarded = 0;
            let lost = 0;
            let noBid = 0;
            pursuits.forEach(p => {
                byStage[p.stage] = (byStage[p.stage] || 0) + 1;
                const opp = p.opportunities as Record<string, unknown> | null;
                totalValue += (opp?.award_amount as number) || 0;
                if (p.stage === "awarded") awarded++;
                if (p.stage === "lost") lost++;
                if (p.stage === "no_bid") noBid++;
            });
            setPipeline({ total: pursuits.length, byStage, totalValue, awarded, lost, noBid });

            // Action stats
            const actionItems = (actionRes.data || []) as Array<{ status: string; priority: string; category: string }>;
            const byCategory: Record<string, { total: number; completed: number }> = {};
            let completedCount = 0;
            let highPriCount = 0;
            actionItems.forEach(a => {
                if (!byCategory[a.category]) byCategory[a.category] = { total: 0, completed: 0 };
                byCategory[a.category].total++;
                if (a.status === "completed") {
                    completedCount++;
                    byCategory[a.category].completed++;
                }
                if (a.priority === "high" && a.status !== "completed") highPriCount++;
            });
            setActions({ total: actionItems.length, completed: completedCount, pending: actionItems.length - completedCount, highPriority: highPriCount, byCategory });

            // Match stats
            setMatches({
                totalOpps: opsRes.count || 0,
                naicsMatched: (naicsRes as { count: number | null }).count || 0,
                easyWins: easyRes.count || 0,
                urgent: urgentRes.count || 0,
            });

            setLoading(false);
        }
        load();
    }, [router]);

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-[400px]">
                <Loader2 className="w-10 h-10 animate-spin text-stone-400" />
            </div>
        );
    }

    const winRate = pipeline.awarded + pipeline.lost > 0
        ? Math.round((pipeline.awarded / (pipeline.awarded + pipeline.lost)) * 100)
        : null;
    const actionCompletionRate = actions.total > 0
        ? Math.round((actions.completed / actions.total) * 100)
        : 0;
    const activePipeline = pipeline.total - pipeline.awarded - pipeline.lost - pipeline.noBid;

    return (
        <div className="max-w-5xl mx-auto pb-12 animate-in fade-in duration-500 px-1">
            <header className="mb-6">
                <h2 className="text-2xl sm:text-3xl font-bold font-typewriter tracking-tighter text-black flex items-center">
                    <BarChart3 className="mr-2 sm:mr-3 w-6 h-6 sm:w-8 sm:h-8" /> Analytics
                </h2>
                <p className="text-stone-500 mt-1 font-medium text-sm">
                    Track your federal contracting performance
                </p>
            </header>

            {pipeline.total === 0 && actions.total === 0 ? (
                <div className="space-y-4">
                    <div className="bg-white border border-stone-200 border-dashed rounded-[24px] sm:rounded-[32px] p-8 sm:p-12 text-center shadow-sm">
                        <BarChart3 className="w-12 h-12 text-stone-300 mx-auto mb-4" />
                        <h3 className="font-typewriter font-bold text-lg mb-2">No data yet</h3>
                        <p className="text-stone-500 text-sm mb-6 max-w-md mx-auto">
                            Start pursuing opportunities to see your analytics and performance metrics.
                        </p>
                        <Link href="/opportunities"
                            className="inline-flex items-center bg-black text-white font-typewriter font-bold px-6 py-3 rounded-full hover:bg-stone-800 transition-all text-sm">
                            <Target className="w-4 h-4 mr-2" /> Browse Opportunities
                        </Link>
                    </div>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Top KPIs */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-7 h-7 rounded-full bg-stone-100 flex items-center justify-center">
                                    <Layers className="w-3.5 h-3.5 text-stone-600" />
                                </div>
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest">Active Pipeline</p>
                            </div>
                            <p className="text-2xl font-black font-typewriter">{activePipeline}</p>
                        </div>
                        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center">
                                    <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                                </div>
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest">Pipeline Value</p>
                            </div>
                            <p className="text-2xl font-black font-typewriter text-emerald-600">
                                {pipeline.totalValue > 0 ? `$${(pipeline.totalValue / 1000).toFixed(0)}K` : "TBD"}
                            </p>
                        </div>
                        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center">
                                    <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
                                </div>
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest">Win Rate</p>
                            </div>
                            <p className="text-2xl font-black font-typewriter">
                                {winRate !== null ? `${winRate}%` : "--"}
                            </p>
                        </div>
                        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />
                                </div>
                                <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest">Task Done</p>
                            </div>
                            <p className="text-2xl font-black font-typewriter">{actionCompletionRate}%</p>
                        </div>
                    </div>

                    {/* Pipeline & Opportunity Breakdown */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Pipeline Stage Breakdown */}
                        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5">
                            <h3 className="font-typewriter font-bold text-sm flex items-center mb-4">
                                <Layers className="w-4 h-4 mr-2 text-stone-400" /> Pipeline Stages
                            </h3>
                            {pipeline.total > 0 ? (
                                <div className="space-y-2.5">
                                    {/* Bar visualization */}
                                    <div className="flex h-4 rounded-full overflow-hidden bg-stone-100">
                                        {Object.entries(pipeline.byStage).filter(([, count]) => count > 0).map(([stage, count]) => (
                                            <div key={stage}
                                                className={clsx("transition-all", STAGE_COLORS[stage] || "bg-stone-300")}
                                                style={{ width: `${(count / pipeline.total) * 100}%` }}
                                                title={`${stage}: ${count}`}
                                            />
                                        ))}
                                    </div>
                                    {/* Legend */}
                                    <div className="space-y-1.5 mt-3">
                                        {Object.entries(pipeline.byStage).filter(([, count]) => count > 0).map(([stage, count]) => (
                                            <div key={stage} className="flex items-center justify-between text-xs">
                                                <div className="flex items-center gap-2">
                                                    <div className={clsx("w-2.5 h-2.5 rounded-full", STAGE_COLORS[stage])} />
                                                    <span className="text-stone-600 capitalize">{stage.replace("_", " ")}</span>
                                                </div>
                                                <span className="font-bold text-stone-700">{count}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <p className="text-xs text-stone-400">No pipeline data yet</p>
                            )}
                        </div>

                        {/* Opportunity Landscape */}
                        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5">
                            <h3 className="font-typewriter font-bold text-sm flex items-center mb-4">
                                <Target className="w-4 h-4 mr-2 text-stone-400" /> Opportunity Landscape
                            </h3>
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-stone-500">Total Federal Opportunities</span>
                                    <span className="font-bold text-sm">{matches.totalOpps.toLocaleString()}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-stone-500">Matching Your NAICS</span>
                                    <span className="font-bold text-sm text-blue-600">{matches.naicsMatched}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-stone-500">Easy Wins (Sources Sought + Set-Aside)</span>
                                    <span className="font-bold text-sm text-emerald-600">{matches.easyWins}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-stone-500">Urgent (7-day deadline)</span>
                                    <span className={clsx("font-bold text-sm", matches.urgent > 0 ? "text-red-600" : "text-stone-400")}>{matches.urgent}</span>
                                </div>
                                {matches.naicsMatched > 0 && activePipeline > 0 && (
                                    <div className="mt-3 pt-3 border-t border-stone-100">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-stone-500">Capture Rate</span>
                                            <span className="font-bold text-sm">{Math.round((activePipeline / matches.naicsMatched) * 100)}%</span>
                                        </div>
                                        <p className="text-[10px] text-stone-400 mt-0.5">Of matched opportunities in your pipeline</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Action Item Breakdown */}
                    {actions.total > 0 && (
                        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5">
                            <h3 className="font-typewriter font-bold text-sm flex items-center mb-4">
                                <CheckCircle2 className="w-4 h-4 mr-2 text-stone-400" /> Action Item Progress
                            </h3>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                                <div className="bg-stone-50 rounded-xl p-3 border border-stone-100 text-center">
                                    <p className="text-lg font-black font-typewriter">{actions.total}</p>
                                    <p className="text-[10px] font-typewriter text-stone-400 uppercase">Total</p>
                                </div>
                                <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100 text-center">
                                    <p className="text-lg font-black font-typewriter text-emerald-600">{actions.completed}</p>
                                    <p className="text-[10px] font-typewriter text-emerald-500 uppercase">Done</p>
                                </div>
                                <div className="bg-amber-50 rounded-xl p-3 border border-amber-100 text-center">
                                    <p className="text-lg font-black font-typewriter text-amber-600">{actions.pending}</p>
                                    <p className="text-[10px] font-typewriter text-amber-500 uppercase">Pending</p>
                                </div>
                                <div className="bg-red-50 rounded-xl p-3 border border-red-100 text-center">
                                    <p className="text-lg font-black font-typewriter text-red-600">{actions.highPriority}</p>
                                    <p className="text-[10px] font-typewriter text-red-500 uppercase">Urgent</p>
                                </div>
                            </div>

                            {/* Category breakdown */}
                            <div className="space-y-2">
                                {Object.entries(actions.byCategory).map(([cat, stats]) => {
                                    const pct = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
                                    return (
                                        <div key={cat}>
                                            <div className="flex items-center justify-between text-xs mb-1">
                                                <span className="text-stone-600 capitalize font-medium">{cat}</span>
                                                <span className="text-stone-500">{stats.completed}/{stats.total}</span>
                                            </div>
                                            <div className="w-full bg-stone-100 rounded-full h-1.5">
                                                <div className={clsx("rounded-full h-1.5 transition-all", CATEGORY_COLORS[cat] || "bg-stone-400")}
                                                    style={{ width: `${pct}%` }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Outcomes */}
                    {(pipeline.awarded > 0 || pipeline.lost > 0) && (
                        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5">
                            <h3 className="font-typewriter font-bold text-sm flex items-center mb-4">
                                <PieChart className="w-4 h-4 mr-2 text-stone-400" /> Outcomes
                            </h3>
                            <div className="grid grid-cols-3 gap-3">
                                <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100 text-center">
                                    <p className="text-2xl font-black font-typewriter text-emerald-600">{pipeline.awarded}</p>
                                    <p className="text-[10px] font-typewriter text-emerald-500 uppercase">Awarded</p>
                                </div>
                                <div className="bg-red-50 rounded-xl p-4 border border-red-100 text-center">
                                    <p className="text-2xl font-black font-typewriter text-red-600">{pipeline.lost}</p>
                                    <p className="text-[10px] font-typewriter text-red-500 uppercase">Lost</p>
                                </div>
                                <div className="bg-stone-50 rounded-xl p-4 border border-stone-100 text-center">
                                    <p className="text-2xl font-black font-typewriter text-stone-500">{pipeline.noBid}</p>
                                    <p className="text-[10px] font-typewriter text-stone-400 uppercase">No Bid</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Bottom CTA */}
                    <ServiceCTA
                        title="Want to improve your win rate?"
                        description="Our capture management team can analyze your pipeline performance and help you develop stronger bid strategies."
                        variant="dark"
                    />
                </div>
            )}
        </div>
    );
}
