import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { scoreOpportunityLeadMagnet, type ProfileForScoring, type OpportunityForScoring } from "@/lib/match-scoring";
import { generateCertRecommendations } from "@/lib/cert-recommendations";

/**
 * POST /api/lead-magnet/confirm
 * Re-scores matches with user-corrected profile data from the mini-onboarding form.
 * Updates company_analyses with corrected profile, new matches, and lead_email.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { analysis_id, email, company_name, state, naics_codes, sba_certifications } = body;

        if (!analysis_id) {
            return NextResponse.json({ error: "analysis_id is required" }, { status: 400 });
        }
        if (!email) {
            return NextResponse.json({ error: "Email is required" }, { status: 400 });
        }

        const sb = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_KEY!
        );

        // Verify analysis exists
        const { data: analysis, error: fetchError } = await sb
            .from("company_analyses")
            .select("id, inferred_profile, crawl_data, sam_data")
            .eq("id", analysis_id)
            .single();

        if (fetchError || !analysis) {
            return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
        }

        // Build corrected profile
        const correctedProfile: ProfileForScoring = {
            naics_codes: naics_codes || [],
            sba_certifications: sba_certifications || [],
            state: state || "",
            target_states: state ? [state] : [],
            revenue: null,
            federal_awards_count: 0,
            target_psc_codes: [],
            preferred_agencies: [],
        };

        // Load opportunities
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

        // Re-score with corrected profile
        const scored: { opportunity_id: string; score: number; classification: string; score_breakdown: Record<string, number> }[] = [];
        for (const opp of allOpps) {
            const result = scoreOpportunityLeadMagnet(correctedProfile, opp);
            if (result) scored.push(result);
        }

        scored.sort((a, b) => b.score - a.score);
        const topMatches = scored.slice(0, 10);

        // Enrich top matches with details
        if (topMatches.length > 0) {
            const oppIds = topMatches.map(m => m.opportunity_id);
            const { data: oppDetails } = await sb
                .from("opportunities")
                .select("id, title, agency, naics_code, set_aside_code, response_deadline, notice_type")
                .in("id", oppIds);

            if (oppDetails) {
                const detailMap = new Map(oppDetails.map(o => [o.id, o]));
                for (const match of topMatches as Array<Record<string, unknown>>) {
                    const detail = detailMap.get(match.opportunity_id as string);
                    if (detail) {
                        match.title = detail.title;
                        match.agency = detail.agency;
                        match.naics_code = detail.naics_code;
                        match.set_aside_code = detail.set_aside_code;
                        match.response_deadline = detail.response_deadline;
                        match.notice_type = detail.notice_type;
                    }
                }
            }
        }

        // Regenerate cert recommendations
        const oppsWithTitles = allOpps.map(o => ({ ...o, title: undefined as string | undefined }));
        // Add titles for top opps
        if (topMatches.length > 0) {
            const titleMap = new Map(
                (topMatches as Array<Record<string, unknown>>).map(m => [m.opportunity_id as string, m.title as string])
            );
            for (const o of oppsWithTitles) {
                const t = titleMap.get(o.id);
                if (t) o.title = t;
            }
        }

        const certRecommendations = generateCertRecommendations(
            correctedProfile.sba_certifications,
            oppsWithTitles,
            correctedProfile.naics_codes,
        );

        // Compute easy wins with corrected data
        const crawlData = (analysis.crawl_data || {}) as Record<string, unknown>;
        const samData = analysis.sam_data as Record<string, unknown> | null;
        const easyWins: { title: string; description: string; impact: string; category: string }[] = [];

        if (!samData) {
            easyWins.push({
                title: "Register on SAM.gov",
                description: "SAM.gov registration is required to bid on federal contracts. Free registration unlocks access to all government opportunities.",
                impact: "high",
                category: "registration",
            });
        }
        if (!correctedProfile.sba_certifications.length) {
            easyWins.push({
                title: "Explore SBA Certifications",
                description: "SBA certifications like 8(a), HUBZone, or WOSB unlock set-aside contracts with less competition.",
                impact: "high",
                category: "certifications",
            });
        }
        if (correctedProfile.target_states.length <= 1) {
            easyWins.push({
                title: "Expand Your Target States",
                description: "Adding more target states significantly increases the number of matching opportunities.",
                impact: "medium",
                category: "profile",
            });
        }

        // Update corrected profile in inferred_profile
        const updatedProfile = {
            ...(analysis.inferred_profile as Record<string, unknown> || {}),
            company_name: company_name || undefined,
            state,
            naics_codes: correctedProfile.naics_codes,
            sba_certifications: correctedProfile.sba_certifications,
        };

        // Save updates
        await sb.from("company_analyses").update({
            lead_email: email,
            preview_matches: topMatches,
            inferred_profile: updatedProfile,
            cert_recommendations: certRecommendations,
            easy_wins: easyWins,
        }).eq("id", analysis_id);

        return NextResponse.json({
            updated_matches: topMatches,
            cert_recommendations: certRecommendations,
            easy_wins: easyWins,
            total_matches: scored.length,
        });

    } catch (error) {
        console.error("Lead magnet confirm error:", error);
        return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }
}
