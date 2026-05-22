/**
 * Pre-computes agency × NAICS win-rate aggregates from USAspending.
 *
 * For each (agency, 4-digit NAICS prefix) pair derived from active
 * opportunities, queries USAspending for the last 24 months of contract
 * awards and writes back to past_performance_stats:
 *
 *   - total awards count
 *   - set-aside breakdown (8(a), HUBZone, SDVOSB, WOSB, full-and-open)
 *   - unique winners
 *   - total obligated $
 *   - top 3 winners with $ totals
 *
 * Drives a strategic_scoring boost ("this agency awards 78% of 5617xx to
 * 8(a) firms — your registration matches → +12 score").
 *
 * Per run: process up to 30 distinct (agency, naics_prefix) pairs that
 * either haven't been computed yet OR are stale (>14 days).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { withCronTelemetry } from "@/lib/cron-telemetry";

export const maxDuration = 300;

function getDb() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

const USA_URL = "https://api.usaspending.gov/api/v2/search/spending_by_award/";

interface AwardRecipientRow {
    "Recipient Name"?: string;
    "Award Amount"?: number;
    "type_set_aside"?: string;
    recipient_id?: string;
}

async function fetchPair(agency: string, naicsPrefix: string): Promise<AwardRecipientRow[]> {
    const endDate = new Date().toISOString().split("T")[0]!;
    const startDate = new Date(Date.now() - 24 * 30 * 86400_000).toISOString().split("T")[0]!;
    const naicsLike = naicsPrefix.padEnd(6, "0");
    const naicsRange = [naicsPrefix, naicsLike];

    const body = {
        filters: {
            agencies: [{ type: "awarding", tier: "toptier", name: agency }],
            time_period: [{ start_date: startDate, end_date: endDate }],
            award_type_codes: ["A", "B", "C", "D"],
            naics_codes: { require: [naicsRange[0]!] },
        },
        fields: ["Recipient Name", "Award Amount", "Awarding Agency", "type_set_aside", "NAICS"],
        page: 1,
        limit: 100,
        sort: "Award Amount",
        order: "desc",
    };
    try {
        const res = await fetch(USA_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(25000),
        });
        if (!res.ok) return [];
        const json = await res.json();
        return (json.results || []) as AwardRecipientRow[];
    } catch {
        return [];
    }
}

function median(sortedNums: number[]): number | null {
    if (sortedNums.length === 0) return null;
    const mid = Math.floor(sortedNums.length / 2);
    return sortedNums.length % 2 ? sortedNums[mid]! : (sortedNums[mid - 1]! + sortedNums[mid]!) / 2;
}

function summarize(rows: AwardRecipientRow[]) {
    const perRecipient = new Map<string, { name: string; awards: number; total: number }>();
    const amounts: number[] = [];
    let total = 0;
    let n8a = 0, nHub = 0, nSdvosb = 0, nWosb = 0, nSmall = 0, nFullOpen = 0;
    for (const r of rows) {
        const name = r["Recipient Name"]?.trim() || "UNKNOWN";
        const amount = Number(r["Award Amount"]) || 0;
        total += amount;
        amounts.push(amount);
        const cur = perRecipient.get(name) || { name, awards: 0, total: 0 };
        cur.awards++; cur.total += amount;
        perRecipient.set(name, cur);
        const sa = (r.type_set_aside || "").toUpperCase();
        if (sa.includes("8A")) n8a++;
        else if (sa.includes("HUBZONE")) nHub++;
        else if (sa.includes("SDVOSB") || sa.includes("VOSB")) nSdvosb++;
        else if (sa.includes("WOSB") || sa.includes("EDWOSB")) nWosb++;
        else if (sa.includes("SBA") || sa.includes("SMALL")) nSmall++;
        else nFullOpen++;
    }
    amounts.sort((a, b) => a - b);
    const top = [...perRecipient.values()].sort((a, b) => b.total - a.total).slice(0, 3);
    return {
        awards_24mo: rows.length,
        awards_set_aside_8a: n8a,
        awards_set_aside_hubzone: nHub,
        awards_set_aside_sdvosb: nSdvosb,
        awards_set_aside_wosb: nWosb,
        awards_set_aside_small: nSmall,
        awards_fullopen: nFullOpen,
        unique_winners: perRecipient.size,
        total_obligated: total,
        median_award_value: median(amounts),
        top_winners: top,
    };
}

async function GET_handler(req: NextRequest): Promise<NextResponse> {
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET) {
        const expectedCron = `Bearer ${process.env.CRON_SECRET}`;
        const expectedSvc = process.env.SUPABASE_SERVICE_KEY ? `Bearer ${process.env.SUPABASE_SERVICE_KEY}` : null;
        if (authHeader !== expectedCron && authHeader !== expectedSvc) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
    }

    const t0 = Date.now();
    const db = getDb();
    const maxPairs = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "30", 10), 100);
    const stats = { pairs_considered: 0, pairs_updated: 0, errors: 0 };

    // Discover candidate (agency, naics_prefix_4) pairs from active opportunities
    const { data: opps, error: oppErr } = await db
        .from("opportunities")
        .select("agency, naics_code")
        .eq("is_archived", false)
        .not("agency", "is", null)
        .not("naics_code", "is", null)
        .limit(5000);
    if (oppErr) {
        return NextResponse.json({ error: oppErr.message }, { status: 500 });
    }

    const seen = new Set<string>();
    const candidates: Array<{ agency: string; naics_prefix: string }> = [];
    for (const o of opps || []) {
        const agency = (o as { agency?: string }).agency?.trim();
        const naics = (o as { naics_code?: string }).naics_code?.toString().trim();
        if (!agency || !naics || naics.length < 4) continue;
        const prefix = naics.slice(0, 4);
        const key = `${agency}|${prefix}`;
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push({ agency, naics_prefix: prefix });
    }
    stats.pairs_considered = candidates.length;

    // Skip pairs that have been computed in the last 14 days
    const cutoff = new Date(Date.now() - 14 * 86400_000).toISOString();
    const { data: fresh } = await db
        .from("past_performance_stats")
        .select("agency, naics_prefix")
        .gte("last_updated", cutoff);
    const freshSet = new Set<string>((fresh || []).map(r => `${r.agency}|${r.naics_prefix}`));
    const toProcess = candidates.filter(c => !freshSet.has(`${c.agency}|${c.naics_prefix}`)).slice(0, maxPairs);

    for (const { agency, naics_prefix } of toProcess) {
        if (Date.now() - t0 > 270_000) break;
        const rows = await fetchPair(agency, naics_prefix);
        if (rows.length === 0) {
            // Still write a zero-row marker so we don't poll this pair every run.
            await db.from("past_performance_stats").upsert({
                agency, naics_prefix, naics_digits: 4,
                awards_24mo: 0, last_updated: new Date().toISOString(),
            }, { onConflict: "agency,naics_prefix" });
            continue;
        }
        const summary = summarize(rows);
        const { error } = await db.from("past_performance_stats").upsert({
            agency,
            naics_prefix,
            naics_digits: 4,
            ...summary,
            last_updated: new Date().toISOString(),
        }, { onConflict: "agency,naics_prefix" });
        if (error) {
            stats.errors++;
            console.warn("PPS upsert error:", error.message);
        } else {
            stats.pairs_updated++;
        }
        // gentle throttle so USAspending doesn't 429 us
        await new Promise(r => setTimeout(r, 250));
    }

    return NextResponse.json({
        success: true,
        ...stats,
        skipped_fresh: freshSet.size,
        elapsed_ms: Date.now() - t0,
    });
}

export const GET = withCronTelemetry("/api/cron/compute_past_performance_stats", GET_handler);
