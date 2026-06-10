-- Migration 035 — Outreach inbox (R3-M3.6)
--
-- Adds the outreach reply pipeline: incoming replies tied to a campaign,
-- contact, and originating step. Each reply carries an LLM-classified
-- sentiment + intent + confidence so we can triage at scale.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────────
-- Tables we depend on. Light shells so this migration can apply on
-- a base that hasn't been through R1/R2 yet. Each `if not exists`
-- block is a no-op when the table already lives in the schema.
-- ─────────────────────────────────────────────────────────────────

create table if not exists outreach_campaigns (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    status text not null default 'draft',
    owner_id uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists outreach_contacts (
    id uuid primary key default gen_random_uuid(),
    email text not null,
    name text,
    company text,
    title text,
    tags text[] not null default '{}',
    campaign_id uuid references outreach_campaigns(id) on delete set null,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists outreach_contacts_email_idx on outreach_contacts (lower(email));
create index if not exists outreach_contacts_campaign_idx on outreach_contacts (campaign_id);

create table if not exists outreach_steps (
    id uuid primary key default gen_random_uuid(),
    campaign_id uuid references outreach_campaigns(id) on delete cascade,
    step_number int not null default 1,
    subject text,
    body text,
    created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────
-- worker_jobs is created in a later migration when R2 lands. Stub
-- it here so the reclassify endpoint never has to special-case a
-- missing table. The R2 migration uses `if not exists` so the real
-- definition will overlay this without dropping data.
-- ─────────────────────────────────────────────────────────────────

create table if not exists worker_jobs (
    id uuid primary key default gen_random_uuid(),
    task_type text not null,
    payload jsonb not null default '{}'::jsonb,
    priority int not null default 100,
    status text not null default 'pending',
    attempts int not null default 0,
    error text,
    result jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists worker_jobs_status_idx on worker_jobs (status, task_type);

-- ─────────────────────────────────────────────────────────────────
-- The inbox itself
-- ─────────────────────────────────────────────────────────────────

create table if not exists outreach_replies (
    id uuid primary key default gen_random_uuid(),

    -- Threading
    message_id text,                      -- IMAP / Resend message id
    in_reply_to text,                     -- header of the message we sent
    thread_id text,                       -- our internal thread key
    references_header text,               -- email References: header for proper threading

    -- Origin
    campaign_id uuid references outreach_campaigns(id) on delete set null,
    contact_id uuid references outreach_contacts(id) on delete set null,
    step_id uuid references outreach_steps(id) on delete set null,

    -- Message
    from_email text not null,
    from_name text,
    to_email text,
    subject text,
    body_text text,
    body_html text,
    snippet text,                          -- pre-rendered 180-char preview
    received_at timestamptz not null default now(),

    -- Triage
    sentiment text not null default 'unsure'
        check (sentiment in ('positive','neutral','negative','auto_reply','unsubscribe','unsure')),
    sentiment_source text not null default 'auto'
        check (sentiment_source in ('auto','manual')),
    intent text,                           -- e.g. interested / meeting / out_of_office / not_now
    confidence numeric(4,3),               -- 0..1 from classifier
    meeting_url text,                      -- parsed Calendly / Google Meet link
    extracted jsonb not null default '{}'::jsonb,

    -- State
    is_handled boolean not null default false,
    handled_at timestamptz,
    handled_by uuid references auth.users(id) on delete set null,
    notes text,

    -- Timestamps
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists outreach_replies_handled_idx
    on outreach_replies (is_handled, received_at desc);
create index if not exists outreach_replies_sentiment_idx
    on outreach_replies (sentiment, received_at desc);
create index if not exists outreach_replies_campaign_idx
    on outreach_replies (campaign_id, received_at desc);
create index if not exists outreach_replies_contact_idx
    on outreach_replies (contact_id);
create index if not exists outreach_replies_message_idx
    on outreach_replies (message_id);

-- Trigger to keep updated_at fresh
create or replace function tg_outreach_replies_touch()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists outreach_replies_touch on outreach_replies;
create trigger outreach_replies_touch
before update on outreach_replies
for each row execute function tg_outreach_replies_touch();

-- ─────────────────────────────────────────────────────────────────
-- Manual replies sent from the inbox composer. We log every send
-- so the conversation thread can be rebuilt without IMAP.
-- ─────────────────────────────────────────────────────────────────

create table if not exists outreach_reply_sends (
    id uuid primary key default gen_random_uuid(),
    reply_id uuid not null references outreach_replies(id) on delete cascade,
    sent_by uuid references auth.users(id) on delete set null,
    to_email text not null,
    subject text,
    body text,
    provider_message_id text,
    error text,
    created_at timestamptz not null default now()
);

create index if not exists outreach_reply_sends_reply_idx
    on outreach_reply_sends (reply_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────
-- RLS — service role only (admin endpoints front this table)
-- ─────────────────────────────────────────────────────────────────

alter table outreach_replies enable row level security;
alter table outreach_reply_sends enable row level security;

drop policy if exists outreach_replies_service on outreach_replies;
create policy outreach_replies_service on outreach_replies
    for all to service_role using (true) with check (true);

drop policy if exists outreach_reply_sends_service on outreach_reply_sends;
create policy outreach_reply_sends_service on outreach_reply_sends
    for all to service_role using (true) with check (true);

comment on table outreach_replies is 'Inbox of replies to outbound campaigns. R3-M3.6.';
comment on column outreach_replies.sentiment is
    'positive | neutral | negative | auto_reply | unsubscribe | unsure';
comment on column outreach_replies.sentiment_source is
    'auto = LLM classified, manual = admin override';
