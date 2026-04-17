-- ============================================================
-- Migration 040: Teaming + year-end spend intelligence
-- ============================================================
-- Three complementary tables that extend the Partners/Dashboard
-- with curated teaming data we ingest from external sources:
--
--   tribal_contractors     — SBA-certified 8(a)/HUBZone/tribal/native-owned
--                            firms with full capability narratives, NAICS
--                            arrays, and SBLO-quality contacts. Seeded from a
--                            ~900-row curated list (GovCon Giants, Apr 2026).
--
--   prime_sblos            — Small Business Liaison Officer (SBLO) contacts
--                            at top-tier primes (BAE, Lockheed, Raytheon …).
--                            Used by the Partners → Primes tab and the
--                            subcontracting outreach drafter.
--
--   agency_spend_forecast  — Per-agency unobligated-balance / Q4 year-end
--                            spend forecast rows that feed the dashboard's
--                            "Year-End Spend Radar" widget. One row per
--                            (agency, fiscal_year, fiscal_period).
-- ============================================================

-- ------------------------------------------------------------
-- Tribal / SBA-certified contractor directory
-- ------------------------------------------------------------
create table if not exists public.tribal_contractors (
    uei                       text primary key,
    cage_code                 text,
    business_name             text not null,
    primary_naics_code        text,
    all_naics_codes           text[]  default '{}'::text[],
    small_naics_codes         text[]  default '{}'::text[],
    certifications            text[]  default '{}'::text[],
    contact_name              text,
    contact_email             text,
    address_line_1            text,
    address_line_2            text,
    city                      text,
    state                     text,
    zipcode                   text,
    capabilities_narrative    text,
    capabilities_statement_url text,
    sba_profile_url           text,
    source                    text,
    source_imported_at        timestamptz default now(),
    created_at                timestamptz default now(),
    updated_at                timestamptz default now()
);

create index if not exists idx_tribal_contractors_primary_naics
    on public.tribal_contractors (primary_naics_code);
create index if not exists idx_tribal_contractors_state
    on public.tribal_contractors (state);
create index if not exists idx_tribal_contractors_naics_gin
    on public.tribal_contractors using gin (all_naics_codes);
create index if not exists idx_tribal_contractors_certs_gin
    on public.tribal_contractors using gin (certifications);

comment on table  public.tribal_contractors is
    'SBA-certified (8(a), HUBZone, WOSB, SDVOSB) small businesses curated for teaming suggestions. ~900 rows seeded from GovCon Giants tribal list (Apr 2026).';
comment on column public.tribal_contractors.certifications is
    'Parsed certifications: 8(a), HUBZone, WOSB, EDWOSB, VOSB, SDVOSB, 8(a) JV.';
comment on column public.tribal_contractors.small_naics_codes is
    'Subset of all_naics_codes that qualify under SBA size standards.';

alter table public.tribal_contractors enable row level security;

-- Everyone authenticated can read the directory (it is curated public data).
drop policy if exists "tribal_contractors_select" on public.tribal_contractors;
create policy "tribal_contractors_select" on public.tribal_contractors
    for select using (auth.role() = 'authenticated');

-- Only the service role (cron / admin tools) can write.
drop policy if exists "tribal_contractors_service_write" on public.tribal_contractors;
create policy "tribal_contractors_service_write" on public.tribal_contractors
    for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');


-- ------------------------------------------------------------
-- Prime-contractor SBLO (Small Business Liaison Officer) directory
-- ------------------------------------------------------------
create table if not exists public.prime_sblos (
    id             uuid primary key default gen_random_uuid(),
    agency_scope   text,   -- 'DoD / Cyber', 'Army', 'Air Force', 'MDA', …
    prime_company  text not null,
    sblo_name      text,
    sblo_email     text,
    sblo_phone     text,
    notes          text,
    source         text,
    created_at     timestamptz default now(),
    updated_at     timestamptz default now()
);

create index if not exists idx_prime_sblos_agency_scope on public.prime_sblos (agency_scope);
create index if not exists idx_prime_sblos_prime_company on public.prime_sblos (prime_company);

comment on table public.prime_sblos is
    'Prime contractor Small Business Liaison Officers. Used for subcontracting outreach from Partners → Primes tab.';

alter table public.prime_sblos enable row level security;

drop policy if exists "prime_sblos_select" on public.prime_sblos;
create policy "prime_sblos_select" on public.prime_sblos
    for select using (auth.role() = 'authenticated');

drop policy if exists "prime_sblos_service_write" on public.prime_sblos;
create policy "prime_sblos_service_write" on public.prime_sblos
    for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');


-- ------------------------------------------------------------
-- Agency year-end / Q4 unobligated-balance forecast
-- ------------------------------------------------------------
create table if not exists public.agency_spend_forecast (
    id                        uuid primary key default gen_random_uuid(),
    rank                      int,
    agency_name               text not null,
    fiscal_year               int  not null,
    fiscal_period             text not null default 'Q4',   -- 'Q4', 'December', 'monthly'
    unobligated_balance_usd   bigint,
    hot_naics                 text[] default '{}'::text[],
    hot_opportunities         text,
    why_now                   text,
    source                    text,
    published_at              date,
    created_at                timestamptz default now(),
    updated_at                timestamptz default now(),
    unique (agency_name, fiscal_year, fiscal_period)
);

create index if not exists idx_agency_spend_forecast_fy
    on public.agency_spend_forecast (fiscal_year);
create index if not exists idx_agency_spend_forecast_naics_gin
    on public.agency_spend_forecast using gin (hot_naics);

comment on table public.agency_spend_forecast is
    'Per-agency Q4 unobligated-balance forecast, used by the Year-End Spend Radar widget. One row per (agency, fiscal_year, fiscal_period).';
comment on column public.agency_spend_forecast.unobligated_balance_usd is
    'Estimated dollars authorized but not yet obligated — the "use it or lose it" pool.';

alter table public.agency_spend_forecast enable row level security;

drop policy if exists "agency_spend_forecast_select" on public.agency_spend_forecast;
create policy "agency_spend_forecast_select" on public.agency_spend_forecast
    for select using (auth.role() = 'authenticated');

drop policy if exists "agency_spend_forecast_service_write" on public.agency_spend_forecast;
create policy "agency_spend_forecast_service_write" on public.agency_spend_forecast
    for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
