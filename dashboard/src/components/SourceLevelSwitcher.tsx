"use client";

import clsx from "clsx";

export type SourceLevel = "ALL" | "FEDERAL" | "SLED";

/**
 * Maps the granular `opportunities.source` enum values (migration 064) to the
 * three buckets the customer cares about. Export so query builders can
 * `.in("source", SOURCE_LEVEL_VALUES[level])` directly.
 */
export const SOURCE_LEVEL_VALUES: Record<SourceLevel, string[] | null> = {
    ALL: null,
    FEDERAL: ["sam", "grants_gov", "sbir"],
    SLED: ["sled", "state", "local"],
};

interface Props {
    value: SourceLevel;
    onChange: (next: SourceLevel) => void;
    /** When false the "Level" label is hidden — useful inside crowded toolbars. */
    showLabel?: boolean;
    className?: string;
}

const LEVELS: { key: SourceLevel; label: string; help: string }[] = [
    { key: "ALL", label: "All", help: "Every source" },
    { key: "FEDERAL", label: "Federal", help: "SAM.gov contracts + Grants.gov + SBIR" },
    { key: "SLED", label: "State / Local", help: "Bonfire, OpenGov, BidNet feeds + direct state portals" },
];

export default function SourceLevelSwitcher({ value, onChange, showLabel = true, className }: Props) {
    return (
        <div className={clsx("flex items-center gap-2 flex-wrap", className)} role="group" aria-label="Opportunity source level">
            {showLabel && (
                <span className="text-[10px] text-stone-400 uppercase tracking-widest">Level</span>
            )}
            {LEVELS.map(lvl => (
                <button
                    type="button"
                    key={lvl.key}
                    onClick={() => onChange(lvl.key)}
                    title={lvl.help}
                    aria-pressed={value === lvl.key}
                    className={clsx(
                        "text-xs font-bold px-3 py-1.5 rounded-full border transition-all",
                        value === lvl.key
                            ? lvl.key === "FEDERAL"
                                ? "bg-blue-600 text-white border-blue-600"
                                : lvl.key === "SLED"
                                    ? "bg-emerald-600 text-white border-emerald-600"
                                    : "bg-stone-900 text-white border-stone-900"
                            : "bg-white text-stone-600 border-stone-200 hover:bg-stone-100"
                    )}
                >
                    {lvl.label}
                </button>
            ))}
        </div>
    );
}
