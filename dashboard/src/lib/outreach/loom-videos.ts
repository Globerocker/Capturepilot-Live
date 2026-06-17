/**
 * Loom videos for the contractor match-drop cold outreach — keyed by the data-gap
 * key that lib/outreach/match-drop.ts (gapCandidates) emits. The cadence picks the
 * video matching the contractor's first/sharpest gap (their `gap_hook`).
 *
 * (Loom auto-generated the share titles; the mapping below is by data gap.)
 */
export const LOOM_BY_GAP: Record<string, { url: string; label: string }> = {
    no_past_performance: { url: "https://www.loom.com/share/bd997c6413b54b82a8e94c77175a88b2", label: "No past performance on the website" },
    no_gov_signal:       { url: "https://www.loom.com/share/8be9145b224e47b9b5ca7dc9fa7ac9f8", label: "No government / federal-work signals on the website" },
    no_certs:            { url: "https://www.loom.com/share/ab2a2c998bb24620a6f8c52a1622f58e", label: "No federal small-business certifications on the website" },
    no_years:            { url: "https://www.loom.com/share/ca4e3cfe57614ae9983e21e06ae7d6e7", label: "Founding year missing on the website" },
    // No "no_naics" gap is emitted today, but the video exists for when we add it.
    no_naics:            { url: "https://www.loom.com/share/fd8ef9a78dfe4050afaeb510be32cd24", label: "No NAICS codes on the website" },
};
