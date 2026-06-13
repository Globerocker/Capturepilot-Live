#!/usr/bin/env node
/**
 * Read-only cron inventory for CapturePilot.
 *
 * Usage:
 *   node tools/45_cron_inventory.mjs
 *   node tools/45_cron_inventory.mjs --json
 *
 * The script compares dashboard/vercel.json with cron route handlers and
 * reports direct guard/telemetry references. It does not call any app code.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const cronRoot = path.join(root, "dashboard", "src", "app", "api", "cron");
const vercelPath = path.join(root, "dashboard", "vercel.json");
const asJson = process.argv.includes("--json");

function walkRoutes(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkRoutes(full));
      continue;
    }
    if (entry.isFile() && entry.name === "route.ts") out.push(full);
  }
  return out.sort();
}

function routeName(file) {
  return path.relative(cronRoot, path.dirname(file)).split(path.sep).join("/");
}

const vercel = JSON.parse(fs.readFileSync(vercelPath, "utf8"));
const scheduled = new Map(
  (vercel.crons || []).map((cron) => [
    String(cron.path || "").replace(/^\/api\/cron\//, ""),
    cron.schedule || "",
  ]),
);

const routes = walkRoutes(cronRoot).map((file) => {
  const source = fs.readFileSync(file, "utf8");
  const name = routeName(file);
  return {
    name,
    file: path.relative(root, file),
    scheduled: scheduled.has(name),
    schedule: scheduled.get(name) || null,
    hasGuardCron: /\bguardCron\s*\(/.test(source),
    hasCronTelemetry: /\bwithCronTelemetry\s*\(/.test(source),
  };
});

const routeNames = new Set(routes.map((r) => r.name));
const missingRouteForSchedule = [...scheduled.keys()].filter((name) => !routeNames.has(name)).sort();
const unscheduled = routes.filter((r) => !r.scheduled);
const missingGuard = routes.filter((r) => !r.hasGuardCron);
const missingTelemetry = routes.filter((r) => !r.hasCronTelemetry);

const summary = {
  routeCount: routes.length,
  vercelCronCount: scheduled.size,
  unscheduledRouteCount: unscheduled.length,
  missingRouteForScheduleCount: missingRouteForSchedule.length,
  directGuardCronCount: routes.length - missingGuard.length,
  directTelemetryCount: routes.length - missingTelemetry.length,
};

if (asJson) {
  console.log(JSON.stringify({ summary, routes, missingRouteForSchedule }, null, 2));
  process.exit(missingRouteForSchedule.length ? 1 : 0);
}

console.log("# Cron Inventory");
console.log("");
console.log(`Routes: ${summary.routeCount}`);
console.log(`Vercel scheduled crons: ${summary.vercelCronCount}`);
console.log(`Unscheduled route files: ${summary.unscheduledRouteCount}`);
console.log(`Scheduled entries without route files: ${summary.missingRouteForScheduleCount}`);
console.log(`Direct guardCron references: ${summary.directGuardCronCount}`);
console.log(`Direct withCronTelemetry references: ${summary.directTelemetryCount}`);
console.log("");

if (missingRouteForSchedule.length) {
  console.log("## Scheduled Entries Without Route Files");
  for (const name of missingRouteForSchedule) console.log(`- ${name}`);
  console.log("");
}

console.log("## Vercel Scheduled");
for (const route of routes.filter((r) => r.scheduled)) {
  console.log(`- ${route.name} (${route.schedule})`);
}

console.log("");
console.log("## Unscheduled Route Files");
for (const route of unscheduled) {
  const flags = [
    route.hasGuardCron ? "guard" : "no direct guard",
    route.hasCronTelemetry ? "telemetry" : "no direct telemetry",
  ].join(", ");
  console.log(`- ${route.name} (${flags})`);
}

process.exit(missingRouteForSchedule.length ? 1 : 0);
