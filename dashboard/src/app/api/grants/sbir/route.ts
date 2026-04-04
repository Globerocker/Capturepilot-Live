import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

/**
 * GET /api/grants/sbir?keywords=pipeline&agency=DOD
 * Search SBIR.gov for Small Business Innovation Research and
 * Small Business Technology Transfer grants.
 *
 * SBIR.gov API is free and public — no API key needed.
 * Docs: https://www.sbir.gov/api
 *
 * Query params:
 * - keywords: search terms (required)
 * - agency: filter by agency (optional: DOD, DOE, NASA, NSF, HHS, etc.)
 * - year: fiscal year (optional, default current)
 * - open: "true" to show only open solicitations (optional)
 */
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = req.nextUrl;
        const keywords = searchParams.get("keywords") || "";
        const agency = searchParams.get("agency") || "";
        const open = searchParams.get("open") === "true";
        const year = searchParams.get("year") || String(new Date().getFullYear());

        if (!keywords) {
            return NextResponse.json({ error: "keywords parameter required" }, { status: 400 });
        }

        // SBIR.gov API — search solicitations
        const params = new URLSearchParams({
            keyword: keywords,
            rows: "50",
        });
        if (agency) params.set("agency", agency);
        if (open) params.set("open", "true");

        // Use the SBIR.gov award search API
        const awardUrl = `https://www.sbir.gov/api/solicitations.json?${params.toString()}`;

        const res = await fetch(awardUrl, {
            signal: AbortSignal.timeout(15000),
            headers: { "Accept": "application/json" },
        });

        if (!res.ok) {
            // Fallback: try the alternate API endpoint
            const altUrl = `https://www.sbir.gov/sbirsearch/award/all/?keyword=${encodeURIComponent(keywords)}&agency=${agency}&year=${year}`;
            const altRes = await fetch(altUrl, {
                signal: AbortSignal.timeout(15000),
                headers: { "Accept": "application/json" },
            });

            if (!altRes.ok) {
                return NextResponse.json({
                    error: "SBIR API unavailable",
                    fallback_url: `https://www.sbir.gov/sbirsearch/keyword/${encodeURIComponent(keywords)}`,
                    message: "Use the fallback URL to search SBIR.gov directly",
                }, { status: 503 });
            }

            const altData = await altRes.json();
            return NextResponse.json({
                source: "sbir.gov",
                results: altData,
                search_url: `https://www.sbir.gov/sbirsearch/keyword/${encodeURIComponent(keywords)}`,
            });
        }

        const data = await res.json();

        // Normalize results
        const solicitations = Array.isArray(data) ? data : (data.solicitations || data.results || []);

        const normalized = solicitations.slice(0, 50).map((s: Record<string, unknown>) => ({
            title: s.solicitation_title || s.title || s.award_title || "",
            agency: s.agency || s.branch || "",
            program: s.program || (String(s.solicitation_number || "").includes("STTR") ? "STTR" : "SBIR"),
            topic_number: s.topic_number || s.solicitation_number || "",
            description: String(s.abstract || s.description || "").substring(0, 500),
            open_date: s.open_date || s.solicitation_year || "",
            close_date: s.close_date || "",
            award_amount: s.award_amount || s.amount || null,
            phase: s.phase || "",
            url: s.url || s.sbir_url || `https://www.sbir.gov/node/${s.nid || ""}`,
        }));

        return NextResponse.json({
            source: "sbir.gov",
            total: normalized.length,
            results: normalized,
            search_url: `https://www.sbir.gov/sbirsearch/keyword/${encodeURIComponent(keywords)}`,
        });

    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
