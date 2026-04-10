import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { classifyNaics } from "@/lib/naics-classifier";
import { NAICS_CODES } from "@/lib/naics-codes";
import { scoreOpportunityLeadMagnet, type ProfileForScoring, type OpportunityForScoring } from "@/lib/match-scoring";
import { generateCertRecommendations } from "@/lib/cert-recommendations";
import { analyzeCompany } from "@/lib/crawler";

export const maxDuration = 120;

const SAM_API_KEY = process.env.SAM_API_KEY || "";
const SAM_ENTITY_URL = "https://api.sam.gov/entity-information/v3/entities";

const APOLLO_API_KEY = process.env.APOLLO_API_KEY || "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
function sanitizeCompanyName(name: string): string {
    return name.replace(/<[^>]*>/g, "").trim().substring(0, 200);
}

function isValidUrl(url: string): boolean {
    try {
        const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
        return ["http:", "https:"].includes(parsed.protocol);
    } catch {
        return false;
    }
}

function normalizeUrl(url: string): string {
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
        url = "https://" + url;
    }
    return url.replace(/\/+$/, "");
}

function makeDb() {
    return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

// ---------------------------------------------------------------------------
// SAM.gov ENTITY LOOKUP (reuses logic from /api/sam/entity)
// ---------------------------------------------------------------------------
async function lookupSamEntity(uei: string) {
    if (!SAM_API_KEY) return null;

    try {
        const params = new URLSearchParams({
            ueiSAM: uei.trim().toUpperCase(),
            registrationStatus: "A",
            includeSections: "entityRegistration,coreData,assertions,pointsOfContact",
            api_key: SAM_API_KEY,
        });

        const response = await fetch(`${SAM_ENTITY_URL}?${params.toString()}`, {
            headers: { "X-Api-Key": SAM_API_KEY },
        });

        if (!response.ok) return null;

        const data = await response.json();
        const entities = (data.entityData || []) as Array<Record<string, unknown>>;
        if (entities.length === 0) return null;

        const entity = entities[0];
        const reg = (entity.entityRegistration || {}) as Record<string, unknown>;
        const coreData = (entity.coreData || {}) as Record<string, unknown>;
        const entityInfo = (coreData.entityInformation || {}) as Record<string, unknown>;
        const physicalAddr = (coreData.physicalAddress || {}) as Record<string, unknown>;
        const mailingAddr = (coreData.mailingAddress || {}) as Record<string, unknown>;
        const addr = Object.keys(physicalAddr).length > 0 ? physicalAddr : mailingAddr;

        const assertions = (entity.assertions || {}) as Record<string, unknown>;
        const goodsAndServices = (assertions.goodsAndServices || {}) as Record<string, unknown>;
        const naicsList = (goodsAndServices.naicsList || []) as Array<Record<string, unknown>>;
        const naicsCodes = naicsList.map(n => String(n.naicsCode || "")).filter(c => c.length > 0);

        const businessTypes = ((reg.businessTypes as string[]) || []).join(" ").toLowerCase();
        const sbaList = ((goodsAndServices.sbaBusinessTypeList || []) as Array<Record<string, unknown>>)
            .map(s => String(s.sbaBusinessTypeDesc || "").toLowerCase());
        const typeStr = [businessTypes, ...sbaList].join(" ");

        const certs: string[] = [];
        if (typeStr.includes("8(a)") || typeStr.includes("8a")) certs.push("8(a)");
        if (typeStr.includes("hubzone")) certs.push("HUBZone");
        if (typeStr.includes("service-disabled") || typeStr.includes("sdvosb")) certs.push("SDVOSB");
        if (typeStr.includes("women-owned") || typeStr.includes("wosb")) certs.push("WOSB");
        if (typeStr.includes("veteran-owned")) certs.push("VOSB");

        const pocs = (entity.pointsOfContact || {}) as Record<string, unknown>;
        const govPoc = (pocs.governmentBusinessPOC || {}) as Record<string, unknown>;
        const elecPoc = (pocs.electronicBusinessPOC || {}) as Record<string, unknown>;

        // Extract key account holder from SAM.gov POC data
        const pocEntries: { name: string; title: string; email?: string; phone?: string }[] = [];
        for (const [pocType, poc] of Object.entries(pocs)) {
            if (!poc || typeof poc !== "object") continue;
            const p = poc as Record<string, unknown>;
            const firstName = String(p.firstName || "").trim();
            const lastName = String(p.lastName || "").trim();
            const fullName = [firstName, lastName].filter(Boolean).join(" ");
            if (fullName.length < 3) continue;
            const title = String(p.title || pocType.replace(/POC$/i, "").replace(/([A-Z])/g, " $1").trim() || "");
            pocEntries.push({
                name: fullName,
                title,
                email: String(p.USPhoneExtension ? "" : p.emailAddress || "").trim() || undefined,
                phone: String(p.USPhoneNumber || "").trim() || undefined,
            });
        }

        return {
            uei: String(reg.ueiSAM || ""),
            cage_code: String(reg.cageCode || ""),
            company_name: String(reg.legalBusinessName || ""),
            dba_name: String(reg.dbaName || ""),
            address_line_1: String(addr.addressLine1 || ""),
            city: String(addr.city || ""),
            state: String(addr.stateOrProvinceCode || ""),
            zip_code: String(addr.zipCode || ""),
            website: String(entityInfo.entityURL || reg.entityURL || ""),
            phone: String(govPoc.USPhoneNumber || elecPoc.USPhoneNumber || ""),
            naics_codes: naicsCodes,
            sba_certifications: certs,
            points_of_contact: pocEntries,
        };
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// SAM.gov COMPANY NAME SEARCH — find UEI by company name
// ---------------------------------------------------------------------------
async function searchSamByName(companyName: string): Promise<string | null> {
    if (!SAM_API_KEY || !companyName || companyName.length < 3) return null;

    try {
        const params = new URLSearchParams({
            legalBusinessName: companyName,
            registrationStatus: "A",
            includeSections: "entityRegistration",
            api_key: SAM_API_KEY,
        });

        const response = await fetch(`${SAM_ENTITY_URL}?${params.toString()}`, {
            headers: { "X-Api-Key": SAM_API_KEY },
        });

        if (!response.ok) return null;

        const data = await response.json();
        const entities = (data.entityData || []) as Array<Record<string, unknown>>;
        if (entities.length === 0) return null;

        // Return the UEI of the first (best) match
        const reg = (entities[0].entityRegistration || {}) as Record<string, unknown>;
        const uei = String(reg.ueiSAM || "");
        return uei.length === 12 ? uei : null;
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// COMPANY SUMMARY GENERATION
// ---------------------------------------------------------------------------
async function generateSummary(
    companyName: string,
    description: string,
    services: string[],
    certifications: { type: string }[],
): Promise<string> {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
        // Fallback: construct a basic summary without AI
        const parts = [description];
        if (services.length > 0) parts.push(`Services include: ${services.slice(0, 5).join(", ")}.`);
        if (certifications.length > 0) parts.push(`Certifications: ${certifications.map(c => c.type).join(", ")}.`);
        return parts.filter(Boolean).join(" ").substring(0, 500);
    }

    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${openaiKey}`,
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [{
                    role: "user",
                    content: `Write a concise 2-3 sentence company summary for "${companyName}" based on this data. Focus on: what they do, industries served, and government contracting relevance. Be professional.

Description: ${description}
Services: ${services.join(", ")}
Certifications: ${certifications.map(c => c.type).join(", ")}`,
                }],
                max_tokens: 200,
                temperature: 0.3,
            }),
        });

        if (!response.ok) return description.substring(0, 500);
        const data = await response.json();
        return data.choices?.[0]?.message?.content?.trim() || description.substring(0, 500);
    } catch {
        return description.substring(0, 500);
    }
}

// ---------------------------------------------------------------------------
// INFER NAICS VIA OPENAI
// ---------------------------------------------------------------------------
async function inferNaicsOpenAI(
    companyName: string,
    description: string,
    services: string[],
    pageContent: string
): Promise<string[]> {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) return [];

    const text = `Company: ${companyName}\nDescription: ${description}\nServices: ${services.join(", ")}\nContent Text:\n${pageContent.substring(0, 3000)}`;

    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${openaiKey}`,
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: `You are an expert government contracting assistant. Analyze the company profile and return a JSON array containing the 3-5 most relevant 6-digit NAICS codes for this business. Return ONLY a valid JSON array of strings (e.g. ["123456", "654321"]). Do not include code blocks or markdown.`
                    },
                    {
                        role: "user",
                        content: text
                    }
                ],
                max_tokens: 150,
                temperature: 0.1,
            }),
            signal: AbortSignal.timeout(20000),
        });

        if (!response.ok) return [];
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content?.trim() || "[]";

        // Clean markdown backticks if returned anyway
        const cleanContent = content.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
        const parsed = JSON.parse(cleanContent);
        if (Array.isArray(parsed)) {
            return parsed.map(c => String(c).trim()).filter(c => c.length === 6);
        }
    } catch (e) {
        console.error("OpenAI NAICS inference failed:", e instanceof Error ? e.message : String(e));
        return [];
    }
    return [];
}

// ---------------------------------------------------------------------------
// APOLLO PEOPLE ENRICHMENT — enrich decision-maker with mobile/direct email
// ---------------------------------------------------------------------------
async function enrichPersonApollo(
    firstName: string,
    lastName: string,
    domain: string,
    organizationName?: string,
): Promise<{ mobile_phone?: string; direct_phone?: string; email?: string; linkedin_url?: string; title?: string } | null> {
    if (!APOLLO_API_KEY || !firstName || !lastName) return null;

    try {
        const payload: Record<string, unknown> = {
            first_name: firstName,
            last_name: lastName,
        };
        if (domain) payload.domain = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
        if (organizationName) payload.organization_name = organizationName;

        const res = await fetch("https://api.apollo.io/api/v1/people/match", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Api-Key": APOLLO_API_KEY,
            },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            console.warn(`Apollo people/match ${res.status}: ${res.statusText}`);
            return null;
        }

        const data = await res.json();
        const person = data.person;
        if (!person) return null;

        const phones = (person.phone_numbers || []) as Array<{ sanitized_number?: string; type?: string }>;
        const mobile = phones.find(p => p.type === "mobile")?.sanitized_number;
        const directPhone = phones.find(p => p.type === "work_direct" || p.type === "direct")?.sanitized_number;

        return {
            mobile_phone: mobile || undefined,
            direct_phone: directPhone || (person.phone_number ? String(person.phone_number) : undefined),
            email: person.email ? String(person.email) : undefined,
            linkedin_url: person.linkedin_url ? String(person.linkedin_url) : undefined,
            title: person.title ? String(person.title) : undefined,
        };
    } catch (e) {
        console.warn("Apollo people enrichment error:", e);
        return null;
    }
}

// ---------------------------------------------------------------------------
// USASpending ENRICHMENT — enhanced with UEI-based lookup
// ---------------------------------------------------------------------------
interface UsaSpendingData {
    award_count: number;
    total_value: number;
    agencies: string[];
    naics_from_awards: string[];
    last_award_date: string | null;
    last_award_title: string | null;
    last_award_amount: number | null;
    last_award_agency: string | null;
    top_awards: { title: string; amount: number; agency: string; date: string }[];
    searched_by: "uei" | "name";
}

async function lookupUsaSpending(companyName: string, uei?: string): Promise<UsaSpendingData | null> {
    try {
        // Prefer UEI-based search (more precise) over name search
        const searchText = uei && uei.length === 12 ? uei : companyName;
        const searchedBy = uei && uei.length === 12 ? "uei" as const : "name" as const;

        const response = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                filters: {
                    recipient_search_text: [searchText],
                    time_period: [{ start_date: "2015-01-01", end_date: new Date().toISOString().split("T")[0] }],
                    award_type_codes: ["A", "B", "C", "D", "IDV_A", "IDV_B", "IDV_B_A", "IDV_B_B", "IDV_B_C", "IDV_C", "IDV_D", "IDV_E"],
                },
                fields: ["Award ID", "Recipient Name", "Award Amount", "Awarding Agency", "NAICS Code", "Start Date", "End Date", "Description"],
                limit: 100,
                page: 1,
                sort: "Start Date",
                order: "desc",
            }),
        });

        if (!response.ok) return null;
        const data = await response.json();
        const results = (data.results || []) as Array<Record<string, unknown>>;
        if (results.length === 0) return null;

        const agencies = [...new Set(results.map(r => String(r["Awarding Agency"] || "")).filter(Boolean))];
        const naicsCodes = [...new Set(results.map(r => String(r["NAICS Code"] || "")).filter(c => c.length >= 4))];
        const totalValue = results.reduce((sum, r) => sum + (Number(r["Award Amount"]) || 0), 0);

        // Find the most recent award by start date
        const sortedByDate = [...results].sort((a, b) => {
            const da = String(a["Start Date"] || "");
            const db = String(b["Start Date"] || "");
            return db.localeCompare(da);
        });
        const lastAward = sortedByDate[0];

        // Top awards by amount
        const sortedByAmount = [...results].sort((a, b) => (Number(b["Award Amount"]) || 0) - (Number(a["Award Amount"]) || 0));
        const topAwards = sortedByAmount.slice(0, 5).map(r => ({
            title: String(r["Description"] || r["Award ID"] || "").substring(0, 120),
            amount: Number(r["Award Amount"]) || 0,
            agency: String(r["Awarding Agency"] || ""),
            date: String(r["Start Date"] || ""),
        }));

        return {
            award_count: results.length,
            total_value: totalValue,
            agencies,
            naics_from_awards: naicsCodes,
            last_award_date: String(lastAward?.["Start Date"] || "") || null,
            last_award_title: String(lastAward?.["Description"] || "").substring(0, 120) || null,
            last_award_amount: Number(lastAward?.["Award Amount"]) || null,
            last_award_agency: String(lastAward?.["Awarding Agency"] || "") || null,
            top_awards: topAwards,
            searched_by: searchedBy,
        };
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// CRAWLER CONFIDENCE SCORE
// ---------------------------------------------------------------------------
function computeCrawlerConfidence(crawlData: Record<string, unknown>, samData: Record<string, unknown> | null): number {
    let score = 0;
    let total = 0;

    // Description (weight: 2)
    total += 2;
    const desc = (crawlData.description as string) || "";
    if (desc.length > 200) score += 2;
    else if (desc.length > 50) score += 1;

    // Services (weight: 2)
    total += 2;
    const services = (crawlData.services as string[]) || [];
    if (services.length >= 5) score += 2;
    else if (services.length >= 2) score += 1;

    // State detection (weight: 1.5)
    total += 1.5;
    const states = (crawlData.detected_states as string[]) || [];
    if (states.length >= 1) score += 1.5;

    // Contacts (weight: 1)
    total += 1;
    const contacts = (crawlData.contacts as { email?: string; phone?: string }[]) || [];
    if (contacts.some(c => c.email)) score += 0.5;
    if (contacts.some(c => c.phone)) score += 0.5;

    // Leadership (weight: 1)
    total += 1;
    const leadership = (crawlData.leadership as { name: string }[]) || [];
    if (leadership.length >= 1) score += 1;

    // Certifications (weight: 1)
    total += 1;
    const certs = (crawlData.certifications as { type: string }[]) || [];
    if (certs.length >= 1) score += 1;

    // SAM data (weight: 1.5)
    total += 1.5;
    if (samData) score += 1.5;

    return Math.round((score / total) * 100) / 100;
}

// ---------------------------------------------------------------------------
// OPPORTUNITY LANDSCAPE STATS
//   — aggregate counts + total value by NAICS and by state for the user's
//     inferred NAICS + operating states. Feeds the "Your Federal Opportunity
//     Landscape" section on the Quick Checker results page.
// ---------------------------------------------------------------------------
interface OpportunityStats {
    total_opportunities: number;
    total_estimated_value: number;
    hot_matches: number;
    warm_matches: number;
    total_matches: number;
    state_count: number;
    states: string[];
    naics_codes: string[];
    by_naics: { code: string; label: string; count: number; total_value: number }[];
    by_state: { state: string; count: number; total_value: number }[];
}

async function computeOpportunityStats(
    sb: ReturnType<typeof makeDb>,
    naicsCodes: string[],
    naicsLabels: Record<string, string>,
    userStates: string[],
    scoredMatches: { score: number }[],
): Promise<OpportunityStats> {
    const stats: OpportunityStats = {
        total_opportunities: 0,
        total_estimated_value: 0,
        hot_matches: 0,
        warm_matches: 0,
        total_matches: scoredMatches.length,
        state_count: 0,
        states: userStates,
        naics_codes: naicsCodes,
        by_naics: [],
        by_state: [],
    };

    // Score bucketing for HOT/WARM (thresholds mirror match-scoring lib)
    for (const m of scoredMatches) {
        if (m.score >= 0.70) stats.hot_matches += 1;
        else if (m.score >= 0.50) stats.warm_matches += 1;
    }

    if (naicsCodes.length === 0) return stats;

    // Pull opportunities matching the company's NAICS — narrow by state when the
    // user has target states, otherwise fall back to nationwide totals so we
    // still surface a meaningful headline number.
    const cleanStates = userStates
        .map(s => (s || "").trim().toUpperCase())
        .filter(s => s.length === 2);

    // Use explicit batching to stay well under Supabase response limits.
    const rows: { award_amount: number | null; estimated_value: number | null; naics_code: string | null; place_of_performance_state: string | null }[] = [];
    let offset = 0;
    const batchSize = 1000;
    while (true) {
        let query = sb
            .from("opportunities")
            .select("award_amount, estimated_value, naics_code, place_of_performance_state")
            .in("naics_code", naicsCodes)
            .eq("is_archived", false)
            .range(offset, offset + batchSize - 1);

        if (cleanStates.length > 0) {
            query = query.in("place_of_performance_state", cleanStates);
        }

        const { data: batch } = await query;
        if (!batch || batch.length === 0) break;
        rows.push(...(batch as typeof rows));
        if (batch.length < batchSize) break;
        offset += batchSize;
    }

    // Aggregate
    const naicsAgg = new Map<string, { count: number; value: number }>();
    const stateAgg = new Map<string, { count: number; value: number }>();

    for (const row of rows) {
        const value = Number(row.estimated_value ?? row.award_amount ?? 0) || 0;
        stats.total_opportunities += 1;
        stats.total_estimated_value += value;

        const code = (row.naics_code || "").trim();
        if (code) {
            const prev = naicsAgg.get(code) || { count: 0, value: 0 };
            prev.count += 1;
            prev.value += value;
            naicsAgg.set(code, prev);
        }

        const state = (row.place_of_performance_state || "").trim().toUpperCase();
        if (state) {
            const prev = stateAgg.get(state) || { count: 0, value: 0 };
            prev.count += 1;
            prev.value += value;
            stateAgg.set(state, prev);
        }
    }

    stats.by_naics = Array.from(naicsAgg.entries())
        .map(([code, v]) => ({
            code,
            label: naicsLabels[code] || code,
            count: v.count,
            total_value: Math.round(v.value),
        }))
        .sort((a, b) => b.total_value - a.total_value || b.count - a.count);

    stats.by_state = Array.from(stateAgg.entries())
        .map(([state, v]) => ({ state, count: v.count, total_value: Math.round(v.value) }))
        .sort((a, b) => b.total_value - a.total_value || b.count - a.count);

    stats.state_count = stats.by_state.length;
    stats.total_estimated_value = Math.round(stats.total_estimated_value);

    return stats;
}

// ---------------------------------------------------------------------------
// EASY WINS COMPUTATION
// ---------------------------------------------------------------------------
interface EasyWin {
    title: string;
    description: string;
    impact: "high" | "medium" | "low";
    category: string;
}

function computeEasyWins(
    crawlData: Record<string, unknown>,
    samData: Record<string, unknown> | null,
    inferredNaics: { code: string; confidence: number }[],
    tempProfile: ProfileForScoring,
): EasyWin[] {
    const wins: EasyWin[] = [];

    // No SAM registration
    if (!samData) {
        wins.push({
            title: "Register on SAM.gov",
            description: "SAM.gov registration is required to bid on federal contracts. Free registration unlocks access to all government opportunities.",
            impact: "high",
            category: "registration",
        });
    }

    // No certifications
    if (!tempProfile.sba_certifications || tempProfile.sba_certifications.length === 0) {
        wins.push({
            title: "Explore SBA Certifications",
            description: "SBA certifications like 8(a), HUBZone, or WOSB unlock set-aside contracts with less competition. Many have streamlined application processes.",
            impact: "high",
            category: "certifications",
        });
    }

    // Low NAICS confidence
    const avgConf = inferredNaics.length > 0
        ? inferredNaics.reduce((s, n) => s + n.confidence, 0) / inferredNaics.length
        : 0;
    if (avgConf < 0.6 && inferredNaics.length > 0) {
        wins.push({
            title: "Verify Your Industry Codes",
            description: "Your NAICS codes were inferred with low confidence. Confirming the right codes ensures you see the most relevant opportunities.",
            impact: "medium",
            category: "profile",
        });
    }

    // Only 1 or no target states
    if (tempProfile.target_states.length <= 1) {
        wins.push({
            title: "Expand Your Target States",
            description: "Adding more target states significantly increases the number of matching opportunities. Many federal contracts allow remote or multi-state performance.",
            impact: "medium",
            category: "profile",
        });
    }

    // No website contacts
    const contacts = (crawlData.contacts as { email?: string; phone?: string }[]) || [];
    if (contacts.length === 0) {
        wins.push({
            title: "Add Contact Info to Your Website",
            description: "Government contracting officers look for easy-to-find contact information. Adding a clear contact page improves your credibility.",
            impact: "low",
            category: "website",
        });
    }

    // No past performance detected
    const pastClients = (crawlData.past_clients as string[]) || [];
    if (pastClients.length === 0 && tempProfile.federal_awards_count === 0) {
        wins.push({
            title: "Highlight Past Performance",
            description: "Even commercial or state/local contracts count. Add a past performance section to your website to strengthen your government contracting position.",
            impact: "medium",
            category: "website",
        });
    }

    return wins.slice(0, 5);
}

// ---------------------------------------------------------------------------
// AI MATCH SUMMARY — 2-3 sentence fit summary for a single opportunity
// ---------------------------------------------------------------------------
async function generateMatchSummary(
    opportunity: {
        title?: string;
        agency?: string;
        naics_code?: string;
        set_aside_code?: string;
        description?: string | null;
    },
    profile: { naics_codes: string[]; state?: string | null }
): Promise<string> {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) return "";

    const description = (opportunity.description || "").slice(0, 1500);
    const prompt = `Given this company profile (NAICS: ${profile.naics_codes.join(", ")}, state: ${profile.state || "unknown"}) and this opportunity:
Title: ${opportunity.title || "Unknown"}
Agency: ${opportunity.agency || "Unknown"}
NAICS: ${opportunity.naics_code || "Unknown"}
Set-Aside: ${opportunity.set_aside_code || "None"}
Description: ${description}

Write a 2-3 sentence summary explaining why this is a good fit for the company. Focus on alignment, opportunity size, and any concerns. Be direct and specific.`;

    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${openaiKey}`,
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: prompt }],
                max_tokens: 180,
                temperature: 0.3,
            }),
        });

        if (!response.ok) return "";
        const data = await response.json();
        return (data.choices?.[0]?.message?.content || "").trim();
    } catch {
        return "";
    }
}

// ---------------------------------------------------------------------------
// READINESS SCORE — 0-10 government contracting readiness
// ---------------------------------------------------------------------------
interface ReadinessBreakdown {
    factors: Array<{ label: string; points: number; present: boolean; detail?: string }>;
    raw_points: number;
    total: number;
    interpretation: string;
}

function calculateReadinessScore(
    samData: Record<string, unknown> | null,
    usaspendingData: { award_count: number; total_value: number } | null,
    profile: ProfileForScoring,
    crawlData: Record<string, unknown>,
): { score: number; breakdown: ReadinessBreakdown } {
    const factors: ReadinessBreakdown["factors"] = [];
    let rawPoints = 0;

    // +3 SAM.gov registered
    const samRegistered = !!(samData && Object.keys(samData).length > 0);
    if (samRegistered) rawPoints += 3;
    factors.push({
        label: "SAM.gov Registered",
        points: samRegistered ? 3 : 0,
        present: samRegistered,
        detail: samRegistered ? "Active registration detected" : "Not registered — required to bid on federal contracts",
    });

    // +2 Past federal awards
    const hasAwards = !!(usaspendingData && usaspendingData.award_count > 0);
    if (hasAwards) rawPoints += 2;
    factors.push({
        label: "Past Federal Awards",
        points: hasAwards ? 2 : 0,
        present: hasAwards,
        detail: hasAwards
            ? `${usaspendingData!.award_count} awards ($${Math.round((usaspendingData!.total_value || 0) / 1000).toLocaleString()}K total)`
            : "No prior federal awards found on USASpending",
    });

    // +2 Veteran-owned (SDVOSB/VOSB)
    const certs = profile.sba_certifications || [];
    const veteranOwned = certs.some(c => /sdvosb|vosb|veteran/i.test(c));
    if (veteranOwned) rawPoints += 2;
    factors.push({
        label: "Veteran-Owned",
        points: veteranOwned ? 2 : 0,
        present: veteranOwned,
        detail: veteranOwned ? "VOSB / SDVOSB certified" : "Not a veteran-owned business",
    });

    // +1.5 per set-aside cert (cap +2), excluding veteran-owned already counted
    const setAsideCerts = certs.filter(c => /8\(a\)|8a|hubzone|wosb|edwosb|sdb|woman|disadvantaged/i.test(c));
    const setAsidePoints = Math.min(setAsideCerts.length * 1.5, 2);
    if (setAsidePoints > 0) rawPoints += setAsidePoints;
    factors.push({
        label: "Set-Aside Certifications",
        points: setAsidePoints,
        present: setAsideCerts.length > 0,
        detail: setAsideCerts.length > 0
            ? `${setAsideCerts.join(", ")}`
            : "No 8(a) / HUBZone / WOSB / EDWOSB certifications",
    });

    // +1 Years in business > 5
    const foundingYear = crawlData.founding_year as number | null;
    const yearsInBusiness = foundingYear ? new Date().getFullYear() - foundingYear : 0;
    const established = yearsInBusiness > 5;
    if (established) rawPoints += 1;
    factors.push({
        label: "Established (5+ years)",
        points: established ? 1 : 0,
        present: established,
        detail: foundingYear
            ? `Founded ${foundingYear} (${yearsInBusiness} years)`
            : "Founding year not detected",
    });

    // +0.5 Employee count > 10
    const employeeSignals = crawlData.employee_signals as { estimate: number } | null;
    const hasTeam = !!(employeeSignals && employeeSignals.estimate > 10);
    if (hasTeam) rawPoints += 0.5;
    factors.push({
        label: "Team Size (10+)",
        points: hasTeam ? 0.5 : 0,
        present: hasTeam,
        detail: employeeSignals
            ? `~${employeeSignals.estimate} employees`
            : "Team size not detected",
    });

    // Cap at 10 and round to integer
    const capped = Math.min(rawPoints, 10);
    const score = Math.round(capped);

    let interpretation: string;
    if (score <= 3) interpretation = "Not ready yet";
    else if (score <= 6) interpretation = "Getting there";
    else if (score <= 8) interpretation = "Ready to compete";
    else interpretation = "Highly qualified";

    return {
        score,
        breakdown: {
            factors,
            raw_points: Math.round(rawPoints * 10) / 10,
            total: 10,
            interpretation,
        },
    };
}

// ---------------------------------------------------------------------------
// COMPETITOR DISCOVERY — find top 5 competitors for the analyzed company
// ---------------------------------------------------------------------------
interface CompetitorRecord {
    name: string;
    uei: string | null;
    cage_code: string | null;
    sam_registered: boolean;
    naics_codes: string[];
    naics_overlap_pct: number;
    total_awards: number;
    award_count: number;
    first_award_date: string | null;
    last_award_date: string | null;
    top_agency: string | null;
    strengths: string[];
    weaknesses: string[];
    state: string | null;
    source: string;
    sba_certifications: string[];
}

// Normalize a company name for dedup (lowercase, strip punctuation + common suffixes)
function normalizeCompanyName(name: string): string {
    return (name || "")
        .toLowerCase()
        .replace(/[,.]/g, " ")
        .replace(/\b(inc|llc|corp|corporation|ltd|limited|co|company|group|holdings|services|solutions|enterprises)\b/gi, "")
        .replace(/\s+/g, " ")
        .trim();
}

// SAM.gov Entity API — find companies with the same primary NAICS
async function findCompetitorsViaSam(primaryNaics: string): Promise<CompetitorRecord[]> {
    if (!SAM_API_KEY || !primaryNaics) return [];

    try {
        const params = new URLSearchParams({
            primaryNaics,
            registrationStatus: "A",
            samRegistered: "Yes",
            includeSections: "entityRegistration,coreData,assertions",
            api_key: SAM_API_KEY,
        });

        const response = await fetch(`${SAM_ENTITY_URL}?${params.toString()}`, {
            headers: { "X-Api-Key": SAM_API_KEY },
            signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) return [];

        const data = await response.json();
        const entities = (data.entityData || []) as Array<Record<string, unknown>>;

        const out: CompetitorRecord[] = [];
        for (const entity of entities.slice(0, 20)) {
            const reg = (entity.entityRegistration || {}) as Record<string, unknown>;
            const coreData = (entity.coreData || {}) as Record<string, unknown>;
            const physicalAddr = (coreData.physicalAddress || {}) as Record<string, unknown>;
            const mailingAddr = (coreData.mailingAddress || {}) as Record<string, unknown>;
            const addr = Object.keys(physicalAddr).length > 0 ? physicalAddr : mailingAddr;

            const assertions = (entity.assertions || {}) as Record<string, unknown>;
            const goodsAndServices = (assertions.goodsAndServices || {}) as Record<string, unknown>;
            const naicsList = (goodsAndServices.naicsList || []) as Array<Record<string, unknown>>;
            const naicsCodes = naicsList.map(n => String(n.naicsCode || "")).filter(c => c.length > 0);

            const businessTypes = ((reg.businessTypes as string[]) || []).join(" ").toLowerCase();
            const sbaList = ((goodsAndServices.sbaBusinessTypeList || []) as Array<Record<string, unknown>>)
                .map(s => String(s.sbaBusinessTypeDesc || "").toLowerCase());
            const typeStr = [businessTypes, ...sbaList].join(" ");

            const certs: string[] = [];
            if (typeStr.includes("8(a)") || typeStr.includes("8a")) certs.push("8(a)");
            if (typeStr.includes("hubzone")) certs.push("HUBZone");
            if (typeStr.includes("service-disabled") || typeStr.includes("sdvosb")) certs.push("SDVOSB");
            if (typeStr.includes("women-owned") || typeStr.includes("wosb")) certs.push("WOSB");
            if (typeStr.includes("veteran-owned")) certs.push("VOSB");

            const name = String(reg.legalBusinessName || "").trim();
            if (!name) continue;

            out.push({
                name,
                uei: String(reg.ueiSAM || "") || null,
                cage_code: String(reg.cageCode || "") || null,
                sam_registered: true,
                naics_codes: naicsCodes,
                naics_overlap_pct: 0,
                total_awards: 0,
                award_count: 0,
                first_award_date: null,
                last_award_date: null,
                top_agency: null,
                strengths: [],
                weaknesses: [],
                state: String(addr.stateOrProvinceCode || "") || null,
                source: "sam_gov",
                sba_certifications: certs,
            });
        }
        return out;
    } catch {
        return [];
    }
}

// USASpending — find top recipients who won awards in the same NAICS
async function findCompetitorsViaUsaSpending(primaryNaics: string): Promise<CompetitorRecord[]> {
    if (!primaryNaics) return [];

    try {
        const response = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                filters: {
                    naics_codes: [primaryNaics],
                    time_period: [{ start_date: "2023-01-01", end_date: new Date().toISOString().split("T")[0] }],
                    award_type_codes: ["A", "B", "C", "D"],
                },
                fields: ["Recipient Name", "Award Amount", "recipient_id", "Awarding Agency", "Start Date"],
                limit: 50,
                page: 1,
                sort: "Award Amount",
                order: "desc",
            }),
            signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) return [];
        const data = await response.json();
        const results = (data.results || []) as Array<Record<string, unknown>>;

        // Aggregate by recipient name
        const byRecipient = new Map<string, {
            name: string;
            total: number;
            count: number;
            agencies: Map<string, number>;
            first: string;
            last: string;
        }>();

        for (const r of results) {
            const name = String(r["Recipient Name"] || "").trim();
            if (!name) continue;
            const amt = Number(r["Award Amount"]) || 0;
            const agency = String(r["Awarding Agency"] || "");
            const date = String(r["Start Date"] || "");

            const existing = byRecipient.get(name);
            if (existing) {
                existing.total += amt;
                existing.count += 1;
                if (agency) existing.agencies.set(agency, (existing.agencies.get(agency) || 0) + amt);
                if (date && (!existing.first || date < existing.first)) existing.first = date;
                if (date && (!existing.last || date > existing.last)) existing.last = date;
            } else {
                const agencies = new Map<string, number>();
                if (agency) agencies.set(agency, amt);
                byRecipient.set(name, {
                    name,
                    total: amt,
                    count: 1,
                    agencies,
                    first: date,
                    last: date,
                });
            }
        }

        const aggregated: CompetitorRecord[] = [];
        for (const v of byRecipient.values()) {
            let topAgency: string | null = null;
            let topAgencyTotal = -1;
            for (const [agency, total] of v.agencies.entries()) {
                if (total > topAgencyTotal) {
                    topAgency = agency;
                    topAgencyTotal = total;
                }
            }
            aggregated.push({
                name: v.name,
                uei: null,
                cage_code: null,
                sam_registered: false,
                naics_codes: [primaryNaics],
                naics_overlap_pct: 0,
                total_awards: v.total,
                award_count: v.count,
                first_award_date: v.first || null,
                last_award_date: v.last || null,
                top_agency: topAgency,
                strengths: [],
                weaknesses: [],
                state: null,
                source: "usaspending",
                sba_certifications: [],
            });
        }

        aggregated.sort((a, b) => b.total_awards - a.total_awards);
        return aggregated.slice(0, 20);
    } catch {
        return [];
    }
}

// Internal contractors table — query by NAICS overlap
async function findCompetitorsViaContractorsTable(
    sb: ReturnType<typeof makeDb>,
    primaryNaics: string[],
): Promise<CompetitorRecord[]> {
    if (!primaryNaics || primaryNaics.length === 0) return [];

    try {
        const { data: rows } = await sb
            .from("contractors")
            .select("company_name, uei, cage_code, state, naics_codes, sba_certifications, sam_registered")
            .overlaps("naics_codes", primaryNaics)
            .limit(20);

        if (!rows || rows.length === 0) return [];

        const out: CompetitorRecord[] = [];
        for (const r of rows as Array<Record<string, unknown>>) {
            const name = String(r.company_name || "").trim();
            if (!name) continue;
            out.push({
                name,
                uei: r.uei ? String(r.uei) : null,
                cage_code: r.cage_code ? String(r.cage_code) : null,
                sam_registered: r.sam_registered !== false,
                naics_codes: Array.isArray(r.naics_codes) ? (r.naics_codes as unknown[]).map(String) : [],
                naics_overlap_pct: 0,
                total_awards: 0,
                award_count: 0,
                first_award_date: null,
                last_award_date: null,
                top_agency: null,
                strengths: [],
                weaknesses: [],
                state: r.state ? String(r.state) : null,
                source: "contractors_db",
                sba_certifications: Array.isArray(r.sba_certifications) ? (r.sba_certifications as unknown[]).map(String) : [],
            });
        }
        return out;
    } catch {
        return [];
    }
}

// Enrich a single competitor's federal award history via USASpending
async function enrichCompetitorAwards(comp: CompetitorRecord): Promise<void> {
    if (!comp.name || comp.award_count > 0) return;

    try {
        const response = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                filters: {
                    recipient_search_text: [comp.uei && comp.uei.length === 12 ? comp.uei : comp.name],
                    time_period: [{ start_date: "2015-01-01", end_date: new Date().toISOString().split("T")[0] }],
                    award_type_codes: ["A", "B", "C", "D"],
                },
                fields: ["Award Amount", "Awarding Agency", "Start Date"],
                limit: 100,
                page: 1,
                sort: "Start Date",
                order: "desc",
            }),
            signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) return;
        const data = await response.json();
        const results = (data.results || []) as Array<Record<string, unknown>>;
        if (results.length === 0) return;

        const totals = results.reduce((sum, r) => sum + (Number(r["Award Amount"]) || 0), 0);
        const agencyTotals = new Map<string, number>();
        let firstDate = "";
        let lastDate = "";

        for (const r of results) {
            const agency = String(r["Awarding Agency"] || "");
            const amt = Number(r["Award Amount"]) || 0;
            if (agency) agencyTotals.set(agency, (agencyTotals.get(agency) || 0) + amt);
            const d = String(r["Start Date"] || "");
            if (d && (!firstDate || d < firstDate)) firstDate = d;
            if (d && (!lastDate || d > lastDate)) lastDate = d;
        }

        let topAgency: string | null = null;
        let topTotal = -1;
        for (const [a, t] of agencyTotals.entries()) {
            if (t > topTotal) { topAgency = a; topTotal = t; }
        }

        comp.total_awards = totals;
        comp.award_count = results.length;
        comp.first_award_date = firstDate || null;
        comp.last_award_date = lastDate || null;
        comp.top_agency = topAgency;
    } catch {
        // silent fail — leave award fields at zero
    }
}

// Infer strengths/weaknesses from enriched data
function inferCompetitorStrengthsWeaknesses(comp: CompetitorRecord): void {
    const strengths: string[] = [];
    const weaknesses: string[] = [];

    if (comp.total_awards > 1_000_000) strengths.push("Strong federal presence");
    if (comp.naics_codes.length > 5) strengths.push("Multiple NAICS coverage");
    if (comp.sba_certifications.includes("SDVOSB") || comp.sba_certifications.includes("VOSB")) {
        strengths.push("Veteran-owned");
    }
    if (comp.sba_certifications.length > 0) strengths.push("Small business advantage");
    if (comp.first_award_date && comp.first_award_date < "2020-01-01") {
        strengths.push("Established player");
    }

    if (comp.award_count === 0) weaknesses.push("Limited federal experience");
    if (comp.naics_codes.length > 0 && comp.naics_codes.length < 3) weaknesses.push("Single-NAICS focus");
    if (comp.sba_certifications.length === 0) weaknesses.push("No set-aside certifications");
    if (comp.first_award_date && comp.first_award_date > "2024-01-01") weaknesses.push("Recent entrant");

    comp.strengths = strengths;
    comp.weaknesses = weaknesses;
}

// Compute NAICS overlap % between analyzed company and competitor
function computeNaicsOverlap(analyzedNaics: string[], competitorNaics: string[]): number {
    if (analyzedNaics.length === 0 || competitorNaics.length === 0) return 0;
    const aSet = new Set(analyzedNaics);
    const matched = competitorNaics.filter(c => aSet.has(c)).length;
    return Math.round((matched / analyzedNaics.length) * 100);
}

// Main discovery function — combines all 3 strategies and returns top 5 competitors
async function findTopCompetitors(
    selectedNaics: string[],
    analyzedCompanyName: string,
    analyzedUei: string | null,
    sb: ReturnType<typeof makeDb>,
): Promise<CompetitorRecord[]> {
    if (!selectedNaics || selectedNaics.length === 0) return [];

    const primaryNaics = selectedNaics[0];
    const analyzedNormalized = normalizeCompanyName(analyzedCompanyName);

    // Strategy A (SAM) + B (USASpending) + C (contractors table) in parallel
    const [samResults, usaResults, dbResults] = await Promise.all([
        findCompetitorsViaSam(primaryNaics),
        findCompetitorsViaUsaSpending(primaryNaics),
        findCompetitorsViaContractorsTable(sb, selectedNaics.slice(0, 5)),
    ]);

    // Merge sources, dedupe by normalized name (skip the analyzed company itself)
    const merged = new Map<string, CompetitorRecord>();
    const addOrMerge = (c: CompetitorRecord) => {
        const key = normalizeCompanyName(c.name);
        if (!key || key === analyzedNormalized) return;
        if (analyzedUei && c.uei && c.uei === analyzedUei) return;

        const existing = merged.get(key);
        if (!existing) {
            merged.set(key, { ...c });
            return;
        }
        // Merge — prefer populated fields
        if (!existing.uei && c.uei) existing.uei = c.uei;
        if (!existing.cage_code && c.cage_code) existing.cage_code = c.cage_code;
        if (!existing.state && c.state) existing.state = c.state;
        if (!existing.top_agency && c.top_agency) existing.top_agency = c.top_agency;
        if (c.total_awards > existing.total_awards) {
            existing.total_awards = c.total_awards;
            existing.award_count = c.award_count;
            existing.first_award_date = c.first_award_date;
            existing.last_award_date = c.last_award_date;
        }
        existing.naics_codes = Array.from(new Set([...existing.naics_codes, ...c.naics_codes]));
        existing.sba_certifications = Array.from(new Set([...existing.sba_certifications, ...c.sba_certifications]));
        existing.sam_registered = existing.sam_registered || c.sam_registered;
        if (!existing.source.includes(c.source)) existing.source = `${existing.source}+${c.source}`;
    };

    // USASpending first (richest award data), then SAM, then contractors DB
    for (const c of usaResults) addOrMerge(c);
    for (const c of samResults) addOrMerge(c);
    for (const c of dbResults) addOrMerge(c);

    // Rank candidates: award totals then NAICS overlap
    const candidates = Array.from(merged.values());
    for (const c of candidates) {
        c.naics_overlap_pct = computeNaicsOverlap(selectedNaics, c.naics_codes);
    }
    candidates.sort((a, b) => {
        if (b.total_awards !== a.total_awards) return b.total_awards - a.total_awards;
        return b.naics_overlap_pct - a.naics_overlap_pct;
    });

    // Take top 8 for enrichment, then whittle to 5
    const topCandidates = candidates.slice(0, 8);

    // Enrich award data for any without it (parallel, each with its own 10s timeout)
    await Promise.all(topCandidates.map(enrichCompetitorAwards));

    // Recompute overlap and infer strengths/weaknesses
    for (const c of topCandidates) {
        c.naics_overlap_pct = computeNaicsOverlap(selectedNaics, c.naics_codes);
        inferCompetitorStrengthsWeaknesses(c);
    }

    // Re-sort after enrichment
    topCandidates.sort((a, b) => {
        if (b.total_awards !== a.total_awards) return b.total_awards - a.total_awards;
        return b.naics_overlap_pct - a.naics_overlap_pct;
    });

    return topCandidates.slice(0, 5);
}

// ---------------------------------------------------------------------------
// STAGE 1: CRAWL + CLASSIFY — stops at NAICS selection gate
// ---------------------------------------------------------------------------
async function runCrawlAndClassifyPipeline(analysisId: string, initialCompanyName: string, initialWebsite: string, initialUei: string, userProvidedName: boolean) {
    const sb = makeDb();
    let companyName = initialCompanyName;
    let website = initialWebsite;
    let uei = initialUei;

    try {
        // IF we have UEI, ALWAYS fetch SAM first to resolve authoritative info
        let samData: Record<string, unknown> | null = null;
        if (uei && uei.length === 12) {
            samData = await lookupSamEntity(uei);
            if (samData) {
                companyName = (samData.company_name as string) || companyName;

                await sb.from("company_analyses").update({ 
                    sam_data: samData, 
                    company_name: companyName,
                    uei: uei
                }).eq("id", analysisId);
            }
        }

        // Step 1: Crawl company website with CheerioCrawler (if we have a website)
        let crawlData: Record<string, unknown> = {};
        if (website) {
            try {
                const crawlResult = await analyzeCompany(companyName, website);
                if (crawlResult.success && crawlResult.data) {
                    crawlData = crawlResult.data as unknown as Record<string, unknown>;
                }
                if (crawlResult.errors.length > 0) {
                    console.warn("Crawl warnings:", crawlResult.errors);
                }
            } catch (e) {
                console.error("Crawler error:", e);
            }
        }

        // Auto-detect company name from crawled website — only if user didn't provide one
        const crawledName = crawlData.company_name as string | undefined;
        if (!userProvidedName && crawledName && crawledName.length > 1) {
            companyName = crawledName;
            await sb.from("company_analyses").update({ company_name: companyName }).eq("id", analysisId);
        }

        // Auto-detect UEI from crawl data if user didn't provide one
        const detectedUei = crawlData.detected_uei as string | null;
        if (!uei && detectedUei && detectedUei.length === 12) {
            uei = detectedUei;
            await sb.from("company_analyses").update({ uei }).eq("id", analysisId);
        }

        await sb.from("company_analyses").update({ status: "enriching", crawl_data: crawlData }).eq("id", analysisId);

        // Step 2: SAM.gov lookup
        // First try by UEI (if we have one from user input, crawl detection, or pre-fetched above)
        // If no UEI, search SAM.gov by company name to find their registration
        if (!samData && uei && uei.length === 12) {
            samData = await lookupSamEntity(uei);
        }

        if (!samData && companyName.length >= 3) {
            // Search SAM.gov by company name to discover their UEI
            const discoveredUei = await searchSamByName(companyName);
            if (discoveredUei) {
                uei = discoveredUei;
                samData = await lookupSamEntity(uei);
                if (samData) {
                    await sb.from("company_analyses").update({ uei }).eq("id", analysisId);
                }
            }
        }

        if (samData) {
            // SAM.gov data provides authoritative company name and state
            if (samData.company_name) companyName = samData.company_name as string;
            await sb.from("company_analyses").update({ sam_data: samData, company_name: companyName }).eq("id", analysisId);
        }

        // USASpending enrichment — prefer UEI-based lookup for precision
        let usaspendingData: UsaSpendingData | null = null;
        usaspendingData = await lookupUsaSpending(companyName, uei || undefined);
        if (usaspendingData) {
            crawlData.usaspending_data = usaspendingData;
        }

        await sb.from("company_analyses").update({ status: "classifying" }).eq("id", analysisId);

        // Step 3: NAICS classification
        const description = (crawlData.description as string) || "";
        const services = (crawlData.services as string[]) || [];
        const pageContent = (crawlData.all_page_text as string) || "";
        const samNaics = samData ? (samData.naics_codes as string[]) : undefined;
        const usaNaics = usaspendingData?.naics_from_awards || [];

        let inferredNaics = classifyNaics(description, services, pageContent,
            samNaics ? [...samNaics, ...usaNaics].filter((v, i, a) => a.indexOf(v) === i) : usaNaics.length > 0 ? usaNaics : undefined
        );

        // ALWAYS use OpenAI for NAICS inference (keyword map only covers 31 codes)
        // This ensures companies in ANY industry get proper NAICS classification
        if (process.env.OPENAI_API_KEY) {
            const aiNaics = await inferNaicsOpenAI(companyName, description, services, pageContent);
            if (aiNaics.length > 0) {
                // Load valid codes from DB (892 codes) — not just the static 1021 in naics-codes.ts
                let validDbCodes: Set<string> | null = null;
                try {
                    const { data: dbCodes } = await sb.from("naics_codes").select("code, industry_title");
                    validDbCodes = new Set((dbCodes || []).map((r: { code: string }) => r.code));
                } catch { /* fallback to static file */ }

                for (const code of aiNaics) {
                    // Accept if in DB OR in static file
                    const inDb = validDbCodes?.has(code);
                    const naicsInfo = NAICS_CODES.find((n: { code: string; label: string }) => n.code === code);
                    if ((inDb || naicsInfo) && !inferredNaics.some((x: { code: string }) => x.code === code)) {
                        inferredNaics.push({
                            code,
                            label: naicsInfo?.label || code,
                            confidence: 0.85,
                            matched_keywords: ["AI inferred analysis"]
                        });
                    }
                }
            }
        }

        console.log(`[analyze-company] ${analysisId}: classified ${inferredNaics.length} NAICS codes, persisting...`);

        // Persist classification artifacts for the scoring stage
        // CRITICAL: Set status to awaiting_naics_selection IN THE SAME UPDATE
        // to avoid the row being stuck if a later query hangs
        try {
            await sb.from("company_analyses").update({
                inferred_naics: inferredNaics,
                crawl_data: crawlData,
                sam_data: samData,
                company_name: companyName,
                uei: uei || null,
                status: "awaiting_naics_selection",
            }).eq("id", analysisId);
            console.log(`[analyze-company] ${analysisId}: status set to awaiting_naics_selection`);
        } catch (updateErr) {
            console.error(`[analyze-company] ${analysisId}: persist failed:`, updateErr);
            // Try minimal update so user isn't stuck
            await sb.from("company_analyses").update({
                inferred_naics: inferredNaics,
                status: "awaiting_naics_selection",
            }).eq("id", analysisId);
        }
        return;
    } catch (error) {
        console.error("Crawl/classify pipeline error:", error);
        await sb.from("company_analyses").update({
            status: "error",
            error_message: (error as Error).message || "Pipeline failed",
        }).eq("id", analysisId);
    }
}

// ---------------------------------------------------------------------------
// STAGE 2: SCORING PIPELINE — runs after NAICS selection
// ---------------------------------------------------------------------------
export async function runScoringPipeline(analysisId: string, selectedNaicsCodes: string[]) {
    const sb = makeDb();
    try {
        // Re-hydrate state from DB so this can be invoked independently from
        // the select-naics endpoint as well as from Stage 1.
        const { data: row } = await sb
            .from("company_analyses")
            .select("company_name, website, uei, sam_data, crawl_data, inferred_naics")
            .eq("id", analysisId)
            .single();

        if (!row) {
            console.error("Scoring pipeline: analysis not found", analysisId);
            return;
        }

        const companyName = (row.company_name || "") as string;
        const website = (row.website || "") as string;
        const uei = (row.uei || "") as string;
        const samData = (row.sam_data || null) as Record<string, unknown> | null;
        const crawlData = (row.crawl_data || {}) as Record<string, unknown>;
        const inferredNaics = (row.inferred_naics || []) as Array<{ code: string; label: string; confidence: number; matched_keywords?: string[] }>;

        const description = (crawlData.description as string) || "";
        const services = (crawlData.services as string[]) || [];
        const usaspendingData = (crawlData.usaspending_data as UsaSpendingData | undefined) || null;

        await sb.from("company_analyses").update({ status: "scoring" }).eq("id", analysisId);

        // Build temporary profile for scoring — use SELECTED codes only
        const certifications = (crawlData.certifications as { type: string; confidence: number }[]) || [];
        const locations = (crawlData.locations as { state?: string }[]) || [];
        const detectedStates = (crawlData.detected_states as string[]) || [];
        const samCerts = samData ? (samData.sba_certifications as string[]) : [];

        const tempProfile: ProfileForScoring = {
            naics_codes: selectedNaicsCodes,
            sba_certifications: [
                ...(samCerts || []),
                ...certifications.filter(c => c.confidence > 0.7).map(c => c.type),
            ].filter((v, i, a) => a.indexOf(v) === i),
            state: samData?.state as string || locations[0]?.state || detectedStates[0] || "",
            target_states: [
                ...(samData?.state ? [samData.state as string] : []),
                ...detectedStates,
            ].filter((v, i, a) => a.indexOf(v) === i),
            revenue: null,
            federal_awards_count: usaspendingData?.award_count || 0,
            target_psc_codes: [],
            preferred_agencies: usaspendingData?.agencies || [],
        };

        // Step 5: On-demand NAICS crawl if we lack coverage
        const naicsCodesToCheck = selectedNaicsCodes.slice(0, 5);
        if (naicsCodesToCheck.length > 0) {
            const { count: naicsOppCount } = await sb
                .from("opportunities")
                .select("id", { count: "exact", head: true })
                .in("naics_code", naicsCodesToCheck)
                .eq("is_archived", false);

            if ((naicsOppCount || 0) < 10) {
                await sb.from("company_analyses").update({ status: "finding_opportunities" }).eq("id", analysisId);
                try {
                    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.capturepilot.com";
                    await fetch(`${baseUrl}/api/opportunities/search-naics`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ naics_codes: naicsCodesToCheck, min_results: 10, days_back: 180 }),
                        signal: AbortSignal.timeout(60000),
                    });
                } catch { /* timeout ok */ }
            }
        }

        // Step 6: Score against opportunities — ONLY the SELECTED NAICS codes
        const primaryNaics = selectedNaicsCodes;
        const allOpps: OpportunityForScoring[] = [];

        // Fetch opportunities that match the company's primary NAICS codes only
        if (primaryNaics.length > 0) {
            let offset = 0;
            const batchSize = 1000;
            while (true) {
                const { data: batch } = await sb
                    .from("opportunities")
                    .select("id, naics_code, psc_code, notice_type, agency, set_aside_code, place_of_performance_state, award_amount, response_deadline")
                    .eq("is_archived", false)
                    .in("naics_code", primaryNaics)
                    .range(offset, offset + batchSize - 1);
                if (!batch || batch.length === 0) break;
                allOpps.push(...(batch as unknown as OpportunityForScoring[]));
                if (batch.length < batchSize) break;
                offset += batchSize;
            }
        }

        const scoredMatches: { opportunity_id: string; title?: string; agency?: string; naics_code?: string; set_aside_code?: string; response_deadline?: string; notice_type?: string; award_amount?: number; notice_id?: string; place_of_performance_state?: string; description_url?: string; score: number; classification: string; score_breakdown: Record<string, number> }[] = [];

        for (const opp of allOpps) {
            const result = scoreOpportunityLeadMagnet(tempProfile, opp);
            if (result) {
                scoredMatches.push({ ...result });
            }
        }

        scoredMatches.sort((a, b) => b.score - a.score);
        // Take top 40 candidates (will deduplicate after enrichment with titles, then cap at 10)
        const topCandidates = scoredMatches.slice(0, 40);

        // Enrich candidates with full opportunity details, then deduplicate by title
        // Keep raw description text around so we can feed it to the AI summary generator
        const rawDescriptionMap = new Map<string, string>();
        let topMatches: typeof topCandidates = topCandidates;
        if (topCandidates.length > 0) {
            const oppIds = topCandidates.map(m => m.opportunity_id);
            const { data: oppDetails } = await sb
                .from("opportunities")
                .select("id, title, agency, naics_code, set_aside_code, response_deadline, notice_type, award_amount, notice_id, place_of_performance_state, description")
                .in("id", oppIds);

            if (oppDetails) {
                const detailMap = new Map(oppDetails.map(o => [o.id, o]));
                for (const match of topMatches) {
                    const detail = detailMap.get(match.opportunity_id);
                    if (detail) {
                        match.title = detail.title;
                        match.agency = detail.agency;
                        match.naics_code = detail.naics_code;
                        match.set_aside_code = detail.set_aside_code;
                        match.response_deadline = detail.response_deadline;
                        match.notice_type = detail.notice_type;
                        match.award_amount = detail.award_amount;
                        match.notice_id = detail.notice_id;
                        match.place_of_performance_state = detail.place_of_performance_state;
                        match.description_url = detail.description;
                        rawDescriptionMap.set(match.opportunity_id, detail.description || "");
                    }
                }
            }
        }

        // Deduplicate by title — SAM.gov posts amendments with different notice_ids but same title
        const seenTitles = new Set<string>();
        topMatches = topCandidates.filter(m => {
            const title = (m.title || "").toLowerCase().trim().replace(/\s+/g, " ").slice(0, 60);
            if (!title || seenTitles.has(title)) return false;
            seenTitles.add(title);
            return true;
        }).slice(0, 10);

        // Generate AI fit summaries (2-3 sentences) for each top match in parallel
        const aiMatchSummaries: Record<string, string> = {};
        if (topMatches.length > 0 && process.env.OPENAI_API_KEY) {
            const summaryResults = await Promise.all(
                topMatches.map(async (m) => {
                    const rawDesc = rawDescriptionMap.get(m.opportunity_id) || "";
                    const summary = await generateMatchSummary(
                        {
                            title: m.title,
                            agency: m.agency,
                            naics_code: m.naics_code,
                            set_aside_code: m.set_aside_code,
                            description: rawDesc,
                        },
                        { naics_codes: selectedNaicsCodes, state: tempProfile.state },
                    );
                    return { id: m.opportunity_id, summary };
                })
            );
            for (const { id, summary } of summaryResults) {
                if (summary) aiMatchSummaries[id] = summary;
            }
            // Attach summaries to match objects so they ride along with preview_matches
            for (const m of topMatches as Array<typeof topMatches[number] & { ai_fit_summary?: string }>) {
                if (aiMatchSummaries[m.opportunity_id]) {
                    m.ai_fit_summary = aiMatchSummaries[m.opportunity_id];
                }
            }
        }

        await sb.from("company_analyses").update({ status: "generating" }).eq("id", analysisId);

        // Certification recommendations
        const oppIdsForCerts = allOpps.slice(0, 500).map(o => o.id);
        const oppTitleMap = new Map<string, string>();
        if (oppIdsForCerts.length > 0) {
            for (let i = 0; i < oppIdsForCerts.length; i += 100) {
                const chunk = oppIdsForCerts.slice(i, i + 100);
                const { data: titleBatch } = await sb
                    .from("opportunities")
                    .select("id, title")
                    .in("id", chunk);
                if (titleBatch) {
                    for (const o of titleBatch) oppTitleMap.set(o.id, o.title);
                }
            }
        }
        const oppsWithTitles = allOpps.map(o => ({
            ...o,
            title: oppTitleMap.get(o.id) || undefined,
        }));

        const certRecommendations = generateCertRecommendations(
            tempProfile.sba_certifications,
            oppsWithTitles,
            tempProfile.naics_codes,
        );

        // Easy wins
        const easyWins = computeEasyWins(crawlData, samData, inferredNaics, tempProfile);

        // Opportunity landscape stats — powers the big-number section on the
        // results page ("$X.XM in your states across Y opportunities").
        const naicsLabelMap: Record<string, string> = {};
        for (const n of inferredNaics) naicsLabelMap[n.code] = n.label || n.code;
        const opportunityStats = await computeOpportunityStats(
            sb,
            primaryNaics,
            naicsLabelMap,
            tempProfile.target_states,
            scoredMatches,
        );

        // Generate company summary
        const summary = await generateSummary(companyName, description, services, certifications);

        // Build inferred profile for onboarding pre-fill
        const contacts = (crawlData.contacts as { email?: string; phone?: string }[]) || [];
        const employeeSignals = crawlData.employee_signals as { estimate: number } | null;
        const foundingYear = crawlData.founding_year as number | null;
        const leadership = (crawlData.leadership as { name: string; title: string; email?: string; phone?: string }[]) || [];

        const primaryLeader = leadership.find(l => {
            const t = l.title.toLowerCase();
            return ["ceo", "owner", "president", "founder"].some(k => t.includes(k));
        }) || leadership[0];

        // Apollo People Enrichment — get mobile/direct phone for the decision-maker
        const samPocs = samData ? (samData.points_of_contact as { name: string; title: string; email?: string; phone?: string }[]) || [] : [];
        const decisionMaker = primaryLeader || samPocs[0] || null;
        let apolloEnrichment: { mobile_phone?: string; direct_phone?: string; email?: string; linkedin_url?: string; title?: string } | null = null;

        if (decisionMaker) {
            const nameParts = decisionMaker.name.trim().split(/\s+/);
            const firstName = nameParts[0] || "";
            const lastName = nameParts.slice(1).join(" ") || "";
            const domain = website.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

            apolloEnrichment = await enrichPersonApollo(firstName, lastName, domain, companyName);
        }

        const inferredProfile: Record<string, unknown> = {
            company_name: samData?.company_name || companyName,
            dba_name: samData?.dba_name || null,
            website,
            uei: uei || null,
            cage_code: samData?.cage_code || (crawlData.detected_cage_code as string) || null,
            address_line_1: samData?.address_line_1 || null,
            city: samData?.city || null,
            state: samData?.state || detectedStates[0] || null,
            zip_code: samData?.zip_code || null,
            phone: samData?.phone || primaryLeader?.phone || contacts.find(c => c.phone)?.phone || null,
            email: primaryLeader?.email || contacts.find(c => c.email)?.email || null,
            naics_codes: inferredNaics.map(n => n.code),
            sba_certifications: tempProfile.sba_certifications,
            employee_count: employeeSignals?.estimate || null,
            years_in_business: foundingYear ? new Date().getFullYear() - foundingYear : null,
            has_bonding: certifications.some(c => c.type === "bonding"),
            target_states: tempProfile.target_states,
            contact_person: decisionMaker ? {
                name: decisionMaker.name,
                title: apolloEnrichment?.title || decisionMaker.title,
                email: apolloEnrichment?.email || decisionMaker.email,
                phone: decisionMaker.phone,
                mobile_phone: apolloEnrichment?.mobile_phone || undefined,
                direct_phone: apolloEnrichment?.direct_phone || undefined,
                linkedin_url: apolloEnrichment?.linkedin_url || undefined,
                source: apolloEnrichment ? "apollo" : (samPocs.length > 0 ? "sam_gov" : "website"),
            } : null,
            apollo_enrichment: apolloEnrichment,
            gov_spending: usaspendingData ? {
                award_count: usaspendingData.award_count,
                total_value: usaspendingData.total_value,
                last_award_date: usaspendingData.last_award_date,
                last_award_title: usaspendingData.last_award_title,
                last_award_amount: usaspendingData.last_award_amount,
                last_award_agency: usaspendingData.last_award_agency,
                agencies: usaspendingData.agencies,
                top_awards: usaspendingData.top_awards,
                searched_by: usaspendingData.searched_by,
            } : null,
        };

        // Compute readiness score (0-10)
        const { score: readinessScore, breakdown: readinessBreakdown } =
            calculateReadinessScore(samData, usaspendingData, tempProfile, crawlData);

        // Step 7: Find top 5 competitors using SAM.gov + USASpending + contractors table
        await sb.from("company_analyses").update({ status: "finding_competitors" }).eq("id", analysisId);
        let competitors: CompetitorRecord[] = [];
        try {
            competitors = await findTopCompetitors(
                selectedNaicsCodes,
                companyName,
                uei && uei.length === 12 ? uei : null,
                sb,
            );
        } catch (e) {
            console.warn("Competitor discovery error (non-fatal):", e);
        }

        // Save everything — mark complete
        await sb.from("company_analyses").update({
            status: "complete",
            company_summary: summary,
            preview_matches: topMatches,
            inferred_profile: inferredProfile,
            inferred_naics: inferredNaics,
            crawl_data: crawlData,
            cert_recommendations: certRecommendations,
            easy_wins: easyWins,
            opportunity_stats: opportunityStats,
            selected_naics_codes: selectedNaicsCodes,
            readiness_score: readinessScore,
            readiness_breakdown: readinessBreakdown,
            ai_match_summaries: aiMatchSummaries,
            competitors,
        }).eq("id", analysisId);

    } catch (error) {
        console.error("Scoring pipeline error:", error);
        await sb.from("company_analyses").update({
            status: "error",
            error_message: (error as Error).message || "Pipeline failed",
        }).eq("id", analysisId);
    }
}

// ---------------------------------------------------------------------------
// MAIN HANDLER — returns analysis_id immediately, processes in background
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
    const sb = makeDb();

    try {
        const body = await request.json();
        let companyName = sanitizeCompanyName(body.company_name || "");
        const website = normalizeUrl(body.website || "");
        const uei = (body.uei || "").trim().toUpperCase();

        if (!isValidUrl(website)) {
            return NextResponse.json({ error: "Valid website URL is required" }, { status: 400 });
        }

        const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

        // Track whether user explicitly provided a company name
        const userProvidedName = companyName.length > 0;

        // Use domain as placeholder if no company name provided
        if (!companyName) {
            try { companyName = new URL(website).hostname.replace(/^www\./, ""); } catch { companyName = website; }
        }

        // Insert analysis record
        const { data: analysis, error: insertError } = await sb
            .from("company_analyses")
            .insert({
                company_name: companyName,
                website,
                uei: uei || null,
                status: "crawling",
                ip_address: ip,
            })
            .select("id")
            .single();

        if (insertError || !analysis) {
            return NextResponse.json({ error: "Failed to create analysis" }, { status: 500 });
        }

        const analysisId = analysis.id;

        // Run crawl + classify in the background. This stops at the NAICS selection
        // gate; the select-naics endpoint resumes with scoring.
        after(async () => {
            await runCrawlAndClassifyPipeline(analysisId, companyName, website, uei, userProvidedName);
        });

        // Return immediately with the analysis ID
        return NextResponse.json({
            success: true,
            analysis_id: analysisId,
            status: "crawling",
        });

    } catch (error) {
        console.error("Analyze company error:", error);
        return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
    }
}
