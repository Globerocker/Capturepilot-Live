-- ============================================================
-- Migration 036: Partner management
-- ============================================================
-- Users can now save partners (from SAM.gov live search or Quick Checker)
-- and tag them as active or potential. Mirrors client_competitors but with
-- a status enum so Partners page can show two lanes.
-- ============================================================

create table if not exists public.client_partners (
    id                 uuid primary key default gen_random_uuid(),
    user_profile_id    uuid not null references public.user_profiles(id) on delete cascade,
    company_name       text not null,
    website            text,
    uei                text,
    naics_codes        text[] not null default '{}',
    status             text not null default 'potential'
        check (status in ('active', 'potential', 'archived')),
    description        text,
    employee_count     text,
    revenue_estimate   text,
    state              text,
    certifications     text[] not null default '{}',
    crawl_data         jsonb not null default '{}'::jsonb,
    notes              text,
    last_analyzed_at   timestamptz,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now()
);

create index if not exists idx_client_partners_user on public.client_partners(user_profile_id);
create index if not exists idx_client_partners_status on public.client_partners(user_profile_id, status);
create unique index if not exists uq_client_partners_user_uei on public.client_partners(user_profile_id, uei) where uei is not null;
create unique index if not exists uq_client_partners_user_website on public.client_partners(user_profile_id, website) where website is not null;

alter table public.client_partners enable row level security;

drop policy if exists "client_partners read own" on public.client_partners;
create policy "client_partners read own"
    on public.client_partners
    for select
    to authenticated
    using (user_profile_id in (select id from public.user_profiles where auth_user_id = auth.uid()));

drop policy if exists "client_partners insert own" on public.client_partners;
create policy "client_partners insert own"
    on public.client_partners
    for insert
    to authenticated
    with check (user_profile_id in (select id from public.user_profiles where auth_user_id = auth.uid()));

drop policy if exists "client_partners update own" on public.client_partners;
create policy "client_partners update own"
    on public.client_partners
    for update
    to authenticated
    using (user_profile_id in (select id from public.user_profiles where auth_user_id = auth.uid()))
    with check (user_profile_id in (select id from public.user_profiles where auth_user_id = auth.uid()));

drop policy if exists "client_partners delete own" on public.client_partners;
create policy "client_partners delete own"
    on public.client_partners
    for delete
    to authenticated
    using (user_profile_id in (select id from public.user_profiles where auth_user_id = auth.uid()));

comment on table public.client_partners is
    'User-curated partner list. Seeded from /api/partners/search (SAM.gov) or from Quick Checker analyses. Status=active means actively working together, potential means shortlisted.';
