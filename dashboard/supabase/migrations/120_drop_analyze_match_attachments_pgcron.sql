-- 120_drop_analyze_match_attachments_pgcron.sql
-- Fix: the standalone /api/cron/analyze_match_attachments Vercel route was
-- deleted on 2026-06-08 because its task name collided with the per-opp
-- `analyze_attachments` worker_jobs handler in /api/cron/run_worker_jobs.
-- Migration 059 had scheduled a pg_cron backup hitting that route every 20
-- minutes; with the route gone, every firing now 404s. Unschedule it here.
-- The work is still covered: the opportunities-insert trigger enqueues
-- `analyze_attachments` jobs and run_worker_jobs drains them.

do $$
begin
    if exists (select 1 from cron.job where jobname = 'analyze_match_attachments') then
        perform cron.unschedule('analyze_match_attachments');
    end if;
end$$;
