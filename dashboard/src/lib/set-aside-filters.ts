// Shared helpers for Set-Aside filtering across Opportunities, Matches,
// and Partners. SAM.gov's `set_aside_code` is a long human-readable string
// ("Indian Small Business Economic Enterprise (ISBEE) Set-Aside ..."), not
// the short codes some pages assume. Each filter value maps to a set of
// case-insensitive substrings that mark a match.

export interface SetAsideOption {
    value: string;                // the <option value=...> we store in UI state
    label: string;                // what renders in the dropdown
    matchSubstrings: string[];    // case-insensitive OR of substrings on set_aside_code
    samBusinessTypeCode?: string; // code to pass to SAM Entity API via sbaBusinessTypeCode
    badgeTone?: "blue" | "emerald" | "violet" | "amber"; // colour for the badge helper
}

export const SET_ASIDE_OPTIONS: SetAsideOption[] = [
    { value: "SBA",        label: "Small Business",        matchSubstrings: ["small business", "sba"],            badgeTone: "blue" },
    { value: "8A",         label: "8(a)",                  matchSubstrings: ["8(a)", "8a ", "8an"],               samBusinessTypeCode: "2X", badgeTone: "blue" },
    { value: "SDVOSB",     label: "SDVOSB",                matchSubstrings: ["sdvosb", "service-disabled"],       samBusinessTypeCode: "QF", badgeTone: "blue" },
    { value: "WOSB",       label: "WOSB",                  matchSubstrings: ["wosb", "women-owned"],              samBusinessTypeCode: "A2", badgeTone: "blue" },
    { value: "HUBZone",    label: "HUBZone",               matchSubstrings: ["hubzone"],                          samBusinessTypeCode: "27", badgeTone: "blue" },
    { value: "VOSB",       label: "VOSB",                  matchSubstrings: ["vosb", "veteran-owned"],            samBusinessTypeCode: "A5", badgeTone: "blue" },
    {
        // Umbrella filter covering tribal/native set-asides — ISBEE, IEE,
        // Alaska Native, Native Hawaiian, Tribally-owned. Matches any of
        // these substrings anywhere in set_aside_code.
        value: "TRIBAL",
        label: "Tribal / Native-Owned",
        matchSubstrings: ["indian", "isbee", "iee", "tribal", "native", "alaska nativ", "anc "],
        samBusinessTypeCode: "XW",
        badgeTone: "violet",
    },
];

export function matchSetAside(setAsideCode: string | null | undefined, filterValue: string): boolean {
    if (!filterValue) return true;
    if (!setAsideCode) return false;
    const opt = SET_ASIDE_OPTIONS.find(o => o.value === filterValue);
    if (!opt) {
        // Legacy path: treat the filter value itself as a substring.
        return setAsideCode.toLowerCase().includes(filterValue.toLowerCase());
    }
    const hay = setAsideCode.toLowerCase();
    return opt.matchSubstrings.some(s => hay.includes(s));
}

// For Supabase server-side filtering using ilike. Returns an `or(...)`
// expression string compatible with .or() that matches any of the
// filter's substrings.
export function buildIlikeFilter(filterValue: string): string | null {
    if (!filterValue) return null;
    const opt = SET_ASIDE_OPTIONS.find(o => o.value === filterValue);
    if (!opt) return null;
    // Each clause: set_aside_code.ilike.%substring%
    return opt.matchSubstrings
        .map(s => `set_aside_code.ilike.%${escapeForOr(s)}%`)
        .join(",");
}

// PostgREST .or() values are comma-separated; escape embedded commas + parens.
function escapeForOr(s: string): string {
    return s.replace(/,/g, "\\,").replace(/[()]/g, "");
}

// Badge helper for rendering a distinct colour for tribal-type set-asides
// on opportunity / partner cards.
export function setAsideBadgeTone(setAsideCode: string | null | undefined): {
    tone: "blue" | "emerald" | "violet" | "amber";
    label: string | null;
} {
    if (!setAsideCode) return { tone: "blue", label: null };
    const hay = setAsideCode.toLowerCase();
    for (const opt of SET_ASIDE_OPTIONS) {
        if (opt.matchSubstrings.some(s => hay.includes(s))) {
            return { tone: opt.badgeTone || "blue", label: opt.label };
        }
    }
    return { tone: "blue", label: null };
}

// Detect whether a set of certifications / business-type strings contains
// a tribal / native marker. Used to render a "Tribal / Native-Owned" label
// on partner cards whose underlying SAM registration flags it.
const TRIBAL_MARKERS = [
    "indian", "tribal", "native american", "alaska native",
    "native hawaiian", "nho", "anc",
];
export function hasTribalMarker(values: (string | null | undefined)[]): boolean {
    for (const v of values) {
        if (!v) continue;
        const lower = v.toLowerCase();
        if (TRIBAL_MARKERS.some(m => lower.includes(m))) return true;
    }
    return false;
}
