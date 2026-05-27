#!/usr/bin/env node
/**
 * Backfill `jurisdiction_level` on SLED opportunities (state / county / city /
 * district) using a domain-based heuristic on opportunities.link. Run on the
 * Mac (or any box with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_KEY env).
 *
 *   node tools/34_backfill_sled_jurisdiction.mjs            # dry-run preview
 *   node tools/34_backfill_sled_jurisdiction.mjs --apply    # actually write
 *
 * Audit 2026-05-27: 2,197 of 2,885 active SLED opps had NULL jurisdiction_level.
 * After this script those should drop to a small residue (rows on
 * multi-jurisdiction platforms like BidNet/DemandStar where the URL alone
 * doesn't disambiguate). The marketing counters (PublicStatsBar) will
 * accurately reflect state/county/city splits.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// --- env bootstrap (no dotenv dep) -----------------------------------------
function loadEnvLocal() {
    try {
        const txt = readFileSync(new URL("../dashboard/.env.local", import.meta.url), "utf8");
        for (const line of txt.split("\n")) {
            const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
            if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
        }
    } catch { /* ignore — env vars may be set externally */ }
}
loadEnvLocal();

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SB_URL || !SB_KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY");
    process.exit(1);
}
const APPLY = process.argv.includes("--apply");
const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

// --- heuristic --------------------------------------------------------------
// Returns "state" | "county" | "city" | "district" | null (unknown).
// We err on the side of NULL when ambiguous; better to undercount than mistag.
function classify(link) {
    if (!link) return null;
    let host;
    try {
        host = new URL(link).hostname.toLowerCase();
    } catch { return null; }

    // ─── State-level: official .gov state portals + known state procurement domains ───
    if (/\.([a-z]{2})\.gov($|\/)/.test(host)) return "state";              // *.ny.gov, *.ca.gov, etc
    if (/\.state\.[a-z]{2}\.us/.test(host)) return "state";                 // ssl.doas.state.ga.us pattern
    const STATE_HOSTS = [
        "caleprocure.ca.gov", "emma.maryland.gov", "scbo.sc.gov",
        "evp.nc.gov", "portal.ct.gov", "www.txsmartbuy.gov",
        "www.commbuys.com",                                  // MA state CommBuys
        "www.vermontbusinessregistry.com",                   // VT state
        "apps.sceis.sc.gov",                                 // SC state
        "www.nyscr.ny.gov",                                  // NY state contract reporter
    ];
    if (STATE_HOSTS.includes(host)) return "state";

    // ─── Bonfire tenant heuristic — subdomain reveals the entity type ───
    // We curate a mapping based on what we know about each Bonfire tenant.
    // Unknown tenants stay NULL rather than getting guessed.
    if (host.endsWith(".bonfirehub.com")) {
        const slug = host.split(".")[0];
        const BONFIRE = {
            // city
            detroit: "city", amarillo: "city", "littlerock": "city",
            bendoregon: "city", scottsdaleaz: "city", siouxfalls: "city",
            wichita: "city", greshamoregon: "city", columbus: "city",
            // county
            broward: "county", fortbendcountytx: "county", charlestoncounty: "county",
            // state
            utah: "state",
            // district (school, transit, etc)
            metra: "district", manorisd: "district", desotoisd: "district",
            joliet: "district", bcsdk12: "district", ccsdnm: "district",
            fsd1: "district", dallasisd: "district",
            // educational institution → district bucket
            dia: "district", fau: "district",
            // hosted/managed multi-jurisdiction (omniapartners is a coop) → NULL
        };
        return BONFIRE[slug] || null;
    }

    // ─── OpenGov — slug pattern in host ───
    if (host.endsWith(".opengov.com") || host === "procurement.opengov.com") {
        // OpenGov tenants are mostly city + county; without per-tenant data
        // we leave NULL. A future enhancement could parse the URL path slug.
        return null;
    }

    // ─── Generic SLED — pattern matches in the URL ───
    const lower = host.toLowerCase();
    if (/cityof[a-z]+\.|^city\.|\.city\.|city-of-/.test(lower)) return "city";
    if (/county|countyof|counties/.test(lower)) return "county";
    if (/isd\.|schools?\.|\.k12\./.test(lower)) return "district";

    // Multi-jurisdiction platforms — can't classify from URL alone
    // (BidNet, DemandStar, PublicPurchase, BidExpress, QuestCDN, etc)
    return null;
}

// --- main -------------------------------------------------------------------
async function main() {
    console.log(APPLY ? "═══ APPLY MODE ═══" : "═══ DRY-RUN (use --apply to write) ═══");

    // Fetch all SLED rows without jurisdiction_level.
    let allRows = [];
    let offset = 0;
    const BATCH = 1000;
    while (true) {
        const { data, error } = await sb
            .from("opportunities")
            .select("id, link")
            .eq("source", "sled")
            .is("jurisdiction_level", null)
            .eq("is_archived", false)
            .order("id", { ascending: true })
            .range(offset, offset + BATCH - 1);
        if (error) { console.error("fetch err:", error); process.exit(1); }
        if (!data || data.length === 0) break;
        allRows.push(...data);
        if (data.length < BATCH) break;
        offset += BATCH;
    }
    console.log(`Eligible SLED rows: ${allRows.length}`);

    // Classify
    const buckets = { state: [], county: [], city: [], district: [], unknown: [] };
    for (const r of allRows) {
        const k = classify(r.link);
        if (k) buckets[k].push(r.id);
        else buckets.unknown.push(r.id);
    }

    console.log("\nProposed tagging:");
    for (const [k, v] of Object.entries(buckets)) {
        console.log(`  ${k.padEnd(10)} ${v.length.toString().padStart(6)}`);
    }
    const willUpdate = buckets.state.length + buckets.county.length
        + buckets.city.length + buckets.district.length;
    console.log(`  ────────────────`);
    console.log(`  total update    ${willUpdate}`);
    console.log(`  leave NULL      ${buckets.unknown.length}`);

    if (!APPLY) {
        console.log("\nDry run — no writes. Re-run with --apply to commit.");
        return;
    }

    // Apply — one PATCH per level (IDs in chunks of 100 to keep URLs short)
    for (const level of ["state", "county", "city", "district"]) {
        const ids = buckets[level];
        for (let i = 0; i < ids.length; i += 100) {
            const chunk = ids.slice(i, i + 100);
            const { error } = await sb
                .from("opportunities")
                .update({ jurisdiction_level: level })
                .in("id", chunk);
            if (error) {
                console.error(`  UPDATE ${level} chunk ${i} err:`, error.message);
            } else {
                process.stdout.write(".");
            }
        }
        console.log(` ${level} done (${ids.length})`);
    }

    console.log(`\nApplied — ${willUpdate} rows tagged, ${buckets.unknown.length} left NULL.`);
}

main().catch((e) => { console.error("fatal:", e); process.exit(1); });
