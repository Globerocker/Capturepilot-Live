/**
 * Match-Drop campaign helpers.
 *
 * Turns an already-QC-enriched contractor into the two hooks the campaign
 * needs:
 *   1. top_matches  — the 3 best live opportunities for them, with a fit/win
 *                     estimate, scored by the same model as the public Quick
 *                     Checker (scoreOpportunityLeadMagnet).
 *   2. data_gaps    — concrete things missing from their website that a
 *                     contracting officer looks for. Each gap is a ready-to-use
 *                     email hook. We only ever claim a gap we genuinely didn't
 *                     find (never "your NAICS isn't listed" when it is).
 *
 * Both are computed from data already in the DB (capability_summary_ai + the
 * contractor row) — no re-crawl, no LLM — so this runs cheaply over the whole
 * enriched set.
 */
import {
    scoreOpportunityLeadMagnet,
    type ProfileForScoring,
    type OpportunityForScoring,
    type KeywordEntry,
} from "@/lib/match-scoring";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface TopMatch {
    notice_id: string | null;
    title: string;
    agency: string | null;
    pwin: number;     // 0-100, framed as an estimate in copy
    score: number;    // raw 0-1
    // ── Richer per-match signal persisted for the cockpit detail card. All
    //    come straight off the scorer / scored opp, so they're free to store.
    matched_keywords?: string[];                 // canonical keywords that hit title/desc/reqs
    score_breakdown?: Record<string, number>;    // per-factor 0-1 contributions
    naics_code?: string | null;                  // the matched opp's NAICS (for "why it fits")
    set_aside_code?: string | null;              // the matched opp's set-aside (for "why it fits")
}

export interface DataGap {
    key: string;
    hook: string;
}

// ── Gaps, in priority order (sharpest procurement signal first). We surface
//    the FIRST one that applies as the email's gap_hook. Every condition is a
//    genuine "we didn't find X", so the claim is always true. ───────────────
function gapCandidates(blob: any, contractor: any): DataGap[] {
    const out: DataGap[] = [];
    const certs = (blob?.certifications || contractor?.certifications || []) as unknown[];
    const govExp = !!blob?.has_gov_experience;
    const agencies = (blob?.federal_agencies_served || []) as unknown[];
    const past = (blob?.past_customers || []) as unknown[];
    const foundedYear = blob?.capacity_signals?.founded_year || blob?.founded_year || null;
    const shortDesc = String(blob?.short_description || "").trim();

    if (!govExp && agencies.length === 0) {
        out.push({
            key: "no_gov_signal",
            hook: "there's nothing on your site that signals federal experience — that's the first thing a contracting officer checks",
        });
    }
    if (past.length === 0) {
        out.push({
            key: "no_past_performance",
            hook: "your site doesn't show any past performance or client list a contracting officer can verify",
        });
    }
    if (certs.length === 0) {
        out.push({
            key: "no_certs",
            hook: "your certifications aren't visible on your site, so buyers can't tell which set-asides you qualify for",
        });
    }
    if (!foundedYear && !contractor?.years_in_business) {
        out.push({
            key: "no_years",
            hook: "your site doesn't say how long you've been in business — a quick credibility signal you're leaving on the table",
        });
    }
    if (!contractor?.email) {
        out.push({
            key: "no_contact",
            hook: "we couldn't find a clear contact email on your site, which makes it harder for a buyer to reach you",
        });
    }
    if (shortDesc.length > 0 && shortDesc.length < 60) {
        out.push({
            key: "thin_positioning",
            hook: "your site doesn't clearly state what you do in the terms agencies search for",
        });
    }
    return out;
}

export function computeDataGaps(blob: any, contractor: any): { gaps: DataGap[]; gap_hook: string | null } {
    const gaps = gapCandidates(blob, contractor);
    return { gaps, gap_hook: gaps[0]?.hook ?? null };
}

// Short, glanceable labels per gap — for the findings summary + Loom prep.
const GAP_LABEL: Record<string, string> = {
    no_gov_signal: "no federal-experience signal on site",
    no_past_performance: "no past performance shown",
    no_certs: "certifications not visible",
    no_years: "no years-in-business shown",
    no_contact: "no contact email on site",
    thin_positioning: "weak / unclear positioning",
};

/**
 * One-line briefing a partner can read at a glance before recording a Loom or
 * sending: how many matches, top fit %, and the site gaps (sharpest first).
 */
export function buildFindingsSummary(gaps: DataGap[], top: TopMatch[]): string {
    const parts: string[] = [];
    if (top.length) {
        parts.push(`${top.length} live match${top.length === 1 ? "" : "es"} (top fit ~${top[0].pwin}%)`);
    } else {
        parts.push("no live matches in their NAICS right now");
    }
    if (gaps.length) {
        const labels = gaps.map(g => GAP_LABEL[g.key] || g.key).slice(0, 4);
        parts.push(`site gaps: ${labels.join("; ")}`);
    }
    return parts.join(". ") + ".";
}

// ── Build the scoring profile from a contractor + its QC blob. ─────────────
export function buildScoringProfile(contractor: any, blob: any): ProfileForScoring {
    const certs: string[] = (contractor?.certifications || blob?.certifications || [])
        .map((c: any) => (typeof c === "string" ? c : c?.type || "")).filter(Boolean);
    const isVet = certs.some(c => /vosb|sdvosb|veteran/i.test(c));
    const vetCert = certs.find(c => /sdvosb/i.test(c)) ? "SDVOSB"
        : certs.find(c => /vosb|veteran/i.test(c)) ? "VOSB" : null;

    const kw = (blob?.capability_keywords || []) as unknown[];
    const nail = (blob?.nail_down_keywords || []) as unknown[];
    const primary_keywords: KeywordEntry[] = kw.slice(0, 15)
        .map(k => ({ keyword: String(k).toLowerCase() })).filter(e => e.keyword.length > 2);
    const secondary_keywords: KeywordEntry[] = nail.slice(0, 15)
        .map(k => ({ keyword: String(k).toLowerCase() })).filter(e => e.keyword.length > 2);

    return {
        naics_codes: Array.isArray(contractor?.naics_codes) ? contractor.naics_codes : [],
        sba_certifications: certs,
        state: contractor?.state || "",
        target_states: ["NATIONWIDE"], // contractors have no target list; don't let geo kill matches
        revenue: null,
        federal_awards_count: Number(contractor?.federal_awards_count || 0),
        target_psc_codes: [],
        preferred_agencies: [],
        primary_keywords,
        secondary_keywords,
        is_veteran_owned: isVet,
        veteran_cert_type: vetCert,
        employee_count: contractor?.employee_count ?? null,
    };
}

/**
 * Score a candidate opp set for a contractor and return the top N matches.
 * `opps` should already be filtered to active + future-deadline candidates
 * (e.g. by NAICS) so we don't score the whole table.
 */
export function topMatchesFor(
    contractor: any,
    blob: any,
    opps: Array<OpportunityForScoring & { notice_id?: string | null; title?: string | null; agency?: string | null }>,
    n = 3,
): TopMatch[] {
    const profile = buildScoringProfile(contractor, blob);
    const scored: TopMatch[] = [];
    for (const opp of opps) {
        const m = scoreOpportunityLeadMagnet(profile, opp);
        // Only "biddable" matches with real signal — never pitch a set-aside
        // they can't legally win.
        if (!m || m.eligibility !== "eligible") continue;
        scored.push({
            notice_id: (opp.notice_id ?? null) as string | null,
            title: String(opp.title || "Untitled opportunity"),
            agency: (opp.agency ?? null) as string | null,
            pwin: Math.round(m.score * 100),
            score: m.score,
            // Persist the scorer's explainability + the opp's own codes so the
            // cockpit detail card can render "why it fits" bullets without
            // re-scoring (matched_keywords/score_breakdown come from the model).
            matched_keywords: m.matched_keywords,
            score_breakdown: m.score_breakdown,
            naics_code: (opp.naics_code ?? null) as string | null,
            set_aside_code: (opp.set_aside_code ?? null) as string | null,
        });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, n);
}

/** Format one match for an email line: "Title — Agency (~NN% fit)". */
export function formatMatchLine(m: TopMatch): string {
    const agency = m.agency ? ` — ${m.agency}` : "";
    return `${m.title}${agency} (~${m.pwin}% fit)`;
}
