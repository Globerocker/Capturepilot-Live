import { NextRequest, NextResponse } from "next/server";
import { fetchSubAwards } from "@/lib/govtribe";

export const maxDuration = 30;

/** GET /api/intelligence/govtribe/subawards?query=<recipient name> */
export async function GET(req: NextRequest) {
    const query = req.nextUrl.searchParams.get("query")?.trim();
    if (!query) return NextResponse.json({ error: "query required" }, { status: 400 });
    try {
        const data = await fetchSubAwards(query);
        return NextResponse.json(data);
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 502 });
    }
}
