#!/usr/bin/env node
// Ingest SBA-certified tribal / 8(a) / HUBZone contractor directory into
// the tribal_contractors table so the Partners page can surface curated
// teaming candidates alongside the live SAM.gov search.
//
// The source CSV ships from the marketing team at tools/data/tribal-list.csv
// and is gitignored (*.csv). Each row has an Excel HYPERLINK(...) formula
// as its first column encoding both the SBA profile URL and the business
// name — we parse the UEI + CAGE out of the URL so rows can be upserted
// by UEI without touching the SBA Certify API.
//
// Usage:
//   node tools/24_ingest_tribal_contractors.mjs
//   node tools/24_ingest_tribal_contractors.mjs --csv path/to/file.csv
//   node tools/24_ingest_tribal_contractors.mjs --dry-run           # parse only, no writes
//
// Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const URL_ENV = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY_ENV = process.env.SUPABASE_SERVICE_KEY;

function arg(flag, fallback) {
    const i = process.argv.indexOf(flag);
    if (i === -1) return fallback;
    const v = process.argv[i + 1];
    if (!v || v.startsWith("--")) return true;
    return v;
}

const CSV_PATH  = resolve(arg("--csv", "tools/data/tribal-list.csv"));
const DRY_RUN   = arg("--dry-run", false) === true;
const BATCH     = 100;
const SOURCE_ID = "govcon_giants_tribal_list_20260417";

if (!DRY_RUN && (!URL_ENV || !KEY_ENV)) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY (or pass --dry-run).");
    process.exit(1);
}

const db = DRY_RUN ? null : createClient(URL_ENV, KEY_ENV, { auth: { persistSession: false } });

// ------------------------------------------------------------
// CSV parser — handles quoted fields, embedded commas, doubled quotes,
// and newlines inside quoted cells (capability narratives often span
// multiple lines, so a naive split would be wrong).
// ------------------------------------------------------------
function parseCsv(text) {
    const rows = [];
    let field = "";
    let row = [];
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
            else if (c === '"') { inQuotes = false; }
            else { field += c; }
        } else {
            if (c === '"') { inQuotes = true; }
            else if (c === ",") { row.push(field); field = ""; }
            else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
            else if (c === "\r") { /* skip */ }
            else { field += c; }
        }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows;
}

// =HYPERLINK( "https://search.certifications.sba.gov/profile/UEI/CAGE", "BIZ NAME" )
function parseHyperlink(cell) {
    if (!cell) return { url: null, label: null, uei: null, cage: null };
    const m = cell.match(/HYPERLINK\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/i);
    if (!m) return { url: null, label: cell.trim() || null, uei: null, cage: null };
    const url = m[1];
    const label = m[2];
    const idMatch = url.match(/\/profile\/([^\/]+)\/([^\/?#]+)/);
    return {
        url,
        label,
        uei:  idMatch ? idMatch[1] : null,
        cage: idMatch ? idMatch[2] : null,
    };
}

function splitList(cell) {
    if (!cell) return [];
    return cell.split(",").map(s => s.trim()).filter(Boolean);
}

const HIDDEN_SENTINEL = "the business owner has hidden this information";
function cleanCell(cell) {
    if (!cell) return null;
    const trimmed = cell.trim();
    if (!trimmed) return null;
    if (trimmed.toLowerCase().includes(HIDDEN_SENTINEL)) return null;
    return trimmed;
}

// ------------------------------------------------------------
// Run
// ------------------------------------------------------------
const raw = readFileSync(CSV_PATH, "utf8");
// Drop the leading licensing comment lines that the distributor prepends.
const body = raw.split("\n").filter(line => !line.startsWith("#")).join("\n");
const rows = parseCsv(body);
if (!rows.length) { console.error("Empty CSV."); process.exit(1); }

const header = rows[0].map(h => h.trim());
const idx = (name) => header.findIndex(h => h.toLowerCase() === name.toLowerCase());

const COL = {
    biz:        idx("Business name"),
    narrative:  idx("Capabilities narrative"),
    capsLink:   idx("Capabilities statement link"),
    certs:      idx("Active SBA certifications"),
    contact:    idx("Contact person's name"),
    email:      idx("Contact person's email"),
    addr1:      idx("Address line 1"),
    addr2:      idx("Address line 2"),
    city:       idx("City"),
    state:      idx("State"),
    zipcode:    idx("Zipcode"),
    primary:    idx("Primary NAICS code"),
    allNaics:   idx("All NAICS codes"),
    smallNaics: idx("\u201cSmall\u201d NAICS codes"),
};
if (COL.biz < 0) {
    // Some exports use straight quotes around "Small".
    COL.smallNaics = header.findIndex(h => /small.*naics/i.test(h));
}

const seen = new Set();
const records = [];
for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (!cells || cells.length < 3) continue;
    const hy = parseHyperlink(cells[COL.biz]);
    if (!hy.uei) continue;              // skip rows without a UEI anchor
    if (seen.has(hy.uei)) continue;     // de-dupe — the list repeats some firms for multi-certs
    seen.add(hy.uei);

    const rec = {
        uei:                         hy.uei,
        cage_code:                   hy.cage,
        business_name:               hy.label,
        primary_naics_code:          cleanCell(cells[COL.primary]),
        all_naics_codes:             splitList(cleanCell(cells[COL.allNaics]) || ""),
        small_naics_codes:           splitList(cleanCell(cells[COL.smallNaics]) || ""),
        certifications:              splitList(cleanCell(cells[COL.certs]) || ""),
        contact_name:                cleanCell(cells[COL.contact]),
        contact_email:               cleanCell(cells[COL.email]),
        address_line_1:              cleanCell(cells[COL.addr1]),
        address_line_2:              cleanCell(cells[COL.addr2]),
        city:                        cleanCell(cells[COL.city]),
        state:                       cleanCell(cells[COL.state]),
        zipcode:                     cleanCell(cells[COL.zipcode]),
        capabilities_narrative:      cleanCell(cells[COL.narrative]),
        capabilities_statement_url:  cleanCell(cells[COL.capsLink]),
        sba_profile_url:             hy.url,
        source:                      SOURCE_ID,
    };
    records.push(rec);
}

console.log(`Parsed ${records.length} unique contractors from ${CSV_PATH}`);

// Quick sanity breakdown so the operator can eyeball the ingest.
const byCert = {};
for (const r of records) for (const c of r.certifications) byCert[c] = (byCert[c] || 0) + 1;
console.log("Certifications:", byCert);
const withEmail = records.filter(r => r.contact_email).length;
console.log(`Rows with usable contact email: ${withEmail} / ${records.length}`);

if (DRY_RUN) {
    console.log("Dry run — no writes performed.");
    console.log("Sample record:", records[0]);
    process.exit(0);
}

let written = 0;
for (let i = 0; i < records.length; i += BATCH) {
    const chunk = records.slice(i, i + BATCH);
    const { error } = await db
        .from("tribal_contractors")
        .upsert(chunk, { onConflict: "uei" });
    if (error) {
        console.error(`Batch ${i}-${i + chunk.length} failed:`, error.message);
        process.exit(1);
    }
    written += chunk.length;
    process.stdout.write(`\rUpserted ${written}/${records.length}`);
}
process.stdout.write("\n");
console.log("Done.");
