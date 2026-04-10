import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { scoreOpportunityLeadMagnet, type ProfileForScoring, type OpportunityForScoring } from "@/lib/match-scoring";
import { findCompetitors, computeReadinessScore } from "@/lib/quick-checker-helpers";
import { NAICS_CODES } from "@/lib/naics-codes";

export const maxDuration = 60;

type ScoredMatch = {
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
};

/**
 * Re-run scoring + competitors + readiness against a new set of NAICS codes.
 * Reuses crawl_data, sam_data, and usaspending data from the original analysis.
 * Used by the "Edit NAICS codes" button on the Quick Checker results page.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const analysisId = body.analysis_id as string;
        const naicsCodes = (body.naics_codes as string[]) || [];

        if (!analysisId) {
            return NextResponse.json({ error: "analysis_id is required" }, { status: 400 });
        }
        if (!Array.isArray(naicsCodes) || naicsCodes.length === 0) {
            return NextResponse.json({ error: "At least one NAICS code is required" }, { status: 400 });
        }
        // Validate NAICS codes (6 digits)
        const cleanCodes = naicsCodes
            .map(c => String(c).trim())
            .filter(c => /^\d{6}$/.test(c))
            .slice(0, 5);
        if (cleanCodes.length === 0) {
            return NextResponse.json({ error: "Invalid NAICS codes — must be 6 digits" }, { status: 400 });
        }

        const sb = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_KEY!,
        );

        // Load existing analysis
        const { data: analysis, error } = await sb
            .from("company_analyses")
            .select("*")
            .eq("id", analysisId)
            .single();
        if (error || !analysis) {
            return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
        }

        const companyName = analysis.company_name as string;
        const crawlData = (analysis.crawl_data || {}) as Record<string, unknown>;
        const samData = (analysis.sam_data || null) as Record<string, unknown> | null;
        const certifications = (crawlData.certifications as { type: string; confidence: number }[]) || [];
        const detectedStates = (crawlData.detected_states as string[]) || [];

        // Build new inferredNaics array with the user's selection.
        // Keep label/keywords from the static catalog, mark confidence high (user picked them).
        const newInferredNaics = cleanCodes.map(code => {
            const known = NAICS_CODES.find(n => n.code === code);
            return {
                code,
                label: known?.label || code,
                confidence: 0.95,
                matched_keywords: ["user selected"],
            };
        });

        // Build profile for scoring
        const samCerts = (samData?.sba_certifications as string[]) || [];
        const tempProfile: ProfileForScoring = {
            naics_codes: cleanCodes,
            sba_certifications: [
                ...samCerts,
                ...certifications.filter(c => c.confidence > 0.7).map(c => c.type),
            ].filter((v, i, a) => a.indexOf(v) === i),
            state: (samData?.state as string) || detectedStates[0] || "",
            target_states: [
                ...(samData?.state ? [samData.state as string] : []),
                ...detectedStates,
            ].filter((v, i, a) => a.indexOf(v) === i),
            revenue: null,
            federal_awards_count: 0,
            target_psc_codes: [],
            preferred_agencies: [],
        };

        // Fetch opportunities matching the new NAICS codes
        const allOpps: OpportunityForScoring[] = [];
        let offset = 0;
        const batchSize = 1000;
        while (true) {
            const { data: batch } = await sb
                .from("opportunities")
                .select("id, naics_code, psc_code, notice_type, agency, set_aside_code, place_of_performance_state, award_amount, response_deadline")
                .eq("is_archived", false)
                .in("naics_code", cleanCodes)
                .range(offset, offset + batchSize - 1);
            if (!batch || batch.length === 0) break;
            allOpps.push(...(batch as unknown as OpportunityForScoring[]));
            if (batch.length < batchSize) break;
            offset += batchSize;
        }

        // Score
        const scoredMatches: ScoredMatch[] = [];
        for (const opp of allOpps) {
            const result = scoreOpportunityLeadMagnet(tempProfile, opp);
            if (result) scoredMatches.push({ ...result });
        }
        scoredMatches.sort((a, b) => b.score - a.score);
        const topCandidates = scoredMatches.slice(0, 40);

        // Enrich candidates with full opportunity details
        if (topCandidates.length > 0) {
            const oppIds = topCandidates.map(m => m.opportunity_id);
            const { data: oppDetails } = await sb
                .from("opportunities")
                .select("id, title, agency, naics_code, set_aside_code, response_deadline, notice_type, award_amount, notice_id, place_of_performance_state, description")
                .in("id", oppIds);
            if (oppDetails) {
                const detailMap = new Map(oppDetails.map(o => [o.id, o]));
                for (const match of topCandidates) {
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
        const topMatches = topCandidates.filter(m => {
            const title = (m.title || "").toLowerCase().trim().replace(/\s+/g, " ").slice(0, 60);
            if (!title || seenTitles.has(title)) return false;
            seenTitles.add(title);
            return true;
        }).slice(0, 10);

        // Re-find competitors with new NAICS
        const competitors = await findCompetitors(
            companyName,
            cleanCodes.slice(0, 3),
            (samData?.state as string) || detectedStates[0] || null,
        );

        // Recompute readiness (uses new cert data but rest stays same)
        const { score: readinessScore, breakdown: readinessBreakdown } = computeReadinessScore({
            samData,
            crawlData,
            certifications,
            usaspendingAwardCount: 0,
        });

        // Persist
        await sb
            .from("company_analyses")
            .update({
                inferred_naics: newInferredNaics,
                preview_matches: topMatches,
                competitors,
                readiness_score: readinessScore,
                readiness_breakdown: readinessBreakdown,
            })
            .eq("id", analysisId);

        return NextResponse.json({
            success: true,
            match_count: topMatches.length,
            competitor_count: competitors.length,
            readiness_score: readinessScore,
        });
    } catch (e) {
        console.error("Rescore error:", e);
        return NextResponse.json({ error: (e as Error).message || "Rescore failed" }, { status: 500 });
    }
}
