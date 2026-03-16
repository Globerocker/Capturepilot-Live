"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/client";
import { Layers, Loader2, Search, Eye, ChevronDown, ArrowRight, Target, Clock, Phone, Calendar, DollarSign } from "lucide-react";
import clsx from "clsx";
import Link from "next/link";
import ServiceCTA from "@/components/ui/ServiceCTA";
import { InfoTooltip } from "@/components/ui/InfoTooltip";

const supabase = createSupabaseClient();

interface Pursuit {
    id: string;
    opportunity_id: string;
    stage: string;
    priority: string;
    notes: string | null;
    stage_changed_at: string;
    created_at: string;
    opportunities: {
        id: string;
        title: string;
        agency: string;
        response_deadline: string;
        notice_type: string;
        set_aside_code: string;
        naics_code: string;
        estimated_value: number | null;
        strategic_scoring: Record<string, string> | null;
    };
}

const STAGES = [
    { key: "discovered", label: "Discovered", color: "bg-stone-100 border-stone-200 text-stone-700", dot: "bg-stone-400" },
    { key: "researching", label: "Researching", color: "bg-blue-50 border-blue-200 text-blue-700", dot: "bg-blue-500" },
    { key: "preparing", label: "Preparing", color: "bg-amber-50 border-amber-200 text-amber-700", dot: "bg-amber-500" },
    { key: "submitted", label: "Submitted", color: "bg-purple-50 border-purple-200 text-purple-700", dot: "bg-purple-500" },
    { key: "awarded", label: "Awarded", color: "bg-emerald-50 border-emerald-200 text-emerald-700", dot: "bg-emerald-500" },
    { key: "lost", label: "Lost", color: "bg-red-50 border-red-200 text-red-700", dot: "bg-red-500" },
    { key: "no_bid", label: "No Bid", color: "bg-stone-50 border-stone-200 text-stone-500", dot: "bg-stone-400" },
];

const STAGE_ORDER = STAGES.map(s => s.key);

const STAGE_TOOLTIPS: Record<string, string> = {
    discovered: "You've identified this opportunity. Next step: research the requirements and assess fit.",
    researching: "Actively reviewing requirements, evaluating competition, and assessing your competitive position.",
    preparing: "Writing your proposal, gathering past performance, and assembling your team.",
    submitted: "Your response has been submitted. Await evaluation results.",
    awarded: "Congratulations! You won this contract.",
    lost: "This bid was not selected. Review the debrief to improve future submissions.",
    no_bid: "You decided not to pursue this opportunity.",
};

function getStageInfo(stage: string) {
    return STAGES.find(s => s.key === stage) || STAGES[0];
}

function getNextStages(currentStage: string): string[] {
    if (currentStage === "discovered") return ["researching", "no_bid"];
    if (currentStage === "researching") return ["preparing", "no_bid"];
    if (currentStage === "preparing") return ["submitted", "no_bid"];
    if (currentStage === "submitted") return ["awarded", "lost"];
    return [];
}

function getDeadlineInfo(deadline: string | null): { label: string; color: string; daysLeft: number } | null {
    if (!deadline) return null;
    const now = Date.now();
    const dl = new Date(deadline).getTime();
    const daysLeft = Math.ceil((dl - now) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) return { label: "Expired", color: "text-stone-400", daysLeft };
    if (daysLeft === 0) return { label: "Due today", color: "text-red-600 font-bold", daysLeft };
    if (daysLeft <= 3) return { label: `${daysLeft}d left`, color: "text-red-600 font-bold", daysLeft };
    if (daysLeft <= 7) return { label: `${daysLeft}d left`, color: "text-amber-600 font-bold", daysLeft };
    if (daysLeft <= 14) return { label: `${daysLeft}d left`, color: "text-stone-600", daysLeft };
    return { label: `${daysLeft}d left`, color: "text-stone-500", daysLeft };
}

// Stage-specific service CTAs
const STAGE_SERVICE_CTAS: Record<string, { title: string; description: string; variant: "default" | "amber" | "dark" } | null> = {
    discovered: null,
    researching: {
        title: "Book a Capture Strategy Call",
        description: "Get expert guidance on whether this opportunity is the right fit for your company.",
        variant: "default",
    },
    preparing: {
        title: "Get Professional Proposal Help",
        description: "Our team can review your proposal, draft technical approaches, and strengthen your submission.",
        variant: "amber",
    },
    submitted: {
        title: "Schedule Debrief Coaching",
        description: "Win or lose, maximize your learning. Prepare for debriefs and improve future bids.",
        variant: "default",
    },
    lost: {
        title: "Book a Win-Rate Improvement Session",
        description: "Analyze what went wrong and develop a stronger strategy for your next bid.",
        variant: "dark",
    },
};

export default function PipelinePage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [pursuits, setPursuits] = useState<Pursuit[]>([]);
    const [profileId, setProfileId] = useState<string | null>(null);
    const [expandedStages, setExpandedStages] = useState<Record<string, boolean>>({
        discovered: true, researching: true, preparing: true, submitted: true,
    });
    const [pipelineSort, setPipelineSort] = useState<"deadline" | "value" | "priority">("deadline");

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
            setProfileId(profile.id);
        }
        load();
    }, [router]);

    const fetchPursuits = useCallback(async () => {
        if (!profileId) return;
        setLoading(true);

        const { data } = await supabase
            .from("user_pursuits")
            .select("*, opportunities(id, title, agency, response_deadline, notice_type, set_aside_code, naics_code, estimated_value, strategic_scoring)")
            .eq("user_profile_id", profileId)
            .order("created_at", { ascending: false });

        setPursuits((data || []) as Pursuit[]);
        setLoading(false);
    }, [profileId]);

    useEffect(() => {
        if (profileId) fetchPursuits();
    }, [profileId, fetchPursuits]);

    const updateStage = async (pursuitId: string, newStage: string) => {
        const { error } = await supabase
            .from("user_pursuits")
            .update({ stage: newStage, stage_changed_at: new Date().toISOString() })
            .eq("id", pursuitId);

        if (!error) {
            setPursuits(prev => prev.map(p =>
                p.id === pursuitId ? { ...p, stage: newStage, stage_changed_at: new Date().toISOString() } : p
            ));
        }
    };

    const toggleStage = (stage: string) => {
        setExpandedStages(prev => ({ ...prev, [stage]: !prev[stage] }));
    };

    const groupedPursuits = STAGES.reduce((acc, stage) => {
        acc[stage.key] = pursuits.filter(p => p.stage === stage.key);
        return acc;
    }, {} as Record<string, Pursuit[]>);

    const activeStages = STAGES.filter(s =>
        groupedPursuits[s.key].length > 0 || ["discovered", "researching", "preparing", "submitted"].includes(s.key)
    );

    // Pipeline stats
    const totalValue = pursuits.reduce((sum, p) => {
        const opp = p.opportunities as Pursuit["opportunities"];
        return sum + (opp?.estimated_value || 0);
    }, 0);
    const activePursuits = pursuits.filter(p => !["awarded", "lost", "no_bid"].includes(p.stage)).length;

    if (loading && pursuits.length === 0) {
        return (
            <div className="flex justify-center items-center min-h-[400px]">
                <Loader2 className="w-10 h-10 animate-spin text-stone-400" />
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto pb-12 animate-in fade-in duration-500 px-1">
            <header className="mb-6">
                <h2 className="text-2xl sm:text-3xl font-bold font-typewriter tracking-tighter text-black flex items-center">
                    <Layers className="mr-2 sm:mr-3 w-6 h-6 sm:w-8 sm:h-8" /> Pipeline
                    <span className="ml-3 text-sm font-sans font-medium bg-stone-100 px-3 py-1 rounded-full text-stone-500 border border-stone-200">
                        {pursuits.length}
                    </span>
                </h2>
                <p className="text-stone-500 mt-1 font-medium text-sm">
                    Track your contract pursuit progress
                </p>
            </header>

            {pursuits.length === 0 ? (
                <div className="space-y-4">
                    <div className="bg-white border border-stone-200 border-dashed rounded-[24px] sm:rounded-[32px] p-8 sm:p-12 text-center shadow-sm">
                        <Search className="w-12 h-12 text-stone-300 mx-auto mb-4" />
                        <h3 className="font-typewriter font-bold text-lg mb-2">No opportunities in your pipeline</h3>
                        <p className="text-stone-500 text-sm mb-6 max-w-md mx-auto">
                            Start by browsing opportunities and clicking &ldquo;Start Pursuing&rdquo; on ones that interest you.
                        </p>
                        <Link href="/opportunities"
                            className="inline-flex items-center bg-black text-white font-typewriter font-bold px-6 py-3 rounded-full hover:bg-stone-800 transition-all text-sm">
                            <Target className="w-4 h-4 mr-2" /> Browse Opportunities
                        </Link>
                    </div>
                    <ServiceCTA
                        title="Not sure where to start? Book a Strategy Call"
                        description="Our GovCon experts will review your profile, identify the best opportunities, and build a capture plan with you."
                        variant="dark"
                    />
                </div>
            ) : (
                <>
                    {/* Sort + Summary Bar */}
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                        <span className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest mr-1">Sort by</span>
                        {([
                            { key: "deadline" as const, label: "Deadline" },
                            { key: "value" as const, label: "Value" },
                            { key: "priority" as const, label: "Priority" },
                        ]).map(opt => (
                            <button type="button" key={opt.key} onClick={() => setPipelineSort(opt.key)}
                                className={clsx("text-xs font-typewriter font-bold px-3 py-1.5 rounded-full border transition-all",
                                    pipelineSort === opt.key ? "bg-black text-white border-black" : "bg-white text-stone-500 border-stone-200 hover:bg-stone-100"
                                )}>
                                {opt.label}
                            </button>
                        ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mb-4">
                        <div className="bg-white border border-stone-200 rounded-xl px-3 sm:px-4 py-2 text-xs font-typewriter">
                            <span className="font-bold text-black">{activePursuits}</span>
                            <span className="text-stone-500"> active</span>
                        </div>
                        {totalValue > 0 && (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 sm:px-4 py-2 text-xs font-typewriter flex items-center">
                                <DollarSign className="w-3 h-3 mr-1 text-emerald-600" />
                                <span className="font-bold text-emerald-700">
                                    {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(totalValue)}
                                </span>
                                <span className="text-emerald-600 ml-1">pipeline value</span>
                            </div>
                        )}
                    </div>

                    <div className="space-y-3">
                        {activeStages.map(stage => {
                            const rawItems = groupedPursuits[stage.key];
                            const items = [...rawItems].sort((a, b) => {
                                const oppA = a.opportunities as Pursuit["opportunities"];
                                const oppB = b.opportunities as Pursuit["opportunities"];
                                if (pipelineSort === "deadline") {
                                    return (oppA?.response_deadline || "9999").localeCompare(oppB?.response_deadline || "9999");
                                }
                                if (pipelineSort === "value") {
                                    return (oppB?.estimated_value || 0) - (oppA?.estimated_value || 0);
                                }
                                const pOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
                                return (pOrder[a.priority] ?? 1) - (pOrder[b.priority] ?? 1);
                            });
                            const isExpanded = expandedStages[stage.key] ?? false;
                            const serviceCta = STAGE_SERVICE_CTAS[stage.key];

                            return (
                                <div key={stage.key} className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => toggleStage(stage.key)}
                                        className="w-full flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 hover:bg-stone-50 transition-colors"
                                    >
                                        <div className="flex items-center gap-2 sm:gap-3">
                                            <span className={clsx("text-[10px] sm:text-xs font-typewriter font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border", stage.color)}>
                                                {stage.label}
                                            </span>
                                            <InfoTooltip text={STAGE_TOOLTIPS[stage.key] || ""} />
                                            <span className="text-sm font-bold text-stone-700">{items.length}</span>
                                        </div>
                                        <ChevronDown className={clsx("w-4 h-4 text-stone-400 transition-transform", isExpanded && "rotate-180")} />
                                    </button>

                                    {isExpanded && items.length > 0 && (
                                        <div className="border-t border-stone-100">
                                            <div className="divide-y divide-stone-100">
                                                {items.map(pursuit => {
                                                    const opp = pursuit.opportunities as Pursuit["opportunities"];
                                                    const nextStages = getNextStages(pursuit.stage);
                                                    const deadlineInfo = getDeadlineInfo(opp?.response_deadline);
                                                    const strat = opp?.strategic_scoring || {};
                                                    const winProb = (strat as Record<string, string>).win_prob_tier;

                                                    return (
                                                        <div key={pursuit.id} className="px-4 sm:px-6 py-3 sm:py-4 hover:bg-stone-50 transition-colors">
                                                            <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
                                                                <div className="flex-1 min-w-0">
                                                                    <Link href={`/opportunities/${opp?.id}`} className="font-bold text-sm text-black hover:underline line-clamp-1">
                                                                        {opp?.title || "Unknown Opportunity"}
                                                                    </Link>
                                                                    <p className="text-xs text-stone-500 line-clamp-1 mt-0.5">{opp?.agency}</p>

                                                                    {/* Rich metadata row */}
                                                                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                                                                        {opp?.naics_code && (
                                                                            <span className="font-mono text-[10px] bg-stone-100 px-2 py-0.5 rounded text-stone-600 border border-stone-200">{opp.naics_code}</span>
                                                                        )}
                                                                        {opp?.estimated_value && (
                                                                            <span className="text-[10px] font-typewriter font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200">
                                                                                {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(opp.estimated_value)}
                                                                            </span>
                                                                        )}
                                                                        {winProb && (
                                                                            <span className={clsx("text-[10px] font-typewriter font-bold px-2 py-0.5 rounded border",
                                                                                winProb === "HIGH" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                                                                winProb === "MEDIUM" ? "bg-amber-50 text-amber-700 border-amber-200" :
                                                                                "bg-red-50 text-red-700 border-red-200"
                                                                            )}>
                                                                                PWin: {winProb}
                                                                            </span>
                                                                        )}
                                                                        {deadlineInfo && (
                                                                            <span className={clsx("text-[10px] font-typewriter font-bold flex items-center gap-1", deadlineInfo.color)}>
                                                                                <Clock className="w-3 h-3" />
                                                                                {deadlineInfo.label}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                                    {nextStages.length > 0 && (
                                                                        <select
                                                                            title="Move to stage"
                                                                            value=""
                                                                            onChange={(e) => { if (e.target.value) updateStage(pursuit.id, e.target.value); }}
                                                                            className="text-xs bg-stone-100 border border-stone-200 rounded-lg px-2 py-1.5 font-typewriter font-bold cursor-pointer hover:bg-stone-200 transition-colors"
                                                                        >
                                                                            <option value="">Move to...</option>
                                                                            {nextStages.map(ns => (
                                                                                <option key={ns} value={ns}>{getStageInfo(ns).label}</option>
                                                                            ))}
                                                                        </select>
                                                                    )}
                                                                    <Link href={`/opportunities/${opp?.id}`} className="p-1.5 text-stone-400 hover:text-black transition-colors">
                                                                        <Eye className="w-4 h-4" />
                                                                    </Link>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            {/* Stage-specific service CTA */}
                                            {serviceCta && items.length > 0 && (
                                                <div className="border-t border-stone-100 px-4 sm:px-6 py-3">
                                                    <ServiceCTA
                                                        title={serviceCta.title}
                                                        description={serviceCta.description}
                                                        variant={serviceCta.variant}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {isExpanded && items.length === 0 && (
                                        <div className="border-t border-stone-100 px-6 py-4 text-center">
                                            <p className="text-xs text-stone-400">No opportunities at this stage</p>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Bottom service CTA */}
                    <div className="mt-6">
                        <ServiceCTA
                            title="Need help winning? Talk to a GovCon expert"
                            description="From capture strategy to proposal writing, our team helps small businesses win federal contracts. Book a free consultation."
                            variant="dark"
                        />
                    </div>
                </>
            )}
        </div>
    );
}
