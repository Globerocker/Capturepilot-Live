/**
 * DOL Wage Determinations ingest (via SAM.gov public search backend).
 *
 * The official api.sam.gov/wage-determinations/* endpoint requires an
 * authenticated SAM key and returns 404 unauthenticated. The public
 * sam.gov UI uses an internal search backend at
 *   GET https://sam.gov/api/prod/sgs/v1/search?index=wd&size=N&page=P
 * which is accessible without auth and returns the same dataset.
 *
 * Response shape:
 *   { _embedded: { results: [{ _id, title, type{code,value},
 *       publishDate, isActive, isLatest, location.states[...],
 *       cbaNumber|wdNumber, ... }] }, page: { size, totalElements } }
 *
 * Each row is a wage determination (SCA/DBA/CBA). We capture the
 * decision number, type, primary state, effective date, and indexed
 * timestamp. Occupation-level rates require fetching the detail page
 * which is a separate enrichment (skipped here — would explode the
 * row count by 100x without much marginal value for our use case).
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

const SGS_BASE = "https://sam.gov/api/prod/sgs/v1/search";
const UA = "Mozilla/5.0 (compatible; CapturePilotResearch/1.0)";

interface SgsResult {
    _id?: string;
    title?: string;
    type?: { code?: string; value?: string };
    publishDate?: string;
    modifiedDate?: string;
    isActive?: boolean;
    isLatest?: boolean;
    cbaNumber?: string;
    wdNumber?: string;
    revisionNumber?: number;
    location?: { states?: Array<{ code?: string; name?: string; counties?: Array<{ value?: string }> }> };
}
interface SgsResponse {
    _embedded?: { results?: SgsResult[] };
    page?: { size?: number; totalElements?: number };
}

async function fetchPage(page: number, size: number): Promise<SgsResult[]> {
    const url = `${SGS_BASE}?index=wd&q=*&page=${page}&size=${size}&sort=-publishDate&filter.isActive=true`;
    try {
        const res = await fetch(url, {
            headers: { "User-Agent": UA, Accept: "application/json" },
            signal: AbortSignal.timeout(20000),
        });
        if (!res.ok) return [];
        const json = (await res.json()) as SgsResponse;
        return json._embedded?.results || [];
    } catch (e) {
        console.warn("SGS WD fetch err:", (e as Error).message);
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

    const t0 = Date.now();
    const db = getDb();
    const pages = Math.min(parseInt(req.nextUrl.searchParams.get("pages") || "5", 10), 20);
    const pageSize = Math.min(parseInt(req.nextUrl.searchParams.get("size") || "100", 10), 250);
    const stats = { pages_fetched: 0, fetched: 0, upserted: 0, errors: 0 };

    for (let page = 0; page < pages && Date.now() - t0 < 270_000; page++) {
        const items = await fetchPage(page, pageSize);
        stats.pages_fetched++;
        stats.fetched += items.length;
        if (items.length === 0) break;

        const rows: Array<Record<string, unknown>> = [];
        const seen = new Set<string>();
        for (const it of items) {
            const wdNum = (it.wdNumber || it.cbaNumber || it.title || it._id || "").trim();
            if (!wdNum) continue;
            const typeCode = it.type?.code || "UNKNOWN";
            const stateInfo = it.location?.states?.[0];
            const state = stateInfo?.code || "";
            const county = stateInfo?.counties?.[0]?.value || null;
            // Composite dedup key per the unique constraint on the table
            const dedupKey = `${wdNum}|${typeCode}|${state}|${county || ""}`;
            if (seen.has(dedupKey)) continue;
            seen.add(dedupKey);
            rows.push({
                wage_decision_number: wdNum,
                decision_type: typeCode === "CBA" ? "SCA" : typeCode, // CBA rolls under SCA bucket for our purposes
                state,
                county,
                // Per-occupation data lives on a detail page; this row is the WD-level summary.
                occupation_title: null,
                occupation_code: typeCode, // re-using the code field as a discriminator so uniqueness holds
                minimum_hourly_rate: null,
                fringe_benefits: null,
                effective_date: it.publishDate ? it.publishDate.slice(0, 10) : null,
                revision_number: it.revisionNumber ?? null,
                source_url: `https://sam.gov/wage-determinations/${it._id || ""}`,
                last_synced: new Date().toISOString(),
            });
        }
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
        await new Promise(r => setTimeout(r, 250));
    }

    return NextResponse.json({ success: true, ...stats, elapsed_ms: Date.now() - t0 });
}

export const GET = withCronTelemetry("/api/cron/ingest_dol_wage_determinations", GET_handler);
