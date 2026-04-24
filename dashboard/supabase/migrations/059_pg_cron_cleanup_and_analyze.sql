-- 059_pg_cron_cleanup_and_analyze.sql
--
-- Backup schedules in pg_cron for db_cleanup (weekly) and analyze_match_attachments
-- (every 20 min). Vercel's cron has been unreliable — pg_cron fires the same
-- routes reliably with the service-key bearer path.
--
-- Prereq: migration 057 created internal_config + trigger_cron_route().

DO $$
BEGIN
    PERFORM cron.unschedule('db_cleanup_weekly')          WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='db_cleanup_weekly');
    PERFORM cron.unschedule('analyze_match_attachments')  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='analyze_match_attachments');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Sunday 04:00 UTC — same slot as vercel.json, acts as redundant trigger
SELECT cron.schedule('db_cleanup_weekly', '0 4 * * 0',
    $JOB$SELECT public.trigger_cron_route('/api/cron/db_cleanup');$JOB$);

-- Every 20 min — processes 4 opps × 3 docs = 12 SAM docs/run
SELECT cron.schedule('analyze_match_attachments', '*/20 * * * *',
    $JOB$SELECT public.trigger_cron_route('/api/cron/analyze_match_attachments');$JOB$);
