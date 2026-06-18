/**
 * Deterministic prose-signal extraction for the cockpit enrich crawl.
 *
 * These run over the COMBINED markdown of several crawled pages (homepage +
 * About + Contact) and pull out signals the shallow crawl missed:
 *   - track-record stats ("20+ years experience", "100+ projects")
 *   - years_in_business derived from "NN years" / "since YYYY" / "founded YYYY"
 *   - an explicit legal company name ("Acme LLC", "legally known as …")
 *
 * Everything here is regex/string matching — no LLM, no paid API. Phone, email,
 * and social extraction reuse the existing contacts.ts / website-tech.ts
 * helpers; this module only adds the prose-derived signals.
 */

const CURRENT_YEAR = new Date().getFullYear();

/**
 * Derive years_in_business from prose. Tries, in priority order:
 *   1. an explicit "NN years" claim (cap at 150 to reject "1000 years of …" fluff)
 *   2. "since YYYY" / "founded in YYYY" / "established YYYY" / "est. YYYY"
 * Returns null when nothing credible is found.
 */
export function extractYearsInBusiness(text: string): number | null {
    if (!text) return null;
    const t = text.replace(/\s+/g, " ");

    // 1. "NN years" / "NN+ years" of experience / in business / serving …
    //    Require an experience-ish context word nearby to avoid "5 years ago".
    const yearsRe =
        /\b(\d{1,3})\s*\+?\s*years?\s+(?:of\s+)?(?:experience|expertise|in\s+business|serving|providing|delivering|operating|combined)/gi;
    let m: RegExpExecArray | null;
    let bestYears: number | null = null;
    while ((m = yearsRe.exec(t)) !== null) {
        const n = parseInt(m[1], 10);
        if (n > 0 && n <= 150) bestYears = bestYears === null ? n : Math.max(bestYears, n);
    }
    if (bestYears !== null) return bestYears;

    // 2. "since YYYY" / "founded YYYY" / "established YYYY" / "est. YYYY".
    const yearRe =
        /\b(?:since|founded(?:\s+in)?|established(?:\s+in)?|est\.?|incorporated(?:\s+in)?)\s+((?:18|19|20)\d{2})\b/gi;
    let earliest: number | null = null;
    while ((m = yearRe.exec(t)) !== null) {
        const y = parseInt(m[1], 10);
        if (y >= 1850 && y <= CURRENT_YEAR) earliest = earliest === null ? y : Math.min(earliest, y);
    }
    if (earliest !== null) return CURRENT_YEAR - earliest;

    return null;
}

/**
 * Capture short "track record" stat phrases — e.g. "20+ years experience",
 * "100+ supplier diversity projects", "served 500 clients".
 * Returns a deduped, length-capped list of human-readable snippets.
 */
export function extractTrackRecord(text: string): string[] {
    if (!text) return [];
    const t = text.replace(/\s+/g, " ");
    const out = new Set<string>();

    // "NN+ <noun phrase>" where the noun is an achievement word. Capture a short
    // trailing context (up to ~40 chars) so the stat reads naturally.
    const statRe =
        /\b(\d{1,3}(?:,\d{3})*|\d{1,4})\s*\+?\s*((?:years?|projects?|clients?|customers?|contracts?|employees?|awards?|locations?|states?|agencies|partners?|installations?|deployments?|engagements?)\b[\w\s/&-]{0,40}?)(?=[.,;:!?)]|\sand\s|$)/gi;
    let m: RegExpExecArray | null;
    while ((m = statRe.exec(t)) !== null && out.size < 12) {
        const num = m[1].trim();
        const noun = m[2].trim().replace(/\s+/g, " ");
        const phrase = `${num}+ ${noun}`.replace(/\+\+/, "+").slice(0, 80).trim();
        if (phrase.length > 5) out.add(phrase);
    }

    // "$NN(M|K|B)+ in contracts/revenue/awards" — money-scale track record.
    const moneyRe =
        /\$\s?\d{1,3}(?:[.,]\d{1,3})?\s?(?:million|billion|thousand|[MKB])\+?\s+(?:in\s+)?(?:contracts?|revenue|awards?|sales|projects?|work)/gi;
    while ((m = moneyRe.exec(t)) !== null && out.size < 12) {
        out.add(m[0].replace(/\s+/g, " ").trim().slice(0, 80));
    }

    return [...out];
}

/**
 * Capture an explicit legal company name from prose / footer:
 *   "Acme Paving, LLC", "Globex Inc.", "legally known as Initech Corporation".
 * Only returns a value carrying an entity suffix (LLC/Inc/Corp/…) or an explicit
 * "legally known as / d/b/a" lead-in — never a bare marketing name.
 */
export function extractLegalName(text: string): string | null {
    if (!text) return null;
    const t = text.replace(/\s+/g, " ");

    // 1. Explicit "legally known as / legal name: / d/b/a / doing business as".
    const explicit =
        /(?:legally\s+known\s+as|legal\s+name\s*[:\-]?|registered\s+as|d\/?b\/?a|doing\s+business\s+as)\s+([A-Z][\w&.,'’\- ]{2,70}?(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Co\.?|Company|LP|LLP|PLLC|PC|Ltd\.?|Limited)\b\.?)/i;
    const e = explicit.exec(t);
    if (e) return cleanLegalName(e[1]);

    // 2. A company name immediately followed by an entity suffix.
    const suffix =
        /\b([A-Z][\w&.,'’\- ]{1,60}?\s(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|LLP|PLLC|Ltd\.?|Limited))\b\.?/;
    const s = suffix.exec(t);
    if (s) {
        const candidate = cleanLegalName(s[1]);
        // Reject obvious junk leads ("the LLC", "our LLC", "an Inc").
        if (candidate && !/^(the|our|an|a|this|your)\b/i.test(candidate)) return candidate;
    }

    return null;
}

function cleanLegalName(raw: string): string | null {
    const v = (raw || "")
        .replace(/\s+/g, " ")
        .replace(/^[\s,.\-–—|]+/, "")
        .replace(/[\s,.\-–—|]+$/, "")
        .trim();
    if (v.length < 3 || v.length > 80) return null;
    return v;
}
