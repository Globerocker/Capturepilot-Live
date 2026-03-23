/**
 * Sitemap + robots.txt URL discovery.
 * Ported from tools/17_analyze_company.py lines 236-282.
 */

import { USER_AGENT, MAX_RESPONSE_SIZE } from "./config";

export async function discoverSitemapUrls(
    baseUrl: string,
    baseDomain: string,
): Promise<string[]> {
    const parsed = new URL(baseUrl);
    const origin = `${parsed.protocol}//${parsed.host}`;
    const urls: string[] = [];

    const sitemapUrlsToTry = [
        `${origin}/sitemap.xml`,
        `${origin}/sitemap_index.xml`,
    ];

    // Check robots.txt for sitemap references
    try {
        const resp = await fetch(`${origin}/robots.txt`, {
            headers: { "User-Agent": USER_AGENT },
            signal: AbortSignal.timeout(5000),
        });
        if (resp.ok) {
            const text = await resp.text();
            for (const line of text.split("\n")) {
                if (line.toLowerCase().startsWith("sitemap:")) {
                    const sitemapUrl = line.split(":").slice(1).join(":").trim();
                    if (sitemapUrl && !sitemapUrlsToTry.includes(sitemapUrl)) {
                        sitemapUrlsToTry.unshift(sitemapUrl);
                    }
                }
            }
        }
    } catch {
        // robots.txt not available, continue
    }

    // Try first 2 sitemap sources
    for (const sitemapUrl of sitemapUrlsToTry.slice(0, 2)) {
        try {
            const resp = await fetch(sitemapUrl, {
                headers: { "User-Agent": USER_AGENT },
                signal: AbortSignal.timeout(5000),
            });
            if (!resp.ok) continue;

            const content = (await resp.text()).slice(0, MAX_RESPONSE_SIZE);
            const locMatches = content.matchAll(/<loc>\s*(.*?)\s*<\/loc>/gi);

            for (const match of locMatches) {
                const loc = match[1].trim();
                try {
                    const parsedLoc = new URL(loc);
                    if (parsedLoc.hostname.toLowerCase() === baseDomain) {
                        const clean = loc.split("#")[0].split("?")[0].replace(/\/+$/, "");
                        urls.push(clean);
                    }
                } catch {
                    // Invalid URL in sitemap, skip
                }
            }

            if (urls.length > 0) break; // Got URLs from first successful sitemap
        } catch {
            continue;
        }
    }

    // Dedupe, cap at 50
    return [...new Set(urls)].slice(0, 50);
}
