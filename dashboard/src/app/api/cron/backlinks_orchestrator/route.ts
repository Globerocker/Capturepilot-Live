import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/backlinks/admin-client";
import { withCronTelemetry } from "@/lib/cron-telemetry";

export const maxDuration = 300;

/**
 * Single Vercel cron that drives all 5 backlink agents. Avoids hitting
 * the 40-cron Pro-plan ceiling and keeps the schedule editable in code.
 *
 * Wired to `0 6 * * *` (daily 06:00 UTC). Internally decides who runs based
 * on day-of-week + an optional `?agent=name` override for manual debugging.
 *
 *   Mon  → prospect_discovery, contact_enrichment, link_monitor, disavow_generator
 *   Tue–Fri → contact_enrichment, outreach_drafter
 *   Sat/Sun → nothing (lets reply rate normalize)
 */

const AGENT_CRONS = {
  prospect_discovery: "backlink_prospect_discovery",
  contact_enrichment: "backlink_contact_enrichment",
  outreach_drafter: "backlink_outreach_drafter",
  link_monitor: "backlink_link_monitor",
  disavow_generator: "backlink_disavow",
} as const;

type AgentName = keyof typeof AGENT_CRONS;

const SCHEDULE: Record<number, AgentName[]> = {
  0: [],                                                                  // Sun
  1: ["prospect_discovery", "contact_enrichment", "link_monitor", "disavow_generator"], // Mon
  2: ["contact_enrichment", "outreach_drafter"],                          // Tue
  3: ["contact_enrichment", "outreach_drafter"],                          // Wed
  4: ["contact_enrichment", "outreach_drafter"],                          // Thu
  5: ["contact_enrichment", "outreach_drafter"],                          // Fri
  6: [],                                                                  // Sat
};

async function GET_handler(req: NextRequest) {
  if (!authorizeCron(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const base = `${url.protocol}//${url.host}`;
  const headers: Record<string, string> = {};
  if (process.env.CRON_SECRET) headers.authorization = `Bearer ${process.env.CRON_SECRET}`;

  const override = url.searchParams.get("agent") as AgentName | null;
  const agents = override
    ? (AGENT_CRONS[override] ? [override] : [])
    : SCHEDULE[new Date().getUTCDay()];

  const results: Record<string, unknown> = {};
  for (const agent of agents) {
    try {
      const res = await fetch(`${base}/api/cron/${AGENT_CRONS[agent]}`, { headers, cache: "no-store" });
      results[agent] = res.ok ? await res.json() : { error: `HTTP ${res.status}` };
    } catch (err) {
      results[agent] = { error: (err as Error).message };
    }
  }

  return NextResponse.json({ ok: true, day_utc: new Date().getUTCDay(), agents_run: agents, results });
}

export const GET = withCronTelemetry("/api/cron/backlinks_orchestrator", GET_handler);
