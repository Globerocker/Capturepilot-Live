-- ════════════════════════════════════════════════════════════════════
-- CapturePilot — OPTIONAL CLEANUP
-- ════════════════════════════════════════════════════════════════════
--
-- Optional bulk cleanup of redundant indexes, dead column references,
-- and overlapping objects found by audit_migrations.py.
--
-- WARNING: Drops indexes — verify each section before running. Each
-- block is gated with explanatory comments. Run sections you trust;
-- skip the rest. Every DROP uses IF EXISTS so this file is safe to
-- re-run.
--
-- Findings audit-trail:
--   1. Duplicate indexes — same name created twice with conflicting defs
--   2. Overlapping indexes — same column(s), multiple names
--   3. Index bloat on opportunities (27 indexes — write-heavy table)
--   4. Dead alters — migrations 012 + 053 try to drop the same columns
--      twice. Already harmless (IF EXISTS) but confusing in history.
-- ════════════════════════════════════════════════════════════════════


-- ──────────────────────────────────────────────────────────────────
-- SECTION 1: Conflicting duplicate indexes (definitely safe to drop)
-- ──────────────────────────────────────────────────────────────────

-- marketing_leads: migration 070 created `marketing_leads_email_magnet_idx`
-- on lower(email), then 074 re-created the SAME NAME on (email, magnet_key).
-- In Postgres the second create silently no-ops because the name already
-- exists — so we have the FIRST definition (lower(email)) but the SECOND
-- definition was the one the code expects. Drop + recreate to fix.
drop index if exists public.marketing_leads_email_magnet_idx;
create unique index if not exists marketing_leads_email_magnet_idx
    on public.marketing_leads (email, magnet_key);

-- worker_jobs: same pattern. 086 + 089 both define `worker_jobs_dedup_active_idx`.
-- 089 is the authoritative one (post-dedup-key column rename). Drop and recreate.
drop index if exists public.worker_jobs_dedup_active_idx;
create index if not exists worker_jobs_dedup_active_idx
    on public.worker_jobs (dedup_key)
    where status in ('pending', 'running');


-- ──────────────────────────────────────────────────────────────────
-- SECTION 2: Overlapping indexes on opportunities (write-perf gain)
-- ──────────────────────────────────────────────────────────────────
-- opportunities has 27 indexes — every INSERT/UPSERT updates all of them.
-- Bulk SAM ingest writes ~5k rows/run; each redundant index adds ~50ms.
-- The ones below are functionally dominated by other indexes:

-- 1. idx_opps_needs_requirements_backfill (068) was a partial index on
--    opportunities(id) WHERE structured_requirements IS NULL — only used
--    by a one-shot backfill cron that's been complete for weeks. Drop it.
drop index if exists public.idx_opps_needs_requirements_backfill;

-- 2. idx_opps_needs_strategic_scoring + idx_opps_needs_ai_strategy (both 068)
--    were partial indexes on opportunities(response_deadline) for two
--    backfill crons. Same backfill-complete situation.
drop index if exists public.idx_opps_needs_strategic_scoring;
drop index if exists public.idx_opps_needs_ai_strategy;

-- 3. idx_opportunities_source_created_at (099) vs idx_opps_active_source_created
--    (102, partial WHERE is_archived=false). The 102 variant dominates for
--    all our hot-path queries (digest, public stats). Drop the full-table 099.
drop index if exists public.idx_opportunities_source_created_at;

-- 4. idx_opportunities_created_at (099) is a full-table index on created_at.
--    102's idx_opps_active_id partial WHERE is_archived=false covers the
--    "active rows" count path; the digest's full-table count is rare.
--    Keep 099 — used by /admin/db-health for archive trend graphs.
--    (No drop here, just documentation.)


-- ──────────────────────────────────────────────────────────────────
-- SECTION 3: Overlapping indexes on contractors
-- ──────────────────────────────────────────────────────────────────
-- 099 added idx_contractors_created_at (full table), 102 added
-- idx_contractors_created_at_active (same column, no partial — they
-- ended up functionally identical). Keep one.
drop index if exists public.idx_contractors_created_at;
-- idx_contractors_created_at_active is kept.


-- ──────────────────────────────────────────────────────────────────
-- SECTION 4: Triple indexes on saved_searches.user_profile_id
-- ──────────────────────────────────────────────────────────────────
-- 015 + 071 both created indexes on the same column. The 071 ones
-- (saved_searches_profile_idx, saved_searches_alert_idx) include
-- additional columns useful for the alerting cron — keep those.
drop index if exists public.idx_saved_searches_user;


-- ──────────────────────────────────────────────────────────────────
-- SECTION 5: fpds_awards triple-UEI indexing
-- ──────────────────────────────────────────────────────────────────
-- Migration 047 created 3 indexes on contractor_uei (mod, term, plain).
-- The mod + term variants are partial indexes for boolean flag queries
-- that we never run. Drop them; keep the base.
drop index if exists public.idx_fpds_uei_mod;
drop index if exists public.idx_fpds_uei_term;


-- ──────────────────────────────────────────────────────────────────
-- SECTION 6: ANALYZE after cleanup so planner picks new index layout
-- ──────────────────────────────────────────────────────────────────
analyze public.opportunities;
analyze public.contractors;
analyze public.marketing_leads;
analyze public.worker_jobs;
analyze public.saved_searches;
analyze public.fpds_awards;


-- ════════════════════════════════════════════════════════════════════
-- POST-RUN CHECK — should print 0 for each:
--
--   select count(*) from pg_indexes
--     where indexname in (
--       'idx_opps_needs_requirements_backfill',
--       'idx_opps_needs_strategic_scoring',
--       'idx_opps_needs_ai_strategy',
--       'idx_opportunities_source_created_at',
--       'idx_contractors_created_at',
--       'idx_saved_searches_user',
--       'idx_fpds_uei_mod',
--       'idx_fpds_uei_term'
--     );
-- ════════════════════════════════════════════════════════════════════
