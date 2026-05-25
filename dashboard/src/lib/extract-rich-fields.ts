/**
 * Extended extractor — runs alongside extract-contacts.ts to pull richer
 * structured fields out of free-form opportunity descriptions on state /
 * county / city RFPs.
 *
 * Each function is a stand-alone, synchronous, dependency-free regex pass.
 * Designed to run inline during ingestion without blocking the cron loop.
 * Calling code combines them into the row's record.
 *
 * Coverage targets:
 *   - estimated value (single number, range, or "up to N")
 *   - opportunity type signal (prime contract vs subcontracting)
 *   - government office mentions (sub-agency or contracting office text)
 */

export interface RichExtraction {
    estimated_value_min: number | null;
    estimated_value_max: number | null;
    estimated_value_text: string | null;
    is_subcontract: boolean | null;       // true = explicit subcontracting opp, false = explicit prime, null = unknown
    opportunity_class: "prime" | "subcontract" | "teaming" | null;
    government_offices: string[];          // sub-agencies / contracting office names found in text
}

// ───────────────────────────────────────────────────────────────────────────
// Money / value extraction
//
// Patterns we match:
//   $1,234,567        single value
//   $50K  $250k       k-suffix
//   $1.5M  $1.5 million
//   $1.5B  $1.5 billion
//   $50,000-$100,000  range with hyphen
//   $50K to $100K     range with "to"
//   between $50K and $200K
//   up to $1,000,000 / not to exceed $X / NTE $X
//   estimated value of $X / estimate of $X
//
// We discard the unit suffix to a plain integer (50000, 1500000, 1500000000).
// ───────────────────────────────────────────────────────────────────────────

const MONEY_RE = /\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)\s*(k|m|b|thousand|million|billion)?/gi;

function parseMoneyMatch(numStr: string, suffix?: string): number {
    const clean = parseFloat(numStr.replace(/,/g, ""));
    if (!Number.isFinite(clean)) return 0;
    const s = (suffix || "").toLowerCase();
    if (s === "k" || s === "thousand") return clean * 1_000;
    if (s === "m" || s === "million")  return clean * 1_000_000;
    if (s === "b" || s === "billion")  return clean * 1_000_000_000;
    return clean;
}

const RANGE_HINT_RE = /\b(?:between|range\s+of|range:)\s*\$?(\d[\d,.kKmMbB ]*)\s*(?:to|-|–|—|and)\s*\$?(\d[\d,.kKmMbB ]*)/i;
const NTE_RE = /(?:up\s+to|not\s+to\s+exceed|nte|maximum\s+of|maximum\s+amount)\s*[:$\s-]*\$?(\d[\d,.kKmMbB ]*)/i;
const ESTIMATE_RE = /(?:estimated|estimate|approximate(?:ly)?|approx\.?)\s*(?:value|amount|contract|cost)?\s*(?:of|:|at)?\s*\$?(\d[\d,.kKmMbB ]*)/i;

function asNumeric(token: string): number {
    // Strip everything that isn't a digit, dot, or suffix letter
    const m = token.match(/(\d+(?:[,.]?\d+)*)\s*([kKmMbB]?)/);
    if (!m) return 0;
    return parseMoneyMatch(m[1], m[2]);
}

function extractValue(text: string): { min: number | null; max: number | null; raw: string | null } {
    // Range first — most specific signal
    const range = text.match(RANGE_HINT_RE);
    if (range) {
        const a = asNumeric(range[1]);
        const b = asNumeric(range[2]);
        if (a && b) {
            return { min: Math.min(a, b), max: Math.max(a, b), raw: range[0].slice(0, 100) };
        }
    }
    // "Up to" / NTE / Maximum — only an upper bound
    const nte = text.match(NTE_RE);
    if (nte) {
        const v = asNumeric(nte[1]);
        if (v) return { min: null, max: v, raw: nte[0].slice(0, 100) };
    }
    // "Estimated value of $X" — single point
    const est = text.match(ESTIMATE_RE);
    if (est) {
        const v = asNumeric(est[1]);
        if (v) return { min: v, max: v, raw: est[0].slice(0, 100) };
    }
    // Last resort: pick the LARGEST money mention. Avoids picking up filing
    // fees, registration costs, etc. while still catching the headline value.
    let maxVal = 0;
    let maxRaw = "";
    for (const m of text.matchAll(MONEY_RE)) {
        const v = parseMoneyMatch(m[1], m[2]);
        if (v > maxVal) {
            maxVal = v;
            maxRaw = m[0];
        }
    }
    // Cap noise: anything under $1,000 is almost certainly a fee, not the
    // contract value. Anything over $10B is almost certainly a typo.
    if (maxVal >= 1_000 && maxVal < 10_000_000_000) {
        return { min: maxVal, max: maxVal, raw: maxRaw };
    }
    return { min: null, max: null, raw: null };
}

// ───────────────────────────────────────────────────────────────────────────
// Prime vs subcontract classification
// ───────────────────────────────────────────────────────────────────────────

const SUBCONTRACT_PATTERNS = [
    /\bsubcontracting?\s+opportunit(?:y|ies)\b/i,
    /\bsub-?contract\s+to\s+\w+/i,
    /\bteaming\s+opportunit(?:y|ies)?\b/i,
    /\bsought\s+as\s+a\s+sub(?:contractor|-?contractor)?\b/i,
    /\bseeking\s+sub(?:contractor|-?contractor|s)?\b/i,
    /\bprime\s+contractor\s+seeking\b/i,
];

const TEAMING_PATTERNS = [
    /\bteaming\s+partner\b/i,
    /\bjoint\s+venture\s+opportunit(?:y|ies)?\b/i,
    /\bteaming\s+agreement\b/i,
];

const PRIME_PATTERNS = [
    /\bprime\s+contract\b/i,
    /\bdirect\s+award\b/i,
    /\bset[\s-]aside\s+for\s+(?:small|veteran|woman|disadvantaged)/i,
    /\bcontract\s+award\s+vehicle\b/i,
];

function classifyOpportunity(text: string): { is_subcontract: boolean | null; opportunity_class: RichExtraction["opportunity_class"] } {
    if (SUBCONTRACT_PATTERNS.some((re) => re.test(text))) {
        return { is_subcontract: true, opportunity_class: "subcontract" };
    }
    if (TEAMING_PATTERNS.some((re) => re.test(text))) {
        return { is_subcontract: false, opportunity_class: "teaming" };
    }
    if (PRIME_PATTERNS.some((re) => re.test(text))) {
        return { is_subcontract: false, opportunity_class: "prime" };
    }
    return { is_subcontract: null, opportunity_class: null };
}

// ───────────────────────────────────────────────────────────────────────────
// Government office extraction
//
// Looks for typical contracting-office naming patterns: "Department of X",
// "[State/County] Office of X", "Bureau of X", "Division of X", agency-style
// abbreviations followed by capitalized phrase ("NYCHA Procurement Group").
// ───────────────────────────────────────────────────────────────────────────

const OFFICE_PATTERNS = [
    /\b(?:U\.?S\.?\s+)?Department\s+of\s+[A-Z][A-Za-z ,&\-]{2,60}/g,
    /\bOffice\s+of\s+(?:the\s+)?[A-Z][A-Za-z ,&\-]{2,60}/g,
    /\bBureau\s+of\s+[A-Z][A-Za-z ,&\-]{2,60}/g,
    /\bDivision\s+of\s+[A-Z][A-Za-z ,&\-]{2,60}/g,
    /\b[A-Z]{2,6}\s+Procurement\s+(?:Group|Office|Division|Department)\b/g,
    /\bCity\s+of\s+[A-Z][A-Za-z ]{2,40}\s+(?:Procurement|Purchasing|Contracting)/g,
    /\b[A-Z][A-Za-z]+\s+County\s+(?:Procurement|Purchasing|Contracting)/g,
];

function uniq<T>(arr: T[]): T[] { return Array.from(new Set(arr)); }

function extractGovernmentOffices(text: string, limit = 5): string[] {
    const found: string[] = [];
    for (const re of OFFICE_PATTERNS) {
        const matches = text.match(re) || [];
        for (const m of matches) {
            // Tidy whitespace + trailing punctuation
            found.push(m.replace(/\s+/g, " ").replace(/[.,;:]+$/, "").trim());
        }
    }
    return uniq(found)
        .filter((s) => s.length >= 8 && s.length <= 80)   // drop too short / too long
        .slice(0, limit);
}

// ───────────────────────────────────────────────────────────────────────────
// HTML strip — same logic as extract-contacts.ts, kept private here to avoid
// the cross-module import.
// ───────────────────────────────────────────────────────────────────────────

function stripHtml(s: string): string {
    return s
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|tr)>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/g, "'")
        .replace(/[ \t]+/g, " ");
}

// ───────────────────────────────────────────────────────────────────────────
// Top-level entry
// ───────────────────────────────────────────────────────────────────────────

export function extractRichFields(rawText: string | null | undefined): RichExtraction {
    const empty: RichExtraction = {
        estimated_value_min: null,
        estimated_value_max: null,
        estimated_value_text: null,
        is_subcontract: null,
        opportunity_class: null,
        government_offices: [],
    };
    if (!rawText) return empty;
    const text = stripHtml(String(rawText));

    const value = extractValue(text);
    const cls = classifyOpportunity(text);
    const offices = extractGovernmentOffices(text);

    return {
        estimated_value_min: value.min,
        estimated_value_max: value.max,
        estimated_value_text: value.raw,
        is_subcontract: cls.is_subcontract,
        opportunity_class: cls.opportunity_class,
        government_offices: offices,
    };
}
