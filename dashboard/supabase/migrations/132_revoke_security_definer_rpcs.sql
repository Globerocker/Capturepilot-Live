-- 132: Re-revoke EXECUTE on SECURITY DEFINER RPCs from anon + authenticated
--
-- Addresses platform audit 2026-06-10 finding #1
-- (docs/platform-audit-2026-06-10/02-critical-issues.md §1).
--
-- The Supabase advisor `anon_security_definer_function_executable` still
-- flagged six SECURITY DEFINER functions as callable by the `anon` role
-- via /rest/v1/rpc/ even though migration 090 already revoked three of
-- them. Either a later CREATE OR REPLACE restored the default PUBLIC
-- grant, or the revoke was rolled back by a branch/restore. Two of the
-- six functions (`enqueue_marketing_lead_apollo`,
-- `enqueue_marketing_leads_apollo_backfill`) were added after migration
-- 090 and were never covered.
--
-- Impact if left open (per audit):
--   1. Anonymous attacker can POST `/rest/v1/rpc/trigger_cron_route`
--      with `{"route_path":"/api/cron/whatever"}` to fire ANY cron
--      handler, bypassing CRON_SECRET entirely.
--   2. `purge_old_activity_log()` lets an attacker wipe
--      `client_activity_log` — post-incident audit destruction.
--   3. `enqueue_marketing_lead*` lets an attacker flood the Apollo
--      enrichment queue at attacker-chosen rate, burning paid credits.
--   4. `compute_naics_market_stats(int)` is expensive and unauth-callable
--      → CPU drain.
--   5. `rls_auto_enable()` is an admin maintenance helper that should
--      never be invokable from the public API.
--
-- Fix: REVOKE EXECUTE from anon and authenticated on all six. Each
-- REVOKE is wrapped in a DO block that catches `undefined_function`
-- so the migration is idempotent across environments where some
-- functions may not exist yet (e.g. preview branches).
--
-- service_role retains EXECUTE by default (it is the trusted backend
-- principal used with the service key); no GRANT needed.
--
-- Verify post-deploy by re-running `get_advisors` (Supabase MCP) and
-- confirming `anon_security_definer_function_executable` no longer
-- lists any of the functions below.

-- ---------------------------------------------------------------------------
-- 1. trigger_cron_route(text)
-- ---------------------------------------------------------------------------
do $$
begin
  revoke execute on function public.trigger_cron_route(text) from anon, authenticated;
exception
  when undefined_function then
    raise notice 'function public.trigger_cron_route(text) does not exist — skipping';
end $$;

-- ---------------------------------------------------------------------------
-- 2. rls_auto_enable()
-- ---------------------------------------------------------------------------
do $$
begin
  revoke execute on function public.rls_auto_enable() from anon, authenticated;
exception
  when undefined_function then
    raise notice 'function public.rls_auto_enable() does not exist — skipping';
end $$;

-- ---------------------------------------------------------------------------
-- 3. purge_old_activity_log()
-- ---------------------------------------------------------------------------
do $$
begin
  revoke execute on function public.purge_old_activity_log() from anon, authenticated;
exception
  when undefined_function then
    raise notice 'function public.purge_old_activity_log() does not exist — skipping';
end $$;

-- ---------------------------------------------------------------------------
-- 4. compute_naics_market_stats(integer)
-- ---------------------------------------------------------------------------
do $$
begin
  revoke execute on function public.compute_naics_market_stats(integer) from anon, authenticated;
exception
  when undefined_function then
    raise notice 'function public.compute_naics_market_stats(integer) does not exist — skipping';
end $$;

-- ---------------------------------------------------------------------------
-- 5. enqueue_marketing_lead_apollo()
-- ---------------------------------------------------------------------------
do $$
begin
  revoke execute on function public.enqueue_marketing_lead_apollo() from anon, authenticated;
exception
  when undefined_function then
    raise notice 'function public.enqueue_marketing_lead_apollo() does not exist — skipping';
end $$;

-- ---------------------------------------------------------------------------
-- 6. enqueue_marketing_leads_apollo_backfill(integer)
-- ---------------------------------------------------------------------------
do $$
begin
  revoke execute on function public.enqueue_marketing_leads_apollo_backfill(integer) from anon, authenticated;
exception
  when undefined_function then
    raise notice 'function public.enqueue_marketing_leads_apollo_backfill(integer) does not exist — skipping';
end $$;
