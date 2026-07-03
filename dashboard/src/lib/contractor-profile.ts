/**
 * Contractor profile generation pipeline.
 *
 * For each contractor we want to publish at www.capturepilot.com/contractors/<slug>:
 *   1. Build a kebab-case slug from the business name (dedupe-safe).
 *   2. Aggregate award history from the awards table (top agency, by-year, top NAICS).
 *   3. Enrich the company via Apollo (industry, size, website, linkedin, founded).
 *   4. Generate a 2-3 paragraph AI summary via gpt-4o-mini.
 *   5. Compute the Federal Contracting Score (0-100) + badges.
 *   6. Compute NAICS-rank + state-rank within the published set.
 *   7. Upsert into contractor_profile_pages with is_published=true.
 *
 * Designed to be called from either:
 *   - /api/admin/contractor-profiles/publish — operator bootstrap (top N)
 *   - /api/cron/publish_contractor_page — daily drip (10/day)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    findRecipientHashByUei,
    getRecipientLifetime,
    getSpendingOverTime,
    getSpendingByAgency,
} from "@/lib/usaspending";

export interface ContractorRow {
    uei: string;
    /** Display name. Source col is `company_name` (or `dba_name` fallback). */
    business_name: string;
    primary_naics: string | null;
    state: string | null;
    city: string | null;
    cage_code: string | null;
    sam_registered: boolean | null;
    sba_certifications: string[] | null;
    website: string | null;
}

export interface AwardRollup {
    total_awarded_amount: number;
    total_awards_count: number;
    top_agency: string | null;
    top_agency_amount: number;
    awards_by_year: Array<{ year: number; value: number; count: number }>;
    top_naics_codes: string[];
}

export interface ApolloEnrichment {
    company_website: string | null;
    company_linkedin: string | null;
    company_size_est: string | null;
    industry: string | null;
    founded_year: number | null;
    raw: unknown;
}

// ─── Slug ────────────────────────────────────────────────────────────────────

export function slugify(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80);
}

export async function uniqueSlug(sb: SupabaseClient, base: string, currentUei: string): Promise<string> {
    let candidate = base;
    let i = 2;
    while (true) {
        const { data, error } = await sb
            .from("contractor_profile_pages")
            .select("contractor_uei")
            .eq("slug", candidate)
            .maybeSingle();
        if (error) {
            // Soft-fail: assume the candidate is fine.
            return candidate;
        }
        if (!data || (data as { contractor_uei?: string }).contractor_uei === currentUei) return candidate;
        candidate = `${base}-${i}`;
        i++;
        if (i > 50) return `${base}-${currentUei.slice(0, 6).toLowerCase()}`;
    }
}

// ─── Award rollup ────────────────────────────────────────────────────────────

interface AwardRow {
    awarded_amount: number | null;
    awarding_agency: string | null;
    award_date: string | null;
    naics_code: string | null;
}

export async function buildAwardRollup(
    sb: SupabaseClient,
    uei: string,
    companyName?: string,
): Promise<AwardRollup> {
    const empty: AwardRollup = {
        total_awarded_amount: 0,
        total_awards_count: 0,
        top_agency: null,
        top_agency_amount: 0,
        awards_by_year: [],
        top_naics_codes: [],
    };

    // Step 1 — find the USAspending recipient hash for this UEI by name
    //   search. USAspending has no direct UEI lookup so we search by name +
    //   filter for the exact UEI match (or fall back to first hit).
    let nameToSearch = companyName;
    if (!nameToSearch) {
        const { data } = await sb
            .from("contractors")
            .select("company_name, dba_name")
            .eq("uei", uei)
            .maybeSingle();
        const row = data as { company_name?: string; dba_name?: string } | null;
        nameToSearch = row?.company_name || row?.dba_name || undefined;
    }
    if (!nameToSearch) return empty;

    const recipient = await findRecipientHashByUei({ uei, companyName: nameToSearch });
    if (!recipient) return empty;

    // Step 2 — three parallel calls: lifetime profile, by-year aggregate,
    //   by-agency breakdown. All hit unauthenticated USAspending endpoints
    //   so this is a single ~1-2s burst regardless of award volume.
    const [lifetime, byYear, byAgency] = await Promise.all([
        getRecipientLifetime(recipient.hash),
        getSpendingOverTime({ recipient_id: recipient.hash }),
        getSpendingByAgency({ recipient_id: recipient.hash }),
    ]);

    const total = lifetime?.total_transaction_amount || 0;
    const count = lifetime?.total_transactions || 0;
    const topAgency = byAgency[0];

    // Also dual-write the rollup back into the contractors row so the older
    // enrichment endpoints + scoring still see fresh data without re-calling
    // USAspending themselves. Soft-fail if the row doesn't exist yet.
    try {
        await sb.from("contractors").update({
            federal_awards_count: count,
            total_award_volume: total,
            agency_relationships: byAgency.map((a) => ({ agency: a.agency_name, obligated: a.amount, count: a.count })),
            naics_awards: [], // separate fetch — kept empty here, see below
            last_usaspending_refresh: new Date().toISOString(),
        }).eq("uei", uei);
    } catch {
        // Don't fail the build — the rollup we return downstream is what
        // gets persisted to contractor_profile_pages.
    }

    return {
        total_awarded_amount: total,
        total_awards_count: count,
        top_agency: topAgency?.agency_name || null,
        top_agency_amount: topAgency?.amount || 0,
        awards_by_year: byYear.map((y) => ({ year: y.fiscal_year, value: y.aggregated_amount, count: y.transaction_count || 0 })),
        top_naics_codes: [], // would need separate spending_by_category/naics/ call; out of scope for the rollup
    };
}

// ─── Federal Contracting Score (0-100) + Badges ──────────────────────────────

export interface ScoreResult {
    federal_score: number;
    score_breakdown: { awards: number; certs: number; diversification: number; recency: number; profile: number };
    badges: string[];
}

export function computeFederalScore(args: {
    contractor: ContractorRow;
    rollup: AwardRollup;
    apollo: ApolloEnrichment | null;
}): ScoreResult {
    const { contractor, rollup, apollo } = args;

    // Awards (35 pts): log-scaled — $10K = 5, $100K = 15, $1M = 25, $10M+ = 35.
    let awardsPts = 0;
    if (rollup.total_awarded_amount > 0) {
        awardsPts = Math.min(35, Math.round(Math.log10(Math.max(rollup.total_awarded_amount, 1) / 1000) * 7));
        awardsPts = Math.max(0, awardsPts);
    }

    // Certifications (20 pts): stack premium — 5pts per cert, capped at 20.
    const certs = contractor.sba_certifications || [];
    const certsPts = Math.min(20, certs.length * 5);

    // Diversification (15 pts): distinct agencies sold to. 5pts per agency, cap.
    const diversificationPts = Math.min(15, 0);  // placeholder — needs awarding_agency count

    // Recency (15 pts): years with awards in the last 5.
    const recentYears = rollup.awards_by_year.filter((y) => y.year >= new Date().getFullYear() - 5).length;
    const recencyPts = Math.min(15, recentYears * 3);

    // Profile completeness (15 pts): SAM-registered, website present, founded year, industry.
    let profilePts = 0;
    if (contractor.sam_registered) profilePts += 5;
    if (apollo?.company_website || contractor.website) profilePts += 3;
    if (apollo?.founded_year) profilePts += 3;
    if (apollo?.industry) profilePts += 2;
    if (apollo?.company_size_est) profilePts += 2;

    const federal_score = Math.min(100, awardsPts + certsPts + diversificationPts + recencyPts + profilePts);

    const badges: string[] = [];
    if (certs.includes("SDVOSB") || certs.includes("VOSB")) badges.push("veteran_owned");
    if (certs.includes("8(a)")) badges.push("eight_a");
    if (certs.includes("HUBZone")) badges.push("hubzone");
    if (certs.includes("WOSB") || certs.includes("EDWOSB")) badges.push("woman_owned");
    if (certs.length >= 3) badges.push("multi_cert");
    if (rollup.total_awarded_amount >= 10_000_000) badges.push("ten_million_club");
    if (rollup.total_awarded_amount >= 1_000_000) badges.push("million_dollar_winner");
    if (recentYears >= 3) badges.push("active_bidder");
    if (federal_score >= 80) badges.push("federal_score_a");
    else if (federal_score >= 65) badges.push("federal_score_b");

    return {
        federal_score,
        score_breakdown: {
            awards: awardsPts,
            certs: certsPts,
            diversification: diversificationPts,
            recency: recencyPts,
            profile: profilePts,
        },
        badges,
    };
}

// ─── Apollo enrichment ───────────────────────────────────────────────────────

export async function enrichCompanyViaApollo(args: {
    name: string;
    domain?: string | null;
}): Promise<ApolloEnrichment | null> {
    const apiKey = process.env.APOLLO_API_KEY;
    if (!apiKey) return null;
    try {
        const res = await fetch("https://api.apollo.io/api/v1/organizations/search", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
            body: JSON.stringify({
                q_organization_name: args.name,
                organization_domains: args.domain ? [args.domain] : undefined,
                per_page: 1,
            }),
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) return null;
        const json = await res.json() as { organizations?: Array<Record<string, unknown>> };
        const org = json.organizations?.[0];
        if (!org) return null;
        return {
            company_website: (org.website_url as string) || (org.primary_domain as string) || null,
            company_linkedin: (org.linkedin_url as string) || null,
            company_size_est: (org.estimated_num_employees as string | number)?.toString() || null,
            industry: (org.industry as string) || null,
            founded_year: typeof org.founded_year === "number" ? org.founded_year : null,
            raw: org,
        };
    } catch {
        return null;
    }
}

// ─── AI summary ──────────────────────────────────────────────────────────────
//
// PUBLIC-FACING profile copy — we use the full-quality models (Gemini 1.5 Pro
// PRIMARY, GPT-4o full as fallback). Mini-tier models are reserved for the
// internal keyword extraction where volume is 30k calls and quality matters
// less. Cost: ~$0.001-0.003 per profile, max 500 profiles in the initial
// pilot → ~$1.50.

const AI_PROMPT = `You write concise, factual 2-paragraph company summaries for a federal-contracting directory. The summary should help a procurement officer or potential teaming partner quickly understand who this company is and what they do. Focus on: what services/goods they provide, what kind of customers they serve, what makes them notable. Do NOT make claims unsupported by the input data. Output plain text, no markdown, ~120-180 words total. No headings.`;

function buildSummaryUserPrompt(args: {
    contractor: ContractorRow;
    rollup: AwardRollup;
    apollo: ApolloEnrichment | null;
}): string {
    const certsStr = (args.contractor.sba_certifications || []).join(", ") || "(none listed)";
    const topAgency = args.rollup.top_agency || "(no public award data)";
    const totalK = args.rollup.total_awarded_amount > 0
        ? `$${(args.rollup.total_awarded_amount / 1_000_000).toFixed(2)}M lifetime federal awards`
        : "no federal awards in our public-records snapshot";
    const recentYears = args.rollup.awards_by_year.slice(-3).map((y) => y.year).join(", ");

    return (
        `COMPANY: ${args.contractor.business_name}\n` +
        `LOCATION: ${args.contractor.city || ""}${args.contractor.city && args.contractor.state ? ", " : ""}${args.contractor.state || ""}\n` +
        `PRIMARY NAICS: ${args.contractor.primary_naics || "(unspecified)"}\n` +
        `INDUSTRY: ${args.apollo?.industry || "(not in Apollo)"}\n` +
        `SIZE ESTIMATE: ${args.apollo?.company_size_est || "(not in Apollo)"} employees\n` +
        `FOUNDED: ${args.apollo?.founded_year || "(unknown)"}\n` +
        `SBA CERTIFICATIONS: ${certsStr}\n` +
        `AWARD HISTORY: ${totalK}, top agency ${topAgency}.\n` +
        `RECENT AWARD YEARS: ${recentYears || "(none recent)"}\n` +
        `Write the 2-paragraph summary now. Plain text, no markdown.`
    );
}

async function summaryViaGemini(systemPrompt: string, userPrompt: string): Promise<{ summary: string; model: string } | null> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    try {
        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: systemPrompt }] },
                    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
                    generationConfig: {
                        temperature: 0.4,
                        maxOutputTokens: 400,
                        responseMimeType: "text/plain",
                    },
                }),
                signal: AbortSignal.timeout(20000),
            },
        );
        if (!res.ok) return null;
        const json = await res.json() as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const content = json.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim();
        if (!content) return null;
        return { summary: content, model: "gemini-2.5-flash" };
    } catch {
        return null;
    }
}

async function summaryViaOpenAI(systemPrompt: string, userPrompt: string): Promise<{ summary: string; model: string } | null> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;
    try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "gpt-4o",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt },
                ],
                temperature: 0.4,
                max_tokens: 400,
            }),
            signal: AbortSignal.timeout(20000),
        });
        if (!res.ok) return null;
        const json = await res.json() as { choices?: { message?: { content?: string } }[] };
        const content = json.choices?.[0]?.message?.content?.trim();
        if (!content) return null;
        return { summary: content, model: "gpt-4o" };
    } catch {
        return null;
    }
}

export async function generateAiSummary(args: {
    contractor: ContractorRow;
    rollup: AwardRollup;
    apollo: ApolloEnrichment | null;
    /** Override provider order. Default: Gemini 1.5 Pro PRIMARY, GPT-4o fallback. */
    prefer?: "gemini" | "openai";
}): Promise<{ summary: string; model: string } | null> {
    const userPrompt = buildSummaryUserPrompt(args);
    const order: Array<"gemini" | "openai"> = args.prefer === "openai"
        ? ["openai", "gemini"]
        : ["gemini", "openai"];

    for (const provider of order) {
        const result = provider === "gemini"
            ? await summaryViaGemini(AI_PROMPT, userPrompt)
            : await summaryViaOpenAI(AI_PROMPT, userPrompt);
        if (result) return result;
    }
    return null;
}
