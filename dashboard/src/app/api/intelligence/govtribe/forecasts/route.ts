import { NextRequest, NextResponse } from "next/server";
import { fetchForecasts } from "@/lib/govtribe";

export const maxDuration = 30;

/**
 * GET /api/intelligence/govtribe/forecasts?naics=541512&agency=Department%20of%20Energy
 */
export async function GET(req: NextRequest) {
    const naicsCsv = req.nextUrl.searchParams.get("naics");
    const naicsIds = naicsCsv ? naicsCsv.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
    const agency = req.nextUrl.searchParams.get("agency") || undefined;
    try {
        const data = await fetchForecasts(naicsIds, agency || undefined);
        return NextResponse.json(data);
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 502 });
    }
}
