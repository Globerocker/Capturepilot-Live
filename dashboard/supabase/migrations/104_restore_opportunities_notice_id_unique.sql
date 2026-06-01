-- Restore the UNIQUE constraint on opportunities.notice_id.
--
-- SAM-ingest cron has been silently failing for ~48 hours with:
--   "there is no unique or exclusion constraint matching the ON CONFLICT
--    specification"
--
-- The constraint was almost certainly dropped during the CLEANUP.sql / index
-- consolidation work earlier this week. Without it, the ingest_sam upsert
-- (`onConflict: "notice_id"`) can't reconcile and the daily fetch silently
-- inserts zero rows. Opportunities table count was flat at 66,224 since
-- 2026-05-30.
--
-- Steps in this migration:
--   1) Dedupe — collapse any notice_id duplicates by keeping the most-recently-
--      created row. The upsert path normally prevents this, but since the
--      window with no constraint may have allowed dupes through some other
--      path (admin imports, retries, etc.), we sweep them out first.
--   2) Create the unique constraint via a unique index (lets us use
--      `CREATE UNIQUE INDEX CONCURRENTLY` if needed in the future and is
--      what PostgREST/`onConflict` needs).
--
-- After this lands, /api/cron/ingest_sam will start inserting new opps again
-- on its 00:30 UTC schedule. Manual trigger via curl is also fine.

-- Step 1: Dedupe — keep the row with the latest created_at per notice_id.
-- ctid-based dedupe is fast because it lets Postgres pick a physical row
-- ordering without a sort spill. The IS NOT NULL filter avoids accidentally
-- collapsing every NULL notice_id row (shouldn't be any, but safe).
delete from opportunities a
using opportunities b
where a.ctid < b.ctid
  and a.notice_id is not null
  and a.notice_id = b.notice_id;

-- Step 2: Add the unique index that PostgREST onConflict resolves against.
create unique index if not exists opportunities_notice_id_unique_idx
    on opportunities (notice_id)
    where notice_id is not null;

-- Make the index visible to PostgREST's schema cache so onConflict matches.
notify pgrst, 'reload schema';
