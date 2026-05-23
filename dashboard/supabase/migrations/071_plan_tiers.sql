-- ============================================================
-- Plan-tier feature gating + revenue forecasting + team-accounts
-- foundation. One migration, three coupled additions because they
-- all touch user_profiles and want to ship together so the
-- gating utility can rely on the columns existing.
-- ============================================================

-- 1) plan_tiers — declarative tier definitions. Code references these
-- via the `code` column ('free', 'starter', 'pro', 'enterprise').
-- Limits live in a JSONB so we can add new gates without a migration.

create table if not exists public.plan_tiers (
    id           bigserial primary key,
    code         text not null unique,             -- e.g. 'free', 'starter', 'pro', 'enterprise'
    label        text not null,                     -- 'Free', 'Starter', 'Pro'
    monthly_usd  integer not null default 0,
    yearly_usd   integer,                            -- null → no annual option
    sort_order   integer not null default 0,
    is_public    boolean not null default true,     -- enterprise sometimes hidden
    limits       jsonb not null default '{}'::jsonb, -- {max_saved_searches: 5, proposals_per_month: 10, api_access: false, ...}
    created_at   timestamptz not null default now()
);

-- Seed the four standard tiers. monthly_usd is null on enterprise →
-- "contact us" pricing.
insert into public.plan_tiers (code, label, monthly_usd, yearly_usd, sort_order, is_public, limits) values
    ('free',       'Free',        0,    null,  10, true,  jsonb_build_object(
        'max_saved_searches', 1,
        'proposals_per_month', 0,
        'matches_per_day', 50,
        'capability_statement_ai', false,
        'sam_passthrough', false,
        'partners_search', false,
        'api_access', false,
        'team_seats', 1
    )),
    ('starter',    'Starter',     49,   470,   20, true,  jsonb_build_object(
        'max_saved_searches', 5,
        'proposals_per_month', 3,
        'matches_per_day', 200,
        'capability_statement_ai', true,
        'sam_passthrough', true,
        'partners_search', true,
        'api_access', false,
        'team_seats', 1
    )),
    ('pro',        'Pro',         149,  1430,  30, true,  jsonb_build_object(
        'max_saved_searches', 25,
        'proposals_per_month', 25,
        'matches_per_day', 1000,
        'capability_statement_ai', true,
        'sam_passthrough', true,
        'partners_search', true,
        'api_access', true,
        'team_seats', 3
    )),
    ('enterprise', 'Enterprise',  null, null,  40, true,  jsonb_build_object(
        'max_saved_searches', 999,
        'proposals_per_month', 999,
        'matches_per_day', 10000,
        'capability_statement_ai', true,
        'sam_passthrough', true,
        'partners_search', true,
        'api_access', true,
        'team_seats', 25
    )),
    ('consulting', 'Consulting',  null, null,  50, false, jsonb_build_object(
        'max_saved_searches', 999,
        'proposals_per_month', 999,
        'matches_per_day', 10000,
        'capability_statement_ai', true,
        'sam_passthrough', true,
        'partners_search', true,
        'api_access', true,
        'team_seats', 5
    ))
on conflict (code) do update set
    label = excluded.label,
    monthly_usd = excluded.monthly_usd,
    yearly_usd = excluded.yearly_usd,
    sort_order = excluded.sort_order,
    is_public = excluded.is_public,
    limits = excluded.limits;

alter table public.plan_tiers enable row level security;
drop policy if exists plan_tiers_read on public.plan_tiers;
create policy plan_tiers_read on public.plan_tiers
    for select using (true); -- anyone can read tier definitions for /pricing
drop policy if exists plan_tiers_service_write on public.plan_tiers;
create policy plan_tiers_service_write on public.plan_tiers
    for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- 2) team_members — foundation for multi-user-per-profile. Owner is
-- always implicit (user_profiles.auth_user_id), additional members
-- live here. Role gates what each member can do; enforced at the
-- API layer via assertProfileMember(role).
create table if not exists public.team_members (
    id             uuid primary key default gen_random_uuid(),
    user_profile_id uuid not null references public.user_profiles(id) on delete cascade,
    auth_user_id   uuid not null,                  -- references auth.users.id (no FK because cross-schema)
    role           text not null check (role in ('owner', 'collaborator', 'viewer')),
    invited_by     uuid,
    invited_email  text,                            -- snapshot at invite time so we can show pending invites
    accepted_at    timestamptz,
    created_at     timestamptz not null default now(),
    unique (user_profile_id, auth_user_id)
);
create index if not exists team_members_profile_idx on public.team_members(user_profile_id);
create index if not exists team_members_auth_idx    on public.team_members(auth_user_id);

alter table public.team_members enable row level security;
drop policy if exists team_members_read_self on public.team_members;
create policy team_members_read_self on public.team_members
    for select using (auth_user_id = auth.uid());
drop policy if exists team_members_service_write on public.team_members;
create policy team_members_service_write on public.team_members
    for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- 3) Pipeline forecast columns. PWin (0-100) drives forecasted_revenue
-- when combined with the amount column. predicted_close_date lets us
-- group by quarter for the dashboard tile.
alter table public.user_pursuits
    add column if not exists pwin              integer check (pwin between 0 and 100),
    add column if not exists predicted_close_date date,
    add column if not exists predicted_value_cents bigint;
create index if not exists user_pursuits_predicted_close_idx
    on public.user_pursuits(user_profile_id, predicted_close_date)
    where predicted_close_date is not null;

-- 4) Saved searches — a foundational table for the saved-searches-with-alerts
-- feature mentioned in next-runs. Wired here so plan_tier `max_saved_searches`
-- can gate against it from day one.
create table if not exists public.saved_searches (
    id              uuid primary key default gen_random_uuid(),
    user_profile_id uuid not null references public.user_profiles(id) on delete cascade,
    name            text not null,
    filters         jsonb not null,            -- the same shape the /matches page reads
    alert_enabled   boolean not null default false,
    last_alert_at   timestamptz,
    new_match_count integer not null default 0,  -- since last alert
    created_at      timestamptz not null default now()
);
create index if not exists saved_searches_profile_idx on public.saved_searches(user_profile_id);
create index if not exists saved_searches_alert_idx
    on public.saved_searches(user_profile_id)
    where alert_enabled = true;

alter table public.saved_searches enable row level security;
drop policy if exists saved_searches_own on public.saved_searches;
create policy saved_searches_own on public.saved_searches
    for all using (
        user_profile_id in (select id from public.user_profiles where auth_user_id = auth.uid())
    );
drop policy if exists saved_searches_service_all on public.saved_searches;
create policy saved_searches_service_all on public.saved_searches
    for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- 5) GDPR delete-request workflow. Soft-records a request, the cleanup
-- cron processes those past their grace_window_ends_at and deletes.
create table if not exists public.account_deletion_requests (
    id              uuid primary key default gen_random_uuid(),
    auth_user_id    uuid not null unique,
    user_profile_id uuid references public.user_profiles(id) on delete set null,
    requested_at    timestamptz not null default now(),
    grace_window_ends_at timestamptz not null default (now() + interval '7 days'),
    cancelled_at    timestamptz,
    completed_at    timestamptz,
    reason          text
);
create index if not exists account_deletion_due_idx
    on public.account_deletion_requests(grace_window_ends_at)
    where completed_at is null and cancelled_at is null;

alter table public.account_deletion_requests enable row level security;
drop policy if exists deletion_own on public.account_deletion_requests;
create policy deletion_own on public.account_deletion_requests
    for select using (auth_user_id = auth.uid());
drop policy if exists deletion_service on public.account_deletion_requests;
create policy deletion_service on public.account_deletion_requests
    for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- 6) Audit-log retention helper. The db_cleanup cron will call this
-- weekly to prune client_activity_log entries older than 90 days.
-- Lives as a function so we can change retention without touching the
-- cron handler.
create or replace function public.purge_old_activity_log()
returns integer language plpgsql security definer as $$
declare
    deleted_count integer;
begin
    delete from public.client_activity_log
    where created_at < now() - interval '90 days'
    returning 1 into deleted_count;
    get diagnostics deleted_count = row_count;
    return deleted_count;
end;
$$;

comment on function public.purge_old_activity_log is
'Removes client_activity_log rows older than 90 days. Called weekly by db_cleanup cron.';
