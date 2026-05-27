/**
 * Crawl4AI client — LLM-friendly web crawler (Playwright + extraction
 * pipeline). Returns cleaned markdown + structured data from any URL.
 *
 * Runs on the Hostinger VPS at https://crawl4ai.srv1113360.hstgr.cloud,
 * gated by Traefik with a bearer token. Used as a higher-quality alternative
 * to regex-on-raw-HTML scraping (backlink contact-discovery in particular).
 *
 * Env:
 *   CRAWL4AI_URL          e.g. https://crawl4ai.srv1113360.hstgr.cloud
 *   CRAWL4AI_AUTH_TOKEN   bearer token (matches Traefik label)
 */

const CRAWL4AI_URL = process.env.CRAWL4AI_URL || null;
const CRAWL4AI_AUTH_TOKEN = process.env.CRAWL4AI_AUTH_TOKEN || null;
const CRAWL4AI_TIMEOUT_MS = 45_000;

export interface CrawlResult {
    url: string;
    markdown: string;
    html: string;
    success: boolean;
}

export function isCrawl4aiConfigured(): boolean {
    return !!CRAWL4AI_URL;
}

export async function crawlUrl(
    url: string,
    opts: { waitFor?: string; jsCode?: string; screenshot?: boolean } = {},
): Promise<CrawlResult> {
    if (!CRAWL4AI_URL) throw new Error("CRAWL4AI_URL not configured");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (CRAWL4AI_AUTH_TOKEN) headers["Authorization"] = `Bearer ${CRAWL4AI_AUTH_TOKEN}`;

    const body = {
        urls: [url],
        priority: 10,
        crawler_params: {
            headless: true,
        },
        wait_for: opts.waitFor,
        js_code: opts.jsCode,
        screenshot: opts.screenshot || false,
    };

    const res = await fetch(`${CRAWL4AI_URL}/crawl`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(CRAWL4AI_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`crawl4ai http ${res.status}`);
    const data = (await res.json()) as {
        results?: Array<{ url: string; markdown?: string; html?: string; success?: boolean }>;
    };
    const r = data.results?.[0];
    if (!r) throw new Error("crawl4ai: empty results");
    return {
        url: r.url,
        markdown: r.markdown || "",
        html: r.html || "",
        success: r.success !== false,
    };
}
