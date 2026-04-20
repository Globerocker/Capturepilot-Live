-- ============================================================
-- Migration 051: Outreach Phase 2 — sequence tracking + unsubscribe
-- ============================================================
-- Adds the pieces needed to actually send cold emails:
--   1. Per-prospect unsubscribe_token so every email includes a unique,
--      forgery-resistant one-click opt-out link.
--   2. outreach_sequence_state to track each step of each prospect's
--      drip (scheduled → sent → opened/clicked/replied/bounced/skipped).
-- ============================================================

-- 1. Per-prospect unsubscribe token. Generated at insert; ensures we can
-- verify the link without storing a global secret or signing JWTs.
do $$ begin
    alter table public.outreach_prospects
        add column unsubscribe_token text unique default md5(random()::text || clock_timestamp()::text);
exception when duplicate_column then null;
end $$;

-- Backfill any existing rows that lack a token.
update public.outreach_prospects
    set unsubscribe_token = md5(random()::text || clock_timestamp()::text || id::text)
    where unsubscribe_token is null;

alter table public.outreach_prospects
    alter column unsubscribe_token set not null;


-- 2. Sequence state — one row per (prospect, step).
create table if not exists public.outreach_sequence_state (
    id               uuid primary key default gen_random_uuid(),
    prospect_id      uuid not null references public.outreach_prospects(id) on delete cascade,
    step_index       integer not null,
    template_key     text not null,
    status           text not null default 'scheduled'
        check (status in ('scheduled', 'sent', 'opened', 'clicked', 'replied', 'bounced', 'skipped', 'failed')),
    scheduled_for    timestamptz,
    sent_at          timestamptz,
    opened_at        timestamptz,
    clicked_at       timestamptz,
    bounced_at       timestamptz,
    replied_at       timestamptz,
    error_msg        text,
    resend_message_id text,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

create unique index if not exists uq_outreach_sequence_prospect_step
    on public.outreach_sequence_state(prospect_id, step_index);
create index if not exists idx_outreach_sequence_status_scheduled
    on public.outreach_sequence_state(status, scheduled_for)
    where status = 'scheduled';
create index if not exists idx_outreach_sequence_prospect
    on public.outreach_sequence_state(prospect_id);

alter table public.outreach_sequence_state enable row level security;

drop policy if exists "outreach_sequence admin all" on public.outreach_sequence_state;
create policy "outreach_sequence admin all"
    on public.outreach_sequence_state
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

comment on table public.outreach_sequence_state is
    '3-step cold-outreach drip tracking. step_index 0=intro, 1=followup (+3d), 2=final (+7d). The send cron flips scheduled → sent; webhooks from Resend update opened/clicked/replied/bounced.';
comment on column public.outreach_prospects.unsubscribe_token is
    'Per-prospect token embedded in the List-Unsubscribe header + footer link. Token-only lookup at /api/outreach/unsubscribe so unsub works without login.';
