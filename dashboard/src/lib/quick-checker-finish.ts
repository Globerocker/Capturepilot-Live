/**
 * Finishes the Quick Checker pipeline AFTER the user has confirmed/corrected
 * what the crawler found (status → "awaiting_confirmation").
 *
 * The post-confirmation steps:
 *   - score opportunities against the corrected profile (size-aware!)
 *   - generate a company summary
 *   - find top 3 competitors
 *   - compute readiness score
 *   - finalize → status "complete"
 *
 * Called from /api/analyze-company/confirm via `after()`.
 *
 * Critical: scoring now consumes employee_count + annual_revenue_band from
 * the confirmed profile, so a 500-person firm no longer gets small-biz
 * set-aside matches.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
    scoreOpportunityLeadMagnet,
    type ProfileForScoring,
    type OpportunityForScoring,
} from "@/lib/match-scoring";
import { generateCertRecommendations } from "@/lib/cert-recommendations";
import { findCompetitors, computeReadinessScore } from "@/lib/quick-checker-helpers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

function makeDb(): SupabaseClient {
    return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

interface UsaSpendingDataLite {
    award_count: number;
    agencies?: string[];
}

interface ScoredMatch {
    opportunity_id: string;
    title?: string;
    agency?: string;
    naics_code?: string;
    set_aside_code?: string;
    response_deadline?: string;
    notice_type?: string;
    award_amount?: number;
    notice_id?: string;
    place_of_performance_state?: string;
    description_url?: string;
    score: number;
    classification: string;
    score_breakdown: Record<string, number>;
}

async function generateSummary(
    companyName: string,
    description: string,
    services: string[],
    certifications: { type: string }[],
): Promise<string> {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
        const parts = [description];
        if (services.length > 0) parts.push(`Services include: ${services.slice(0, 5).join(", ")}.`);
        if (certifications.length > 0) parts.push(`Certifications: ${certifications.map(c => c.type).join(", ")}.`);
        return parts.filter(Boolean).join(" ").substring(0, 500);
    }

    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${openaiKey}` },
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

    if (!samData) {
        wins.push({
            title: "Register on SAM.gov",
            description: "SAM.gov registration is required to bid on federal contracts. Free registration unlocks access to all government opportunities.",
            impact: "high",
            category: "registration",
        });
    }

    if (!tempProfile.sba_certifications || tempProfile.sba_certifications.length === 0) {
        wins.push({
            title: "Explore SBA Certifications",
            description: "SBA certifications like 8(a), HUBZone, or WOSB unlock set-aside contracts with less competition. Many have streamlined application processes.",
            impact: "high",
            category: "certifications",
        });
    }

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

    if (tempProfile.target_states.length <= 1) {
        wins.push({
            title: "Expand Your Target States",
            description: "Adding more target states significantly increases the number of matching opportunities. Many federal contracts allow remote or multi-state performance.",
            impact: "medium",
            category: "profile",
        });
    }

    const contacts = (crawlData.contacts as { email?: string; phone?: string }[]) || [];
    if (contacts.length === 0) {
        wins.push({
            title: "Add Contact Info to Your Website",
            description: "Government contracting officers look for easy-to-find contact information. Adding a clear contact page improves your credibility.",
            impact: "low",
            category: "website",
        });
    }

    const pastClients = (crawlData.past_clients as string[]) || [];
    if (pastClients.length === 0 && tempProfile.federal_awards_count === 0) {
        wins.push({
            title: "Highlight Past Performance",
            description: "Even commercial or state/local contracts count. Add a past performance section to your website to strengthen your government contracting position.",
            impact: "medium",
            category: "profile",
        });
    }

    return wins.slice(0, 5);
}

export async function runPostConfirmationPipeline(analysisId: string): Promise<void> {
    const sb = makeDb();

    try {
        const { data: analysis, error } = await sb
            .from("company_analyses")
            .select("*")
            .eq("id", analysisId)
            .single();

        if (error || !analysis) {
            console.error("runPostConfirmationPipeline — analysis not found:", analysisId);
            return;
        }

        const companyName = analysis.company_name as string;
        const crawlData = (analysis.crawl_data || {}) as Record<string, unknown>;
        const samData = (analysis.sam_data || null) as Record<string, unknown> | null;
        const inferredNaics = (analysis.inferred_naics || []) as Array<{ code: string; label: string; confidence: number; matched_keywords: string[] }>;
        const inferredProfile = (analysis.inferred_profile || {}) as Record<string, unknown>;
        const usaspendingData = (crawlData.usaspending_data as UsaSpendingDataLite | undefined) || null;

        await sb.from("company_analyses").update({ status: "scoring" }).eq("id", analysisId);

        // Build tempProfile from CONFIRMED data
        const certifications = (crawlData.certifications as { type: string; confidence: number }[]) || [];
        const detectedStates = (crawlData.detected_states as string[]) || [];

        const tempProfile: ProfileForScoring = {
            naics_codes: ((inferredProfile.naics_codes as string[]) || inferredNaics.map(n => n.code)),
            sba_certifications: ((inferredProfile.sba_certifications as string[]) || []),
            state: (inferredProfile.state as string) || (samData?.state as string) || detectedStates[0] || "",
            target_states: ((inferredProfile.target_states as string[]) || [
                ...(samData?.state ? [samData.state as string] : []),
                ...detectedStates,
            ]).filter((v, i, a) => a.indexOf(v) === i),
            revenue: null,
            federal_awards_count: usaspendingData?.award_count || 0,
            target_psc_codes: [],
            preferred_agencies: usaspendingData?.agencies || [],
            // ── Size-aware scoring (added in 2026-05-18 sprint) ──
            employee_count: (inferredProfile.employee_count as number) || null,
            annual_revenue_band: (inferredProfile.annual_revenue_band as string) || null,
        };

        // On-demand NAICS crawl when we lack coverage in DB
        const naicsCodesToCheck = tempProfile.naics_codes.slice(0, 5);
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

        // Score against opportunities — primary NAICS only
        const primaryNaics = tempProfile.naics_codes.slice(0, 5);
        const allOpps: OpportunityForScoring[] = [];

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

        const scoredMatches: ScoredMatch[] = [];
        for (const opp of allOpps) {
            const result = scoreOpportunityLeadMagnet(tempProfile, opp);
            if (result) scoredMatches.push({ ...result });
        }
        scoredMatches.sort((a, b) => b.score - a.score);
        const topCandidates = scoredMatches.slice(0, 40);

        // Enrich top candidates
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

        // Deduplicate by title
        const seenTitles = new Set<string>();
        topMatches = topCandidates.filter(m => {
            const title = (m.title || "").toLowerCase().trim().replace(/\s+/g, " ").slice(0, 60);
            if (!title || seenTitles.has(title)) return false;
            seenTitles.add(title);
            return true;
        }).slice(0, 10);

        await sb.from("company_analyses").update({ status: "generating" }).eq("id", analysisId);

        // Cert recommendations (need titles for primary opps)
        const oppIdsForCerts = allOpps.slice(0, 500).map(o => o.id);
        const oppTitleMap = new Map<string, string>();
        if (oppIdsForCerts.length > 0) {
            for (let i = 0; i < oppIdsForCerts.length; i += 100) {
                const chunk = oppIdsForCerts.slice(i, i + 100);
                const { data: titleBatch } = await sb
                    .from("opportunities")
                    .select("id, title")
                    .in("id", chunk);
                if (titleBatch) for (const o of titleBatch) oppTitleMap.set(o.id, o.title);
            }
        }
        const oppsWithTitles = allOpps.map(o => ({ ...o, title: oppTitleMap.get(o.id) || undefined }));

        const certRecommendations = generateCertRecommendations(
            tempProfile.sba_certifications,
            oppsWithTitles,
            tempProfile.naics_codes,
        );

        // Easy wins (post-confirmation: use confirmed profile)
        const easyWins = computeEasyWins(crawlData, samData, inferredNaics, tempProfile);

        // Generate company summary
        const description = (crawlData.description as string) || "";
        const services = (crawlData.services as string[]) || [];
        const summary = await generateSummary(companyName, description, services, certifications);

        // Find Top 3 Competitors via USASpending
        await sb.from("company_analyses").update({ status: "finding_competitors" }).eq("id", analysisId);
        const competitors = await findCompetitors(
            companyName,
            tempProfile.naics_codes.slice(0, 3),
            tempProfile.state || null,
        );

        // Readiness Score (with confirmed certs/data)
        const { score: readinessScore, breakdown: readinessBreakdown } = computeReadinessScore({
            samData,
            crawlData: {
                ...crawlData,
                // Override with confirmed values so the score reflects what the user said
                employee_count: tempProfile.employee_count || (crawlData.employee_count as number) || 0,
            },
            certifications: [
                ...certifications,
                ...((tempProfile.sba_certifications || []).map(t => ({ type: t, confidence: 1 }))),
            ],
            usaspendingAwardCount: usaspendingData?.award_count || 0,
        });

        // Finalize
        await sb.from("company_analyses").update({
            status: "complete",
            company_summary: summary,
            preview_matches: topMatches,
            cert_recommendations: certRecommendations,
            easy_wins: easyWins,
            readiness_score: readinessScore,
            readiness_breakdown: readinessBreakdown,
            competitors,
        }).eq("id", analysisId);

    } catch (error) {
        console.error("runPostConfirmationPipeline error:", error);
        await sb.from("company_analyses").update({
            status: "error",
            error_message: (error as Error).message || "Pipeline failed after confirmation",
        }).eq("id", analysisId);
    }
}
