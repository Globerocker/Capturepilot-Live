#!/usr/bin/env node
// Loop /api/cron/enrich_gov_contacts_apollo until no candidates remain
// (or hits Apollo rate-limit).
import fs from "node:fs";
const env = fs.readFileSync("/Users/andreschuler/Caturepilot 2.0/.env.local", "utf8");
for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const KEY = process.env.SUPABASE_SERVICE_KEY;
const BASE = "https://app.capturepilot.com";

async function run() {
    let total = { runs: 0, considered: 0, enriched: 0, missed: 0 };
    for (let i = 0; i < 40; i++) {
        const t0 = Date.now();
        const res = await fetch(`${BASE}/api/cron/enrich_gov_contacts_apollo?limit=300`, {
            headers: { Authorization: `Bearer ${KEY}` },
            signal: AbortSignal.timeout(295_000),
        });
        const ms = Date.now() - t0;
        if (!res.ok) {
            console.log(`[${res.status}] run ${i+1} FAILED ${ms}ms`);
            break;
        }
        const j = await res.json();
        total.runs++;
        total.considered += j.considered || 0;
        total.enriched += j.enriched || 0;
        total.missed += j.missed || 0;
        console.log(`run ${i+1}: ${ms}ms — considered=${j.considered} enriched=${j.enriched} missed=${j.missed} rate_limited=${j.rate_limited}`);
        if (j.rate_limited) {
            console.log("RATE LIMIT — stopping.");
            break;
        }
        if ((j.considered || 0) === 0) {
            console.log("No more candidates — done.");
            break;
        }
        // pause between runs to be polite
        await new Promise(r => setTimeout(r, 5000));
    }
    console.log("\nTOTAL:", total);
}
run().catch(e => { console.error(e); process.exit(1); });
