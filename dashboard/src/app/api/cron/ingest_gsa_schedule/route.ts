import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 300;

/**
 * GSA MAS Schedule holders ingest.
 *
 * Pulls Multiple-Award-Schedule contract holders from the GSA Advantage
 * search API. GSA publishes this as public JSON; no key required for
 * public search endpoints. We paginate by SIN code (Special Item Number)
 * and upsert into gsa_schedule_holders.
 *
 * Schedule: weekly Sun 05:00 UTC (see vercel.json).
 */

// Source: GSA CALC (Contract-Awarded Labor Category) public API.
// https://calc.gsa.gov/api/rates/?labor_category=<q>&page=1
// Each rate row carries vendor_name, idv_piid (contract no), schedule,
// min_years_experience, price, and a business-size flag — enough to seed
// gsa_schedule_holders with real contract-holder relationships.
const CALC_BASE = "https://calc.gsa.gov/api/rates/";

interface CalcRateRow {
    vendor_name?: string;
    idv_piid?: string;
    schedule?: string;
    business_size?: string;
    sin?: string;
    labor_category?: string;
    current_price?: number;
    min_years_experience?: number;
    begin_date?: string;
    end_date?: string;
}

// CALC lumps socio-economic data into `business_size` — S=small, O=other.
// We still dedupe vendors across rate rows so one contract no / vendor
// pair lands once in gsa_schedule_holders.

function getDb() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

export async function GET(req: NextRequest) {
    const auth = req.headers.get("authorization");
    if (process.env.CRON_SECRET) {
        const expectedCron = `Bearer ${process.env.CRON_SECRET}`;
        const expectedSvc = process.env.SUPABASE_SERVICE_KEY ? `Bearer ${process.env.SUPABASE_SERVICE_KEY}` : null;
        if (auth !== expectedCron && auth !== expectedSvc) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
    }

    const db = getDb();
    const startTime = Date.now();
    const stats = { fetched: 0, upserted: 0, errors: 0, pages: 0 };
    const MAX_PAGES = 25; // 25 * 200 = up to 5000 rate rows per run
    const PAGE_SIZE = 200;

    // Dedupe in-memory across pages by (contract_no, company_name).
    const seen = new Map<string, {
        contract_no: string;
        company_name: string;
        schedule: string | null;
        sin_codes: string[];
        small_business: boolean;
    }>();

    try {
        for (let page = 1; page <= MAX_PAGES; page++) {
            if (Date.now() - startTime > 260_000) break;
            const url = `${CALC_BASE}?page=${page}&page_size=${PAGE_SIZE}`;
            const res = await fetch(url, {
                signal: AbortSignal.timeout(20_000),
                headers: { "User-Agent": "CapturePilot/1.0 (+https://capturepilot.com)" },
            });
            if (!res.ok) {
                stats.errors++;
                break;
            }
            const body = await res.json().catch(() => null) as { results?: CalcRateRow[] } | null;
            const results = body?.results || [];
            if (results.length === 0) break;
            stats.fetched += results.length;
            stats.pages++;

            for (const r of results) {
                if (!r.idv_piid || !r.vendor_name) continue;
                const key = `${r.idv_piid}::${r.vendor_name}`;
                const existing = seen.get(key);
                if (existing) {
                    if (r.sin && !existing.sin_codes.includes(r.sin)) existing.sin_codes.push(r.sin);
                } else {
                    seen.set(key, {
                        contract_no: r.idv_piid,
                        company_name: r.vendor_name,
                        schedule: r.schedule || null,
                        sin_codes: r.sin ? [r.sin] : [],
                        small_business: (r.business_size || "").toUpperCase() === "S",
                    });
                }
            }
            if (results.length < PAGE_SIZE) break;
        }

        const rows = [...seen.values()].map((v) => ({
            ...v,
            uei: null, duns: null, cage_code: null,
            naics_codes: [], certifications: [],
            phone: null, email: null, website: null, address: null, state: null,
            contract_start_date: null, contract_end_date: null, ceiling_value: null,
            source: "gsa_calc", updated_at: new Date().toISOString(),
        }));

        if (rows.length > 0) {
            for (let i = 0; i < rows.length; i += 500) {
                const chunk = rows.slice(i, i + 500);
                const { error } = await db
                    .from("gsa_schedule_holders")
                    .upsert(chunk, { onConflict: "contract_no,company_name", ignoreDuplicates: false });
                if (error) stats.errors++;
                else stats.upserted += chunk.length;
            }
        }

        return NextResponse.json({ success: true, ...stats, elapsed_ms: Date.now() - startTime });
    } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        console.error("ingest_gsa_schedule error:", msg);
        return NextResponse.json({ error: msg, ...stats }, { status: 500 });
    }
}
