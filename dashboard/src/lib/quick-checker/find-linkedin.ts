/**
 * Best-effort owner/CEO LinkedIn finder. Most contractor sites don't link the
 * owner's personal profile, so we resolve it by searching
 * `"<name>" <company> linkedin` and picking the first /in/ result whose slug
 * contains the person's last name.
 *
 * Two search backends:
 *   1. Brave Web Search API (PRIMARY when BRAVE_SEARCH_API_KEY is set) — keyed,
 *      returns clean JSON, and works from datacenter IPs that DuckDuckGo blocks.
 *   2. DuckDuckGo HTML (FALLBACK / default) — keyless + free, but DDG blocks the
 *      VPS datacenter IP, so it's best-effort.
 *
 * We only resolve the PUBLIC profile URL via a search engine — we never scrape
 * LinkedIn itself. Strict name-matching avoids writing the wrong person, and the
 * same slug matcher runs on both backends.
 */

const DDG_HTML = "https://html.duckduckgo.com/html/";
const BRAVE_WEB_SEARCH = "https://api.search.brave.com/res/v1/web/search";

function decodeMaybe(s: string): string {
    try { return decodeURIComponent(s); } catch { return s; }
}

/** Pull linkedin.com/in/<slug> URLs out of a DDG HTML results page (plain or %-encoded). */
export function parseLinkedInProfiles(html: string): string[] {
    const found = new Set<string>();
    const re = /linkedin\.com(?:%2F|\/)in(?:%2F|\/)([A-Za-z0-9\-_%]+)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
        // Decode, then cut at the first non-slug char (DDG appends &rut=, etc.).
        const slug = decodeMaybe(m[1]).split(/[^A-Za-z0-9\-_]/)[0];
        if (slug && slug.length > 1 && !/^(jobs|company|school|posts)$/i.test(slug)) {
            found.add(`https://www.linkedin.com/in/${slug.toLowerCase()}`);
        }
    }
    return [...found];
}

export interface OwnerLinkedInResult { url: string; confidence: "high" | "medium" }

/**
 * STRICT name → slug matcher shared by both backends. Returns "high" ONLY when
 * the slug unambiguously belongs to this person:
 *   - it contains BOTH the first AND last name (in any order), OR
 *   - it matches an explicit first.last / firstlast pattern.
 * A slug carrying ONLY the last name is "medium" — common surname collisions
 * (e.g. /in/smith) make it untrustworthy. The caller drops everything below
 * "high" to NOT-FOUND. Better not-found than wrong-person.
 */
function matchByName(candidates: string[], tokens: string[]): OwnerLinkedInResult | null {
    if (!candidates.length || tokens.length < 2) return null;
    const first = tokens[0];
    const last = tokens[tokens.length - 1];
    if (first.length < 2 || last.length < 2) return null;
    // Slug-segment forms LinkedIn actually uses: first-last, firstlast, first.last.
    const firstlast = `${first}${last}`;
    const firstDashLast = `${first}-${last}`;
    const lastDashFirst = `${last}-${first}`;
    let medium: string | null = null;
    for (const url of candidates) {
        const slug = (url.split("/in/")[1] || "").replace(/-\d+$/, "").toLowerCase(); // drop trailing -123 disambiguators
        if (!slug) continue;
        // HIGH: both names present, or an unambiguous first/last slug pattern.
        const hasBoth = slug.includes(first) && slug.includes(last);
        const explicitPattern =
            slug === firstlast || slug === firstDashLast || slug === lastDashFirst ||
            slug.startsWith(`${firstDashLast}-`) || slug.startsWith(`${firstlast}-`);
        if (hasBoth || explicitPattern) return { url, confidence: "high" };
        // MEDIUM: last name only — recorded but never returned (see findOwnerLinkedIn).
        if (slug.includes(last)) medium ||= url;
    }
    return medium ? { url: medium, confidence: "medium" } : null;
}

/**
 * STRICT match of a person's name against a set of already-known linkedin.com/in/
 * URLs (e.g. the personal profiles classifySocials() pulled off the contractor's
 * OWN website). Returns the URL ONLY on "high" confidence — both names in the
 * slug. This is the most reliable owner-LinkedIn source: it's the link the
 * company itself published, not a search guess. Better not-found than
 * wrong-person.
 */
export function matchKnownProfileByName(candidates: string[], name: string): string | null {
    const tokens = (name || "").toLowerCase().split(/\s+/).filter(t => /^[a-z][a-z'.-]+$/i.test(t) && t.length > 1);
    if (tokens.length < 2) return null;
    const r = matchByName(candidates, tokens);
    return r && r.confidence === "high" ? r.url : null;
}

/** Brave Web Search backend. Returns matched profile or null on error/empty/no-key. */
async function findViaBrave(
    query: string,
    tokens: string[],
    timeoutMs: number,
): Promise<OwnerLinkedInResult | null> {
    const key = process.env.BRAVE_SEARCH_API_KEY;
    if (!key) return null;
    try {
        const url = `${BRAVE_WEB_SEARCH}?q=${encodeURIComponent(query)}&count=20`;
        const res = await fetch(url, {
            method: "GET",
            headers: {
                "X-Subscription-Token": key,
                "Accept": "application/json",
                "Accept-Encoding": "gzip",
            },
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) return null;
        // Pull /in/ URLs out of the raw JSON text — robust to Brave's nested
        // shape (web.results[].url, .meta_url, etc.) without coupling to it.
        const text = await res.text();
        if (!text) return null;
        const candidates = parseLinkedInProfiles(text);
        return matchByName(candidates, tokens);
    } catch { return null; }
}

/** DuckDuckGo HTML backend (keyless fallback). */
async function findViaDuckDuckGo(
    query: string,
    tokens: string[],
    timeoutMs: number,
): Promise<OwnerLinkedInResult | null> {
    let html = "";
    try {
        const res = await fetch(`${DDG_HTML}?q=${encodeURIComponent(query)}`, {
            method: "GET",
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml",
            },
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok && res.status !== 202) return null;
        html = await res.text();
    } catch { return null; }

    const candidates = parseLinkedInProfiles(html);
    return matchByName(candidates, tokens);
}

export async function findOwnerLinkedIn(
    name: string,
    company: string | null,
    opts: { timeoutMs?: number } = {},
): Promise<OwnerLinkedInResult | null> {
    const cleanName = (name || "").trim();
    const tokens = cleanName.toLowerCase().split(/\s+/).filter(t => /^[a-z][a-z'.-]+$/i.test(t) && t.length > 1);
    if (tokens.length < 2) return null; // need a real first + last name

    const q = `"${cleanName}" ${company || ""} linkedin`.trim();
    const timeoutMs = opts.timeoutMs ?? 15000;

    // Brave is PRIMARY when the key is present. Fall back to DuckDuckGo on any
    // Brave error / empty / missing-key path.
    let result: OwnerLinkedInResult | null = null;
    if (process.env.BRAVE_SEARCH_API_KEY) {
        result = await findViaBrave(q, tokens, timeoutMs);
    }
    if (!result) result = await findViaDuckDuckGo(q, tokens, timeoutMs);

    // STRICT GATE: only return a URL when the slug unambiguously matches BOTH
    // names. Anything "medium"/uncertain → NOT FOUND. We never write a guessed
    // profile. Better not-found than wrong-person.
    if (result && result.confidence === "high") return result;
    return null;
}
