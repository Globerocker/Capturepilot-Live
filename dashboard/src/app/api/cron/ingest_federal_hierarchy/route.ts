import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 300;

/**
 * Federal Hierarchy (FH) snapshot — monthly on the 1st at 03:30 UTC.
 *
 * API: https://api.sam.gov/prod/federalorganizations/v1/orgs
 * Uses the same SAM API key we already have (X-Api-Key header).
 *
 * Paginated, 100/page max. Full tree is ~20K orgs → ~200 pages.
 * Runs monthly because agency org charts change infrequently.
 */
const FH_URL = "https://api.sam.gov/prod/federalorganizations/v1/orgs";

function getDb() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
}

interface FhOrg {
    fhorgid?: string;
    fhorgname?: string;
    fhorgtype?: string;
    fhorgparentid?: string;
    fhorgparentname?: string;
    agencycode?: string;
    fpdscode?: string;
    dodaac?: string;
    status?: string;
    address?: { state?: string };
}

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const samKey = process.env.SAM_API_KEY;
    if (!samKey) return NextResponse.json({ error: "SAM_API_KEY missing" }, { status: 500 });

    const db = getDb();
    const maxPages = 250;
    let upserted = 0;
    let page = 0;

    try {
        while (page < maxPages) {
            const params = new URLSearchParams({
                limit: "100",
                offset: String(page * 100),
                status: "ACTIVE",
            });
            const res = await fetch(`${FH_URL}?${params.toString()}`, {
                headers: { "X-Api-Key": samKey, Accept: "application/json" },
            });
            if (!res.ok) break;
            const data = (await res.json()) as { orglist?: FhOrg[]; totalrecords?: number };
            const orgs = data.orglist || [];
            if (orgs.length === 0) break;

            const mapped = orgs
                .filter((o) => o.fhorgid)
                .map((o) => ({
                    fh_id: o.fhorgid!,
                    org_name: o.fhorgname || "Unknown",
                    org_type: o.fhorgtype || null,
                    parent_fh_id: o.fhorgparentid || null,
                    parent_name: o.fhorgparentname || null,
                    agency_code: o.agencycode || null,
                    fpds_code: o.fpdscode || null,
                    dodaac: o.dodaac || null,
                    status: (o.status || "active").toLowerCase(),
                    address_state: o.address?.state || null,
                    fetched_at: new Date().toISOString(),
                }));

            const { error } = await db
                .from("federal_hierarchy")
                .upsert(mapped, { onConflict: "fh_id" });
            if (!error) upserted += mapped.length;

            if (orgs.length < 100) break;
            page++;
        }

        return NextResponse.json({ success: true, pages_read: page + 1, rows_upserted: upserted });
    } catch (e) {
        const msg = e instanceof Error ? e.message : "ingest_federal_hierarchy failed";
        return NextResponse.json({ success: false, error: msg, rows_upserted: upserted }, { status: 500 });
    }
}
