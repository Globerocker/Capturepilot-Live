/**
 * Recompete detection — Phase 19 of the Quick Checker overhaul.
 *
 * A "recompete" is a new federal solicitation for a service that's already
 * under contract. The current incumbent has a structural advantage (live
 * relationship, past performance), but the agency is required to re-solicit
 * — which means a window opens for challengers ~3-6 months before contract
 * end.
 *
 * Heuristic: an opp is LIKELY a recompete when there's a past USAspending
 * award on the same (NAICS, agency, state) combo, recent enough that a
 * follow-on solicitation is plausible (12-60 months back).
 *
 * Per match this means 1 USAspending API call. We cap at 5 parallel calls
 * to stay under the rate limit, and skip when we don't have NAICS or
 * agency on the opp (most SLED rows). Best-effort — failures just mean
 * we don't surface a recompete badge.
 */

import { getTopRecipientsByNaics } from "@/lib/usaspending";

interface MatchInput {
    opportunity_id: string;
    naics_code?: string | null;
    agency?: string | null;
    place_of_performance_state?: string | null;
}

export interface RecompeteFlag {
    opportunity_id: string;
    is_recompete: boolean;
    incumbent_name: string | null;
    /** Free-form reason for the flag — useful for debugging. */
    reason: string | null;
}

const CONCURRENCY = 5;
const PER_CALL_TIMEOUT_MS = 6_000;

async function checkOne(match: MatchInput): Promise<RecompeteFlag> {
    if (!match.naics_code || !match.agency) {
        return { opportunity_id: match.opportunity_id, is_recompete: false, incumbent_name: null, reason: "missing naics or agency" };
    }
    try {
        const top = await Promise.race([
            getTopRecipientsByNaics({
                naics: match.naics_code,
                limit: 1,
                fromFiscalYear: new Date().getFullYear() - 5,
            }),
            new Promise<null>((_, reject) =>
                setTimeout(() => reject(new Error("timeout")), PER_CALL_TIMEOUT_MS),
            ),
        ]);
        if (!top || top.length === 0) {
            return { opportunity_id: match.opportunity_id, is_recompete: false, incumbent_name: null, reason: "no usaspending history" };
        }
        const incumbent = top[0];
        // Heuristic: any prior award on this NAICS in the last 5 years is
        // enough to flag as a likely recompete. Stronger heuristics
        // (agency-name fuzzy match, state filter, contract end date within
        // 6 months) would need richer USAspending queries — leave that to
        // a follow-up.
        return {
            opportunity_id: match.opportunity_id,
            is_recompete: true,
            incumbent_name: incumbent.name || null,
            reason: `prior award to ${incumbent.name}`,
        };
    } catch (err) {
        return { opportunity_id: match.opportunity_id, is_recompete: false, incumbent_name: null, reason: err instanceof Error ? err.message : "error" };
    }
}

/**
 * Detect recompetes for a batch of matches. Concurrency-capped parallel
 * fan-out. Always resolves — never throws.
 */
export async function detectRecompetes(matches: MatchInput[]): Promise<Map<string, RecompeteFlag>> {
    const out = new Map<string, RecompeteFlag>();
    const queue = [...matches];
    const workers: Promise<void>[] = [];

    for (let w = 0; w < CONCURRENCY; w++) {
        workers.push((async () => {
            while (queue.length > 0) {
                const next = queue.shift();
                if (!next) continue;
                const flag = await checkOne(next);
                out.set(next.opportunity_id, flag);
            }
        })());
    }
    await Promise.all(workers);
    return out;
}
