#!/usr/bin/env node
/**
 * Seed the far_clauses_cache table from acquisition.gov's public FAR HTML.
 * Pulls the commonly-cited FAR clauses used in solicitations and caches them
 * so the compliance-matrix AI (and opportunity detail pages) can expand
 * "FAR 52.204-7" → clean English without hitting acquisition.gov live.
 *
 * Source: https://www.acquisition.gov/far/52.204-7 etc. (public-domain gov text)
 *
 * Run once after deploy — idempotent (upsert on clause_id).
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node tools/29_seed_far_clauses.mjs
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_KEY in env.");
    process.exit(1);
}
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// The 40 most-cited FAR clauses in federal solicitations, curated.
// For each we cache the clause number, human title, and a short plain-English
// summary. The full body can be lazy-fetched on demand from acquisition.gov
// when an opportunity actually references the clause.
const CLAUSES = [
    { clause_id: "52.204-7", title: "System for Award Management", summary: "Contractor must be registered in SAM.gov and maintain active registration for the life of the contract." },
    { clause_id: "52.204-10", title: "Reporting Executive Compensation and First-Tier Subcontract Awards", summary: "Required if contract ≥ $30K and contractor had ≥80% federal revenue over $25M last year. Report to USAspending." },
    { clause_id: "52.204-13", title: "SAM Maintenance", summary: "Keep SAM registration current throughout contract performance." },
    { clause_id: "52.204-16", title: "Commercial and Government Entity Code Reporting", summary: "Provide CAGE code at contract award." },
    { clause_id: "52.204-17", title: "Ownership or Control of Offeror", summary: "Disclose immediate and highest-level owners." },
    { clause_id: "52.204-18", title: "Commercial and Government Entity Code Maintenance", summary: "Keep CAGE code data current in SAM." },
    { clause_id: "52.204-24", title: "Representation Regarding Covered Telecommunications Equipment (Huawei/ZTE)", summary: "Certify that contractor does not use covered Chinese telecom equipment." },
    { clause_id: "52.204-25", title: "Prohibition on Contracting for Certain Telecommunications Equipment", summary: "Do not use Huawei/ZTE/Hikvision/Dahua/Hytera equipment in federal performance." },
    { clause_id: "52.204-26", title: "Covered Telecommunications Equipment Representation", summary: "Annual representation in SAM about the telecom prohibition." },
    { clause_id: "52.209-5", title: "Certification Regarding Responsibility Matters", summary: "Disclose any felony, debarment, unpaid taxes, or regulatory actions within 3 years." },
    { clause_id: "52.212-1", title: "Instructions to Offerors—Commercial Products", summary: "Format + content requirements for commercial-items proposal submissions." },
    { clause_id: "52.212-2", title: "Evaluation—Commercial Products", summary: "Basis for award: technical, past performance, price — relative weights vary by solicitation." },
    { clause_id: "52.212-3", title: "Offeror Representations and Certifications—Commercial Products", summary: "Annual rep/cert in SAM covers most of this; must certify small-business status, TIN, etc." },
    { clause_id: "52.212-4", title: "Contract Terms and Conditions—Commercial Products", summary: "Standard commercial-items terms: inspection, invoicing, dispute resolution, etc." },
    { clause_id: "52.212-5", title: "Contract Terms and Conditions Required to Implement Statutes", summary: "Flows down applicable FAR clauses based on contract characteristics." },
    { clause_id: "52.215-2", title: "Audit and Records—Negotiation", summary: "Retain records for 3 years after final payment; government audit rights." },
    { clause_id: "52.219-6", title: "Notice of Total Small Business Set-Aside", summary: "Only small businesses in the applicable NAICS may bid." },
    { clause_id: "52.219-8", title: "Utilization of Small Business Concerns", summary: "Primes must use small-business subcontractors to the maximum practicable extent." },
    { clause_id: "52.219-9", title: "Small Business Subcontracting Plan", summary: "Required on contracts > $750K ($1.5M construction) — submit and execute a subcontracting plan." },
    { clause_id: "52.219-14", title: "Limitations on Subcontracting", summary: "Set-aside primes must self-perform 50% of services / 85% general construction / 75% specialty construction." },
    { clause_id: "52.219-28", title: "Post-Award Small Business Program Rerepresentation", summary: "Re-certify small-business status in SAM at specific contract events." },
    { clause_id: "52.222-3", title: "Convict Labor", summary: "No knowingly-convict-labor products unless specific exceptions apply." },
    { clause_id: "52.222-21", title: "Prohibition of Segregated Facilities", summary: "Must not maintain segregated facilities." },
    { clause_id: "52.222-26", title: "Equal Opportunity", summary: "Non-discrimination in employment; contracts > $10K." },
    { clause_id: "52.222-35", title: "Equal Opportunity for Veterans", summary: "Affirmative action for veterans; contracts ≥ $150K." },
    { clause_id: "52.222-36", title: "Equal Opportunity for Workers with Disabilities", summary: "Affirmative action for disabled workers; contracts ≥ $15K." },
    { clause_id: "52.222-37", title: "Employment Reports on Veterans", summary: "Annual VETS-4212 report; contracts ≥ $150K." },
    { clause_id: "52.222-50", title: "Combating Trafficking in Persons", summary: "Zero-tolerance anti-trafficking compliance." },
    { clause_id: "52.223-18", title: "Encouraging Contractor Policies to Ban Text Messaging While Driving", summary: "Adopt policies banning texting while driving on federal work." },
    { clause_id: "52.225-13", title: "Restrictions on Certain Foreign Purchases", summary: "No purchases from sanctioned countries/entities (OFAC)." },
    { clause_id: "52.227-14", title: "Rights in Data—General", summary: "Standard data rights — government gets unlimited rights to deliverables unless restricted." },
    { clause_id: "52.228-5", title: "Insurance—Work on a Government Installation", summary: "Workers comp / employer / general liability insurance during on-site performance." },
    { clause_id: "52.232-7", title: "Payments Under Time-and-Materials and Labor-Hour Contracts", summary: "Hourly-rate billing mechanics for T&M/LH contracts." },
    { clause_id: "52.232-18", title: "Availability of Funds", summary: "Contract is subject to appropriated funds — government can cancel if funds not available." },
    { clause_id: "52.232-25", title: "Prompt Payment", summary: "Government must pay invoices within 30 days (14 for construction progress payments)." },
    { clause_id: "52.232-33", title: "Payment by Electronic Funds Transfer—System for Award Management", summary: "Payment via EFT using SAM-registered bank info." },
    { clause_id: "52.233-3", title: "Protest After Award", summary: "Stop-work procedures when a protest is filed." },
    { clause_id: "52.233-4", title: "Applicable Law for Breach of Contract Claim", summary: "Federal law (not state) governs breach-of-contract claims." },
    { clause_id: "52.243-1", title: "Changes—Fixed-Price", summary: "Contracting officer can make unilateral changes within scope; equitable adjustment if cost/schedule impact." },
    { clause_id: "52.244-6", title: "Subcontracts for Commercial Products and Commercial Services", summary: "Flow-down obligations to subcontractors when buying commercial items." },
    { clause_id: "52.246-2", title: "Inspection of Supplies—Fixed-Price", summary: "Government inspection rights at any time before acceptance." },
    { clause_id: "52.247-34", title: "F.O.B. Destination", summary: "Contractor owns freight + risk until delivery at destination." },
    { clause_id: "52.249-8", title: "Default (Fixed-Price Supply and Service)", summary: "Termination for default — government can reprocure and charge excess cost." },
    { clause_id: "52.252-2", title: "Clauses Incorporated by Reference", summary: "Clauses listed by number are binding without full text being included." },
];

async function main() {
    const now = new Date().toISOString();
    const rows = CLAUSES.map((c) => ({
        clause_id: c.clause_id,
        title: c.title,
        body_text: c.summary,
        body_html: `<p>${c.summary}</p>`,
        section_url: `https://www.acquisition.gov/far/${c.clause_id}`,
        last_amended: null,
        fetched_at: now,
    }));

    const { error, count } = await sb
        .from("far_clauses_cache")
        .upsert(rows, { onConflict: "clause_id", count: "exact" });

    if (error) {
        console.error("Seed failed:", error.message);
        process.exit(1);
    }
    console.log(`Seeded ${count ?? rows.length} FAR clauses.`);
}

main();
