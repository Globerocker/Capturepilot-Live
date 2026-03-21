"use client";

import { CheckCircle2, AlertCircle, HelpCircle } from "lucide-react";
import clsx from "clsx";

interface ConfidenceBadgeProps {
    level: "high" | "medium" | "low";
    label?: string;
    className?: string;
}

const config = {
    high: {
        icon: CheckCircle2,
        text: "Auto-detected",
        colors: "text-emerald-600 bg-emerald-50 border-emerald-200",
    },
    medium: {
        icon: AlertCircle,
        text: "Verify",
        colors: "text-amber-600 bg-amber-50 border-amber-200",
    },
    low: {
        icon: HelpCircle,
        text: "Best guess",
        colors: "text-stone-500 bg-stone-50 border-stone-200",
    },
};

export function ConfidenceBadge({ level, label, className }: ConfidenceBadgeProps) {
    const { icon: Icon, text, colors } = config[level];
    return (
        <span className={clsx(
            "inline-flex items-center gap-1 text-[10px] font-typewriter font-bold px-2 py-0.5 rounded border",
            colors,
            className
        )}>
            <Icon className="w-3 h-3" />
            {label || text}
        </span>
    );
}
