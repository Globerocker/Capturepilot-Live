#!/usr/bin/env node
/**
 * Snapshot the editable outreach content (templates, campaigns, steps, lists)
 * to a timestamped JSON file under docs/backups/. Run this BEFORE any rewrite
 * or split-test of the outreach copy so a bad edit is always one restore away.
 *
 * The template + campaign-step bodies live ONLY in Supabase — there is no
 * git-tracked seed for them — so this dump is the single source of truth for
 * "what the copy was before we touched it".
 *
 * Run:
 *   node --env-file=.env.local tools/48_backup_outreach.mjs            # dump
 *   node --env-file=.env.local tools/48_backup_outreach.mjs --restore docs/backups/outreach_YYYY-MM-DD.json --table outreach_templates
 *
 * Resolves @supabase/supabase-js from dashboard/node_modules.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_KEY (in .env.local).
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
// supabase-js lives in dashboard/node_modules
const require = createRequire(join(repoRoot, "dashboard", "package.json"));
const { createClient } = require("@supabase/supabase-js");

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
if (!URL || !KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY. Run with: node --env-file=.env.local tools/48_backup_outreach.mjs");
    process.exit(1);
}
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

// Tables that hold human-authored copy worth snapshotting.
const TABLES = [
    "outreach_templates",
    "outreach_campaigns",
    "outreach_campaign_steps",
    "outreach_lists",
    "outreach_list_members",
];

async function dumpAll() {
    const out = { _meta: { taken_at: new Date().toISOString(), source: URL.replace(/https?:\/\//, "") } };
    for (const t of TABLES) {
        const { data, error } = await sb.from(t).select("*").limit(20000);
        if (error) { console.error(`[${t}] ${error.message}`); out[t] = { error: error.message }; continue; }
        out[t] = data || [];
        console.log(`[${t}] ${out[t].length} rows`);
    }
    const stamp = new Date().toISOString().slice(0, 10);
    const dir = join(repoRoot, "docs", "backups");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `outreach_${stamp}.json`);
    writeFileSync(file, JSON.stringify(out, null, 2));
    console.log(`\n✔ Wrote ${file}`);
}

async function restore(file, table) {
    if (!table || !TABLES.includes(table)) {
        console.error(`--restore needs --table <one of: ${TABLES.join(", ")}>`);
        process.exit(1);
    }
    const snap = JSON.parse(readFileSync(file, "utf8"));
    const rows = snap[table];
    if (!Array.isArray(rows)) { console.error(`No rows for ${table} in ${file}`); process.exit(1); }
    // Upsert by primary key so a restore is idempotent and only overwrites
    // the rows present in the snapshot (it never deletes newer rows).
    const { error } = await sb.from(table).upsert(rows, { onConflict: table === "outreach_list_members" ? "list_id,contact_id" : "id" });
    if (error) { console.error(`[restore ${table}] ${error.message}`); process.exit(1); }
    console.log(`✔ Restored ${rows.length} rows into ${table} from ${file}`);
}

const args = process.argv.slice(2);
const ri = args.indexOf("--restore");
if (ri !== -1) {
    const file = args[ri + 1];
    const ti = args.indexOf("--table");
    await restore(file, ti !== -1 ? args[ti + 1] : null);
} else {
    await dumpAll();
}
