-- ============================================================
-- Migration 148: Outreach campaign core schema (R3-M1.1)
-- ============================================================
-- The 042/051 outreach pipeline was a simple linear drip targeting a single
-- table of cold-prospects. R3 introduces a real multi-channel campaign engine
-- with branching steps, A/B variants, contact lists, and KPI reporting.
--
-- Tables introduced:
--   outreach_campaigns           - top-level campaign config (channels, throttle, status)
--   outreach_campaign_steps      - ordered steps (email/sms/wait + A/B variants)
--   outreach_contacts            - universal contact directory (email/sms recipients)
--   outreach_campaign_contacts   - membership + per-contact campaign state
--   outreach_campaign_step_runs  - per-step send + engagement events
--   outreach_lists               - saved contact lists (filter or static)
--   outreach_list_members        - membership join (static lists)
--
-- RPC helpers:
--   get_campaign_kpis            - per-campaign sent/delivered/opened/clicked/replied
--   get_outreach_dashboard_kpis  - aggregate across all campaigns
--   get_outreach_timeseries      - daily/weekly counts for charts
--
-- The legacy `outreach_prospects`, `outreach_sequence_state`, and
-- `outreach_optouts` tables stay in place — they back the legacy 3-step drip
-- and the global suppression list. The new tables refer to `outreach_optouts`
-- as the suppression source of truth.
-- ============================================================

-- ------------------------------------------------------------
-- 1. outreach_campaigns
-- ------------------------------------------------------------
create table if not exists public.outreach_campaigns (
    id              uuid primary key default gen_random_uuid(),
    name            text not null,
    description     text,
    -- One campaign can fan out across channels. We keep an array rather than
    -- a single column so a "warm" campaign can do (email then sms reminder)
    -- without a second campaign row.
    channels        text[] not null default array['email']::text[]
        check (channels <@ array['email', 'sms']::text[] and array_length(channels, 1) >= 1),
    status          text not null default 'draft'
        check (status in ('draft', 'active', 'paused', 'completed', 'archived')),
    sender_email    text,
    sender_name     text,
    -- Snapshot of the filter the user ran when launching. Schema is flexible:
    -- { naics: [], states: [], tags: [], list_id: uuid, custom: {...} }
    target_segment  jsonb not null default '{}'::jsonb,
    created_by      uuid references public.user_profiles(id) on delete set null,
    -- Throttling lives on the campaign so we can pace sends without a global
    -- knob. Defaults are conservative — admins can dial up per campaign.
    -- { sends_per_hour: int, send_window_start: 'HH:MM',
    --   send_window_end: 'HH:MM', timezone: 'America/New_York' }
    throttle        jsonb not null default jsonb_build_object(
        'sends_per_hour', 50,
        'send_window_start', '09:00',
        'send_window_end', '17:00',
        'timezone', 'America/New_York'
    ),
    -- Cached roll-up so list views don't have to aggregate step_runs.
    -- Refreshed by /api/cron/refresh_campaign_stats or the send worker.
    stats           jsonb not null default '{}'::jsonb,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    started_at      timestamptz,
    completed_at    timestamptz
);

create index if not exists idx_outreach_campaigns_status
    on public.outreach_campaigns(status, created_at desc);
create index if not exists idx_outreach_campaigns_created_by
    on public.outreach_campaigns(created_by);

-- ------------------------------------------------------------
-- 2. outreach_campaign_steps
-- ------------------------------------------------------------
-- A step is either an action (email/sms) or a wait. A/B variants share the
-- same step_order and point at the canonical step via ab_variant_of.
create table if not exists public.outreach_campaign_steps (
    id               uuid primary key default gen_random_uuid(),
    campaign_id      uuid not null references public.outreach_campaigns(id) on delete cascade,
    step_order       integer not null,
    channel          text not null
        check (channel in ('email', 'sms', 'wait')),
    delay_value      integer not null default 0,
    delay_unit       text not null default 'hours'
        check (delay_unit in ('minutes', 'hours', 'days')),
    subject          text,           -- email only
    body_template    text,           -- nullable for 'wait' steps
    skip_if_replied  boolean not null default true,
    skip_if_clicked  boolean not null default false,
    -- A/B testing: parent variant points at NULL, children point at the parent
    -- step id. We pick a variant at contact-activation time via weight.
    ab_variant_of    uuid references public.outreach_campaign_steps(id) on delete cascade,
    variant_weight   integer not null default 100
        check (variant_weight between 0 and 100),
    created_at       timestamptz not null default now()
);

-- One step per (campaign, step_order) for the canonical row; A/B variants
-- share the same step_order but have a non-null ab_variant_of, so the unique
-- index uses (campaign_id, step_order, coalesce(ab_variant_of, '00000000-...')).
-- NULLS FIRST behaviour is unreliable in Postgres unique indexes, so we use
-- coalesce to a sentinel UUID to make NULL distinct from any real UUID.
create unique index if not exists uq_outreach_campaign_steps_canonical
    on public.outreach_campaign_steps(
        campaign_id, step_order,
        coalesce(ab_variant_of, '00000000-0000-0000-0000-000000000000'::uuid)
    );

create index if not exists idx_outreach_campaign_steps_campaign
    on public.outreach_campaign_steps(campaign_id, step_order);

-- ------------------------------------------------------------
-- 3. outreach_contacts
-- ------------------------------------------------------------
-- Universal contact directory. Distinct from `contractors` (which is a SAM.gov
-- entity reference table) and `contacts` (SAM.gov opportunity POCs). Both can
-- feed into this table via `source` + `source_id`.
create table if not exists public.outreach_contacts (
    id                  uuid primary key default gen_random_uuid(),
    email               text,
    phone               text,
    first_name          text,
    last_name           text,
    company_name        text,
    title               text,
    naics_codes         text[] not null default '{}',
    state               text,
    source              text
        check (source in (
            'sam_gov', 'apollo', 'manual_import',
            'hubspot_sync', 'csv_import'
        )),
    source_id           text,
    tags                text[] not null default '{}',
    custom_fields       jsonb not null default '{}'::jsonb,
    engagement_score    integer not null default 0,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    last_engagement_at  timestamptz,
    last_replied_at     timestamptz,
    last_bounced_at     timestamptz,
    opted_out_at        timestamptz
);

-- Email-based dedup. NULL emails (SMS-only contacts) are not unique.
create unique index if not exists uq_outreach_contacts_email
    on public.outreach_contacts(lower(email))
    where email is not null;

create index if not exists idx_outreach_contacts_phone
    on public.outreach_contacts(phone) where phone is not null;
create index if not exists idx_outreach_contacts_naics
    on public.outreach_contacts using gin(naics_codes);
create index if not exists idx_outreach_contacts_tags
    on public.outreach_contacts using gin(tags);
create index if not exists idx_outreach_contacts_state
    on public.outreach_contacts(state) where state is not null;
create index if not exists idx_outreach_contacts_source
    on public.outreach_contacts(source, source_id);

-- ------------------------------------------------------------
-- 4. outreach_campaign_contacts
-- ------------------------------------------------------------
-- Per-contact campaign state. One row per (campaign, contact). Drives the
-- scheduler: rows where status='active' and next_send_at <= now() are the work
-- queue for the send worker.
create table if not exists public.outreach_campaign_contacts (
    id              uuid primary key default gen_random_uuid(),
    campaign_id     uuid not null references public.outreach_campaigns(id) on delete cascade,
    contact_id      uuid not null references public.outreach_contacts(id) on delete cascade,
    status          text not null default 'queued'
        check (status in (
            'queued', 'active', 'paused', 'completed',
            'replied', 'bounced', 'unsubscribed', 'failed'
        )),
    current_step    integer not null default 0,
    -- When a contact gets assigned an A/B variant at step k, we pin the
    -- variant id here so subsequent renders use the same one (sticky A/B).
    current_variant uuid references public.outreach_campaign_steps(id) on delete set null,
    next_send_at    timestamptz,
    added_at        timestamptz not null default now(),
    finished_at     timestamptz
);

create unique index if not exists uq_outreach_campaign_contacts
    on public.outreach_campaign_contacts(campaign_id, contact_id);

-- Send worker query: WHERE status='active' AND next_send_at <= now()
create index if not exists idx_outreach_campaign_contacts_due
    on public.outreach_campaign_contacts(status, next_send_at)
    where status in ('queued', 'active');

create index if not exists idx_outreach_campaign_contacts_campaign_status
    on public.outreach_campaign_contacts(campaign_id, status);

create index if not exists idx_outreach_campaign_contacts_contact
    on public.outreach_campaign_contacts(contact_id);

-- ------------------------------------------------------------
-- 5. outreach_campaign_step_runs
-- ------------------------------------------------------------
-- One row per (campaign_contact, step) actually executed. Receives provider
-- webhook updates (Resend for email, Twilio for SMS) keyed by provider_message_id.
create table if not exists public.outreach_campaign_step_runs (
    id                   uuid primary key default gen_random_uuid(),
    campaign_contact_id  uuid not null references public.outreach_campaign_contacts(id) on delete cascade,
    step_id              uuid references public.outreach_campaign_steps(id) on delete set null,
    channel              text not null
        check (channel in ('email', 'sms')),
    sent_at              timestamptz,
    provider_message_id  text,
    status               text not null default 'queued'
        check (status in (
            'queued', 'sent', 'delivered', 'opened', 'clicked',
            'replied', 'bounced', 'complained', 'failed'
        )),
    delivered_at         timestamptz,
    opened_at            timestamptz,
    first_click_at       timestamptz,
    last_click_at        timestamptz,
    replied_at           timestamptz,
    bounced_at           timestamptz,
    complained_at        timestamptz,
    error_message        text,
    rendered_subject     text,
    rendered_body        text,
    -- Mirror the variant pin from outreach_campaign_contacts so we don't have
    -- to walk back through joins for reporting.
    ab_variant_id        uuid references public.outreach_campaign_steps(id) on delete set null,
    created_at           timestamptz not null default now()
);

create index if not exists idx_outreach_step_runs_provider_msg
    on public.outreach_campaign_step_runs(provider_message_id)
    where provider_message_id is not null;

create index if not exists idx_outreach_step_runs_campaign_contact
    on public.outreach_campaign_step_runs(campaign_contact_id, created_at desc);

create index if not exists idx_outreach_step_runs_status_sent
    on public.outreach_campaign_step_runs(status, sent_at desc);

create index if not exists idx_outreach_step_runs_step
    on public.outreach_campaign_step_runs(step_id);

-- ------------------------------------------------------------
-- 6. outreach_lists + outreach_list_members
-- ------------------------------------------------------------
-- Saved contact lists. Dynamic lists store a filter JSON and refresh on read;
-- static lists materialize via outreach_list_members.
create table if not exists public.outreach_lists (
    id              uuid primary key default gen_random_uuid(),
    name            text not null,
    description     text,
    -- { naics: [], states: [], tags: [], custom_sql: '...' }
    filter          jsonb not null default '{}'::jsonb,
    contact_count   integer not null default 0,
    created_by      uuid references public.user_profiles(id) on delete set null,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists idx_outreach_lists_created_by
    on public.outreach_lists(created_by);

create table if not exists public.outreach_list_members (
    list_id     uuid not null references public.outreach_lists(id) on delete cascade,
    contact_id  uuid not null references public.outreach_contacts(id) on delete cascade,
    added_at    timestamptz not null default now(),
    primary key (list_id, contact_id)
);

create index if not exists idx_outreach_list_members_contact
    on public.outreach_list_members(contact_id);

-- ------------------------------------------------------------
-- 7. RLS — admin-only across all new tables
-- ------------------------------------------------------------
alter table public.outreach_campaigns           enable row level security;
alter table public.outreach_campaign_steps      enable row level security;
alter table public.outreach_contacts            enable row level security;
alter table public.outreach_campaign_contacts   enable row level security;
alter table public.outreach_campaign_step_runs  enable row level security;
alter table public.outreach_lists               enable row level security;
alter table public.outreach_list_members        enable row level security;

-- Helper policy block: admin-only via user_profiles.account_type='admin'.
-- Service role bypasses RLS so the send worker and webhook receivers do not
-- need an extra policy. We keep the policies tight: SELECT/INSERT/UPDATE/DELETE
-- gated to admins for the UI.
do $$
declare
    t text;
begin
    foreach t in array array[
        'outreach_campaigns',
        'outreach_campaign_steps',
        'outreach_contacts',
        'outreach_campaign_contacts',
        'outreach_campaign_step_runs',
        'outreach_lists',
        'outreach_list_members'
    ] loop
        execute format('drop policy if exists %I on public.%I',
            t || '_admin_all', t);
        execute format($pol$
            create policy %I on public.%I
                for all to authenticated
                using (
                    exists (
                        select 1 from public.user_profiles
                        where auth_user_id = auth.uid()
                          and account_type = 'admin'
                    )
                )
                with check (
                    exists (
                        select 1 from public.user_profiles
                        where auth_user_id = auth.uid()
                          and account_type = 'admin'
                    )
                )
        $pol$, t || '_admin_all', t);
    end loop;
end $$;

-- ------------------------------------------------------------
-- 8. RPC: get_campaign_kpis
-- ------------------------------------------------------------
-- Returns aggregated counts + rates for a single campaign over a time window.
-- Used by /admin/outreach/campaigns/[id] detail page + KPI tiles.
create or replace function public.get_campaign_kpis(
    p_campaign_id uuid,
    p_from        timestamptz default (now() - interval '30 days'),
    p_to          timestamptz default now()
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
    result jsonb;
    v_sent         bigint := 0;
    v_delivered    bigint := 0;
    v_opened       bigint := 0;
    v_clicked      bigint := 0;
    v_replied      bigint := 0;
    v_bounced      bigint := 0;
    v_complained   bigint := 0;
    v_unsubscribed bigint := 0;
begin
    select
        count(*) filter (where r.status in ('sent','delivered','opened','clicked','replied')),
        count(*) filter (where r.delivered_at is not null),
        count(*) filter (where r.opened_at is not null),
        count(*) filter (where r.first_click_at is not null),
        count(*) filter (where r.replied_at is not null),
        count(*) filter (where r.bounced_at is not null),
        count(*) filter (where r.complained_at is not null)
    into v_sent, v_delivered, v_opened, v_clicked, v_replied, v_bounced, v_complained
    from public.outreach_campaign_step_runs r
    join public.outreach_campaign_contacts cc on cc.id = r.campaign_contact_id
    where cc.campaign_id = p_campaign_id
      and r.created_at between p_from and p_to;

    select count(*)
    into v_unsubscribed
    from public.outreach_campaign_contacts
    where campaign_id = p_campaign_id
      and status = 'unsubscribed'
      and added_at between p_from and p_to;

    result := jsonb_build_object(
        'campaign_id', p_campaign_id,
        'from', p_from,
        'to', p_to,
        'sent', v_sent,
        'delivered', v_delivered,
        'opened', v_opened,
        'clicked', v_clicked,
        'replied', v_replied,
        'bounced', v_bounced,
        'complained', v_complained,
        'unsubscribed', v_unsubscribed,
        'delivery_rate', case when v_sent > 0 then round(v_delivered::numeric / v_sent, 4) else 0 end,
        'open_rate',     case when v_delivered > 0 then round(v_opened::numeric / v_delivered, 4) else 0 end,
        'click_rate',    case when v_delivered > 0 then round(v_clicked::numeric / v_delivered, 4) else 0 end,
        'reply_rate',    case when v_delivered > 0 then round(v_replied::numeric / v_delivered, 4) else 0 end,
        'bounce_rate',   case when v_sent > 0 then round(v_bounced::numeric / v_sent, 4) else 0 end
    );

    return result;
end
$$;

-- ------------------------------------------------------------
-- 9. RPC: get_outreach_dashboard_kpis
-- ------------------------------------------------------------
-- Aggregate across every campaign for the top-level /admin/outreach dashboard.
create or replace function public.get_outreach_dashboard_kpis(
    p_from timestamptz default (now() - interval '30 days'),
    p_to   timestamptz default now()
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
    result jsonb;
    v_active_campaigns   bigint := 0;
    v_total_contacts     bigint := 0;
    v_sent               bigint := 0;
    v_delivered          bigint := 0;
    v_opened             bigint := 0;
    v_clicked            bigint := 0;
    v_replied            bigint := 0;
    v_bounced            bigint := 0;
    v_complained         bigint := 0;
    v_unsubscribed       bigint := 0;
begin
    select count(*) into v_active_campaigns
    from public.outreach_campaigns where status = 'active';

    select count(*) into v_total_contacts
    from public.outreach_contacts;

    select
        count(*) filter (where status in ('sent','delivered','opened','clicked','replied')),
        count(*) filter (where delivered_at is not null),
        count(*) filter (where opened_at is not null),
        count(*) filter (where first_click_at is not null),
        count(*) filter (where replied_at is not null),
        count(*) filter (where bounced_at is not null),
        count(*) filter (where complained_at is not null)
    into v_sent, v_delivered, v_opened, v_clicked, v_replied, v_bounced, v_complained
    from public.outreach_campaign_step_runs
    where created_at between p_from and p_to;

    select count(*) into v_unsubscribed
    from public.outreach_campaign_contacts
    where status = 'unsubscribed' and added_at between p_from and p_to;

    result := jsonb_build_object(
        'from', p_from,
        'to', p_to,
        'active_campaigns', v_active_campaigns,
        'total_contacts', v_total_contacts,
        'sent', v_sent,
        'delivered', v_delivered,
        'opened', v_opened,
        'clicked', v_clicked,
        'replied', v_replied,
        'bounced', v_bounced,
        'complained', v_complained,
        'unsubscribed', v_unsubscribed,
        'delivery_rate', case when v_sent > 0 then round(v_delivered::numeric / v_sent, 4) else 0 end,
        'open_rate',     case when v_delivered > 0 then round(v_opened::numeric / v_delivered, 4) else 0 end,
        'click_rate',    case when v_delivered > 0 then round(v_clicked::numeric / v_delivered, 4) else 0 end,
        'reply_rate',    case when v_delivered > 0 then round(v_replied::numeric / v_delivered, 4) else 0 end,
        'bounce_rate',   case when v_sent > 0 then round(v_bounced::numeric / v_sent, 4) else 0 end
    );

    return result;
end
$$;

-- ------------------------------------------------------------
-- 10. RPC: get_outreach_timeseries
-- ------------------------------------------------------------
-- Returns daily or weekly counts of sent / opened / replied across all
-- campaigns. Drives the time-series chart on /admin/outreach.
create or replace function public.get_outreach_timeseries(
    p_from     timestamptz default (now() - interval '30 days'),
    p_to       timestamptz default now(),
    p_interval text         default 'day'
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
    v_trunc text;
    v_rows  jsonb;
begin
    if p_interval not in ('day', 'week') then
        raise exception 'p_interval must be ''day'' or ''week''';
    end if;
    v_trunc := p_interval;

    select coalesce(jsonb_agg(row_to_json(t) order by t.bucket), '[]'::jsonb)
    into v_rows
    from (
        select
            date_trunc(v_trunc, r.created_at) as bucket,
            count(*) filter (where r.status in ('sent','delivered','opened','clicked','replied')) as sent,
            count(*) filter (where r.delivered_at is not null)   as delivered,
            count(*) filter (where r.opened_at is not null)      as opened,
            count(*) filter (where r.first_click_at is not null) as clicked,
            count(*) filter (where r.replied_at is not null)     as replied,
            count(*) filter (where r.bounced_at is not null)     as bounced
        from public.outreach_campaign_step_runs r
        where r.created_at between p_from and p_to
        group by 1
    ) t;

    return jsonb_build_object(
        'from', p_from,
        'to', p_to,
        'interval', p_interval,
        'series', v_rows
    );
end
$$;

-- ------------------------------------------------------------
-- 11. Permissions on RPCs
-- ------------------------------------------------------------
-- These RPCs are read-only aggregations and are safe to expose to admin UI
-- via the authenticated role. Service role can always invoke. We do NOT
-- grant to anon — outreach data must never leak publicly.
revoke execute on function public.get_campaign_kpis(uuid, timestamptz, timestamptz) from public;
revoke execute on function public.get_outreach_dashboard_kpis(timestamptz, timestamptz) from public;
revoke execute on function public.get_outreach_timeseries(timestamptz, timestamptz, text) from public;

grant execute on function public.get_campaign_kpis(uuid, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.get_outreach_dashboard_kpis(timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.get_outreach_timeseries(timestamptz, timestamptz, text) to authenticated, service_role;

-- ------------------------------------------------------------
-- 12. updated_at triggers (keep stats roll-ups clean)
-- ------------------------------------------------------------
create or replace function public._touch_outreach_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
    new.updated_at := now();
    return new;
end
$$;

drop trigger if exists tg_outreach_campaigns_updated_at on public.outreach_campaigns;
create trigger tg_outreach_campaigns_updated_at
    before update on public.outreach_campaigns
    for each row execute function public._touch_outreach_updated_at();

drop trigger if exists tg_outreach_contacts_updated_at on public.outreach_contacts;
create trigger tg_outreach_contacts_updated_at
    before update on public.outreach_contacts
    for each row execute function public._touch_outreach_updated_at();

drop trigger if exists tg_outreach_lists_updated_at on public.outreach_lists;
create trigger tg_outreach_lists_updated_at
    before update on public.outreach_lists
    for each row execute function public._touch_outreach_updated_at();

-- ------------------------------------------------------------
-- 13. Table comments
-- ------------------------------------------------------------
comment on table public.outreach_campaigns is
    'Multi-channel outreach campaigns. Each row is one campaign with channel mix, throttle, and stats cache.';
comment on table public.outreach_campaign_steps is
    'Ordered campaign steps (email/sms/wait) with A/B variant support. step_order is the user-facing position; ab_variant_of points to the parent step for variants.';
comment on table public.outreach_contacts is
    'Universal recipient directory. Sources: SAM.gov, Apollo, manual, HubSpot sync, CSV import. Email-uniqueness via lower(email).';
comment on table public.outreach_campaign_contacts is
    'Membership + per-contact state for each campaign. Scheduler claims rows where status=active and next_send_at <= now().';
comment on table public.outreach_campaign_step_runs is
    'One row per step actually executed. Resend/Twilio webhooks update opened/clicked/replied/bounced/complained.';
comment on table public.outreach_lists is
    'Saved contact lists. filter JSON drives dynamic resolution; outreach_list_members backs static lists.';
comment on function public.get_campaign_kpis(uuid, timestamptz, timestamptz) is
    'Returns JSONB with sent/delivered/opened/clicked/replied/bounced/complained/unsubscribed counts + rates for one campaign over a time range.';
comment on function public.get_outreach_dashboard_kpis(timestamptz, timestamptz) is
    'Aggregate KPIs across every campaign + total contact directory size, for the /admin/outreach dashboard.';
comment on function public.get_outreach_timeseries(timestamptz, timestamptz, text) is
    'Daily or weekly bucketed counts of sent/delivered/opened/clicked/replied/bounced for chart rendering.';

notify pgrst, 'reload schema';
