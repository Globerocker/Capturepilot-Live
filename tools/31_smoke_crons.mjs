#!/usr/bin/env node
/**
 * Cron-route smoke test — catches dead/regressed cron handlers faster than
 * waiting for cron_runs telemetry to stay quiet.
 *
 * Fix: audit-gap closing — until now the only way to discover that a cron
 * route had been renamed, deleted, or started throwing on a fresh deploy
 * was to wait for `/admin/health` to surface a stale `last_run` row hours
 * later. This script fans out an authenticated GET to every cron path
 * listed in `dashboard/vercel.json` and asserts a 2xx response. Run weekly
 * from GitHub Actions (`.github/workflows/cron-smoke.yml`).
 *
 * Companion to tools/30_smoke_admin.mjs:
 *   - 30 catches missing `assertAdmin()` (auth regression).
 *   - 31 catches missing/broken cron handlers (route regression).
 *
 * Usage:
 *   CRON_SECRET=xxx node tools/31_smoke_crons.mjs --base https://captiorpilot-v3.vercel.app
 *   CRON_SECRET=xxx node tools/31_smoke_crons.mjs --base http://localhost:3000 --verbose
 *   CRON_SECRET=xxx node tools/31_smoke_crons.mjs --skip ingest_sam --skip ingest_grants
 *
 * Flags:
 *   --base <url>          target deployment (default: $BASE_URL or http://localhost:3000)
 *   --verbose / -v        log every probe, not just failures
 *   --skip <path>         skip a cron by basename, repeatable (e.g. --skip ingest_sam)
 *   --concurrency <n>     parallel in-flight requests (default: 4)
 *   --timeout <ms>        per-request timeout (default: 60000)
 *
 * Exit code: 0 if all probed crons return 2xx, 1 otherwise. CI-friendly.
 *
 * What this does NOT cover:
 *   - Whether the handler did anything useful — only that it responded 2xx.
 *     For heavy crons (e.g. ingest_sam) prefer `--skip` and rely on
 *     `/admin/health` cron_summary for execution telemetry.
 *   - Body validation. Add it per-route if a handler needs deeper checks.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : fallback;
};
const getAllArgs = (name) => {
  const values = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === name && args[i + 1] !== undefined) values.push(args[i + 1]);
  }
  return values;
};

const BASE = (getArg("--base", process.env.BASE_URL || "http://localhost:3000") || "").replace(/\/$/, "");
const VERBOSE = args.includes("--verbose") || args.includes("-v");
const SKIP = new Set(getAllArgs("--skip"));
const CONCURRENCY = Math.max(1, parseInt(getArg("--concurrency", "4"), 10) || 4);
const TIMEOUT_MS = parseInt(getArg("--timeout", "60000"), 10) || 60_000;
const CRON_SECRET = process.env.CRON_SECRET;

if (!CRON_SECRET) {
  console.error("ERROR: CRON_SECRET env var is required (cron handlers fail-closed without it in prod).");
  console.error("       Set it locally:  export CRON_SECRET=...");
  console.error("       In CI:           add as a repo secret and pass via env on the workflow step.");
  process.exit(2);
}

// vercel.json lives in dashboard/. Resolve relative to this file so the
// script works whether invoked from repo root or anywhere else.
const __dirname = dirname(fileURLToPath(import.meta.url));
const VERCEL_JSON = resolve(__dirname, "..", "dashboard", "vercel.json");

let crons;
try {
  const raw = readFileSync(VERCEL_JSON, "utf-8");
  const parsed = JSON.parse(raw);
  crons = Array.isArray(parsed.crons) ? parsed.crons : [];
} catch (e) {
  console.error(`ERROR: failed to read ${VERCEL_JSON}: ${e.message}`);
  process.exit(2);
}

if (crons.length === 0) {
  console.error("ERROR: no crons defined in dashboard/vercel.json");
  process.exit(2);
}

const targets = crons
  .map((c) => c.path)
  .filter((p) => typeof p === "string" && p.startsWith("/api/cron/"))
  .filter((p) => {
    const base = p.replace(/^\/api\/cron\//, "");
    return !SKIP.has(base);
  });

async function probe(path) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "GET",
      redirect: "manual",
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });
    return { status: res.status, ms: Date.now() - started };
  } catch (e) {
    return { status: 0, ms: Date.now() - started, error: e.message };
  } finally {
    clearTimeout(t);
  }
}

function fmtRow(label, status, ok, detail) {
  const mark = ok ? "✓" : "✗";
  const tag = ok ? "PASS" : "FAIL";
  return `  ${mark} [${tag}] ${label.padEnd(58)} ${status} ${detail || ""}`;
}

// Simple bounded-concurrency pool — Promise.all with a worker per slot.
async function runPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let cursor = 0;
  async function spin() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, spin));
  return results;
}

async function main() {
  console.log(`\n  Cron-route smoke test — base: ${BASE}`);
  console.log(`  Probing ${targets.length} of ${crons.length} crons` +
    (SKIP.size ? ` (${SKIP.size} skipped)` : "") +
    ` with concurrency=${CONCURRENCY}, timeout=${TIMEOUT_MS}ms\n`);

  let fails = 0;
  const results = await runPool(
    targets,
    async (path) => {
      const r = await probe(path);
      // Authorized 2xx is the happy path. Any auth-style 4xx is a regression
      // (means the route's gate diverged from cron-auth.ts), and 5xx means
      // the handler crashed. 0 = network/timeout.
      const ok = r.status >= 200 && r.status < 300;
      if (!ok) fails++;
      const detail = r.error
        ? `(${r.error})`
        : r.status === 401 || r.status === 403
          ? "⚠ gate rejected valid token — cron-auth drift?"
          : r.status >= 500
            ? "⚠ handler 5xx"
            : r.status === 0
              ? "⚠ network/timeout"
              : `${r.ms}ms`;
      if (!ok || VERBOSE) console.log(fmtRow(path, r.status, ok, detail));
      return { path, ...r, ok };
    },
    CONCURRENCY,
  );

  if (fails === 0) {
    console.log(`\n  All ${results.length} cron probes passed.\n`);
    process.exit(0);
  } else {
    console.log(`\n  ${fails} of ${results.length} cron probes failed.\n`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(2);
});
