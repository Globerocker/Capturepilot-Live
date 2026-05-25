-- Migration 081 — Programmatic SEO contractor pages.
--
-- Per-contractor public landing pages at www.capturepilot.com/contractors/<slug>.
-- Goal: rank in Google for "<contractor name> federal contracts" queries +
-- act as a lead funnel via the "Claim this profile" CTA.
--
-- Pipeline:
--   1. publish_contractor_pages cron picks N contractors with award history
--   2. Apollo enriches company + key contacts
--   3. gpt-4o-mini generates a 2-3 paragraph context summary
--   4. Badge calculator runs nightly: NAICS rank, state rank, Federal Score
--   5. Row inserted with published_at = now(); sitemap includes the slug
--
-- 8K contractors are eligible (those with FPDS award history). Pilot = top 3,
-- then top 500, then 10/day drip via cron. Aggregator pages
-- (/contractors/in/<naics-label>) point at the highest-ranked rows.

create table if not exists contractor_profile_pages (
    id                       uuid primary key default gen_random_uuid(),

    -- Source row
    contractor_uei           text not null unique,        -- references contractors.uei (but no FK — contractors table doesn't have unique constraint on uei)

    -- URL slug (kebab-case, dedupe-safe). Generated from business name.
    slug                     text not null unique,

    -- Canonical content fields
    business_name            text not null,
    primary_naics            text,
    state                    text,
    city                     text,
    cage_code                text,
    sam_registered           boolean,
    sba_certifications       text[],

    -- Award rollup (denormalized from awards/contractors tables for fast page render)
    total_awarded_amount     numeric default 0,
    total_awards_count       int default 0,
    top_agency               text,
    top_agency_amount        numeric,
    awards_by_year           jsonb,                       -- [{year: 2024, value: 1234567, count: 4}, ...]
    top_naics_codes          text[],                      -- top 5 NAICS this contractor has won under

    -- AI / Apollo enrichment payloads
    ai_summary               text,                        -- 2-3 paragraph generated context
    ai_summary_model         text,                        -- 'gpt-4o-mini', 'deepseek-chat', etc.
    apollo_data              jsonb,                       -- raw Apollo company payload
    company_website          text,
    company_linkedin         text,
    company_size_est         text,                        -- '1-10', '11-50', etc.
    industry                 text,
    founded_year             int,

    -- Gamification / badges
    federal_score            int,                         -- 0-100 composite
    score_breakdown          jsonb,                       -- {awards:30, certs:20, ...}
    naics_rank               int,                         -- rank within primary_naics
    state_rank               int,                         -- rank within state
    naics_total              int,                         -- total contractors in this NAICS (for "rank #X of Y")
    state_total              int,
    badges                   text[],                      -- ['top_10_naics', 'multi_agency', 'sdvosb_leader', ...]

    -- Page lifecycle
    is_published             boolean not null default false,
    published_at             timestamptz,
    last_recalc_at           timestamptz,
    view_count               int default 0,
    claim_email              text,                        -- set when contractor "claims" via the funnel
    claimed_at               timestamptz,

    -- Backlink-outreach state (drafted only, NOT sent until user approves template)
    outreach_drafted_at      timestamptz,
    outreach_sent_at         timestamptz,
    outreach_replied_at      timestamptz,
    backlink_url             text,                        -- URL where they linked back to us (manual entry for now)

    created_at               timestamptz not null default now(),
    updated_at               timestamptz not null default now()
);

create index if not exists contractor_profile_pages_published_idx
  on contractor_profile_pages (is_published, published_at desc)
  where is_published = true;

create index if not exists contractor_profile_pages_naics_idx
  on contractor_profile_pages (primary_naics, federal_score desc)
  where is_published = true;

create index if not exists contractor_profile_pages_state_idx
  on contractor_profile_pages (state, federal_score desc)
  where is_published = true;

create index if not exists contractor_profile_pages_score_idx
  on contractor_profile_pages (federal_score desc)
  where is_published = true;

-- Public read policy — contractor pages ARE public landing pages, so anon
-- can read all published rows. Unpublished drafts stay admin-only.
alter table contractor_profile_pages enable row level security;

create policy "public_read_published" on contractor_profile_pages
  for select
  to anon, authenticated
  using (is_published = true);
