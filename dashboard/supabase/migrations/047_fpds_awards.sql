-- ============================================================
-- Migration 047 — FPDS Awards (federal contract actions)
-- ============================================================
-- FPDS (fpds.gov) is the authoritative record of every federal contract
-- action. We pull the Atom feed and store awards + modifications keyed by
-- piid + referenced_idv + modification_number so we can:
--   1. Power the Past-Performance proxy with real mod counts + extensions
--   2. Detect terminations (contract_action_type IN ('DCA','TCA','TFC'))
--   3. Surface incumbent award histories on opportunity detail pages
--
-- The fpds Python package or our tools/26_ingest_fpds.mjs populate this.
-- No PK on a single column because FPDS's natural key is composite:
-- (piid, referenced_idv, modification_number).

create table if not exists public.fpds_awards (
    id                    uuid primary key default gen_random_uuid(),
    piid                  text not null,
    referenced_idv        text,
    modification_number   text,
    contractor_uei        text,
    contractor_name       text,
    awarding_agency       text,
    awarding_sub_agency   text,
    naics_code            text,
    psc_code              text,
    set_aside             text,

    -- Dollar values
    obligation_amount     numeric(15,2),
    base_and_exercised    numeric(15,2),
    base_and_all_options  numeric(15,2),

    -- Dates
    signed_date           date,
    effective_date        date,
    current_end_date      date,
    ultimate_end_date     date,

    -- Action type — drives past-perf signal extraction
    contract_action_type  text,                       -- 'A'|'IDV'|'IDC'|'DCA'(default)|'TCA'|'TFC' etc.
    idv_type              text,
    contract_type         text,
    type_of_contract_pricing text,

    -- Competition
    extent_competed       text,
    solicitation_procedures text,
    number_of_offers_received integer,

    -- Derived flags for fast queries
    is_termination        boolean generated always as (
        contract_action_type in ('DCA','TCA','TFC')
    ) stored,
    is_option_exercise    boolean generated always as (
        contract_action_type = 'B'
    ) stored,
    is_modification       boolean generated always as (
        modification_number is not null and modification_number <> '0' and modification_number <> ''
    ) stored,

    source_url            text,
    raw_xml_hash          text,
    fetched_at            timestamptz not null default now()
);

-- Natural uniqueness for upserts
create unique index if not exists uq_fpds_natural
    on public.fpds_awards (piid, coalesce(referenced_idv, ''), coalesce(modification_number, ''));

create index if not exists idx_fpds_uei on public.fpds_awards (contractor_uei);
create index if not exists idx_fpds_agency_naics on public.fpds_awards (awarding_agency, naics_code);
create index if not exists idx_fpds_signed_date on public.fpds_awards (signed_date desc);
create index if not exists idx_fpds_uei_mod on public.fpds_awards (contractor_uei) where is_modification = true;
create index if not exists idx_fpds_uei_term on public.fpds_awards (contractor_uei) where is_termination = true;

alter table public.fpds_awards enable row level security;

do $$
begin
    if not exists (select 1 from pg_policies where tablename='fpds_awards' and policyname='fpds_read') then
        create policy "fpds_read" on public.fpds_awards for select using (true);
    end if;
end $$;
