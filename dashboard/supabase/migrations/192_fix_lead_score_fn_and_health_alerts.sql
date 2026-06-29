-- 192_fix_lead_score_fn_and_health_alerts.sql
--
-- Two production breakages found via Vercel runtime errors (2026-06-29) and
-- applied directly to prod via the Supabase Management API the same day:
--
--   1. /api/cron/recompute_lead_scores 500'd 48x over 18 days with
--      "Could not find the function public.recently_engaged_contact_ids".
--      The function was declared in migration 153 but 153 was never applied to
--      prod. Its dependency tables (outreach_engagement_events,
--      outreach_lead_scores) do exist, so we recreate the function verbatim.
--
--   2. raiseAlert() in src/lib/health-alerts.ts speaks the older 075
--      "connector_slug / alert_type / title / detail / payload" vocabulary, but
--      the live health_alerts table is the 145 "recipe" schema and has recipe
--      NOT NULL. Every alert insert failed ("Could not find the 'alert_type'
--      column"), and the same columns are READ by /admin/connectors, self_heal,
--      and health-autoheal.ts. Make health_alerts a superset of both
--      vocabularies so every writer and reader works against one table.

-- 1. recently_engaged_contact_ids (verbatim from migration 153) ---------------
CREATE OR REPLACE FUNCTION public.recently_engaged_contact_ids(p_window_minutes INTEGER DEFAULT 60)
RETURNS TABLE (contact_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT DISTINCT contact_id
    FROM public.outreach_engagement_events
    WHERE captured_at >= NOW() - make_interval(mins => GREATEST(p_window_minutes, 1));
$$;

REVOKE EXECUTE ON FUNCTION public.recently_engaged_contact_ids(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.recently_engaged_contact_ids(INTEGER) TO service_role;

COMMENT ON FUNCTION public.recently_engaged_contact_ids(INTEGER) IS
    'Returns contact_ids with at least one engagement event in the last N minutes (default 60). Used by /api/cron/recompute_lead_scores. Recreated in 192 after 153 was never applied to prod.';

-- 2. health_alerts: superset of the recipe-schema (145) and the
--    connector/alert_type schema (075 / src/lib/health-alerts.ts) -------------
ALTER TABLE public.health_alerts ALTER COLUMN recipe DROP NOT NULL;
ALTER TABLE public.health_alerts ADD COLUMN IF NOT EXISTS alert_type     text;
ALTER TABLE public.health_alerts ADD COLUMN IF NOT EXISTS connector_slug text;
ALTER TABLE public.health_alerts ADD COLUMN IF NOT EXISTS title          text;
ALTER TABLE public.health_alerts ADD COLUMN IF NOT EXISTS detail         text;
ALTER TABLE public.health_alerts ADD COLUMN IF NOT EXISTS payload        jsonb;
ALTER TABLE public.health_alerts ADD COLUMN IF NOT EXISTS emailed        boolean DEFAULT false;

-- Tell PostgREST about the new function + columns immediately.
NOTIFY pgrst, 'reload schema';
