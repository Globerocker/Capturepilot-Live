import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";

export const maxDuration = 300;

/**
 * Single Vercel cron that drives all 8 opportunity-enrichment routes.
 *
 * Why: we were at 41/40 Pro crons after adding backlinks_orchestrator. This
 * consolidation drops us to 34, freeing 7 slots for future features.
 *
 * Schedule: `0,10,15,30,40 * * * *` — 5 firings per hour, covering every
 * minute mark the 8 original cron schedules used. Each invocation checks
 * UTC hour/minute and dispatches only the tasks whose original schedule
 * matches "now". Tasks fire in parallel with Promise.allSettled so a
 * single failure doesn't block the others.
 *
 * Original schedules (preserved):
 *   enrich                          0 5 * * *
 *   backfill_requirements           0 6 * * *
 *   strategic_scoring               0 7 * * *
 *   ai_strategy                    15 *\/4 * * *
 *   bulk_enrich_descriptions     10,40 1-23 * * *
 *   bulk_enrich_ai               *\/30 * * * *
 *   deep_enrich                     0 *\/4 * * *
 *   enrich_contractors_usaspending 30 6 * * *
 *
 * Override for manual debugging: GET ?task=ai_strategy invokes a single
 * task immediately, bypassing the schedule check.
 */

const TASKS = {
  enrich:                          "enrich",
  backfill_requirements:           "backfill_requirements",
  strategic_scoring:               "strategic_scoring",
  ai_strategy:                     "ai_strategy",
  bulk_enrich_descriptions:        "bulk_enrich_descriptions",
  bulk_enrich_ai:                  "bulk_enrich_ai",
  deep_enrich:                     "deep_enrich",
  enrich_contractors_usaspending:  "enrich_contractors_usaspending",
  enrich_sled_descriptions:        "enrich_sled_descriptions",
  discover_bonfire_tenants:        "discover_bonfire_tenants",
  analyze_match_attachments:       "analyze_match_attachments",
  run_worker_jobs:                 "run_worker_jobs",
  enqueue_backfill:                "enqueue_backfill",
  // SLED ingestion paths that existed in code but were never wired to a
  // schedule — discovered 2026-05-28 when SLED counts stayed flat. The
  // Bonfire JSON path replaces the RSS path for tenants where
  // use_json_api=true (set by discover_bonfire_tenants). OpenGov +
  // tx_esbd are direct ingestion paths for those portal families.
  ingest_bonfire_json:             "ingest_bonfire_json",
  ingest_opengov:                  "ingest_opengov",
  ingest_tx_esbd:                  "ingest_tx_esbd",
  ingest_fpds_awards:              "ingest_fpds_awards",
  ingest_gsa_schedule:             "ingest_gsa_schedule",
} as const;

type TaskName = keyof typeof TASKS;

function tasksDueAt(d: Date): TaskName[] {
  const m = d.getUTCMinutes();
  const h = d.getUTCHours();
  const due: TaskName[] = [];

  // 0 5 * * *
  if (h === 5 && m === 0) due.push("enrich");
  // 0 6 * * *
  if (h === 6 && m === 0) due.push("backfill_requirements");
  // 0 7 * * *
  if (h === 7 && m === 0) due.push("strategic_scoring");
  // 15 */4 * * *  → minutes=15, hours 0,4,8,12,16,20
  if (m === 15 && h % 4 === 0) due.push("ai_strategy");
  // 10,40 1-23 * * *
  if ((m === 10 || m === 40) && h >= 1 && h <= 23) due.push("bulk_enrich_descriptions");
  // */30 * * * *  → minutes 0, 30
  if (m === 0 || m === 30) due.push("bulk_enrich_ai");
  // 0 */4 * * *
  if (m === 0 && h % 4 === 0) due.push("deep_enrich");
  // 30 6 * * *
  if (h === 6 && m === 30) due.push("enrich_contractors_usaspending");
  // Run at minutes 10 and 40 — these align with the orchestrator's own
  // vercel.json schedule (0,10,15,30,40). Picking the slots already used by
  // bulk_enrich_descriptions (10,40) but for SLED — they're independent
  // pipelines hitting different rows. ~3000 rows scanned/day at 60-row
  // batches, enough to chew through the 1,100-row gap in ~3 days then
  // settle into maintenance keeping up with new ingest.
  if (m === 10 || m === 40) due.push("enrich_sled_descriptions");

  // Bonfire tenant discovery — daily at 04:00 UTC. Cheap (~25s for 200
  // seed probes) and idempotent; new tenants land in rss_sources, then
  // ingest_bonfire_json (below) pulls their open projects on the next tick.
  if (h === 4 && m === 0) due.push("discover_bonfire_tenants");

  // Bonfire JSON ingest — every 2h at :05 (avoids clashing with
  // bulk_enrich_descriptions at :10/:40). Each tenant returns ALL open
  // opps in one call, so per-run cost is bounded by tenant count, not
  // opp count. ~120 tenants × 1s ≈ 2min/run, well inside maxDuration.
  if (m === 5 && h % 2 === 0) due.push("ingest_bonfire_json");

  // OpenGov ingest — twice daily (06:05 + 18:05 UTC). Lower frequency
  // because OpenGov refreshes are slower and the list+detail combo per
  // project burns more time than Bonfire's single-call JSON.
  if (m === 5 && (h === 6 || h === 18)) due.push("ingest_opengov");

  // Texas SmartBuy / ESBD — daily at 05:05 UTC. State-only, single feed.
  if (h === 5 && m === 5) due.push("ingest_tx_esbd");

  // FPDS awards ingest — daily at 02:05 UTC. Backfills the past-performance
  // signal that feeds capability_summary_ai + Contract Winners ranking.
  if (h === 2 && m === 5) due.push("ingest_fpds_awards");

  // GSA Schedule (MAS) holders — weekly Sunday 06:05 UTC. Schedule holders
  // are an explicit "ready-to-team" signal; lower frequency since list
  // changes slowly.
  if (h === 6 && m === 5 && d.getUTCDay() === 0) due.push("ingest_gsa_schedule");

  // SAM attachment text → structured_requirements. Runs at :15 every
  // hour. analyze_match_attachments downloads PDFs/DOCX from saved opps,
  // extracts text, and re-runs the LLM to fill bonding/insurance/clearance/
  // performance-period fields that were null from description-only extraction.
  if (m === 15) due.push("analyze_match_attachments");

  // worker_jobs queue consumer (Vercel side — HTTP-only task types).
  // Runs every orchestrator tick — picks up jobs enqueued by the
  // opportunities trigger and the bulk-backfill cron. Browser tasks stay
  // claimed by the Railway worker.
  due.push("run_worker_jobs");

  // Bulk backfill — re-enqueues any stale opps + tops up the cookie-warmer
  // queue. Runs hourly at :30. Idempotent via worker_jobs.dedup_key.
  if (m === 30) due.push("enqueue_backfill");

  return due;
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const override = url.searchParams.get("task") as TaskName | null;
  const tasks: TaskName[] = override
    ? (TASKS[override] ? [override] : [])
    : tasksDueAt(new Date());

  if (tasks.length === 0) {
    return NextResponse.json({ ok: true, dispatched: [], reason: "no tasks due" });
  }

  const base = `${url.protocol}//${url.host}`;
  const headers: Record<string, string> = {};
  if (process.env.CRON_SECRET) headers.authorization = `Bearer ${process.env.CRON_SECRET}`;

  // Parallel fan-out. allSettled so one slow/failed task doesn't block siblings.
  const settled = await Promise.allSettled(
    tasks.map(async task => {
      const started = Date.now();
      const res = await fetch(`${base}/api/cron/${TASKS[task]}`, { headers, cache: "no-store" });
      const text = await res.text();
      return { task, ok: res.ok, status: res.status, ms: Date.now() - started, body: text.slice(0, 500) };
    }),
  );

  const results = settled.map((s, i) => s.status === "fulfilled"
    ? s.value
    : { task: tasks[i], ok: false, error: (s.reason as Error)?.message ?? String(s.reason) },
  );

  return NextResponse.json({
    ok: true,
    fired_at: new Date().toISOString(),
    dispatched: tasks,
    results,
  });
}
