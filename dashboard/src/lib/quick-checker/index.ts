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
import { runDeepExtract } from "./deep-extract";
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

    // ── Phase 2 (June 2026 overhaul) ────────────────────────────────────────
    // Replaced the single-page Firecrawl + gpt-4o-mini one-shot with the
    // multi-page deep-extract pipeline. Same return shape so downstream
    // consumers (analyze-company, brand kit, admin enrich) keep working.
    //
    // useLlm=false still routes through the legacy heuristic path — useful
    // for cheap "is this even a website" probes from the admin UI.
    if (opts.useLlm === false) {
        const home = await scrapePage(url, { formats: ["markdown", "links"] });
        if (!home) {
            errors.push("Homepage scrape returned nothing");
            return buildEmptyResult(url, started, errors);
        }
        const { extraction: heur, errors: heurErrs } = await extractStructured({
            website: url,
            metaTitle: home.metadata.title || home.metadata.ogTitle,
            metaDescription: home.metadata.description || home.metadata.ogDescription,
            siteName: home.metadata.ogSiteName,
            markdown: home.markdown.slice(0, 40_000),
        });
        errors.push(...heurErrs);
        if (opts.companyName && opts.companyName.trim().length > 1) {
            heur.company_name = opts.companyName.trim();
        }
        const naicsSuggestions = await inferNaics({
            companyName: heur.company_name || opts.companyName || url,
            extraction: heur,
            pageContent: home.markdown,
            samNaics: opts.samNaics,
            usaSpendingNaics: opts.usaSpendingNaics,
        });
        return {
            website: url,
            scraped_at: new Date().toISOString(),
            source: home.source === "firecrawl" ? "firecrawl" : "fetch-fallback",
            pages_scraped: [home.url],
            extraction: heur,
            naics_suggestions: naicsSuggestions,
            errors,
            duration_ms: Date.now() - started,
            raw_pages: [home],
        };
    }

    // Deep extract — Ollama first, OpenAI fallback. Multi-page crawl.
    const deep = await runDeepExtract({
        website: url,
        companyName: opts.companyName,
        extraPages: opts.extraPages,
        maxPages: opts.maxPages,
    });
    errors.push(...deep.errors);

    const extraction = deep.extraction;

    // The deep extractor scrapes pages internally, so for the legacy
    // raw_pages contract we need to re-fetch what it crawled. Lazy: skip
    // re-scrape and reuse a single homepage fetch for downstream callers
    // that only care about pages_scraped paths + raw markdown for fallback
    // contact-validation. Performance: ~1 extra scrape (~2-4s) but the
    // raw_pages payload is used by 3 routes that expect it.
    const home = await scrapePage(url, { formats: ["markdown", "links"] });
    const rawPages: FirecrawlPage[] = home ? [home] : [];
    const combinedMd = rawPages.map(p => p.markdown).join("\n\n").slice(0, 40_000);

    // Belt-and-suspenders contact overlay even after deep extract — phones
    // in images / footers sometimes miss the LLM but our libphonenumber
    // pass catches them.
    if (rawPages.length > 0) {
        const validPhones = extractPhones(combinedMd);
        const validEmails = extractEmails(combinedMd);
        if (validPhones.length > 0 || validEmails.length > 0) {
            const seenPhones = new Set(extraction.contacts.map(c => (c.phone || "").replace(/\D/g, "")).filter(Boolean));
            const seenEmails = new Set(extraction.contacts.map(c => (c.email || "").toLowerCase()).filter(Boolean));
            for (const p of validPhones) {
                const norm = p.e164.replace(/\D/g, "");
                if (seenPhones.has(norm)) continue;
                extraction.contacts.push({ email: null, phone: p.national, phone_type: p.type === "mobile" ? "mobile" : "main" });
                seenPhones.add(norm);
            }
            for (const e of validEmails) {
                if (seenEmails.has(e.normalized)) continue;
                extraction.contacts.push({ email: e.normalized, phone: null, phone_type: null });
                seenEmails.add(e.normalized);
            }
        }
    }

    const naicsSuggestions = await inferNaics({
        companyName: extraction.company_name || opts.companyName || url,
        extraction,
        pageContent: combinedMd || extraction.long_description,
        samNaics: opts.samNaics,
        usaSpendingNaics: opts.usaSpendingNaics,
    });

    return {
        website: url,
        scraped_at: new Date().toISOString(),
        source: deep.crawl_source,
        pages_scraped: deep.pages_scraped,
        extraction,
        naics_suggestions: naicsSuggestions,
        errors,
        duration_ms: Date.now() - started,
        raw_pages: rawPages,
    };
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
            nail_down_keywords: [],
            strengths: [],
            weaknesses: [],
            pitch_angles: [],
            revenue_signal: null,
            federal_agencies_served: [],
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
        // ── Phase 2 strategic fields — propagate through legacy bridge so
        // analyze-company, HubSpot push, and the /check UI can all read
        // them off `crawlData.*` without breaking existing consumers.
        nail_down_keywords: ex.nail_down_keywords,
        strengths: ex.strengths,
        weaknesses: ex.weaknesses,
        pitch_angles: ex.pitch_angles,
        revenue_signal: ex.revenue_signal,
        federal_agencies_served: ex.federal_agencies_served,
    };
}

// Re-export commonly used pieces
export { QuickCheckerExtraction, QuickCheckerResult } from "./schema";
export type { FirecrawlPage } from "./firecrawl";
export type { InferredNaics } from "./naics";
