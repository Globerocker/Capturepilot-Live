/**
 * Zod schemas describing the structured output of the Quick Checker.
 *
 * These schemas are used two ways:
 *   1) as a contract for OpenAI Structured Outputs (see extract.ts)
 *   2) as a stable, typed shape for every consumer (API routes, UI, DB writes)
 */

import { z } from "zod";

export const ContactMethod = z.object({
    email: z.string().nullable().default(null),
    phone: z.string().nullable().default(null),
    phone_type: z.string().nullable().default(null),
});
export type ContactMethod = z.infer<typeof ContactMethod>;

export const Person = z.object({
    name: z.string(),
    title: z.string().default(""),
    email: z.string().nullable().default(null),
    phone: z.string().nullable().default(null),
    linkedin_url: z.string().nullable().default(null),
    is_decision_maker: z.boolean().default(false),
});
export type Person = z.infer<typeof Person>;

export const ServiceOffering = z.object({
    name: z.string(),
    description: z.string().default(""),
});
export type ServiceOffering = z.infer<typeof ServiceOffering>;

export const CapabilityKeyword = z.object({
    keyword: z.string(),
    tier: z.string().default("secondary"),
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
    type: z.string(),
    evidence: z.string().default(""),
    confidence: z.number().min(0).max(1).default(0.7),
});
export type CertificationSignal = z.infer<typeof CertificationSignal>;

export const Partnership = z.object({
    partner: z.string(),
    kind: z.string().default("customer"),
});
export type Partnership = z.infer<typeof Partnership>;

export const QuickCheckerExtraction = z.object({
    company_name: z.string().default(""),
    dba_name: z.string().nullable().default(null),
    tagline: z.string().nullable().default(null),
    short_description: z.string().default(""),
    long_description: z.string().default(""),

    industries_served: z.array(z.string()).default([]),
    services: z.array(ServiceOffering).default([]),
    products: z.array(z.string()).default([]),
    differentiators: z.array(z.string()).default([]),

    capability_keywords: z.array(CapabilityKeyword).default([]),

    leadership: z.array(Person).default([]),
    contacts: z.array(ContactMethod).default([]),

    headquarters_city: z.string().nullable().default(null),
    headquarters_state: z.string().nullable().default(null),
    service_areas: z.array(z.string()).default([]),

    founded_year: z.number().int().nullable().default(null),
    employee_count_estimate: z.number().int().nullable().default(null),

    certifications: z.array(CertificationSignal).default([]),
    partnerships: z.array(Partnership).default([]),
    past_customers: z.array(z.string()).default([]),
    awards: z.array(z.string()).default([]),

    has_gov_experience: z.boolean().default(false),
    gov_experience_evidence: z.array(z.string()).default([]),

    social_links: z.object({
        linkedin: z.string().nullable().default(null),
        facebook: z.string().nullable().default(null),
        twitter: z.string().nullable().default(null),
        youtube: z.string().nullable().default(null),
    }).default({ linkedin: null, facebook: null, twitter: null, youtube: null }),

    // ── Strategic-positioning fields (added Phase 2 of the QC overhaul).
    //    Surface in HubSpot + on the /check page so a sales rep can open the
    //    contact and have a call-ready POV. Defaults to empty so existing
    //    consumers don't break.

    /** 3-5 most-specific phrases describing what THIS company does.
     *  Drives match scoring + HubSpot custom property `cp_keywords`. */
    nail_down_keywords: z.array(z.string()).default([]),

    /** Why this firm is a strong federal-contracting candidate today.
     *  Each entry is a short, evidence-based phrase
     *  ("Active SAM registration since 2019", "DoD past performance",
     *  "WOSB-certified", "ISO 9001 quality system"). */
    strengths: z.array(z.string()).default([]),

    /** Gaps that will hurt federal pursuit. Each entry pairs a deficiency
     *  with a remediation hint ("No SAM registration — must register before
     *  bidding", "Site lacks past-performance section — add 3 cases"). */
    weaknesses: z.array(z.string()).default([]),

    /** Angles the sales rep should lead with on the discovery call.
     *  Most actionable, prospect-specific framing. Max 5. */
    pitch_angles: z.array(z.string()).default([]),

    /** Free-form revenue signal pulled from the site (e.g. "Forbes 5000",
     *  "$5M+ annual revenue", "Bootstrapped"). null if no hint found. */
    revenue_signal: z.string().nullable().default(null),

    /** Specific federal agencies the company has worked with, named on the
     *  site. Empty if no government past performance mentioned. */
    federal_agencies_served: z.array(z.string()).default([]),
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
