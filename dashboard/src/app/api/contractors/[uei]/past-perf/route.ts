import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { computePastPerf } from "@/lib/past-perf";

export const maxDuration = 30;

/**
 * GET /api/contractors/[uei]/past-perf
 *
 * Returns a CPARS-proxy rating for a UEI.
 * - Cache hit (<30 days): return stored rating from past_perf_ratings
 * - Cache miss: aggregate signals from our DB + GAO protests → compute → store
 *
 * We aggregate from:
 *   opportunities (award-level mods / amounts per UEI) — our enriched subset
 *   bid_protests  (protests filed against this UEI)
 */
export async function GET(
    _req: NextRequest,
    context: { params: Promise<{ uei: string }> }
) {
    const { uei: rawUei } = await context.params;
    const uei = rawUei.trim().toUpperCase();
    if (!uei || uei.length < 6) {
        return NextResponse.json({ error: "Invalid UEI" }, { status: 400 });
    }

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Cache: 30-day TTL
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: cached } = await admin
        .from("past_perf_ratings")
        .select("*")
        .eq("uei", uei)
        .gt("computed_at", thirtyDaysAgo)
        .maybeSingle();
    if (cached) {
        return NextResponse.json({ ...cached, source: "cache" });
    }

    // Aggregate signals from opportunities table (awarded / modified)
    const { data: opps } = await admin
        .from("opportunities")
        .select("award_amount, department, agency, status, contractor_name, response_deadline")
        .eq("contractor_uei", uei)
        .limit(500);

    const awards = opps || [];
    const totalContracts = awards.length;
    const completedContracts = awards.filter(
        (a) => a.status === "AWARDED" || a.status === "EXPIRED"
    ).length;

    // Count agency concentration — top 3 vs total
    const agencyCount: Record<string, number> = {};
    for (const a of awards) {
        const key = (a.department as string) || (a.agency as string) || "Unknown";
        agencyCount[key] = (agencyCount[key] || 0) + 1;
    }
    const sorted = Object.entries(agencyCount).sort((a, b) => b[1] - a[1]);
    const top3 = sorted.slice(0, 3).reduce((sum, [, c]) => sum + c, 0);
    const repeatRatio = totalContracts > 0 ? top3 / totalContracts : 0;
    const primaryAgencies = sorted.slice(0, 3).map(([name]) => name);

    const totalValue = awards.reduce((s, a) => s + Number(a.award_amount || 0), 0);

    // Protest signals
    const { count: protestAgainstCount } = await admin
        .from("bid_protests")
        .select("id", { count: "exact", head: true })
        .eq("related_uei", uei);

    // Modifications / extensions / terminations: heuristics until we wire FPDS
    // Use completed ratio + total contracts as proxy for now — will be refined
    // when we ship the FPDS-direct fetcher in a later sprint.
    const modifications = 0;
    const extensionRatio = completedContracts > 0 && totalContracts > 0
        ? Math.min(1, completedContracts / totalContracts)
        : 0;
    const terminations = 0;

    const result = computePastPerf({
        total_contracts: totalContracts,
        completed_contracts: completedContracts,
        modification_count: modifications,
        extension_ratio: extensionRatio,
        termination_count: terminations,
        protest_against_count: protestAgainstCount || 0,
        protest_filed_count: 0,
        repeat_customer_ratio: repeatRatio,
    });

    const contractorName = awards[0]?.contractor_name || null;

    // Upsert into the cache
    await admin.from("past_perf_ratings").upsert({
        uei,
        contractor_name: contractorName,
        total_contracts: totalContracts,
        total_value_usd: totalValue,
        completed_contracts: completedContracts,
        modification_count: modifications,
        avg_modifications: totalContracts > 0 ? modifications / totalContracts : 0,
        extension_ratio: extensionRatio,
        termination_count: terminations,
        protest_against_count: protestAgainstCount || 0,
        protest_filed_count: 0,
        primary_agencies: primaryAgencies,
        repeat_customer_ratio: repeatRatio,
        rating: result.rating,
        rating_score: result.rating_score,
        reasoning: result.reasoning,
        computed_at: new Date().toISOString(),
    });

    return NextResponse.json({
        uei,
        contractor_name: contractorName,
        total_contracts: totalContracts,
        total_value_usd: totalValue,
        primary_agencies: primaryAgencies,
        repeat_customer_ratio: repeatRatio,
        rating: result.rating,
        rating_score: result.rating_score,
        reasoning: result.reasoning,
        source: "computed",
    });
}
