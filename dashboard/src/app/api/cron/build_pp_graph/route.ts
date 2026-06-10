import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const maxDuration = 300;

function getSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );
}

/**
 * Build / refresh the past-performance graph (prime_relationships table).
 *
 * Strategy (deterministic, no LLM):
 *   1. Scan Award Notices in `opportunities` from the last 24 months that name
 *      a winning contractor (incumbent_contractor_uei) and were preceded by a
 *      solicitation with a known incumbent.
 *   2. For each award, the winner beats the prior incumbent (when they differ).
 *      Insert an edge winner -> loser in prime_relationships, tagged with
 *      agency, NAICS, amount, decision date.
 *   3. De-dupe via the unique index (winner, loser, contract_id). Re-running
 *      is safe.
 *
 * Resolves contractor ids by UEI lookup against the `contractors` table.
 * Skips rows we can't resolve on either side.
 *
 * Routed nightly via Vercel cron (see vercel.json). Batched 500 award rows per
 * run; surplus picked up on the next tick.
 */
export async function GET(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getSupabase();
    const startTime = Date.now();
    const stats = {
        awards_scanned: 0,
        edges_inserted: 0,
        skipped_missing_winner: 0,
        skipped_missing_loser: 0,
        skipped_same_party: 0,
        errors: 0,
    };

    try {
        // Awards posted in the last 24 months that have a winner UEI on record.
        const cutoff = new Date(Date.now() - 24 * 30 * 24 * 60 * 60 * 1000).toISOString();

        const { data: awards, error } = await db
            .from("opportunities")
            .select("id, notice_id, agency, naics_code, award_amount, incumbent_contractor_uei, incumbent_contractor_name, posted_date, response_deadline, notice_type")
            .eq("notice_type", "Award Notice")
            .not("incumbent_contractor_uei", "is", null)
            .gte("posted_date", cutoff)
            .order("posted_date", { ascending: false, nullsFirst: false })
            .limit(500);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (!awards || awards.length === 0) {
            return NextResponse.json({ success: true, message: "No awards in window", ...stats });
        }

        for (const award of awards) {
            if (Date.now() - startTime > 260_000) break;
            stats.awards_scanned++;

            try {
                const winnerUei = String(award.incumbent_contractor_uei || "").trim();
                if (!winnerUei) { stats.skipped_missing_winner++; continue; }

                const winnerId = await uei_to_contractor_id(db, winnerUei);
                if (!winnerId) { stats.skipped_missing_winner++; continue; }

                // Loser candidate: any prior (pre-award) opportunity on the same
                // notice_id with a different incumbent UEI, OR same agency/NAICS
                // with a distinct prior incumbent.
                const loserUei = await find_prior_incumbent_uei(db, award);
                if (!loserUei) { stats.skipped_missing_loser++; continue; }

                if (loserUei === winnerUei) { stats.skipped_same_party++; continue; }

                const loserId = await uei_to_contractor_id(db, loserUei);
                if (!loserId) { stats.skipped_missing_loser++; continue; }
                if (loserId === winnerId) { stats.skipped_same_party++; continue; }

                const decisionDate = (award.posted_date as string | null)?.slice(0, 10) ?? null;

                const { error: upErr } = await db
                    .from("prime_relationships")
                    .upsert({
                        winner_contractor_id: winnerId,
                        loser_contractor_id: loserId,
                        agency: award.agency ?? null,
                        naics_code: award.naics_code ?? null,
                        contract_id: (award.notice_id as string) ?? null,
                        award_amount: award.award_amount ?? null,
                        decision_date: decisionDate,
                        contract_type: "AWARD_NOTICE",
                    }, {
                        onConflict: "winner_contractor_id,loser_contractor_id,contract_id",
                        ignoreDuplicates: true,
                    });

                if (upErr) {
                    stats.errors++;
                } else {
                    stats.edges_inserted++;
                }
            } catch {
                stats.errors++;
            }
        }

        return NextResponse.json({ success: true, ...stats });
    } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown error";
        return NextResponse.json({ success: false, error: message, ...stats }, { status: 500 });
    }
}

async function uei_to_contractor_id(db: SupabaseClient, uei: string): Promise<string | null> {
    const { data } = await db
        .from("contractors")
        .select("id")
        .eq("uei", uei)
        .maybeSingle();
    return (data?.id as string) ?? null;
}

interface AwardRow {
    notice_id: string | null;
    agency: string | null;
    naics_code: string | null;
    incumbent_contractor_uei: string | null;
    posted_date: string | null;
}

/**
 * Find the incumbent who was holding the contract before this award landed.
 *
 * Two passes:
 *   1. Same notice_id, earlier posting, with a different incumbent UEI.
 *   2. Same agency + NAICS, earlier award notice, distinct UEI (best effort).
 */
async function find_prior_incumbent_uei(db: SupabaseClient, award: AwardRow): Promise<string | null> {
    const winnerUei = award.incumbent_contractor_uei ?? "";

    // Pass 1: same notice_id, earlier row, different UEI
    if (award.notice_id) {
        const { data: sameNotice } = await db
            .from("opportunities")
            .select("incumbent_contractor_uei, posted_date")
            .eq("notice_id", award.notice_id)
            .not("incumbent_contractor_uei", "is", null)
            .lt("posted_date", award.posted_date ?? new Date().toISOString())
            .order("posted_date", { ascending: false })
            .limit(5);

        for (const row of sameNotice ?? []) {
            const uei = String(row.incumbent_contractor_uei || "").trim();
            if (uei && uei !== winnerUei) return uei;
        }
    }

    // Pass 2: same agency + NAICS, earlier award notice in the last 60 months
    if (award.agency && award.naics_code) {
        const cutoff = new Date(Date.now() - 60 * 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data: priorAwards } = await db
            .from("opportunities")
            .select("incumbent_contractor_uei, posted_date")
            .eq("agency", award.agency)
            .eq("naics_code", award.naics_code)
            .eq("notice_type", "Award Notice")
            .not("incumbent_contractor_uei", "is", null)
            .gte("posted_date", cutoff)
            .lt("posted_date", award.posted_date ?? new Date().toISOString())
            .order("posted_date", { ascending: false })
            .limit(10);

        for (const row of priorAwards ?? []) {
            const uei = String(row.incumbent_contractor_uei || "").trim();
            if (uei && uei !== winnerUei) return uei;
        }
    }

    return null;
}
