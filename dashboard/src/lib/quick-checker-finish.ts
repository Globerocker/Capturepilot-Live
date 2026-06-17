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
import { enrichFirmographics } from "@/lib/quick-checker/firmographics";
import { detectRecompetes } from "@/lib/quick-checker/recompete";
import { suggestGeoExpansion, type GeoExpansionResult } from "@/lib/quick-checker/geo-expansion";

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
    // Phase 19: recompete flag from USAspending cross-reference.
    is_recompete?: boolean;
    incumbent_name?: string | null;
}

/**
 * Decompose a nail-down phrase into smaller phrase-aliases so the strict
 * scoreKeywords/phraseHits matcher can still hit federal opp titles.
 *
 * Example: "electronic component broker/reseller" →
 *   ["electronic component broker", "electronic component",
 *    "component broker", "broker", "reseller"]
 *
 * Drops the long canonical (we only need the SHORT sub-phrases as aliases —
 * the canonical itself stays as the primary entry for attribution). Skips
 * tokens that are stopword-y or too short.
 */
const PHRASE_STOPWORDS = new Set([
    "a", "an", "the", "and", "or", "of", "for", "with", "to", "in", "on",
    "at", "by", "as", "from", "into", "is", "are", "be", "this", "these",
]);
function deriveAliasesFromPhrase(phrase: string): string[] {
    const cleaned = phrase.toLowerCase()
        .split(/[\/|]/)             // split on / and |
        .map(s => s.trim())
        .filter(Boolean);
    const tokens: string[][] = cleaned.map(part =>
        part.split(/\s+/).filter(w => w.length > 0 && !PHRASE_STOPWORDS.has(w))
    );
    const out = new Set<string>();
    for (const arr of tokens) {
        if (arr.length === 0) continue;
        // sliding windows: lengths 3, 2, 1
        for (const len of [3, 2, 1]) {
            for (let i = 0; i + len <= arr.length; i++) {
                const sub = arr.slice(i, i + len).join(" ");
                // skip if too short or matches the original whole phrase
                if (sub.length < 3) continue;
                if (sub === phrase.toLowerCase().trim()) continue;
                out.add(sub);
            }
        }
    }
    // Cap to avoid alias-bloat — top 6 longest substrings retain most signal.
    return Array.from(out).sort((a, b) => b.length - a.length).slice(0, 6);
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

    // Watchdog: if the pipeline doesn't reach status=complete within 2.5 min,
    // a deferred timer force-flips the row to complete so the /check UI can't
    // sit stuck at "Writing your personalized report ~6s" indefinitely. Fires
    // even if a downstream call (recompete USAspending, geo expansion, etc.)
    // hangs without throwing. Clears itself on normal completion.
    const watchdog = setTimeout(async () => {
        try {
            const { data: row } = await sb
                .from("company_analyses")
                .select("status, ai_match_summaries")
                .eq("id", analysisId)
                .maybeSingle();
            if (row && row.status !== "complete" && row.ai_match_summaries) {
                console.warn(`[quick-checker-finish] watchdog fired for ${analysisId} — force-completing stuck pipeline`);
                await sb.from("company_analyses")
                    .update({ status: "complete", updated_at: new Date().toISOString() })
                    .eq("id", analysisId);
            }
        } catch (err) {
            console.error("[quick-checker-finish] watchdog failed:", err);
        }
    }, 150_000);  // 2.5 min — typical pipeline runs in 30-60s

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

        // ── Phase 9 — auto-promote crawl keywords to primary_keywords ──
        // When the user didn't curate their own keywords, fall back to the
        // crawl output. Two sources, two roles:
        //
        //   nail_down_keywords  — 3-5 hyper-specific phrases. Great for
        //     attribution ("matched: 'fleet maintenance for Class-8 trucks'"),
        //     bad for raw matching because federal opp titles are short. We
        //     keep them as canonical "keywords" + auto-derive 1-3 word
        //     SUB-PHRASES as aliases so the phrase matcher can still hit
        //     opp titles that share the key terms.
        //
        //   capability_keywords  — 8-20 shorter phrases, usually 1-3 words.
        //     These match federal opp titles directly. We promote them as
        //     secondary keywords so they boost score but don't claim the
        //     spotlight.
        let rawPrimary = (inferredProfile.primary_keywords as Array<{ keyword: string; aliases?: string[] }> | undefined) || [];
        let rawSecondary = (inferredProfile.secondary_keywords as Array<{ keyword: string; aliases?: string[] }> | undefined) || [];

        if (rawPrimary.length === 0) {
            const nailDown = (crawlData.nail_down_keywords as string[]) || [];
            if (nailDown.length > 0) {
                rawPrimary = nailDown.slice(0, 5).map(k => {
                    const canonical = String(k).toLowerCase().trim();
                    // Derive aliases by splitting on slashes + extracting
                    // 1-3 word substrings. "electronic component broker/reseller"
                    // → ["electronic component broker", "electronic component",
                    //    "broker", "reseller"]. Drops stopword-y trailing words.
                    const aliases = deriveAliasesFromPhrase(canonical);
                    return aliases.length > 0 ? { keyword: canonical, aliases } : { keyword: canonical };
                });
                console.log("[quick-checker-finish] auto-filled primary_keywords from nail_down_keywords:",
                    rawPrimary.map(k => `${k.keyword} (+${(k.aliases || []).length} aliases)`).join(", "));
            }
        }

        if (rawSecondary.length === 0) {
            const capKws = (crawlData.capability_keywords as Array<{ keyword: string; tier?: string }> | undefined) || [];
            if (capKws.length > 0) {
                rawSecondary = capKws
                    .map(k => String(k.keyword || "").toLowerCase().trim())
                    .filter(k => k.length >= 3 && k.length <= 60)
                    .filter((v, i, a) => a.indexOf(v) === i)
                    .slice(0, 10)
                    .map(k => ({ keyword: k }));
                console.log("[quick-checker-finish] auto-filled secondary_keywords from capability_keywords:",
                    rawSecondary.map(k => k.keyword).join(", "));
            }
        }
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
            // Phase 12: Apollo-derived industries for the industry × agency boost.
            // Falls back to crawl-extracted industries_served if Apollo missed it.
            industries: ((inferredProfile.industries as string[] | undefined)
                || (crawlData.industries_served as string[] | undefined)
                || []),
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

        // ── Phase 17 — progressive write of preview_matches ──
        // First batch lands in the DB now (after Pass 2 rescore, before AI
        // summaries). The /check page polls every 2s in active states, so
        // users see real matches within 5-10s instead of staring at a
        // spinner for 30-60s while AI summaries generate.
        try {
            const earlyTop = topMatches.slice(0, 10);
            await sb.from("company_analyses")
                .update({ preview_matches: earlyTop })
                .eq("id", analysisId);
        } catch (err) {
            console.error("[quick-checker-finish] progressive preview_matches write failed:", err);
        }

        // ── Phase 19 — recompete detection on top matches ──
        // Best-effort: flag matches as likely recompetes by looking up
        // prior USAspending awards on (NAICS, agency). Failures don't
        // block the pipeline — just no recompete badges on cards.
        try {
            const flags = await detectRecompetes(topMatches.map(m => ({
                opportunity_id: m.opportunity_id,
                naics_code: m.naics_code,
                agency: m.agency,
                place_of_performance_state: m.place_of_performance_state,
            })));
            topMatches = topMatches.map(m => {
                const f = flags.get(m.opportunity_id);
                if (f && f.is_recompete) {
                    return { ...m, is_recompete: true, incumbent_name: f.incumbent_name } as ScoredMatch & { is_recompete?: boolean; incumbent_name?: string | null };
                }
                return m;
            });
        } catch (err) {
            console.error("[quick-checker-finish] recompete detection failed:", err);
        }

        // ── Phase 11 — dedupe + freshness filter ──
        //
        // 1) Title+Agency dedupe (was: title-only). Two opps with same title
        //    from different agencies are legitimately distinct ("Janitorial
        //    Services" posted by GSA vs Army). Title-only dedupe was eating
        //    those.
        // 2) Drop stale opps: a) past response_deadline already (we keep a
        //    24h grace), or b) posted > 90 days ago AND no deadline (likely
        //    archived award notice the ingest pipeline forgot to mark).
        const now = Date.now();
        const NINETY_DAYS_MS = 90 * 86400_000;
        const seenKeys = new Set<string>();
        topMatches = topMatches.filter(m => {
            // Freshness gate
            if (m.response_deadline) {
                const dl = new Date(m.response_deadline).getTime();
                if (!Number.isNaN(dl) && dl < now - 86400_000) return false;  // 24h past = dead
            }
            // Title+Agency dedupe
            const t = (m.title || "").toLowerCase().trim().replace(/\s+/g, " ").slice(0, 80);
            const a = (m.agency || "").toLowerCase().trim();
            const key = `${t}|${a}`;
            if (!t || seenKeys.has(key)) return false;
            seenKeys.add(key);
            return true;
        }).slice(0, 10);
        // Post-slice freshness sanity check: if nothing has a deadline AND
        // titles look like "Award Notice ..." style, surface them anyway —
        // some legit Sources Sought opps never carry a deadline. We only
        // drop the OBVIOUSLY-stale ones (no deadline + posted older than
        // 90d, which would mean we know they're old via our own ingest).
        // That check requires posted_date which we don't currently load
        // here — punt to a future migration if it becomes a real problem.
        void NINETY_DAYS_MS;

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
        let { score: readinessScore, breakdown: readinessBreakdown } = computeReadinessScore({
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

        // ── Phase 8: firmographic 4-layer cascade (Apollo → SAM → OpenCorp → Wayback) ──
        // Fill gaps in employees / revenue / founded_year / industries that
        // the crawl couldn't extract. Fire-and-forget safe — failures are
        // silently swallowed and the existing crawl values stand.
        try {
            let domain = "";
            try { domain = new URL((analysis.website as string) || "").hostname.replace(/^www\./, ""); } catch { /* ignore */ }
            const knownUei = (samData?.uei as string | null | undefined) || null;
            const firmo = await enrichFirmographics({
                domain,
                companyName,
                uei: knownUei,
                existing: {
                    employee_count: tempProfile.employee_count,
                    founded_year: (inferredProfile.years_in_business as number | null)
                        ? new Date().getFullYear() - (inferredProfile.years_in_business as number)
                        : null,
                    industries: (crawlData.industries_served as string[]) || [],
                },
            });
            // Persist enriched values back to inferred_profile + crawl_data so
            // the UI + HubSpot push see them. Only OVERWRITE when the new value
            // has a real (non-missing) source — never clobber a confirmed crawl
            // value with a missing API result.
            const updates: Record<string, unknown> = {};
            const profileUpdates: Record<string, unknown> = { ...inferredProfile };
            if (firmo.employee_count.value !== null && firmo.employee_count.source !== "missing") {
                profileUpdates.employee_count = firmo.employee_count.value;
                // Update tempProfile in-memory so the rest of the pipeline sees it.
                tempProfile.employee_count = firmo.employee_count.value;
            }
            if (firmo.revenue_band.value && firmo.revenue_band.source !== "missing") {
                profileUpdates.annual_revenue_band = firmo.revenue_band.value;
            }
            if (firmo.years_in_business.value !== null && firmo.years_in_business.source !== "missing") {
                profileUpdates.years_in_business = firmo.years_in_business.value;
            }
            if (firmo.industries.value && firmo.industries.value.length > 0) {
                profileUpdates.industries = firmo.industries.value;
            }
            // Re-score readiness now that the firmographic cascade resolved
            // employees / years_in_business. The first pass (above) ran BEFORE
            // these were known, so it read artificially low (the "Established
            // Business" + "10+ Employees" factors silently scored 0).
            try {
                const re = computeReadinessScore({
                    samData,
                    crawlData: {
                        ...crawlData,
                        employee_count: (tempProfile.employee_count as number) || (crawlData.employee_count as number) || 0,
                        years_in_business: (profileUpdates.years_in_business as number) || 0,
                    },
                    certifications: [
                        ...certifications,
                        ...((tempProfile.sba_certifications || []).map(t => ({ type: t, confidence: 1 }))),
                    ],
                    usaspendingAwardCount: usaspendingData?.award_count || 0,
                });
                readinessScore = re.score;
                readinessBreakdown = re.breakdown;
            } catch { /* keep first-pass readiness if re-score fails */ }
            updates.inferred_profile = profileUpdates;
            updates.firmographics = firmo;
            await sb.from("company_analyses").update(updates).eq("id", analysisId);
        } catch (err) {
            console.error("[quick-checker-finish] firmographics enrich failed:", err);
        }

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

        // ── Phase 20 — geo expansion suggestions ──
        // Compute the top 5 states the user is NOT already targeting,
        // ranked by opp count in their primary NAICS codes. Surfaced on
        // /check as a "+N more opps if you add FL/GA/LA" banner. Cheap
        // (~one Supabase query) but high-leverage — most first-time
        // bidders under-target geographically.
        let geoExpansion: GeoExpansionResult | null = null;
        try {
            geoExpansion = await suggestGeoExpansion(
                sb,
                tempProfile.naics_codes || [],
                tempProfile.target_states || [],
            );
        } catch (err) {
            console.error("[quick-checker-finish] geo expansion failed:", err);
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
            geo_expansion: geoExpansion,
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
                // Phase 21 v2 — merge user-confirmed certs (from confirm
                // payload) into the reconciled set BEFORE pushing. The
                // crawl might miss VOSB/SDVOSB and SAM might not have it
                // yet, but the user clicked the checkbox so we should
                // trust + persist.
                const userCerts = tempProfile.sba_certifications || [];
                const reconciledForHub = reconciled ? {
                    ...reconciled,
                    verified_certifications: Array.from(new Set([
                        ...(reconciled.verified_certifications || []),
                        ...userCerts,
                    ])),
                } : (userCerts.length > 0 ? {
                    // Synthesize a minimal reconciled blob carrying just the
                    // user-supplied certs so the dropdown_key mapper fires.
                    company_name: { value: companyName, source: "crawl" as const },
                    legal_name: { value: companyName, source: "crawl" as const },
                    uei: { value: null, source: "missing" as const },
                    cage_code: { value: null, source: "missing" as const },
                    state: { value: tempProfile.state || null, source: "crawl" as const },
                    website: { value: null, source: "missing" as const },
                    verified_certifications: userCerts,
                    crawl_claimed_unverified: [] as string[],
                    all_certifications: userCerts.map(c => ({ type: c, source: "crawl" as const, verified: false })),
                    federal_revenue_lifetime: { value: null, source: "missing" as const },
                    federal_revenue_last_year: { value: null, source: "missing" as const },
                    federal_award_count: { value: null, source: "missing" as const },
                    employee_count: { value: tempProfile.employee_count ?? null, source: "crawl" as const },
                    founded_year: { value: null, source: "missing" as const },
                    sam_active: false,
                    has_federal_pp: false,
                    notes: ["User-confirmed certs only — not SAM-verified"],
                } : null);

                // Phase 22: pass firmographics + contactJobTitle so HubSpot
                // gets industry/employees/revenue/founded_year + jobtitle
                // mapped to STANDARD properties (no custom cp_* needed for
                // those — see lib/hubspot-brief.ts Phase 22 audit).
                const { data: anaWithFirmo } = await sb
                    .from("company_analyses")
                    .select("firmographics, inferred_profile")
                    .eq("id", analysisId)
                    .maybeSingle();
                const firmoBlob = (anaWithFirmo?.firmographics as Parameters<typeof pushQuickCheckerBriefToHubSpot>[0]["firmographics"]) || null;
                const inferredFresh = (anaWithFirmo?.inferred_profile || {}) as Record<string, unknown>;
                const contactPerson = (inferredFresh.contact_person || {}) as {
                    title?: string; name?: string; first_name?: string; last_name?: string; phone?: string;
                };
                const jobTitle = contactPerson.title
                    || (inferredFresh.job_title as string | null) || null;
                // Prefer the user-confirmed first/last from the /check form
                // (written into contact_person by /api/lead-magnet/confirm),
                // then fall back to the older single contact_name field.
                const confirmedFullName = [contactPerson.first_name, contactPerson.last_name].filter(Boolean).join(" ").trim()
                    || contactPerson.name
                    || (inferredFresh.contact_name as string | null)
                    || (analysis.lead_name as string | null)
                    || null;

                await pushQuickCheckerBriefToHubSpot({
                    email: leadEmail,
                    companyName,
                    contactName: confirmedFullName,
                    contactPhone: contactPerson.phone || (inferredFresh.contact_phone as string | null) || null,
                    contactJobTitle: jobTitle,
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
                    reconciled: reconciledForHub,
                    naicsCodes: tempProfile.naics_codes,
                    firmographics: firmoBlob,
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
    } finally {
        // Cancel the watchdog — pipeline ran to completion (success or
        // handled error) so we don't want the timer flipping a row that
        // already finished.
        clearTimeout(watchdog);
    }
}
