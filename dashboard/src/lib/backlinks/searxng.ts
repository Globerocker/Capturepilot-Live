/**
 * Searxng client — privacy-respecting meta-search aggregator.
 *
 * Runs on the Hostinger VPS at https://searxng.srv1113360.hstgr.cloud, gated
 * by Traefik with a bearer token. Lets us discover backlink prospects with
 * organic search results (Google + Bing + DuckDuckGo) instead of being 100%
 * dependent on SEMrush's competitor ref-domain list.
 *
 * Env:
 *   SEARXNG_URL          e.g. https://searxng.srv1113360.hstgr.cloud
 *   SEARXNG_AUTH_TOKEN   bearer token (matches Traefik label)
 */

const SEARXNG_URL = process.env.SEARXNG_URL || null;
const SEARXNG_AUTH_TOKEN = process.env.SEARXNG_AUTH_TOKEN || null;
const SEARXNG_TIMEOUT_MS = 20_000;

export interface SearxResult {
    url: string;
    title: string;
    content: string;
    engine: string;
}

export function isSearxngConfigured(): boolean {
    return !!SEARXNG_URL;
}

export async function searxSearch(
    query: string,
    opts: { limit?: number; categories?: string[] } = {},
): Promise<SearxResult[]> {
    if (!SEARXNG_URL) throw new Error("SEARXNG_URL not configured");
    const params = new URLSearchParams({
        q: query,
        format: "json",
    });
    if (opts.categories?.length) params.set("categories", opts.categories.join(","));

    const headers: Record<string, string> = {};
    if (SEARXNG_AUTH_TOKEN) headers["Authorization"] = `Bearer ${SEARXNG_AUTH_TOKEN}`;

    const res = await fetch(`${SEARXNG_URL}/search?${params}`, {
        headers,
        signal: AbortSignal.timeout(SEARXNG_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`searxng http ${res.status}`);
    const data = (await res.json()) as { results?: SearxResult[] };
    const results = (data.results || []).slice(0, opts.limit || 30);
    return results.map(r => ({
        url: r.url,
        title: r.title || "",
        content: r.content || "",
        engine: r.engine || "",
    }));
}

/**
 * Discover backlink-prospect domains by running a list of organic search
 * queries through Searxng and extracting unique root domains. Caller passes
 * queries like "government procurement intelligence tools" or
 * "[NAICS niche] industry directory list".
 *
 * Returns deduplicated root domains (no path, no protocol) sorted by
 * frequency across queries — domains showing up in multiple SERPs are
 * stronger prospects than one-off hits.
 */
export async function discoverProspectDomains(
    queries: string[],
    opts: { perQuery?: number } = {},
): Promise<Array<{ domain: string; hits: number; sample_url: string }>> {
    const perQuery = opts.perQuery ?? 20;
    const counts = new Map<string, { hits: number; sample_url: string }>();
    for (const q of queries) {
        let results: SearxResult[];
        try {
            results = await searxSearch(q, { limit: perQuery });
        } catch {
            continue;
        }
        for (const r of results) {
            try {
                const host = new URL(r.url).hostname.toLowerCase().replace(/^www\./, "");
                if (!host || host.length < 4) continue;
                const existing = counts.get(host);
                if (existing) existing.hits++;
                else counts.set(host, { hits: 1, sample_url: r.url });
            } catch {
                // skip bad URLs
            }
        }
    }
    return [...counts.entries()]
        .map(([domain, v]) => ({ domain, hits: v.hits, sample_url: v.sample_url }))
        .sort((a, b) => b.hits - a.hits);
}
