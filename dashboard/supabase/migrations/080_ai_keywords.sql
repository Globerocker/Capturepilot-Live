-- Migration 080 — AI-extracted keywords for matching + filtering UX.
--
-- The opportunity description is the single richest signal we have about
-- what work the contract covers, but most rows don't have NAICS codes (SLED
-- portals don't publish them) and our regex keyword extractor surfaces
-- stopwords more often than real signal.
--
-- This migration adds an `extracted_keywords text[]` column populated by a
-- cheap LLM (gpt-4o-mini @ $0.0002/row → ~$6 for the full corpus). The
-- matches page renders these as fast click-to-filter chips and the matching
-- scorer can use them as supplemental signal alongside the user's profile
-- keywords.

alter table opportunities
  add column if not exists extracted_keywords         text[],
  add column if not exists keywords_extracted_at      timestamptz,
  add column if not exists keywords_extraction_model  text;

-- GIN index on the array column → fast "contains any of these keywords"
-- filters from the matches UI without a table-scan.
create index if not exists opportunities_extracted_keywords_idx
  on opportunities using gin (extracted_keywords);

-- Marker for the backfill cron to find the punch-list of rows to process.
create index if not exists opportunities_keywords_pending_idx
  on opportunities (keywords_extracted_at)
  where keywords_extracted_at is null;
