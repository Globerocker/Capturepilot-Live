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
import { resolveDescriptions } from "@/lib/fetch-sam-description";
import { reconcileProfile, type ReconciledProfile } from "@/lib/quick-checker/reconcile";
import { pushQuickCheckerBriefToHubSpot } from "@/lib/hubspot-brief";

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
    matched_keywords?: string[];
    // Phase 4: eligibility carried through from match-scoring.ts so the
    // HubSpot push + UI can render lock-badges on ineligible matches.
    eligibility?: "eligible" | "not_eligible_cert" | "not_eligible_size";
    required_certifications?: string[];
}

// MatchForAi + CompanyContextForAi + generateMatchSummary now live in
// lib/match-summary.ts so the rescore endpoint can reuse them — see the
// comment at the top of that file. Local imports kept identical so the
// initial pipeline below doesn't change semantics.
import { generateMatchSummary as sharedGenerateMatchSummary, type CompanyContextForAi, type MatchForAi } from "./match-summary";

async function generateMatchSummary(
    company: CompanyContextForAi,
    match: MatchForAi,
): Promise<string> {
    return sharedGenerateMatchSummary(company, match);
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

        // Hydrate keyword aliases from the gov_keywords library so the scorer
        // can match variant phrasings (e.g. "AI" -> ["artificial intelligence",
        // "machine learning"]). The user-supplied keyword arrays only carry
        // canonical terms; aliases live in the library.
        const rawPrimary = (inferredProfile.primary_keywords as Array<{ keyword: string; aliases?: string[] }> | undefined) || [];
        const rawSecondary = (inferredProfile.secondary_keywords as Array<{ keyword: string; aliases?: string[] }> | undefined) || [];
        const allKeywordTerms = [...rawPrimary, ...rawSecondary].map(k => k.keyword).filter(Boolean);
        const aliasLookup = new Map<string, string[]>();
        if (allKeywordTerms.length > 0) {
            try {
                const { data: libRows } = await sb
                    .from("gov_keywords")
                    .select("keyword, aliases")
                    .in("keyword", allKeywordTerms);
                for (const row of (libRows || []) as Array<{ keyword: string; aliases?: string[] }>) {
                    if (Array.isArray(row.aliases) && row.aliases.length > 0) {
                        aliasLookup.set(row.keyword, row.aliases);
                    }
                }
            } catch { /* best-effort */ }
        }
        const hydrateKeywords = (kws: Array<{ keyword: string; aliases?: string[] }>) =>
            kws.map(k => ({
                keyword: k.keyword,
                aliases: k.aliases?.length ? k.aliases : aliasLookup.get(k.keyword) || [],
            }));

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
            // ── Keyword matching (gov_keywords-driven) ──
            primary_keywords: rawPrimary.length > 0 ? hydrateKeywords(rawPrimary) : undefined,
            secondary_keywords: rawSecondary.length > 0 ? hydrateKeywords(rawSecondary) : undefined,
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
            // Exact-NAICS pass
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

            // Broader prefix passes — if the exact 6-digit NAICS has sparse
            // coverage (common for niche codes like 115116 Farm Management
            // Services where our DB has 0 opps), step UP the NAICS hierarchy:
            //   1) 4-digit prefix (industry group, e.g. 1151 Support Activities
            //      for Crop Production) — scoreNaics returns 0.6.
            //   2) 3-digit prefix (sub-sector, e.g. 115 Support Activities for
            //      Agriculture & Forestry) — scoreNaics returns 0.3.
            // Each pass is FILTERED to active opportunities only (future
            // deadlines OR no deadline / Sources-Sought-style notices) so we
            // don't waste budget loading expired or Award-Notice rows that
            // the scorer would just reject downstream.
            const nowIso = new Date().toISOString();
            const fetchByPrefix = async (prefix: string, soft: boolean) => {
                let poffset = 0;
                const collected: OpportunityForScoring[] = [];
                while (true) {
                    let q = sb
                        .from("opportunities")
                        .select("id, naics_code, psc_code, notice_type, agency, set_aside_code, place_of_performance_state, award_amount, response_deadline")
                        .eq("is_archived", false)
                        .like("naics_code", `${prefix}%`);
                    if (soft) {
                        // Active-deadline filter: future OR no deadline (SAM
                        // often leaves deadline null for Sources Sought
                        // pre-RFI activity).
                        q = q.or(`response_deadline.gte.${nowIso},response_deadline.is.null`);
                    }
                    const { data: pbatch } = await q.range(poffset, poffset + batchSize - 1);
                    if (!pbatch || pbatch.length === 0) break;
                    collected.push(...(pbatch as unknown as OpportunityForScoring[]));
                    if (pbatch.length < batchSize) break;
                    poffset += batchSize;
                    if (poffset >= batchSize) break;
                }
                return collected;
            };

            const ensureUnique = (cands: OpportunityForScoring[], exactSet: Set<string>) => {
                for (const opp of cands) {
                    if (!exactSet.has(opp.id)) {
                        allOpps.push(opp);
                        exactSet.add(opp.id);
                    }
                }
            };

            if (allOpps.length < 50) {
                const exactSet = new Set(allOpps.map(o => o.id));
                const prefixes4 = Array.from(new Set(primaryNaics.map(c => c.slice(0, 4)))).filter(Boolean);
                for (const p of prefixes4) {
                    ensureUnique(await fetchByPrefix(p, true), exactSet);
                }
                // Still sparse? Step up to 3-digit sub-sector.
                if (allOpps.length < 25) {
                    const prefixes3 = Array.from(new Set(primaryNaics.map(c => c.slice(0, 3)))).filter(Boolean);
                    for (const p of prefixes3) {
                        ensureUnique(await fetchByPrefix(p, true), exactSet);
                    }
                }
            }
        }

        // Pass 1: score without keyword/description signal — we only have the
        // base columns here. This narrows the field from ~thousands to ~40 fast.
        const scoredMatches: ScoredMatch[] = [];
        for (const opp of allOpps) {
            const result = scoreOpportunityLeadMagnet(tempProfile, opp);
            if (result) scoredMatches.push({ ...result });
        }
        scoredMatches.sort((a, b) => b.score - a.score);
        const topCandidates = scoredMatches.slice(0, 40);

        // Enrich top candidates (title, description, structured_requirements)
        // — needed for both keyword matching AND the UI's "Why this fits" panel.
        let topMatches = topCandidates;
        if (topCandidates.length > 0) {
            const oppIds = topCandidates.map(m => m.opportunity_id);
            const { data: oppDetails } = await sb
                .from("opportunities")
                .select("id, title, agency, naics_code, set_aside_code, response_deadline, notice_type, award_amount, notice_id, place_of_performance_state, description, structured_requirements, source")
                .in("id", oppIds);

            if (oppDetails) {
                const detailMap = new Map(oppDetails.map(o => [o.id, o]));

                // Pass 2: re-score the top 40 with the enriched title +
                // description so keyword matching + deadline boost actually
                // fires. The re-rank moves keyword-strong matches up even if
                // their NAICS code didn't match perfectly.
                const rescored: ScoredMatch[] = [];
                for (const match of topMatches) {
                    const detail = detailMap.get(match.opportunity_id);
                    if (!detail) {
                        rescored.push(match);
                        continue;
                    }
                    const enrichedOpp: OpportunityForScoring = {
                        id: detail.id,
                        naics_code: detail.naics_code,
                        psc_code: null,
                        notice_type: detail.notice_type,
                        agency: detail.agency,
                        set_aside_code: detail.set_aside_code,
                        place_of_performance_state: detail.place_of_performance_state,
                        award_amount: detail.award_amount,
                        response_deadline: detail.response_deadline,
                        title: detail.title,
                        description: detail.description,
                        structured_requirements: detail.structured_requirements,
                    } as OpportunityForScoring;
                    const r2 = scoreOpportunityLeadMagnet(tempProfile, enrichedOpp);
                    if (r2) {
                        // Carry the enrichment fields onto the rescored entry
                        // so the downstream UI gets everything it needs.
                        rescored.push({
                            ...r2,
                            // Pull-through fields for the result page.
                            title: detail.title,
                            agency: detail.agency,
                            naics_code: detail.naics_code,
                            set_aside_code: detail.set_aside_code,
                            response_deadline: detail.response_deadline,
                            notice_type: detail.notice_type,
                            award_amount: detail.award_amount,
                            notice_id: detail.notice_id ?? undefined,
                            place_of_performance_state: detail.place_of_performance_state ?? undefined,
                            description_url: detail.description ?? undefined,
                            // Carry source through so the UI can badge federal vs sled/grant.
                            source: (detail as { source?: string }).source ?? undefined,
                            // Phase 4: carry eligibility flag + required certs forward
                            // so the UI can lock-badge ineligible matches.
                            eligibility: r2.eligibility,
                            required_certifications: r2.required_certifications,
                        } as ScoredMatch);
                    } else {
                        rescored.push(match);
                    }
                }
                rescored.sort((a, b) => b.score - a.score);
                topMatches = rescored;
            }
        }

        // Deduplicate by title
        const seenTitles = new Set<string>();
        topMatches = topMatches.filter(m => {
            const title = (m.title || "").toLowerCase().trim().replace(/\s+/g, " ").slice(0, 60);
            if (!title || seenTitles.has(title)) return false;
            seenTitles.add(title);
            return true;
        }).slice(0, 10);

        // ── Resolve SAM description URLs to actual text ──────────────────────
        // For Quick Checker matches that still hold a `https://api.sam.gov/...`
        // URL in opportunities.description (the bulk_enrich_descriptions cron
        // hasn't caught up yet), inline-fetch the description text so the UI
        // renders real content instead of an empty card. Caps at 5 parallel
        // requests with an 8s timeout each — adds ~3-5s to total runtime for
        // the typical batch of 10 matches, but the UX gain is enormous.
        try {
            const resolved = await resolveDescriptions(topMatches.map(m => ({
                opportunity_id: m.opportunity_id,
                description: m.description_url,
            })));
            topMatches = topMatches.map(m => {
                const r = resolved.get(m.opportunity_id);
                if (r && r.text) {
                    return { ...m, description_url: r.text } as ScoredMatch;
                }
                return m;
            });
        } catch (err) {
            console.error("[quick-checker-finish] resolveDescriptions failed:", err);
            // Non-fatal — UI will fall back to hiding URL-only entries.
        }

        await sb.from("company_analyses").update({ status: "generating" }).eq("id", analysisId);

        // ── AI per-match summaries ────────────────────────────────────────────
        // For each of the top matches, generate a 2-sentence "why this fits YOU"
        // blurb. Runs in parallel. If OPENAI is not configured we fall back to a
        // deterministic line so the UI never shows an empty state.
        const description = (crawlData.description as string) || "";
        const services = (crawlData.services as string[]) || [];
        const companyContext: CompanyContextForAi = {
            companyName,
            description,
            services,
            naicsCodes: tempProfile.naics_codes,
            certifications: tempProfile.sba_certifications,
            state: tempProfile.state || "",
            employeeCount: tempProfile.employee_count ?? null,
            yearsInBusiness: (inferredProfile.years_in_business as number) || null,
            capStatementText: (inferredProfile.cap_statement_text as string) || "",
        };
        const summaryEntries = await Promise.all(
            topMatches.map(async (m) => {
                const summary = await generateMatchSummary(companyContext, m);
                return [m.opportunity_id, summary] as const;
            }),
        );
        const aiMatchSummaries: Record<string, string> = Object.fromEntries(summaryEntries);
        // Persist progressively so the UI can render summaries as we go
        await sb.from("company_analyses").update({ ai_match_summaries: aiMatchSummaries }).eq("id", analysisId);

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

        // Generate company summary — reuses description/services declared above for AI summaries
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

        // ── Phase 3: reconcile crawl claims with SAM + USAspending ──────────
        // Best-effort — failure never blocks the rest of the pipeline. The
        // resulting `reconciled` object drives the cert badge "verified" vs
        // "claimed" rendering on /check + the HubSpot push in Phase 5.
        let reconciled: ReconciledProfile | null = null;
        try {
            const knownUei = (samData?.uei as string | null | undefined)
                || ((inferredProfile.uei as string | null | undefined) ?? null);
            const extractionForReconcile = {
                // Coerce the legacy crawl_data shape into the new schema shape
                // the reconciler expects. We only need a handful of fields.
                company_name: companyName,
                certifications: ((crawlData.certifications as Array<{ type: string; evidence?: string; confidence?: number }>) || []).map(c => ({
                    type: c.type,
                    evidence: c.evidence || "",
                    confidence: c.confidence ?? 0.7,
                })),
                headquarters_state: (samData?.state as string | null) || tempProfile.state || null,
                employee_count_estimate: tempProfile.employee_count,
                founded_year: (inferredProfile.years_in_business as number | null) || null,
            } as unknown as Parameters<typeof reconcileProfile>[0]["extraction"];

            reconciled = await reconcileProfile({
                extraction: extractionForReconcile,
                uei: knownUei,
                companyName,
            });
        } catch (err) {
            console.error("[quick-checker-finish] reconcileProfile failed:", err);
        }

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
            reconciled_profile: reconciled,
        }).eq("id", analysisId);

        // ── Phase 5: push the strategic brief to HubSpot ──────────────────
        // Best-effort, fire-and-forget. Only runs when an email is on the
        // analysis row + HUBSPOT_TOKEN is configured. The brief lands as a
        // Note on the contact's timeline with strengths + weaknesses +
        // pitch_angles + top matches — sales rep opens HubSpot, ready to
        // call without bouncing back to /check.
        try {
            const leadEmail = (analysis.lead_email as string | null)
                || (analysis.email as string | null)
                || null;
            if (leadEmail) {
                const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.capturepilot.com";
                const top5 = topMatches.slice(0, 5).map(m => ({
                    title: m.title || null,
                    agency: m.agency || null,
                    set_aside_code: m.set_aside_code || null,
                    score: m.score,
                    eligibility: m.eligibility,
                    required_certifications: m.required_certifications,
                    notice_id: m.notice_id || null,
                }));
                await pushQuickCheckerBriefToHubSpot({
                    email: leadEmail,
                    companyName,
                    contactName: (inferredProfile.contact_name as string | null)
                        || (analysis.lead_name as string | null) || null,
                    contactPhone: (inferredProfile.contact_phone as string | null) || null,
                    website: (analysis.website as string | null) || null,
                    quickCheckerUrl: `${baseUrl}/check/${analysisId}`,
                    readinessScore,
                    topMatches: top5,
                    strengths: (crawlData.strengths as string[]) || [],
                    weaknesses: (crawlData.weaknesses as string[]) || [],
                    pitchAngles: (crawlData.pitch_angles as string[]) || [],
                    nailDownKeywords: (crawlData.nail_down_keywords as string[]) || [],
                    revenueSignal: (crawlData.revenue_signal as string | null) || null,
                    federalAgenciesServed: (crawlData.federal_agencies_served as string[]) || [],
                    reconciled,
                    naicsCodes: tempProfile.naics_codes,
                });
            }
        } catch (err) {
            console.error("[quick-checker-finish] HubSpot brief push failed:", err);
        }

    } catch (error) {
        console.error("runPostConfirmationPipeline error:", error);
        await sb.from("company_analyses").update({
            status: "error",
            error_message: (error as Error).message || "Pipeline failed after confirmation",
        }).eq("id", analysisId);
    }
}
