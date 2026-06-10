/**
 * Past-Performance Graph helpers.
 *
 * Edges live in `prime_relationships`: winner_contractor_id beat loser_contractor_id
 * on a federal contract (agency + NAICS + amount + decision date).
 *
 * Two consumers today:
 *   - getFlipCandidates: given a contractor (usually an incumbent), find the
 *     primes who repeatedly beat them. These are the most likely teaming
 *     partners or threats on a recompete.
 *   - getRecompeteRisk: given a contractor and an opportunity, estimate the
 *     probability that the incumbent gets unseated (0 = entrenched, 1 = ripe).
 *
 * No LLM, no external calls. Pure SQL aggregates against prime_relationships.
 */
import { SupabaseClient } from "@supabase/supabase-js";

export interface FlipCandidate {
    contractor_id: string;
    name: string | null;
    uei: string | null;
    wins_vs_target: number;
    total_won_amount: number;
    last_win_date: string | null;
}

export interface RecompeteRiskBreakdown {
    risk_score: number;                // 0-1
    risk_band: "LOW" | "MODERATE" | "HIGH";
    incumbent_loss_count: number;      // how many times the incumbent has lost in this NAICS/agency
    incumbent_win_count: number;       // how many times they've held
    competing_primes: number;          // distinct primes who've beaten incumbent in this NAICS/agency
    sample_size: number;               // total edges considered
    notes: string[];
}

/**
 * Primes who repeatedly beat `contractor_id`. Optional agency filter.
 *
 * Returns up to `limit` rows sorted by wins-vs-target desc, then total_won_amount desc.
 * Each row joins contractors for name + UEI.
 */
export async function getFlipCandidates(
    db: SupabaseClient,
    contractor_id: string,
    agency?: string | null,
    limit = 10,
): Promise<FlipCandidate[]> {
    let query = db
        .from("prime_relationships")
        .select("winner_contractor_id, award_amount, decision_date, agency")
        .eq("loser_contractor_id", contractor_id);

    if (agency) {
        query = query.eq("agency", agency);
    }

    const { data: edges, error } = await query.limit(1000);
    if (error || !edges) return [];

    // Aggregate in memory — Supabase REST doesn't expose group-by directly.
    const agg = new Map<string, { wins: number; total: number; last_date: string | null }>();
    for (const e of edges) {
        const wid = e.winner_contractor_id as string;
        const existing = agg.get(wid) ?? { wins: 0, total: 0, last_date: null };
        existing.wins += 1;
        existing.total += Number(e.award_amount || 0);
        const d = e.decision_date as string | null;
        if (d && (!existing.last_date || d > existing.last_date)) existing.last_date = d;
        agg.set(wid, existing);
    }

    const winnerIds = Array.from(agg.keys());
    if (winnerIds.length === 0) return [];

    const { data: contractors } = await db
        .from("contractors")
        .select("id, legal_business_name, uei")
        .in("id", winnerIds);

    const meta = new Map<string, { name: string | null; uei: string | null }>();
    for (const c of contractors ?? []) {
        meta.set(c.id as string, {
            name: (c.legal_business_name as string) ?? null,
            uei: (c.uei as string) ?? null,
        });
    }

    const rows: FlipCandidate[] = winnerIds.map((id) => {
        const a = agg.get(id)!;
        const m = meta.get(id) ?? { name: null, uei: null };
        return {
            contractor_id: id,
            name: m.name,
            uei: m.uei,
            wins_vs_target: a.wins,
            total_won_amount: a.total,
            last_win_date: a.last_date,
        };
    });

    rows.sort((a, b) => {
        if (b.wins_vs_target !== a.wins_vs_target) return b.wins_vs_target - a.wins_vs_target;
        return b.total_won_amount - a.total_won_amount;
    });

    return rows.slice(0, limit);
}

/**
 * Recompete risk for a given opportunity. Looks up the incumbent on the opp,
 * counts how many times they've lost vs held in the same NAICS / agency,
 * and how many distinct primes have beaten them. Returns 0-1 with a band.
 *
 * No incumbent → returns LOW with a note (we have nothing to predict).
 */
export async function getRecompeteRisk(
    db: SupabaseClient,
    contractor_id: string | null,
    opp_id: string,
): Promise<RecompeteRiskBreakdown> {
    const empty: RecompeteRiskBreakdown = {
        risk_score: 0,
        risk_band: "LOW",
        incumbent_loss_count: 0,
        incumbent_win_count: 0,
        competing_primes: 0,
        sample_size: 0,
        notes: [],
    };

    const { data: opp } = await db
        .from("opportunities")
        .select("id, naics_code, agency, incumbent_contractor_uei")
        .eq("id", opp_id)
        .single();

    if (!opp) {
        empty.notes.push("Opportunity not found.");
        return empty;
    }

    // Resolve incumbent if not passed in.
    let incumbentId = contractor_id;
    if (!incumbentId && opp.incumbent_contractor_uei) {
        const { data: c } = await db
            .from("contractors")
            .select("id")
            .eq("uei", opp.incumbent_contractor_uei)
            .maybeSingle();
        incumbentId = (c?.id as string) ?? null;
    }

    if (!incumbentId) {
        empty.notes.push("No incumbent on record — recompete risk requires a current contractor.");
        return empty;
    }

    // Pull edges in the same NAICS, narrowed to agency when we have one.
    const naics = (opp.naics_code as string) ?? null;
    const agency = (opp.agency as string) ?? null;

    const losesQuery = db
        .from("prime_relationships")
        .select("winner_contractor_id, agency, naics_code")
        .eq("loser_contractor_id", incumbentId);
    const winsQuery = db
        .from("prime_relationships")
        .select("loser_contractor_id, agency, naics_code")
        .eq("winner_contractor_id", incumbentId);

    const [{ data: losses }, { data: wins }] = await Promise.all([
        losesQuery.limit(1000),
        winsQuery.limit(1000),
    ]);

    const inScope = (row: { agency: string | null; naics_code: string | null }) => {
        if (naics && row.naics_code && row.naics_code !== naics) {
            // Allow NAICS-prefix match too (6-digit family overlap)
            if (!row.naics_code.startsWith(naics.slice(0, 4))) return false;
        }
        if (agency && row.agency && row.agency !== agency) return false;
        return true;
    };

    const losesScoped = (losses ?? []).filter(inScope);
    const winsScoped = (wins ?? []).filter(inScope);

    const competing = new Set<string>();
    for (const l of losesScoped) {
        if (l.winner_contractor_id) competing.add(l.winner_contractor_id as string);
    }

    const lossCount = losesScoped.length;
    const winCount = winsScoped.length;
    const sample = lossCount + winCount;

    const notes: string[] = [];
    let score: number;

    if (sample === 0) {
        score = 0.2;
        notes.push("No competitive history in this NAICS yet — slight benefit-of-doubt to incumbent.");
    } else {
        // Loss share against this NAICS/agency, scaled up by distinct-prime pressure.
        const lossShare = lossCount / sample;
        const pressure = Math.min(competing.size / 5, 1); // 5+ distinct beaters = saturated
        score = lossShare * 0.7 + pressure * 0.3;
        score = Math.max(0, Math.min(score, 1));
    }

    if (sample > 0 && sample < 4) {
        notes.push(`Small sample (${sample} edges) — treat the score as directional.`);
    }
    if (competing.size >= 3) {
        notes.push(`${competing.size} distinct primes have beaten this incumbent in-scope.`);
    }

    let band: RecompeteRiskBreakdown["risk_band"];
    if (score >= 0.6) band = "HIGH";
    else if (score >= 0.35) band = "MODERATE";
    else band = "LOW";

    return {
        risk_score: Number(score.toFixed(3)),
        risk_band: band,
        incumbent_loss_count: lossCount,
        incumbent_win_count: winCount,
        competing_primes: competing.size,
        sample_size: sample,
        notes,
    };
}
