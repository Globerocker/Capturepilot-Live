/**
 * DOL Wage Determinations (SCA + DBA) ingest.
 *
 * Source: SAM.gov wage-determinations search API. Each WD has:
 *   - decision number (WD-YY-NNNN or numeric)
 *   - type (SCA = service, DBA = construction)
 *   - state, county
 *   - occupations: { code, title, hourly, fringe }
 *
 * SAM exposes the wage determinations at /api/prod/wagedeterminations/v1/...
 * Listing endpoint returns JSON. We do a per-state sweep and store
 * one row per (decision, occupation, state, county).
 *
 * Drives bid-pricing intel for service contracts ("if you're bidding
 * janitorial in Cobb County GA, this is the floor wage").
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

const SAM_WD_BASE = "https://api.sam.gov/wage-determinations/v1/search";
const STATES_PRIORITY = [
    // states with highest federal-services demand first
    "VA", "MD", "DC", "TX", "CA", "FL", "GA", "NC", "PA", "OH",
    "IL", "AZ", "WA", "CO", "TN", "MA", "NY", "MI", "AL", "KY",
];

interface SamWdItem {
    revisionNumber?: number;
    wageDecisionNumber?: string;
    type?: string;
    state?: string;
    county?: string;
    effectiveDate?: string;
    occupationCode?: string;
    occupationTitle?: string;
    minimumHourlyRate?: number | string;
    fringeBenefits?: number | string;
    documentUrl?: string;
}

interface SamWdResponse {
    wageDeterminationData?: SamWdItem[];
    totalRecords?: number;
}

async function fetchState(apiKey: string, state: string, limit: number): Promise<SamWdItem[]> {
    const url = `${SAM_WD_BASE}?state=${state}&size=${limit}`;
    try {
        const res = await fetch(url, {
            headers: { "X-Api-Key": apiKey, Accept: "application/json" },
            signal: AbortSignal.timeout(25000),
        });
        if (!res.ok) {
            console.warn(`SAM WD ${state}: HTTP ${res.status}`);
            return [];
        }
        const json = (await res.json()) as SamWdResponse;
        return json.wageDeterminationData || [];
    } catch (e) {
        console.warn(`SAM WD ${state} fetch err: ${(e as Error).message}`);
        return [];
    }
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

    const apiKey = process.env.SAM_API_KEY || process.env.SAM_API_KEY_2;
    if (!apiKey) {
        return NextResponse.json({ error: "No SAM_API_KEY" }, { status: 500 });
    }

    const t0 = Date.now();
    const db = getDb();
    const perState = Math.min(parseInt(req.nextUrl.searchParams.get("per_state") || "200", 10), 1000);
    const onlyState = req.nextUrl.searchParams.get("state");
    const stateList = onlyState ? [onlyState.toUpperCase()] : STATES_PRIORITY;
    const stats = { states_processed: 0, fetched: 0, upserted: 0, errors: 0 };

    for (const state of stateList) {
        if (Date.now() - t0 > 270_000) break;
        const items = await fetchState(apiKey, state, perState);
        stats.states_processed++;
        stats.fetched += items.length;
        const rows = items
            .filter(it => it.wageDecisionNumber && it.occupationCode)
            .map(it => ({
                wage_decision_number: it.wageDecisionNumber!.trim(),
                decision_type: (it.type || "").toUpperCase().startsWith("D") ? "DBA" : "SCA",
                state: it.state || state,
                county: it.county || null,
                occupation_title: it.occupationTitle || null,
                occupation_code: it.occupationCode!.trim(),
                minimum_hourly_rate: Number(it.minimumHourlyRate) || null,
                fringe_benefits: Number(it.fringeBenefits) || null,
                effective_date: it.effectiveDate ? it.effectiveDate.slice(0, 10) : null,
                revision_number: it.revisionNumber ?? null,
                source_url: it.documentUrl || null,
                last_synced: new Date().toISOString(),
            }));
        if (rows.length === 0) continue;
        const { error } = await db
            .from("wage_determinations")
            .upsert(rows, {
                onConflict: "wage_decision_number,occupation_code,state,county",
                ignoreDuplicates: false,
            });
        if (error) {
            stats.errors++;
            console.warn("WD upsert err:", error.message);
        } else {
            stats.upserted += rows.length;
        }
        await new Promise(r => setTimeout(r, 200));
    }

    return NextResponse.json({ success: true, ...stats, elapsed_ms: Date.now() - t0 });
}

export const GET = withCronTelemetry("/api/cron/ingest_dol_wage_determinations", GET_handler);
