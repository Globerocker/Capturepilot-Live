import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// Scoring weights (must match tools/2_score_matches.py)
const W = {
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

const MAX_MATCHES = 100;

function scoreNaics(userNaics: string[], oppNaics: string | null): number | null {
    if (!oppNaics || !userNaics?.length) return null;
    if (userNaics.includes(oppNaics)) return 1.0;
    if (userNaics.some(n => n.substring(0, 4) === oppNaics.substring(0, 4))) return 0.6;
    if (userNaics.some(n => n.substring(0, 3) === oppNaics.substring(0, 3))) return 0.3;
    return null;
}

function scorePsc(userPscs: string[], oppPsc: string | null): number {
    if (!oppPsc || !userPscs?.length) return 0;
    const opp = oppPsc.toUpperCase();
    if (userPscs.some(p => p.toUpperCase() === opp)) return 1.0;
    if (userPscs.some(p => p.toUpperCase().substring(0, 2) === opp.substring(0, 2))) return 0.5;
    return 0;
}

function scoreSetAside(userCerts: string[], oppSetAside: string | null): number {
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

function scoreGeo(userState: string, targetStates: string[], oppState: string | null): number {
    if (!oppState) return 0.3;
    if (targetStates?.includes(oppState)) return 1.0;
    if (userState && userState === oppState) return 0.8;
    if (!targetStates?.length) return 0.2;
    return 0.0;
}

function scoreValueFit(revenue: number | null, oppValue: number | null): number {
    if (!oppValue || !revenue || revenue <= 0) return 0.5;
    const ratio = oppValue / revenue;
    if (ratio >= 0.2 && ratio <= 0.8) return 1.0;
    if ((ratio >= 0.1 && ratio < 0.2) || (ratio > 0.8 && ratio <= 1.5)) return 0.5;
    return 0.2;
}

function scorePastPerf(fedAwards: number): number {
    if (fedAwards >= 5) return 1.0;
    if (fedAwards >= 3) return 0.7;
    if (fedAwards >= 1) return 0.4;
    return 0.2;
}

function scoreNoticeType(noticeType: string | null): number | null {
    if (!noticeType) return 0.3;
    const nt = noticeType.toLowerCase();
    if (["sources sought", "rfi", "market research"].some(x => nt.includes(x))) return 1.0;
    if (nt.includes("presolicitation")) return 0.8;
    if (nt.includes("combined")) return 0.6;
    if (nt.includes("solicitation")) return 0.5;
    if (nt.includes("award")) return null; // skip awards
    return 0.3;
}

function scoreAgencyPref(preferred: string[], agency: string | null): number {
    if (!preferred?.length) return 0.5;
    if (!agency) return 0.3;
    const a = agency.toLowerCase();
    if (preferred.some(p => a.includes(p.toLowerCase()) || p.toLowerCase().includes(a))) return 1.0;
    return 0.2;
}

function scoreDeadline(deadline: string | null): number | null {
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

function scoreCertBonus(userCerts: string[], oppSetAside: string | null): number {
    if (!oppSetAside || !userCerts?.length) return 0;
    const sa = oppSetAside.toLowerCase();
    const certs = userCerts.map(c => c.toLowerCase());
    if (sa.includes("8(a)") && certs.some(c => c.includes("8a") || c.includes("8(a)"))) return 1.0;
    if (sa.includes("hubzone") && certs.some(c => c.includes("hubzone"))) return 1.0;
    if (sa.includes("sdvosb") && certs.some(c => c.includes("sdvosb"))) return 1.0;
    if (sa.includes("wosb") && certs.some(c => c.includes("wosb") || c.includes("edwosb"))) return 1.0;
    return 0.3;
}

export async function POST() {
    // Auth check
    const cookieStore = await cookies();
    const authSupabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await authSupabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Use service key for writes
    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
    );

    // Load user profile
    const { data: profile } = await sb
        .from("user_profiles")
        .select("id, naics_codes, sba_certifications, state, target_states, revenue, " +
            "federal_awards_count, target_psc_codes, preferred_agencies")
        .eq("auth_user_id", user.id)
        .single();

    if (!profile) {
        return NextResponse.json({ error: "No profile found" }, { status: 404 });
    }

    // Cast profile for dynamic field access (Supabase doesn't type dynamic selects)
    const p = profile as unknown as Record<string, unknown>;

    // Load active opportunities (paginate)
    const allOpps: Record<string, unknown>[] = [];
    let offset = 0;
    const batchSize = 1000;
    while (true) {
        const { data: batch } = await sb
            .from("opportunities")
            .select("id, naics_code, psc_code, notice_type, agency, set_aside_code, place_of_performance_state, award_amount, response_deadline")
            .eq("is_archived", false)
            .range(offset, offset + batchSize - 1);
        if (!batch || batch.length === 0) break;
        allOpps.push(...batch);
        if (batch.length < batchSize) break;
        offset += batchSize;
    }

    // Score
    const scored: { user_profile_id: string; opportunity_id: string; score: number; classification: string; score_breakdown: Record<string, number> }[] = [];

    for (const opp of allOpps) {
        const naics = scoreNaics((p.naics_codes as string[]) || [], opp.naics_code as string | null);
        if (naics === null) continue;

        const nt = scoreNoticeType(opp.notice_type as string | null);
        if (nt === null) continue;

        const dl = scoreDeadline(opp.response_deadline as string | null);
        if (dl === null) continue;

        const psc = scorePsc((p.target_psc_codes as string[]) || [], opp.psc_code as string | null);
        const sa = scoreSetAside((p.sba_certifications as string[]) || [], opp.set_aside_code as string | null);
        const geo = scoreGeo((p.state as string) || "", (p.target_states as string[]) || [], opp.place_of_performance_state as string | null);
        const vf = scoreValueFit(p.revenue as number | null, opp.award_amount as number | null);
        const pp = scorePastPerf((p.federal_awards_count as number) || 0);
        const ap = scoreAgencyPref((p.preferred_agencies as string[]) || [], opp.agency as string | null);
        const cb = scoreCertBonus((p.sba_certifications as string[]) || [], opp.set_aside_code as string | null);

        const total = W.naics * naics + W.psc * psc + W.set_aside * sa + W.geo * geo +
            W.value_fit * vf + W.past_perf * pp + W.notice_type * nt +
            W.agency_pref * ap + W.deadline * dl + W.cert_bonus * cb;

        if (total < 0.50) continue;

        scored.push({
            user_profile_id: p.id as string,
            opportunity_id: opp.id as string,
            score: Math.round(total * 10000) / 10000,
            classification: total >= 0.70 ? "HOT" : "WARM",
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
        });
    }

    // Sort and keep top MAX_MATCHES
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, MAX_MATCHES);

    // Clean stale matches
    if (top.length > 0) {
        const keepIds = top.map(m => m.opportunity_id);
        try {
            await sb.from("user_matches").delete()
                .eq("user_profile_id", p.id as string)
                .not("opportunity_id", "in", `(${keepIds.join(",")})`);
        } catch { /* ok */ }
    }

    // Upsert matches (in chunks of 200)
    let written = 0;
    for (let i = 0; i < top.length; i += 200) {
        const chunk = top.slice(i, i + 200);
        const { error } = await sb.from("user_matches")
            .upsert(chunk, { onConflict: "user_profile_id,opportunity_id" });
        if (!error) written += chunk.length;
    }

    const hot = top.filter(m => m.classification === "HOT").length;
    const warm = top.filter(m => m.classification === "WARM").length;

    return NextResponse.json({
        success: true,
        total_scored: scored.length,
        written,
        hot,
        warm,
    });
}
