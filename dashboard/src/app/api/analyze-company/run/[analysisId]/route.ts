import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { classifyNaics } from "@/lib/naics-classifier";
import { NAICS_CODES } from "@/lib/naics-codes";
import { analyzeCompany } from "@/lib/crawler";

// Dedicated worker endpoint that runs the analyze pipeline INLINE (no
// after() callback). This avoids Vercel after()'s undocumented timing
// constraints which were silently killing rows mid-classification.
//
// The POST /api/analyze-company handler triggers this via fire-and-forget
// fetch; the client never awaits this response — it just polls
// /api/analyze-company/status/[id].
export const maxDuration = 300;

const SAM_API_KEY = process.env.SAM_API_KEY || "";
const SAM_ENTITY_URL = "https://api.sam.gov/entity-information/v3/entities";

const APOLLO_API_KEY = process.env.APOLLO_API_KEY || "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

function makeDb() {
    return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

// ---------------------------------------------------------------------------
// SAM.gov ENTITY LOOKUP
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
        const reg = (entities[0].entityRegistration || {}) as Record<string, unknown>;
        const uei = String(reg.ueiSAM || "");
        return uei.length === 12 ? uei : null;
    } catch {
        return null;
    }
}

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
        const sortedByDate = [...results].sort((a, b) => {
            const da = String(a["Start Date"] || "");
            const db = String(b["Start Date"] || "");
            return db.localeCompare(da);
        });
        const lastAward = sortedByDate[0];
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

async function inferNaicsOpenAI(
    companyName: string,
    description: string,
    services: string[],
    pageContent: string
): Promise<Array<{ code: string; confidence: number; reason: string }>> {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) return [];
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
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${openaiKey}` },
            body: JSON.stringify({
                model: "gpt-4o",
                messages: [
                    { role: "system", content: "You are a NAICS classification expert. Return JSON: {\"codes\":[{\"code\":\"123456\",\"confidence\":0.9,\"reason\":\"...\"}]}. Be conservative — 1 accurate code beats 3 mediocre ones." },
                    { role: "user", content: userMsg },
                ],
                max_tokens: 500,
                temperature: 0.0,
                response_format: { type: "json_object" },
            }),
            signal: AbortSignal.timeout(25000),
        });
        if (!response.ok) return [];
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
    } catch {
        return [];
    }
}

async function enrichPersonApollo(
    firstName: string,
    lastName: string,
    domain: string,
    organizationName?: string,
): Promise<{ mobile_phone?: string; direct_phone?: string; email?: string; linkedin_url?: string; title?: string } | null> {
    if (!APOLLO_API_KEY || !firstName || !lastName) return null;
    try {
        const payload: Record<string, unknown> = { first_name: firstName, last_name: lastName };
        if (domain) payload.domain = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
        if (organizationName) payload.organization_name = organizationName;
        const res = await fetch("https://api.apollo.io/api/v1/people/match", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Api-Key": APOLLO_API_KEY },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(6000),
        });
        if (!res.ok) return null;
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
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// MAIN HANDLER — runs the pipeline inline, returns final state
// ---------------------------------------------------------------------------
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ analysisId: string }> },
) {
    const { analysisId } = await params;
    const sb = makeDb();

    // Look up the seed row created by /api/analyze-company.
    const { data: seed, error: seedError } = await sb
        .from("company_analyses")
        .select("id, website, company_name, uei, status, inferred_profile")
        .eq("id", analysisId)
        .maybeSingle();

    if (seedError || !seed) {
        return NextResponse.json({ error: "Analysis row not found" }, { status: 404 });
    }

    // Idempotency: if the pipeline already finished, don't re-run.
    if (["awaiting_naics_selection", "scoring", "finding_opportunities", "finding_competitors", "generating", "complete"].includes(seed.status as string)) {
        return NextResponse.json({ success: true, status: seed.status, note: "already past classify" });
    }

    const website = seed.website as string;
    const initialUei = (seed.uei as string | null) || "";
    let companyName = (seed.company_name as string) || "";
    const userProvidedName = !!companyName && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(companyName);
    let uei = initialUei;

    try {
        // Parallel boot: SAM (if UEI) + crawl + NAICS whitelist prefetch.
        const initialSamPromise: Promise<Record<string, unknown> | null> = (uei && uei.length === 12)
            ? lookupSamEntity(uei)
            : Promise.resolve(null);
        const crawlPromise: Promise<{ success: boolean; data: Record<string, unknown>; errors: string[] }> = website
            ? analyzeCompany(companyName, website).then(r => ({ success: r.success, data: r.data as unknown as Record<string, unknown>, errors: r.errors })).catch(e => ({ success: false, data: {} as Record<string, unknown>, errors: [(e as Error).message || "crawl failed"] }))
            : Promise.resolve({ success: false, data: {} as Record<string, unknown>, errors: [] });
        const validNaicsPromise: Promise<Set<string> | null> = (async () => {
            try {
                const { data } = await sb.from("naics_codes").select("code");
                return new Set(((data || []) as { code: string }[]).map(r => r.code));
            } catch { return null; }
        })();

        const [samFromUei, crawlResult, validDbCodes] = await Promise.all([initialSamPromise, crawlPromise, validNaicsPromise]);

        let samData: Record<string, unknown> | null = samFromUei;
        if (samData) companyName = (samData.company_name as string) || companyName;

        const crawlData: Record<string, unknown> = crawlResult.data || {};
        if (crawlResult.errors.length > 0) console.warn("Crawl warnings:", crawlResult.errors);

        const crawledName = crawlData.company_name as string | undefined;
        if (!userProvidedName && crawledName && crawledName.length > 1) companyName = crawledName;

        const detectedUei = crawlData.detected_uei as string | null;
        if (!uei && detectedUei && detectedUei.length === 12) uei = detectedUei;

        await sb.from("company_analyses").update({
            status: "enriching",
            crawl_data: crawlData,
            company_name: companyName,
            ...(uei ? { uei } : {}),
            ...(samData ? { sam_data: samData } : {}),
        }).eq("id", analysisId);

        // SAM-by-name + USASpending in parallel.
        const samByNamePromise: Promise<{ sam: Record<string, unknown> | null; uei: string | null }> = (!samData && companyName.length >= 3)
            ? (async () => {
                const discoveredUei = await searchSamByName(companyName);
                if (!discoveredUei) return { sam: null, uei: null };
                const sam = await lookupSamEntity(discoveredUei);
                return { sam, uei: sam ? discoveredUei : null };
            })().catch(() => ({ sam: null, uei: null as string | null }))
            : Promise.resolve({ sam: null, uei: null as string | null });

        const initialUsaPromise: Promise<UsaSpendingData | null> = lookupUsaSpending(companyName, uei || undefined).catch(() => null);
        const [samByName, initialUsa] = await Promise.all([samByNamePromise, initialUsaPromise]);

        let usaspendingData: UsaSpendingData | null = initialUsa;
        if (samByName.sam && !samData) {
            samData = samByName.sam;
            if (samByName.uei) uei = samByName.uei;
            if (samData.company_name) companyName = samData.company_name as string;
            const refined = await lookupUsaSpending(companyName, uei || undefined).catch(() => null);
            if (refined && (refined.award_count > (usaspendingData?.award_count || 0))) usaspendingData = refined;
        }
        if (usaspendingData) crawlData.usaspending_data = usaspendingData;

        await sb.from("company_analyses").update({
            status: "classifying",
            company_name: companyName,
            crawl_data: crawlData,
            ...(uei ? { uei } : {}),
            ...(samData ? { sam_data: samData } : {}),
        }).eq("id", analysisId);

        // NAICS classification
        const description = (crawlData.description as string) || "";
        const services = (crawlData.services as string[]) || [];
        const pageContent = (crawlData.all_page_text as string) || "";
        const samNaics = samData ? (samData.naics_codes as string[]) : undefined;
        const usaNaics = usaspendingData?.naics_from_awards || [];

        const isValidNaicsCode = (code: string): boolean => {
            if (validDbCodes?.has(code)) return true;
            return NAICS_CODES.some((n: { code: string }) => n.code === code);
        };
        const labelForCode = (code: string): string => {
            const found = NAICS_CODES.find((n: { code: string; label: string }) => n.code === code);
            return found?.label || code;
        };

        let inferredNaics: Array<{ code: string; label: string; confidence: number; matched_keywords: string[] }> = [];

        if (samNaics?.length) {
            for (const code of samNaics) {
                if (isValidNaicsCode(code) && !inferredNaics.some(x => x.code === code)) {
                    inferredNaics.push({ code, label: labelForCode(code), confidence: 1.0, matched_keywords: ["SAM.gov registration"] });
                }
            }
        }

        if (usaNaics.length > 0) {
            for (const code of usaNaics) {
                if (isValidNaicsCode(code) && !inferredNaics.some(x => x.code === code)) {
                    inferredNaics.push({ code, label: labelForCode(code), confidence: 0.95, matched_keywords: ["Past federal award history"] });
                }
            }
        }

        const crawlerNaics = (crawlData.naics_suggestions as Array<{ code: string; label?: string; confidence?: number; reasoning?: string; matched_keywords?: string[] }> | undefined) || [];
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
                    matched_keywords: c.reasoning ? [c.reasoning] : (c.matched_keywords || ["Crawler AI classification"]),
                });
            }
        }

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

        if (!aiSucceeded && inferredNaics.length === 0) {
            const keywordResults = classifyNaics(description, services, pageContent);
            inferredNaics.push(...keywordResults);
        }

        inferredNaics.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
        inferredNaics = inferredNaics.slice(0, 5);

        // Build the inferred profile snapshot
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

        // Final atomic write — pause for user confirmation
        const finalFallbackEmail = (decisionMaker?.email as string | undefined)
            || ((initialInferredProfile.email as string | undefined));
        const { data: currentRecord } = await sb.from("company_analyses").select("lead_email").eq("id", analysisId).maybeSingle();
        const emailUpdate = !currentRecord?.lead_email && finalFallbackEmail ? { lead_email: finalFallbackEmail } : {};

        await sb.from("company_analyses").update({
            status: "awaiting_naics_selection",
            inferred_naics: inferredNaics,
            inferred_profile: initialInferredProfile,
            crawl_data: crawlData,
            ...emailUpdate,
        }).eq("id", analysisId);

        // Fire-and-forget Apollo enrichment.
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
                .catch(() => {});
        }

        return NextResponse.json({ success: true, status: "awaiting_naics_selection", analysis_id: analysisId });

    } catch (error) {
        console.error("Pipeline error:", error);
        await sb.from("company_analyses").update({
            status: "error",
            error_message: (error as Error).message || "Pipeline failed",
        }).eq("id", analysisId);
        return NextResponse.json({ error: (error as Error).message || "Pipeline failed" }, { status: 500 });
    }
}
