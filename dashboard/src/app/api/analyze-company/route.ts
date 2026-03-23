import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import { classifyNaics } from "@/lib/naics-classifier";
import { scoreOpportunityLeadMagnet, type ProfileForScoring, type OpportunityForScoring } from "@/lib/match-scoring";
import { generateCertRecommendations } from "@/lib/cert-recommendations";

const execAsync = promisify(exec);

export const maxDuration = 90;

const SAM_API_KEY = process.env.SAM_API_KEY || "";
const SAM_ENTITY_URL = "https://api.sam.gov/entity-information/v3/entities";

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
        };
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
// USASpending ENRICHMENT
// ---------------------------------------------------------------------------
async function lookupUsaSpending(companyName: string): Promise<{ award_count: number; total_value: number; agencies: string[]; naics_from_awards: string[] } | null> {
    try {
        const response = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                filters: {
                    recipient_search_text: [companyName],
                    time_period: [{ start_date: "2019-01-01", end_date: new Date().toISOString().split("T")[0] }],
                },
                fields: ["Award ID", "Recipient Name", "Award Amount", "Awarding Agency", "NAICS Code"],
                limit: 50,
                page: 1,
                sort: "Award Amount",
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

        return { award_count: results.length, total_value: totalValue, agencies, naics_from_awards: naicsCodes };
    } catch {
        return null;
    }
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
// MAIN HANDLER
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    try {
        const body = await request.json();
        const companyName = sanitizeCompanyName(body.company_name || "");
        const website = normalizeUrl(body.website || "");
        const uei = (body.uei || "").trim().toUpperCase();

        // Validate inputs
        if (!companyName || companyName.length < 2) {
            return NextResponse.json({ error: "Company name is required" }, { status: 400 });
        }
        if (!isValidUrl(website)) {
            return NextResponse.json({ error: "Valid website URL is required" }, { status: 400 });
        }

        // Rate limiting: max 20 analyses per IP per hour
        const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { count } = await sb
            .from("company_analyses")
            .select("id", { count: "exact", head: true })
            .eq("ip_address", ip)
            .gte("created_at", oneHourAgo);

        if ((count || 0) >= 20) {
            return NextResponse.json(
                { error: "Rate limit exceeded. Please try again later." },
                { status: 429 }
            );
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

        // Step 1: Run Python crawler
        let crawlData: Record<string, unknown> = {};
        try {
            const toolsDir = path.resolve(process.cwd(), "..", "tools");
            const cmd = `python3 "${toolsDir}/17_analyze_company.py" --company_name "${companyName.replace(/"/g, '\\"')}" --website "${website.replace(/"/g, '\\"')}"`;

            const { stdout } = await execAsync(cmd, { timeout: 65000 });
            const result = JSON.parse(stdout.trim());
            if (result.success && result.data) {
                crawlData = result.data;
            }
        } catch {
            // Crawler failed - continue with partial data
        }

        await sb.from("company_analyses").update({ status: "classifying", crawl_data: crawlData }).eq("id", analysisId);

        // Step 2: SAM.gov lookup (if UEI provided)
        let samData: Record<string, unknown> | null = null;
        if (uei && uei.length === 12) {
            samData = await lookupSamEntity(uei);
        }

        if (samData) {
            await sb.from("company_analyses").update({ sam_data: samData }).eq("id", analysisId);
        }

        // Step 2.5: USASpending enrichment (if crawl data is thin)
        let usaspendingData: { award_count: number; total_value: number; agencies: string[]; naics_from_awards: string[] } | null = null;
        const crawlDescription = (crawlData.description as string) || "";
        const crawlServices = (crawlData.services as string[]) || [];
        if (crawlDescription.length < 100 && crawlServices.length < 3) {
            usaspendingData = await lookupUsaSpending(companyName);
            if (usaspendingData) {
                crawlData.usaspending_data = usaspendingData;
            }
        }

        // Step 3: NAICS classification
        const description = (crawlData.description as string) || "";
        const services = (crawlData.services as string[]) || [];
        const pageContent = (crawlData.pages_crawled as string[])?.join(" ") || "";
        const samNaics = samData ? (samData.naics_codes as string[]) : undefined;

        const inferredNaics = classifyNaics(description, services, pageContent, samNaics);

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

        // Step 5: Score against opportunities
        const allOpps: OpportunityForScoring[] = [];
        let offset = 0;
        const batchSize = 1000;
        while (true) {
            const { data: batch } = await sb
                .from("opportunities")
                .select("id, naics_code, psc_code, notice_type, agency, set_aside_code, place_of_performance_state, award_amount, response_deadline")
                .eq("is_archived", false)
                .range(offset, offset + batchSize - 1);
            if (!batch || batch.length === 0) break;
            allOpps.push(...(batch as unknown as OpportunityForScoring[]));
            if (batch.length < batchSize) break;
            offset += batchSize;
        }

        const scoredMatches: { opportunity_id: string; title?: string; agency?: string; naics_code?: string; set_aside_code?: string; response_deadline?: string; score: number; classification: string; score_breakdown: Record<string, number> }[] = [];

        for (const opp of allOpps) {
            const result = scoreOpportunityLeadMagnet(tempProfile, opp);
            if (result) {
                scoredMatches.push({
                    ...result,
                });
            }
        }

        scoredMatches.sort((a, b) => b.score - a.score);
        const topMatches = scoredMatches.slice(0, 10);

        // Enrich top matches with opportunity details
        if (topMatches.length > 0) {
            const oppIds = topMatches.map(m => m.opportunity_id);
            const { data: oppDetails } = await sb
                .from("opportunities")
                .select("id, title, agency, naics_code, set_aside_code, response_deadline, notice_type")
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
                    }
                }
            }
        }

        // Step 5.5: Certification recommendations
        // Enrich allOpps with titles for sample opps in cert recs
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

        // Step 5.6: Easy wins
        const easyWins = computeEasyWins(crawlData, samData, inferredNaics, tempProfile);

        // Step 6: Generate company summary
        const summary = await generateSummary(companyName, description, services, certifications);

        // Step 7: Build inferred profile for onboarding pre-fill
        const contacts = (crawlData.contacts as { email?: string; phone?: string }[]) || [];
        const employeeSignals = crawlData.employee_signals as { estimate: number } | null;
        const foundingYear = crawlData.founding_year as number | null;

        const inferredProfile: Record<string, unknown> = {
            company_name: samData?.company_name || companyName,
            dba_name: samData?.dba_name || null,
            website,
            uei: uei || null,
            cage_code: samData?.cage_code || null,
            address_line_1: samData?.address_line_1 || null,
            city: samData?.city || locations[0]?.state ? null : null,
            state: samData?.state || detectedStates[0] || null,
            zip_code: samData?.zip_code || null,
            phone: samData?.phone || contacts.find(c => c.phone)?.phone || null,
            email: contacts.find(c => c.email)?.email || null,
            naics_codes: inferredNaics.map(n => n.code),
            sba_certifications: tempProfile.sba_certifications,
            employee_count: employeeSignals?.estimate || null,
            years_in_business: foundingYear ? new Date().getFullYear() - foundingYear : null,
            has_bonding: certifications.some(c => c.type === "bonding"),
            target_states: tempProfile.target_states,
        };

        // Step 8: Save everything
        await sb.from("company_analyses").update({
            status: "complete",
            company_summary: summary,
            preview_matches: topMatches,
            inferred_profile: inferredProfile,
            inferred_naics: inferredNaics,
            crawl_data: crawlData,
            cert_recommendations: certRecommendations,
            easy_wins: easyWins,
        }).eq("id", analysisId);

        return NextResponse.json({
            success: true,
            analysis_id: analysisId,
            company_summary: summary,
            crawl_data: crawlData,
            sam_data: samData,
            inferred_naics: inferredNaics,
            preview_matches: topMatches,
            inferred_profile: inferredProfile,
            cert_recommendations: certRecommendations,
            easy_wins: easyWins,
            total_matches_found: scoredMatches.length,
        });

    } catch (error) {
        console.error("Analyze company error:", error);
        return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
    }
}
