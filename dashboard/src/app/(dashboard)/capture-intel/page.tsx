"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/client";
import { Crosshair, Loader2, ShieldAlert, Zap, Target, AlertTriangle, TrendingUp, Eye, Clock, DollarSign } from "lucide-react";
import clsx from "clsx";
import Link from "next/link";
import ServiceCTA from "@/components/ui/ServiceCTA";

const supabase = createSupabaseClient();

interface PursuitWithOpp {
    id: string;
    stage: string;
    priority: string;
    opportunities: {
        id: string;
        title: string;
        agency: string;
        response_deadline: string;
        notice_type: string;
        estimated_value: number | null;
        strategic_scoring: Record<string, string> | null;
        ai_win_strategy: Record<string, unknown> | null;
        incumbent_contractor_name: string | null;
        set_aside_code: string | null;
    };
}

export default function CaptureIntelPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [pursuits, setPursuits] = useState<PursuitWithOpp[]>([]);

    useEffect(() => {
        async function load() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { router.push("/login"); return; }

            const { data: profile } = await supabase
                .from("user_profiles")
                .select("id")
                .eq("auth_user_id", user.id)
                .single();

            if (!profile) { router.push("/onboard"); return; }

            const { data } = await supabase
                .from("user_pursuits")
                .select("id, stage, priority, opportunities(id, title, agency, response_deadline, notice_type, estimated_value, strategic_scoring, ai_win_strategy, incumbent_contractor_name, set_aside_code)")
                .eq("user_profile_id", profile.id)
                .not("stage", "in", "(no_bid,lost)")
                .order("created_at", { ascending: false });

            setPursuits((data || []) as unknown as PursuitWithOpp[]);
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

    // Aggregate intel
    const activePursuits = pursuits.filter(p => !["awarded", "lost", "no_bid"].includes(p.stage));
    const totalValue = activePursuits.reduce((sum, p) => sum + ((p.opportunities as PursuitWithOpp["opportunities"])?.estimated_value || 0), 0);
    const withIncumbent = activePursuits.filter(p => (p.opportunities as PursuitWithOpp["opportunities"])?.incumbent_contractor_name);
    const highWin = activePursuits.filter(p => {
        const strat = (p.opportunities as PursuitWithOpp["opportunities"])?.strategic_scoring;
        return strat && (strat as Record<string, string>).win_prob_tier === "HIGH";
    });
    const lowWin = activePursuits.filter(p => {
        const strat = (p.opportunities as PursuitWithOpp["opportunities"])?.strategic_scoring;
        return strat && (strat as Record<string, string>).win_prob_tier === "LOW";
    });
    const withSetAside = activePursuits.filter(p => (p.opportunities as PursuitWithOpp["opportunities"])?.set_aside_code);
    const urgentDeadlines = activePursuits.filter(p => {
        const dl = (p.opportunities as PursuitWithOpp["opportunities"])?.response_deadline;
        if (!dl) return false;
        const daysLeft = Math.ceil((new Date(dl).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return daysLeft >= 0 && daysLeft <= 14;
    }).sort((a, b) => {
        const aDeadline = new Date((a.opportunities as PursuitWithOpp["opportunities"])?.response_deadline || 0).getTime();
        const bDeadline = new Date((b.opportunities as PursuitWithOpp["opportunities"])?.response_deadline || 0).getTime();
        return aDeadline - bDeadline;
    });

    return (
        <div className="max-w-5xl mx-auto pb-12 animate-in fade-in duration-500 px-1">
            <header className="mb-6">
                <h2 className="text-2xl sm:text-3xl font-bold font-typewriter tracking-tighter text-black flex items-center">
                    <Crosshair className="mr-2 sm:mr-3 w-6 h-6 sm:w-8 sm:h-8" /> Capture Intelligence
                </h2>
                <p className="text-stone-500 mt-1 font-medium text-sm">
                    Strategic insights across your active pursuits
                </p>
            </header>

            {activePursuits.length === 0 ? (
                <div className="space-y-4">
                    <div className="bg-white border border-stone-200 border-dashed rounded-[24px] sm:rounded-[32px] p-8 sm:p-12 text-center shadow-sm">
                        <Crosshair className="w-12 h-12 text-stone-300 mx-auto mb-4" />
                        <h3 className="font-typewriter font-bold text-lg mb-2">No active pursuits yet</h3>
                        <p className="text-stone-500 text-sm mb-6 max-w-md mx-auto">
                            Start pursuing opportunities to see capture intelligence and strategic insights here.
                        </p>
                        <Link href="/opportunities"
                            className="inline-flex items-center bg-black text-white font-typewriter font-bold px-6 py-3 rounded-full hover:bg-stone-800 transition-all text-sm">
                            <Target className="w-4 h-4 mr-2" /> Browse Opportunities
                        </Link>
                    </div>
                    <ServiceCTA
                        title="Build your capture strategy from day one"
                        description="Book a free call with our GovCon experts. We'll help you identify the right opportunities and build a winning approach."
                        variant="dark"
                    />
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Overview KPIs */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4">
                            <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1">Active Pursuits</p>
                            <p className="text-2xl font-black font-typewriter">{activePursuits.length}</p>
                        </div>
                        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4">
                            <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1">Pipeline Value</p>
                            <p className="text-2xl font-black font-typewriter text-emerald-600">
                                {totalValue > 0 ? `$${(totalValue / 1000).toFixed(0)}K` : "TBD"}
                            </p>
                        </div>
                        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4">
                            <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1">High PWin</p>
                            <p className="text-2xl font-black font-typewriter text-emerald-600">{highWin.length}</p>
                        </div>
                        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4">
                            <p className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mb-1">At Risk</p>
                            <p className={clsx("text-2xl font-black font-typewriter", lowWin.length > 0 ? "text-red-600" : "text-stone-400")}>{lowWin.length}</p>
                        </div>
                    </div>

                    {/* Urgent Deadlines */}
                    {urgentDeadlines.length > 0 && (
                        <div className="bg-red-50 rounded-2xl border border-red-200 shadow-sm overflow-hidden">
                            <div className="px-4 sm:px-6 py-3 bg-red-100/50 border-b border-red-200">
                                <h3 className="font-typewriter font-bold text-sm flex items-center text-red-800">
                                    <Clock className="w-4 h-4 mr-2 text-red-500" /> Upcoming Deadlines (14 days)
                                </h3>
                            </div>
                            <div className="divide-y divide-red-100">
                                {urgentDeadlines.map(p => {
                                    const opp = p.opportunities as PursuitWithOpp["opportunities"];
                                    const daysLeft = Math.ceil((new Date(opp.response_deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                                    return (
                                        <Link key={p.id} href={`/opportunities/${opp.id}`}
                                            className="flex items-center justify-between px-4 sm:px-6 py-3 hover:bg-red-100/30 transition-colors">
                                            <div className="min-w-0 flex-1">
                                                <p className="font-bold text-sm text-red-900 line-clamp-1">{opp.title}</p>
                                                <p className="text-xs text-red-700">{opp.agency}</p>
                                            </div>
                                            <span className={clsx("text-xs font-typewriter font-bold whitespace-nowrap ml-3",
                                                daysLeft <= 3 ? "text-red-700" : "text-red-600"
                                            )}>
                                                {daysLeft === 0 ? "Today" : daysLeft === 1 ? "Tomorrow" : `${daysLeft}d left`}
                                            </span>
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Competitive Intelligence */}
                    {withIncumbent.length > 0 && (
                        <div className="bg-amber-50 rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
                            <div className="px-4 sm:px-6 py-3 bg-amber-100/50 border-b border-amber-200">
                                <h3 className="font-typewriter font-bold text-sm flex items-center text-amber-900">
                                    <ShieldAlert className="w-4 h-4 mr-2 text-amber-600" /> Incumbent Intelligence
                                </h3>
                                <p className="text-xs text-amber-700 mt-0.5">{withIncumbent.length} of your pursuits have known incumbents</p>
                            </div>
                            <div className="divide-y divide-amber-100">
                                {withIncumbent.map(p => {
                                    const opp = p.opportunities as PursuitWithOpp["opportunities"];
                                    return (
                                        <Link key={p.id} href={`/opportunities/${opp.id}`}
                                            className="flex items-center justify-between px-4 sm:px-6 py-3 hover:bg-amber-100/30 transition-colors">
                                            <div className="min-w-0 flex-1">
                                                <p className="font-bold text-sm text-amber-900 line-clamp-1">{opp.title}</p>
                                                <p className="text-xs text-amber-700">{opp.agency}</p>
                                            </div>
                                            <span className="text-xs font-typewriter font-bold text-amber-800 whitespace-nowrap ml-3">
                                                vs. {opp.incumbent_contractor_name}
                                            </span>
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Win Probability Breakdown */}
                    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
                        <div className="px-4 sm:px-6 py-3 bg-stone-50 border-b border-stone-100">
                            <h3 className="font-typewriter font-bold text-sm flex items-center text-stone-800">
                                <TrendingUp className="w-4 h-4 mr-2 text-stone-400" /> Win Probability Assessment
                            </h3>
                        </div>
                        <div className="divide-y divide-stone-100">
                            {activePursuits.map(p => {
                                const opp = p.opportunities as PursuitWithOpp["opportunities"];
                                const strat = opp?.strategic_scoring || {};
                                const winProb = (strat as Record<string, string>).win_prob_tier || "UNKNOWN";
                                const competition = (strat as Record<string, string>).est_competition_level || "UNKNOWN";
                                const complexity = (strat as Record<string, string>).complexity_level || "UNKNOWN";

                                return (
                                    <Link key={p.id} href={`/opportunities/${opp.id}`}
                                        className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 sm:px-6 py-3 hover:bg-stone-50 transition-colors">
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-sm text-stone-800 line-clamp-1">{opp.title}</p>
                                            <p className="text-xs text-stone-500">{opp.agency}</p>
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            <span className={clsx("text-[10px] font-typewriter font-bold px-2 py-0.5 rounded border",
                                                winProb === "HIGH" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                                winProb === "MEDIUM" ? "bg-amber-50 text-amber-700 border-amber-200" :
                                                winProb === "LOW" ? "bg-red-50 text-red-700 border-red-200" :
                                                "bg-stone-50 text-stone-500 border-stone-200"
                                            )}>PWin: {winProb}</span>
                                            <span className={clsx("text-[10px] font-typewriter font-bold px-2 py-0.5 rounded border",
                                                competition === "LOW" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                                competition === "MEDIUM" ? "bg-amber-50 text-amber-700 border-amber-200" :
                                                competition === "HIGH" ? "bg-red-50 text-red-700 border-red-200" :
                                                "bg-stone-50 text-stone-500 border-stone-200"
                                            )}>Comp: {competition}</span>
                                            <span className={clsx("text-[10px] font-typewriter font-bold px-2 py-0.5 rounded border",
                                                complexity === "LOW" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                                complexity === "MEDIUM" ? "bg-amber-50 text-amber-700 border-amber-200" :
                                                complexity === "HIGH" ? "bg-red-50 text-red-700 border-red-200" :
                                                "bg-stone-50 text-stone-500 border-stone-200"
                                            )}>Cmplx: {complexity}</span>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    </div>

                    {/* Set-Aside Advantages */}
                    {withSetAside.length > 0 && (
                        <div className="bg-emerald-50 rounded-2xl border border-emerald-200 shadow-sm overflow-hidden">
                            <div className="px-4 sm:px-6 py-3 bg-emerald-100/50 border-b border-emerald-200">
                                <h3 className="font-typewriter font-bold text-sm flex items-center text-emerald-900">
                                    <Zap className="w-4 h-4 mr-2 text-emerald-600" /> Set-Aside Advantages
                                </h3>
                                <p className="text-xs text-emerald-700 mt-0.5">{withSetAside.length} pursuits with small business set-asides</p>
                            </div>
                            <div className="divide-y divide-emerald-100">
                                {withSetAside.map(p => {
                                    const opp = p.opportunities as PursuitWithOpp["opportunities"];
                                    return (
                                        <Link key={p.id} href={`/opportunities/${opp.id}`}
                                            className="flex items-center justify-between px-4 sm:px-6 py-3 hover:bg-emerald-100/30 transition-colors">
                                            <div className="min-w-0 flex-1">
                                                <p className="font-bold text-sm text-emerald-900 line-clamp-1">{opp.title}</p>
                                                <p className="text-xs text-emerald-700">{opp.agency}</p>
                                            </div>
                                            <span className="text-[10px] font-typewriter font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200 whitespace-nowrap ml-3">
                                                {opp.set_aside_code}
                                            </span>
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* At-Risk Pursuits */}
                    {lowWin.length > 0 && (
                        <div className="space-y-3">
                            <div className="bg-red-50 rounded-2xl border border-red-200 shadow-sm overflow-hidden">
                                <div className="px-4 sm:px-6 py-3 bg-red-100/50 border-b border-red-200">
                                    <h3 className="font-typewriter font-bold text-sm flex items-center text-red-900">
                                        <AlertTriangle className="w-4 h-4 mr-2 text-red-500" /> At-Risk Pursuits
                                    </h3>
                                    <p className="text-xs text-red-700 mt-0.5">These opportunities have LOW win probability -- consider strategy adjustments</p>
                                </div>
                                <div className="divide-y divide-red-100">
                                    {lowWin.map(p => {
                                        const opp = p.opportunities as PursuitWithOpp["opportunities"];
                                        return (
                                            <Link key={p.id} href={`/opportunities/${opp.id}`}
                                                className="flex items-center justify-between px-4 sm:px-6 py-3 hover:bg-red-100/30 transition-colors">
                                                <div className="min-w-0 flex-1">
                                                    <p className="font-bold text-sm text-red-900 line-clamp-1">{opp.title}</p>
                                                    <p className="text-xs text-red-700">{opp.agency}</p>
                                                </div>
                                                <Eye className="w-4 h-4 text-red-400 ml-3 flex-shrink-0" />
                                            </Link>
                                        );
                                    })}
                                </div>
                            </div>
                            <ServiceCTA
                                title="Improve your win probability"
                                description="Our capture strategists can assess these at-risk pursuits and help you improve your competitive position."
                                variant="amber"
                            />
                        </div>
                    )}

                    {/* Bottom CTA */}
                    <ServiceCTA
                        title="Want a full capture readiness assessment?"
                        description="Our team analyzes your pipeline, competitive position, and past performance to build a personalized strategy for each pursuit."
                        variant="dark"
                    />
                </div>
            )}
        </div>
    );
}
