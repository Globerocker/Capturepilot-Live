"use client";

import { Globe, Search, Database, Target, Zap, Loader2, CheckCircle2 } from "lucide-react";
import clsx from "clsx";

interface AnalysisProgressStepperProps {
    currentStep: number; // 0-4
}

const steps = [
    { icon: Globe, label: "Crawling website", description: "Scanning pages, sitemap & legal info..." },
    { icon: Database, label: "Enriching data", description: "Checking SAM.gov & federal databases..." },
    { icon: Target, label: "Classifying industry", description: "Inferring NAICS codes..." },
    { icon: Search, label: "Scoring matches", description: "Finding matching opportunities..." },
    { icon: Zap, label: "Generating results", description: "Building recommendations & insights..." },
];

// Map API status strings to step numbers
export function statusToStep(status: string): number {
    switch (status) {
        case "crawling": return 0;
        case "enriching": return 1;
        case "classifying": return 2;
        case "scoring": return 3;
        case "complete": return 5; // All steps done
        default: return 0;
    }
}

export function AnalysisProgressStepper({ currentStep }: AnalysisProgressStepperProps) {
    return (
        <div className="space-y-4">
            {steps.map((step, index) => {
                const isActive = index === currentStep;
                const isComplete = index < currentStep;
                const isPending = index > currentStep;

                return (
                    <div
                        key={step.label}
                        className={clsx(
                            "flex items-center gap-4 p-4 rounded-2xl border transition-all duration-500",
                            isActive && "bg-white border-black shadow-sm",
                            isComplete && "bg-emerald-50 border-emerald-200",
                            isPending && "bg-stone-50 border-stone-100 opacity-50"
                        )}
                    >
                        <div className={clsx(
                            "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all",
                            isActive && "bg-black",
                            isComplete && "bg-emerald-500",
                            isPending && "bg-stone-200"
                        )}>
                            {isActive ? (
                                <Loader2 className="w-5 h-5 text-white animate-spin" />
                            ) : isComplete ? (
                                <CheckCircle2 className="w-5 h-5 text-white" />
                            ) : (
                                <step.icon className="w-5 h-5 text-stone-400" />
                            )}
                        </div>
                        <div>
                            <p className={clsx(
                                "font-typewriter font-bold text-sm",
                                isActive && "text-black",
                                isComplete && "text-emerald-700",
                                isPending && "text-stone-400"
                            )}>
                                {step.label}
                                {isComplete && " — Done"}
                            </p>
                            {isActive && (
                                <p className="text-xs text-stone-500 mt-0.5 animate-pulse">
                                    {step.description}
                                </p>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
