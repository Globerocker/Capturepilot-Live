"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { PublicStatsBar } from "@/components/LiveCounter";
import {
    Globe, Database, Target, Search, Users, Sparkles, CheckCircle2, Loader2,
    Clock,
} from "lucide-react";

interface Stage {
    key: string;
    icon: typeof Globe;
    label: string;
    description: string;
    /** Estimated wall-clock seconds for this stage. Tuned from prod runs. */
    estSeconds: number;
}

// Pre-confirm pipeline stages (crawling → awaiting_confirmation).
// Awaiting-confirmation is a handoff to the ConfirmFoundDataStep UI — not
// shown here because the user has already left this screen by then.
const PRE_CONFIRM_STAGES: Stage[] = [
    {
        key: "crawling",
        icon: Globe,
        label: "Scraping your website",
        description: "Reading homepage + key sub-pages via Firecrawl, extracting services, leadership and certifications.",
        estSeconds: 14,
    },
    {
        key: "enriching",
        icon: Database,
        label: "Cross-checking federal databases",
        description: "Looking up SAM.gov registration and USASpending past-award history in parallel.",
        estSeconds: 8,
    },
    {
        key: "classifying",
        icon: Target,
        label: "Inferring your NAICS codes",
        description: "GPT-4o picks the best industry codes against your services + capability keywords.",
        estSeconds: 4,
    },
];

// Post-confirmation pipeline stages (scoring → complete). Triggered when
// the user submits the ConfirmFoundDataStep form.
const POST_CONFIRM_STAGES: Stage[] = [
    {
        key: "scoring",
        icon: Search,
        label: "Scoring 40,000+ opportunities",
        description: "Matching every active federal contract against your NAICS, target states, set-asides and keywords.",
        estSeconds: 6,
    },
    {
        key: "finding_opportunities",
        icon: Search,
        label: "Pulling extra opportunities from SAM",
        description: "Live-querying SAM.gov for any opps we don't have cached yet — only fires when your NAICS is niche.",
        estSeconds: 4,
    },
    {
        key: "finding_competitors",
        icon: Users,
        label: "Mapping your competitors",
        description: "Finding small businesses winning in your NAICS and computing overlap with your profile.",
        estSeconds: 5,
    },
    {
        key: "generating",
        icon: Sparkles,
        label: "Writing your personalized report",
        description: "GPT-4o-mini writes a why-this-fits blurb for each top match in parallel.",
        estSeconds: 6,
    },
];

function pickStages(status: string): Stage[] {
    // Decide which phase we're in. Anything past awaiting_confirmation = post.
    if (["scoring", "finding_opportunities", "finding_competitors", "generating"].includes(status)) {
        return POST_CONFIRM_STAGES;
    }
    return PRE_CONFIRM_STAGES;
}

function statusIndex(stages: Stage[], status: string): number {
    const i = stages.findIndex(s => s.key === status);
    return i < 0 ? 0 : i;
}

interface Props {
    companyName: string;
    status: string;
    /**
     * Total approximate seconds we estimate the pipeline takes end-to-end.
     * Falls back to the sum of stage durations when omitted.
     */
    totalEstSeconds?: number;
}

export default function AnalysisLoadingScreen({ companyName, status }: Props) {
    const stages = pickStages(status);
    const activeIndex = statusIndex(stages, status);
    const totalEst = stages.reduce((a, s) => a + s.estSeconds, 0);

    // The pipeline triggers a status flip at the START of each stage, so we
    // approximate progress as: completed stages' full duration + a linearly
    // growing fraction of the current stage's duration, based on how long
    // it has been the active stage.
    const stageEnteredAt = useRef<number>(Date.now());
    const lastStatus = useRef<string>(status);
    useEffect(() => {
        if (lastStatus.current !== status) {
            stageEnteredAt.current = Date.now();
            lastStatus.current = status;
        }
    }, [status]);

    const [now, setNow] = useState<number>(Date.now());
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 500);
        return () => clearInterval(t);
    }, []);

    const secondsInStage = (now - stageEnteredAt.current) / 1000;
    const currentStageEst = stages[activeIndex]?.estSeconds || 6;
    const stageProgress = Math.min(0.95, secondsInStage / currentStageEst); // cap at 95% so we never look stuck at 100%

    const completedSeconds = stages
        .slice(0, activeIndex)
        .reduce((a, s) => a + s.estSeconds, 0);
    const liveSeconds = completedSeconds + stageProgress * currentStageEst;
    const pct = Math.min(98, Math.round((liveSeconds / totalEst) * 100));
    const remainingSeconds = Math.max(1, Math.round(totalEst - liveSeconds));

    return (
        <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-stone-50 to-blue-50 flex items-center justify-center px-4 py-10">
            <div className="max-w-2xl w-full">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center gap-2 bg-white text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-widest mb-4 shadow-sm">
                        <Sparkles className="w-3.5 h-3.5" /> Working on it
                    </div>
                    <h1 className="font-black text-3xl sm:text-4xl text-stone-900 leading-tight">
                        Analyzing <span className="bg-gradient-to-r from-emerald-600 to-blue-700 bg-clip-text text-transparent">{companyName || "your company"}</span>
                    </h1>
                    <p className="text-sm text-stone-500 mt-2">
                        We&apos;re running a full federal-readiness pass. Hang tight.
                    </p>
                </div>

                {/* Progress bar + ETA */}
                <div className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden mb-5">
                    <div className="p-5 pb-3">
                        <div className="flex items-center justify-between gap-3 mb-2">
                            <p className="text-[11px] font-bold uppercase tracking-widest text-stone-500">Overall progress</p>
                            <div className="flex items-center gap-3">
                                <p className="text-sm font-bold text-stone-900">{pct}%</p>
                                <span className="text-stone-300">·</span>
                                <p className="text-xs font-bold text-emerald-700 inline-flex items-center gap-1">
                                    <Clock className="w-3 h-3" /> ~{remainingSeconds}s left
                                </p>
                            </div>
                        </div>
                        <div className="relative h-2.5 bg-stone-100 rounded-full overflow-hidden">
                            <div
                                className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500 to-blue-600 rounded-full transition-[width] duration-500 ease-out"
                                style={{ width: `${pct}%` }}
                            />
                            <div className="absolute inset-y-0 w-full bg-[linear-gradient(90deg,transparent_0,rgba(255,255,255,0.5)_50%,transparent_100%)] bg-[length:200%_100%] animate-[shimmer_1.6s_linear_infinite]" />
                        </div>
                    </div>

                    {/* Detailed step list */}
                    <ol className="divide-y divide-stone-100 border-t border-stone-100">
                        {stages.map((stage, idx) => {
                            const isActive = idx === activeIndex;
                            const isDone = idx < activeIndex;
                            const isPending = idx > activeIndex;
                            const Icon = stage.icon;
                            return (
                                <li
                                    key={stage.key}
                                    className={clsx(
                                        "flex items-start gap-4 p-4 transition-colors",
                                        isActive && "bg-emerald-50/50",
                                        isPending && "opacity-50",
                                    )}
                                >
                                    <div className={clsx(
                                        "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all",
                                        isActive && "bg-gradient-to-br from-emerald-500 to-blue-600 text-white shadow-sm",
                                        isDone && "bg-emerald-500 text-white",
                                        isPending && "bg-stone-100 text-stone-400",
                                    )}>
                                        {isActive ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : isDone ? (
                                            <CheckCircle2 className="w-5 h-5" />
                                        ) : (
                                            <Icon className="w-4 h-4" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-baseline justify-between gap-2 flex-wrap">
                                            <p className={clsx(
                                                "font-bold text-sm",
                                                isActive && "text-stone-900",
                                                isDone && "text-emerald-700",
                                                isPending && "text-stone-500",
                                            )}>
                                                {stage.label}
                                                {isDone && (
                                                    <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                                                        Done
                                                    </span>
                                                )}
                                            </p>
                                            <p className="text-[10px] font-bold text-stone-400 uppercase">
                                                ~{stage.estSeconds}s
                                            </p>
                                        </div>
                                        <p className={clsx(
                                            "text-xs leading-relaxed mt-0.5",
                                            isActive ? "text-stone-600" : "text-stone-400",
                                        )}>
                                            {stage.description}
                                        </p>
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
                </div>

                {/* Live data ticker — shows the scale of the engine running behind
                    this analysis. Updates in real time from /api/public/stats. */}
                <div className="bg-gradient-to-r from-emerald-50 via-white to-blue-50 border border-emerald-100 rounded-2xl px-5 py-4 mb-5">
                    <div className="flex items-center justify-between gap-3 mb-2">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">
                            Scoring against
                        </p>
                        <span className="inline-flex items-center gap-1 text-[10px] text-stone-500">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Live
                        </span>
                    </div>
                    <PublicStatsBar variant="compact" />
                </div>

                {/* Reassurance microcopy */}
                <p className="text-[11px] text-center text-stone-400">
                    You can close this tab — we&apos;ll keep your report ready when you come back.
                </p>
            </div>

            {/* Shimmer keyframes inline (used by the progress bar). Scoped via
                arbitrary class above; defined here so we don't pollute global CSS. */}
            <style jsx global>{`
                @keyframes shimmer {
                    0% { background-position: 200% 0; }
                    100% { background-position: -200% 0; }
                }
            `}</style>
        </div>
    );
}
