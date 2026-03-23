/**
 * CheerioCrawler-based company website analyzer.
 * Replaces tools/17_analyze_company.py — native TypeScript, no subprocess.
 *
 * Multi-phase crawl:
 *   Phase 0: Sitemap discovery (pre-crawl)
 *   Phase 1: Homepage crawl + link discovery
 *   Phase 2: Level-1 subpage crawl (sorted by priority)
 *   Phase 3: Level-2 high-priority crawl (score >= 5)
 *   Phase 4: Data extraction from collected HTML
 */

import { CheerioCrawler, Configuration } from "@crawlee/cheerio";
import * as cheerio from "cheerio";
import type { CrawlResult } from "./types";
import { emptyData } from "./types";
import {
    MAX_PAGES, HARD_TIMEOUT_MS, PRIORITY_PAGES, SKIP_EXTENSIONS, USER_AGENT,
} from "./config";
import { isPrivateIp, normalizeUrl } from "./ssrf";
import { discoverSitemapUrls } from "./sitemap";
import {
    extractCompanyName, extractDescription, extractServices, extractContacts,
    extractLocations, detectCertifications, estimateEmployees, extractFoundingYear,
    extractLeadership, extractRevenueSignals, extractPastClients,
    detectUei, detectCageCode, extractLegalInfo, fetchLinkedInData,
} from "./extractors";

// Score a URL path + text against priority patterns
function scorePath(text: string): number {
    let best = 0;
    for (const [pattern, weight] of PRIORITY_PAGES) {
        if (pattern.test(text)) best = Math.max(best, weight);
    }
    return best;
}

// Shared mutable state accumulated during crawl phases
interface CrawlState {
    allTexts: string[];
    allHtmls: string[];
    pagesCrawled: string[];
    crawledUrls: Set<string>;
    discoveredLinks: Map<string, number>; // url -> priority score
    crawlDepth: number;
}

// Create a request handler that writes into shared state
function makeHandler(baseDomain: string, state: CrawlState) {
    return async ({ $, request, body }: { $: cheerio.CheerioAPI; request: { url: string; userData?: Record<string, unknown> }; body: string | Buffer }) => {
        const url = request.url;
        const depth = (request.userData?.depth as number) || 0;
        state.crawlDepth = Math.max(state.crawlDepth, depth);

        // Strip script/style/noscript/iframe
        $("script, style, noscript, iframe").remove();
        const pageText = $("body").text().replace(/\s+/g, " ").trim();

        state.allTexts.push(pageText);
        state.allHtmls.push(typeof body === "string" ? body : body.toString("utf-8"));
        state.pagesCrawled.push(url);
        state.crawledUrls.add(url);

        // Discover internal links
        $("a[href]").each((_i, el) => {
            const href = $(el).attr("href");
            if (!href) return;
            try {
                const absUrl = new URL(href, url).href.split("#")[0].split("?")[0].replace(/\/+$/, "");
                const parsed = new URL(absUrl);

                if (parsed.hostname.toLowerCase() !== baseDomain) return;
                if (state.crawledUrls.has(absUrl) || state.discoveredLinks.has(absUrl)) return;
                if (!["http:", "https:"].includes(parsed.protocol)) return;

                const ext = parsed.pathname.split(".").pop()?.toLowerCase() || "";
                if (SKIP_EXTENSIONS.has(ext)) return;

                const combined = (parsed.pathname + " " + ($(el).text() || "")).toLowerCase();
                let score = scorePath(combined);
                if (score === 0) score = 1;

                const existing = state.discoveredLinks.get(absUrl) || 0;
                state.discoveredLinks.set(absUrl, Math.max(existing, score));
            } catch {
                // Invalid URL
            }
        });
    };
}

export async function analyzeCompany(
    companyName: string,
    website: string,
): Promise<CrawlResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const baseUrl = normalizeUrl(website);
    let baseDomain: string;

    try {
        baseDomain = new URL(baseUrl).hostname.toLowerCase();
    } catch {
        return { success: false, data: emptyData(), errors: ["Invalid URL"] };
    }

    // SSRF check
    if (await isPrivateIp(baseDomain)) {
        return { success: false, data: emptyData(), errors: ["Blocked: private IP address"] };
    }

    // Shared crawl state
    const state: CrawlState = {
        allTexts: [],
        allHtmls: [],
        pagesCrawled: [],
        crawledUrls: new Set(),
        discoveredLinks: new Map(),
        crawlDepth: 0,
    };

    const config = new Configuration({ persistStorage: false });
    const handler = makeHandler(baseDomain, state);

    try {
        // ── Phase 0: Sitemap discovery ────────────────────────────────
        let sitemapUrls: string[] = [];
        try {
            sitemapUrls = await discoverSitemapUrls(baseUrl, baseDomain);
        } catch {
            // Sitemap not available, continue
        }

        // Pre-score sitemap URLs
        for (const url of sitemapUrls) {
            try {
                const path = new URL(url).pathname.toLowerCase();
                const score = scorePath(path);
                if (score > 0) state.discoveredLinks.set(url, score);
            } catch {
                // skip invalid
            }
        }

        // ── Phase 1: Homepage crawl ───────────────────────────────────
        const crawler1 = new CheerioCrawler({
            maxRequestsPerCrawl: 1,
            maxConcurrency: 1,
            requestHandlerTimeoutSecs: 15,
            maxRequestRetries: 1,
            additionalMimeTypes: ["text/plain", "text/xml"],
            async requestHandler(ctx) {
                await handler({
                    $: ctx.$,
                    request: ctx.request,
                    body: ctx.body,
                });
            },
            async failedRequestHandler({ request }, error) {
                errors.push(`Failed to fetch ${request.url}: ${error.message}`);
            },
        }, config);

        await crawler1.run([{ url: baseUrl, userData: { depth: 0 } }]);

        if (state.pagesCrawled.length === 0) {
            return { success: false, data: { ...emptyData(), crawl_duration_ms: Date.now() - startTime }, errors: ["Could not fetch homepage"] };
        }

        // ── Phase 2: Level-1 subpage crawl ────────────────────────────
        const remainingBudget1 = MAX_PAGES - state.pagesCrawled.length;
        if (remainingBudget1 > 0 && Date.now() - startTime < HARD_TIMEOUT_MS - 20_000) {
            const sorted = [...state.discoveredLinks.entries()]
                .filter(([url]) => !state.crawledUrls.has(url))
                .sort((a, b) => b[1] - a[1])
                .slice(0, remainingBudget1);

            if (sorted.length > 0) {
                const crawler2 = new CheerioCrawler({
                    maxRequestsPerCrawl: remainingBudget1,
                    maxConcurrency: 3,
                    requestHandlerTimeoutSecs: 15,
                    maxRequestRetries: 1,
                    additionalMimeTypes: ["text/plain", "text/xml"],
                    async requestHandler(ctx) {
                        await handler({
                            $: ctx.$,
                            request: ctx.request,
                            body: ctx.body,
                        });
                    },
                    async failedRequestHandler({ request }, error) {
                        errors.push(`Failed: ${request.url}: ${error.message}`);
                    },
                }, config);

                await crawler2.run(sorted.map(([url]) => ({
                    url,
                    userData: { depth: 1 },
                })));

                state.crawlDepth = Math.max(state.crawlDepth, 1);
            }
        }

        // ── Phase 3: Level-2 high-priority crawl ──────────────────────
        const remainingBudget2 = MAX_PAGES - state.pagesCrawled.length;
        if (remainingBudget2 > 0 && Date.now() - startTime < HARD_TIMEOUT_MS - 10_000) {
            const level2 = [...state.discoveredLinks.entries()]
                .filter(([url, score]) => !state.crawledUrls.has(url) && score >= 5)
                .sort((a, b) => b[1] - a[1])
                .slice(0, remainingBudget2);

            if (level2.length > 0) {
                const crawler3 = new CheerioCrawler({
                    maxRequestsPerCrawl: remainingBudget2,
                    maxConcurrency: 3,
                    requestHandlerTimeoutSecs: 15,
                    maxRequestRetries: 1,
                    additionalMimeTypes: ["text/plain", "text/xml"],
                    async requestHandler(ctx) {
                        await handler({
                            $: ctx.$,
                            request: ctx.request,
                            body: ctx.body,
                        });
                    },
                    async failedRequestHandler({ request }, error) {
                        errors.push(`Failed: ${request.url}: ${error.message}`);
                    },
                }, config);

                await crawler3.run(level2.map(([url]) => ({
                    url,
                    userData: { depth: 2 },
                })));

                if (level2.length > 0) state.crawlDepth = 2;
            }
        }

        // ── Phase 4: Data extraction ──────────────────────────────────
        const soups = state.allHtmls.map(html => cheerio.load(html));

        const detectedCompanyName = extractCompanyName(soups);
        const description = extractDescription(soups, state.allTexts);
        const services = extractServices(soups, state.allTexts);
        const { locations, states: detectedStates } = extractLocations(state.allTexts);
        const { contacts, socialLinks } = extractContacts(state.allTexts, soups);
        const certifications = detectCertifications(state.allTexts);
        const employeeSignals = estimateEmployees(state.allTexts);
        const foundingYear = extractFoundingYear(state.allTexts);
        const leadership = extractLeadership(state.allTexts, soups);
        const revenueSignals = extractRevenueSignals(state.allTexts);
        const pastClients = extractPastClients(state.allTexts);
        const detectedUei = detectUei(state.allTexts, soups);
        const detectedCageCode = detectCageCode(state.allTexts);
        const legalInfo = extractLegalInfo(state.allTexts, soups);

        const combinedText = state.allTexts.join(" ");
        const allPageText = combinedText.slice(0, 10000);

        // LinkedIn enrichment (best-effort, only if time allows)
        let linkedinData: { description?: string; employee_count?: number; industry?: string } | null = null;
        if (socialLinks.linkedin && Date.now() - startTime < HARD_TIMEOUT_MS - 5000) {
            linkedinData = await fetchLinkedInData(socialLinks.linkedin);
        }

        return {
            success: true,
            data: {
                company_name: detectedCompanyName,
                description,
                services,
                locations,
                detected_states: detectedStates,
                contacts,
                certifications,
                employee_signals: employeeSignals,
                founding_year: foundingYear,
                leadership,
                social_links: socialLinks,
                linkedin_data: linkedinData,
                revenue_signals: revenueSignals,
                past_clients: pastClients,
                detected_uei: detectedUei,
                detected_cage_code: detectedCageCode,
                legal_info: legalInfo,
                all_page_text: allPageText,
                pages_crawled: state.pagesCrawled,
                crawl_duration_ms: Date.now() - startTime,
                crawl_depth: state.crawlDepth,
            },
            errors,
        };

    } catch (err) {
        errors.push(`Crawl error: ${(err as Error).message}`);
        return {
            success: state.pagesCrawled.length > 0,
            data: {
                ...emptyData(),
                pages_crawled: state.pagesCrawled,
                all_page_text: state.allTexts.join(" ").slice(0, 10000),
                crawl_duration_ms: Date.now() - startTime,
                crawl_depth: state.crawlDepth,
            },
            errors,
        };
    }
}
