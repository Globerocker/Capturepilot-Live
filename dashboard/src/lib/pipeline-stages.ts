// Shared pipeline stage config + helpers.
// Users can customize labels + order via `user_profiles.notes` JSON (key: `pipeline_stages`).

export interface PipelineStage {
    key: string;
    label: string;
    color: string;
    dot: string;
    custom?: boolean;      // true when the user added the stage (not one of DEFAULT_STAGES)
}

// Palette for user-added custom stages. Cycles through so each new stage gets
// a distinct visual without needing a color picker in the UI.
export const CUSTOM_STAGE_PALETTE: Array<{ color: string; dot: string }> = [
    { color: "bg-teal-50 border-teal-200 text-teal-700", dot: "bg-teal-500" },
    { color: "bg-pink-50 border-pink-200 text-pink-700", dot: "bg-pink-500" },
    { color: "bg-indigo-50 border-indigo-200 text-indigo-700", dot: "bg-indigo-500" },
    { color: "bg-orange-50 border-orange-200 text-orange-700", dot: "bg-orange-500" },
    { color: "bg-lime-50 border-lime-200 text-lime-700", dot: "bg-lime-500" },
    { color: "bg-cyan-50 border-cyan-200 text-cyan-700", dot: "bg-cyan-500" },
];

export const DEFAULT_STAGES: PipelineStage[] = [
    { key: "discovered", label: "Discovered", color: "bg-stone-100 border-stone-200 text-stone-700", dot: "bg-stone-400" },
    { key: "researching", label: "Researching", color: "bg-blue-50 border-blue-200 text-blue-700", dot: "bg-blue-500" },
    { key: "preparing", label: "Preparing", color: "bg-amber-50 border-amber-200 text-amber-700", dot: "bg-amber-500" },
    { key: "submitted", label: "Submitted", color: "bg-purple-50 border-purple-200 text-purple-700", dot: "bg-purple-500" },
    { key: "awarded", label: "Awarded", color: "bg-emerald-50 border-emerald-200 text-emerald-700", dot: "bg-emerald-500" },
    { key: "lost", label: "Lost", color: "bg-red-50 border-red-200 text-red-700", dot: "bg-red-500" },
    { key: "no_bid", label: "No Bid", color: "bg-stone-50 border-stone-200 text-stone-500", dot: "bg-stone-400" },
];

export const STAGE_TOOLTIPS: Record<string, string> = {
    discovered: "You've identified this opportunity. Next step: research the requirements and assess fit.",
    researching: "Actively reviewing requirements, evaluating competition, and assessing your competitive position.",
    preparing: "Writing your proposal, gathering past performance, and assembling your team.",
    submitted: "Your response has been submitted. Await evaluation results.",
    awarded: "Congratulations! You won this contract.",
    lost: "This bid was not selected. Review the debrief to improve future submissions.",
    no_bid: "You decided not to pursue this opportunity.",
};

export function getStageInfo(stages: PipelineStage[], key: string): PipelineStage {
    return stages.find(s => s.key === key) || DEFAULT_STAGES.find(s => s.key === key) || stages[0] || DEFAULT_STAGES[0];
}

// Extracts a customized stage list from user_profiles.notes (TEXT).
// Notes may be plain text OR JSON containing { pipeline_stages: [{key,label,color?,dot?,custom?}] }.
// Default stages use their baked-in color/dot; custom stages preserve saved color/dot.
export function parseStagesFromNotes(notes: string | null | undefined): PipelineStage[] {
    if (!notes) return DEFAULT_STAGES;
    const trimmed = notes.trim();
    if (!trimmed.startsWith("{")) return DEFAULT_STAGES;
    try {
        const parsed = JSON.parse(trimmed) as { pipeline_stages?: Array<{ key: string; label?: string; color?: string; dot?: string; custom?: boolean }> };
        const override = parsed?.pipeline_stages;
        if (!Array.isArray(override) || override.length === 0) return DEFAULT_STAGES;
        const result: PipelineStage[] = [];
        const seenDefault = new Set<string>();
        let paletteIdx = 0;
        for (const item of override) {
            if (!item.key || typeof item.key !== "string") continue;
            const base = DEFAULT_STAGES.find(s => s.key === item.key);
            if (base) {
                result.push({ ...base, label: (item.label && item.label.trim()) || base.label });
                seenDefault.add(item.key);
            } else {
                // Custom stage — use stored color/dot, or fall back to palette.
                const palette = CUSTOM_STAGE_PALETTE[paletteIdx % CUSTOM_STAGE_PALETTE.length];
                paletteIdx++;
                result.push({
                    key: item.key,
                    label: (item.label && item.label.trim()) || item.key,
                    color: item.color || palette.color,
                    dot: item.dot || palette.dot,
                    custom: true,
                });
            }
        }
        // Append any default stage not listed (so users never lose access to a stage).
        for (const base of DEFAULT_STAGES) {
            if (!seenDefault.has(base.key)) result.push(base);
        }
        return result;
    } catch {
        return DEFAULT_STAGES;
    }
}

// Serializes an updated stage list back into the notes JSON, preserving any
// other JSON keys already present. Custom stages carry their color/dot so they
// survive a reload.
export function serializeStagesToNotes(notes: string | null | undefined, stages: PipelineStage[]): string {
    const payload = stages.map(s => (
        s.custom
            ? { key: s.key, label: s.label, color: s.color, dot: s.dot, custom: true }
            : { key: s.key, label: s.label }
    ));
    let base: Record<string, unknown> = {};
    if (notes && notes.trim().startsWith("{")) {
        try {
            base = JSON.parse(notes.trim()) as Record<string, unknown>;
        } catch { base = {}; }
    }
    base.pipeline_stages = payload;
    return JSON.stringify(base);
}

// Generates a stable, unique stage key from a user-entered label. Falls back
// to a time-based suffix if collisions would occur.
export function generateStageKey(label: string, existingKeys: Set<string>): string {
    const base = label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 24) || "stage";
    if (!existingKeys.has(base)) return base;
    let i = 2;
    while (existingKeys.has(`${base}_${i}`)) i++;
    return `${base}_${i}`;
}

export function getNextStages(stages: PipelineStage[], currentKey: string): string[] {
    // Linear progression up to "submitted", plus conditional finishers.
    const linearKeys = ["discovered", "researching", "preparing", "submitted"];
    const idx = linearKeys.indexOf(currentKey);
    if (idx >= 0 && idx < linearKeys.length - 1) {
        const nextLinear = linearKeys[idx + 1];
        return [nextLinear, "no_bid"].filter(k => stages.some(s => s.key === k));
    }
    if (currentKey === "submitted") {
        return ["awarded", "lost"].filter(k => stages.some(s => s.key === k));
    }
    return [];
}

// Groups the notice_type tab mapping (tab key -> notice_type values considered part of that tab).
export const NOTICE_TYPE_TABS: Array<{ key: string; label: string; matches: (notice: string | null | undefined) => boolean }> = [
    { key: "all", label: "All", matches: () => true },
    {
        key: "sources_sought",
        label: "Sources Sought",
        matches: (n) => !!n && n.toLowerCase().includes("sources sought"),
    },
    {
        key: "presolicitation",
        label: "Pre-Solicitation",
        matches: (n) => !!n && (n.toLowerCase().includes("presolicitation") || n.toLowerCase().includes("pre-solicitation")),
    },
    {
        key: "solicitation",
        label: "Solicitation",
        matches: (n) => {
            if (!n) return false;
            const lower = n.toLowerCase();
            // Exclude presolicitation / sources sought — they have their own tabs.
            if (lower.includes("presolicitation") || lower.includes("pre-solicitation")) return false;
            if (lower.includes("sources sought")) return false;
            return lower.includes("solicitation") || lower.includes("combined");
        },
    },
];
