-- Migration 078 — richer extraction targets for state/county/city opps.
--
-- The first-generation extractor (migration 076 + extract-contacts.ts) pulled
-- emails, phones, and URLs from description text. The user's next ask:
--   - estimated value (single value or range)
--   - opportunity class (prime contract vs subcontract vs teaming)
--   - government office mentions (sub-agencies / contracting offices)
--
-- These get populated inline by ingest_rss + ingest_socrata at insert time
-- and backfilled by the backfill_extracted_contacts cron route (extended in
-- the same commit).

alter table opportunities
  add column if not exists estimated_value_min     numeric,
  add column if not exists estimated_value_max     numeric,
  add column if not exists estimated_value_text    text,
  add column if not exists is_subcontract          boolean,
  add column if not exists opportunity_class       text,        -- 'prime' | 'subcontract' | 'teaming'
  add column if not exists extracted_offices       text[];

-- Index for opp-class filtering on the matches page (small selectivity, but
-- worth it for the SLED-heavy queries since prime vs sub is a common filter).
create index if not exists opportunities_opp_class_idx
  on opportunities (opportunity_class)
  where opportunity_class is not null;
