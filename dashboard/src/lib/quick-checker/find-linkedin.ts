/**
 * Best-effort owner/CEO LinkedIn finder via DuckDuckGo HTML search (keyless,
 * free). Most contractor sites don't link the owner's personal profile, so we
 * resolve it by searching `"<name>" <company> linkedin` and picking the first
 * /in/ result whose slug contains the person's last name.
 *
 * We only resolve the PUBLIC profile URL via a search engine — we never scrape
 * LinkedIn itself. Strict name-matching avoids writing the wrong person.
 */

const DDG_HTML = "https://html.duckduckgo.com/html/";

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

export async function findOwnerLinkedIn(
    name: string,
    company: string | null,
    opts: { timeoutMs?: number } = {},
): Promise<OwnerLinkedInResult | null> {
    const cleanName = (name || "").trim();
    const tokens = cleanName.toLowerCase().split(/\s+/).filter(t => /^[a-z][a-z'.-]+$/i.test(t) && t.length > 1);
    if (tokens.length < 2) return null; // need a real first + last name

    const q = `"${cleanName}" ${company || ""} linkedin`.trim();
    let html = "";
    try {
        const res = await fetch(`${DDG_HTML}?q=${encodeURIComponent(q)}`, {
            method: "GET",
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml",
            },
            signal: AbortSignal.timeout(opts.timeoutMs ?? 15000),
        });
        if (!res.ok && res.status !== 202) return null;
        html = await res.text();
    } catch { return null; }

    const candidates = parseLinkedInProfiles(html);
    if (!candidates.length) return null;

    const first = tokens[0];
    const last = tokens[tokens.length - 1];
    // Require the last name in the slug; prefer a slug that also has the first.
    let medium: string | null = null;
    for (const url of candidates) {
        const slug = (url.split("/in/")[1] || "").replace(/-\d+$/, ""); // drop trailing -123 disambiguators
        if (last.length > 2 && slug.includes(last)) {
            if (first.length > 1 && slug.includes(first)) return { url, confidence: "high" };
            medium ||= url;
        }
    }
    return medium ? { url: medium, confidence: "medium" } : null;
}
