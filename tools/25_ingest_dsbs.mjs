#!/usr/bin/env node
// ────────────────────────────────────────────────────────────────────
// SBA Dynamic Small Business Search (DSBS) bulk ingestion.
//
// DSBS is the canonical directory of SBA-certified small businesses —
// 8(a), HUBZone, WOSB, EDWOSB, SDVOSB, VOSB, SDB. ~300K rows. Monthly CSV
// published on data.gov:
//   https://catalog.data.gov/dataset/dynamic-small-business-search-dsbs
//
// We upsert into the tribal_contractors table (renamed-in-spirit in
// migration 044 which added `source`, `capability_narrative`, PoC, etc.).
//
// USAGE:
//   node tools/25_ingest_dsbs.mjs --csv tools/data/dsbs.csv
//   node tools/25_ingest_dsbs.mjs --csv tools/data/dsbs.csv --dry-run
//   node tools/25_ingest_dsbs.mjs --csv tools/data/dsbs.csv --limit 1000
//
// Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY
//
// Download the CSV first:
//   curl -L "https://dsbs.sba.gov/dsbs-export-url-here.csv" -o tools/data/dsbs.csv
// ────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function arg(flag, fallback) {
    const i = process.argv.indexOf(flag);
    if (i === -1) return fallback;
    const v = process.argv[i + 1];
    if (!v || v.startsWith("--")) return true;
    return v;
}

const CSV_PATH = resolve(arg("--csv", "tools/data/dsbs.csv"));
const DRY_RUN = arg("--dry-run", false) === true;
const LIMIT = parseInt(arg("--limit", "0"), 10) || 0;
const BATCH = 200;

const URL_ENV = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY_ENV = process.env.SUPABASE_SERVICE_KEY;

if (!DRY_RUN && (!URL_ENV || !KEY_ENV)) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY. Use --dry-run to preview.");
    process.exit(1);
}

const db = DRY_RUN ? null : createClient(URL_ENV, KEY_ENV, { auth: { persistSession: false } });

// ─── CSV parser (same as 24_ingest_tribal_contractors.mjs) ────────
function parseCsv(text) {
    const rows = [];
    let field = "";
    let row = [];
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
            else if (c === '"') inQuotes = false;
            else field += c;
        } else {
            if (c === '"') inQuotes = true;
            else if (c === ",") { row.push(field); field = ""; }
            else if (c === "\n") { row.push(field); rows.push(row); field = ""; row = []; }
            else if (c === "\r") { /* skip */ }
            else field += c;
        }
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    return rows;
}

// Map DSBS CSV columns → tribal_contractors fields
// DSBS columns vary over time, so we look up by header name rather than index.
function mapRow(headers, row) {
    const h = Object.fromEntries(headers.map((name, idx) => [name.trim().toLowerCase(), idx]));

    const get = (key) => {
        const idx = h[key];
        return idx != null ? (row[idx] || "").trim() : "";
    };

    const uei = get("uei") || get("ueisam") || get("sam uei");
    if (!uei || uei.length < 6) return null;

    const certifications = [];
    const addCert = (text) => {
        const t = (text || "").toLowerCase();
        if (t.includes("8(a)") || t.includes("8a")) certifications.push("8(a)");
        if (t.includes("hubzone")) certifications.push("HUBZone");
        if (t.includes("service-disabled") || t.includes("sdvosb")) certifications.push("SDVOSB");
        if (t.includes("women") && !t.includes("economically")) certifications.push("WOSB");
        if (t.includes("economically disadvantaged women") || t.includes("edwosb")) certifications.push("EDWOSB");
        if (t.includes("veteran") && !t.includes("service-disabled")) certifications.push("VOSB");
        if (t.includes("small disadvantaged") || t.includes("sdb")) certifications.push("SDB");
    };
    // DSBS has multiple cert-ish columns; coalesce them all
    ["sba certifications", "certifications", "programs", "business types"].forEach((col) => addCert(get(col)));

    const naicsRaw = get("naics codes") || get("naics") || "";
    const naicsCodes = naicsRaw
        .split(/[,;|\s]+/)
        .map((c) => c.trim())
        .filter((c) => /^\d{4,6}$/.test(c));

    const keywords = (get("capability keywords") || get("keywords") || "")
        .split(/[,;|]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 50);

    const isVeteran = certifications.includes("SDVOSB") || certifications.includes("VOSB");

    return {
        uei: uei.toUpperCase(),
        cage_code: get("cage code") || get("cage") || null,
        legal_business_name: get("legal business name") || get("business name") || get("name") || "Unknown",
        dba_name: get("dba name") || null,
        city: get("city") || null,
        state: get("state") || null,
        zip: get("zip") || get("zip code") || null,
        website: get("website") || get("url") || null,
        phone: get("phone") || get("phone number") || null,
        certifications: Array.from(new Set(certifications)),
        naics_codes: Array.from(new Set(naicsCodes)),
        capability_narrative: (get("capabilities narrative") || get("capability narrative") || "").slice(0, 5000) || null,
        capability_keywords: keywords,
        poc_name: get("contact first name") ? `${get("contact first name")} ${get("contact last name")}`.trim() : null,
        poc_email: get("contact email") || get("email") || null,
        poc_phone: get("contact phone") || null,
        year_established: parseInt(get("year established") || "0", 10) || null,
        employee_count: parseInt(get("employee count") || "0", 10) || null,
        annual_revenue: parseFloat((get("annual revenue") || "").replace(/[$,]/g, "")) || null,
        is_veteran_owned: isVeteran,
        source: "dsbs",
    };
}

async function main() {
    const text = readFileSync(CSV_PATH, "utf8");
    const [headers, ...rows] = parseCsv(text);
    if (!headers) {
        console.error("Empty CSV.");
        process.exit(1);
    }
    console.log(`Read ${rows.length} rows from ${CSV_PATH}`);

    const mapped = [];
    for (let i = 0; i < rows.length; i++) {
        if (LIMIT && mapped.length >= LIMIT) break;
        const m = mapRow(headers, rows[i]);
        if (m) mapped.push(m);
    }
    console.log(`Parsed ${mapped.length} DSBS firms (${mapped.filter((m) => m.is_veteran_owned).length} veteran-owned)`);

    if (DRY_RUN) {
        console.log("DRY RUN — sample row:");
        console.log(JSON.stringify(mapped[0], null, 2));
        return;
    }

    let inserted = 0;
    for (let i = 0; i < mapped.length; i += BATCH) {
        const chunk = mapped.slice(i, i + BATCH);
        const { error } = await db.from("tribal_contractors").upsert(chunk, { onConflict: "uei" });
        if (error) {
            console.error(`Batch ${i}/${mapped.length} failed:`, error.message);
        } else {
            inserted += chunk.length;
            if (i % (BATCH * 10) === 0) console.log(`  … ${inserted}/${mapped.length}`);
        }
    }
    console.log(`Done. Upserted ${inserted} rows.`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
