-- ============================================================
-- Migration 046 — Agency Forecast Change Detection
-- ============================================================
-- Tracks federal-agency procurement forecast pages. When a new line item
-- appears we record it (matched against user NAICS for targeted alerts).
-- Powered by a cron that polls changedetection.io (self-hosted) OR an
-- internal lightweight differ that hashes the forecast-table content
-- per run. Either way, the schema is the same.

create table if not exists public.agency_forecast_sources (
    id               uuid primary key default gen_random_uuid(),
    agency           text not null,                      -- e.g. "Department of Veterans Affairs"
    agency_code      text,                               -- FPDS code, if known
    label            text not null,                      -- "VA OSDBU Quarterly Forecast FY26 Q3"
    url              text not null unique,
    selector         text,                               -- optional CSS/XPath for changedetection.io
    changedetection_watch_id text,                       -- external service id if using cd.io
    last_checked_at  timestamptz,
    last_hash        text,                               -- SHA-256 of the normalized content
    active           boolean not null default true,
    created_at       timestamptz not null default now()
);

create index if not exists idx_forecast_sources_agency on public.agency_forecast_sources (agency);

create table if not exists public.agency_forecast_changes (
    id               uuid primary key default gen_random_uuid(),
    source_id        uuid not null references public.agency_forecast_sources(id) on delete cascade,
    detected_at      timestamptz not null default now(),
    diff_summary     text,
    added_lines      text[]      default '{}'::text[],
    removed_lines    text[]      default '{}'::text[],
    naics_detected   text[]      default '{}'::text[],
    raw_snippet      text,
    notified_users   uuid[]      default '{}'::uuid[]
);

create index if not exists idx_forecast_changes_source on public.agency_forecast_changes (source_id, detected_at desc);
create index if not exists idx_forecast_changes_naics_gin on public.agency_forecast_changes using gin (naics_detected);

alter table public.agency_forecast_sources enable row level security;
alter table public.agency_forecast_changes enable row level security;

do $$
begin
    if not exists (select 1 from pg_policies where tablename='agency_forecast_sources' and policyname='sources_read') then
        create policy "sources_read" on public.agency_forecast_sources for select using (true);
    end if;
    if not exists (select 1 from pg_policies where tablename='agency_forecast_changes' and policyname='changes_read') then
        create policy "changes_read" on public.agency_forecast_changes for select using (true);
    end if;
end
$$;

-- Seed a handful of high-value forecast sources. More can be added later.
insert into public.agency_forecast_sources (agency, agency_code, label, url)
values
    ('Department of Veterans Affairs', '36', 'VA OSDBU Forecast of Contracting Opportunities', 'https://www.vendorportal.ecms.va.gov/FBODocumentServer/DocumentServer.aspx?DocumentId=forecast'),
    ('Department of Defense',          '97', 'DoD SB Forecast (OSBP)', 'https://business.defense.gov/Small-Business/Forecast/'),
    ('General Services Administration','47', 'GSA OSDBU Forecast', 'https://www.gsa.gov/small-business/small-business-resources/forecast-of-opportunities'),
    ('Department of Energy',           '89', 'DOE OSDBU Forecast',  'https://www.energy.gov/osdbu/acquisition-forecast'),
    ('Department of Homeland Security','70', 'DHS ACQUISITION Forecast','https://apfs-cloud.dhs.gov/')
on conflict (url) do nothing;
