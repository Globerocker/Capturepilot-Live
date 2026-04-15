-- ============================================================
-- Migration 034: Government-contracting keyword library
-- ============================================================
-- Why: NAICS alone misses niches (e.g. "body armor" has no dedicated
-- NAICS). We maintain a curated library of contract-relevant keywords
-- mined from existing opportunities (titles + descriptions), and let
-- user profiles pick up to 3 primary + 5 secondary keywords from it.
-- The scorer uses these to (a) substitute weight when NAICS confidence
-- is low, and (b) refine matching on opps where NAICS already matches.
-- ============================================================

create table if not exists public.gov_keywords (
    keyword        text primary key,                  -- canonical lowercase, e.g. "body armor"
    display_label  text not null,                     -- human-cased, e.g. "Body Armor"
    category       text,                              -- 'defense' | 'it' | 'construction' | 'facilities' | ...
    aliases        text[] not null default '{}',      -- variants: ["body armour", "ballistic vest"]
    frequency      integer not null default 0,        -- count across opportunity titles + descriptions
    title_frequency integer not null default 0,       -- higher-signal: mentions in titles only
    source         text not null default 'mined'
        check (source in ('mined', 'ai', 'manual')),
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

create index if not exists idx_gov_keywords_category on public.gov_keywords(category);
create index if not exists idx_gov_keywords_frequency on public.gov_keywords(frequency desc);
create index if not exists idx_gov_keywords_aliases on public.gov_keywords using gin(aliases);

alter table public.gov_keywords enable row level security;

drop policy if exists "gov_keywords read" on public.gov_keywords;
create policy "gov_keywords read"
    on public.gov_keywords
    for select
    to authenticated
    using (true);

comment on table public.gov_keywords is
    'Curated keyword library for matching companies to federal opportunities. Seeded from opportunity title/description n-grams, optionally clustered via AI. Read-only to authenticated users; writes via service role.';

-- ------------------------------------------------------------
-- user_profiles: primary + secondary keyword selections
-- ------------------------------------------------------------
-- Stored as text[] of canonical keywords (gov_keywords.keyword values).
-- Caps (3 primary, 5 secondary) enforced in the app layer — cheaper
-- to update a cap than to run an ALTER TABLE on a check constraint.

do $$ begin
    alter table public.user_profiles
        add column primary_keywords text[] not null default '{}';
exception when duplicate_column then null;
end $$;

do $$ begin
    alter table public.user_profiles
        add column secondary_keywords text[] not null default '{}';
exception when duplicate_column then null;
end $$;

comment on column public.user_profiles.primary_keywords is
    'Up to 3 canonical keywords (gov_keywords.keyword) representing the company''s strongest capability signals. Used by the scorer at full weight.';
comment on column public.user_profiles.secondary_keywords is
    'Up to 5 canonical keywords (gov_keywords.keyword) for refinement. Used by the scorer at reduced weight (~0.4 of primary).';
