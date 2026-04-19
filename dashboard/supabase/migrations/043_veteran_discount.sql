-- ============================================================
-- Migration 043 — Veteran status + 20% discount eligibility
-- ============================================================
-- Adds explicit veteran flags to user_profiles so we can
--   (a) show the veteran badge in the UI
--   (b) auto-apply the 20% Stripe discount at checkout
--   (c) track verification source (self-declared vs SAM-verified)
--
-- Design note: sba_certifications already stores 'SDVOSB'/'VOSB'
-- after a successful SAM Entity lookup. The columns below are a
-- denormalized view of that for fast lookups + the ability to
-- accept self-declared veterans before they've registered with SAM.

alter table public.user_profiles
    add column if not exists is_veteran_owned        boolean not null default false,
    add column if not exists veteran_cert_type       text,                         -- 'SDVOSB' | 'VOSB' | 'self_declared' | 'manual'
    add column if not exists veteran_verified_at     timestamptz,
    add column if not exists veteran_verified_source text,                         -- 'sam_entity' | 'self_declared' | 'admin'
    add column if not exists veteran_branch          text,                         -- 'army' | 'navy' | 'marines' | 'air_force' | 'space_force' | 'coast_guard'
    add column if not exists veteran_discount_code   text;                         -- Stripe promotion/coupon id actually applied

-- Audit trail for discount grants + SAM re-verifications
create table if not exists public.veteran_verifications (
    id                  uuid primary key default gen_random_uuid(),
    user_profile_id     uuid not null references public.user_profiles(id) on delete cascade,
    source              text not null check (source in ('sam_entity','self_declared','admin')),
    cert_type           text,
    uei                 text,
    sam_certifications  text[],
    raw_response        jsonb,
    created_at          timestamptz not null default now()
);

create index if not exists idx_veteran_verifications_user
    on public.veteran_verifications(user_profile_id, created_at desc);

-- Fast "is this user eligible for the discount?" lookup
create index if not exists idx_user_profiles_veteran
    on public.user_profiles(is_veteran_owned) where is_veteran_owned = true;

comment on column public.user_profiles.is_veteran_owned is
    'True if the user qualifies for the 20% veteran discount. Set by SAM verification or self-declaration.';
comment on column public.user_profiles.veteran_cert_type is
    'SDVOSB | VOSB | self_declared | manual. Drives the veteran badge shown on billing + dashboard.';
comment on column public.user_profiles.veteran_verified_source is
    'sam_entity (verified via SAM), self_declared (user toggled), or admin (granted manually).';

-- RLS: owners can read + update their own veteran fields; everything else inherits existing policies
do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename  = 'veteran_verifications'
          and policyname = 'owner_select_veteran_verifications'
    ) then
        create policy "owner_select_veteran_verifications"
            on public.veteran_verifications for select
            using (
                user_profile_id in (
                    select id from public.user_profiles where auth_user_id = auth.uid()
                )
            );
    end if;
end
$$;

alter table public.veteran_verifications enable row level security;
