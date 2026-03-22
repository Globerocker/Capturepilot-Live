import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { scoreOpportunityLeadMagnet, type ProfileForScoring, type OpportunityForScoring } from "@/lib/match-scoring";

/**
 * POST /api/lead-matches
 * Anonymous match scoring for lead magnet.
 * Accepts a temporary profile, returns top 10 matches (3 full + 7 titles only).
 * No auth required. No DB writes.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const profile: ProfileForScoring = {
            naics_codes: body.naics_codes || [],
            sba_certifications: body.sba_certifications || [],
            state: body.state || "",
            target_states: body.target_states || [],
            revenue: body.revenue || null,
            federal_awards_count: body.federal_awards_count || 0,
            target_psc_codes: body.target_psc_codes || [],
            preferred_agencies: body.preferred_agencies || [],
        };

        if (profile.naics_codes.length === 0) {
            return NextResponse.json({ matches: [], total: 0 });
        }

        const sb = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_KEY!
        );

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

        // Score
        const scored: { opportunity_id: string; score: number; classification: string; score_breakdown: Record<string, number> }[] = [];
        for (const opp of allOpps) {
            const result = scoreOpportunityLeadMagnet(profile, opp);
            if (result) scored.push(result);
        }

        scored.sort((a, b) => b.score - a.score);
        const top10 = scored.slice(0, 10);

        // Enrich with opportunity details
        if (top10.length > 0) {
            const oppIds = top10.map(m => m.opportunity_id);
            const { data: details } = await sb
                .from("opportunities")
                .select("id, title, agency, naics_code, set_aside_code, response_deadline, notice_type")
                .in("id", oppIds);

            if (details) {
                const detailMap = new Map(details.map(o => [o.id, o]));
                const enriched = top10.map((match, index) => {
                    const detail = detailMap.get(match.opportunity_id);
                    // First 3 get full details, rest get title only (for blur display)
                    if (index < 3) {
                        return {
                            ...match,
                            title: detail?.title,
                            agency: detail?.agency,
                            naics_code: detail?.naics_code,
                            set_aside_code: detail?.set_aside_code,
                            response_deadline: detail?.response_deadline,
                            notice_type: detail?.notice_type,
                            full: true,
                        };
                    }
                    return {
                        ...match,
                        title: detail?.title,
                        agency: detail?.agency,
                        full: false,
                    };
                });

                return NextResponse.json({
                    matches: enriched,
                    total: scored.length,
                });
            }
        }

        return NextResponse.json({ matches: top10, total: scored.length });

    } catch (error) {
        console.error("Lead matches error:", error);
        return NextResponse.json({ error: "Scoring failed" }, { status: 500 });
    }
}
