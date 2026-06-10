"use client";

import clsx from "clsx";
import { SENTIMENT_STYLES, type Sentiment, isSentiment } from "@/lib/outreach/sentiment";

export function SentimentBadge({
    value,
    size = "sm",
    className,
}: {
    value: string | null | undefined;
    size?: "sm" | "xs";
    className?: string;
}) {
    const key: Sentiment = isSentiment(value) ? value : "unsure";
    const style = SENTIMENT_STYLES[key];
    return (
        <span
            className={clsx(
                "inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap",
                size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs",
                style.chip,
                className
            )}
        >
            <span className={clsx("w-1.5 h-1.5 rounded-full", style.dot)} />
            {style.label}
        </span>
    );
}
