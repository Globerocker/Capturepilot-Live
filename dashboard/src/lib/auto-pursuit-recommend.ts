/**
 * Auto-Pursuit Recommendation Engine.
 *
 * Combines SBA certifications, preferred agencies, NAICS codes, deadline
 * sweet-spot, and past-performance signals into a ranked list of
 * opportunities the user SHOULD be pursuing right now.
 *
 * Algorithm (per ACTIVE HOT/WARM match):
 *   +20  cert + matching set_aside
 *   +15  preferred_agencies includes opp.agency
 *   +10  NAICS match (primary or secondary, prefix-tolerant)
 *   +10  deadline 14-45 days out (sweet spot)
 *   +5   past_performance with same agency
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export interface PursuitReason {
    label: string;
    points: number;
}

export interface PursuitRecommendation {
    opportunity_id: string;
    title: string;
    agency: string;
    naics_code: string | null;
    notice_type: string | null;
    set_aside_code: string | null;
    response_deadline: string | null;
    match_score: number;            // 0..1 from user_matches
    match_classification: string;   // HOT / WARM
    pursuit_score: number;          // 0..60 from our algorithm
    reasons: PursuitReason[];
}

// Map set-aside codes / labels on opportunities to the SBA cert tokens
// users typically store in user_profiles.sba_certifications.
const SET_ASIDE_CERT_TOKENS: Record<string, string[]> = {
    "8a": ["8(a)", "8a"],
    "8(a)": ["8(a)", "8a"],
    "hubzone": ["hubzone"],
    "sdvosb": ["sdvosb"],
    "wosb": ["wosb"],
    "edwosb": ["edwosb", "wosb"],
    "vosb": ["vosb"],
    "sdb": ["sdb"],
};

function certMatchesSetAside(userCerts: string[], oppSetAside: string | null): boolean {
    if (!oppSetAside || !userCerts?.length) return false;
    const sa = oppSetAside.toLowerCase();
    const certs = userCerts.map(c => c.toLowerCase());
    for (const [key, tokens] of Object.entries(SET_ASIDE_CERT_TOKENS)) {
        if (sa.includes(key)) {
            return tokens.some(t => certs.some(c => c.includes(t)));
        }
    }
    return false;
}

function agencyPreferred(preferred: string[], agency: string | null): boolean {
    if (!preferred?.length || !agency) return false;
    const a = agency.toLowerCase();
    return preferred.some(p => {
        const pp = p.toLowerCase();
        return a.includes(pp) || pp.includes(a);
    });
}

function naicsMatches(userNaics: string[], oppNaics: string | null): boolean {
    if (!oppNaics || !userNaics?.length) return false;
    if (userNaics.includes(oppNaics)) return true;
    const opp4 = oppNaics.substring(0, 4);
    return userNaics.some(n => n.substring(0, 4) === opp4);
}

function deadlineInSweetSpot(deadline: string | null): boolean {
    if (!deadline) return false;
    try {
        const d = new Date(deadline);
        const days = Math.floor((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return days >= 14 && days <= 45;
    } catch { return false; }
}

interface PastPerformanceEntry {
    agency?: string;
    customer?: string;
    client?: string;
}

function hasPastPerformanceWithAgency(
    pastPerformance: PastPerformanceEntry[] | undefined,
    agency: string | null,
): boolean {
    if (!agency || !pastPerformance?.length) return false;
    const a = agency.toLowerCase();
    return pastPerformance.some(p => {
        const candidates = [p.agency, p.customer, p.client]
            .filter(Boolean)
            .map(s => (s as string).toLowerCase());
        return candidates.some(c => c.includes(a) || a.includes(c));
    });
}

interface MatchRow {
    score: number;
    classification: string;
    opportunities: {
        id: string;
        title: string;
        agency: string;
        naics_code: string | null;
        notice_type: string | null;
        set_aside_code: string | null;
        response_deadline: string | null;
        status: string;
        is_archived: boolean;
    } | null;
}

const ACTIVE_STATUSES = ["ACTIVE", "EXPIRING_SOON", "MARKET_RESEARCH", "DISCOVERED"];

/**
 * Returns the top N ranked opportunities the user should be pursuing this week,
 * with point-by-point reasons attached.
 */
export async function getAutoPursuitRecommendations(
    userProfileId: string,
    limit = 5,
    sb?: SupabaseClient,
): Promise<PursuitRecommendation[]> {
    const client = sb ?? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );

    // Load profile signals
    const { data: profile } = await client
        .from("user_profiles")
        .select("naics_codes, sba_certifications, preferred_agencies, notes")
        .eq("id", userProfileId)
        .single();

    if (!profile) return [];

    const p = profile as Record<string, unknown>;
    const userNaics = (p.naics_codes as string[]) || [];
    const userCerts = (p.sba_certifications as string[]) || [];
    const preferredAgencies = (p.preferred_agencies as string[]) || [];
    const notes = (p.notes as Record<string, unknown> | null) || {};
    const pastPerformance = (notes.past_performance as PastPerformanceEntry[] | undefined) || [];

    // Pull HOT/WARM ACTIVE matches that aren't already in pipeline or dismissed.
    // !inner on opportunities so the status + archive filter actually filters the join.
    const { data: matches } = await client
        .from("user_matches")
        .select(
            "score, classification, " +
            "opportunities!inner(id, title, agency, naics_code, notice_type, " +
            "set_aside_code, response_deadline, status, is_archived)",
        )
        .eq("user_profile_id", userProfileId)
        .in("classification", ["HOT", "WARM"])
        .eq("is_dismissed", false)
        .eq("opportunities.is_archived", false)
        .in("opportunities.status", ACTIVE_STATUSES)
        .order("score", { ascending: false })
        .limit(200);

    // Already-pursued opps to exclude
    const { data: existingPursuits } = await client
        .from("user_pursuits")
        .select("opportunity_id")
        .eq("user_profile_id", userProfileId);

    const pursuedIds = new Set(
        (existingPursuits || []).map(r => (r as { opportunity_id: string }).opportunity_id),
    );

    const rows = (matches || []) as unknown as MatchRow[];

    const scored: PursuitRecommendation[] = [];

    for (const row of rows) {
        const opp = row.opportunities;
        if (!opp) continue;
        if (pursuedIds.has(opp.id)) continue;

        const reasons: PursuitReason[] = [];
        let pursuitScore = 0;

        if (certMatchesSetAside(userCerts, opp.set_aside_code)) {
            reasons.push({ label: `Your ${opp.set_aside_code} cert unlocks this`, points: 20 });
            pursuitScore += 20;
        }
        if (agencyPreferred(preferredAgencies, opp.agency)) {
            reasons.push({ label: `${opp.agency} is in your preferred agencies`, points: 15 });
            pursuitScore += 15;
        }
        if (naicsMatches(userNaics, opp.naics_code)) {
            reasons.push({ label: `NAICS ${opp.naics_code} matches your profile`, points: 10 });
            pursuitScore += 10;
        }
        if (deadlineInSweetSpot(opp.response_deadline)) {
            reasons.push({ label: "Deadline in the 14-45 day sweet spot", points: 10 });
            pursuitScore += 10;
        }
        if (hasPastPerformanceWithAgency(pastPerformance, opp.agency)) {
            reasons.push({ label: `You have past performance with ${opp.agency}`, points: 5 });
            pursuitScore += 5;
        }

        // Only surface opportunities that earned at least one signal
        if (pursuitScore === 0) continue;

        scored.push({
            opportunity_id: opp.id,
            title: opp.title,
            agency: opp.agency,
            naics_code: opp.naics_code,
            notice_type: opp.notice_type,
            set_aside_code: opp.set_aside_code,
            response_deadline: opp.response_deadline,
            match_score: row.score,
            match_classification: row.classification,
            pursuit_score: pursuitScore,
            reasons,
        });
    }

    // Sort by pursuit_score desc, then match_score desc as tiebreaker
    scored.sort((a, b) => {
        if (b.pursuit_score !== a.pursuit_score) return b.pursuit_score - a.pursuit_score;
        return b.match_score - a.match_score;
    });

    return scored.slice(0, limit);
}
