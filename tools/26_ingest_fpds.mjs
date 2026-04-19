#!/usr/bin/env node
// ────────────────────────────────────────────────────────────────────
// FPDS.gov bulk award ingestion.
//
// FPDS exposes its entire database as an Atom feed:
//   https://www.fpds.gov/ezsearch/fpdsportal?s=FPDS&templateName=1.5.3&indexName=awardfull&q=...
//
// We paginate through awards + modifications for a list of contractor UEIs
// (or by NAICS/agency) and upsert into fpds_awards. Pages are 10 records
// each; FPDS caps offsets around 10,000 so for very broad queries we have
// to split by year.
//
// Usage:
//   node tools/26_ingest_fpds.mjs --uei ABC123DEF456
//   node tools/26_ingest_fpds.mjs --uei-list tools/data/ueis.txt
//   node tools/26_ingest_fpds.mjs --naics 541511 --years 2023,2024,2025
//   node tools/26_ingest_fpds.mjs --from-contractors --limit 100   # pull top 100 UEIs from our contractors table
//
// Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY
// ────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function arg(flag, fallback = null) {
    const i = process.argv.indexOf(flag);
    if (i === -1) return fallback;
    const v = process.argv[i + 1];
    if (!v || v.startsWith("--")) return true;
    return v;
}

const UEI_SINGLE = arg("--uei");
const UEI_LIST = arg("--uei-list");
const NAICS = arg("--naics");
const YEARS = (arg("--years") || "").toString().split(",").filter(Boolean);
const FROM_CONTRACTORS = arg("--from-contractors", false) === true;
const LIMIT = parseInt(arg("--limit", "500"), 10);
const DRY_RUN = arg("--dry-run", false) === true;

const URL_ENV = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY_ENV = process.env.SUPABASE_SERVICE_KEY;

if (!DRY_RUN && (!URL_ENV || !KEY_ENV)) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY.");
    process.exit(1);
}

const db = DRY_RUN ? null : createClient(URL_ENV, KEY_ENV, { auth: { persistSession: false } });

const FPDS_BASE = "https://www.fpds.gov/ezsearch/fpdsportal";

async function fetchFpdsPage(query, start = 0) {
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
    });
    if (!res.ok) throw new Error(`FPDS ${res.status}: ${await res.text().catch(() => "")}`);
    return await res.text();
}

// ─── Atom XML → record objects ───────────────────────────────
// FPDS embeds the full award record inside <content><ns1:award> ... </ns1:award></content>
// We extract each <entry>, then pick text values by tag name.
function parseAtom(xml) {
    const entries = [];
    const entryRe = /<entry[\s>][\s\S]*?<\/entry>/g;
    const matches = xml.match(entryRe) || [];

    for (const entry of matches) {
        const pick = (tag) => {
            const re = new RegExp(`<[^:<]*:?${tag}[^>]*>([\\s\\S]*?)<\\/[^:<]*:?${tag}>`, "i");
            const m = entry.match(re);
            return m ? m[1].replace(/<[^>]+>/g, "").trim() : null;
        };

        const piid = pick("PIID") || pick("contractID");
        const uei = pick("ueiSAM") || pick("UEI");
        if (!piid) continue;

        entries.push({
            piid,
            referenced_idv: pick("referencedIDVID") || pick("referencedIDVAgencyID") || null,
            modification_number: pick("modNumber") || null,
            contractor_uei: uei ? uei.toUpperCase() : null,
            contractor_name: pick("vendorName") || pick("legalBusinessName"),
            awarding_agency: pick("contractingOfficeAgencyID") || pick("agencyID") || pick("departmentFullName"),
            awarding_sub_agency: pick("contractingOfficeID") || null,
            naics_code: pick("principalNAICSCode"),
            psc_code: pick("productOrServiceCode"),
            set_aside: pick("typeOfSetAside") || pick("typeOfSetAsideDescription"),
            obligation_amount: numOrNull(pick("obligatedAmount") || pick("dollarsObligated")),
            base_and_exercised: numOrNull(pick("baseAndExercisedOptionsValue")),
            base_and_all_options: numOrNull(pick("baseAndAllOptionsValue")),
            signed_date: dateOrNull(pick("signedDate")),
            effective_date: dateOrNull(pick("effectiveDate")),
            current_end_date: dateOrNull(pick("currentCompletionDate")),
            ultimate_end_date: dateOrNull(pick("ultimateCompletionDate")),
            contract_action_type: pick("contractActionType"),
            idv_type: pick("typeOfIDC"),
            contract_type: pick("typeOfContract"),
            type_of_contract_pricing: pick("typeOfContractPricing"),
            extent_competed: pick("extentCompeted"),
            solicitation_procedures: pick("solicitationProcedures"),
            number_of_offers_received: intOrNull(pick("numberOfOffersReceived")),
        });
    }
    return entries;
}

function numOrNull(x) {
    if (x == null) return null;
    const n = parseFloat(String(x).replace(/[$,]/g, ""));
    return isFinite(n) ? n : null;
}
function intOrNull(x) {
    if (x == null) return null;
    const n = parseInt(String(x), 10);
    return isFinite(n) ? n : null;
}
function dateOrNull(x) {
    if (!x) return null;
    const s = String(x).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

async function queryUei(uei) {
    let total = 0;
    const queries = YEARS.length
        ? YEARS.map((y) => `UEI:"${uei}" SIGNED_DATE:[${y}/01/01,${y}/12/31]`)
        : [`UEI:"${uei}"`];

    for (const query of queries) {
        for (let start = 0; start < 10_000 && total < LIMIT; start += 10) {
            const xml = await fetchFpdsPage(query, start);
            const rows = parseAtom(xml);
            if (rows.length === 0) break;

            if (db) {
                const { error } = await db
                    .from("fpds_awards")
                    .upsert(rows, {
                        onConflict: "piid,referenced_idv,modification_number",
                        ignoreDuplicates: false,
                    });
                if (error) {
                    console.error(`  upsert error @ offset ${start}:`, error.message);
                }
            } else {
                console.log(`  [dry] would upsert ${rows.length} rows (sample):`);
                console.log("  ", JSON.stringify(rows[0], null, 2));
            }
            total += rows.length;
            if (rows.length < 10) break;
        }
    }
    return total;
}

async function main() {
    let ueis = [];

    if (UEI_SINGLE && UEI_SINGLE !== true) {
        ueis.push(String(UEI_SINGLE).toUpperCase());
    }
    if (UEI_LIST && UEI_LIST !== true) {
        const text = readFileSync(String(UEI_LIST), "utf8");
        ueis.push(...text.split(/\s+/).map((s) => s.trim().toUpperCase()).filter(Boolean));
    }
    if (FROM_CONTRACTORS && db) {
        const { data } = await db
            .from("contractors")
            .select("uei")
            .not("uei", "is", null)
            .order("usaspending_total_awards", { ascending: false, nullsFirst: false })
            .limit(LIMIT);
        ueis.push(...(data || []).map((r) => r.uei).filter(Boolean));
    }
    if (NAICS && NAICS !== true) {
        // broad NAICS sweep: query without UEI, just NAICS + years
        const q = `PRINCIPAL_NAICS_CODE:"${NAICS}"`;
        console.log(`Querying FPDS for NAICS ${NAICS} ...`);
        let total = 0;
        for (let start = 0; start < 10_000 && total < LIMIT; start += 10) {
            const xml = await fetchFpdsPage(q, start);
            const rows = parseAtom(xml);
            if (rows.length === 0) break;
            if (db) {
                await db.from("fpds_awards").upsert(rows, {
                    onConflict: "piid,referenced_idv,modification_number",
                });
            }
            total += rows.length;
        }
        console.log(`  done — ${total} rows for NAICS ${NAICS}`);
        return;
    }

    ueis = Array.from(new Set(ueis)).filter((u) => u && u.length >= 8);
    if (ueis.length === 0) {
        console.error("No UEIs to query. Pass --uei, --uei-list, --from-contractors, or --naics.");
        process.exit(1);
    }

    console.log(`Querying FPDS for ${ueis.length} UEI(s)...`);
    let totalInserted = 0;
    for (let i = 0; i < ueis.length; i++) {
        const uei = ueis[i];
        try {
            const n = await queryUei(uei);
            totalInserted += n;
            console.log(`  [${i + 1}/${ueis.length}] ${uei} → ${n} rows`);
        } catch (e) {
            console.error(`  [${i + 1}/${ueis.length}] ${uei} FAILED:`, e.message);
        }
        // Gentle pacing — FPDS throttles at ~20 req/s
        await new Promise((r) => setTimeout(r, 150));
    }
    console.log(`\nDone. Upserted ${totalInserted} rows across ${ueis.length} UEIs.`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
