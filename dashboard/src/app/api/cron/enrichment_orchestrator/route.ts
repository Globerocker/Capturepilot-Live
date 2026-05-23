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
