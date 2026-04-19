-- ============================================================
-- Migration 044 — Capture Intelligence Expansion
-- ============================================================
-- One migration for Sprint 1 + Sprint 2 data expansion. Adds:
--   • labor_rates           (GSA CALC ingestion)
--   • daily_dod_awards      (war.gov daily $7.5M+ DoD contracts)
--   • bid_protests          (GAO Bid Protest decisions)
--   • far_clauses_cache     (eCFR FAR/DFARS clause cache)
--   • federal_hierarchy     (open.gsa.gov FH API snapshot)
--   • capture_briefs        (generated briefs cache — skip re-gen if fresh)
--   • market_watch_searches (saved natural-language searches → weekly digest)
--
-- Also extends tribal_contractors with DSBS fields so the single partner
-- table can hold both the curated seed AND the 300K-row DSBS feed.

-- ------------------------------------------------------------
-- GSA CALC labor rates
-- ------------------------------------------------------------
create table if not exists public.labor_rates (
    id                    bigserial primary key,
    labor_category        text        not null,
    education_level       text,
    min_years_experience  integer,
    contractor_name       text,
    schedule              text,
    sin                   text,
    hourly_rate_year1     numeric(10,2),
    hourly_rate_current   numeric(10,2),
    idv_piid              text,
    business_size         text,
    worksite              text,        -- 'on-site' | 'off-site' | 'both'
    keywords              text,
    source_id             text        not null default 'gsa_calc',
    fetched_at            timestamptz not null default now()
);

create index if not exists idx_labor_rates_category on public.labor_rates using gin (to_tsvector('english', labor_category));
create index if not exists idx_labor_rates_education on public.labor_rates (education_level);
create index if not exists idx_labor_rates_rate on public.labor_rates (hourly_rate_current);

-- ------------------------------------------------------------
-- war.gov Daily DoD Contract Announcements ($7.5M+)
-- ------------------------------------------------------------
create table if not exists public.daily_dod_awards (
    id                uuid primary key default gen_random_uuid(),
    announcement_date date not null,
    contractor_name   text not null,
    contractor_uei    text,
    amount_usd        numeric(15,2),
    location          text,
    agency            text,             -- 'Army' | 'Navy' | 'Air Force' | 'DLA' | 'Missile Defense Agency' | ...
    contract_number   text,
    sow_summary       text,
    source_url        text,
    raw_text          text,
    created_at        timestamptz not null default now()
);

create index if not exists idx_dod_awards_date on public.daily_dod_awards (announcement_date desc);
create index if not exists idx_dod_awards_contractor on public.daily_dod_awards (contractor_uei) where contractor_uei is not null;
create index if not exists idx_dod_awards_agency on public.daily_dod_awards (agency);

-- ------------------------------------------------------------
-- GAO Bid Protests
-- ------------------------------------------------------------
create table if not exists public.bid_protests (
    id             uuid primary key default gen_random_uuid(),
    docket_number  text unique not null,
    protester      text,
    solicitation   text,
    agency         text,
    decision_date  date,
    outcome        text check (outcome in ('sustained','denied','dismissed','withdrawn','pending','other')),
    decision_url   text,
    summary        text,
    related_uei    text,
    created_at     timestamptz not null default now()
);

create index if not exists idx_protests_agency on public.bid_protests (agency);
create index if not exists idx_protests_outcome on public.bid_protests (outcome);
create index if not exists idx_protests_date on public.bid_protests (decision_date desc);
create index if not exists idx_protests_uei on public.bid_protests (related_uei) where related_uei is not null;

-- ------------------------------------------------------------
-- FAR / DFARS Clauses Cache (eCFR)
-- ------------------------------------------------------------
create table if not exists public.far_clauses_cache (
    clause_id      text primary key,           -- e.g. '52.219-14' or 'DFARS 252.204-7012'
    title          text not null,
    body_text      text not null,
    body_html      text,
    section_url    text,
    last_amended   date,
    fetched_at     timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Federal Hierarchy snapshot (open.gsa.gov FH API)
-- ------------------------------------------------------------
create table if not exists public.federal_hierarchy (
    fh_id              text primary key,             -- unique org id from FH API
    org_name           text not null,
    org_type           text,                         -- 'Department' | 'Independent Agency' | 'Sub-tier' | 'Office'
    parent_fh_id       text,
    parent_name        text,
    agency_code        text,
    fpds_code          text,
    dodaac             text,
    status             text,                         -- 'active' | 'inactive'
    address_state      text,
    fetched_at         timestamptz not null default now()
);

create index if not exists idx_fh_parent on public.federal_hierarchy (parent_fh_id);
create index if not exists idx_fh_fpds on public.federal_hierarchy (fpds_code) where fpds_code is not null;
create index if not exists idx_fh_agency on public.federal_hierarchy (agency_code) where agency_code is not null;

-- ------------------------------------------------------------
-- Capture Briefs cache
-- Skip regeneration if a brief <7 days old exists for (opp, user).
-- ------------------------------------------------------------
create table if not exists public.capture_briefs (
    id               uuid primary key default gen_random_uuid(),
    user_profile_id  uuid references public.user_profiles(id) on delete cascade,
    opportunity_id   uuid not null,
    notice_id        text,
    brief_json       jsonb not null,
    pwin_estimate    integer check (pwin_estimate between 0 and 100),
    model_used       text,
    generated_at     timestamptz not null default now()
);

create index if not exists idx_capture_briefs_user_opp
    on public.capture_briefs (user_profile_id, opportunity_id, generated_at desc);

-- ------------------------------------------------------------
-- Market Watch — saved natural-language searches
-- Weekly Sunday digest runs them + emails results
-- ------------------------------------------------------------
create table if not exists public.market_watch_searches (
    id                uuid primary key default gen_random_uuid(),
    user_profile_id   uuid not null references public.user_profiles(id) on delete cascade,
    name              text not null,
    query_text        text not null,
    filters_json      jsonb not null default '{}'::jsonb,
    active            boolean not null default true,
    last_run_at       timestamptz,
    last_result_count integer,
    created_at        timestamptz not null default now()
);

create index if not exists idx_market_watch_user
    on public.market_watch_searches (user_profile_id) where active = true;

-- ------------------------------------------------------------
-- Extend tribal_contractors with DSBS fields (300K-row feed)
-- ------------------------------------------------------------
alter table public.tribal_contractors
    add column if not exists source                  text default 'curated',   -- 'curated' | 'dsbs' | 'sam'
    add column if not exists capability_narrative    text,
    add column if not exists capability_keywords     text[]      default '{}'::text[],
    add column if not exists poc_name                text,
    add column if not exists poc_email               text,
    add column if not exists poc_phone               text,
    add column if not exists year_established        integer,
    add column if not exists employee_count          integer,
    add column if not exists annual_revenue          numeric,
    add column if not exists is_veteran_owned        boolean     default false;

create index if not exists idx_tc_source on public.tribal_contractors (source);
create index if not exists idx_tc_veteran on public.tribal_contractors (is_veteran_owned) where is_veteran_owned = true;
create index if not exists idx_tc_keywords_gin on public.tribal_contractors using gin (capability_keywords);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.labor_rates            enable row level security;
alter table public.daily_dod_awards       enable row level security;
alter table public.bid_protests           enable row level security;
alter table public.far_clauses_cache      enable row level security;
alter table public.federal_hierarchy      enable row level security;
alter table public.capture_briefs         enable row level security;
alter table public.market_watch_searches  enable row level security;

-- Read-everywhere policies for reference tables
do $$
begin
    if not exists (select 1 from pg_policies where tablename='labor_rates' and policyname='labor_rates_read') then
        create policy "labor_rates_read" on public.labor_rates for select using (true);
    end if;
    if not exists (select 1 from pg_policies where tablename='daily_dod_awards' and policyname='dod_awards_read') then
        create policy "dod_awards_read" on public.daily_dod_awards for select using (true);
    end if;
    if not exists (select 1 from pg_policies where tablename='bid_protests' and policyname='protests_read') then
        create policy "protests_read" on public.bid_protests for select using (true);
    end if;
    if not exists (select 1 from pg_policies where tablename='far_clauses_cache' and policyname='far_read') then
        create policy "far_read" on public.far_clauses_cache for select using (true);
    end if;
    if not exists (select 1 from pg_policies where tablename='federal_hierarchy' and policyname='fh_read') then
        create policy "fh_read" on public.federal_hierarchy for select using (true);
    end if;

    -- Owner-only policies for user-specific tables
    if not exists (select 1 from pg_policies where tablename='capture_briefs' and policyname='capture_briefs_owner') then
        create policy "capture_briefs_owner" on public.capture_briefs for all
            using (user_profile_id in (select id from public.user_profiles where auth_user_id = auth.uid()));
    end if;
    if not exists (select 1 from pg_policies where tablename='market_watch_searches' and policyname='market_watch_owner') then
        create policy "market_watch_owner" on public.market_watch_searches for all
            using (user_profile_id in (select id from public.user_profiles where auth_user_id = auth.uid()));
    end if;
end
$$;
