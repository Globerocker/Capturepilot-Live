/**
 * Firecrawl wrapper for the unified Quick Checker pipeline.
 *
 * Renders JS-heavy sites, returns clean markdown + links + metadata.
 * Falls back to a direct fetch() if Firecrawl is unavailable so the
 * pipeline keeps working offline or without a key.
 */

const FIRECRAWL_URL = "https://api.firecrawl.dev/v2";

export interface FirecrawlPage {
    url: string;
    markdown: string;
    html?: string;
    links: string[];
    metadata: {
        title?: string;
        description?: string;
        ogTitle?: string;
        ogDescription?: string;
        ogSiteName?: string;
        ogImage?: string;
        favicon?: string;
        language?: string;
        sourceURL?: string;
        statusCode?: number;
    };
    source: "firecrawl" | "fetch-fallback";
}

export interface ScrapeOptions {
    formats?: Array<"markdown" | "links" | "html" | "rawHtml">;
    onlyMainContent?: boolean;
    includeTags?: string[];
    excludeTags?: string[];
    waitFor?: number;
    timeout?: number;
}

async function scrapeFirecrawl(url: string, opts: ScrapeOptions = {}): Promise<FirecrawlPage | null> {
    const key = process.env.FIRECRAWL_API_KEY;
    if (!key) return null;

    try {
        const res = await fetch(`${FIRECRAWL_URL}/scrape`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${key}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                url,
                formats: opts.formats ?? ["markdown", "links"],
                onlyMainContent: opts.onlyMainContent ?? true,
                includeTags: opts.includeTags,
                excludeTags: opts.excludeTags,
                waitFor: opts.waitFor,
                timeout: opts.timeout ?? 30000,
            }),
            signal: AbortSignal.timeout((opts.timeout ?? 30000) + 5000),
        });
        if (!res.ok) {
            console.warn(`[firecrawl] ${res.status} ${res.statusText} for ${url}`);
            return null;
        }
        const payload = await res.json();
        const data = payload?.data ?? {};
        return {
            url: data.metadata?.url || data.metadata?.sourceURL || url,
            markdown: String(data.markdown || ""),
            html: data.html || data.rawHtml,
            links: Array.isArray(data.links) ? data.links.map(String) : [],
            metadata: data.metadata || {},
            source: "firecrawl",
        };
    } catch (err) {
        console.warn(`[firecrawl] exception for ${url}:`, err instanceof Error ? err.message : err);
        return null;
    }
}

async function scrapeFallback(url: string): Promise<FirecrawlPage | null> {
    try {
        const res = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; CapturePilot-QuickChecker/1.0)" },
            signal: AbortSignal.timeout(15000),
            redirect: "follow",
        });
        if (!res.ok) return null;
        const html = await res.text();
        // Cheap metadata + text extraction without a full parser
        const title = /<title[^>]*>([^<]+)<\/title>/i.exec(html)?.[1]?.trim() || "";
        const desc = /<meta\s+name=["']description["']\s+content=["']([^"']+)/i.exec(html)?.[1]?.trim() || "";
        const ogTitle = /<meta\s+property=["']og:title["']\s+content=["']([^"']+)/i.exec(html)?.[1]?.trim() || "";
        const ogDesc = /<meta\s+property=["']og:description["']\s+content=["']([^"']+)/i.exec(html)?.[1]?.trim() || "";
        const ogSite = /<meta\s+property=["']og:site_name["']\s+content=["']([^"']+)/i.exec(html)?.[1]?.trim() || "";
        const markdown = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 30000);
        return {
            url,
            markdown,
            html,
            links: [],
            metadata: {
                title,
                description: desc,
                ogTitle,
                ogDescription: ogDesc,
                ogSiteName: ogSite,
                statusCode: res.status,
                sourceURL: url,
            },
            source: "fetch-fallback",
        };
    } catch {
        return null;
    }
}

/** Scrape a single URL — Firecrawl first, fetch fallback if the key/service is unavailable. */
export async function scrapePage(url: string, opts: ScrapeOptions = {}): Promise<FirecrawlPage | null> {
    const fc = await scrapeFirecrawl(url, opts);
    if (fc && fc.markdown.length > 200) return fc;
    // If Firecrawl returned a tiny result, try the fallback to compare
    const fallback = await scrapeFallback(url);
    if (!fc) return fallback;
    if (!fallback) return fc;
    return fallback.markdown.length > fc.markdown.length * 1.5 ? fallback : fc;
}

/** Scrape a small set of additional pages (e.g. /contact, /about, /team) for deeper signals. */
export async function scrapePages(urls: string[], opts: ScrapeOptions = {}): Promise<FirecrawlPage[]> {
    const limited = urls.slice(0, 5);
    const results = await Promise.all(limited.map(u => scrapePage(u, opts).catch(() => null)));
    return results.filter((r): r is FirecrawlPage => r !== null);
}

/** Heuristic — given a list of links, pick the highest-signal ones (contact, about, team, services). */
export function pickInterestingLinks(links: string[], baseUrl: string, max = 4): string[] {
    const base = new URL(baseUrl);
    const scored: Array<{ url: string; score: number }> = [];
    const seen = new Set<string>();

    for (const raw of links) {
        let u: URL;
        try { u = new URL(raw, baseUrl); } catch { continue; }
        if (u.hostname !== base.hostname) continue;
        const key = u.origin + u.pathname;
        if (seen.has(key)) continue;
        seen.add(key);
        const path = u.pathname.toLowerCase();

        let score = 0;
        if (/\/contact\b/.test(path)) score += 10;
        if (/\/about\b/.test(path)) score += 8;
        if (/\/team\b|\/leadership\b|\/people\b|\/who-we-are\b/.test(path)) score += 7;
        if (/\/services\b|\/capabilities\b|\/what-we-do\b|\/solutions\b/.test(path)) score += 6;
        if (/\/case-studies\b|\/customers\b|\/clients\b|\/portfolio\b/.test(path)) score += 5;
        if (/\/careers\b|\/blog\b|\/news\b|\/press\b/.test(path)) score += 2;
        if (score === 0) continue;
        scored.push({ url: u.origin + u.pathname, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, max).map(s => s.url);
}
