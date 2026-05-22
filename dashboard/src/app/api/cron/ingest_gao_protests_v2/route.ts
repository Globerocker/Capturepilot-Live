/**
 * GAO bid-protest decisions ingest (v2).
 *
 * The v1 cron used the RSS feed at gao.gov/rss/protests.xml — that endpoint
 * now returns 403 to default fetch user-agents. This version uses the
 * public products listing API which powers gao.gov's own search UI and
 * doesn't have the same UA filter.
 *
 * Endpoint: GET https://www.gao.gov/api/products?filter[bid_protest]=1
 *   &page=0&per_page=50&sort=-publication_date
 *
 * Each item exposes: docket (B-XXXXXX), title, publication_date, decision
 * outcome (Sustained/Denied/Dismissed), URL.
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

interface GaoListingItem {
    nid?: number;
    title?: string;
    document_url?: string;
    publication_date?: string;
    document_type?: string;
    summary?: string;
    body?: string;
    field_docket_number?: string;
    field_decision?: string;
}

// Best-effort outcome classifier from the title/summary
function classifyOutcome(text: string): string | null {
    const t = text.toLowerCase();
    if (t.includes("sustained")) return "Sustained";
    if (t.includes("denied")) return "Denied";
    if (t.includes("dismissed")) return "Dismissed";
    if (t.includes("withdrawn")) return "Withdrawn";
    return null;
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
    const perPage = 50;
    const stats = { fetched: 0, upserted: 0, errors: 0 };

    for (let page = 0; page < pages && Date.now() - t0 < 270_000; page++) {
        const url = `https://www.gao.gov/api/products?filter[bid_protest]=1&page=${page}&per_page=${perPage}&sort=-publication_date`;
        let body: { data?: GaoListingItem[]; included?: unknown[] } | null = null;
        try {
            const res = await fetch(url, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (compatible; CapturePilotResearch/1.0; +https://capturepilot.com)",
                    Accept: "application/vnd.api+json,application/json",
                },
                signal: AbortSignal.timeout(20000),
            });
            if (!res.ok) {
                stats.errors++;
                if (res.status === 403 || res.status === 404) break;
                continue;
            }
            body = await res.json();
        } catch (e) {
            stats.errors++;
            console.warn("GAO fetch error:", (e as Error).message);
            continue;
        }
        const items = body?.data || [];
        if (items.length === 0) break;
        stats.fetched += items.length;

        const rows = items
            .filter(it => it.field_docket_number)
            .map(it => {
                const fullText = `${it.title || ""} ${it.summary || ""} ${it.body || ""}`;
                return {
                    docket_number: it.field_docket_number!.trim(),
                    protester: null,
                    contracting_agency: null,
                    awardee: null,
                    decision_date: it.publication_date?.slice(0, 10) || null,
                    outcome: it.field_decision?.trim() || classifyOutcome(fullText),
                    naics_code: null,
                    psc_code: null,
                    summary: (it.title || "").slice(0, 500) || null,
                    document_url: it.document_url || null,
                    raw_json: it,
                    last_synced: new Date().toISOString(),
                };
            });

        if (rows.length > 0) {
            const { error } = await db.from("gao_protests").upsert(rows, {
                onConflict: "docket_number",
                ignoreDuplicates: false,
            });
            if (error) {
                console.warn("GAO upsert error:", error.message);
                stats.errors++;
            } else {
                stats.upserted += rows.length;
            }
        }
    }

    return NextResponse.json({
        success: true,
        ...stats,
        elapsed_ms: Date.now() - t0,
    });
}

export const GET = withCronTelemetry("/api/cron/ingest_gao_protests_v2", GET_handler);
