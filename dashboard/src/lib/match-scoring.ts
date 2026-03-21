/**
 * Shared match scoring functions.
 * Used by /api/matches/refresh (authenticated) and /api/lead-matches (anonymous).
 * Must stay in sync with tools/2_score_matches.py.
 */

export const SCORING_WEIGHTS = {
    naics: 0.15,
    psc: 0.10,
    set_aside: 0.15,
    geo: 0.10,
    value_fit: 0.10,
    past_perf: 0.10,
    notice_type: 0.10,
    agency_pref: 0.05,
    deadline: 0.05,
    cert_bonus: 0.10,
};

export function scoreNaics(userNaics: string[], oppNaics: string | null): number {
    if (!oppNaics || !userNaics?.length) return 0.0;
    if (userNaics.includes(oppNaics)) return 1.0;
    if (userNaics.some(n => n.substring(0, 4) === oppNaics.substring(0, 4))) return 0.6;
    if (userNaics.some(n => n.substring(0, 3) === oppNaics.substring(0, 3))) return 0.3;
    return 0.0;
}

export function scorePsc(userPscs: string[], oppPsc: string | null): number {
    if (!oppPsc || !userPscs?.length) return 0;
    const opp = oppPsc.toUpperCase();
    if (userPscs.some(p => p.toUpperCase() === opp)) return 1.0;
    if (userPscs.some(p => p.toUpperCase().substring(0, 2) === opp.substring(0, 2))) return 0.5;
    return 0;
}

export function scoreSetAside(userCerts: string[], oppSetAside: string | null): number {
    if (!oppSetAside) return userCerts?.length ? 0.5 : 0.3;
    const sa = oppSetAside.toLowerCase();
    const certs = (userCerts || []).map(c => c.toLowerCase());
    const certMap: Record<string, string[]> = {
        "8(a)": ["8(a)", "8a"], sdvosb: ["sdvosb"], wosb: ["wosb"],
        edwosb: ["edwosb"], hubzone: ["hubzone"], vosb: ["vosb"], sdb: ["sdb"],
    };
    for (const [key, variants] of Object.entries(certMap)) {
        if (sa.includes(key)) {
            if (variants.some(v => certs.some(c => c.includes(v)))) return 1.0;
            return 0.0;
        }
    }
    if (sa.includes("small")) return certs.length ? 0.6 : 0.4;
    return 0.3;
}

export function scoreGeo(userState: string, targetStates: string[], oppState: string | null): number {
    if (!oppState) return 0.3;
    if (targetStates?.includes(oppState)) return 1.0;
    if (userState && userState === oppState) return 0.8;
    if (!targetStates?.length) return 0.2;
    return 0.0;
}

export function scoreValueFit(revenue: number | null, oppValue: number | null): number {
    if (!oppValue || !revenue || revenue <= 0) return 0.5;
    const ratio = oppValue / revenue;
    if (ratio >= 0.2 && ratio <= 0.8) return 1.0;
    if ((ratio >= 0.1 && ratio < 0.2) || (ratio > 0.8 && ratio <= 1.5)) return 0.5;
    return 0.2;
}

export function scorePastPerf(fedAwards: number): number {
    if (fedAwards >= 5) return 1.0;
    if (fedAwards >= 3) return 0.7;
    if (fedAwards >= 1) return 0.4;
    return 0.2;
}

export function scoreNoticeType(noticeType: string | null): number | null {
    if (!noticeType) return 0.3;
    const nt = noticeType.toLowerCase();
    if (["sources sought", "rfi", "market research"].some(x => nt.includes(x))) return 1.0;
    if (nt.includes("presolicitation")) return 0.8;
    if (nt.includes("combined")) return 0.6;
    if (nt.includes("solicitation")) return 0.5;
    if (nt.includes("award")) return null;
    return 0.3;
}

export function scoreAgencyPref(preferred: string[], agency: string | null): number {
    if (!preferred?.length) return 0.5;
    if (!agency) return 0.3;
    const a = agency.toLowerCase();
    if (preferred.some(p => a.includes(p.toLowerCase()) || p.toLowerCase().includes(a))) return 1.0;
    return 0.2;
}

export function scoreDeadline(deadline: string | null): number | null {
    if (!deadline) return 0.5;
    try {
        const d = new Date(deadline);
        const days = Math.floor((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (days < 0) return null;
        if (days > 30) return 1.0;
        if (days > 14) return 0.7;
        if (days > 7) return 0.4;
        return 0.2;
    } catch { return 0.5; }
}

export function scoreCertBonus(userCerts: string[], oppSetAside: string | null): number {
    if (!oppSetAside || !userCerts?.length) return 0;
    const sa = oppSetAside.toLowerCase();
    const certs = userCerts.map(c => c.toLowerCase());
    if (sa.includes("8(a)") && certs.some(c => c.includes("8a") || c.includes("8(a)"))) return 1.0;
    if (sa.includes("hubzone") && certs.some(c => c.includes("hubzone"))) return 1.0;
    if (sa.includes("sdvosb") && certs.some(c => c.includes("sdvosb"))) return 1.0;
    if (sa.includes("wosb") && certs.some(c => c.includes("wosb") || c.includes("edwosb"))) return 1.0;
    return 0.3;
}

export interface ProfileForScoring {
    naics_codes: string[];
    sba_certifications: string[];
    state: string;
    target_states: string[];
    revenue: number | null;
    federal_awards_count: number;
    target_psc_codes: string[];
    preferred_agencies: string[];
}

export interface OpportunityForScoring {
    id: string;
    naics_code: string | null;
    psc_code: string | null;
    notice_type: string | null;
    agency: string | null;
    set_aside_code: string | null;
    place_of_performance_state: string | null;
    award_amount: number | null;
    response_deadline: string | null;
}

export interface ScoredMatch {
    opportunity_id: string;
    score: number;
    classification: string;
    score_breakdown: Record<string, number>;
}

export function scoreOpportunity(
    profile: ProfileForScoring,
    opp: OpportunityForScoring
): ScoredMatch | null {
    const W = SCORING_WEIGHTS;

    const naics = scoreNaics(profile.naics_codes || [], opp.naics_code);
    const nt = scoreNoticeType(opp.notice_type);
    if (nt === null) return null;
    const dl = scoreDeadline(opp.response_deadline);
    if (dl === null) return null;

    const psc = scorePsc(profile.target_psc_codes || [], opp.psc_code);
    const sa = scoreSetAside(profile.sba_certifications || [], opp.set_aside_code);
    const geo = scoreGeo(profile.state || "", profile.target_states || [], opp.place_of_performance_state);
    const vf = scoreValueFit(profile.revenue, opp.award_amount);
    const pp = scorePastPerf(profile.federal_awards_count || 0);
    const ap = scoreAgencyPref(profile.preferred_agencies || [], opp.agency);
    const cb = scoreCertBonus(profile.sba_certifications || [], opp.set_aside_code);

    const total = W.naics * naics + W.psc * psc + W.set_aside * sa + W.geo * geo +
        W.value_fit * vf + W.past_perf * pp + W.notice_type * nt +
        W.agency_pref * ap + W.deadline * dl + W.cert_bonus * cb;

    if (total < 0.30) return null;

    return {
        opportunity_id: opp.id,
        score: Math.round(total * 10000) / 10000,
        classification: total >= 0.70 ? "HOT" : total >= 0.50 ? "WARM" : "COLD",
        score_breakdown: {
            naics: Math.round(naics * 100) / 100,
            psc: Math.round(psc * 100) / 100,
            set_aside: Math.round(sa * 100) / 100,
            geo: Math.round(geo * 100) / 100,
            value_fit: Math.round(vf * 100) / 100,
            past_performance: Math.round(pp * 100) / 100,
            notice_type: Math.round(nt * 100) / 100,
            agency_pref: Math.round(ap * 100) / 100,
            deadline: Math.round(dl * 100) / 100,
            cert_bonus: Math.round(cb * 100) / 100,
        },
    };
}
