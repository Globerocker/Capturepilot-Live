/**
 * Unified Quick Checker pipeline — ONE entry point for all four flows:
 *   1) /api/analyze-company  (public quick-check)
 *   2) /api/admin/enrich-profile  (admin one-click enrich)
 *   3) /api/admin/clients  (invite auto-run)
 *   4) /api/brand  (brand kit extraction)
 *
 * Given a URL + optional company name, returns a fully-structured
 * QuickCheckerResult with a validated extraction, inferred NAICS,
 * validated phone/email contacts and the list of pages that were
 * actually scraped. Errors are collected but never thrown.
 */

import { scrapePage, pickInterestingLinks, scrapePages, type FirecrawlPage } from "./firecrawl";
import { extractStructured } from "./extract";
import { inferNaics, type InferredNaics } from "./naics";
import type { QuickCheckerResult } from "./schema";
import { extractEmails, extractPhones } from "./contacts";

export interface RunQuickCheckOptions {
    companyName?: string;
    samNaics?: string[];
    usaSpendingNaics?: string[];
    /** Additional URLs (e.g. /contact, /about) to scrape beyond what we auto-discover. */
    extraPages?: string[];
    /** Maximum number of pages to scrape (defaults to 5: homepage + 4 discovered). */
    maxPages?: number;
    /** Set to false to skip OpenAI and use heuristics only (cheap path). */
    useLlm?: boolean;
}

export interface RunQuickCheckOutput extends QuickCheckerResult {
    naics_suggestions: InferredNaics[];
    /** Raw scraped pages — caller can persist or reuse. */
    raw_pages: FirecrawlPage[];
}

function normalizeUrl(raw: string): string {
    if (!raw) return "";
    const trimmed = raw.trim();
    if (!/^https?:\/\//i.test(trimmed)) return "https://" + trimmed.replace(/^\/+/, "");
    return trimmed.replace(/\/+$/, "");
}

export async function runQuickCheck(
    website: string,
    opts: RunQuickCheckOptions = {}
): Promise<RunQuickCheckOutput> {
    const started = Date.now();
    const errors: string[] = [];
    const url = normalizeUrl(website);

    if (!url || !/^https?:\/\//.test(url)) {
        errors.push("Invalid URL");
        return buildEmptyResult(website, started, errors);
    }

    // 1) Homepage
    const home = await scrapePage(url, { formats: ["markdown", "links"] });
    if (!home) {
        errors.push("Homepage scrape returned nothing");
        return buildEmptyResult(url, started, errors);
    }

    const maxPages = Math.max(1, Math.min(8, opts.maxPages ?? 5));
    const extra = opts.extraPages || [];
    const autoPicked = pickInterestingLinks(home.links, url, maxPages - 1 - extra.length);
    const picked = [...new Set([...extra.map(normalizeUrl), ...autoPicked])];
    const extraPages = picked.length > 0 ? await scrapePages(picked, { formats: ["markdown"] }) : [];

    const allPages: FirecrawlPage[] = [home, ...extraPages];
    const combinedMd = allPages.map(p => p.markdown).join("\n\n---\n\n").slice(0, 40_000);

    // 2) OpenAI structured extraction on the combined content
    let extraction;
    let extractionErrors: string[] = [];
    if (opts.useLlm === false) {
        // Skip LLM — purely heuristic
        const { extraction: heur, errors: heurErrs } = await extractStructured({
            website: url,
            metaTitle: home.metadata.title || home.metadata.ogTitle,
            metaDescription: home.metadata.description || home.metadata.ogDescription,
            siteName: home.metadata.ogSiteName,
            markdown: combinedMd,
        });
        extraction = heur;
        extractionErrors = heurErrs;
    } else {
        const { extraction: ex, errors: exErrs } = await extractStructured({
            website: url,
            metaTitle: home.metadata.title || home.metadata.ogTitle,
            metaDescription: home.metadata.description || home.metadata.ogDescription,
            siteName: home.metadata.ogSiteName,
            markdown: combinedMd,
        });
        extraction = ex;
        extractionErrors = exErrs;
    }
    errors.push(...extractionErrors);

    // 3) Supplement contacts with libphonenumber + email-addresses validated matches
    //    — the LLM sometimes misses phones inside images/footers but we can still catch them
    const validPhones = extractPhones(combinedMd);
    const validEmails = extractEmails(combinedMd);
    if (validPhones.length > 0 || validEmails.length > 0) {
        const seenPhones = new Set(extraction.contacts.map(c => (c.phone || "").replace(/\D/g, "")).filter(Boolean));
        const seenEmails = new Set(extraction.contacts.map(c => (c.email || "").toLowerCase()).filter(Boolean));
        for (const p of validPhones) {
            const norm = p.e164.replace(/\D/g, "");
            if (seenPhones.has(norm)) continue;
            extraction.contacts.push({
                email: null,
                phone: p.national,
                phone_type: p.type === "mobile" ? "mobile" : "main",
            });
            seenPhones.add(norm);
        }
        for (const e of validEmails) {
            if (seenEmails.has(e.normalized)) continue;
            extraction.contacts.push({
                email: e.normalized,
                phone: null,
                phone_type: null,
            });
            seenEmails.add(e.normalized);
        }
    }

    // 4) Apply explicit company name override if user provided one
    if (opts.companyName && opts.companyName.trim().length > 1) {
        extraction.company_name = opts.companyName.trim();
    }

    // 5) NAICS inference — uses SAM/USASpending + LLM against whitelist
    const naicsSuggestions = await inferNaics({
        companyName: extraction.company_name || opts.companyName || url,
        extraction,
        pageContent: combinedMd,
        samNaics: opts.samNaics,
        usaSpendingNaics: opts.usaSpendingNaics,
    });

    const result: RunQuickCheckOutput = {
        website: url,
        scraped_at: new Date().toISOString(),
        source: allPages.every(p => p.source === "firecrawl")
            ? "firecrawl"
            : allPages.every(p => p.source === "fetch-fallback")
                ? "fetch-fallback"
                : "mixed",
        pages_scraped: allPages.map(p => p.url),
        extraction,
        naics_suggestions: naicsSuggestions,
        errors,
        duration_ms: Date.now() - started,
        raw_pages: allPages,
    };
    return result;
}

function buildEmptyResult(website: string, started: number, errors: string[]): RunQuickCheckOutput {
    return {
        website,
        scraped_at: new Date().toISOString(),
        source: "fetch-fallback",
        pages_scraped: [],
        extraction: {
            company_name: "",
            dba_name: null,
            tagline: null,
            short_description: "",
            long_description: "",
            industries_served: [],
            services: [],
            products: [],
            differentiators: [],
            capability_keywords: [],
            leadership: [],
            contacts: [],
            headquarters_city: null,
            headquarters_state: null,
            service_areas: [],
            founded_year: null,
            employee_count_estimate: null,
            certifications: [],
            partnerships: [],
            past_customers: [],
            awards: [],
            has_gov_experience: false,
            gov_experience_evidence: [],
            social_links: { linkedin: null, facebook: null, twitter: null, youtube: null },
        },
        naics_suggestions: [],
        errors,
        duration_ms: Date.now() - started,
        raw_pages: [],
    };
}

/**
 * Convenience helper — flatten a QuickCheckerResult into the field shape that
 * the existing /api/analyze-company route expects (crawlData + inferredProfile).
 * Used when migrating that route so downstream consumers don't have to change.
 */
export function toLegacyCrawlData(r: RunQuickCheckOutput): Record<string, unknown> {
    const ex = r.extraction;
    const leadership = ex.leadership.map(l => ({
        name: l.name,
        title: l.title,
        email: l.email || undefined,
        phone: l.phone || undefined,
        linkedin_url: l.linkedin_url || undefined,
        is_decision_maker: l.is_decision_maker,
    }));
    const contacts = ex.contacts.map(c => ({
        email: c.email || undefined,
        phone: c.phone || undefined,
    }));
    const services = ex.services.map(s => s.name);
    const locations = ex.headquarters_city || ex.headquarters_state
        ? [{ address: ex.headquarters_city || undefined, state: ex.headquarters_state || undefined }]
        : [];
    const detectedStates = [
        ex.headquarters_state,
        ...ex.service_areas,
    ].filter((v, i, a) => v && a.indexOf(v) === i) as string[];
    const certifications = ex.certifications.map(c => ({
        type: c.type === "veteran_owned" ? "VOSB" : c.type === "woman_owned" ? "WOSB" : c.type,
        confidence: c.confidence,
    }));

    return {
        company_name: ex.company_name,
        description: ex.long_description || ex.short_description,
        services,
        locations,
        detected_states: detectedStates,
        contacts,
        certifications,
        employee_signals: ex.employee_count_estimate ? { estimate: ex.employee_count_estimate, source: "quick-checker" } : null,
        founding_year: ex.founded_year,
        leadership,
        social_links: ex.social_links,
        linkedin_data: null,
        revenue_signals: null,
        past_clients: ex.past_customers,
        past_customers: ex.past_customers,
        project_portfolio: ex.products,
        detected_uei: null,
        detected_cage_code: null,
        legal_info: { legal_name: ex.company_name || undefined },
        all_page_text: r.raw_pages.map(p => p.markdown).join(" ").slice(0, 10000),
        pages_crawled: r.pages_scraped,
        crawl_duration_ms: r.duration_ms,
        crawl_depth: r.pages_scraped.length,
        page_extracts: r.raw_pages.map(p => ({ url: p.url, title: p.metadata.title || "", text: p.markdown.slice(0, 2000) })),
        gov_experience_signals: {
            keywords: ex.gov_experience_evidence,
            hit_count: ex.gov_experience_evidence.length,
            has_gov_experience: ex.has_gov_experience,
        },
        team_size_signal: null,
        // --- New fields unique to the unified pipeline ---
        industries_served: ex.industries_served,
        differentiators: ex.differentiators,
        products: ex.products,
        partnerships: ex.partnerships,
        awards: ex.awards,
        capability_keywords: ex.capability_keywords,
        // NAICS suggestions from the crawler's own gpt-4o-mini run — surfacing
        // these lets the downstream analyze-company route skip its redundant
        // gpt-4o NAICS call (was the #1 bottleneck — 10-25s wasted per analysis).
        naics_suggestions: r.naics_suggestions,
        quick_checker_source: r.source,
        quick_checker_errors: r.errors,
    };
}

// Re-export commonly used pieces
export { QuickCheckerExtraction, QuickCheckerResult } from "./schema";
export type { FirecrawlPage } from "./firecrawl";
export type { InferredNaics } from "./naics";
