-- ============================================================
-- Migration 057 — pg_cron + pg_net triggers for bulk enrichment
-- ============================================================
-- Why: Vercel's cron scheduler silently failed to register the
--      bulk_enrich_* crons added in vercel.json. Supabase pg_cron
--      fires the same routes reliably every 15/30 min.
--
-- Prereq (already applied via MCP in this session):
--   CREATE EXTENSION pg_cron;
--   CREATE EXTENSION pg_net;
--
-- Manual step after apply: insert the service key once:
--   INSERT INTO public.internal_config (key, value)
--   VALUES ('supabase_service_key', '<paste service role JWT>')
--   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
-- ============================================================

CREATE TABLE IF NOT EXISTS public.internal_config (
    key        text PRIMARY KEY,
    value      text NOT NULL,
    updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.internal_config ENABLE ROW LEVEL SECURITY;
-- No policies — only service_role can read (bypasses RLS).

CREATE OR REPLACE FUNCTION public.trigger_cron_route(route_path text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    base_url text := 'https://app.capturepilot.com';
    svc_key  text;
    req_id   bigint;
BEGIN
    SELECT value INTO svc_key FROM public.internal_config WHERE key = 'supabase_service_key';
    IF svc_key IS NULL THEN
        RAISE NOTICE 'No supabase_service_key configured; skipping %', route_path;
        RETURN NULL;
    END IF;
    SELECT net.http_get(
        url                  := base_url || route_path,
        headers              := jsonb_build_object('Authorization', 'Bearer ' || svc_key),
        timeout_milliseconds := 280000
    ) INTO req_id;
    RETURN req_id;
END $$;

-- Schedule the 4 enrichment crons from Supabase (idempotent).
DO $$
BEGIN
    PERFORM cron.unschedule('bulk_enrich_descriptions') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='bulk_enrich_descriptions');
    PERFORM cron.unschedule('bulk_enrich_ai')           WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='bulk_enrich_ai');
    PERFORM cron.unschedule('enrich_apollo')            WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='enrich_apollo');
    PERFORM cron.unschedule('naics_stats_weekly')       WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='naics_stats_weekly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule('bulk_enrich_descriptions', '*/15 * * * *',
    $JOB$SELECT public.trigger_cron_route('/api/cron/bulk_enrich_descriptions');$JOB$);
SELECT cron.schedule('bulk_enrich_ai',           '*/30 * * * *',
    $JOB$SELECT public.trigger_cron_route('/api/cron/bulk_enrich_ai');$JOB$);
SELECT cron.schedule('enrich_apollo',            '30 */2 * * *',
    $JOB$SELECT public.trigger_cron_route('/api/cron/enrich_apollo_contractors');$JOB$);
SELECT cron.schedule('naics_stats_weekly',       '0 3 * * 0',
    $JOB$SELECT public.trigger_cron_route('/api/cron/naics_stats_backfill');$JOB$);
