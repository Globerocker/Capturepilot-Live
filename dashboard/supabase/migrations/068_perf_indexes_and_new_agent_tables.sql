-- ============================================================
-- Migration 068: perf indexes for enrichment crons + tables for new agents
-- ============================================================
--
-- 1) Five enrichment crons (enrich, backfill_requirements, strategic_scoring,
--    ai_strategy, bulk_enrich_descriptions) were dying with
--    "canceling statement due to statement timeout".  They each filter on
--    `is_archived = false` + a JSONB null/empty check or a description-LIKE.
--    The 59k-row opportunities table has no partial index supporting any of
--    those — every cron scan = full seq scan = ~30s+. Adding partial
--    indexes drops each pick query into ms.
--
-- 2) government_contacts.email had a unique index on `lower(email)` — an
--    expression index that PostgREST's `onConflict: "email"` can't address,
--    so the email-keyed upsert silently no-op'd. The cron has already been
--    switched to dedup by `highergov_path` (commit 3a471061), but a plain
--    unique constraint on the column is still useful for future writers.
--
-- 3) New tables for the additional enrichment agents:
--      - `cron_runs`              telemetry per cron invocation
--      - `past_performance_stats` agency × NAICS win-rate aggregates
--      - `gsa_schedule_holders`   GSA contract holders per Schedule
--      - `wage_determinations`    SCA/DBA wage rates by state/locality
--      - `sec_prime_filings`      latest 10-K/10-Q + earnings-call gist for primes
--      - `gao_protests`           GAO protest decisions + outcomes
--      - `dod_contracts`          DoD daily contract releases (>$7.5M)
-- ============================================================

-- --- 1) Enrichment cron partial indexes ----------------------
-- enrich + bulk_enrich_descriptions: description LIKE 'https://api.sam.gov%'
create index if not exists idx_opps_needs_description_fetch
    on public.opportunities (posted_date desc nulls last)
    where is_archived = false
      and description like 'https://api.sam.gov%';

-- backfill_requirements: raw_json present, structured_requirements missing
create index if not exists idx_opps_needs_requirements_backfill
    on public.opportunities (id)
    where raw_json is not null
      and (structured_requirements is null
           or structured_requirements::text = '{}');

-- strategic_scoring: not archived, scoring missing
create index if not exists idx_opps_needs_strategic_scoring
    on public.opportunities (response_deadline asc nulls last)
    where is_archived = false
      and (strategic_scoring is null
           or strategic_scoring::text = '{}');

-- ai_strategy: not archived, ai_win_strategy missing
create index if not exists idx_opps_needs_ai_strategy
    on public.opportunities (response_deadline asc nulls last)
    where is_archived = false
      and (ai_win_strategy is null
           or ai_win_strategy::text = '{}');


-- --- 2) government_contacts upsert fixes --------------------
-- PostgREST's `onConflict:"col"` reads from pg_constraint, NOT from
-- pg_index. The two unique entries created in migration 065 were
-- `create unique index ... where ...` (partial expression indexes),
-- which Postgres-the-database treats as unique but PostgREST can't
-- match against an ON CONFLICT spec. Result: every upsert from the
-- cron returned "no unique or exclusion constraint matching the ON
-- CONFLICT specification" and 0 rows landed.
--
-- Fix: add real UNIQUE CONSTRAINTS on the two dedup columns. We use
-- non-partial constraints — Postgres treats multiple NULLs as distinct
-- under its default UNIQUE semantics, so contacts without a path or
-- email don't collide.
do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'uq_gov_contacts_highergov_path'
          and conrelid = 'public.government_contacts'::regclass
    ) then
        alter table public.government_contacts
            add constraint uq_gov_contacts_highergov_path
            unique (highergov_path);
    end if;
exception when duplicate_table or duplicate_object then
    -- ignore race
end $$;

-- For email we keep it case-insensitive via the existing lower(email)
-- index; the new constraint is on the raw column for PostgREST. The
-- HigherGov cron normalizes email to lower() before insert, so the two
-- indexes stay consistent.
do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'uq_gov_contacts_email'
          and conrelid = 'public.government_contacts'::regclass
    ) then
        alter table public.government_contacts
            add constraint uq_gov_contacts_email
            unique (email);
    end if;
exception when duplicate_table or duplicate_object then
    -- ignore race
end $$;


-- --- 3) cron_runs telemetry table ---------------------------
create table if not exists public.cron_runs (
    id uuid primary key default gen_random_uuid(),
    route text not null,                    -- '/api/cron/<name>'
    started_at timestamptz not null default now(),
    finished_at timestamptz,
    status text,                            -- 'ok' / 'error' / 'timeout' / 'partial'
    rows_in integer,                        -- e.g. fetched/processed
    rows_out integer,                       -- e.g. inserted/updated
    error_message text,
    payload jsonb,                          -- free-form per-route stats
    elapsed_ms integer
);

create index if not exists idx_cron_runs_route_started on public.cron_runs(route, started_at desc);
create index if not exists idx_cron_runs_status on public.cron_runs(status, started_at desc) where status <> 'ok';


-- --- 4) Past-performance stats (agency × NAICS) -------------
create table if not exists public.past_performance_stats (
    agency text not null,
    naics_prefix text not null,             -- 2, 4, or 6-digit
    naics_digits smallint not null check (naics_digits in (2, 4, 6)),
    awards_24mo integer default 0,
    awards_set_aside_8a integer default 0,
    awards_set_aside_hubzone integer default 0,
    awards_set_aside_sdvosb integer default 0,
    awards_set_aside_wosb integer default 0,
    awards_set_aside_small integer default 0,
    awards_fullopen integer default 0,
    unique_winners integer default 0,
    total_obligated numeric(18, 2) default 0,
    median_award_value numeric(18, 2),
    top_winners jsonb,                       -- [{uei, name, awards, total}]
    last_updated timestamptz default now(),
    primary key (agency, naics_prefix)
);
create index if not exists idx_pps_naics on public.past_performance_stats(naics_prefix);


-- --- 5) GSA Schedule holders --------------------------------
create table if not exists public.gsa_schedule_holders (
    id uuid primary key default gen_random_uuid(),
    contract_number text not null unique,    -- e.g. GS-35F-XXXX
    schedule text,                            -- e.g. 'Multiple Award Schedule', '70 IT Schedule'
    business_name text not null,
    uei text,
    duns text,
    contractor_address text,
    contractor_state text,
    sin_codes text[],                         -- Special Item Numbers covered
    contract_value numeric(18, 2),
    period_start date,
    period_end date,
    socioeconomic_indicators text[],          -- ['SB','8A','WOSB','VOSB','SDVOSB','HUBZ']
    website text,
    last_synced timestamptz default now()
);
create index if not exists idx_gsa_uei on public.gsa_schedule_holders(uei) where uei is not null;
create index if not exists idx_gsa_state on public.gsa_schedule_holders(contractor_state);


-- --- 6) DOL Wage Determinations -----------------------------
create table if not exists public.wage_determinations (
    id uuid primary key default gen_random_uuid(),
    wage_decision_number text not null,       -- e.g. WD-26-1234
    decision_type text,                        -- 'SCA' | 'DBA'
    state text not null,
    county text,
    occupation_title text,
    occupation_code text,                      -- SCA 5-digit
    minimum_hourly_rate numeric(8, 2),
    fringe_benefits numeric(8, 2),
    effective_date date,
    revision_number integer,
    source_url text,
    last_synced timestamptz default now(),
    unique (wage_decision_number, occupation_code, state, county)
);
create index if not exists idx_wd_state_occ on public.wage_determinations(state, occupation_code);


-- --- 7) SEC EDGAR filings for publicly-traded primes --------
create table if not exists public.sec_prime_filings (
    id uuid primary key default gen_random_uuid(),
    cik text not null,                         -- SEC Central Index Key
    ticker text,
    company_name text not null,
    filing_type text not null,                 -- '10-K' | '10-Q' | '8-K' | 'transcript'
    filing_date date not null,
    period_of_report date,
    accession_number text,
    document_url text,
    extracted_themes text[],                   -- e.g. ['DoD IT expansion', 'AI investment']
    extracted_capture_signals jsonb,           -- structured: { agency, intent, time_horizon }
    raw_excerpt text,
    last_synced timestamptz default now(),
    unique (cik, accession_number)
);
create index if not exists idx_sec_cik_date on public.sec_prime_filings(cik, filing_date desc);


-- --- 8) GAO Protest decisions -------------------------------
create table if not exists public.gao_protests (
    id uuid primary key default gen_random_uuid(),
    docket_number text not null unique,        -- e.g. B-422222
    protester text,
    contracting_agency text,
    awardee text,                              -- if known
    decision_date date,
    outcome text,                              -- 'Sustained' | 'Denied' | 'Dismissed' | 'Withdrawn'
    naics_code text,
    psc_code text,
    summary text,
    document_url text,
    raw_json jsonb,
    last_synced timestamptz default now()
);
create index if not exists idx_gao_agency_outcome on public.gao_protests(contracting_agency, outcome);
create index if not exists idx_gao_awardee on public.gao_protests(awardee) where awardee is not null;


-- --- 9) DoD daily contracts release -------------------------
create table if not exists public.dod_contracts (
    id uuid primary key default gen_random_uuid(),
    contract_number text not null,
    recipient_name text,
    recipient_uei text,
    recipient_state text,
    awarding_office text,                      -- e.g. 'Naval Sea Systems Command'
    award_amount numeric(18, 2),
    award_date date,
    period_of_performance text,
    description text,
    naics_code text,
    psc_code text,
    place_of_performance text,
    set_aside text,
    source_url text,
    raw_blob text,
    last_synced timestamptz default now(),
    unique (contract_number, award_date)
);
create index if not exists idx_dod_recipient on public.dod_contracts(recipient_name) where recipient_name is not null;
create index if not exists idx_dod_award_date on public.dod_contracts(award_date desc);


comment on table public.cron_runs is
    'Per-cron-invocation telemetry. Wrap each cron handler in withCronRun() to populate.';
comment on table public.past_performance_stats is
    'Pre-computed agency×NAICS win-rate aggregates from USAspending. Drives strategic_scoring boost.';
