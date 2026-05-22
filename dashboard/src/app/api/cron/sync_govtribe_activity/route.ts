/**
 * Pre-warm the GovTribe MCP cache for opportunities we care about.
 *
 * GovTribe MCP rounds-trip ~1-2s per call. Pre-pulling activity for the
 * top-N opportunities by deadline keeps the per-opportunity detail page
 * fast (cache hit instead of MCP roundtrip). Each tool call is cached
 * in `govtribe_cache` (migration 062) and the existing
 * /api/intelligence/govtribe routes use that cache.
 *
 * We pull two summaries per opp:
 *   1. activity-summary — recent posting / mod / cancel activity
 *   2. awards-summary   — prior awards on related contract numbers
 *
 * Only opportunities with a `solicitation_number` get pre-warmed; the
 * MCP server keys lookups on that.
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

const APP_BASE = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "https://app.capturepilot.com";

async function prewarm(path: string, params: Record<string, string>, serviceKey: string): Promise<boolean> {
    const q = new URLSearchParams(params).toString();
    try {
        const res = await fetch(`${APP_BASE}${path}?${q}`, {
            headers: { Authorization: `Bearer ${serviceKey}` },
            signal: AbortSignal.timeout(25000),
        });
        return res.ok;
    } catch { return false; }
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

    const serviceKey = process.env.SUPABASE_SERVICE_KEY;
    if (!serviceKey || !process.env.GOVTRIBE_API_KEY) {
        return NextResponse.json({
            success: false,
            error: "GOVTRIBE_API_KEY not configured — sync skipped",
        }, { status: 200 });
    }

    const t0 = Date.now();
    const db = getDb();
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "40", 10), 200);
    const stats = { opps_considered: 0, prewarmed_activity: 0, prewarmed_awards: 0, errors: 0 };

    // Target the most actionable opps: active, deadline within 60 days,
    // with a real solicitation_number.
    const horizon = new Date(Date.now() + 60 * 86400_000).toISOString();
    const { data: opps, error } = await db
        .from("opportunities")
        .select("id, notice_id, solicitation_number, response_deadline")
        .eq("is_archived", false)
        .eq("status", "ACTIVE")
        .not("solicitation_number", "is", null)
        .gt("response_deadline", new Date().toISOString())
        .lt("response_deadline", horizon)
        .order("response_deadline", { ascending: true })
        .limit(limit);
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    stats.opps_considered = (opps || []).length;

    for (const opp of opps || []) {
        if (Date.now() - t0 > 270_000) break;
        const sol = (opp as { solicitation_number?: string }).solicitation_number;
        if (!sol) continue;
        const aOk = await prewarm("/api/intelligence/govtribe/activity-summary", { solicitation: sol }, serviceKey);
        if (aOk) stats.prewarmed_activity++; else stats.errors++;
        const wOk = await prewarm("/api/intelligence/govtribe/awards-summary", { solicitation: sol }, serviceKey);
        if (wOk) stats.prewarmed_awards++; else stats.errors++;
        // GovTribe MCP gates rate-limits — throttle
        await new Promise(r => setTimeout(r, 600));
    }

    // Clean stale cache rows (> 30d) while we're here
    await db.from("govtribe_cache").delete().lt("expires_at", new Date(Date.now() - 30 * 86400_000).toISOString());

    return NextResponse.json({ success: true, ...stats, elapsed_ms: Date.now() - t0 });
}

export const GET = withCronTelemetry("/api/cron/sync_govtribe_activity", GET_handler);
