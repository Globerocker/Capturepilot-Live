/**
 * Deterministic capability-keyword derivation.
 *
 * Most contractors in the DB were imported via CSV or crawled by the Quick
 * Checker without the structured-extraction step ever populating
 * capability_summary_ai.services / .strengths / .capability_keywords. The
 * result: the Keywords tab in the Sales Cockpit shows empty for ~1/3 of the
 * lead queue even though we always know the firm's NAICS codes.
 *
 * NAICS industry titles are a clean, free, deterministic keyword source —
 * "561720" → "Janitorial Services" → ["janitorial services", "janitorial"].
 * This module turns resolved NAICS labels (and any real services/strengths we
 * do have) into a deduped keyword list so the tab is never empty.
 *
 * It takes ALREADY-RESOLVED label strings rather than codes so the same
 * function works against the small in-app NAICS_LABELS map (live fallback,
 * common codes) and the full naics_codes DB table (backfill, every code).
 */

// Generic words that carry no signal as a standalone capability keyword.
const STOP_PHRASES = new Set([
    "services",
    "service",
    "all other",
    "other",
    "n e c",
    "nec",
    "general",
    "and related structures construction",
]);

// Trailing boilerplate to strip from a NAICS title before we keep it.
const TRAILING_NOISE = /(,?\s*(except|including|and related[^,]*|n\.?e\.?c\.?)\b.*)$/i;

function clean(s: string): string {
    return s
        .replace(/\([^)]*\)/g, " ") // drop parentheticals
        .replace(/[^a-zA-Z0-9 &/\-]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

/**
 * Turn a single human label ("Electrical Contractors and Other Wiring
 * Installation Contractors") into one or more keyword phrases.
 */
function phrasesFromLabel(label: string): string[] {
    if (!label) return [];
    // Strip a leading "123456 — " code prefix if present, then trailing noise.
    let l = label.replace(/^\s*\d{2,6}\s*[—\-:]\s*/, "");
    l = l.replace(TRAILING_NOISE, "");
    const full = clean(l);
    if (!full) return [];

    const out: string[] = [];
    if (!STOP_PHRASES.has(full)) out.push(full);

    // Break "X and Y", "X, Y" into component phrases so a multi-trade title
    // yields each trade as its own searchable keyword.
    for (const part of full.split(/\s*(?:,| and | & |\/)\s*/)) {
        const p = part.trim();
        if (!p || STOP_PHRASES.has(p)) continue;
        const words = p.split(" ");
        if (words.length >= 1 && words.length <= 4 && p !== full) out.push(p);
    }
    return out;
}

export interface DeriveKeywordsInput {
    /** Resolved NAICS industry titles (NOT codes). Pass [] if none. */
    naicsLabels?: (string | null | undefined)[];
    /** Resolved PSC titles. Optional. */
    pscLabels?: (string | null | undefined)[];
    /** Real services we already extracted (object {name} or string). */
    services?: unknown;
    /** Real strengths/differentiators we already extracted. */
    strengths?: unknown;
    /** Keywords we already have (kept first, deduped). */
    existing?: (string | null | undefined)[];
    /** Cap on returned keywords. Default 14. */
    max?: number;
}

function toNameArray(v: unknown): string[] {
    if (!Array.isArray(v)) return [];
    return v
        .map((item) => {
            if (typeof item === "string") return item;
            if (item && typeof item === "object") {
                const o = item as Record<string, unknown>;
                return typeof o.name === "string"
                    ? o.name
                    : typeof o.title === "string"
                        ? o.title
                        : "";
            }
            return "";
        })
        .filter(Boolean);
}

/**
 * Build a deduped, display-cased keyword list. Existing/real keywords lead;
 * NAICS-derived phrases fill in so the result is never empty when we know an
 * industry.
 */
export function deriveCapabilityKeywords(input: DeriveKeywordsInput): string[] {
    const max = input.max ?? 14;
    const ordered: string[] = [];
    const seen = new Set<string>();

    const push = (raw: string) => {
        const k = clean(raw);
        if (!k || STOP_PHRASES.has(k) || seen.has(k)) return;
        seen.add(k);
        ordered.push(k);
    };

    // 1) Real, already-known keywords first.
    for (const e of input.existing || []) if (e) push(e);
    // 2) Real extracted services / strengths.
    for (const s of toNameArray(input.services)) push(s);
    for (const s of toNameArray(input.strengths)) push(s);
    // 3) NAICS-derived phrases (the reliable backbone).
    for (const label of input.naicsLabels || []) {
        if (!label) continue;
        for (const p of phrasesFromLabel(label)) push(p);
    }
    // 4) PSC-derived phrases.
    for (const label of input.pscLabels || []) {
        if (!label) continue;
        for (const p of phrasesFromLabel(label)) push(p);
    }

    return ordered.slice(0, max);
}
