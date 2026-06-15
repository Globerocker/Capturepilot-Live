import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getServiceClient } from "@/lib/admin-auth";
import { getSegment } from "@/lib/outreach/segments";

export const dynamic = "force-dynamic";

/** Columns surfaced in the segment detail table + drawer. */
const SELECT_COLS = [
    "id",
    "company_name",
    "uei",
    "email",
    "state",
    "naics_codes",
    "federal_awards_count",
    "last_award_date",
    "years_in_business",
    "qc_enriched",
    "capability_summary_ai",
].join(", ");

// GET /api/admin/outreach/segments/[key]/contacts?limit=50&offset=0
// Resolves the segment, applies its contractors filter, returns a paginated
// page of rows (with enrichment payload) so the UI can eyeball data quality.
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ key: string }> }
) {
    const { unauth } = await requireAdmin();
    if (unauth) return unauth;

    const { key } = await params;
    const seg = getSegment(key);
    if (!seg) {
        return NextResponse.json({ error: `Unknown segment: ${key}` }, { status: 404 });
    }

    const sp = req.nextUrl.searchParams;
    const limitRaw = parseInt(sp.get("limit") || "50", 10);
    const offsetRaw = parseInt(sp.get("offset") || "0", 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
    const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0;

    const sb = getServiceClient();

    // Total count for pagination.
    const countRes = await seg.apply(
        sb.from("contractors").select("id", { count: "exact", head: true })
    );
    if (countRes.error) {
        return NextResponse.json({ error: countRes.error.message }, { status: 500 });
    }

    // Page of rows. Stable order so pagination doesn't reshuffle.
    const rowsRes = await seg
        .apply(sb.from("contractors").select(SELECT_COLS))
        .order("federal_awards_count", { ascending: false, nullsFirst: false })
        .order("id", { ascending: true })
        .range(offset, offset + limit - 1);

    if (rowsRes.error) {
        return NextResponse.json({ error: rowsRes.error.message }, { status: 500 });
    }

    return NextResponse.json({
        total: countRes.count ?? 0,
        rows: rowsRes.data ?? [],
    });
}
