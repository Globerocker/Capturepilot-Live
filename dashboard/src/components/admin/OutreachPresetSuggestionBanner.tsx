"use client";

/**
 * Outreach Preset Suggestion Banner (R3-M5.3)
 *
 * Small, unobtrusive footer banner that surfaces a "Suggested next step" preset
 * after the admin has created at least one outreach campaign of any kind.
 *
 * Behavior:
 *  - Hidden until `campaignCount >= 1`
 *  - Picks a rotating preset suggestion seeded from campaignCount so it doesn't
 *    feel random
 *  - Dismissible — choice persists in localStorage so the same admin doesn't
 *    see it again on this device
 *  - Clicking "Try it" calls onTryPreset(presetId) — caller opens the picker
 *    pre-selected to that preset
 *
 * Drop into the admin campaigns page footer:
 *
 *   <OutreachPresetSuggestionBanner
 *     campaignCount={campaigns.length}
 *     onTryPreset={(id) => { setPickerOpen(true); setPickerPresetId(id); }}
 *   />
 */

import { useEffect, useState } from "react";
import { Sparkles, X, ArrowRight } from "lucide-react";
import { OUTREACH_SEQUENCE_PRESETS } from "@/lib/outreach-sequence-presets";

const DISMISS_KEY = "cp_outreach_preset_suggestion_dismissed_v1";

interface OutreachPresetSuggestionBannerProps {
    campaignCount: number;
    onTryPreset: (presetId: string) => void;
}

export default function OutreachPresetSuggestionBanner({
    campaignCount,
    onTryPreset,
}: OutreachPresetSuggestionBannerProps) {
    const [dismissed, setDismissed] = useState(true);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const isDismissed = window.localStorage.getItem(DISMISS_KEY) === "1";
        setDismissed(isDismissed);
    }, []);

    if (campaignCount < 1 || dismissed) return null;

    // Rotate the suggestion based on campaignCount so it's stable per state,
    // not random per render.
    const idx = (campaignCount - 1) % OUTREACH_SEQUENCE_PRESETS.length;
    const suggestion = OUTREACH_SEQUENCE_PRESETS[idx];
    if (!suggestion) return null;

    function handleDismiss() {
        if (typeof window !== "undefined") {
            window.localStorage.setItem(DISMISS_KEY, "1");
        }
        setDismissed(true);
    }

    return (
        <div className="border-t border-slate-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-2.5">
            <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                    <Sparkles className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    <span className="text-slate-700 truncate">
                        <span className="font-medium">Suggested next step:</span>{" "}
                        try the{" "}
                        <span className="font-medium text-blue-700">
                            &ldquo;{suggestion.name}&rdquo;
                        </span>{" "}
                        preset ({suggestion.steps.length} steps, {suggestion.days_duration} days)
                    </span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                        onClick={() => onTryPreset(suggestion.id)}
                        className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 rounded-md"
                    >
                        Try it
                        <ArrowRight className="w-3 h-3" />
                    </button>
                    <button
                        onClick={handleDismiss}
                        className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded"
                        aria-label="Dismiss suggestion"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
        </div>
    );
}
