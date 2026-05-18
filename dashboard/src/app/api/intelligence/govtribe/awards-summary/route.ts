import { NextRequest, NextResponse } from "next/server";
import { fetchAwardsSummary } from "@/lib/govtribe";

export const maxDuration = 30;

/**
 * GET /api/intelligence/govtribe/awards-summary?query=<recipient name>
 *
 * Proxies GovTribe MCP's Search_Federal_Contract_Awards aggregation. Returns:
 *   - total: number of matching awards
 *   - path: deep-link to govtribe.com web UI
 *   - aggregations: top agencies, NAICS, IDVs, set-asides, $ obligated stats
 *
 * In-memory 1 h cache to keep latency low and protect the GovTribe quota.
 */

const cache = new Map<string, { ts: number; data: unknown }>();
const CACHE_TTL_MS = 60 * 60 * 1000;

export async function GET(req: NextRequest) {
    const query = req.nextUrl.searchParams.get("query")?.trim();
    if (!query) return NextResponse.json({ error: "query required" }, { status: 400 });

    const cached = cache.get(query);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
        return NextResponse.json({ ...(cached.data as Record<string, unknown>), source: "cache" });
    }

    try {
        const data = await fetchAwardsSummary(query);
        cache.set(query, { ts: Date.now(), data });
        return NextResponse.json({ ...data, source: "live" });
    } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        return NextResponse.json({ error: msg }, { status: 502 });
    }
}
