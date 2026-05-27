/**
 * Admin DB health endpoint — drives the /admin/db-health dashboard.
 *
 * Aggregated counts + NULL-field rates + enrichment progress + recent
 * ingestion velocity for the core tables. Returns one JSON blob so the
 * UI can render the whole page from a single fetch (avoiding the N+1
 * problem the /admin/overview page hit when it grew).
 *
 * Auth: gated by assertAdmin(). Performance: uses count='estimated' on
 * the large tables (opportunities, contractors, contacts) — sub-100ms
 * per aggregate vs multi-second on exact COUNT(*) at 100k rows.
 */

import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";

export const runtime = "nodejs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SbAny = SupabaseClient<any, any, any>;

interface FieldFillRate {
    field: string;
    populated: number;
    pct: number;
}

interface TableHealth {
    table: string;
    total: number;
    last_24h_inserted?: number;
    fill_rates?: FieldFillRate[];
}

interface IngestVelocity {
    label: string;
    last_24h: number;
    last_7d: number;
}

interface DbHealthResponse {
    generated_at: string;
    tables: TableHealth[];
    ingestion: IngestVelocity[];
    enrichment: {
        contractors_with_email: { populated: number; total: number; pct: number };
        contractors_with_website: { populated: number; total: number; pct: number };
        contractors_apollo_enriched: { populated: number; total: number; pct: number };
        opps_with_ai_strategy: { populated: number; total: number; pct: number };
        opps_with_structured_reqs: { populated: number; total: number; pct: number };
        opps_with_keywords: { populated: number; total: number; pct: number };
        sled_with_jurisdiction: { populated: number; total: number; pct: number };
    };
    worker_jobs: {
        pending: number;
        running: number;
        done_24h: number;
        failed_24h: number;
        failure_pct_24h: number;
    };
    alerts: {
        open: number;
        recent: Array<{ slug: string; severity: string; message: string; created_at: string }>;
    };
}

async function count(sb: SbAny, table: string, filt: Record<string, string> = {}, mode: "exact" | "estimated" = "estimated"): Promise<number> {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = sb.from(table).select("id", { count: mode, head: true });
        for (const [k, v] of Object.entries(filt)) {
            const dot = v.indexOf(".");
            const op = dot === -1 ? v : v.slice(0, dot);
            const val = dot === -1 ? "" : v.slice(dot + 1);
            if (op === "eq") q = q.eq(k, val);
            else if (op === "gte") q = q.gte(k, val);
            else if (op === "is" && val === "null") q = q.is(k, null);
            else if (op === "not.is" && val === "null") q = q.not(k, "is", null);
        }
        const { count: n } = await q;
        return n || 0;
    } catch { return 0; }
}

export async function GET() {
    const denied = await assertAdmin();
    if (denied) return denied;

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    const day = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const week = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Run everything in parallel — single Promise.all with named keys via tuple
    const [
        oppsTotal, oppsActive, oppsActiveSAM, oppsActiveSLED,
        oppsLast24h, oppsLast7d,
        contractorsTotal, contractorsApollo, contractorsEmail, contractorsWebsite,
        contactsTotal, contactsEmail,
        contractorPagesTotal, contractorPages24h,
        sledTotal, sledTagged,
        oppsAiStrategy, oppsStructReqs, oppsKeywords,
        wjPending, wjRunning, wjDone24h, wjFailed24h,
        alertsOpen,
    ] = await Promise.all([
        count(sb, "opportunities"),
        count(sb, "opportunities", { is_archived: "eq.false" }),
        count(sb, "opportunities", { source: "eq.sam", is_archived: "eq.false" }),
        count(sb, "opportunities", { source: "eq.sled", is_archived: "eq.false" }),
        count(sb, "opportunities", { created_at: `gte.${day}` }),
        count(sb, "opportunities", { created_at: `gte.${week}` }),
        count(sb, "contractors"),
        count(sb, "contractors", { apollo_enriched: "eq.true" }),
        count(sb, "contractors", { email: "not.is.null" }),
        count(sb, "contractors", { website: "not.is.null" }),
        count(sb, "contacts"),
        count(sb, "contacts", { email: "not.is.null" }),
        count(sb, "contractor_profile_pages", { is_published: "eq.true" }),
        count(sb, "contractor_profile_pages", { is_published: "eq.true", published_at: `gte.${day}` }),
        count(sb, "opportunities", { source: "eq.sled", is_archived: "eq.false" }),
        count(sb, "opportunities", { source: "eq.sled", is_archived: "eq.false", jurisdiction_level: "not.is.null" }),
        count(sb, "opportunities", { is_archived: "eq.false", ai_win_strategy: "not.is.null" }),
        count(sb, "opportunities", { is_archived: "eq.false", structured_requirements: "not.is.null" }),
        count(sb, "opportunities", { is_archived: "eq.false", extracted_keywords: "not.is.null" }),
        count(sb, "worker_jobs", { status: "eq.pending" }),
        count(sb, "worker_jobs", { status: "eq.running" }),
        count(sb, "worker_jobs", { status: "eq.done", finished_at: `gte.${day}` }),
        count(sb, "worker_jobs", { status: "eq.failed", finished_at: `gte.${day}` }),
        count(sb, "health_alerts", { status: "eq.open" }),
    ]);

    const recentAlertsRes = await sb
        .from("health_alerts")
        .select("connector_slug, severity, message, created_at")
        .order("created_at", { ascending: false })
        .limit(8);

    const pct = (n: number, d: number) => d > 0 ? Math.round((n / d) * 1000) / 10 : 0;
    const totalWj24h = wjDone24h + wjFailed24h;

    const resp: DbHealthResponse = {
        generated_at: new Date().toISOString(),
        tables: [
            { table: "opportunities", total: oppsTotal, last_24h_inserted: oppsLast24h, fill_rates: [
                { field: "ai_win_strategy", populated: oppsAiStrategy, pct: pct(oppsAiStrategy, oppsActive) },
                { field: "structured_requirements", populated: oppsStructReqs, pct: pct(oppsStructReqs, oppsActive) },
                { field: "extracted_keywords", populated: oppsKeywords, pct: pct(oppsKeywords, oppsActive) },
            ]},
            { table: "contractors", total: contractorsTotal, fill_rates: [
                { field: "email", populated: contractorsEmail, pct: pct(contractorsEmail, contractorsTotal) },
                { field: "website", populated: contractorsWebsite, pct: pct(contractorsWebsite, contractorsTotal) },
                { field: "apollo_enriched", populated: contractorsApollo, pct: pct(contractorsApollo, contractorsTotal) },
            ]},
            { table: "contacts", total: contactsTotal, fill_rates: [
                { field: "email", populated: contactsEmail, pct: pct(contactsEmail, contactsTotal) },
            ]},
            { table: "contractor_profile_pages", total: contractorPagesTotal, last_24h_inserted: contractorPages24h },
        ],
        ingestion: [
            { label: "opportunities", last_24h: oppsLast24h, last_7d: oppsLast7d },
            { label: "active SAM (federal)", last_24h: 0, last_7d: oppsActiveSAM },
            { label: "active SLED", last_24h: 0, last_7d: oppsActiveSLED },
            { label: "contractor pages", last_24h: contractorPages24h, last_7d: 0 },
        ],
        enrichment: {
            contractors_with_email: { populated: contractorsEmail, total: contractorsTotal, pct: pct(contractorsEmail, contractorsTotal) },
            contractors_with_website: { populated: contractorsWebsite, total: contractorsTotal, pct: pct(contractorsWebsite, contractorsTotal) },
            contractors_apollo_enriched: { populated: contractorsApollo, total: contractorsTotal, pct: pct(contractorsApollo, contractorsTotal) },
            opps_with_ai_strategy: { populated: oppsAiStrategy, total: oppsActive, pct: pct(oppsAiStrategy, oppsActive) },
            opps_with_structured_reqs: { populated: oppsStructReqs, total: oppsActive, pct: pct(oppsStructReqs, oppsActive) },
            opps_with_keywords: { populated: oppsKeywords, total: oppsActive, pct: pct(oppsKeywords, oppsActive) },
            sled_with_jurisdiction: { populated: sledTagged, total: sledTotal, pct: pct(sledTagged, sledTotal) },
        },
        worker_jobs: {
            pending: wjPending,
            running: wjRunning,
            done_24h: wjDone24h,
            failed_24h: wjFailed24h,
            failure_pct_24h: pct(wjFailed24h, totalWj24h),
        },
        alerts: {
            open: alertsOpen,
            recent: (recentAlertsRes.data || []).map(a => ({
                slug: (a as { connector_slug?: string }).connector_slug || "unknown",
                severity: (a as { severity?: string }).severity || "info",
                message: (a as { message?: string }).message || "",
                created_at: (a as { created_at?: string }).created_at || "",
            })),
        },
    };

    return NextResponse.json(resp, {
        headers: { "Cache-Control": "private, max-age=30" },
    });
}
