import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { scoreOpportunityLeadMagnet, type ProfileForScoring, type OpportunityForScoring } from "@/lib/match-scoring";
import { generateCertRecommendations } from "@/lib/cert-recommendations";
import { sendQuickCheckerResultsEmail } from "@/lib/email";
import { onQuickCheckerComplete } from "@/lib/hubspot";

/**
 * POST /api/lead-magnet/confirm
 * Re-scores matches with user-corrected profile data from the mini-onboarding form.
 * Updates company_analyses with corrected profile, new matches, and lead_email.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            analysis_id,
            email,
            phone,
            contact_name,
            first_name,
            last_name,
            company_name,
            state,
            naics_codes,
            sba_certifications,
            employee_count,
            years_in_business,
            annual_revenue_band,
        } = body as {
            analysis_id?: string;
            email?: string;
            phone?: string;
            contact_name?: string;
            first_name?: string;
            last_name?: string;
            company_name?: string;
            state?: string;
            naics_codes?: string[];
            sba_certifications?: string[];
            employee_count?: number;
            years_in_business?: number;
            annual_revenue_band?: string;
        };
        // Compute the merged "full name" from either form path:
        // - new UI sends first_name + last_name (required on /check)
        // - any older caller may still send the combined contact_name
        const mergedName = [first_name?.trim(), last_name?.trim()].filter(Boolean).join(" ").trim()
            || contact_name?.trim()
            || "";

        if (!analysis_id) {
            return NextResponse.json({ error: "analysis_id is required" }, { status: 400 });
        }
        // Email is optional at the API level (sales reps may not have it) — UI enforces it.

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

        // On-demand NAICS crawl: if we don't have enough opportunities for these NAICS,
        // crawl SAM.gov in real-time before scoring
        if (naics_codes && naics_codes.length > 0) {
            const { count: existingCount } = await sb
                .from("opportunities")
                .select("id", { count: "exact", head: true })
                .in("naics_code", naics_codes)
                .eq("is_archived", false);

            if ((existingCount || 0) < 10) {
                // Not enough opportunities — trigger on-demand crawl
                const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.capturepilot.com";
                try {
                    await fetch(`${baseUrl}/api/opportunities/search-naics`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ naics_codes, min_results: 10, days_back: 180, active_only: true }),
                        signal: AbortSignal.timeout(90000),
                    });
                } catch { /* timeout ok — crawl still upserted to DB */ }
            }
        }

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

        // Update corrected profile in inferred_profile — merge nested contact_person carefully
        const existingProfile = (analysis.inferred_profile as Record<string, unknown>) || {};
        const existingContact = (existingProfile.contact_person as Record<string, unknown> | null) || null;
        const mergedContact = (mergedName || phone || email)
            ? {
                ...(existingContact || {}),
                ...(mergedName ? { name: mergedName } : {}),
                ...(first_name?.trim() ? { first_name: first_name.trim() } : {}),
                ...(last_name?.trim() ? { last_name: last_name.trim() } : {}),
                ...(email ? { email } : {}),
                ...(phone ? { phone, mobile_phone: phone } : {}),
                source: existingContact?.source || "user_confirmed",
            }
            : existingContact;

        const updatedProfile: Record<string, unknown> = {
            ...existingProfile,
            company_name: company_name || existingProfile.company_name,
            state,
            naics_codes: correctedProfile.naics_codes,
            sba_certifications: correctedProfile.sba_certifications,
            contact_person: mergedContact,
            ...(employee_count ? { employee_count } : {}),
            ...(years_in_business ? { years_in_business } : {}),
            ...(annual_revenue_band ? { annual_revenue_band } : {}),
        };

        // Save updates — also write the explicit lead-capture columns from migration 062
        const updatePayload: Record<string, unknown> = {
            preview_matches: topMatches,
            inferred_profile: updatedProfile,
            cert_recommendations: certRecommendations,
            easy_wins: easyWins,
            lead_captured_at: new Date().toISOString(),
        };
        if (email) updatePayload.lead_email = email;
        if (phone) updatePayload.lead_phone = phone;
        if (employee_count) updatePayload.employee_count = employee_count;
        if (years_in_business) updatePayload.years_in_business = years_in_business;
        if (annual_revenue_band) updatePayload.annual_revenue_band = annual_revenue_band;

        await sb.from("company_analyses").update(updatePayload).eq("id", analysis_id);

        // Send Quick Checker results email if lead provided an email
        if (email) {
            const readinessScore = topMatches.length > 0
                ? Math.round((topMatches as Array<Record<string, unknown>>).reduce((sum, m) => sum + Number(m.score || 0), 0) / topMatches.length * 100)
                : 0;

            // Prefer the user-provided phone; fall back to Apollo enrichment only if nothing is known.
            let finalPhone = phone ? String(phone) : "";
            try {
                // Auto-Enrich via Apollo before pushing to HubSpot
                const { data: latestAnalysis } = await sb.from("company_analyses").select("website, inferred_profile").eq("id", analysis_id).single();
                const domain = latestAnalysis?.website ? String(latestAnalysis.website).replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] : "";
                const apolloContactName = mergedName || String((latestAnalysis?.inferred_profile as any)?.contact_person?.name || "");
                if (!finalPhone) {
                    finalPhone = String((latestAnalysis?.inferred_profile as any)?.contact_person?.phone || "");
                }

                if (domain && apolloContactName && !finalPhone) {
                    const nameParts = apolloContactName.trim().split(/\s+/);
                    const firstName = nameParts[0];
                    const lastName = nameParts.slice(1).join(" ");
                    const apolloKey = process.env.APOLLO_API_KEY;

                    if (apolloKey && firstName && lastName) {
                        const apolloRes = await fetch("https://api.apollo.io/api/v1/people/match", {
                            method: "POST",
                            headers: { "Content-Type": "application/json", "X-Api-Key": apolloKey },
                            body: JSON.stringify({ first_name: firstName, last_name: lastName, domain, organization_name: company_name }),
                            signal: AbortSignal.timeout(10000),
                        });
                        if (apolloRes.ok) {
                            const apolloData = await apolloRes.json();
                            const mobile = apolloData?.person?.phone_numbers?.find((p: any) => p.type === 'mobile')?.sanitized_number;
                            if (mobile) {
                                finalPhone = mobile;
                                const currentProfile = (latestAnalysis?.inferred_profile as Record<string, unknown>) || {};
                                await sb.from("company_analyses").update({
                                    inferred_profile: {
                                        ...currentProfile,
                                        contact_person: { ...(currentProfile.contact_person as any), phone: mobile }
                                    }
                                }).eq("id", analysis_id);
                            }
                        }
                    }
                }
            } catch (e) {
                console.error("[Apollo] Auto-enrichment failed:", e);
            }

            // Sync to HubSpot — create/update contact + deal in SaaS Pipeline
            onQuickCheckerComplete({
                email,
                company: company_name,
                phone: finalPhone || undefined,
                readinessScore: Math.round(readinessScore / 10), // convert 0-100 → 0-10
                naicsCodes: correctedProfile.naics_codes,
                samRegistered: !!samData,
                veteranOwned: correctedProfile.sba_certifications.some(c =>
                    ["VOSB", "SDVOSB", "veteran_owned"].includes(c)
                ),
                businessState: state,
                quickCheckerUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://app.capturepilot.com"}/check/${analysis_id}`,
            }).catch(err => console.error("[HubSpot] Quick Checker sync failed:", err));

            sendQuickCheckerResultsEmail(email, {
                companyName: company_name || "Your Company",
                analysisId: analysis_id,
                readinessScore,
                topMatches: (topMatches as Array<Record<string, unknown>>).slice(0, 3).map(m => ({
                    title: String(m.title || "Federal Opportunity"),
                    agency: String(m.agency || "Federal Agency"),
                    score: Math.round(Number(m.score || 0) * 100),
                })),
                totalMatches: scored.length,
            }).catch(err => console.error("Quick checker email send failed:", err));
        }

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
