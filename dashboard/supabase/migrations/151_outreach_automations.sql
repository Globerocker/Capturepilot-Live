-- Migration 151: outreach_automations + outreach_automation_runs
-- Stream R3-M1.4 (Workflow Automation Rules)
--
-- If-this-then-that rules for outreach events. Lets an admin wire up
-- reactions to reply/open/click/bounce/etc. without code changes:
--   - Tag a contact
--   - Add/remove from a campaign
--   - Pause a campaign
--   - Push a HubSpot lifecycle stage
--   - Send a Slack alert
--   - Send an internal email to a user
--
-- Rules are stored as data; execution is handled by a Vercel route that
-- reads pending events and walks the actions array. This migration just
-- defines the schema + a placeholder `execute_outreach_automation` RPC
-- that records the trigger to `outreach_automation_runs` so we have a
-- soft audit trail until the real executor is wired in.

-- 1. Rules table — one row per automation.
create table if not exists public.outreach_automations (
    id              uuid primary key default gen_random_uuid(),
    name            text not null,
    trigger_event   text not null
        check (trigger_event in (
            'reply_received',
            'replied_positive',
            'replied_negative',
            'opened',
            'clicked',
            'bounced',
            'unsubscribed',
            'campaign_completed',
            'step_skipped'
        )),
    -- Filters narrow which events fire the rule. Examples:
    --   { "campaign_ids": ["..."], "sentiments": ["positive"] }
    --   { "min_opens": 3 }
    trigger_filter  jsonb not null default '{}'::jsonb,
    -- Ordered sequence of action objects. Executor walks the array.
    -- Action shape examples:
    --   { "type": "tag_contact", "tag": "replied" }
    --   { "type": "add_to_campaign", "campaign_id": "..." }
    --   { "type": "remove_from_campaign", "campaign_id": "..." }
    --   { "type": "pause_campaign", "campaign_id": "..." }
    --   { "type": "hubspot_lifecycle", "stage": "sales-qualified-lead" }
    --   { "type": "send_slack", "channel": "#sales", "message": "..." }
    --   { "type": "send_to_user", "user_profile_id": "...",
    --     "subject": "...", "body": "..." }
    actions         jsonb not null default '[]'::jsonb
        check (jsonb_typeof(actions) = 'array'),
    is_active       boolean not null default true,
    created_by      uuid references public.user_profiles(id) on delete set null,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists idx_outreach_automations_active_event
    on public.outreach_automations (trigger_event)
    where is_active = true;

create index if not exists idx_outreach_automations_created_by
    on public.outreach_automations (created_by);

create index if not exists idx_outreach_automations_filter_gin
    on public.outreach_automations using gin (trigger_filter);

comment on table public.outreach_automations is
    'If-this-then-that rules for outreach events. Fires `actions` (JSONB array of action objects) when `trigger_event` happens and `trigger_filter` matches.';
comment on column public.outreach_automations.trigger_filter is
    'JSONB narrowing predicate. Keys like campaign_ids[], sentiments[], min_opens. Empty object = match all events of this type.';
comment on column public.outreach_automations.actions is
    'Ordered array of action objects. Each has a `type` plus type-specific params. See migration body for examples.';


-- 2. Run audit table — one row per automation firing.
create table if not exists public.outreach_automation_runs (
    id                    uuid primary key default gen_random_uuid(),
    automation_id         uuid not null references public.outreach_automations(id) on delete cascade,
    triggered_by_event_id text,
    triggered_at          timestamptz not null default now(),
    actions_executed      jsonb not null default '[]'::jsonb,
    error                 text,
    completed_at          timestamptz
);

create index if not exists idx_outreach_automation_runs_automation
    on public.outreach_automation_runs (automation_id, triggered_at desc);

create index if not exists idx_outreach_automation_runs_triggered_at
    on public.outreach_automation_runs (triggered_at desc);

create index if not exists idx_outreach_automation_runs_event
    on public.outreach_automation_runs (triggered_by_event_id)
    where triggered_by_event_id is not null;

comment on table public.outreach_automation_runs is
    'Audit trail for outreach_automations firings. `actions_executed` is the result of walking the automation`s actions array (per-action status + payload). `error` is non-null when the executor crashed.';


-- 3. Placeholder executor — records the trigger and returns the run id.
--    Real execution lives in /api/outreach/automations/execute (Vercel route)
--    so we can keep secrets (HubSpot, Slack, Resend) off the DB.
create or replace function public.execute_outreach_automation(
    p_automation_id uuid,
    p_context       jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    v_run_id           uuid;
    v_event_id         text;
begin
    v_event_id := nullif(p_context->>'event_id', '');

    insert into public.outreach_automation_runs (
        automation_id,
        triggered_by_event_id,
        triggered_at,
        actions_executed
    )
    values (
        p_automation_id,
        v_event_id,
        now(),
        '[]'::jsonb
    )
    returning id into v_run_id;

    return v_run_id;
end;
$$;

comment on function public.execute_outreach_automation(uuid, jsonb) is
    'Placeholder — records the firing to outreach_automation_runs and returns the run id. Real action execution happens in a Vercel route that polls pending runs.';


-- 4. RLS: admin-only on both tables.
alter table public.outreach_automations enable row level security;
alter table public.outreach_automation_runs enable row level security;

drop policy if exists "outreach_automations admin all" on public.outreach_automations;
create policy "outreach_automations admin all"
    on public.outreach_automations
    for all
    to authenticated
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
    );

drop policy if exists "outreach_automation_runs admin all" on public.outreach_automation_runs;
create policy "outreach_automation_runs admin all"
    on public.outreach_automation_runs
    for all
    to authenticated
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
    );

-- 5. updated_at trigger on outreach_automations.
create or replace function public.touch_outreach_automations_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists trg_outreach_automations_updated_at
    on public.outreach_automations;
create trigger trg_outreach_automations_updated_at
    before update on public.outreach_automations
    for each row execute function public.touch_outreach_automations_updated_at();
