import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

const FPDS_BASE = "https://www.fpds.gov/ezsearch/fpdsportal";
const PAGE_SIZE = 10; // FPDS hard-cap
const PAGES_PER_NAICS = 5; // 50 awards per NAICS, 500 total per run
const FETCH_GAP_MS = 250;

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

function parseAtom(xml: string): ParsedAward[] {
    const out: ParsedAward[] = [];
    const entries = xml.match(/<entry[\s>][\s\S]*?<\/entry>/g) || [];
    for (const entry of entries) {
        const pick = (tag: string): string | null => {
            const re = new RegExp(`<[^:<]*:?${tag}[^>]*>([\\s\\S]*?)<\\/[^:<]*:?${tag}>`, "i");
            const m = entry.match(re);
            return m ? m[1].replace(/<[^>]+>/g, "").trim() : null;
        };
        const piid = pick("PIID") || pick("contractID");
        if (!piid) continue;
        const uei = pick("ueiSAM") || pick("UEI");
        out.push({
            piid,
            referenced_idv: pick("referencedIDVID") || pick("referencedIDVAgencyID") || null,
            modification_number: pick("modNumber") || null,
            contractor_uei: uei ? uei.toUpperCase() : null,
            contractor_name: pick("vendorName") || pick("legalBusinessName") || null,
            awarding_agency: pick("contractingOfficeAgencyID") || pick("agencyID") || pick("departmentFullName") || null,
            naics_code: pick("principalNAICSCode") || null,
            psc_code: pick("productOrServiceCode") || null,
            set_aside: pick("typeOfSetAside") || pick("typeOfSetAsideDescription") || null,
            obligation_amount: numOrNull(pick("obligatedAmount") || pick("dollarsObligated")),
            base_and_all_options: numOrNull(pick("baseAndAllOptionsValue")),
            signed_date: dateOrNull(pick("signedDate")),
            effective_date: dateOrNull(pick("effectiveDate")),
            ultimate_end_date: dateOrNull(pick("ultimateCompletionDate")),
        });
    }
    return out;
}

async function fetchFpdsPage(query: string, start: number): Promise<string> {
    const params = new URLSearchParams({
        s: "FPDS",
        templateName: "1.5.3",
        indexName: "awardfull",
        q: query,
        rss: "1",
        start: String(start),
    });
    const res = await fetch(`${FPDS_BASE}?${params}`, {
        headers: {
            "User-Agent": "CapturePilot-FPDS-Ingest/1.0",
            Accept: "application/atom+xml",
        },
        signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`FPDS ${res.status}`);
    return await res.text();
}

export async function GET(req: NextRequest) {
    // Dual auth — Vercel cron OR pg_cron backstop (service-key bearer)
    const auth = req.headers.get("authorization");
    const expectedCron = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
    const expectedSvc = process.env.SUPABASE_SERVICE_KEY ? `Bearer ${process.env.SUPABASE_SERVICE_KEY}` : null;
    if ((expectedCron || expectedSvc) && auth !== expectedCron && auth !== expectedSvc) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
        const query = `PRINCIPAL_NAICS_CODE:"${naics}"`;
        const naicsAwards: ParsedAward[] = [];

        for (let page = 0; page < PAGES_PER_NAICS; page++) {
            const start = page * PAGE_SIZE;
            try {
                await sleep(FETCH_GAP_MS);
                const xml = await fetchFpdsPage(query, start);
                const rows = parseAtom(xml);
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
        const { error: upsertErr } = await db
            .from("fpds_awards")
            .upsert(naicsAwards, { onConflict: "piid,referenced_idv,modification_number", ignoreDuplicates: false });
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
