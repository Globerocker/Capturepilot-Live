/**
 * Zod schemas describing the structured output of the Quick Checker.
 *
 * These schemas are used two ways:
 *   1) as a contract for OpenAI Structured Outputs (see extract.ts)
 *   2) as a stable, typed shape for every consumer (API routes, UI, DB writes)
 */

import { z } from "zod";

export const ContactMethod = z.object({
    email: z.string().nullable(),
    phone: z.string().nullable(),
    phone_type: z.enum(["main", "mobile", "fax", "other"]).nullable(),
});
export type ContactMethod = z.infer<typeof ContactMethod>;

export const Person = z.object({
    name: z.string(),
    title: z.string(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    linkedin_url: z.string().nullable(),
    is_decision_maker: z.boolean(),
});
export type Person = z.infer<typeof Person>;

export const ServiceOffering = z.object({
    name: z.string(),
    description: z.string(),
});
export type ServiceOffering = z.infer<typeof ServiceOffering>;

export const CapabilityKeyword = z.object({
    keyword: z.string(),
    tier: z.enum(["primary", "secondary"]),
});
export type CapabilityKeyword = z.infer<typeof CapabilityKeyword>;

export const NaicsGuess = z.object({
    code: z.string(),
    label: z.string(),
    confidence: z.number().min(0).max(1),
    matched_keywords: z.array(z.string()),
    source: z.enum(["sam", "usaspending", "ai", "keyword_fallback"]),
});
export type NaicsGuess = z.infer<typeof NaicsGuess>;

export const CertificationSignal = z.object({
    type: z.enum([
        "SDVOSB", "VOSB", "WOSB", "EDWOSB", "HUBZone", "8(a)", "SDB", "MBE",
        "veteran_owned", "woman_owned", "minority_owned", "small_business",
        "bonding", "iso_9001", "cmmi", "secret_clearance", "top_secret_clearance",
        "other",
    ]),
    evidence: z.string(),
    confidence: z.number().min(0).max(1),
});
export type CertificationSignal = z.infer<typeof CertificationSignal>;

export const Partnership = z.object({
    partner: z.string(),
    kind: z.enum(["customer", "technology_partner", "reseller", "subcontractor", "award", "accreditation"]),
});
export type Partnership = z.infer<typeof Partnership>;

export const QuickCheckerExtraction = z.object({
    company_name: z.string(),
    dba_name: z.string().nullable(),
    tagline: z.string().nullable(),
    short_description: z.string(),
    long_description: z.string(),

    industries_served: z.array(z.string()),
    services: z.array(ServiceOffering),
    products: z.array(z.string()),
    differentiators: z.array(z.string()),

    capability_keywords: z.array(CapabilityKeyword),

    leadership: z.array(Person),
    contacts: z.array(ContactMethod),

    headquarters_city: z.string().nullable(),
    headquarters_state: z.string().nullable(),
    service_areas: z.array(z.string()),

    founded_year: z.number().int().nullable(),
    employee_count_estimate: z.number().int().nullable(),

    certifications: z.array(CertificationSignal),
    partnerships: z.array(Partnership),
    past_customers: z.array(z.string()),
    awards: z.array(z.string()),

    has_gov_experience: z.boolean(),
    gov_experience_evidence: z.array(z.string()),

    social_links: z.object({
        linkedin: z.string().nullable(),
        facebook: z.string().nullable(),
        twitter: z.string().nullable(),
        youtube: z.string().nullable(),
    }),
});
export type QuickCheckerExtraction = z.infer<typeof QuickCheckerExtraction>;

export const QuickCheckerResult = z.object({
    website: z.string(),
    scraped_at: z.string(),
    source: z.enum(["firecrawl", "fetch-fallback", "mixed"]),
    pages_scraped: z.array(z.string()),
    extraction: QuickCheckerExtraction,
    naics_suggestions: z.array(NaicsGuess),
    errors: z.array(z.string()),
    duration_ms: z.number(),
});
export type QuickCheckerResult = z.infer<typeof QuickCheckerResult>;
