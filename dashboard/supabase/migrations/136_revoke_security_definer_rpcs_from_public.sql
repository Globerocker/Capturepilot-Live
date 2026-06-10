-- Migration 136 — Fix migration 132 (which silently no-op'd)
--
-- Migration 132 used REVOKE EXECUTE FROM anon, authenticated which silently
-- no-ops when the function granted EXECUTE to PUBLIC (anon/authenticated
-- inherit from PUBLIC). The advisor still flagged all 6 functions as
-- anon-executable after 132 ran.
--
-- Fix: REVOKE FROM PUBLIC, anon, authenticated explicitly, then GRANT back
-- to service_role so server-side enrichment + admin tooling still works.

REVOKE EXECUTE ON FUNCTION public.trigger_cron_route(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_cron_route(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO service_role;

REVOKE EXECUTE ON FUNCTION public.purge_old_activity_log() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_old_activity_log() TO service_role;

REVOKE EXECUTE ON FUNCTION public.compute_naics_market_stats(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_naics_market_stats(integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.enqueue_marketing_lead_apollo() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_marketing_lead_apollo() TO service_role;

REVOKE EXECUTE ON FUNCTION public.enqueue_marketing_leads_apollo_backfill(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_marketing_leads_apollo_backfill(integer) TO service_role;
