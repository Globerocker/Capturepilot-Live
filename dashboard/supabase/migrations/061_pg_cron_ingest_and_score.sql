-- 061_pg_cron_ingest_and_score.sql
--
-- Vercel's cron scheduler silently stopped firing ingest_sam and
-- score_matches some time around 2026-04-28 — last opp ingested then,
-- no log lines in Vercel since. Backstop both via pg_cron the same way
-- migrations 057/059 backstop the bulk_enrich crons.
--
-- Prereq: migrations 057 + 060 (internal_config + trigger_cron_route()).

DO $$
BEGIN
    PERFORM cron.unschedule('ingest_sam_daily')   WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='ingest_sam_daily');
    PERFORM cron.unschedule('score_matches_daily') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='score_matches_daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 02:00 UTC daily — ingest fresh SAM.gov notices over a 7-day window
SELECT cron.schedule('ingest_sam_daily', '0 2 * * *',
    $JOB$SELECT public.trigger_cron_route('/api/cron/ingest_sam');$JOB$);

-- 03:00 UTC daily — recompute matches against newly-ingested rows
SELECT cron.schedule('score_matches_daily', '0 3 * * *',
    $JOB$SELECT public.trigger_cron_route('/api/cron/score_matches');$JOB$);
