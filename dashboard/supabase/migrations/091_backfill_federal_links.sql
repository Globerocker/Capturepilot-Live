-- 091: Backfill missing `link` on federal opportunities
--
-- Audit 2026-05-27: 17,227 of 28,416 active federal opps (60%) had NULL link.
-- The active ingestion code already constructs the link from noticeId (see
-- dashboard/src/app/api/cron/ingest_sam/route.ts line ~206), but historical
-- rows ingested BEFORE that fix landed are stuck with NULL.
--
-- This backfills them in-place: SAM.gov's stable URL for any opportunity is
-- `https://sam.gov/opp/{noticeId}/view`. Idempotent — only touches rows
-- where link IS NULL and notice_id IS NOT NULL.

update public.opportunities
set link = 'https://sam.gov/opp/' || notice_id || '/view'
where source = 'sam'
  and link is null
  and notice_id is not null;
