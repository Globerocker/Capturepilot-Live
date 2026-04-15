-- Migration 030: per-NAICS market intelligence cache
--
-- Why: the MarketIntelligence reader was calling USASpending.gov live on every
-- opportunity detail render, with a 15s timeout and `.catch(() => null)`. Every
-- slow/failed call silently hid the section. We now pre-compute aggregates for
-- common NAICS codes into this table and read from here; the live call stays as
-- a fallback for niche NAICS.

create table if not exists public.naics_market_stats (
    naics_code text primary key,

    -- Period covered by the aggregate (end_date - years).
    period_years integer not null default 5,
    start_date date not null,
    end_date date not null,

    -- Summary KPIs (match the shape returned by /api/intelligence/market-size).
    total_spend numeric not null default 0,
    avg_yearly_spend numeric not null default 0,
    yoy_growth_pct numeric not null default 0,
    market_trend text not null default 'STABLE', -- GROWING | DECLINING | STABLE

    -- Structured breakdowns (same JSON shape as the live API).
    yearly_spend jsonb not null default '[]'::jsonb,
    top_agencies jsonb not null default '[]'::jsonb,
    top_states jsonb not null default '[]'::jsonb,
    top_sub_agencies jsonb not null default '[]'::jsonb,

    -- Bookkeeping.
    computed_at timestamptz not null default now(),
    refresh_after timestamptz not null default now() + interval '30 days'
);

create index if not exists idx_naics_market_stats_refresh on public.naics_market_stats(refresh_after);

-- RLS: read-only for all authenticated users (aggregate data, not user-specific).
alter table public.naics_market_stats enable row level security;

drop policy if exists "naics_market_stats read" on public.naics_market_stats;
create policy "naics_market_stats read"
    on public.naics_market_stats
    for select
    to authenticated
    using (true);
