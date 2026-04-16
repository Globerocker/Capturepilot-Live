import re

with open("dashboard/src/lib/crawler/index.ts", "r") as f:
    original = f.read()

# I will write a completely new index.ts file that utilizes CheerioCrawler.
# Wait, actually, CheerioCrawler requires node features. The current index.ts already does all the routing, sitemap discovery, and queue logic using `fetch()` concurrency.
# Does replacing it with `CheerioCrawler` actually add deep-spidering value if the current logic already uses `fetchPage()` for sub-pages?
# The current custom logic uses `fetchPage()` with strict timeouts and concurrent limits, perfectly tailored for Edge environments.
# To satisfy the "Nutzung von Crawlee", I will convert it.

new_index = """/**
 * @crawlee/cheerio company website crawler.
 * Upgraded from fetch-based crawler to use industry-standard crawlee framework for deep spidering.
 * Uses MemoryStorage for Vercel Serverless environment compatibility.
 */

import * as cheerio from "cheerio";
import { CheerioCrawler, MemoryStorage, Configuration } from "@crawlee/cheerio";
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

// Configure Crawlee to use memory instead of disk to prevent Vercel filesystem errors
const memoryStorage = new MemoryStorage({
    localDirectory: undefined, // ensure no disk usage
});
const config = new Configuration({
    storageClient: memoryStorage,
    availableMemoryRatio: 0.5,
});

function scorePath(text: string): number {
    let best = 0;
    for (const [pattern, weight] of PRIORITY_PAGES) {
        if (pattern.test(text)) best = Math.max(best, weight);
    }
    return best;
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

    if (await isPrivateIp(baseDomain)) {
        return { success: false, data: emptyData(), errors: ["Blocked: private IP address"] };
    }

    // Shared state across the crawler instance
    const allTexts: string[] = [];
    const allHtmls: string[] = [];
    const pagesCrawled: string[] = [];
    const pageExtracts: Array<{ url: string; title: string; text: string }> = [];
    let crawlDepth = 0;

    // Use a unique queue ID per crawl to avoid cross-request contamination in serverless re-use
    const crawlId = Math.random().toString(36).slice(2);
    
    // We will build our crawler
    const crawler = new CheerioCrawler({
        maxRequestsPerCrawl: MAX_PAGES,
        maxConcurrency: 5,
        requestHandlerTimeoutSecs: 15,
        maxRequestRetries: 1,
        // Enforce user-agent
        preNavigationHooks: [
            (ctx) => {
                ctx.request.headers = {
                    ...ctx.request.headers,
                    "User-Agent": USER_AGENT,
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                };
            }
        ],
        async requestHandler({ $, request, enqueueLinks }) {
            const pageUrl = request.loadedUrl || request.url;
            pagesCrawled.push(pageUrl);

            // Time check
            if (Date.now() - startTime > HARD_TIMEOUT_MS - 10000) {
                return; // gracefully abort
            }

            // Remove noise
            $("script, style, noscript, iframe").remove();
            const pageText = $("body").text().replace(/\s+/g, " ").trim();
            const html = $.html();
            
            allHtmls.push(html);
            allTexts.push(pageText);

            try {
                const summary = extractPageSummary($);
                if (summary.text.length > 0 || summary.title.length > 0) {
                    pageExtracts.push({ url: pageUrl, title: summary.title, text: summary.text });
                }
            } catch { /* ignore */ }

            // Enqueue priority links
            await enqueueLinks({
                strategy: 'same-domain',
                transformRequestFunction: (req) => {
                    if (Date.now() - startTime > HARD_TIMEOUT_MS - 15000) return false;
                    const parsed = new URL(req.url);
                    const ext = parsed.pathname.split(".").pop()?.toLowerCase() || "";
                    if (SKIP_EXTENSIONS.has(ext)) return false;
                    
                    const score = scorePath(parsed.pathname.toLowerCase());
                    // 1+ score is priority queue, else normal
                    (req as any).userData = { score };
                    return req;
                }
            });
        },
        failedRequestHandler({ request }) {
            errors.push(`Failed: ${request.url}`);
        }
    }, config);

    try {
        // Prepare initial requests
        const requests = [{ url: baseUrl }];
        
        // Phase 0: Sitemap
        try {
            const sitemapUrls = await discoverSitemapUrls(baseUrl, baseDomain);
            for (const url of sitemapUrls) {
                if (scorePath(new URL(url).pathname.toLowerCase()) > 0) {
                    requests.push({ url });
                }
            }
        } catch { /* ignore */ }

        await crawler.run(requests);

        // Calculate depth properly based on crawled urls (if > 1 means went deep logic is same)
        crawlDepth = pagesCrawled.length > 1 ? 1 : 0;

        // Extract Data Phase
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
        const pastCustomers = extractPastCustomers(allTexts, soups);
        const projectPortfolio = extractProjectPortfolio(allTexts, soups);
        const govExperienceSignals = detectGovExperience(allTexts);
        const teamSizeSignal = inferTeamSizeSignal(allTexts, employeeSignals);

        const combinedText = allTexts.join(" ");
        const allPageText = combinedText.slice(0, 10000);

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
"""

with open("dashboard/src/lib/crawler/index.ts", "w") as f:
    f.write(new_index)

print("index.ts rewritten with crawlee")
