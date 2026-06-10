import { NextRequest, NextResponse } from "next/server";

// Edge runtime — pure SBIR.gov passthrough, no Node-only APIs.
// Lifts non-US TTFB into the regional POP instead of US-only Vercel function region.
export const runtime = "edge";
export const maxDuration = 30;

/**
 * GET /api/sbir/search
 *
 * Thin proxy for SBIR.gov's open solicitations API — surfaces small-business R&D
 * opportunities that aren't in SAM.gov's main feed.
 *
 * Sourced from the awesome-procurement-data list (https://github.com/makegov/awesome-procurement-data).
 *
 * Query params:
 *   keyword=...     (free-text)
 *   agency=...      (e.g. DOD, NASA, NIH)
 *   open=true       (default true — only currently-open solicitations)
 *   limit=20        (capped at 50)
 *
 * Response: { success, total, solicitations: [...] }
 */
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = req.nextUrl;
        const keyword = searchParams.get("keyword") || "";
        const agency = searchParams.get("agency") || "";
        const open = searchParams.get("open") !== "false";
        const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

        const upstream = new URL("https://www.sbir.gov/api/solicitations.json");
        if (keyword) upstream.searchParams.set("keyword", keyword);
        if (agency) upstream.searchParams.set("agency", agency);
        upstream.searchParams.set("rows", String(limit));
        if (open) upstream.searchParams.set("open", "1");

        const res = await fetch(upstream.toString(), {
            headers: { "Accept": "application/json", "User-Agent": "CapturePilot/1.0" },
            signal: AbortSignal.timeout(20_000),
        });

        if (!res.ok) {
            return NextResponse.json({ error: `SBIR.gov returned ${res.status}` }, { status: res.status });
        }

        const raw = await res.json();
        const items = Array.isArray(raw) ? raw : Array.isArray(raw.results) ? raw.results : [];

        const solicitations = items.slice(0, limit).map((item: Record<string, unknown>) => ({
            id: String(item.solicitation_number || item.id || ""),
            title: String(item.solicitation_title || item.title || ""),
            agency: String(item.agency || ""),
            program: String(item.program || ""),
            phase: String(item.phase || ""),
            open_date: String(item.open_date || item.release_date || ""),
            close_date: String(item.close_date || ""),
            url: String(item.solicitation_agency_url || item.solicitation_url || ""),
            topics: Array.isArray(item.current_topics) ? item.current_topics.length : 0,
            description: String(item.description || item.summary || "").substring(0, 400),
        }));

        return NextResponse.json({
            success: true,
            total: solicitations.length,
            source: "sbir.gov",
            query: { keyword, agency, open, limit },
            solicitations,
        });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
