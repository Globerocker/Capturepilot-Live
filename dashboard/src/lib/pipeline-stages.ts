// Shared pipeline stage config + helpers.
// Users can customize labels + order via `user_profiles.notes` JSON (key: `pipeline_stages`).

export interface PipelineStage {
    key: string;
    label: string;
    color: string;
    dot: string;
}

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
// Notes may be plain text OR JSON containing { pipeline_stages: [{key,label}] }.
// We only let users override label + order; color/dot stay tied to each stage key.
export function parseStagesFromNotes(notes: string | null | undefined): PipelineStage[] {
    if (!notes) return DEFAULT_STAGES;
    const trimmed = notes.trim();
    if (!trimmed.startsWith("{")) return DEFAULT_STAGES;
    try {
        const parsed = JSON.parse(trimmed) as { pipeline_stages?: Array<{ key: string; label?: string }> };
        const override = parsed?.pipeline_stages;
        if (!Array.isArray(override) || override.length === 0) return DEFAULT_STAGES;
        // Preserve ordering supplied by user but enforce defaults for unknown keys.
        const result: PipelineStage[] = [];
        const seen = new Set<string>();
        for (const item of override) {
            const base = DEFAULT_STAGES.find(s => s.key === item.key);
            if (!base) continue;
            result.push({ ...base, label: (item.label && item.label.trim()) || base.label });
            seen.add(item.key);
        }
        // Append any default stage not listed (so users never lose access to a stage).
        for (const base of DEFAULT_STAGES) {
            if (!seen.has(base.key)) result.push(base);
        }
        return result;
    } catch {
        return DEFAULT_STAGES;
    }
}

// Serializes an updated stage list back into the notes JSON, preserving any
// other JSON keys already present.
export function serializeStagesToNotes(notes: string | null | undefined, stages: PipelineStage[]): string {
    const payload = stages.map(s => ({ key: s.key, label: s.label }));
    let base: Record<string, unknown> = {};
    if (notes && notes.trim().startsWith("{")) {
        try {
            base = JSON.parse(notes.trim()) as Record<string, unknown>;
        } catch { base = {}; }
    }
    base.pipeline_stages = payload;
    return JSON.stringify(base);
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
