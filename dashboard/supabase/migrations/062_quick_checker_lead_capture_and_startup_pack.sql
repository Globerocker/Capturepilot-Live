-- 062_quick_checker_lead_capture_and_startup_pack.sql
-- Extend company_analyses with explicit lead-capture columns + startup pack purchase state.
-- Also adds the startup_pack_purchases table to track $70 cross-sell purchases via Stripe.

-- ──────────────────────────────────────────────────────────────────────────────
-- 1) Extend company_analyses
-- ──────────────────────────────────────────────────────────────────────────────
alter table public.company_analyses
    add column if not exists lead_phone            text,
    add column if not exists lead_captured_at      timestamptz,
    add column if not exists employee_count        integer,
    add column if not exists annual_revenue_band   text check (annual_revenue_band in
        ('under_1m','1m_5m','5m_25m','25m_plus','prefer_not_to_say')),
    add column if not exists years_in_business     integer,
    add column if not exists startup_pack_unlocked_at        timestamptz,
    add column if not exists startup_pack_stripe_session_id  text,
    add column if not exists utm_source            text,
    add column if not exists utm_medium            text,
    add column if not exists utm_campaign          text;

create index if not exists company_analyses_lead_captured_idx
    on public.company_analyses (lead_captured_at desc nulls last)
    where lead_captured_at is not null;

create index if not exists company_analyses_startup_pack_idx
    on public.company_analyses (startup_pack_unlocked_at desc nulls last)
    where startup_pack_unlocked_at is not null;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2) Startup-pack purchases table (audit trail + asset-access tokens)
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.startup_pack_purchases (
    id                    uuid primary key default gen_random_uuid(),
    analysis_id           uuid references public.company_analyses (id) on delete set null,
    email                 text not null,
    company_name          text,
    amount_paid_cents     integer not null,
    currency              text not null default 'usd',
    stripe_session_id     text unique,
    stripe_payment_intent text,
    access_token          text unique not null default encode(gen_random_bytes(24), 'hex'),
    purchased_at          timestamptz not null default now(),
    refunded_at           timestamptz,
    metadata              jsonb default '{}'::jsonb
);

create index if not exists startup_pack_purchases_email_idx
    on public.startup_pack_purchases (lower(email));

create index if not exists startup_pack_purchases_analysis_idx
    on public.startup_pack_purchases (analysis_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- 3) RLS — keep purchases table service-role-only (no public access)
-- ──────────────────────────────────────────────────────────────────────────────
alter table public.startup_pack_purchases enable row level security;

drop policy if exists "purchases_service_role_all" on public.startup_pack_purchases;
create policy "purchases_service_role_all"
    on public.startup_pack_purchases
    as permissive
    for all
    to service_role
    using (true)
    with check (true);

comment on table public.startup_pack_purchases is
    'Audit log of $70 Startup Pack purchases from the Quick Checker funnel. access_token gates the download page.';
