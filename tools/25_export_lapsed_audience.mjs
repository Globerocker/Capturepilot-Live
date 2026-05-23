#!/usr/bin/env node
/**
 * Export the "lapsed-award" re-engagement audience as a CSV.
 *
 * Defines audience as: federal_awards_count > 0 AND last_award_date older
 * than the configured cutoff. Sorts emails-first so the rows we can
 * actually mail to are at the top.
 *
 *   node tools/25_export_lapsed_audience.mjs                # 12 months silent
 *   node tools/25_export_lapsed_audience.mjs --months 6     # 6 months silent
 *   node tools/25_export_lapsed_audience.mjs --out path.csv
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_KEY in .env.local
 * (already loaded by Next on the server; we re-read it here for the CLI).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

// Lightweight .env.local loader — picks the one at project root, follows
// the dashboard symlink if needed.
function loadEnv() {
    const envPath = path.join(projectRoot, ".env.local");
    if (!fs.existsSync(envPath)) {
        console.error(`No .env.local at ${envPath}`);
        process.exit(1);
    }
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
        if (!m) continue;
        if (m[1].startsWith("#")) continue;
        if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
}

function parseArgs() {
    const args = { months: 12, out: null };
    for (let i = 2; i < process.argv.length; i++) {
        const a = process.argv[i];
        if (a === "--months") args.months = parseInt(process.argv[++i], 10);
        else if (a === "--out") args.out = process.argv[++i];
    }
    return args;
}

function csvEscape(v) {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

function rowsToCsv(rows, columns) {
    const header = columns.join(",");
    const body = rows.map(r => columns.map(c => csvEscape(r[c])).join(",")).join("\n");
    return header + "\n" + body + "\n";
}

(async () => {
    loadEnv();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) {
        console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY");
        process.exit(1);
    }

    const args = parseArgs();
    const cutoff = new Date(Date.now() - args.months * 30 * 86400_000).toISOString();
    const outPath = args.out || path.join(projectRoot, `lapsed-audience-${args.months}mo.csv`);

    const sb = createClient(url, key, { auth: { persistSession: false } });

    // Page through the audience to avoid the 1000-row default limit.
    const pageSize = 1000;
    let from = 0;
    let all = [];
    for (;;) {
        const { data, error } = await sb
            .from("contractors")
            .select("company_name, state, city, website, business_url, federal_awards_count, last_award_date, primary_poc_name, primary_poc_title, primary_poc_email, primary_poc_phone, direct_phone, owner_linkedin, company_linkedin, agency_relationships, naics_awards, total_award_volume, uei, enrichment_source")
            .gt("federal_awards_count", 0)
            .lt("last_award_date", cutoff)
            .order("primary_poc_email", { ascending: true, nullsFirst: false })  // emails first
            .order("total_award_volume", { ascending: false, nullsFirst: false })
            .range(from, from + pageSize - 1);

        if (error) { console.error(error); process.exit(1); }
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < pageSize) break;
        from += pageSize;
    }

    const monthsAgo = (d) => {
        if (!d) return "";
        const ms = Date.now() - new Date(d).getTime();
        return Math.round(ms / (30 * 86400_000));
    };

    const flat = all.map(r => ({
        company_name:           r.company_name || "",
        state:                  r.state || "",
        city:                   r.city || "",
        website:                r.website || r.business_url || "",
        federal_awards_count:   r.federal_awards_count ?? "",
        last_award_date:        r.last_award_date ? r.last_award_date.split("T")[0] : "",
        months_silent:          monthsAgo(r.last_award_date),
        ceo_or_poc_name:        r.primary_poc_name || "",
        ceo_or_poc_title:       r.primary_poc_title || "",
        email:                  r.primary_poc_email || "",
        phone:                  r.primary_poc_phone || r.direct_phone || "",
        linkedin_person:        r.owner_linkedin || "",
        linkedin_company:       r.company_linkedin || "",
        top_agency:             (Array.isArray(r.agency_relationships) && r.agency_relationships[0]?.name) || "",
        top_agency_award_usd:   (Array.isArray(r.agency_relationships) && r.agency_relationships[0]?.amount) || "",
        all_agencies:           Array.isArray(r.agency_relationships) ? r.agency_relationships.map(a => a.name).join(" | ") : "",
        top_naics_code:         (Array.isArray(r.naics_awards) && r.naics_awards[0]?.code) || "",
        top_naics_desc:         (Array.isArray(r.naics_awards) && r.naics_awards[0]?.description) || "",
        total_award_volume_usd: r.total_award_volume ?? "",
        uei:                    r.uei || "",
        enrichment_source:      r.enrichment_source || "",
    }));

    const columns = [
        "company_name", "state", "city", "website",
        "ceo_or_poc_name", "ceo_or_poc_title", "email", "phone",
        "linkedin_person", "linkedin_company",
        "federal_awards_count", "last_award_date", "months_silent",
        "top_agency", "top_agency_award_usd", "all_agencies",
        "top_naics_code", "top_naics_desc", "total_award_volume_usd",
        "uei", "enrichment_source",
    ];

    fs.writeFileSync(outPath, rowsToCsv(flat, columns));

    const withEmail = flat.filter(r => r.email).length;
    const withName  = flat.filter(r => r.ceo_or_poc_name).length;
    console.log(`✓ Wrote ${flat.length} rows to ${outPath}`);
    console.log(`  with email: ${withEmail}`);
    console.log(`  with POC name: ${withName}`);
    console.log(`  silent months threshold: ${args.months}`);
})();
