import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const maxDuration = 30;

/**
 * GET /api/sam/opportunity-search?keyword=...&days=180&limit=30&ptype=o
 *
 * Live passthrough to SAM.gov's opportunity search. Used by the dashboard
 * /opportunities page as a "search beyond our ingested rows" toggle —
 * when a user's keyword search returns few/no local results, we can fetch
 * fresh hits from SAM directly and merge them.
 *
 * Returns results in a shape that matches what the local list view expects
 * so the client can dedupe-by-notice_id and append without a second
 * rendering path.
 *
 * Authenticated only — we don't want this scraped at scale via the public
 * URL (the SAM API key has a quota).
 */

interface SamRow {
    noticeId?: string;
    title?: string;
    department?: string;
    subTier?: string;
    office?: string;
    naicsCode?: string;
    type?: string;
    typeOfSetAside?: string;
    typeOfSetAsideDescription?: string;
    responseDeadLine?: string;
    postedDate?: string;
    placeOfPerformance?: { state?: { code?: string }; city?: { name?: string } };
    award?: { amount?: string | number };
    description?: string;
    uiLink?: string;
}

function shape(row: SamRow) {
    const deadline = row.responseDeadLine || null;
    const posted = row.postedDate || null;
    const amount = row.award?.amount;
    const numericAmount = typeof amount === "number" ? amount : typeof amount === "string" ? parseFloat(amount) : null;
    return {
        id: `sam:${row.noticeId}`,            // synthetic — avoids colliding with local UUIDs
        notice_id: row.noticeId || null,
        title: row.title || null,
        agency: row.department || row.subTier || row.office || null,
        organization_code: null,
        notice_type: row.type || null,
        naics_code: row.naicsCode || null,
        response_deadline: deadline,
        posted_date: posted,
        description: row.description || null,
        link: row.uiLink || (row.noticeId ? `https://sam.gov/opp/${row.noticeId}/view` : null),
        is_archived: false,
        estimated_value: null as number | null,
        award_amount: numericAmount && !Number.isNaN(numericAmount) ? numericAmount : null,
        place_of_performance_state: row.placeOfPerformance?.state?.code || null,
        place_of_performance_city: row.placeOfPerformance?.city?.name || null,
        set_aside_code: row.typeOfSetAside || row.typeOfSetAsideDescription || null,
        incumbent_contractor_name: null,
        status: "ACTIVE",
        strategic_scoring: null,
        // Marker so the UI can render a "Live from SAM" badge.
        _source: "sam_live" as const,
    };
}

export async function GET(req: NextRequest) {
    // Authenticate — any signed-in user is fine, but reject anonymous.
    const cookieStore = await cookies();
    const sb = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } },
    );
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const key = process.env.SAM_API_KEY;
    if (!key) return NextResponse.json({ error: "SAM_API_KEY not configured" }, { status: 500 });

    const { searchParams } = new URL(req.url);
    const keyword = (searchParams.get("keyword") || "").trim();
    const days = Math.max(1, Math.min(180, parseInt(searchParams.get("days") || "180", 10)));
    const limit = Math.max(1, Math.min(50, parseInt(searchParams.get("limit") || "30", 10)));
    const ptype = (searchParams.get("ptype") || "o,p,r,k").trim();

    if (!keyword || keyword.length < 3) {
        return NextResponse.json({ results: [], message: "keyword must be 3+ chars" }, { status: 400 });
    }

    const toDate = new Date();
    const fromDate = new Date(toDate.getTime() - days * 86400_000);
    const fmt = (d: Date) => `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;

    const samUrl = new URL("https://api.sam.gov/opportunities/v2/search");
    samUrl.searchParams.set("postedFrom", fmt(fromDate));
    samUrl.searchParams.set("postedTo", fmt(toDate));
    samUrl.searchParams.set("ptype", ptype);
    samUrl.searchParams.set("limit", String(limit));
    samUrl.searchParams.set("offset", "0");
    samUrl.searchParams.set("title", keyword);

    try {
        const res = await fetch(samUrl.toString(), {
            headers: { "X-Api-Key": key },
            signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) {
            const text = await res.text().catch(() => "");
            return NextResponse.json({
                error: `SAM ${res.status}`,
                detail: text.slice(0, 200),
                results: [],
            }, { status: 502 });
        }
        const body = await res.json() as { opportunitiesData?: SamRow[]; totalRecords?: number };
        const rows = Array.isArray(body.opportunitiesData) ? body.opportunitiesData : [];
        return NextResponse.json({
            results: rows.map(shape),
            total_remote: body.totalRecords ?? rows.length,
            keyword,
            days,
        });
    } catch (e) {
        return NextResponse.json({
            error: (e as Error).message || "SAM fetch failed",
            results: [],
        }, { status: 502 });
    }
}
