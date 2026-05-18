import { NextRequest, NextResponse } from "next/server";
import { fetchOpportunityActivity } from "@/lib/govtribe";

export const maxDuration = 30;

/**
 * GET /api/intelligence/govtribe/activity-summary?days=14&naics=541512,541330
 *
 * Returns the volume + breakdown of federal opportunities posted in the
 * last N days. Optionally narrows by NAICS prefix list.
 */
export async function GET(req: NextRequest) {
    const days = Math.min(60, Math.max(1, parseInt(req.nextUrl.searchParams.get("days") || "14", 10)));
    const naicsCsv = req.nextUrl.searchParams.get("naics");
    const naicsIds = naicsCsv ? naicsCsv.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
    try {
        const data = await fetchOpportunityActivity(days, naicsIds);
        return NextResponse.json(data);
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 502 });
    }
}
