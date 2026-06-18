/**
 * Reverse matching — given a government OPPORTUNITY, rank the CONTRACTORS that
 * fit it. The inverse of the forward per-user scorer, for a (future)
 * government-buyer product.
 *
 * SET-ASIDE HARD GATE (non-negotiable): an ineligible contractor is NEVER
 * surfaced. Two layers, both fail-closed:
 *   1. SQL pre-filter — for a restricted set-aside, candidates must overlap the
 *      required cert codes (contractors.sba_cert_codes && satisfyingCodes), GIN
 *      indexed. Performance + first exclusion.
 *   2. Canonical per-row gate — contractorIsEligible() re-derives from the LIVE
 *      sba_certifications (not the cached column), so even a stale/empty
 *      sba_cert_codes can't leak an ineligible vendor. This is the authority.
 *   3. restricted_unknown (an unrecognized restricted set-aside) → show NOBODY.
 *
 * Geo is a scoring factor, never a gate (federal firms bid nationwide).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
    scoreNaics, scoreGeo, scorePastPerf, scoreCertBonus, scoreKeywords, type KeywordEntry,
} from "@/lib/match-scoring";
import {
    classifyOpportunitySetAside, contractorIsEligible, type SetAsideClassification,
} from "@/lib/set-aside-eligibility";

/* eslint-disable @typescript-eslint/no-explicit-any */

const CANDIDATE_CAP = 4000;
const DEFAULT_TOP_N = 50;

// Reverse weights — NAICS is a pre-filter (so it's near-constant in the pool);
// keywords + past performance + cert fit + geo do the ranking.
const W = { naics: 0.30, keywords: 0.25, past_perf: 0.20, cert: 0.15, geo: 0.10 };

export interface ReverseMatchLead {
    contractor_id: string;
    company_name: string | null;
    uei: string | null;
    state: string | null;
    naics_codes: string[];
    sba_certifications: string[];
    total_federal_awards: number | null;
    registration_status: string | null;
    sam_expiration: string | null;
    score: number;                 // 0-100
    classification: "HOT" | "WARM" | "COLD";
    score_breakdown: Record<string, number>;
}

export interface ReverseMatchResult {
    opportunity: {
        id: string;
        title: string | null;
        agency: string | null;
        naics_code: string | null;
        set_aside_code: string | null;
        place_of_performance_state: string | null;
    };
    set_aside_kind: SetAsideClassification["kind"];
    required_label: string | null;
    gated: boolean;                // true => restricted_unknown, leads is empty by design
    gated_reason: string | null;
    leads: ReverseMatchLead[];
    candidate_count: number;
    eligible_count: number;
    capped: boolean;
}

const CONTRACTOR_COLS =
    "id, company_name, uei, state, naics_codes, sba_certifications, sba_cert_codes, " +
    "capability_keywords, total_federal_awards, federal_awards_count, registration_status, expiration_date";

function tierFor(score: number): "HOT" | "WARM" | "COLD" {
    if (score >= 70) return "HOT";
    if (score >= 50) return "WARM";
    return "COLD";
}

function toStrArray(v: unknown): string[] {
    if (!Array.isArray(v)) return [];
    return v.map((x) => String(x ?? "").trim()).filter(Boolean);
}

export async function reverseMatchOpportunity(
    sb: SupabaseClient,
    opportunityId: string,
    opts: { topN?: number } = {},
): Promise<ReverseMatchResult> {
    const topN = opts.topN ?? DEFAULT_TOP_N;

    // Accept either the opportunities UUID or the external notice_id.
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(opportunityId);
    const oppSel = "id, title, agency, naics_code, set_aside_code, place_of_performance_state, award_amount, response_deadline, description, structured_requirements, extracted_keywords";
    const oppQuery = sb.from("opportunities").select(oppSel);
    const { data: opp, error: oppErr } = await (isUuid
        ? oppQuery.eq("id", opportunityId)
        : oppQuery.eq("notice_id", opportunityId)
    ).maybeSingle();
    if (oppErr) throw new Error(`opportunity lookup failed: ${oppErr.message}`);
    if (!opp) throw new Error("opportunity not found");

    const o = opp as any;
    const oppMeta = {
        id: String(o.id),
        title: o.title ?? null,
        agency: o.agency ?? null,
        naics_code: o.naics_code ?? null,
        set_aside_code: o.set_aside_code ?? null,
        place_of_performance_state: o.place_of_performance_state ?? null,
    };

    const classification = classifyOpportunitySetAside(o.set_aside_code, null);
    const requiredLabel = classification.kind === "restricted" ? classification.requiredLabel : null;

    // ── restricted_unknown → fail closed: show NOBODY ────────────────────────
    if (classification.kind === "restricted_unknown") {
        return {
            opportunity: oppMeta,
            set_aside_kind: "restricted_unknown",
            required_label: null,
            gated: true,
            gated_reason: `"${o.set_aside_code}" isn't a recognized federal certification set-aside, so we can't verify eligibility — showing no contractors rather than risk an ineligible match.`,
            leads: [],
            candidate_count: 0,
            eligible_count: 0,
            capped: false,
        };
    }

    // ── Candidate pre-filter: NAICS overlap + (restricted ⇒ cert overlap) ────
    let q = sb
        .from("contractors")
        .select(CONTRACTOR_COLS)
        .order("total_federal_awards", { ascending: false, nullsFirst: false })
        .limit(CANDIDATE_CAP);
    if (oppMeta.naics_code) q = q.overlaps("naics_codes", [oppMeta.naics_code]);
    if (classification.kind === "restricted") {
        // HARD GATE layer 1 (SQL): must hold at least one satisfying cert code.
        q = q.overlaps("sba_cert_codes", classification.satisfyingCodes);
    }

    const { data: candidates, error: candErr } = await q;
    if (candErr) throw new Error(`contractor scan failed: ${candErr.message}`);
    const pool = (candidates || []) as any[];

    // ── Score survivors (with the canonical gate as defense-in-depth) ────────
    const oppForKw = { title: o.title, description: o.description, structured_requirements: o.structured_requirements };
    const leads: ReverseMatchLead[] = [];
    for (const c of pool) {
        const certs = toStrArray(c.sba_certifications);
        // HARD GATE layer 2 (canonical, authoritative): re-derive from live certs.
        if (!contractorIsEligible(certs, classification)) continue;

        const naicsCodes = toStrArray(c.naics_codes);
        const fedAwards = typeof c.total_federal_awards === "number" ? c.total_federal_awards
            : typeof c.federal_awards_count === "number" ? c.federal_awards_count : 0;

        const naics = scoreNaics(naicsCodes, oppMeta.naics_code);
        const geo = scoreGeo(c.state || "", [], oppMeta.place_of_performance_state);
        const pp = scorePastPerf(fedAwards);
        const cert = scoreCertBonus(certs, oppMeta.set_aside_code);
        const kwPrimaries: KeywordEntry[] = toStrArray(c.capability_keywords).map((k) => ({ keyword: k.toLowerCase() }));
        const kw = scoreKeywords(kwPrimaries, [], oppForKw).combined;

        const score01 = naics * W.naics + kw * W.keywords + pp * W.past_perf + cert * W.cert + geo * W.geo;
        const score = Math.round(score01 * 100);

        leads.push({
            contractor_id: String(c.id),
            company_name: c.company_name ?? null,
            uei: c.uei ?? null,
            state: c.state ?? null,
            naics_codes: naicsCodes,
            sba_certifications: certs,
            total_federal_awards: fedAwards || null,
            registration_status: c.registration_status ?? null,
            sam_expiration: c.expiration_date ?? null,
            score,
            classification: tierFor(score),
            score_breakdown: {
                naics: Math.round(naics * 100),
                keywords: Math.round(kw * 100),
                past_perf: Math.round(pp * 100),
                cert: Math.round(cert * 100),
                geo: Math.round(geo * 100),
            },
        });
    }

    leads.sort((a, b) => b.score - a.score || (b.total_federal_awards ?? 0) - (a.total_federal_awards ?? 0));

    return {
        opportunity: oppMeta,
        set_aside_kind: classification.kind,
        required_label: requiredLabel,
        gated: false,
        gated_reason: null,
        leads: leads.slice(0, topN),
        candidate_count: pool.length,
        eligible_count: leads.length,
        capped: pool.length >= CANDIDATE_CAP,
    };
}
