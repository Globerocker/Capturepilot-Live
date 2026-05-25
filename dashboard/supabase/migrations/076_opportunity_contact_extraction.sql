-- State / county / city RFPs bury POC info in the description text — phone,
-- email, and the agency procurement portal URL are rarely in dedicated
-- fields the way SAM.gov POCs are. This migration adds extracted-contact
-- arrays that the ingest_rss path (and a backfill admin endpoint) populate
-- via regex extraction from the description. The detail page then surfaces
-- them in the contact panel when no structured contacts exist on the row.

alter table opportunities
  add column if not exists extracted_emails text[],
  add column if not exists extracted_phones text[],
  add column if not exists extracted_urls   text[],
  add column if not exists extracted_at     timestamptz;

-- Useful for spotting which rows still need backfill (extracted_at is null).
create index if not exists opportunities_extracted_at_idx
  on opportunities (extracted_at)
  where extracted_at is null;
