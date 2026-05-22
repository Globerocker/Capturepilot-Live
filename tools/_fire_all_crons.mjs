#!/usr/bin/env node
// One-shot manual trigger for every ingest + enrichment cron in production.
// Fires in waves so dependent crons run in order; logs status code + elapsed.
import fs from "node:fs";

const env = fs.readFileSync("/Users/andreschuler/Caturepilot 2.0/.env.local", "utf8");
for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const BASE = process.env.PROD_BASE || "https://app.capturepilot.com";
const KEY = process.env.SUPABASE_SERVICE_KEY;
if (!KEY) { console.error("missing SUPABASE_SERVICE_KEY"); process.exit(1); }

async function hit(path, { method = "GET" } = {}) {
    const t0 = Date.now();
    try {
        const res = await fetch(BASE + path, {
            method,
            headers: { Authorization: `Bearer ${KEY}` },
            signal: AbortSignal.timeout(295_000),
        });
        const ms = Date.now() - t0;
        let body = "";
        try { body = (await res.text()).slice(0, 400); } catch {}
        console.log(`[${res.status}] ${path}  ${ms}ms  ${body.replace(/\s+/g," ").slice(0, 220)}`);
        return { ok: res.ok, status: res.status, body, ms };
    } catch (e) {
        const ms = Date.now() - t0;
        console.log(`[ERR] ${path}  ${ms}ms  ${e.message}`);
        return { ok: false, status: 0, body: e.message, ms };
    }
}

async function wave(name, paths) {
    console.log(`\n=== ${name} (parallel x${paths.length}) ===`);
    return Promise.all(paths.map(p => hit(p)));
}

(async () => {
    const t0 = Date.now();
    // Wave 1 — raw ingestion. Run in parallel; each route has its own
    // upstream rate-limit envelope.
    await wave("INGEST", [
        "/api/cron/ingest_sam?days=10",
        "/api/cron/ingest_rss?limit=200",
        "/api/cron/ingest_highergov_sled?days=10",
        "/api/cron/ingest_highergov_people?days=14&page_size=100",
        "/api/cron/ingest_grants",
        "/api/cron/ingest_dod_daily",
        "/api/cron/ingest_gao_protests",
        "/api/cron/ingest_calc",
        "/api/cron/ingest_subawards",
        "/api/cron/ingest_fpds_awards",
        "/api/cron/ingest_gsa_schedule",
        "/api/cron/ingest_federal_hierarchy",
    ]);

    // Wave 2 — enrichment that depends on opportunities already existing.
    await wave("ENRICH-OPPS", [
        "/api/cron/backfill_requirements",
        "/api/cron/enrich",
        "/api/cron/deep_enrich",
        "/api/cron/bulk_enrich_descriptions",
        "/api/cron/bulk_enrich_ai",
        "/api/cron/strategic_scoring",
        "/api/cron/ai_strategy",
        "/api/cron/download_attachments",
    ]);

    // Wave 3 — contractor + contact enrichment.
    await wave("ENRICH-PEOPLE", [
        "/api/cron/enrich_apollo_contractors",
        "/api/cron/enrich_contractors_usaspending",
        "/api/cron/enrich_gov_contacts_apollo?limit=200",
    ]);

    // Wave 4 — derived data + scoring.
    await wave("SCORE+STATS", [
        "/api/cron/naics_stats_backfill",
        "/api/cron/score_matches",
        "/api/cron/forecast_change_detection",
        "/api/cron/recompete_scan",
    ]);

    console.log(`\nTotal elapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
})();
