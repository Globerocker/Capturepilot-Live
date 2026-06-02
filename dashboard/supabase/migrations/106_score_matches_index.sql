-- Partial index supporting the score_matches scan pattern.
--
-- The cron pages through opportunities with:
--   WHERE is_archived = false AND status != 'EXPIRED'
--   ORDER BY id ASC
--   LIMIT 200
--
-- Without a matching index, Postgres does a full table scan on each page
-- (now 65k+ rows with 5-30KB description/JSONB columns each), which hits
-- the Supabase 30s statement timeout on the very first page.
--
-- This partial index covers just the active subset of rows (~30% of the
-- table — most rows are EXPIRED or archived) and keeps them ordered by id
-- so keyset pagination is an index-only traversal.

create index concurrently if not exists opportunities_score_matches_idx
    on opportunities (id)
    where is_archived = false and status <> 'EXPIRED';

-- After this lands:
--   /api/cron/score_matches stops timing out on its first page fetch
--   Re-run via curl /api/cron/score_matches (Bearer CRON_SECRET) to verify
