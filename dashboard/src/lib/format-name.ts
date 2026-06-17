/**
 * Person-name title-casing for cockpit lead display.
 *
 * SAM.gov POC names land in our DB as ALL-CAPS ("JOHN SMITH"), occasionally
 * lowercase, sometimes with extra whitespace. Rendering them raw in the cockpit
 * looks like shouting and reads as scraped data. `toTitleCaseName` normalizes
 * a person name to Title Case while leaving the bits that SHOULDN'T be touched
 * alone:
 *   - hyphenated names      → "MARY-JANE" → "Mary-Jane"
 *   - apostrophes           → "O'BRIEN"   → "O'Brien"
 *   - Mc / Mac prefixes     → "MCDONALD"  → "McDonald", "MACARTHUR" → "MacArthur"
 *   - generational suffixes → "II"/"III"/"IV" stay upper-cased
 *   - org suffixes          → "LLC"/"INC"/"LLP" stay upper-cased (POC sometimes
 *                             carries a trailing entity tag we don't want to
 *                             title-case into "Llc")
 *   - collapses runs of whitespace to a single space
 *
 * Pure, no I/O. Returns the input unchanged when it's empty/non-string.
 */

// Suffixes that must stay fully upper-cased rather than title-cased.
const UPPER_SUFFIXES = new Set([
    "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", // generational
    "LLC", "INC", "LLP", "LP", "PC", "PA", "LTD", "CORP",    // org tags
]);

// Lowercased forms that should stay upper when they appear (idempotency: if a
// name was already correct, re-running shouldn't lowercase a known suffix).
const UPPER_SUFFIXES_LC = new Set(Array.from(UPPER_SUFFIXES, (s) => s.toLowerCase()));

/**
 * Title-case one "word" (a whitespace-delimited token). Handles internal
 * separators (hyphen + apostrophe) by recursing on each segment so "MARY-JANE"
 * and "O'BRIEN" each get every segment cased. Mc/Mac get the trailing letter
 * upper-cased ("McDonald", "MacArthur").
 */
function titleCaseWord(word: string): string {
    if (!word) return word;

    // Preserve generational / org suffixes verbatim (upper).
    if (UPPER_SUFFIXES_LC.has(word.toLowerCase())) {
        return word.toUpperCase();
    }

    // Recurse on hyphen segments, rejoining with the hyphen.
    if (word.includes("-")) {
        return word.split("-").map(titleCaseWord).join("-");
    }
    // Recurse on apostrophe segments. Both "'" and the curly "’" are handled.
    if (word.includes("'") || word.includes("’")) {
        // Split keeping the apostrophe so we can rejoin faithfully.
        return word
            .split(/(['’])/)
            .map((seg) => (seg === "'" || seg === "’" ? seg : titleCaseWord(seg)))
            .join("");
    }

    const lower = word.toLowerCase();

    // Mc + capital next letter: "mcdonald" → "McDonald".
    if (lower.length > 2 && lower.startsWith("mc")) {
        return "Mc" + capitalizeFirst(lower.slice(2));
    }
    // Mac + capital next letter: "macarthur" → "MacArthur". Only when there's a
    // meaningful tail (avoid mangling short words like "mac" itself, which we
    // still want as "Mac").
    if (lower.length > 3 && lower.startsWith("mac")) {
        return "Mac" + capitalizeFirst(lower.slice(3));
    }

    return capitalizeFirst(lower);
}

function capitalizeFirst(s: string): string {
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Convert an ALL-CAPS / messy person name to Title Case for display.
 * Returns the input untouched when it isn't a non-empty string.
 */
export function toTitleCaseName(s: string | null | undefined): string | null {
    if (s == null) return null;
    if (typeof s !== "string") return s as unknown as string;
    const trimmed = s.trim();
    if (!trimmed) return trimmed;

    return trimmed
        .split(/\s+/)            // collapse any run of whitespace
        .map(titleCaseWord)
        .join(" ");
}
