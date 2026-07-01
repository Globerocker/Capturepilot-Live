-- 194_cron_route_cadence.sql
-- Applied to prod via Supabase Management API on 2026-07-01; this file is the record.
--
-- Per-route last run + status + 30-day run count. The daily digest infers each
-- route's OWN cadence (30d / runs_30d) and flags "stale" only past ~2.5x that,
-- instead of a flat 26h threshold that falsely flagged every weekly cron
-- (db_cleanup, naics_stats_backfill, the VPS FPDS/subawards/GSA/CALC timers,
-- market_watch_digest, recompete_scan — all run every 7-10 days).
CREATE OR REPLACE FUNCTION public.cron_route_cadence()
RETURNS TABLE (route text, last_run timestamptz, last_status text, runs_30d bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT DISTINCT ON (route)
        route,
        max(started_at) OVER (PARTITION BY route)                             AS last_run,
        first_value(status) OVER (PARTITION BY route ORDER BY started_at DESC) AS last_status,
        count(*) FILTER (WHERE started_at > now() - interval '30 days') OVER (PARTITION BY route) AS runs_30d
    FROM public.cron_runs
    ORDER BY route, started_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.cron_route_cadence() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.cron_route_cadence() TO service_role;
