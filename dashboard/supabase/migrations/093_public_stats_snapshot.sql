-- 093: pre-computed snapshot for /api/public/stats
--
-- /api/public/stats was running 12 parallel count(*) queries on every
-- request (cached at the Vercel edge for 5 min, but the underlying queries
-- still hit Supabase on every revalidation). On large tables like
-- opportunities (60k rows) some of those count(*) calls timed out silently
-- — that's what made `federal_opps` return 0 in production for hours on
-- 2026-05-27 (fixed temporarily with count="estimated" in commit 8ea69f20).
--
-- This pre-computed snapshot replaces all 12 queries with a single SELECT
-- of one row. The snapshot is refreshed every 10 min by a dedicated cron.

create table if not exists public.public_stats_snapshot (
    id           int primary key default 1,
    payload      jsonb not null,
    computed_at  timestamptz not null default now(),
    -- Singleton — exactly one row, ever. Enforced via partial unique +
    -- the explicit default-1 primary key.
    constraint public_stats_snapshot_singleton check (id = 1)
);

-- Seed an empty payload so the first read doesn't 404. The compute cron
-- will overwrite it on first run.
insert into public.public_stats_snapshot (id, payload, computed_at)
values (1, '{}'::jsonb, now())
on conflict (id) do nothing;

-- RLS: payload is anonymous/public anyway (no PII, big-number aggregates)
-- so leave open to anon read. Writes go through service_role.
alter table public.public_stats_snapshot enable row level security;
drop policy if exists public_stats_snapshot_read on public.public_stats_snapshot;
create policy public_stats_snapshot_read
    on public.public_stats_snapshot
    for select
    to anon, authenticated
    using (true);
