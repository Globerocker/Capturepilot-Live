#!/usr/bin/env node
/**
 * CapturePilot enrichment backfill ops.
 *
 * Default mode is read-only: reports enrichment gaps and worker queue depth.
 * Apply mode calls the existing guarded cron route instead of duplicating
 * insert logic locally.
 *
 * Usage:
 *   node tools/46_enrichment_backfill_ops.mjs
 *   node tools/46_enrichment_backfill_ops.mjs --apply --base https://app.capturepilot.com --op-limit 5000
 *   node tools/46_enrichment_backfill_ops.mjs --apply --drain --base https://app.capturepilot.com
 *   node tools/46_enrichment_backfill_ops.mjs --contractors --base https://app.capturepilot.com
 *
 * Env:
 *   NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL
 *   SUPABASE_SERVICE_KEY
 *   CRON_SECRET            required for --apply/--drain
 *   APP_URL                optional default for --base
 */

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(path.join(root, ".env"));
loadEnvFile(path.join(root, ".env.local"));
loadEnvFile(path.join(root, "dashboard", ".env"));
loadEnvFile(path.join(root, "dashboard", ".env.local"));

const args = new Set(process.argv.slice(2));
const getArg = (name, fallback = null) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
const BASE = (getArg("--base", process.env.APP_URL) || "").replace(/\/$/, "");
const OP_LIMIT = Math.min(Math.max(Number(getArg("--op-limit", "5000")), 100), 20000);
const APPLY = args.has("--apply");
const DRAIN = args.has("--drain");
const CONTRACTORS = args.has("--contractors");

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_KEY.");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

async function countQuery(label, query) {
  const { count, error } = await query;
  if (error) return { label, count: null, error: error.message };
  return { label, count: count ?? 0, error: null };
}

async function groupedQueue() {
  const { data, error } = await sb
    .from("worker_jobs")
    .select("task_type,status")
    .in("status", ["pending", "running", "failed"]);
  if (error) return { error: error.message, rows: [] };

  const map = new Map();
  for (const row of data || []) {
    const key = row.task_type;
    if (!map.has(key)) map.set(key, { task_type: key, pending: 0, running: 0, failed: 0 });
    map.get(key)[row.status] += 1;
  }
  return { error: null, rows: [...map.values()].sort((a, b) => a.task_type.localeCompare(b.task_type)) };
}

async function callCron(route, search = "") {
  if (!BASE) throw new Error("Missing --base or APP_URL for cron call.");
  if (!CRON_SECRET) throw new Error("Missing CRON_SECRET for cron call.");
  const url = `${BASE}/api/cron/${route}${search}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
  const text = await res.text();
  let body = text;
  try { body = JSON.parse(text); } catch {}
  return { route, status: res.status, ok: res.ok, body };
}

const gaps = [
  await countQuery(
    "active opportunities missing NAICS",
    sb.from("opportunities").select("id", { count: "estimated" }).eq("is_archived", false).is("naics_code", null).limit(1),
  ),
  await countQuery(
    "active opportunities missing structured requirements",
    sb.from("opportunities").select("id", { count: "exact", head: true }).eq("is_archived", false).is("structured_requirements", null).not("description", "is", null),
  ),
  await countQuery(
    "active opportunities missing opportunity_score",
    sb.from("opportunities").select("id", { count: "exact" }).eq("is_archived", false).is("opportunity_score", null).limit(1),
  ),
  await countQuery(
    "contractors missing federal_awards_count",
    sb.from("contractors").select("id", { count: "exact" }).is("federal_awards_count", null).limit(1),
  ),
  await countQuery(
    "company analyses not completed",
    sb.from("company_analyses").select("id", { count: "exact" }).neq("status", "completed").limit(1),
  ),
];

console.log("\n=== Enrichment Backfill Ops ===\n");
for (const gap of gaps) {
  const suffix = gap.error ? `ERROR: ${gap.error}` : (gap.count ?? "unknown");
  console.log(`${gap.label.padEnd(52)} ${suffix}`);
}

const queue = await groupedQueue();
console.log("\n=== Worker Queue ===\n");
if (queue.error) {
  console.log(`ERROR: ${queue.error}`);
} else if (queue.rows.length === 0) {
  console.log("No pending/running/failed worker jobs.");
} else {
  for (const row of queue.rows) {
    console.log(`${row.task_type.padEnd(32)} pending=${String(row.pending).padStart(5)} running=${String(row.running).padStart(4)} failed=${String(row.failed).padStart(5)}`);
  }
}

if (!APPLY && !DRAIN && !CONTRACTORS) {
  console.log("\nDry run only. Re-run with --apply to call /api/cron/enqueue_backfill.");
  console.log("Use --contractors to call contractor enrichment crons, and --drain to trigger worker lanes.");
  process.exit(0);
}

const calls = [];
if (APPLY) calls.push(await callCron("enqueue_backfill", `?op_limit=${OP_LIMIT}`));
if (CONTRACTORS) {
  calls.push(await callCron("enrich_contractors_usaspending"));
  calls.push(await callCron("bulk_enrich_contractors_sam"));
  calls.push(await callCron("enrich_apollo_contractors"));
}
if (DRAIN) {
  calls.push(await callCron("run_worker_jobs"));
  calls.push(await callCron("run_worker_jobs_keywords"));
  calls.push(await callCron("run_worker_jobs_attachments"));
  calls.push(await callCron("run_worker_jobs_rescore"));
}

console.log("\n=== Cron Calls ===\n");
let failed = 0;
for (const call of calls) {
  if (!call.ok) failed++;
  console.log(`${call.route.padEnd(28)} HTTP ${call.status}`);
  console.log(typeof call.body === "string" ? call.body.slice(0, 1000) : JSON.stringify(call.body, null, 2).slice(0, 2000));
  console.log("");
}

process.exit(failed ? 1 : 0);
