import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/auth-admin";

const AGENT_TO_CRON: Record<string, string> = {
  prospect_discovery: "backlink_prospect_discovery",
  contact_enrichment: "backlink_contact_enrichment",
  outreach_drafter: "backlink_outreach_drafter",
  link_monitor: "backlink_link_monitor",
  disavow_generator: "backlink_disavow",
};

export async function POST(req: NextRequest) {
  const unauth = await assertAdmin();
  if (unauth) return unauth;
  const { agent } = await req.json();
  const cron = AGENT_TO_CRON[agent];
  if (!cron) return NextResponse.json({ error: "unknown agent" }, { status: 400 });

  const url = new URL(req.url);
  const base = `${url.protocol}//${url.host}`;
  const headers: Record<string, string> = {};
  if (process.env.CRON_SECRET) headers.authorization = `Bearer ${process.env.CRON_SECRET}`;

  const res = await fetch(`${base}/api/cron/${cron}`, { headers, cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  return NextResponse.json({ ok: res.ok, agent, result: body });
}
