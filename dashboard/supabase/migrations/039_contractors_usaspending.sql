-- ============================================================
-- Migration 039: Contractors — USASpending enrichment fields
-- ============================================================
-- We now populate per-contractor past-award data via USASpending.gov
-- (free API) through /api/intelligence/recipient-awards and a new nightly
-- cron. These columns cache the aggregate breakdowns so list views can
-- show award-count badges without a live USASpending call per row.
-- ============================================================

do $$ begin
    alter table public.contractors add column agency_relationships jsonb default '[]'::jsonb;
exception when duplicate_column then null;
end $$;

do $$ begin
    alter table public.contractors add column naics_awards jsonb default '[]'::jsonb;
exception when duplicate_column then null;
end $$;

do $$ begin
    alter table public.contractors add column last_usaspending_refresh timestamptz;
exception when duplicate_column then null;
end $$;

comment on column public.contractors.agency_relationships is
    'Top 10 awarding agencies for this recipient, shape [{name, amount, count}]. Populated by USASpending nightly cron.';
comment on column public.contractors.naics_awards is
    'Top 10 NAICS codes where this recipient has won awards, shape [{code, description, amount, count}]. Populated by USASpending nightly cron.';
comment on column public.contractors.last_usaspending_refresh is
    'Timestamp of the last USASpending refresh for this contractor. Rows older than 14 days are re-fetched on demand; cron fills in the long tail.';

create index if not exists idx_contractors_last_usaspending_refresh
    on public.contractors(last_usaspending_refresh);
