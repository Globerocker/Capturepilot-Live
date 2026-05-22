-- ============================================================
-- Migration 066: rss_sources seed table for state/local procurement feeds
-- ============================================================
-- Most state/local procurement portals (Bonfire, OpenGov, BidNet, agency-
-- direct RSS) publish opportunities as public RSS. We poll each feed daily,
-- normalize the entries into the existing `opportunities` table, and dedupe
-- by source-prefixed notice_id.
--
-- This table is a per-row config of feeds we know about. Adding a new feed
-- = inserting a row. No code change required.
-- ============================================================

create table if not exists public.rss_sources (
    id uuid primary key default gen_random_uuid(),

    -- Where to fetch
    feed_url text not null unique,

    -- How to namespace + display the opportunities we extract
    source_prefix text not null,            -- 'bonfire-ccsd' → notice_id: 'bonfire-ccsd-<hash>'
    provider text not null                  -- 'bonfire' | 'opengov' | 'agency_direct' | 'other'
        check (provider in ('bonfire', 'opengov', 'periscope', 'bidnet', 'demandstar', 'agency_direct', 'other')),

    -- Display metadata for the UI (helps users understand WHERE the opp came from)
    agency_name text,
    agency_type text default 'SLED',        -- 'SLED' / 'State' / 'Local' / 'Education' / 'Federal'
    state text,                             -- 2-letter state code
    city text,
    website text,                           -- public landing page

    -- Runtime
    enabled boolean not null default true,
    last_fetched_at timestamptz,
    last_status text,                       -- 'ok' / 'http_404' / 'parse_error' / etc
    last_count integer default 0,           -- items in the most recent successful fetch
    consecutive_failures integer not null default 0,

    notes text,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create index if not exists idx_rss_sources_enabled on public.rss_sources(enabled) where enabled = true;
create index if not exists idx_rss_sources_provider on public.rss_sources(provider);
create index if not exists idx_rss_sources_state on public.rss_sources(state) where state is not null;

-- Auto-update updated_at
create or replace function public.tg_rss_sources_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists tg_rss_sources_updated_at on public.rss_sources;
create trigger tg_rss_sources_updated_at
    before update on public.rss_sources
    for each row execute function public.tg_rss_sources_updated_at();

-- ============================================================
-- Seed: known US Bonfire portals
-- These ALL serve public RSS at /opportunities/rss with no auth.
-- ============================================================
insert into public.rss_sources (feed_url, source_prefix, provider, agency_name, agency_type, state, city, website) values
    ('https://ccsd.bonfirehub.com/opportunities/rss', 'bonfire-ccsd', 'bonfire', 'Clark County School District', 'Education', 'NV', 'Las Vegas', 'https://ccsd.bonfirehub.com/portal/'),
    ('https://cobbk12.bonfirehub.com/opportunities/rss', 'bonfire-cobbk12', 'bonfire', 'Cobb County School District', 'Education', 'GA', 'Marietta', 'https://cobbk12.bonfirehub.com/portal/'),
    ('https://cherokeek12.bonfirehub.com/opportunities/rss', 'bonfire-cherokeek12', 'bonfire', 'Cherokee County School District', 'Education', 'GA', 'Canton', 'https://cherokeek12.bonfirehub.com/portal/'),
    ('https://bcsdk12.bonfirehub.com/opportunities/rss', 'bonfire-bcsdk12', 'bonfire', 'Bibb County School District', 'Education', 'GA', 'Macon', 'https://bcsdk12.bonfirehub.com/portal/'),
    ('https://ccsdnm.bonfirehub.com/opportunities/rss', 'bonfire-ccsdnm', 'bonfire', 'Central Consolidated School District', 'Education', 'NM', 'Kirtland', 'https://ccsdnm.bonfirehub.com/portal/'),
    ('https://u-46.bonfirehub.com/opportunities/rss', 'bonfire-u46', 'bonfire', 'School District U-46', 'Education', 'IL', 'Elgin', 'https://u-46.bonfirehub.com/portal/'),
    ('https://fsd1.bonfirehub.com/opportunities/rss', 'bonfire-fsd1', 'bonfire', 'Florence School District 1', 'Education', 'SC', 'Florence', 'https://fsd1.bonfirehub.com/portal/'),
    ('https://pwcs.bonfirehub.com/opportunities/rss', 'bonfire-pwcs', 'bonfire', 'Prince William County Schools', 'Education', 'VA', 'Manassas', 'https://pwcs.bonfirehub.com/portal/'),
    ('https://fultonschools.bonfirehub.com/opportunities/rss', 'bonfire-fultonschools', 'bonfire', 'Fulton County Schools', 'Education', 'GA', 'Atlanta', 'https://fultonschools.bonfirehub.com/portal/'),
    ('https://rockdaleschools.bonfirehub.com/opportunities/rss', 'bonfire-rockdale', 'bonfire', 'Rockdale County School District', 'Education', 'GA', 'Conyers', 'https://rockdaleschools.bonfirehub.com/portal/')
on conflict (feed_url) do nothing;

comment on table public.rss_sources is
    'Seed list of public RSS feeds for state/local procurement opportunities. The /api/cron/ingest_rss route polls every enabled row daily and writes results into the opportunities table prefixed with `source_prefix`.';
