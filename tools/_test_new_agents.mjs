#!/usr/bin/env node
// Hit each net-new cron agent once and report status + payload.
import fs from "node:fs";

const env = fs.readFileSync("/Users/andreschuler/Caturepilot 2.0/.env.local", "utf8");
for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const BASE = "https://app.capturepilot.com";
const KEY = process.env.SUPABASE_SERVICE_KEY;
if (!KEY) { console.error("missing SUPABASE_SERVICE_KEY"); process.exit(1); }

const agents = [
    "/api/cron/ingest_gao_protests_v2?pages=2",
    "/api/cron/ingest_dod_contracts?pages=2",
    "/api/cron/compute_past_performance_stats?limit=10",
    "/api/cron/ingest_dol_wage_determinations?per_state=100&state=VA",
    "/api/cron/ingest_gsa_elibrary?limit=20",
    "/api/cron/ingest_sec_filings_primes?filings_per_prime=3",
    "/api/cron/sync_govtribe_activity?limit=10",
    "/api/cron/ingest_highergov_people?days=14",  // re-test the path-only fix
];

async function hit(p) {
    const t0 = Date.now();
    try {
        const res = await fetch(BASE + p, {
            headers: { Authorization: `Bearer ${KEY}` },
            signal: AbortSignal.timeout(295_000),
        });
        const ms = Date.now() - t0;
        const body = (await res.text()).slice(0, 350).replace(/\s+/g, " ");
        console.log(`[${res.status}] ${p}\n      ${ms}ms  ${body}`);
    } catch (e) {
        const ms = Date.now() - t0;
        console.log(`[ERR ] ${p}\n      ${ms}ms  ${e.message}`);
    }
}

(async () => {
    // Sequential — some agents share USAspending / SAM rate-limits
    for (const p of agents) {
        await hit(p);
    }
})();
