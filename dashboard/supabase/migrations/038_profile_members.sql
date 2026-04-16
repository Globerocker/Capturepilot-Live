-- ============================================================
-- Migration 038: Team members + invitations
-- ============================================================
-- user_profiles represents a company. profile_members lets multiple auth
-- users collaborate on the same company profile with different roles.
-- profile_invitations holds pending invites until the recipient signs up /
-- accepts. Seat limits are enforced at the API layer based on the owner's
-- subscription tier.
-- ============================================================

create table if not exists public.profile_members (
    id               uuid primary key default gen_random_uuid(),
    profile_id       uuid not null references public.user_profiles(id) on delete cascade,
    auth_user_id     uuid not null references auth.users(id) on delete cascade,
    role             text not null default 'member'
        check (role in ('owner', 'admin', 'member', 'viewer')),
    -- Optional per-member feature flags. Admins can toggle individual
    -- features off for restricted members. Keys mirror sidebar sections.
    feature_access   jsonb not null default '{}'::jsonb,
    invited_by       uuid references auth.users(id),
    invited_at       timestamptz not null default now(),
    accepted_at      timestamptz,
    created_at       timestamptz not null default now()
);

create unique index if not exists uq_profile_members_profile_user
    on public.profile_members(profile_id, auth_user_id);
create index if not exists idx_profile_members_user on public.profile_members(auth_user_id);

alter table public.profile_members enable row level security;

-- Members can see their own membership rows.
drop policy if exists "profile_members read own" on public.profile_members;
create policy "profile_members read own"
    on public.profile_members
    for select
    to authenticated
    using (
        auth_user_id = auth.uid()
        or profile_id in (select id from public.user_profiles where auth_user_id = auth.uid())
    );

-- Only the owner (user_profiles.auth_user_id) can mutate membership rows.
drop policy if exists "profile_members write owner" on public.profile_members;
create policy "profile_members write owner"
    on public.profile_members
    for all
    to authenticated
    using (profile_id in (select id from public.user_profiles where auth_user_id = auth.uid()))
    with check (profile_id in (select id from public.user_profiles where auth_user_id = auth.uid()));


-- ------------------------------------------------------------
-- profile_invitations — pending invites (before the recipient has an account)
-- ------------------------------------------------------------
create table if not exists public.profile_invitations (
    id               uuid primary key default gen_random_uuid(),
    profile_id       uuid not null references public.user_profiles(id) on delete cascade,
    email            text not null,
    role             text not null default 'member'
        check (role in ('admin', 'member', 'viewer')),
    feature_access   jsonb not null default '{}'::jsonb,
    token            text not null unique,
    invited_by       uuid not null references auth.users(id),
    expires_at       timestamptz not null default now() + interval '14 days',
    accepted_at      timestamptz,
    created_at       timestamptz not null default now()
);

create unique index if not exists uq_profile_invitations_profile_email_pending
    on public.profile_invitations(profile_id, lower(email))
    where accepted_at is null;

create index if not exists idx_profile_invitations_token on public.profile_invitations(token);
create index if not exists idx_profile_invitations_email on public.profile_invitations(lower(email));

alter table public.profile_invitations enable row level security;

-- Owners see their own invitations. The accept endpoint runs as service role.
drop policy if exists "profile_invitations read own" on public.profile_invitations;
create policy "profile_invitations read own"
    on public.profile_invitations
    for select
    to authenticated
    using (profile_id in (select id from public.user_profiles where auth_user_id = auth.uid()));

drop policy if exists "profile_invitations write owner" on public.profile_invitations;
create policy "profile_invitations write owner"
    on public.profile_invitations
    for all
    to authenticated
    using (profile_id in (select id from public.user_profiles where auth_user_id = auth.uid()))
    with check (profile_id in (select id from public.user_profiles where auth_user_id = auth.uid()));

comment on table public.profile_members is
    'Team members for a company profile. Owner sits in user_profiles.auth_user_id; additional members linked here with roles.';
comment on table public.profile_invitations is
    'Pending invitations. Accept endpoint converts to profile_members on signup / existing-user acceptance.';
