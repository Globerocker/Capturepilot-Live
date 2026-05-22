-- Add `awaiting_confirmation` to the company_analyses.status check constraint.
--
-- The mid-funnel confirmation step (introduced 2026-05-18) writes
-- status='awaiting_confirmation' when the pipeline pauses for the user to
-- review/correct what the crawler found. The status constraint was last
-- updated in migration 021 and never picked up the new value, so the
-- atomic update was being silently rejected by Postgres while the
-- Supabase JS client returned success (we never checked .error). Result:
-- every Quick Checker run sat pinned at status='classifying' forever
-- with no error_message.
--
-- We keep the legacy 'awaiting_naics_selection' value too in case any
-- historical rows still reference it.

ALTER TABLE company_analyses DROP CONSTRAINT IF EXISTS company_analyses_status_check;

ALTER TABLE company_analyses ADD CONSTRAINT company_analyses_status_check
  CHECK (status IN (
    'crawling',
    'enriching',
    'classifying',
    'awaiting_confirmation',
    'awaiting_naics_selection',
    'finding_opportunities',
    'scoring',
    'finding_competitors',
    'generating',
    'complete',
    'error'
  ));
