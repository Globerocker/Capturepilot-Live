/**
 * Contact-info extraction from free-form opportunity descriptions.
 *
 * State / county / city portals frequently bury the POC email + phone
 * directly in the body text instead of populating structured contact fields
 * (the way SAM.gov does). This module pulls them out with regex + heuristic
 * cleaning so the detail page can show a real "Contact POC" panel for SLED
 * opportunities without paying for an LLM call per row.
 *
 * Inputs are HTML-stripped before matching — RSS feeds often embed `<br>`
 * + `&amp;` etc. which break naive regex. Output is deduped, plain text.
 *
 * Stays purely synchronous + dependency-free so it can run inline during
 * ingestion without slowing the cron loop or in a Vercel cold start.
 */

export interface ExtractedContacts {
    emails: string[];
    phones: string[];
    urls: string[];
}

// Strip HTML tags + decode common entities. We don't need a full HTML parser
// — RSS feeds keep things simple and we only care about the visible text.
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
        .replace(/&#x?([0-9a-f]+);/gi, (_, code) => {
            try { return String.fromCharCode(parseInt(code, /[xX]/.test(_) ? 16 : 10)); }
            catch { return ""; }
        })
        .replace(/[ \t]+/g, " ");
}

// Email regex tuned for "in the wild" RFPs. Skips obvious noise like
// `example@example.com`, `name@domain.com`, image filenames with `@2x.png`.
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

const EMAIL_BLOCKLIST = new Set([
    "example@example.com",
    "name@domain.com",
    "user@example.com",
    "you@yourcompany.com",
    "test@test.com",
    "noreply@noreply.com",
]);

function isPlausibleEmail(e: string): boolean {
    const lo = e.toLowerCase();
    if (EMAIL_BLOCKLIST.has(lo)) return false;
    // RSS feeds sometimes embed image filenames like "logo@2x.png" — skip those.
    if (/\.(png|jpe?g|gif|svg|webp|ico|css|js)$/i.test(lo)) return false;
    // Domain must have at least one dot AND a 2+ letter TLD (already enforced
    // by regex, but defense-in-depth).
    const [, domain] = lo.split("@");
    if (!domain || domain.length < 4) return false;
    return true;
}

// US phone matcher. Accepts +1, parens around area, common separators.
//   (555) 555-5555    555-555-5555    555.555.5555    +1 555 555 5555
//   ext / x / x. allowed but dropped from output.
const PHONE_RE = /(?:\+?1[\s.\-]*)?(?:\(?\b\d{3}\)?[\s.\-]*)\d{3}[\s.\-]*\d{4}\b(?:\s*(?:ext\.?|x)\s*\d{1,5})?/gi;

function normalizePhone(raw: string): string | null {
    const digits = raw.replace(/\D/g, "");
    // Standard US local (10) or +1 prefix (11)
    if (digits.length === 10) {
        return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    if (digits.length === 11 && digits.startsWith("1")) {
        return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    // Things like 12-15 digit "phone-looking" strings — reject (often dates,
    // fax + extension fragments, or solicitation reference numbers).
    return null;
}

// URL matcher. Captures http(s) and bare www., trims trailing punctuation.
const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;

function normalizeUrl(raw: string): string | null {
    let u = raw.replace(/[.,;:!?)\]]+$/, "");
    if (u.startsWith("www.")) u = `https://${u}`;
    try {
        const parsed = new URL(u);
        // Strip pixel/tracking + email-image URLs.
        if (/\.(png|jpe?g|gif|svg|webp|ico|css|js)$/i.test(parsed.pathname)) return null;
        return parsed.toString();
    } catch {
        return null;
    }
}

function uniq<T>(arr: T[]): T[] {
    return Array.from(new Set(arr));
}

export function extractContacts(
    rawText: string | null | undefined,
    options?: { limit?: number },
): ExtractedContacts {
    if (!rawText) return { emails: [], phones: [], urls: [] };
    const limit = options?.limit ?? 10;
    const text = stripHtml(String(rawText));

    const emails = uniq(
        (text.match(EMAIL_RE) || [])
            .map((e) => e.toLowerCase())
            .filter(isPlausibleEmail),
    ).slice(0, limit);

    const phones = uniq(
        (text.match(PHONE_RE) || [])
            .map(normalizePhone)
            .filter((p): p is string => p !== null),
    ).slice(0, limit);

    const urls = uniq(
        (text.match(URL_RE) || [])
            .map(normalizeUrl)
            .filter((u): u is string => u !== null),
    ).slice(0, limit);

    return { emails, phones, urls };
}
