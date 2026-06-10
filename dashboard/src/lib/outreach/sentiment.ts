/**
 * Shared sentiment vocabulary for the outreach inbox.
 * Used by the API filter, the inbox UI, and the classifier worker.
 */

export type Sentiment =
    | "positive"
    | "neutral"
    | "negative"
    | "auto_reply"
    | "unsubscribe"
    | "unsure";

export const SENTIMENTS: Sentiment[] = [
    "positive",
    "neutral",
    "negative",
    "auto_reply",
    "unsubscribe",
    "unsure",
];

export function isSentiment(value: unknown): value is Sentiment {
    return typeof value === "string" && (SENTIMENTS as string[]).includes(value);
}

export interface SentimentStyle {
    label: string;
    /** Tailwind classes for the chip. */
    chip: string;
    /** Dot color for compact list rows. */
    dot: string;
}

export const SENTIMENT_STYLES: Record<Sentiment, SentimentStyle> = {
    positive: {
        label: "Positive",
        chip: "bg-emerald-50 text-emerald-700 border border-emerald-200",
        dot: "bg-emerald-500",
    },
    neutral: {
        label: "Neutral",
        chip: "bg-stone-100 text-stone-700 border border-stone-200",
        dot: "bg-stone-400",
    },
    negative: {
        label: "Negative",
        chip: "bg-red-50 text-red-700 border border-red-200",
        dot: "bg-red-500",
    },
    auto_reply: {
        label: "Auto-Reply",
        chip: "bg-violet-50 text-violet-700 border border-violet-200",
        dot: "bg-violet-500",
    },
    unsubscribe: {
        label: "Unsubscribe",
        chip: "bg-amber-50 text-amber-800 border border-amber-200",
        dot: "bg-amber-500",
    },
    unsure: {
        label: "Unclassified",
        chip: "bg-white text-stone-600 border border-dashed border-stone-300",
        dot: "bg-stone-300",
    },
};

/** Snippet for the list row — trims to 180 chars, single line. */
export function buildSnippet(input: string | null | undefined, max = 180): string {
    if (!input) return "";
    const cleaned = input.replace(/\s+/g, " ").trim();
    if (cleaned.length <= max) return cleaned;
    return cleaned.slice(0, max - 1).trimEnd() + "…";
}
