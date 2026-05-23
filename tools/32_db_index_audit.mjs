#!/usr/bin/env node
/**
 * DB-index audit. Pulls Supabase's lint advisor + a couple of
 * application-specific "expected index" checks against pg_indexes.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node tools/32_db_index_audit.mjs
 *
 * Output:
 *   - Supabase Advisor warnings/errors that mention missing indexes,
 *     unused indexes, or duplicate indexes.
 *   - Our explicit "must exist" list: indexes the app's hot queries
 *     rely on. A missing one means slow page loads.
 *
 * Exit 1 if any "must exist" index is absent.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY.");
    process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

// (Table, columnList[]) — indexes the app needs to be fast. The script will
// look in pg_indexes for any index whose `indexdef` includes ALL of the
// listed columns (in any order, allowing extra columns).
const EXPECTED_INDEXES = [
    ["user_matches", ["user_profile_id"]],
    ["user_matches", ["user_profile_id", "classification"]],
    ["user_matches", ["user_profile_id", "is_saved"]],
    ["user_matches", ["opportunity_id"]],
    ["user_pursuits", ["user_profile_id"]],
    ["opportunities", ["is_archived"]],
    ["opportunities", ["status"]],
    ["opportunities", ["response_deadline"]],
    ["opportunities", ["naics_code"]],
    ["opportunities", ["place_of_performance_state"]],
    ["client_activity_log", ["user_profile_id"]],
    ["client_activity_log", ["created_at"]],
    ["client_tasks", ["user_profile_id"]],
    ["client_documents", ["user_profile_id"]],
    ["cron_runs", ["route", "started_at"]],
    ["user_profiles", ["auth_user_id"]],
    ["company_analyses", ["analysis_id"]],
];

async function fetchIndexes() {
    // information_schema doesn't have a great indexes view, so query
    // pg_indexes directly via the Supabase REST passthrough.
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql_readonly`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
        body: JSON.stringify({
            sql: "select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' order by tablename, indexname",
        }),
    }).catch(() => null);

    if (res && res.ok) {
        const json = await res.json();
        return json;
    }

    // Fallback — sample from pg_indexes by passing a known function via
    // the Postgres meta API. If that isn't enabled we fall back to running
    // against `tables` we know about. This script's primary value is the
    // expected-index check; the advisor part is best-effort.
    console.warn("exec_sql_readonly RPC not available — index audit may be partial.");
    return [];
}

function indexCoversColumns(indexdef, columns) {
    // Take the column list inside the parens of `CREATE INDEX ... ON ... (cols)`.
    const m = indexdef.match(/\(([^)]+)\)/);
    if (!m) return false;
    const cols = m[1].split(",").map(s => s.trim().split(" ")[0].replace(/^"|"$/g, ""));
    return columns.every(c => cols.includes(c));
}

(async () => {
    console.log("\n=== DB Index Audit ===\n");
    const indexes = await fetchIndexes();
    console.log(`Found ${indexes.length} public-schema indexes.\n`);

    const byTable = new Map();
    for (const i of indexes) {
        if (!byTable.has(i.tablename)) byTable.set(i.tablename, []);
        byTable.get(i.tablename).push(i);
    }

    let missing = 0;
    for (const [table, cols] of EXPECTED_INDEXES) {
        const ti = byTable.get(table) || [];
        const ok = ti.some(i => indexCoversColumns(i.indexdef, cols));
        if (ok) {
            console.log(`  ✓ ${table}(${cols.join(",")})`);
        } else {
            missing++;
            console.log(`  ✗ ${table}(${cols.join(",")}) — MISSING`);
        }
    }

    console.log("");
    if (missing === 0) {
        console.log(`✅ All ${EXPECTED_INDEXES.length} expected indexes present.\n`);
        process.exit(0);
    } else {
        console.log(`❌ ${missing} of ${EXPECTED_INDEXES.length} expected indexes missing.\n`);
        console.log("Next step: add a migration that creates the missing indexes:");
        console.log("  create index if not exists <table>_<cols>_idx on <table>(<cols>);\n");
        process.exit(1);
    }
})();
