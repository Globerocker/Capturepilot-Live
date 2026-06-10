-- ============================================================
-- Migration 148: Outreach campaigns (R3-M3.2)
-- ============================================================
-- Adds a richer campaign + step model on top of the existing
-- outreach_prospects pipeline. The legacy 3-step drip in
-- outreach_sequence_state stays — these tables are the new home
-- for user-authored multi-step Email/SMS cadences with A/B variants,
-- segment targeting, throttling, and send-window controls.
--
-- Tables:
--   outreach_campaigns          — top-level campaign config
--   outreach_campaign_steps     — ordered steps (channel/delay/body)
--   outreach_campaign_contacts  — enrolled contacts per campaign
--   outreach_campaign_events    — send/open/click/reply log
-- ============================================================

create table if not exists public.outreach_campaigns (
    id                  uuid primary key default gen_random_uuid(),

    -- Basics
    name                text not null,
    description         text,
    channels            text[] not null default '{email}'
        check (channels <@ array['email','sms']),
    sender_email        text,
    sender_name         text,

    -- Audience
    target_segment      jsonb not null default '{}'::jsonb,
    -- shape: { naics: text[], states: text[], certs: text[], tags: text[], custom_filter: text, list_id: uuid|null }
    estimated_reach     integer default 0,

    -- Send settings
    throttle_per_hour   integer not null default 60,
    send_window_start   text default '09:00',   -- "HH:MM" local
    send_window_end     text default '17:00',
    send_window_tz      text default 'America/New_York',

    -- Compliance
    physical_address    text,
    unsubscribe_footer  text default 'You received this because we found you in public SAM.gov records. Unsubscribe: {{unsubscribe_url}}',

    -- Lifecycle
    status              text not null default 'draft'
        check (status in ('draft','active','paused','completed','archived')),
    started_at          timestamptz,
    completed_at        timestamptz,
    archived_at         timestamptz,

    -- Stats (denormalized for the list view; updated by event triggers)
    contacts_count      integer not null default 0,
    sent_count          integer not null default 0,
    open_count          integer not null default 0,
    click_count         integer not null default 0,
    reply_count         integer not null default 0,
    bounce_count        integer not null default 0,

    created_by          uuid references auth.users(id),
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

create index if not exists idx_outreach_campaigns_status
    on public.outreach_campaigns(status);
create index if not exists idx_outreach_campaigns_created
    on public.outreach_campaigns(created_at desc);


create table if not exists public.outreach_campaign_steps (
    id                  uuid primary key default gen_random_uuid(),
    campaign_id         uuid not null references public.outreach_campaigns(id) on delete cascade,
    step_index          integer not null,        -- 0-based ordering
    channel             text not null
        check (channel in ('email','sms','wait')),

    -- Timing: send N units after the previous step (or campaign start if step 0)
    delay_value         integer not null default 0,
    delay_unit          text not null default 'hours'
        check (delay_unit in ('minutes','hours','days')),
    after_step          integer,                 -- null = after campaign start

    -- Email content
    subject             text,
    body                text not null default '',
    body_format         text not null default 'text'
        check (body_format in ('text','html','markdown')),

    -- Behavior
    skip_if_replied     boolean not null default true,
    skip_if_clicked     boolean not null default false,

    -- A/B variants — when a step has variants, contacts get randomly
    -- assigned weighted by variant_weight. The "parent" step keeps step_index;
    -- variants share step_index but get distinct variant_key.
    variant_key         text default 'A',
    variant_weight      integer not null default 100,

    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

create unique index if not exists uq_campaign_steps_index_variant
    on public.outreach_campaign_steps(campaign_id, step_index, variant_key);
create index if not exists idx_campaign_steps_campaign
    on public.outreach_campaign_steps(campaign_id, step_index);


create table if not exists public.outreach_campaign_contacts (
    id                  uuid primary key default gen_random_uuid(),
    campaign_id         uuid not null references public.outreach_campaigns(id) on delete cascade,
    prospect_id         uuid references public.outreach_prospects(id) on delete cascade,

    -- Denormalized identity (so SMS/non-prospect lists also work)
    email               text,
    phone               text,
    first_name          text,
    last_name           text,
    company_name        text,

    -- Per-contact merge fields
    merge_fields        jsonb not null default '{}'::jsonb,

    -- Variant assignment
    variant_key         text default 'A',

    -- Lifecycle
    status              text not null default 'enrolled'
        check (status in ('enrolled','sending','completed','replied','bounced','opted_out','skipped')),
    current_step        integer not null default 0,
    next_send_at        timestamptz,

    enrolled_at         timestamptz not null default now(),
    completed_at        timestamptz,

    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

create index if not exists idx_campaign_contacts_campaign
    on public.outreach_campaign_contacts(campaign_id);
create index if not exists idx_campaign_contacts_next_send
    on public.outreach_campaign_contacts(next_send_at)
    where status in ('enrolled','sending');
create unique index if not exists uq_campaign_contacts_email
    on public.outreach_campaign_contacts(campaign_id, lower(email))
    where email is not null;


create table if not exists public.outreach_campaign_events (
    id                  uuid primary key default gen_random_uuid(),
    campaign_id         uuid not null references public.outreach_campaigns(id) on delete cascade,
    contact_id          uuid not null references public.outreach_campaign_contacts(id) on delete cascade,
    step_index          integer not null,
    variant_key         text default 'A',

    event_type          text not null
        check (event_type in ('sent','delivered','opened','clicked','replied','bounced','complained','unsubscribed','failed')),
    provider_message_id text,
    error_msg           text,

    created_at          timestamptz not null default now()
);

create index if not exists idx_campaign_events_campaign
    on public.outreach_campaign_events(campaign_id, created_at desc);
create index if not exists idx_campaign_events_contact
    on public.outreach_campaign_events(contact_id);


-- ============================================================
-- Row-level security — admin-only across the board.
-- ============================================================
alter table public.outreach_campaigns enable row level security;
alter table public.outreach_campaign_steps enable row level security;
alter table public.outreach_campaign_contacts enable row level security;
alter table public.outreach_campaign_events enable row level security;

do $$ begin
    drop policy if exists "outreach_campaigns admin all" on public.outreach_campaigns;
    create policy "outreach_campaigns admin all"
        on public.outreach_campaigns
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

    drop policy if exists "outreach_campaign_steps admin all" on public.outreach_campaign_steps;
    create policy "outreach_campaign_steps admin all"
        on public.outreach_campaign_steps
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

    drop policy if exists "outreach_campaign_contacts admin all" on public.outreach_campaign_contacts;
    create policy "outreach_campaign_contacts admin all"
        on public.outreach_campaign_contacts
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

    drop policy if exists "outreach_campaign_events admin all" on public.outreach_campaign_events;
    create policy "outreach_campaign_events admin all"
        on public.outreach_campaign_events
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
end $$;


comment on table public.outreach_campaigns is
    'R3-M3.2 — multi-channel cold-outreach campaigns. Replaces the rigid 3-step drip with user-authored cadences.';
comment on table public.outreach_campaign_steps is
    'Ordered steps within a campaign. variant_key lets a step have A/B variants weighted by variant_weight.';
comment on table public.outreach_campaign_contacts is
    'Per-campaign enrolled contacts. next_send_at drives the send worker.';
comment on table public.outreach_campaign_events is
    'Full event log per send (sent/open/click/reply/bounce). Drives campaign stats + reply_rate.';
