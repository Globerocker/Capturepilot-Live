import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { classifyNaics } from "@/lib/naics-classifier";
import { NAICS_CODES } from "@/lib/naics-codes";
import { scoreOpportunityLeadMagnet, type ProfileForScoring, type OpportunityForScoring } from "@/lib/match-scoring";
import { generateCertRecommendations } from "@/lib/cert-recommendations";
import { analyzeCompany } from "@/lib/crawler";
import { findCompetitors, computeReadinessScore } from "@/lib/quick-checker-helpers";

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
    } catch {
        // fail silently
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

        // Sort NAICS by confidence (highest first) so the strongest match shows first in the UI
        inferredNaics.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

        await sb.from("company_analyses").update({ status: "scoring", inferred_naics: inferredNaics }).eq("id", analysisId);

        // Step 4: Build temporary profile for scoring
        const certifications = (crawlData.certifications as { type: string; confidence: number }[]) || [];
        const locations = (crawlData.locations as { state?: string }[]) || [];
        const detectedStates = (crawlData.detected_states as string[]) || [];
        const samCerts = samData ? (samData.sba_certifications as string[]) : [];

        const tempProfile: ProfileForScoring = {
            naics_codes: inferredNaics.map(n => n.code),
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
        const naicsCodesToCheck = inferredNaics.map(n => n.code).slice(0, 5);
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

        // Step 6: Score against opportunities — ONLY matching NAICS codes (not all 40K+)
        const primaryNaics = inferredNaics.slice(0, 5).map(n => n.code);
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
        // Take top 40 candidates (will deduplicate after enrichment with titles)
        const topCandidates = scoredMatches.slice(0, 40);

        // Enrich candidates with full opportunity details, then deduplicate by title
        let topMatches = topCandidates;
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

        // ── Find Top 3 Competitors via USASpending ──
        // Strategy: filter by SAME NAICS as the analyzed company, prefer competitors in the
        // same state when possible, then enrich with SAM website lookups so users can click through.
        await sb.from("company_analyses").update({ status: "finding_competitors" }).eq("id", analysisId);
        const competitors = await findCompetitors(
            companyName,
            inferredNaics.slice(0, 3).map(n => n.code),
            (samData?.state as string) || detectedStates[0] || null,
        );

        // ── Government Contracting Readiness Score (0-10) ──
        const { score: readinessScore, breakdown: readinessBreakdown } = computeReadinessScore({
            samData,
            crawlData,
            certifications,
            usaspendingAwardCount: usaspendingData?.award_count || 0,
        });

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
            readiness_score: readinessScore,
            readiness_breakdown: readinessBreakdown,
            competitors: competitors,
        }).eq("id", analysisId);

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

        // Run the full pipeline in the background after response is sent
        after(async () => {
            await runAnalysisPipeline(analysisId, companyName, website, uei, userProvidedName);
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
