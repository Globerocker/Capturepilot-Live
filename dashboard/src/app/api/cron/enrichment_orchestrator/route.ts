import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
// Fix: cron_runs telemetry coverage — wrap handler so /admin/health stale-cron
// detector and daily digest can see this route. Previously only 5 of 35 crons
// were logging to cron_runs.
import { withCronTelemetry } from "@/lib/cron-telemetry";
// Fix: per-task escalation — orchestrator fan-out hides sub-task failures
// behind a single cron_runs row. Each non-2xx or thrown sub-task now spawns
// a health_alerts row so /admin/health/alerts surfaces it for resolution.
import { raiseAlert } from "@/lib/health-alerts";

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
  // Fix: removed `analyze_match_attachments` batched cron — its task name
  // collided with the per-opp `analyze_attachments` worker_jobs handler in
  // /api/cron/run_worker_jobs. The queue handler now owns the work end-to-end
  // (fan-out trigger on opportunities insert enqueues `analyze_attachments`
  // jobs, which run_worker_jobs claims). See `handleAnalyzeAttachments` in
  // /api/cron/run_worker_jobs/route.ts.
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
  // Contractor profile-page lifecycle. publish picks 10 new candidates/day;
  // refresh updates existing pages from latest USAspending. Without these
  // running, www.capturepilot.com/contractors/<slug> goes stale and we
  // never publish new pages from the 80k contractor pool.
  publish_contractor_pages:        "publish_contractor_pages",
  refresh_contractor_pages:        "refresh_contractor_pages",
  // Contractor profile pages double as backlink prospects — we wrote
  // about them on the public directory, the trade is they link back.
  // This cron walks new profile_pages and seeds backlink_prospects with
  // pitch_angle='contractor_profile' so the existing draft-generator +
  // outreach pipeline picks them up alongside competitor-refdomain leads.
  discover_contractor_backlink_prospects: "discover_contractor_backlink_prospects",
  // Auto-sender for the backlink outreach pipeline — 100/day cap
  // enforced in the route. Fires every 2h, ~9 per tick.
  send_backlink_outreach:          "send_backlink_outreach",
  // Fix: orphan-handler audit (2026-06) — these three routes had no Vercel
  // cron entry and no orchestrator dispatch, so they never ran in production
  // despite being referenced by /admin/db-stats (db_cleanup, monthly_awards)
  // and the /forecasts page (forecast_change_detection). Routed through the
  // orchestrator instead of consuming Vercel cron slots (we're at 39/40 Pro).
  db_cleanup:                      "db_cleanup",
  forecast_change_detection:       "forecast_change_detection",
  monthly_awards:                  "monthly_awards",
  // GovTribe cache pre-warmer — was missing from vercel.json (at Pro ceiling
  // of 40 crons) and had no orchestrator entry, so it never ran. Routed here
  // at 08:30 UTC daily: after SAM ingest (00:30) + scoring (03:00) + the
  // overnight enrichment wave, so the opportunity set is fresh when we warm.
  // The handler is a no-op when GOVTRIBE_API_KEY is unset.
  sync_govtribe_activity:          "sync_govtribe_activity",
  // Audit fix #9 (2026-06-10) — deterministic opportunity_score producer.
  // Column was NULL on 100% of opportunities; no Vercel cron slot free, so
  // routed here. Drains 5000 NULLs per fire; twice-daily cadence catches
  // both the overnight SAM ingest and the midday SLED waves.
  backfill_opportunity_score:      "backfill_opportunity_score",
  // 2026-06-10 — async rescore lane. /api/matches/refresh used to score 78k
  // opps inline and time out the Vercel function. Now it enqueues a
  // rescore_user_matches worker job which this drain claims (batch_size=3,
  // ~30s/job) every orchestrator tick. vercel.json is at the 40/40 Pro
  // ceiling so we ferry it here rather than adding a 41st entry.
  run_worker_jobs_rescore:         "run_worker_jobs_rescore",
  // R3-M2.1 — outreach cadence runner. Advances outreach_campaign_contacts
  // through their steps and fires the next email/SMS. Vercel is at the
  // 40/40 Pro cron ceiling so this rides the orchestrator at every 5-min
  // tick. The route itself is budgeted at 270s and processes up to 100
  // contacts per fire — well inside the orchestrator's parallel fan-out.
  run_outreach_cadence:            "run_outreach_cadence",
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

  // Contractor profile page lifecycle:
  //   publish — picks 10 new candidates/day from contractors pool,
  //   computes rollups, generates AI summary, marks is_published.
  //   refresh — re-pulls USAspending data for existing pages so the
  //   numbers on www.capturepilot.com/contractors/<slug> stay current.
  if (h === 4 && m === 30) due.push("publish_contractor_pages");
  if (h === 5 && m === 30) due.push("refresh_contractor_pages");

  // Backlink prospect discovery from new contractor profile pages.
  // 06:40 UTC daily — runs AFTER publish_contractor_pages (04:30) +
  // refresh_contractor_pages (05:30) so any newly-published profile
  // is eligible the same day.
  if (h === 6 && m === 40) due.push("discover_contractor_backlink_prospects");

  // Backlink autosend — every 2h, all day, ~9 sends per tick = ~100/day.
  // Skip the very early UTC hours (US business-hours window only) so
  // emails land while marketing people are awake.
  // 13:00 UTC = 9 AM ET / 6 AM PT, 23:00 UTC = 7 PM ET / 4 PM PT.
  if (m === 10 && h >= 13 && h <= 23 && h % 2 === 1) due.push("send_backlink_outreach");

  // Fix: removed :15 hourly `analyze_match_attachments` dispatch — the batched
  // route was deleted because its task name shadowed the per-opp
  // `analyze_attachments` worker_jobs handler. SAM attachment OCR now runs
  // exclusively through the queue (fan-out trigger enqueues one job per new
  // SAM opp, run_worker_jobs claims them at every orchestrator tick).

  // worker_jobs queue consumer (Vercel side — HTTP-only task types).
  // Runs every orchestrator tick — picks up jobs enqueued by the
  // opportunities trigger and the bulk-backfill cron. Browser tasks stay
  // claimed by the Railway worker.
  due.push("run_worker_jobs");

  // Bulk backfill — re-enqueues any stale opps + tops up the cookie-warmer
  // queue. Runs hourly at :30. Idempotent via worker_jobs.dedup_key.
  if (m === 30) due.push("enqueue_backfill");

  // Fix: orphan-handler audit (2026-06) — wire the three previously-unscheduled
  // crons to their documented cadences.
  //   db_cleanup        — Sunday 04:00 UTC (weekly lifecycle sweep)
  //   forecast_change_detection — daily 06:30 UTC (agency forecast differ)
  //   monthly_awards    — 1st of month, 03:00 UTC (SAM Award/Forecast pull)
  if (h === 4 && m === 0 && d.getUTCDay() === 0) due.push("db_cleanup");
  if (h === 6 && m === 30) due.push("forecast_change_detection");
  if (h === 3 && m === 0 && d.getUTCDate() === 1) due.push("monthly_awards");

  // GovTribe cache pre-warmer — daily 08:30 UTC. Fires after overnight
  // ingest + scoring so the opportunity set is up to date. No-op when
  // GOVTRIBE_API_KEY is unset (safe to run unconditionally).
  if (h === 8 && m === 30) due.push("sync_govtribe_activity");

  // Opportunity-score backfill — twice daily at 02:40 + 14:40 UTC. Aligned to
  // orchestrator firing slots (0,5,10,15,30,40). Drains 5000 NULL rows per
  // run, so the 78k historical backlog clears in ~8 runs (4 days) then settles
  // into incremental maintenance behind new ingest.
  if (m === 40 && (h === 2 || h === 14)) due.push("backfill_opportunity_score");

  // Rescore drain — fires every orchestrator tick. Each invocation claims up
  // to 3 rescore_user_matches jobs (~30s each) so a manual "Refresh Matches"
  // click is picked up within ~3 minutes. Idempotent and rate-bounded by the
  // batch_size + 150s budget inside the route.
  due.push("run_worker_jobs_rescore");

  // R3-M2.1 — outreach cadence runner. Fires every orchestrator tick (every
  // 5-min). Internal budget caps at 270s + 100 contacts per fire so it
  // doesn't starve siblings in the parallel fan-out.
  due.push("run_outreach_cadence");

  return due;
}

async function GET_handler(req: NextRequest): Promise<NextResponse> {
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

  // Fix: Vercel Deployment Protection ("Vercel Authentication") was enabled on
  // captiorpilot-v3 around 2026-06-09 04:00 UTC. The raw deploy host
  // (captiorpilot-v3-*.vercel.app) is gated by Vercel's edge auth, so
  // same-origin sub-task fetches receive a 401 HTML page before guardCron()
  // ever runs. Using the stable public alias (NEXT_PUBLIC_APP_URL) bypasses
  // the Vercel Authentication gate because it hits the production domain
  // (app.capturepilot.com) which was NOT covered by the gate.
  // CRON_SECRET itself is correct — direct curls to app.capturepilot.com return 200.
  const base = process.env.NEXT_PUBLIC_APP_URL ?? `${url.protocol}//${url.host}`;
  const headers: Record<string, string> = {};
  if (process.env.CRON_SECRET) headers.authorization = `Bearer ${process.env.CRON_SECRET}`;

  // Fix: orchestrator → child cron handoff was failing silently when the
  // same-origin fetch hit DNS/cold-start/auth timeouts (e.g. run_worker_jobs
  // never fired because the fan-out fetch hung past maxDuration). Resolution:
  // (1) import the child route's GET handler directly when possible and call
  // it in-process with a synthesized NextRequest carrying the CRON_SECRET —
  // eliminates network, DNS, and edge auth as failure modes; (2) keep a fetch
  // fallback for any task we haven't pre-imported; (3) console.error on every
  // non-ok so Vercel logs surface regressions instead of swallowing them.
  // Note: the originally-proposed vercel.json backstop ("schedule run_worker_jobs
  // directly at */5") was NOT added — vercel.json is already at the 40-cron Pro
  // ceiling (naics_stats_backfill consumed the last free slot), so adding a
  // 41st entry would fail deploy. The in-process fix below is enough.
  type Handler = (req: NextRequest) => Promise<Response>;
  const inProcessHandlers: Partial<Record<TaskName, () => Promise<Handler>>> = {
    run_worker_jobs: async () => (await import("../run_worker_jobs/route")).GET as Handler,
    enqueue_backfill: async () => (await import("../enqueue_backfill/route")).GET as Handler,
    run_worker_jobs_rescore: async () => (await import("../run_worker_jobs_rescore/route")).GET as Handler,
    run_outreach_cadence: async () => (await import("../run_outreach_cadence/route")).GET as Handler,
  };

  function buildChildRequest(task: TaskName): NextRequest {
    const childUrl = `${base}/api/cron/${TASKS[task]}`;
    return new NextRequest(childUrl, { headers, cache: "no-store" });
  }

  // Parallel fan-out. allSettled so one slow/failed task doesn't block siblings.
  const settled = await Promise.allSettled(
    tasks.map(async task => {
      const childUrl = `${base}/api/cron/${TASKS[task]}`;
      const started = Date.now();
      try {
        const loader = inProcessHandlers[task];
        let res: Response;
        if (loader) {
          // In-process invoke — no DNS, no cold-start, no edge auth roundtrip.
          const handler = await loader();
          res = await handler(buildChildRequest(task));
        } else {
          res = await fetch(childUrl, { headers, cache: "no-store" });
        }
        const text = await res.text();
        const ms = Date.now() - started;
        if (!res.ok) {
          console.error(
            `[enrichment_orchestrator] task=${task} failed status=${res.status} ms=${ms} body=${text.slice(0, 500)}`,
          );
          // Fire-and-forget escalation row so /admin/health/alerts shows
          // each downstream failure (not just the orchestrator's own
          // cron_runs row, which would say "ok" because the orchestrator
          // itself didn't throw).
          await raiseAlert({
            source: `orchestrator:${task}`,
            severity: "error",
            message: `Sub-task ${task} returned HTTP ${res.status} after ${ms}ms`,
            payload: {
              task,
              url: childUrl,
              status: res.status,
              duration_ms: ms,
              body_excerpt: text.slice(0, 500),
            },
          });
        }
        return { task, ok: res.ok, status: res.status, ms, body: text.slice(0, 500) };
      } catch (err) {
        const ms = Date.now() - started;
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[enrichment_orchestrator] task=${task} threw after ${ms}ms: ${message}`);
        // Same escalation path for thrown errors (timeout, abort, DNS, etc).
        // We swallow the raiseAlert promise's own failures inside the helper
        // so this can never double-throw and hide the original error.
        await raiseAlert({
          source: `orchestrator:${task}`,
          severity: "error",
          message: `Sub-task ${task} threw after ${ms}ms: ${message}`,
          payload: {
            task,
            url: childUrl,
            duration_ms: ms,
            error: message,
          },
        });
        throw err;
      }
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

export const GET = withCronTelemetry("/api/cron/enrichment_orchestrator", GET_handler);
