-- Migration 104 created a PARTIAL unique index on opportunities.notice_id
-- (WHERE notice_id IS NOT NULL). Partial indexes work for direct SQL upserts
-- when the index predicate is also specified in the ON CONFLICT clause, but
-- PostgREST's REST upsert (?on_conflict=notice_id) doesn't pass the predicate
-- through, so the API still returns:
--   "there is no unique or exclusion constraint matching the ON CONFLICT
--    specification"
--
-- Fix: drop the partial index, create a non-partial unique index. This means
-- the table now allows at most one row with NULL notice_id (acceptable —
-- every real SAM/Grants/HigherGov ingest writes a notice_id, so the NULL
-- slot is effectively unused).

drop index if exists opportunities_notice_id_unique_idx;

-- Sweep any orphaned NULL notice_id rows beyond the first (the new index
-- would otherwise fail on multiple NULLs). Keep the oldest; trash the rest.
delete from opportunities a
using opportunities b
where a.ctid > b.ctid
  and a.notice_id is null
  and b.notice_id is null;

create unique index if not exists opportunities_notice_id_unique_idx
    on opportunities (notice_id);

notify pgrst, 'reload schema';
