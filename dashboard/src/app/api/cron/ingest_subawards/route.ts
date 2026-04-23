import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 300;

/**
 * Sub-awards ingest — populates subaward_edges from the public USASpending
 * sub-awards API. Builds the prime→sub relationship graph for teaming and
 * pipeline intel.
 *
 * Strategy: pull sub-awards from the last 30 days, upsert by
 * (prime_uei, sub_uei, prime_award_id, subaward_date). Per-run cap of
 * 5000 rows to stay inside 300s budget.
 *
 * Schedule: weekly Thu 06:00 UTC (see vercel.json).
 */

// USASpending sub-awards = POST /api/v2/subawards/ with a filter body.
const USASPENDING_SUBAWARDS = "https://api.usaspending.gov/api/v2/subawards/";

interface UsaSubawardRow {
    id?: string;
    Sub_Awardee_Name?: string;
    "Sub-Awardee Name"?: string;
    "Sub-Award Amount"?: string | number;
    "Sub-Award Date"?: string;
    "Sub-Award Description"?: string;
    "Prime Award ID"?: string;
    "Prime Recipient Name"?: string;
    "Prime Recipient UEI"?: string;
    "Awarding Agency"?: string;
    "NAICS"?: string;
    // Also support the raw REST fieldset
    prime_award_internal_id?: number;
    prime_award_id?: string;
    prime_award_recipient_name?: string;
    prime_award_recipient_uei?: string;
    subaward_number?: string;
    subawardee_name?: string;
    subawardee_uei?: string;
    subaward_amount?: string | number;
    subaward_action_date?: string;
    subaward_description?: string;
    awarding_agency_name?: string;
    naics_code?: string;
}

function getDb() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

export async function GET(req: NextRequest) {
    const auth = req.headers.get("authorization");
    if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();
    const startTime = Date.now();
    const stats = { fetched: 0, upserted: 0, errors: 0, pages: 0 };
    const MAX_PER_RUN = 5000;
    const PAGE_SIZE = 100;

    try {
        // Window: last 90 days (broad enough to build real prime→sub graph).
        const toISO = new Date().toISOString().split("T")[0];
        const fromISO = new Date(Date.now() - 90 * 86400_000).toISOString().split("T")[0];

        let page = 1;
        while (stats.upserted < MAX_PER_RUN && Date.now() - startTime < 260_000) {
            const reqBody = {
                filters: {
                    time_period: [{ start_date: fromISO, end_date: toISO }],
                    award_type_codes: ["A", "B", "C", "D"],
                },
                subawards: true,
                limit: PAGE_SIZE,
                page,
            };
            const res = await fetch(USASPENDING_SUBAWARDS, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(reqBody),
                signal: AbortSignal.timeout(25_000),
            });
            if (!res.ok) {
                stats.errors++;
                break;
            }
            const body = await res.json();
            type SubRow = {
                id: number;
                subaward_number?: string;
                description?: string;
                action_date?: string;
                amount?: number;
                recipient_name?: string;
            };
            const results = (body?.results || []) as SubRow[];
            if (results.length === 0) break;
            stats.fetched += results.length;
            stats.pages++;

            // This endpoint doesn't return the prime directly — only the sub side.
            // We use subaward_number as the fallback prime identifier + anonymous
            // prime_uei marker. The per-opportunity enrichment already handles
            // prime-side via USASpending `awards` endpoint; this table is a
            // breadth-first sub-awardee harvest for the teaming graph.
            const rows = results
                .filter((r) => r.recipient_name && r.subaward_number)
                .map((r) => ({
                    prime_uei: `piid:${(r.subaward_number || "").slice(0, 30)}`,
                    prime_name: null,
                    sub_uei: (r.recipient_name || "").slice(0, 80),
                    sub_name: r.recipient_name || null,
                    prime_award_id: r.subaward_number || null,
                    subaward_amount: r.amount ? Number(r.amount) : null,
                    subaward_date: r.action_date || null,
                    naics_code: null,
                    agency: null,
                    description: (r.description || "").slice(0, 500) || null,
                }));

            if (rows.length === 0) {
                page++;
                continue;
            }

            const { error } = await db
                .from("subaward_edges")
                .upsert(rows, { onConflict: "prime_uei,sub_uei,prime_award_id,subaward_date", ignoreDuplicates: true });
            if (error) {
                console.error("subaward upsert error:", error.message);
                stats.errors++;
                break;
            }
            stats.upserted += rows.length;
            if (results.length < PAGE_SIZE) break;
            page++;
        }

        return NextResponse.json({ success: true, ...stats, elapsed_ms: Date.now() - startTime });
    } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        console.error("ingest_subawards error:", msg);
        return NextResponse.json({ error: msg, ...stats }, { status: 500 });
    }
}
