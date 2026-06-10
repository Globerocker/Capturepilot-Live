-- ============================================================
-- Migration 148: email warmup schedule + reply log (R3-M5.2)
-- ============================================================
-- Email warmup = gradual ramp-up of sending volume from a new
-- IP / domain to build sender reputation with mailbox providers
-- (Gmail / Outlook / Yahoo). Sending too many cold emails too
-- fast from a fresh sending domain trips spam filters and the
-- domain ends up on blocklists.
--
-- The warmup schedule is a 30-day graduated curve (~50 → 1000
-- per day). A cron runs every 30 min during business hours,
-- reads today's target, and tops up if we're under capacity.
-- A separate `email_warmup_replies` table logs replies from the
-- friendly peer mailbox list so we can audit engagement signals.
-- ============================================================

-- ---- email_warmup_schedule -------------------------------------------------
create table if not exists public.email_warmup_schedule (
    id              uuid primary key default gen_random_uuid(),
    schedule_date   date not null,
    target_volume   integer not null,
    actual_volume   integer not null default 0,
    mailbox_address text not null default 'default',
    paused          boolean not null default false,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    unique (schedule_date, mailbox_address)
);

create index if not exists idx_email_warmup_schedule_date
    on public.email_warmup_schedule (schedule_date desc);

comment on table public.email_warmup_schedule is
    'Daily target / actual warmup send volume per mailbox. The cron at /api/cron/email_warmup_send reads target_volume for today and tops up actual_volume by sending warmup-peer emails until the daily target is hit.';

-- ---- email_warmup_replies --------------------------------------------------
-- Logs replies from the warmup peer list. A real ISP signal — replies count
-- much more than opens or clicks toward sender-reputation building. We don't
-- have a webhook for inbound replies yet, so this table is filled by the
-- Resend inbound webhook + the manual peer-acknowledgement endpoint.
create table if not exists public.email_warmup_replies (
    id              uuid primary key default gen_random_uuid(),
    sent_to         text not null,          -- the warmup peer address that received the email
    received_from   text not null,          -- which CapturePilot mailbox sent it
    received_at     timestamptz not null default now(),
    body_excerpt    text,                   -- first 500 chars of reply body (for auditing only)
    created_at      timestamptz not null default now()
);

create index if not exists idx_email_warmup_replies_received_at
    on public.email_warmup_replies (received_at desc);

create index if not exists idx_email_warmup_replies_sent_to
    on public.email_warmup_replies (sent_to);

comment on table public.email_warmup_replies is
    'Inbound replies from warmup peer mailboxes. ISP reputation signal: replies are higher-value than opens. Filled by Resend inbound webhook or manual peer acknowledgement.';

-- ---- RLS: admin-only -------------------------------------------------------
alter table public.email_warmup_schedule enable row level security;
alter table public.email_warmup_replies enable row level security;

drop policy if exists email_warmup_schedule_admin_select on public.email_warmup_schedule;
create policy email_warmup_schedule_admin_select on public.email_warmup_schedule
    for select using (
        exists (
            select 1 from public.user_profiles
            where user_profiles.auth_user_id = auth.uid()
              and user_profiles.account_type = 'admin'
        )
    );

drop policy if exists email_warmup_replies_admin_select on public.email_warmup_replies;
create policy email_warmup_replies_admin_select on public.email_warmup_replies
    for select using (
        exists (
            select 1 from public.user_profiles
            where user_profiles.auth_user_id = auth.uid()
              and user_profiles.account_type = 'admin'
        )
    );

-- ---- Seed the next 30 days with the graduated curve ----------------------
-- Curve: 50, 75, 100, 125, ... +25/day for the first 8 days, then +50/day
-- until we cap at 1000/day. Tuned for a fresh domain; you can edit the
-- schedule rows manually from /admin/outreach Settings tab if you want a
-- different ramp.
do $$
declare
    i integer;
    target integer;
begin
    for i in 0..29 loop
        if i < 8 then
            target := 50 + (i * 25);            -- 50, 75, 100, 125, 150, 175, 200, 225
        else
            target := 225 + ((i - 7) * 50);     -- 275, 325, 375, ... cap at 1000
            if target > 1000 then target := 1000; end if;
        end if;

        insert into public.email_warmup_schedule (schedule_date, target_volume, mailbox_address)
        values ((current_date + i)::date, target, 'default')
        on conflict (schedule_date, mailbox_address) do nothing;
    end loop;
end $$;
