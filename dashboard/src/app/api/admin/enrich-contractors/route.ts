import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/auth-admin";

export const maxDuration = 300;

/**
 * Manual trigger for the contractor-enrichment cron. Lets an admin flush the
 * queue on demand without waiting for the every-2h schedule.
 *
 * Calls the cron endpoint internally with the service-key bearer so it
 * bypasses the cron-only auth gate. Useful from the Tools page or for a
 * one-off backfill push.
 *
 *   POST /api/admin/enrich-contractors?passes=4
 *
 * Each pass runs one cron cycle (50 contractors). Default 1 pass; cap at 6
 * to stay under Vercel's 5-minute function ceiling with margin.
 */
export async function POST(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    const url = new URL(req.url);
    const passes = Math.max(1, Math.min(6, parseInt(url.searchParams.get("passes") || "1", 10)));

    const cronUrl = new URL("/api/cron/enrich_apollo_contractors", req.nextUrl.origin).toString();
    const serviceKey = process.env.SUPABASE_SERVICE_KEY;
    if (!serviceKey) {
        return NextResponse.json({ error: "SUPABASE_SERVICE_KEY not configured" }, { status: 500 });
    }

    const results: unknown[] = [];
    const totals = { company_matched: 0, person_matched: 0, not_found: 0, failed: 0 };
    let blocked = false;

    for (let i = 0; i < passes; i++) {
        const res = await fetch(cronUrl, {
            method: "GET",
            headers: { authorization: `Bearer ${serviceKey}` },
        });
        const data = await res.json().catch(() => ({}));
        results.push(data);
        if (typeof data.company_matched === "number") totals.company_matched += data.company_matched;
        if (typeof data.person_matched  === "number") totals.person_matched  += data.person_matched;
        if (typeof data.not_found       === "number") totals.not_found       += data.not_found;
        if (typeof data.failed          === "number") totals.failed          += data.failed;
        if (data.person_endpoint_blocked) blocked = true;
        // Bail out once the cron reports the queue is empty.
        if (data?.message === "Nothing to enrich") break;
    }

    return NextResponse.json({
        success: true,
        passes_run: results.length,
        totals,
        person_endpoint_blocked: blocked,
        per_pass: results,
    });
}
