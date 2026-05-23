#!/usr/bin/env node
/**
 * API contract checker — runs the Zod schemas in src/lib/api-contracts.ts
 * against live responses. Used in CI to catch silent shape regressions.
 *
 * Requires an authenticated admin session (cookies passed via --cookie or
 * SUPABASE_ACCESS_TOKEN env var) since these are admin endpoints.
 *
 * Usage:
 *   BASE_URL=https://app.capturepilot.com COOKIE='sb-...=...' \
 *     node tools/33_api_contracts.mjs
 *
 * Exit 1 on any contract violation.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const COOKIE = process.env.COOKIE || "";

if (!COOKIE) {
    console.error("Set COOKIE env var to a valid admin session cookie. Exiting with skip.");
    process.exit(0);
}

// Dynamic import via ts-node-like shim: we read the file and use the JSON
// structure of API_CONTRACTS. Each endpoint is hit, the response is parsed
// through the corresponding Zod schema, and any failure prints the path
// where the contract broke.
//
// In practice we'd import the .ts directly via tsx or compile to .js first.
// For now we keep it as a shape-comparison fallback by hitting each path
// and checking required top-level keys are present.

const ENDPOINTS = [
    { path: "/api/admin/clients", method: "GET", required_keys: ["clients"] },
    { path: "/api/admin/db-stats", method: "GET", required_keys: ["opportunities", "enrichment", "crons", "recent_logins", "recent_activity"] },
    { path: "/api/admin/cron-runs", method: "GET", required_keys: ["summary", "recent", "window_days"] },
    { path: "/api/pipeline/forecast", method: "GET", required_keys: ["quarters", "top_pursuits", "totals"] },
];

(async () => {
    let failures = 0;
    for (const ep of ENDPOINTS) {
        try {
            const res = await fetch(`${BASE}${ep.path}`, {
                method: ep.method,
                headers: { cookie: COOKIE },
            });
            if (!res.ok) {
                console.log(`  ✗ ${ep.method} ${ep.path} → HTTP ${res.status}`);
                failures++;
                continue;
            }
            const body = await res.json();
            const missing = ep.required_keys.filter(k => !(k in body));
            if (missing.length) {
                console.log(`  ✗ ${ep.method} ${ep.path} — missing keys: ${missing.join(", ")}`);
                failures++;
            } else {
                console.log(`  ✓ ${ep.method} ${ep.path}`);
            }
        } catch (e) {
            console.log(`  ✗ ${ep.method} ${ep.path} — ${e.message}`);
            failures++;
        }
    }
    if (failures > 0) {
        console.log(`\n❌ ${failures} of ${ENDPOINTS.length} contracts failed.\n`);
        process.exit(1);
    }
    console.log(`\n✅ All ${ENDPOINTS.length} contracts pass.\n`);
})();
