/**
 * Simple fetch+cheerio company website crawler.
 * Uses plain HTTP requests instead of CheerioCrawler for Vercel compatibility.
 *
 * Multi-phase crawl:
 *   Phase 0: Sitemap discovery (pre-crawl)
 *   Phase 1: Homepage crawl + link discovery
 *   Phase 2: Subpage crawl (sorted by priority)
 *   Phase 3: Data extraction from collected HTML
 */

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
    extractPastCustomers, extractProjectPortfolio, detectGovExperience,
    inferTeamSizeSignal, extractPageSummary,
} from "./extractors";

// Score a URL path + text against priority patterns
function scorePath(text: string): number {
    let best = 0;
    for (const [pattern, weight] of PRIORITY_PAGES) {
        if (pattern.test(text)) best = Math.max(best, weight);
    }
    return best;
}

// Fetch a single page, return HTML or null
async function fetchPage(url: string, timeoutMs: number = 10_000): Promise<string | null> {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch(url, {
            headers: {
                "User-Agent": USER_AGENT,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.5",
            },
            redirect: "follow",
            signal: controller.signal,
        });

        clearTimeout(timer);

        if (!response.ok) return null;

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("text/html") && !contentType.includes("text/plain") && !contentType.includes("application/xhtml")) {
            return null;
        }

        return await response.text();
    } catch {
        return null;
    }
}

// Parse HTML, extract text and discover links
function processPage(
    html: string,
    pageUrl: string,
    baseDomain: string,
    crawledUrls: Set<string>,
    discoveredLinks: Map<string, number>,
): { text: string; $: cheerio.CheerioAPI } {
    const $ = cheerio.load(html);

    // Strip script/style/noscript/iframe
    $("script, style, noscript, iframe").remove();
    const pageText = $("body").text().replace(/\s+/g, " ").trim();

    // Discover internal links
    $("a[href]").each((_i, el) => {
        const href = $(el).attr("href");
        if (!href) return;
        try {
            const absUrl = new URL(href, pageUrl).href.split("#")[0].split("?")[0].replace(/\/+$/, "");
            const parsed = new URL(absUrl);

            if (parsed.hostname.toLowerCase() !== baseDomain) return;
            if (crawledUrls.has(absUrl) || discoveredLinks.has(absUrl)) return;
            if (!["http:", "https:"].includes(parsed.protocol)) return;

            const ext = parsed.pathname.split(".").pop()?.toLowerCase() || "";
            if (SKIP_EXTENSIONS.has(ext)) return;

            const combined = (parsed.pathname + " " + ($(el).text() || "")).toLowerCase();
            let score = scorePath(combined);
            if (score === 0) score = 1;

            const existing = discoveredLinks.get(absUrl) || 0;
            discoveredLinks.set(absUrl, Math.max(existing, score));
        } catch {
            // Invalid URL
        }
    });

    return { text: pageText, $ };
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
    const allTexts: string[] = [];
    const allHtmls: string[] = [];
    const pagesCrawled: string[] = [];
    const pageExtracts: Array<{ url: string; title: string; text: string }> = [];
    const crawledUrls = new Set<string>();
    const discoveredLinks = new Map<string, number>();
    let crawlDepth = 0;

    try {
        // ── Phase 0: Sitemap discovery ────────────────────────────────
        try {
            const sitemapUrls = await discoverSitemapUrls(baseUrl, baseDomain);
            for (const url of sitemapUrls) {
                try {
                    const path = new URL(url).pathname.toLowerCase();
                    const score = scorePath(path);
                    if (score > 0) discoveredLinks.set(url, score);
                } catch { /* skip */ }
            }
        } catch { /* sitemap not available */ }

        // ── Phase 1: Homepage crawl ───────────────────────────────────
        const homepageHtml = await fetchPage(baseUrl, 15_000);

        if (!homepageHtml) {
            return {
                success: false,
                data: { ...emptyData(), crawl_duration_ms: Date.now() - startTime },
                errors: ["Could not fetch homepage"],
            };
        }

        crawledUrls.add(baseUrl);
        allHtmls.push(homepageHtml);
        pagesCrawled.push(baseUrl);

        const { text: homeText, $: home$ } = processPage(homepageHtml, baseUrl, baseDomain, crawledUrls, discoveredLinks);
        allTexts.push(homeText);
        try {
            const summary = extractPageSummary(home$);
            if (summary.text.length > 0 || summary.title.length > 0) {
                pageExtracts.push({ url: baseUrl, title: summary.title, text: summary.text });
            }
        } catch { /* best-effort */ }

        // ── Phase 2: Subpage crawl (sorted by priority) ──────────────
        const remainingBudget = MAX_PAGES - pagesCrawled.length;
        if (remainingBudget > 0 && Date.now() - startTime < HARD_TIMEOUT_MS - 15_000) {
            const sorted = [...discoveredLinks.entries()]
                .filter(([url]) => !crawledUrls.has(url))
                .sort((a, b) => b[1] - a[1])
                .slice(0, remainingBudget);

            // Fetch subpages concurrently (3 at a time)
            const CONCURRENCY = 3;
            for (let i = 0; i < sorted.length; i += CONCURRENCY) {
                if (Date.now() - startTime > HARD_TIMEOUT_MS - 10_000) break;

                const batch = sorted.slice(i, i + CONCURRENCY);
                const results = await Promise.allSettled(
                    batch.map(([url]) => fetchPage(url, 10_000))
                );

                for (let j = 0; j < batch.length; j++) {
                    const [url] = batch[j];
                    const result = results[j];

                    if (result.status === "fulfilled" && result.value) {
                        crawledUrls.add(url);
                        allHtmls.push(result.value);
                        pagesCrawled.push(url);

                        const { text, $: page$ } = processPage(result.value, url, baseDomain, crawledUrls, discoveredLinks);
                        allTexts.push(text);
                        try {
                            const summary = extractPageSummary(page$);
                            if (summary.text.length > 0 || summary.title.length > 0) {
                                pageExtracts.push({ url, title: summary.title, text: summary.text });
                            }
                        } catch { /* best-effort */ }
                        crawlDepth = Math.max(crawlDepth, 1);
                    } else {
                        errors.push(`Failed: ${url}`);
                    }
                }
            }
        }

        // ── Phase 3: Data extraction ──────────────────────────────────
        const soups = allHtmls.map(html => cheerio.load(html));

        const detectedCompanyName = extractCompanyName(soups);
        const description = extractDescription(soups, allTexts);
        const services = extractServices(soups, allTexts);
        const { locations, states: detectedStates } = extractLocations(allTexts);
        const { contacts, socialLinks } = extractContacts(allTexts, soups);
        const certifications = detectCertifications(allTexts);
        const employeeSignals = estimateEmployees(allTexts);
        const foundingYear = extractFoundingYear(allTexts);
        const leadership = extractLeadership(allTexts, soups);
        const revenueSignals = extractRevenueSignals(allTexts);
        const pastClients = extractPastClients(allTexts);
        const detectedUei = detectUei(allTexts, soups);
        const detectedCageCode = detectCageCode(allTexts);
        const legalInfo = extractLegalInfo(allTexts, soups);
        // Enhanced insights
        const pastCustomers = extractPastCustomers(allTexts, soups);
        const projectPortfolio = extractProjectPortfolio(allTexts, soups);
        const govExperienceSignals = detectGovExperience(allTexts);
        const teamSizeSignal = inferTeamSizeSignal(allTexts, employeeSignals);

        const combinedText = allTexts.join(" ");
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
                pages_crawled: pagesCrawled,
                crawl_duration_ms: Date.now() - startTime,
                crawl_depth: crawlDepth,
                page_extracts: pageExtracts,
                past_customers: pastCustomers,
                project_portfolio: projectPortfolio,
                gov_experience_signals: govExperienceSignals,
                team_size_signal: teamSizeSignal,
            },
            errors,
        };

    } catch (err) {
        errors.push(`Crawl error: ${(err as Error).message}`);
        return {
            success: pagesCrawled.length > 0,
            data: {
                ...emptyData(),
                pages_crawled: pagesCrawled,
                all_page_text: allTexts.join(" ").slice(0, 10000),
                crawl_duration_ms: Date.now() - startTime,
                crawl_depth: crawlDepth,
            },
            errors,
        };
    }
}
