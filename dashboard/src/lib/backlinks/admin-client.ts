/**
 * Shared service-key Supabase client + agent-run logger for backlink crons
 * and admin routes. Keeps the cron files free of boilerplate.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _admin: SupabaseClient | null = null;
export function adminSupabase(): SupabaseClient {
  if (_admin) return _admin;
  _admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { persistSession: false } },
  );
  return _admin;
}

export type AgentName =
  | "prospect_discovery"
  | "contact_enrichment"
  | "outreach_drafter"
  | "link_monitor"
  | "disavow_generator";

export async function recordAgentRun(
  name: AgentName,
  status: "success" | "failure" | "partial",
  summary: Record<string, unknown>,
  durationMs: number,
) {
  await adminSupabase()
    .from("backlink_agents")
    .update({
      last_run_at: new Date().toISOString(),
      last_run_status: status,
      last_run_summary: summary,
      last_run_duration_ms: durationMs,
    })
    .eq("name", name);
}

export function authorizeCron(authHeader: string | null): boolean {
  if (!process.env.CRON_SECRET) return true; // dev mode — allow
  const expectedCron = `Bearer ${process.env.CRON_SECRET}`;
  const expectedSvc = process.env.SUPABASE_SERVICE_KEY ? `Bearer ${process.env.SUPABASE_SERVICE_KEY}` : null;
  return authHeader === expectedCron || authHeader === expectedSvc;
}
