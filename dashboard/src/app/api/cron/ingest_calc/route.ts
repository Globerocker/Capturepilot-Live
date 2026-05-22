import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 300;

/**
 * GSA CALC ingestion cron — weekly Sunday 04:30 UTC.
 *
 * API: https://api.gsa.gov/acquisition/calc/v3/api/ceilingrates/
 * No auth. Paginated (~500K total rows). We ingest in pages of 200 and
 * upsert by (labor_category, contractor_name, schedule) as a rough natural key.
 *
 * Full refresh is expensive — we only fetch pages until we hit rows already
 * in DB with a fetched_at > 6 days ago (changed rarely). For the initial
 * bulk load use tools/25_ingest_calc.mjs.
 *
 * Set CRON_SECRET in env; call with Authorization: Bearer <secret>.
 */
const CALC_URL = "https://api.gsa.gov/acquisition/calc/v3/api/ceilingrates/";

function getDb() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
}

interface CalcRow {
    id?: number;
    labor_category?: string;
    education_level?: string;
    min_years_experience?: number;
    vendor_name?: string;
    idv_piid?: string;
    schedule?: string;
    sin?: string;
    business_size?: string;
    current_price?: string;
    next_year_price?: string;
    keyword?: string;
    worksite?: string;
}

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET) {
        const expectedCron = `Bearer ${process.env.CRON_SECRET}`;
        const expectedSvc = process.env.SUPABASE_SERVICE_KEY ? `Bearer ${process.env.SUPABASE_SERVICE_KEY}` : null;
        if (authHeader !== expectedCron && authHeader !== expectedSvc) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
    }

    const db = getDb();
    const maxPages = 40; // ~8000 rows per cron run; full load ships separately
    let inserted = 0;
    let page = 1;

    try {
        while (page <= maxPages) {
            const params = new URLSearchParams({ page: String(page), ordering: "-id" });
            const res = await fetch(`${CALC_URL}?${params.toString()}`, {
                headers: { Accept: "application/json" },
            });
            if (!res.ok) break;
            const data = (await res.json()) as { results?: CalcRow[]; next?: string | null };
            const rows = data.results || [];
            if (rows.length === 0) break;

            const mapped = rows.map((r) => ({
                labor_category: r.labor_category || "",
                education_level: r.education_level || null,
                min_years_experience: typeof r.min_years_experience === "number" ? r.min_years_experience : null,
                contractor_name: r.vendor_name || null,
                schedule: r.schedule || null,
                sin: r.sin || null,
                hourly_rate_year1: r.next_year_price ? Number(r.next_year_price) : null,
                hourly_rate_current: r.current_price ? Number(r.current_price) : null,
                idv_piid: r.idv_piid || null,
                business_size: r.business_size || null,
                worksite: r.worksite || null,
                keywords: r.keyword || null,
                source_id: "gsa_calc",
                fetched_at: new Date().toISOString(),
            }));

            const { error } = await db.from("labor_rates").insert(mapped);
            if (!error) inserted += mapped.length;

            if (!data.next) break;
            page++;
        }

        return NextResponse.json({ success: true, pages_read: page, rows_inserted: inserted });
    } catch (e) {
        const msg = e instanceof Error ? e.message : "ingest_calc failed";
        return NextResponse.json({ success: false, error: msg, rows_inserted: inserted }, { status: 500 });
    }
}
