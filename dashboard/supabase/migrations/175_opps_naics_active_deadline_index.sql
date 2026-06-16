-- 175_opps_naics_active_deadline_index.sql
--
-- The Match-Drop scoring lane (enrich_contractor_matches) runs one
-- opportunities query per contractor:
--   .in("naics_code", contractor.naics_codes)
--   .neq("is_archived", true)
--   .or("response_deadline.is.null,response_deadline.gte.<now>")
--   .order("response_deadline")
-- There was NO index on opportunities.naics_code, so every call sequentially
-- scanned the ~47k active rows. With batch=20 contractors per orchestrator tick,
-- that was the "DB-heavy" cost that contributed to the 2026-06-16 overload and
-- the reason the lane was disabled.
--
-- This partial composite index turns the per-contractor query into an index scan
-- (equality on naics_code from the IN-list, response_deadline pre-sorted for the
-- range filter + ORDER BY). Partial on is_archived = false because the query
-- always excludes archived rows and active is only ~57% of the table.
--
-- Created CONCURRENTLY on the live DB (no table lock); restated here without
-- CONCURRENTLY so it replays inside a migration transaction on fresh envs.
create index if not exists idx_opps_naics_active_deadline
on public.opportunities (naics_code, response_deadline)
where is_archived = false;
