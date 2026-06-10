import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";

export const maxDuration = 300;

/**
 * Weekly FPDS-award sweep — grows the contractor audience.
 *
 * Why: our `contractors` table is a frozen SAM-Entity snapshot. The
 * USAspending enrichment only colours in award data for contractors we
 * already know about — it cannot discover new ones. FPDS does: every
 * federal contract action signed in the US is filed there with a
 * recipient UEI + legal name, even if that recipient never registered in
 * SAM the way we ingest it.
 *
 * Strategy per run:
 *   1. For each NAICS in our priority list, fetch the latest FPDS awards
 *      via the Atom feed (single-shot, page 0 = newest first).
 *   2. Upsert awards into `fpds_awards` (idempotent on piid+ref_idv+mod).
 *   3. For UEIs we don't already have in `contractors`, insert a stub
 *      row so the next `enrich_contractors_usaspending` run picks them
 *      up and fills the award rollups + agency relationships.
 *
 * Schedule: Sundays 04:00 UTC, well clear of the SAM ingest window
 * (FPDS is its own API, no quota collision).
 *
 * Hardcoded NAICS list is intentional — 10 wide-enough buckets across the
 * customer base. Edit `PRIORITY_NAICS` to retarget.
 */

const PRIORITY_NAICS = [
    "541511", // Custom Computer Programming Services
    "541512", // Computer Systems Design Services
    "541330", // Engineering Services
    "541715", // R&D in Physical/Engineering/Life Sciences
    "561210", // Facilities Support Services
    "561720", // Janitorial Services
    "236220", // Commercial Building Construction
    "237310", // Highway, Street & Bridge Construction
    "237990", // Other Heavy & Civil Engineering Construction
    "238210", // Electrical Contractors
];

// FPDS-NG (fpds.gov/ezsearch) was retired in 2024 — redirects to sam.gov.
// We migrated to USAspending.gov which mirrors FPDS award data 1:1
// (same upstream source, better API, no Atom XML parsing). Free, no key.
const USASPENDING_BASE = "https://api.usaspending.gov/api/v2/search/spending_by_award/";
const PAGE_SIZE = 100; // USAspending hard-cap 100
const PAGES_PER_NAICS = 3; // 300 awards per NAICS, 3000 total per run
const FETCH_GAP_MS = 200;
// Look back 1 year for most recent awards — enough to discover active
// contractors. The contractors table is the long-lived sink; we don't
// need every historical award here, just enough to flag who's active.
const LOOKBACK_DAYS = 365;

interface ParsedAward {
    piid: string;
    referenced_idv: string | null;
    modification_number: string | null;
    contractor_uei: string | null;
    contractor_name: string | null;
    awarding_agency: string | null;
    naics_code: string | null;
    psc_code: string | null;
    set_aside: string | null;
    obligation_amount: number | null;
    base_and_all_options: number | null;
    signed_date: string | null;
    effective_date: string | null;
    ultimate_end_date: string | null;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function numOrNull(x: string | null): number | null {
    if (!x) return null;
    const n = parseFloat(x.replace(/[$,]/g, ""));
    return Number.isFinite(n) ? n : null;
}
function dateOrNull(x: string | null): string | null {
    if (!x) return null;
    const s = x.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

async function fetchUsaspendingAwards(naics: string, page: number): Promise<ParsedAward[]> {
    const endDate = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
    const body = {
        filters: {
            time_period: [{ start_date: startDate, end_date: endDate }],
            naics_codes: [naics],
            award_type_codes: ["A", "B", "C", "D"], // contracts only
        },
        fields: [
            "Award ID",
            "generated_internal_id",
            "Recipient Name",
            "recipient_id",
            "Award Amount",
            "Awarding Agency",
            "Awarding Sub Agency",
            "NAICS",
            "PSC",
            "Last Modified Date",
            "Start Date",
            "End Date",
            "Type of Contract Pricing",
        ],
        page,
        limit: PAGE_SIZE,
        sort: "Last Modified Date",
        order: "desc",
    };
    const res = await fetch(USASPENDING_BASE, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "User-Agent": "CapturePilot-Awards-Ingest/1.0",
            Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`USAspending ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = await res.json() as {
        results?: Array<Record<string, unknown>>;
        page_metadata?: { hasNext: boolean };
    };
    const rows = j.results || [];
    return rows.map((r) => {
        const naicsObj = (r.NAICS as { code?: string } | string | null);
        const pscObj = (r.PSC as { code?: string } | string | null);
        const naicsCode = typeof naicsObj === "string" ? naicsObj : (naicsObj?.code || null);
        const pscCode = typeof pscObj === "string" ? pscObj : (pscObj?.code || null);
        const awardId = String(r["Award ID"] || r.generated_internal_id || "");
        // USAspending doesn't expose UEI in the search response — only
        // recipient_id (their internal hash) + Recipient Name. We use the
        // recipient_id as a stand-in for upsert dedup. Real UEI gets backfilled
        // by enrich_contractors_usaspending via /recipient/<id> endpoint.
        const recipientId = String(r.recipient_id || "");
        return {
            piid: awardId,
            referenced_idv: null,
            modification_number: null,
            contractor_uei: recipientId ? recipientId.toUpperCase() : null,
            contractor_name: (r["Recipient Name"] as string) || null,
            awarding_agency: (r["Awarding Agency"] as string) || (r["Awarding Sub Agency"] as string) || null,
            naics_code: naicsCode || naics,
            psc_code: pscCode || null,
            set_aside: null, // not surfaced in this endpoint
            obligation_amount: numOrNull(String(r["Award Amount"] || "")),
            base_and_all_options: numOrNull(String(r["Award Amount"] || "")),
            signed_date: dateOrNull((r["Start Date"] as string) || null),
            effective_date: dateOrNull((r["Start Date"] as string) || null),
            ultimate_end_date: dateOrNull((r["End Date"] as string) || null),
        };
    }).filter(a => a.piid);
}

export async function GET(req: NextRequest) {
    // Fail-closed cron auth (CRON_SECRET or SUPABASE_SERVICE_KEY bearer).
    const denied = guardCron(req);
    if (denied) return denied;

    const db = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    const startTime = Date.now();
    const stats = {
        naics_processed: 0,
        awards_fetched: 0,
        awards_upserted: 0,
        new_contractors: 0,
        existing_contractors: 0,
        errors: [] as string[],
    };

    // Pre-load known UEIs so we know which ones are "new" without an extra round-trip per upsert.
    const known = new Set<string>();
    {
        const { data } = await db.from("contractors").select("uei").not("uei", "is", null);
        for (const r of (data || []) as Array<{ uei: string }>) if (r.uei) known.add(r.uei.toUpperCase());
    }

    for (const naics of PRIORITY_NAICS) {
        if (Date.now() - startTime > 270_000) break;
        const naicsAwards: ParsedAward[] = [];

        // USAspending paginates from page=1, not page=0
        for (let page = 1; page <= PAGES_PER_NAICS; page++) {
            try {
                await sleep(FETCH_GAP_MS);
                const rows = await fetchUsaspendingAwards(naics, page);
                if (rows.length === 0) break;
                naicsAwards.push(...rows);
                if (rows.length < PAGE_SIZE) break;
            } catch (e) {
                stats.errors.push(`naics=${naics} page=${page} ${e instanceof Error ? e.message : "fetch_failed"}`);
                break;
            }
        }
        stats.naics_processed++;
        stats.awards_fetched += naicsAwards.length;

        if (naicsAwards.length === 0) continue;

        // Upsert awards. Schema permitting — if the table doesn't exist or
        // the conflict target differs, we surface the error but keep going.
        // Dedupe by piid within this batch — USAspending sometimes returns
        // the same award twice across paginated pages (when a result lands
        // on a page boundary at fetch time). Otherwise the upsert errors
        // with "ON CONFLICT DO UPDATE command cannot affect row a second time".
        const deduped = Array.from(
            new Map(naicsAwards.map(a => [a.piid, a])).values()
        );
        // onConflict='piid' uses the migration-101 unique constraint.
        // The old uq_fpds_natural expression index can't be referenced
        // via the Supabase JS client (it only takes column names, not
        // coalesce() expressions).
        const { error: upsertErr } = await db
            .from("fpds_awards")
            .upsert(deduped, { onConflict: "piid", ignoreDuplicates: false });
        if (upsertErr) {
            stats.errors.push(`fpds_awards upsert naics=${naics}: ${upsertErr.message}`);
        } else {
            stats.awards_upserted += naicsAwards.length;
        }

        // Discover new contractors. Group by UEI and build a stub row per
        // unknown UEI. The next enrich_contractors_usaspending run will
        // fill in agency_relationships / naics_awards / last_award_date.
        const stubs = new Map<string, { uei: string; company_name: string; naics_codes: string[] }>();
        for (const a of naicsAwards) {
            if (!a.contractor_uei || !a.contractor_name) continue;
            if (known.has(a.contractor_uei)) {
                stats.existing_contractors++;
                continue;
            }
            const cur = stubs.get(a.contractor_uei);
            if (cur) {
                if (a.naics_code && !cur.naics_codes.includes(a.naics_code)) cur.naics_codes.push(a.naics_code);
            } else {
                stubs.set(a.contractor_uei, {
                    uei: a.contractor_uei,
                    company_name: a.contractor_name,
                    naics_codes: a.naics_code ? [a.naics_code] : [],
                });
            }
        }

        if (stubs.size > 0) {
            const newRows = [...stubs.values()].map(s => ({
                uei: s.uei,
                company_name: s.company_name,
                naics_codes: s.naics_codes,
                enrichment_source: "fpds_discovery",
                created_at: new Date().toISOString(),
            }));
            const { error: contractorErr, data: inserted } = await db
                .from("contractors")
                .upsert(newRows, { onConflict: "uei", ignoreDuplicates: true })
                .select("uei");
            if (contractorErr) {
                stats.errors.push(`contractors upsert naics=${naics}: ${contractorErr.message}`);
            } else {
                stats.new_contractors += inserted?.length || 0;
                for (const r of inserted || []) known.add(r.uei.toUpperCase());
            }
        }
    }

    return NextResponse.json({
        success: true,
        ...stats,
        elapsed_ms: Date.now() - startTime,
    });
}
