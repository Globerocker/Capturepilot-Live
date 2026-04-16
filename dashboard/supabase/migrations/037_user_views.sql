-- ============================================================
-- Migration 037: Saved filter views (HubSpot-style)
-- ============================================================
-- Users can save a snapshot of their current filters on /matches or
-- /opportunities and reload it from a tab bar at the top of the list.
-- `filter_state` holds whatever structured filter the page cares about
-- (NAICS, set-aside, state, sort, view mode, column widths/picks, etc.).
-- ============================================================

create table if not exists public.user_views (
    id               uuid primary key default gen_random_uuid(),
    user_profile_id  uuid not null references public.user_profiles(id) on delete cascade,
    page             text not null check (page in ('matches', 'opportunities')),
    name             text not null,
    filter_state     jsonb not null default '{}'::jsonb,
    sort_order       integer not null default 0,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

create index if not exists idx_user_views_user_page on public.user_views(user_profile_id, page, sort_order);

alter table public.user_views enable row level security;

drop policy if exists "user_views read own" on public.user_views;
create policy "user_views read own"
    on public.user_views
    for select
    to authenticated
    using (user_profile_id in (select id from public.user_profiles where auth_user_id = auth.uid()));

drop policy if exists "user_views insert own" on public.user_views;
create policy "user_views insert own"
    on public.user_views
    for insert
    to authenticated
    with check (user_profile_id in (select id from public.user_profiles where auth_user_id = auth.uid()));

drop policy if exists "user_views update own" on public.user_views;
create policy "user_views update own"
    on public.user_views
    for update
    to authenticated
    using (user_profile_id in (select id from public.user_profiles where auth_user_id = auth.uid()))
    with check (user_profile_id in (select id from public.user_profiles where auth_user_id = auth.uid()));

drop policy if exists "user_views delete own" on public.user_views;
create policy "user_views delete own"
    on public.user_views
    for delete
    to authenticated
    using (user_profile_id in (select id from public.user_profiles where auth_user_id = auth.uid()));

comment on table public.user_views is
    'User-saved filter presets for list pages (matches, opportunities). filter_state is opaque JSON — page layer defines the shape.';
