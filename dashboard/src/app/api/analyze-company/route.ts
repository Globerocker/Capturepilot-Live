import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { classifyNaics } from "@/lib/naics-classifier";
import { NAICS_CODES } from "@/lib/naics-codes";
import { scoreOpportunityLeadMagnet, type ProfileForScoring, type OpportunityForScoring } from "@/lib/match-scoring";
import { generateCertRecommendations } from "@/lib/cert-recommendations";
import { analyzeCompany } from "@/lib/crawler";
import { findCompetitors, computeReadinessScore } from "@/lib/quick-checker-helpers";

// Pro plan ceiling. The pipeline runs in after() so it shares this budget.
// We were getting silent kills at 120s on slow Firecrawl + OpenAI runs that
// left rows pinned at "classifying" with no error.
export const maxDuration = 300;

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
            signal: AbortSignal.timeout(10000),
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
            signal: AbortSignal.timeout(10000),
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
): Promise<Array<{ code: string; confidence: number; reason: string }>> {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) return [];

    // Build a rich, structured prompt — give the model the company name, description,
    // explicit services list, and a generous chunk of page text. Use gpt-4o (not mini)
    // because mini hallucinates adjacent NAICS codes (carpet cleaning for janitors etc).
    const userMsg = [
        `COMPANY NAME: ${companyName}`,
        `WEBSITE DESCRIPTION: ${description || "(not provided)"}`,
        `SERVICES LISTED ON SITE: ${services.length > 0 ? services.join(", ") : "(none extracted)"}`,
        ``,
        `WEBSITE CONTENT (first ~6000 chars):`,
        pageContent.substring(0, 6000),
    ].join("\n");

    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${openaiKey}`,
            },
            body: JSON.stringify({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: `You are a NAICS classification expert for U.S. federal government contracting. Given a company's website content, you identify the most accurate 6-digit NAICS code(s) describing what the company actually does.

YOUR TASK:
1. Read the company description, services, and website content carefully.
2. Identify the SINGLE primary NAICS code that best describes the company's core business.
3. Optionally add 1-2 secondary codes ONLY if the company clearly operates multiple distinct lines of business.
4. For each code, assign a confidence between 0.0 and 1.0 based on how directly the website evidence supports it, and write a one-sentence reason citing specific text from the page.

CRITICAL ANTI-HALLUCINATION RULES:
- Be CONSERVATIVE. Returning 1 highly accurate code is better than returning 3 mediocre ones.
- Do NOT pick adjacent or tangential codes. Examples of mistakes to avoid:
  * "Janitorial Services" company → DO NOT also return "Carpet & Upholstery Cleaning" (561740) or "Drycleaning" (812320). Carpets are part of janitorial work.
  * "Cleaning warehouses" mentioned → does NOT mean the company is in "Warehousing & Storage" (493110). It means they CLEAN warehouses (still janitorial 561720).
  * "Construction company" → DO NOT return "Engineering Services" or "Management Consulting" unless they explicitly do those.
- A confidence of 0.95 means: "the website explicitly says this is what they do, multiple times".
- A confidence of 0.70 means: "this is implied but not explicit".
- If you only have one strong signal, return ONE code. Don't pad the list.

OUTPUT FORMAT — STRICT JSON, no markdown, no code blocks:
{"codes":[{"code":"561720","confidence":0.95,"reason":"website explicitly states 'commercial cleaning services for offices and medical facilities'"}]}`,
                    },
                    {
                        role: "user",
                        content: userMsg,
                    },
                ],
                max_tokens: 500,
                temperature: 0.0,
                response_format: { type: "json_object" },
            }),
            signal: AbortSignal.timeout(25000),
        });

        if (!response.ok) {
            console.error("OpenAI NAICS classification failed:", response.status, await response.text().catch(() => ""));
            return [];
        }
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content?.trim() || "{}";

        const cleanContent = content.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
        const parsed = JSON.parse(cleanContent);
        const codes = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.codes) ? parsed.codes : []);
        return codes
            .map((c: unknown) => {
                if (typeof c === "string") return { code: c.trim(), confidence: 0.7, reason: "" };
                const obj = c as { code?: string; confidence?: number; reason?: string };
                return {
                    code: String(obj.code || "").trim(),
                    confidence: typeof obj.confidence === "number" ? obj.confidence : 0.7,
                    reason: String(obj.reason || ""),
                };
            })
            .filter((c: { code: string }) => /^\d{6}$/.test(c.code))
            .slice(0, 3);
    } catch (e) {
        console.error("OpenAI NAICS classification error:", e instanceof Error ? e.message : e);
        return [];
    }
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
            // 6s hard timeout — Apollo occasionally hangs on slow paths,
            // and this call sits in the critical path between NAICS classify
            // and the awaiting_confirmation status flip. Without a timeout
            // the worker dies on Vercel's 120s function ceiling and the row
            // stays stuck at "classifying" forever.
            signal: AbortSignal.timeout(6000),
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
            signal: AbortSignal.timeout(12000),
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
// BACKGROUND PIPELINE — runs via after() once response is sent
// ---------------------------------------------------------------------------
async function runAnalysisPipeline(analysisId: string, initialCompanyName: string, initialWebsite: string, initialUei: string, userProvidedName: boolean) {
    const sb = makeDb();
    let companyName = initialCompanyName;
    let website = initialWebsite;
    let uei = initialUei;

    try {
        // Parallel boot:
        // - If we already have a UEI, fetch SAM in parallel with the crawl.
        // - Crawl the website (Firecrawl + OpenAI extraction + OpenAI NAICS).
        // - Pre-warm valid NAICS DB whitelist for the classify step.
        // Burning these in parallel saves 10-25s of wall-clock and is what
        // killed us at the 120s Vercel ceiling on slow analyses.
        const initialSamPromise: Promise<Record<string, unknown> | null> = (uei && uei.length === 12)
            ? lookupSamEntity(uei)
            : Promise.resolve(null);
        const crawlPromise: Promise<{ success: boolean; data: Record<string, unknown>; errors: string[] }> = website
            ? analyzeCompany(companyName, website).then(r => ({ success: r.success, data: r.data as unknown as Record<string, unknown>, errors: r.errors })).catch(e => {
                console.error("Crawler error:", e);
                return { success: false, data: {} as Record<string, unknown>, errors: [(e as Error).message || "crawl failed"] };
            })
            : Promise.resolve({ success: false, data: {} as Record<string, unknown>, errors: [] });
        const validNaicsPromise: Promise<Set<string> | null> = (async () => {
            try {
                const { data } = await sb.from("naics_codes").select("code");
                return new Set(((data || []) as { code: string }[]).map(r => r.code));
            } catch {
                return null;
            }
        })();

        const [samFromUei, crawlResult, validDbCodes] = await Promise.all([
            initialSamPromise,
            crawlPromise,
            validNaicsPromise,
        ]);

        let samData: Record<string, unknown> | null = samFromUei;
        if (samData) companyName = (samData.company_name as string) || companyName;

        const crawlData: Record<string, unknown> = crawlResult.data || {};
        if (crawlResult.errors.length > 0) console.warn("Crawl warnings:", crawlResult.errors);

        // Auto-detect company name from crawled website — only if user didn't provide one
        const crawledName = crawlData.company_name as string | undefined;
        if (!userProvidedName && crawledName && crawledName.length > 1) {
            companyName = crawledName;
        }

        // Auto-detect UEI from crawl data if user didn't provide one
        const detectedUei = crawlData.detected_uei as string | null;
        if (!uei && detectedUei && detectedUei.length === 12) {
            uei = detectedUei;
        }

        // Persist what we have so far in one write (status="enriching"). Saves
        // a roundtrip vs. the previous N sequential updates and gives the
        // result page something concrete to render even if we die later.
        await sb.from("company_analyses").update({
            status: "enriching",
            crawl_data: crawlData,
            company_name: companyName,
            ...(uei ? { uei } : {}),
            ...(samData ? { sam_data: samData } : {}),
        }).eq("id", analysisId);

        // Step 2: Remaining SAM lookup (by name) + USASpending in parallel.
        // SAM-by-name is sequential (search → entity), but it can run alongside
        // USASpending which only needs the company name.
        const samByNamePromise: Promise<{ sam: Record<string, unknown> | null; uei: string | null }> = (!samData && companyName.length >= 3)
            ? (async () => {
                const discoveredUei = await searchSamByName(companyName);
                if (!discoveredUei) return { sam: null, uei: null };
                const sam = await lookupSamEntity(discoveredUei);
                return { sam, uei: sam ? discoveredUei : null };
            })().catch(() => ({ sam: null, uei: null as string | null }))
            : Promise.resolve({ sam: null, uei: null as string | null });

        // First USASpending pass uses whatever UEI we already have (may be null).
        // If samByName finds a UEI, we'll do a quick second pass — cheap (single
        // POST, 12s timeout) but more precise.
        const initialUsaPromise: Promise<UsaSpendingData | null> = lookupUsaSpending(companyName, uei || undefined).catch(() => null);

        const [samByName, initialUsa] = await Promise.all([samByNamePromise, initialUsaPromise]);

        let usaspendingData: UsaSpendingData | null = initialUsa;
        if (samByName.sam && !samData) {
            samData = samByName.sam;
            if (samByName.uei) uei = samByName.uei;
            if (samData.company_name) companyName = samData.company_name as string;
            // Re-run USASpending with the now-resolved UEI for precision.
            const refined = await lookupUsaSpending(companyName, uei || undefined).catch(() => null);
            if (refined && (refined.award_count > (usaspendingData?.award_count || 0))) {
                usaspendingData = refined;
            }
        }
        if (usaspendingData) crawlData.usaspending_data = usaspendingData;

        // Flip status to classifying and persist anything new we learned in the
        // enrichment block (sam_data via by-name search, USASpending data, the
        // possibly-updated company_name/uei). If the function gets killed
        // during classification, the row still has all this data.
        await sb.from("company_analyses").update({
            status: "classifying",
            company_name: companyName,
            crawl_data: crawlData,
            ...(uei ? { uei } : {}),
            ...(samData ? { sam_data: samData } : {}),
        }).eq("id", analysisId);

        // Step 3: NAICS classification — AI-FIRST
        // We call OpenAI gpt-4o with the full company context (name, description, services,
        // page content) and trust its confidence scores directly. The keyword classifier is
        // a fallback ONLY for the case where OpenAI is unavailable or fails.
        const description = (crawlData.description as string) || "";
        const services = (crawlData.services as string[]) || [];
        const pageContent = (crawlData.all_page_text as string) || "";
        const samNaics = samData ? (samData.naics_codes as string[]) : undefined;
        const usaNaics = usaspendingData?.naics_from_awards || [];

        // validDbCodes was pre-warmed in the parallel boot block above.
        const isValidNaicsCode = (code: string): boolean => {
            if (validDbCodes?.has(code)) return true;
            return NAICS_CODES.some((n: { code: string }) => n.code === code);
        };
        const labelForCode = (code: string): string => {
            const found = NAICS_CODES.find((n: { code: string; label: string }) => n.code === code);
            return found?.label || code;
        };

        let inferredNaics: Array<{ code: string; label: string; confidence: number; matched_keywords: string[] }> = [];

        // SAM.gov registered NAICS — these are authoritative, confidence 1.0
        if (samNaics?.length) {
            for (const code of samNaics) {
                if (isValidNaicsCode(code) && !inferredNaics.some(x => x.code === code)) {
                    inferredNaics.push({
                        code,
                        label: labelForCode(code),
                        confidence: 1.0,
                        matched_keywords: ["SAM.gov registration"],
                    });
                }
            }
        }

        // Past USASpending awards — also high confidence
        if (usaNaics.length > 0) {
            for (const code of usaNaics) {
                if (isValidNaicsCode(code) && !inferredNaics.some(x => x.code === code)) {
                    inferredNaics.push({
                        code,
                        label: labelForCode(code),
                        confidence: 0.95,
                        matched_keywords: ["Past federal award history"],
                    });
                }
            }
        }

        // Crawler-supplied suggestions — the unified Quick Checker pipeline ran
        // gpt-4o-mini against the markdown a few seconds ago, so we already have
        // good candidates. Use them directly to avoid a second gpt-4o call (was
        // adding 10-25s per analysis and frequently pushing us past Vercel's
        // 120s function ceiling, leaving the row stuck at "classifying").
        const crawlerNaics = (crawlData.naics_suggestions as Array<{
            code: string; label?: string; confidence?: number; reasoning?: string;
        }> | undefined) || [];
        let aiSucceeded = false;
        for (const c of crawlerNaics) {
            if (!isValidNaicsCode(c.code)) continue;
            aiSucceeded = true;
            const conf = typeof c.confidence === "number" ? c.confidence : 0.8;
            const existing = inferredNaics.find(x => x.code === c.code);
            if (existing) {
                existing.confidence = Math.max(existing.confidence, conf);
            } else {
                inferredNaics.push({
                    code: c.code,
                    label: c.label || labelForCode(c.code),
                    confidence: Math.min(conf, 0.95),
                    matched_keywords: c.reasoning ? [c.reasoning] : ["Crawler AI classification"],
                });
            }
        }

        // FALLBACK 1: explicit gpt-4o classification — only when the crawler
        // produced nothing usable. Rare path; the crawler step almost always
        // succeeds on real sites.
        if (!aiSucceeded && process.env.OPENAI_API_KEY) {
            const aiNaics = await inferNaicsOpenAI(companyName, description, services, pageContent);
            if (aiNaics.length > 0) {
                aiSucceeded = true;
                for (const ai of aiNaics) {
                    if (!isValidNaicsCode(ai.code)) continue;
                    const existing = inferredNaics.find(x => x.code === ai.code);
                    if (existing) {
                        existing.confidence = Math.max(existing.confidence, ai.confidence);
                    } else {
                        inferredNaics.push({
                            code: ai.code,
                            label: labelForCode(ai.code),
                            confidence: Math.min(ai.confidence, 0.95),
                            matched_keywords: ai.reason ? [ai.reason] : ["AI classification"],
                        });
                    }
                }
            }
        }

        // FALLBACK 2: pure-keyword classifier — only when both AI paths failed.
        if (!aiSucceeded && inferredNaics.length === 0) {
            const keywordResults = classifyNaics(description, services, pageContent);
            inferredNaics.push(...keywordResults);
        }

        // Sort by confidence DESC, cap at top 5
        inferredNaics.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
        inferredNaics = inferredNaics.slice(0, 5);

        // Build the initial inferred profile snapshot (everything the user
        // gets a chance to confirm/correct before we score).
        const certifications = (crawlData.certifications as { type: string; confidence: number }[]) || [];
        const locations = (crawlData.locations as { state?: string }[]) || [];
        const detectedStates = (crawlData.detected_states as string[]) || [];
        const samCerts = samData ? (samData.sba_certifications as string[]) : [];

        const initialCertifications = [
            ...(samCerts || []),
            ...certifications.filter(c => c.confidence > 0.7).map(c => c.type),
        ].filter((v, i, a) => a.indexOf(v) === i);

        const initialTargetStates = [
            ...(samData?.state ? [samData.state as string] : []),
            ...detectedStates,
        ].filter((v, i, a) => a.indexOf(v) === i);

        const initialState = (samData?.state as string) || locations[0]?.state || detectedStates[0] || "";

        const contacts = (crawlData.contacts as { email?: string; phone?: string }[]) || [];
        const employeeSignals = crawlData.employee_signals as { estimate: number } | null;
        const foundingYear = crawlData.founding_year as number | null;
        const leadership = (crawlData.leadership as { name: string; title: string; email?: string; phone?: string }[]) || [];

        const primaryLeader = leadership.find(l => {
            const t = l.title.toLowerCase();
            return ["ceo", "owner", "president", "founder"].some(k => t.includes(k));
        }) || leadership[0];

        const samPocs = samData ? (samData.points_of_contact as { name: string; title: string; email?: string; phone?: string }[]) || [] : [];
        const decisionMaker = primaryLeader || samPocs[0] || null;

        // NOTE: Apollo decision-maker enrichment runs AFTER the awaiting_confirmation
        // status flip below, fire-and-forget. The earlier inline call sat in the
        // critical path and occasionally hung the worker (no native timeout on the
        // Apollo SDK fetch), leaving the row stuck on "classifying" until Vercel
        // killed the function at 120s. Apollo data is non-critical for the confirm
        // step itself — phone numbers are used by the LeadMagnetForm a step later.

        const initialInferredProfile: Record<string, unknown> = {
            company_name: samData?.company_name || companyName,
            dba_name: samData?.dba_name || null,
            website,
            uei: uei || null,
            cage_code: samData?.cage_code || (crawlData.detected_cage_code as string) || null,
            address_line_1: samData?.address_line_1 || null,
            city: samData?.city || null,
            state: initialState,
            zip_code: samData?.zip_code || null,
            phone: (samData?.phone as string) || primaryLeader?.phone || contacts.find(c => c.phone)?.phone || null,
            email: primaryLeader?.email || contacts.find(c => c.email)?.email || null,
            naics_codes: inferredNaics.map(n => n.code),
            sba_certifications: initialCertifications,
            employee_count: employeeSignals?.estimate || null,
            years_in_business: foundingYear ? new Date().getFullYear() - foundingYear : null,
            annual_revenue_band: null,
            has_bonding: certifications.some(c => c.type === "bonding"),
            target_states: initialTargetStates,
            contact_person: decisionMaker ? {
                name: decisionMaker.name,
                title: decisionMaker.title,
                email: decisionMaker.email,
                phone: decisionMaker.phone,
                source: samPocs.length > 0 ? "sam_gov" : "website",
            } : null,
            apollo_enrichment: null,
            // Pre-fill keyword matching from the crawler's capability_keywords
            // extraction (primary tier → primary_keywords, secondary → secondary).
            // The user can edit these on the confirm step. Aliases get hydrated
            // from gov_keywords at score time.
            primary_keywords: (() => {
                const cks = (crawlData.capability_keywords as Array<{ keyword: string; tier?: "primary" | "secondary" }> | undefined) || [];
                return cks
                    .filter(k => k.tier === "primary" || !k.tier)
                    .map(k => ({ keyword: String(k.keyword || "").trim().toLowerCase() }))
                    .filter(k => k.keyword.length >= 2)
                    .filter((v, i, a) => a.findIndex(x => x.keyword === v.keyword) === i)
                    .slice(0, 8);
            })(),
            secondary_keywords: (() => {
                const cks = (crawlData.capability_keywords as Array<{ keyword: string; tier?: "primary" | "secondary" }> | undefined) || [];
                return cks
                    .filter(k => k.tier === "secondary")
                    .map(k => ({ keyword: String(k.keyword || "").trim().toLowerCase() }))
                    .filter(k => k.keyword.length >= 2)
                    .filter((v, i, a) => a.findIndex(x => x.keyword === v.keyword) === i)
                    .slice(0, 12);
            })(),
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

        // PAUSE THE PIPELINE — user reviews + confirms the data, then
        // /api/analyze-company/confirm fires runPostConfirmationPipeline() to
        // continue. This was added 2026-05-18 because crawler defaults
        // (employee count, NAICS, etc.) often look wrong, and showing the
        // user the raw output before scoring was killing conversion.
        // If we already have a lead email from earlier passes (e.g. a SAM POC),
        // preserve it on the first row write so the confirmation page can show
        // it pre-filled.
        const finalFallbackEmail = (decisionMaker?.email as string | undefined)
            || ((initialInferredProfile.email as string | undefined));
        const { data: currentRecord } = await sb.from("company_analyses").select("lead_email").eq("id", analysisId).maybeSingle();
        const emailUpdate = !currentRecord?.lead_email && finalFallbackEmail ? { lead_email: finalFallbackEmail } : {};

        await sb.from("company_analyses").update({
            status: "awaiting_confirmation",
            inferred_naics: inferredNaics,
            inferred_profile: initialInferredProfile,
            crawl_data: crawlData,
            ...emailUpdate,
        }).eq("id", analysisId);
        // Pipeline pauses here. /api/analyze-company/confirm resumes it.

        // Fire-and-forget Apollo enrichment — patches contact_person on the
        // existing row once it lands. The user is already on the confirm page
        // by the time this completes; if Apollo hangs we just never patch.
        if (decisionMaker) {
            const nameParts = decisionMaker.name.trim().split(/\s+/);
            const firstName = nameParts[0] || "";
            const lastName = nameParts.slice(1).join(" ") || "";
            const domain = website.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
            enrichPersonApollo(firstName, lastName, domain, companyName)
                .then(async (enriched) => {
                    if (!enriched) return;
                    const { data: row } = await sb.from("company_analyses").select("inferred_profile").eq("id", analysisId).maybeSingle();
                    const profile = (row?.inferred_profile || {}) as Record<string, unknown>;
                    const existingContact = (profile.contact_person as Record<string, unknown> | null) || {};
                    await sb.from("company_analyses").update({
                        inferred_profile: {
                            ...profile,
                            contact_person: {
                                ...existingContact,
                                title: enriched.title || existingContact.title,
                                email: enriched.email || existingContact.email,
                                mobile_phone: enriched.mobile_phone || existingContact.mobile_phone,
                                direct_phone: enriched.direct_phone || existingContact.direct_phone,
                                linkedin_url: enriched.linkedin_url || existingContact.linkedin_url,
                                source: "apollo",
                            },
                            apollo_enrichment: enriched,
                        },
                    }).eq("id", analysisId);
                })
                .catch(() => { /* swallow — Apollo is non-critical */ });
        }

    } catch (error) {
        console.error("Pipeline error:", error);
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

        let analysisId: string;
        let baseDomain = website;
        try { baseDomain = new URL(website).hostname.replace(/^www\./, ""); } catch {}

        const { data: existing } = await sb
            .from("company_analyses")
            .select("id")
            .ilike("website", `%${baseDomain}%`)
            .order("created_at", { ascending: false })
            .limit(1);

        if (existing && existing.length > 0) {
            // Reuse existing lead to prevent duplicates
            analysisId = existing[0].id;
            await sb.from("company_analyses").update({
                status: "crawling",
                ip_address: ip,
                ...(userProvidedName ? { company_name: companyName } : {}),
                ...(uei ? { uei } : {})
            }).eq("id", analysisId);
        } else {
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
            analysisId = analysis.id;
        }

        // NOTE: the pipeline lives in POST /api/analyze-company/run/[id]
        // and is triggered by the CLIENT after this response lands. We tried
        // two server-side patterns and both failed silently on Vercel:
        //
        //   1. after(() => runAnalysisPipeline(...))
        //   2. fetch(/api/analyze-company/run/:id) (fire-and-forget)
        //
        // In both, the worker was getting killed mid-classify with no error
        // (SIGTERM-style — the JS catch handler never ran). Verified on prod:
        // calling /run/:id directly from curl completes in ~33s and writes
        // awaiting_confirmation; same call kicked off server-side never
        // completed.
        //
        // The fix is to have the browser fire the /run request. As long as
        // the browser opens the connection, Vercel keeps the worker alive
        // independently of the parent — even if the user closes the tab,
        // the worker continues running because Vercel doesn't propagate
        // client disconnects to running functions.
        void userProvidedName;
        void runAnalysisPipeline;

        // Return immediately with the analysis ID — the client is expected
        // to POST /api/analyze-company/run/[id] right after this returns.
        return NextResponse.json({
            success: true,
            analysis_id: analysisId,
            status: "crawling",
            // Explicit signal to the client that it must trigger the worker.
            run_url: `/api/analyze-company/run/${analysisId}`,
        });

    } catch (error) {
        console.error("Analyze company error:", error);
        return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
    }
}
