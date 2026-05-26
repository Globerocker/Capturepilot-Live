import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { scoreOpportunityLeadMagnet, type ProfileForScoring, type OpportunityForScoring } from "@/lib/match-scoring";
import { findCompetitors, computeReadinessScore } from "@/lib/quick-checker-helpers";
import { NAICS_CODES } from "@/lib/naics-codes";
import { generateMatchSummary, type CompanyContextForAi, type MatchForAi } from "@/lib/match-summary";

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
    matched_keywords?: string[];
    source?: string | null;
    jurisdiction_level?: string | null;
    /** Portal URL where the opp was originally listed (Bonfire / Socrata /
        NY State Contract Reporter / etc). Required for SLED rows where the
        notice_id is our internal hg-sled-* hash and a SAM.gov URL would 404. */
    link?: string | null;
};

/**
 * Re-run scoring + competitors + readiness against a new set of NAICS codes.
 * Reuses crawl_data, sam_data, and usaspending data from the original analysis.
 * Used by the "Edit & Re-Match" button on the Quick Checker results page.
 *
 * Optional `profile_overrides` lets the caller patch the inferred_profile
 * before scoring runs — company_name, state, primary_keywords, target_states.
 * Any field not supplied is left as-is.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const analysisId = body.analysis_id as string;
        const naicsCodes = (body.naics_codes as string[]) || [];
        const overrides = (body.profile_overrides || {}) as {
            company_name?: string;
            state?: string | null;
            primary_keywords?: string[];
            target_states?: string[];
            // Readiness-relevant fields. Setting any of these patches sam_data
            // / crawl_data accordingly so computeReadinessScore picks them up
            // on the rebuild below, AND persists them so the page reflects
            // the operator's manual override on refresh.
            sam_registered?: boolean;
            year_founded?: number | null;
            sba_certifications?: string[];
            past_awards_count?: number;
        };

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

        // Apply optional profile overrides supplied by the Edit & Re-Match form.
        // We patch the row in DB BEFORE scoring so the persisted profile reflects
        // what the user typed in, AND so the scoring profile below picks up the
        // new values from the same source of truth.
        const profilePatch: Record<string, unknown> = {};
        if (overrides.company_name && overrides.company_name.trim()) {
            profilePatch.company_name = overrides.company_name.trim();
        }
        const inferredProfileBase = (analysis.inferred_profile || {}) as Record<string, unknown>;
        const newProfileFields: Record<string, unknown> = { ...inferredProfileBase };
        if (overrides.state !== undefined) {
            newProfileFields.state = overrides.state === "" ? null : overrides.state;
        }
        if (Array.isArray(overrides.primary_keywords)) {
            newProfileFields.primary_keywords = overrides.primary_keywords
                .map(k => String(k || "").trim().toLowerCase())
                .filter(k => k.length >= 2)
                .filter((v, i, a) => a.indexOf(v) === i)
                .slice(0, 8)
                .map(k => ({ keyword: k }));
        }
        if (Array.isArray(overrides.target_states)) {
            newProfileFields.target_states = overrides.target_states
                .map(s => String(s || "").trim().toUpperCase())
                .filter(s => /^[A-Z]{2}$/.test(s))
                .filter((v, i, a) => a.indexOf(v) === i);
        }
        // Always persist naics_codes alongside the inferred_naics array so the UI
        // and the next rescore see the same canonical source.
        newProfileFields.naics_codes = cleanCodes;
        profilePatch.inferred_profile = newProfileFields;

        // Apply readiness-relevant overrides into sam_data + crawl_data so
        // computeReadinessScore (which still reads from those legacy fields)
        // picks them up below AND on subsequent loads.
        const newSamData = (analysis.sam_data || {}) as Record<string, unknown>;
        const newCrawlData = (analysis.crawl_data || {}) as Record<string, unknown>;
        let samDataChanged = false;
        let crawlDataChanged = false;
        if (overrides.sam_registered !== undefined) {
            if (overrides.sam_registered && !newSamData.uei) {
                newSamData.uei = "USER_PROVIDED";  // truthy sentinel; readiness only checks presence
                samDataChanged = true;
            } else if (overrides.sam_registered === false) {
                delete newSamData.uei;
                samDataChanged = true;
            }
        }
        if (overrides.year_founded !== undefined) {
            if (overrides.year_founded && overrides.year_founded > 1800) {
                newCrawlData.founded_year = overrides.year_founded;
                newCrawlData.founding_year = overrides.year_founded;
                newProfileFields.years_in_business = new Date().getFullYear() - overrides.year_founded;
                crawlDataChanged = true;
            } else if (overrides.year_founded === null) {
                delete newCrawlData.founded_year;
                delete newCrawlData.founding_year;
                delete newProfileFields.years_in_business;
                crawlDataChanged = true;
            }
        }
        if (Array.isArray(overrides.sba_certifications)) {
            const cleanCerts = overrides.sba_certifications
                .map(c => String(c || "").trim())
                .filter(c => c.length >= 2)
                .filter((v, i, a) => a.indexOf(v) === i);
            newSamData.sba_certifications = cleanCerts;
            // Also mirror into crawl_data.certifications so the readiness fn
            // (which inspects both fields) doesn't double-count anything.
            newCrawlData.certifications = cleanCerts.map(type => ({ type, confidence: 1.0 }));
            newProfileFields.sba_certifications = cleanCerts;
            samDataChanged = true;
            crawlDataChanged = true;
        }
        if (overrides.past_awards_count !== undefined && overrides.past_awards_count >= 0) {
            const gov = (newProfileFields.gov_spending as Record<string, unknown> | null) || {};
            gov.award_count = overrides.past_awards_count;
            newProfileFields.gov_spending = gov;
        }
        if (samDataChanged) profilePatch.sam_data = newSamData;
        if (crawlDataChanged) profilePatch.crawl_data = newCrawlData;

        if (Object.keys(profilePatch).length > 0) {
            const { error: patchErr } = await sb
                .from("company_analyses")
                .update(profilePatch)
                .eq("id", analysisId);
            if (patchErr) {
                console.warn("[rescore] profile patch failed:", patchErr.message);
            }
        }

        const companyName = (overrides.company_name?.trim()) || (analysis.company_name as string);
        // Use the patched versions so readiness + scoring see the overrides.
        const crawlData = newCrawlData;
        const samData = (newSamData && Object.keys(newSamData).length > 0) ? newSamData : null;
        const certifications = (crawlData.certifications as { type: string; confidence: number }[]) || [];
        const detectedStates = (crawlData.detected_states as string[]) || [];
        const inferredProfile = newProfileFields;
        const primaryKeywords = (inferredProfile.primary_keywords as Array<{ keyword: string; aliases?: string[] }> | undefined) || [];
        const secondaryKeywords = (inferredProfile.secondary_keywords as Array<{ keyword: string; aliases?: string[] }> | undefined) || [];

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

        // Build profile for scoring — keywords carry from inferred_profile so the
        // text-similarity branch of scoreOpportunityLeadMagnet kicks in. Without
        // them every preview match would come back with matched_keywords=undefined
        // and the result page can't explain why anything scored.
        const samCerts = (samData?.sba_certifications as string[]) || [];
        // State / target_states honor user overrides first, then SAM, then crawl.
        const overrideState = overrides.state === "" ? "" : (overrides.state || "");
        const overrideTargetStates = Array.isArray(overrides.target_states)
            ? overrides.target_states.map(s => String(s || "").trim().toUpperCase()).filter(s => /^[A-Z]{2}$/.test(s))
            : null;
        const tempProfile: ProfileForScoring = {
            naics_codes: cleanCodes,
            sba_certifications: [
                ...samCerts,
                ...certifications.filter(c => c.confidence > 0.7).map(c => c.type),
            ].filter((v, i, a) => a.indexOf(v) === i),
            state: overrideState || (samData?.state as string) || detectedStates[0] || "",
            target_states: overrideTargetStates && overrideTargetStates.length > 0
                ? overrideTargetStates
                : [
                    ...(samData?.state ? [samData.state as string] : []),
                    ...detectedStates,
                ].filter((v, i, a) => a.indexOf(v) === i),
            revenue: null,
            federal_awards_count: 0,
            target_psc_codes: [],
            preferred_agencies: [],
            primary_keywords: primaryKeywords,
            secondary_keywords: secondaryKeywords,
        };

        // Fetch opportunities matching the new NAICS codes — include title +
        // description so keyword scoring has text to work with, and source +
        // jurisdiction_level so the UI tier badge can say "State"/"County"/"City"
        // instead of "Other".
        const allOpps: OpportunityForScoring[] = [];
        let offset = 0;
        const batchSize = 1000;
        while (true) {
            const { data: batch } = await sb
                .from("opportunities")
                .select("id, naics_code, psc_code, notice_type, agency, set_aside_code, place_of_performance_state, award_amount, response_deadline, title, description, source, jurisdiction_level")
                .eq("is_archived", false)
                .in("naics_code", cleanCodes)
                .range(offset, offset + batchSize - 1);
            if (!batch || batch.length === 0) break;
            allOpps.push(...(batch as unknown as OpportunityForScoring[]));
            if (batch.length < batchSize) break;
            offset += batchSize;
        }

        // Score — keep an opp-by-id map so we can carry source/jurisdiction
        // through to the persisted preview without a second roundtrip. Cast to
        // the broader runtime shape since we widened the select above but
        // OpportunityForScoring's type doesn't yet declare source/jurisdiction.
        const oppById = new Map<string, Record<string, unknown>>(
            allOpps.map(o => [o.id, o as unknown as Record<string, unknown>]),
        );
        const scoredMatches: ScoredMatch[] = [];
        for (const opp of allOpps) {
            const result = scoreOpportunityLeadMagnet(tempProfile, opp);
            if (result) scoredMatches.push({ ...result });
        }
        scoredMatches.sort((a, b) => b.score - a.score);
        const topCandidates = scoredMatches.slice(0, 40);

        // Enrich candidates with full opportunity details + carry source/jurisdiction
        // from the score-time opp map (already loaded — no second query needed).
        if (topCandidates.length > 0) {
            const oppIds = topCandidates.map(m => m.opportunity_id);
            const { data: oppDetails } = await sb
                .from("opportunities")
                .select("id, title, agency, naics_code, set_aside_code, response_deadline, notice_type, award_amount, notice_id, place_of_performance_state, description, link")
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
                        match.link = (detail as { link?: string | null }).link ?? null;
                    }
                    // Carry tier-classification fields from the scoring opp.
                    const scoringOpp = oppById.get(match.opportunity_id);
                    if (scoringOpp) {
                        match.source = (scoringOpp.source as string | null) ?? null;
                        match.jurisdiction_level = (scoringOpp.jurisdiction_level as string | null) ?? null;
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

        // Recompute readiness — feed the override past-awards count when
        // supplied, otherwise pull from the existing gov_spending blob.
        const govSpending = (newProfileFields.gov_spending as { award_count?: number } | null) || null;
        const usaspendingAwardCount = typeof overrides.past_awards_count === "number"
            ? overrides.past_awards_count
            : (govSpending?.award_count || 0);
        const { score: readinessScore, breakdown: readinessBreakdown } = computeReadinessScore({
            samData,
            crawlData,
            certifications,
            usaspendingAwardCount,
        });

        // Regenerate per-match AI summaries against the corrected profile.
        // The initial Quick Checker pipeline populates ai_match_summaries
        // once at sign-up; if we don't refresh on rescore, new matches (most
        // visibly SLED rows after a NAICS expansion) arrive without a blurb
        // and the card collapses to bare title+agency. ~$0.0005/match × 10
        // matches ≈ half a cent per rescore — well worth it.
        const companyContext: CompanyContextForAi = {
            companyName,
            description: (crawlData.description as string) || (analysis.company_summary as string) || "",
            services: (crawlData.services as string[]) || [],
            naicsCodes: cleanCodes,
            certifications: ((newSamData.sba_certifications as string[]) || []).concat(
                certifications.map(c => c.type),
            ).filter((v, i, a) => a.indexOf(v) === i),
            state: tempProfile.state,
            employeeCount: (newProfileFields.employee_count as number) || null,
            yearsInBusiness: (newProfileFields.years_in_business as number) || null,
            capStatementText: (analysis.capability_statement as string) || (analysis.capability_statement_text as string) || "",
        };
        const summaryEntries = await Promise.all(
            topMatches.map(async (m) => {
                const summaryMatch: MatchForAi = {
                    opportunity_id: m.opportunity_id,
                    title: m.title,
                    agency: m.agency,
                    naics_code: m.naics_code,
                    set_aside_code: m.set_aside_code,
                    notice_type: m.notice_type,
                    award_amount: m.award_amount,
                    description_url: m.description_url,
                    response_deadline: m.response_deadline,
                    matched_keywords: m.matched_keywords,
                    score_breakdown: m.score_breakdown,
                };
                const summary = await generateMatchSummary(companyContext, summaryMatch).catch(() => "");
                return [m.opportunity_id, summary] as const;
            }),
        );
        const aiMatchSummaries: Record<string, string> = Object.fromEntries(
            summaryEntries.filter(([, s]) => s && s.length > 0),
        );

        // Persist
        await sb
            .from("company_analyses")
            .update({
                inferred_naics: newInferredNaics,
                preview_matches: topMatches,
                competitors,
                readiness_score: readinessScore,
                readiness_breakdown: readinessBreakdown,
                ai_match_summaries: aiMatchSummaries,
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
