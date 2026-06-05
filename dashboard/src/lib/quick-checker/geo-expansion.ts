/**
 * Geo expansion suggestions — Phase 20 of the Quick Checker overhaul.
 *
 * Counts how many additional opportunities the user would unlock by adding
 * specific neighboring or high-volume states to their target_states list.
 * Surfaced on /check as: "Your 2 NAICS in TX would match 47 more opps if
 * you added FL + GA + LA."
 *
 * Why this matters: most first-time bidders target only their home state
 * out of conservatism. Federal contracts almost always allow remote
 * performance, so adding 3-5 adjacent states usually doubles the
 * actionable pipeline at zero extra capability cost.
 *
 * Approach (cheap, no LLM):
 *   1. For each of the user's primary NAICS codes, count opps in our
 *      `opportunities` table by `place_of_performance_state`, scoped to
 *      active is_archived=false rows.
 *   2. Pick the top 5 states NOT already in target_states.
 *   3. Return them sorted by opp count.
 *
 * One Supabase query (RPC or aggregate select). No external API. ~200ms.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const NEIGHBORING_STATES: Record<string, string[]> = {
    // Crude regional neighbors — used only as a fallback ranking nudge
    // when two states have equal opp counts. Empty if we don't know.
    TX: ["LA", "OK", "AR", "NM"],
    FL: ["GA", "AL"],
    CA: ["AZ", "NV", "OR"],
    NY: ["NJ", "CT", "PA", "MA"],
    PA: ["NY", "NJ", "OH", "MD"],
    GA: ["FL", "AL", "SC", "TN"],
    IL: ["IN", "WI", "IA", "MO"],
    OH: ["PA", "MI", "IN", "KY"],
    VA: ["MD", "NC", "DC", "WV"],
    NC: ["VA", "SC", "GA", "TN"],
};

export interface GeoExpansionSuggestion {
    state: string;
    opp_count: number;
    naics_breakdown: Array<{ naics: string; count: number }>;
}

export interface GeoExpansionResult {
    /** Total opps the user would gain by adding ALL suggested states. */
    total_potential_opps: number;
    suggestions: GeoExpansionSuggestion[];
    /** Free-form human-readable summary for the UI banner. */
    summary: string;
}

const TOP_N = 5;

export async function suggestGeoExpansion(
    sb: SupabaseClient,
    userNaics: string[],
    currentTargetStates: string[],
): Promise<GeoExpansionResult> {
    const empty: GeoExpansionResult = { total_potential_opps: 0, suggestions: [], summary: "" };
    if (!userNaics || userNaics.length === 0) return empty;

    const naicsList = userNaics.slice(0, 5);
    const alreadyTargeting = new Set(
        currentTargetStates.map(s => (s || "").toUpperCase()).filter(Boolean),
    );
    // "NATIONWIDE" means nothing to expand
    if (alreadyTargeting.has("NATIONWIDE")) return empty;

    // Pull a wide window of opps + group by state client-side. Supabase doesn't
    // expose a clean group-by aggregate over the JS client without an RPC, so
    // we fetch the column slice (~1-2KB per row × cap 5000) and aggregate
    // in JS. Cheap because we only need place_of_performance_state + naics_code.
    let allRows: Array<{ state: string | null; naics: string | null }> = [];
    let offset = 0;
    const PAGE = 1000;
    const MAX_ROWS = 5000;
    while (allRows.length < MAX_ROWS) {
        const { data } = await sb
            .from("opportunities")
            .select("place_of_performance_state, naics_code")
            .eq("is_archived", false)
            .in("naics_code", naicsList)
            .range(offset, offset + PAGE - 1);
        if (!data || data.length === 0) break;
        allRows.push(...data.map(r => ({
            state: (r as { place_of_performance_state?: string | null }).place_of_performance_state || null,
            naics: (r as { naics_code?: string | null }).naics_code || null,
        })));
        if (data.length < PAGE) break;
        offset += PAGE;
    }

    if (allRows.length === 0) return empty;

    // Group by state, exclude already-targeted + null-state rows.
    const byState = new Map<string, { count: number; perNaics: Map<string, number> }>();
    for (const row of allRows) {
        const st = (row.state || "").trim().toUpperCase();
        if (!st || alreadyTargeting.has(st)) continue;
        const bucket = byState.get(st) || { count: 0, perNaics: new Map() };
        bucket.count++;
        if (row.naics) {
            bucket.perNaics.set(row.naics, (bucket.perNaics.get(row.naics) || 0) + 1);
        }
        byState.set(st, bucket);
    }

    if (byState.size === 0) return empty;

    // Sort: opp count desc, then neighbors-of-home-state bonus
    const homeState = (currentTargetStates[0] || "").toUpperCase();
    const neighbors = new Set(NEIGHBORING_STATES[homeState] || []);
    const sorted = Array.from(byState.entries())
        .sort((a, b) => {
            const aNeighbor = neighbors.has(a[0]) ? 1 : 0;
            const bNeighbor = neighbors.has(b[0]) ? 1 : 0;
            if (b[1].count !== a[1].count) return b[1].count - a[1].count;
            return bNeighbor - aNeighbor;
        })
        .slice(0, TOP_N);

    const suggestions: GeoExpansionSuggestion[] = sorted.map(([state, b]) => ({
        state,
        opp_count: b.count,
        naics_breakdown: Array.from(b.perNaics.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([naics, count]) => ({ naics, count })),
    }));
    const total = suggestions.reduce((s, x) => s + x.opp_count, 0);
    const top3 = suggestions.slice(0, 3).map(s => s.state).join(" + ");
    const summary = total > 0
        ? `Your ${naicsList.length} NAICS code${naicsList.length === 1 ? "" : "s"} would match ${total} more opportunit${total === 1 ? "y" : "ies"} if you added ${top3}.`
        : "";

    return { total_potential_opps: total, suggestions, summary };
}
