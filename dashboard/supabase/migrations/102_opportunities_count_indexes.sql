/**
 * Make COUNT queries on the 'active opportunities' subset O(log n).
 *
 * Background: compute_public_stats + send_daily_digest run ~10 different
 * COUNT(*) queries every cycle, all scoped to `is_archived = false`
 * (the ~36k-row 'active' subset of the ~60k-row opportunities table).
 * Without matching indexes Postgres falls back to bitmap heap scans that
 * blow past the default statement_timeout (30s) and return 0 silently —
 * which is why federal_opps was reading 0 on the homepage after big
 * SAM ingests even when the rows were physically present.
 *
 * Strategy: 4 PARTIAL indexes scoped to the active subset. Partial indexes
 * are ~40% smaller and skip the archived rows entirely, so even tiny
 * COUNT operations finish well under the timeout. Column ordering in each
 * index is chosen so Postgres's left-prefix matching covers multiple
 * query shapes from one index.
 *
 * After the indexes are built we run ANALYZE so the planner picks them up
 * immediately instead of waiting for the next autovacuum cycle (which can
 * lag 15+ minutes behind a big insert burst).
 */

-- 1. (source, jurisdiction_level) — covers BOTH source-only counts
--    (Federal / SLED / Grants) AND source+jurisdiction counts (SLED state
--    / county / city / district) via left-prefix index scans.
create index if not exists idx_opps_active_source_jur
    on public.opportunities(source, jurisdiction_level)
    where is_archived = false;

-- 2. (source, created_at DESC) — covers the per-source "new in last 24h"
--    breakdown in send_daily_digest (Federal +X / SLED +Y / Grants +Z).
--    The DESC order matches `ORDER BY created_at DESC` patterns on
--    dashboard pages too, so it doubles as a "recent activity" index.
create index if not exists idx_opps_active_source_created
    on public.opportunities(source, created_at desc)
    where is_archived = false;

-- 3. (posted_date DESC) — covers `new_today` on /api/public/stats which
--    filters by posted_date (when SAM published the notice) rather than
--    created_at (when we ingested it). Distinct enough from #2 to need
--    its own index.
create index if not exists idx_opps_active_posted
    on public.opportunities(posted_date desc)
    where is_archived = false;

-- 4. (id) — total active count without any other filters. Tiny index
--    (uuid pk = 16 bytes per row), enables index-only scans for the
--    homepage live counter. The (1)-expression-index variant we tried
--    earlier compiled but the planner couldn't reliably use it for
--    COUNT(*); indexing the pk works in every Postgres version.
create index if not exists idx_opps_active_id
    on public.opportunities(id)
    where is_archived = false;

-- Same problem on contractors — send_daily_digest counts new contractors
-- by created_at and that hit the same silent-0 issue.
create index if not exists idx_contractors_created_at_active
    on public.contractors(created_at desc);

-- Refresh planner stats so Postgres picks the new indexes immediately
-- instead of waiting for autovacuum (which can lag 15+ min after a burst
-- insert and was the proximate cause of the federal_opps=0 reports).
analyze public.opportunities;
analyze public.contractors;
