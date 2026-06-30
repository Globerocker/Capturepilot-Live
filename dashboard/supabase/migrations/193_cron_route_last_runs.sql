-- 193_cron_route_last_runs.sql
-- Applied to prod via Supabase Management API on 2026-06-30; this file is the record.
--
-- Last run per cron route (distinct-on), all-time. The daily digest
-- (send_daily_digest) used to pull the latest 200 cron_runs rows and dedupe in
-- JS to find each route's last run. With ~12k runs/day those 200 rows span only
-- minutes, so it saw ~9 high-frequency routes and false-alarmed "[Silent
-- platform] only 9/35 routes logged" even while 1,438 opps and 37 routes ran.
-- This RPC returns the true last run per route in one cheap call.
CREATE OR REPLACE FUNCTION public.cron_route_last_runs()
RETURNS TABLE (route text, last_run timestamptz, last_status text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT DISTINCT ON (route) route, started_at, status
    FROM public.cron_runs
    ORDER BY route, started_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.cron_route_last_runs() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.cron_route_last_runs() TO service_role;
