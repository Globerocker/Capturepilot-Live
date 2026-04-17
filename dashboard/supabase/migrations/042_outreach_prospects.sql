-- ============================================================
-- Migration 042: Outreach prospect pipeline
-- ============================================================
-- A separate table from `contractors` because:
--   - contractors is our reference directory (80k rows, mostly inert).
--   - outreach_prospects is an actionable queue with approval workflow,
--     compliance state (opt-outs, bounces), and sequence tracking.
-- Mixing the two risks accidentally emailing 80k random companies.
-- ============================================================

create table if not exists public.outreach_prospects (
    id                 uuid primary key default gen_random_uuid(),

    -- Identity
    uei                text,
    cage_code          text,
    company_name       text not null,
    website            text,
    state              text,
    city               text,

    -- Classification
    naics_codes        text[] not null default '{}',
    certifications     text[] not null default '{}',
    registration_date  date,              -- from SAM entityRegistration.registrationDate

    -- Enriched contact info (filled by enrichment pass)
    primary_email      text,
    primary_name       text,
    primary_title      text,
    primary_phone      text,
    enriched_at        timestamptz,

    -- Pipeline state
    source             text not null default 'sam_new_registration'
        check (source in ('sam_new_registration', 'sam_naics_match', 'manual', 'import')),
    status             text not null default 'pending_review'
        check (status in (
            'pending_review', 'approved', 'rejected',
            'queued', 'sent', 'replied', 'bounced', 'opted_out'
        )),
    match_score        integer default 0,     -- 0-100 fit-to-ICP heuristic
    rejection_reason   text,
    notes              text,

    -- Review trail
    reviewed_by        uuid references auth.users(id),
    reviewed_at        timestamptz,
    discovered_at      timestamptz not null default now(),
    updated_at         timestamptz not null default now(),

    -- Link back to the contractors row when we already know about them.
    contractor_id      uuid references public.contractors(id) on delete set null
);

create unique index if not exists uq_outreach_prospects_uei
    on public.outreach_prospects(uei) where uei is not null;
create index if not exists idx_outreach_prospects_status on public.outreach_prospects(status);
create index if not exists idx_outreach_prospects_naics on public.outreach_prospects using gin(naics_codes);
create index if not exists idx_outreach_prospects_discovered on public.outreach_prospects(discovered_at desc);

alter table public.outreach_prospects enable row level security;

-- Only admins see the prospect queue. Everyone else just sees the approved
-- prospects that surface on their Partners "Suggested" tab — we gate that
-- separately via a policy that exposes only status='approved'.
drop policy if exists "outreach_prospects admin all" on public.outreach_prospects;
create policy "outreach_prospects admin all"
    on public.outreach_prospects
    for all
    to authenticated
    using (
        exists (
            select 1 from public.user_profiles
            where auth_user_id = auth.uid() and account_type = 'admin'
        )
    )
    with check (
        exists (
            select 1 from public.user_profiles
            where auth_user_id = auth.uid() and account_type = 'admin'
        )
    );

drop policy if exists "outreach_prospects approved read" on public.outreach_prospects;
create policy "outreach_prospects approved read"
    on public.outreach_prospects
    for select
    to authenticated
    using (status = 'approved');


-- Opt-out list is honored globally across all sequences + future tables.
create table if not exists public.outreach_optouts (
    id           uuid primary key default gen_random_uuid(),
    email        text not null unique,
    reason       text,
    opted_out_at timestamptz not null default now()
);
create index if not exists idx_outreach_optouts_email on public.outreach_optouts(lower(email));

alter table public.outreach_optouts enable row level security;

drop policy if exists "outreach_optouts admin all" on public.outreach_optouts;
create policy "outreach_optouts admin all"
    on public.outreach_optouts
    for all
    to authenticated
    using (
        exists (
            select 1 from public.user_profiles
            where auth_user_id = auth.uid() and account_type = 'admin'
        )
    )
    with check (
        exists (
            select 1 from public.user_profiles
            where auth_user_id = auth.uid() and account_type = 'admin'
        )
    );

comment on table public.outreach_prospects is
    'Cold-outreach pipeline. Discovered by /api/cron/discover_new_prospects, reviewed by admin, enriched, sent through drip.';
comment on table public.outreach_optouts is
    'Global opt-out list. Any email here is excluded from all future outreach sends.';
