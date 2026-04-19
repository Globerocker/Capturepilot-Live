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

    // ── Aggregate signals ──
    // FPDS is the authoritative source — every contract action + modification.
    // We join with `opportunities` as a supplement for titles/dates the user
    // might recognize, but all the rating math uses FPDS when available.
    const { data: fpdsRows } = await admin
        .from("fpds_awards")
        .select("piid, modification_number, contractor_uei, contractor_name, awarding_agency, obligation_amount, contract_action_type, is_termination, is_option_exercise, is_modification, signed_date, current_end_date, ultimate_end_date")
        .eq("contractor_uei", uei)
        .limit(5000);

    const fpds = fpdsRows || [];

    // Distinct contracts = distinct PIIDs (a contract + all its mods share one PIID)
    const piidSet = new Set(fpds.map((r) => r.piid as string));
    const totalContracts = piidSet.size;

    const modifications = fpds.filter((r) => r.is_modification).length;
    const optionExercises = fpds.filter((r) => r.is_option_exercise).length;
    const terminations = fpds.filter((r) => r.is_termination).length;

    // Completed = current_end_date passed for the latest action per PIID
    const today = new Date().toISOString().slice(0, 10);
    const latestByPiid = new Map<string, typeof fpds[number]>();
    for (const r of fpds) {
        const p = r.piid as string;
        const prev = latestByPiid.get(p);
        if (!prev || (r.signed_date as string) > (prev.signed_date as string)) {
            latestByPiid.set(p, r);
        }
    }
    const completedContracts = Array.from(latestByPiid.values()).filter(
        (r) => (r.current_end_date as string | null) && (r.current_end_date as string) < today
    ).length;

    // Extension ratio = option-exercises divided by distinct contracts
    const extensionRatio = totalContracts > 0 ? Math.min(1, optionExercises / totalContracts) : 0;

    // Agency concentration from FPDS (awarding_agency is cleaner than opportunities.department)
    const agencyCount: Record<string, number> = {};
    for (const r of fpds) {
        const key = (r.awarding_agency as string) || "Unknown";
        agencyCount[key] = (agencyCount[key] || 0) + 1;
    }
    const sorted = Object.entries(agencyCount).sort((a, b) => b[1] - a[1]);
    const top3 = sorted.slice(0, 3).reduce((sum, [, c]) => sum + c, 0);
    const repeatRatio = fpds.length > 0 ? top3 / fpds.length : 0;
    const primaryAgencies = sorted.slice(0, 3).map(([name]) => name);

    const totalValue = fpds.reduce((s, r) => s + Number(r.obligation_amount || 0), 0);

    // Protest signals
    const { count: protestAgainstCount } = await admin
        .from("bid_protests")
        .select("id", { count: "exact", head: true })
        .eq("related_uei", uei);

    // Fallback to opportunities table when FPDS hasn't been ingested for this UEI yet
    if (totalContracts === 0) {
        const { data: oppRows } = await admin
            .from("opportunities")
            .select("contractor_name, status")
            .eq("contractor_uei", uei)
            .limit(1);
        if ((oppRows || []).length === 0) {
            return NextResponse.json({
                uei,
                rating: "insufficient_data",
                rating_score: 0,
                reasoning: "No FPDS or SAM.gov records found for this UEI. Run tools/26_ingest_fpds.mjs --uei " + uei,
                source: "computed",
            });
        }
    }

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

    const contractorName =
        (fpds.find((r) => r.contractor_name)?.contractor_name as string | undefined) || null;

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
