-- R3-M3.5: Templates + Suppression + Settings tabs
--
-- Three small additions:
--   1. outreach_templates       — admin-managed email/SMS bodies reusable across campaigns
--   2. outreach_settings        — singleton-style key/value store for default sender,
--                                 reply-to, signature, SMS opt-in copy, throttle, etc.
--   3. domain_check_history     — record of SPF/DKIM/DMARC checks so /admin/outreach
--                                 settings tab can show "last checked" + history.
--
-- The pre-existing outreach_optouts table already covers suppression rows; this
-- migration only adds an admin_notes column so manual / bulk-import entries can
-- carry context (e.g. "added by Jane on 2026-06-10 after support ticket #421").

-- ── 1. outreach_templates ────────────────────────────────────────────────
create table if not exists public.outreach_templates (
    id            uuid primary key default gen_random_uuid(),
    name          text not null,
    channel       text not null check (channel in ('email', 'sms')),
    subject       text,                -- email only; null for sms
    body          text not null,
    merge_tags    text[] not null default '{}',
    category      text,                -- e.g. "cold_intro", "follow_up_1", "sms_reminder"
    created_by    uuid references auth.users(id),
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

create index if not exists idx_outreach_templates_channel on public.outreach_templates(channel);
create index if not exists idx_outreach_templates_category on public.outreach_templates(category);

alter table public.outreach_templates enable row level security;

drop policy if exists "outreach_templates admin all" on public.outreach_templates;
create policy "outreach_templates admin all"
    on public.outreach_templates
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

-- Updated-at trigger so we don't rely on app code to set it on every update
create or replace function public.outreach_templates_touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists trg_outreach_templates_touch on public.outreach_templates;
create trigger trg_outreach_templates_touch
    before update on public.outreach_templates
    for each row execute function public.outreach_templates_touch_updated_at();

comment on table public.outreach_templates is
    'Reusable email/SMS template bodies for cold outreach campaigns. Admin-managed.';

-- ── 2. outreach_settings (singleton-ish key/value) ───────────────────────
-- We could have used internal_config, but keeping outreach config in its own
-- table avoids accidentally exposing values via the more general key/value
-- store and lets us slap stricter RLS on it.
create table if not exists public.outreach_settings (
    key          text primary key,
    value        jsonb not null,
    updated_by   uuid references auth.users(id),
    updated_at   timestamptz not null default now()
);

alter table public.outreach_settings enable row level security;

drop policy if exists "outreach_settings admin all" on public.outreach_settings;
create policy "outreach_settings admin all"
    on public.outreach_settings
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

-- Seed defaults so the settings UI has something to render on first paint.
-- Values are jsonb so each setting can carry whatever shape it needs.
insert into public.outreach_settings (key, value) values
    ('sender_email',         to_jsonb('noreply@capturepilot.com'::text)),
    ('sender_name',          to_jsonb('CapturePilot'::text)),
    ('reply_to',             to_jsonb('hello@capturepilot.com'::text)),
    ('email_signature',      to_jsonb('<p>Best,<br/>The CapturePilot team</p>'::text)),
    ('sms_optin_language',   to_jsonb('Reply STOP to opt out. Msg & data rates may apply.'::text)),
    ('skip_if_replied',      to_jsonb(true)),
    ('throttle_per_hour',    to_jsonb(120)),
    ('send_window_start',    to_jsonb(9)),    -- 24h clock
    ('send_window_end',      to_jsonb(17)),
    ('send_window_timezone', to_jsonb('America/New_York'::text))
on conflict (key) do nothing;

comment on table public.outreach_settings is
    'Defaults applied to outreach campaigns when not overridden per-campaign. Singleton-style key/value.';

-- ── 3. domain_check_history ──────────────────────────────────────────────
create table if not exists public.domain_check_history (
    id             uuid primary key default gen_random_uuid(),
    domain         text not null,
    spf_pass       boolean,
    dkim_pass      boolean,
    dmarc_pass     boolean,
    raw_results    jsonb,
    sentry_count_7d integer,
    checked_at     timestamptz not null default now(),
    checked_by     uuid references auth.users(id)
);

create index if not exists idx_domain_check_history_domain_checked
    on public.domain_check_history(domain, checked_at desc);

alter table public.domain_check_history enable row level security;

drop policy if exists "domain_check_history admin all" on public.domain_check_history;
create policy "domain_check_history admin all"
    on public.domain_check_history
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

comment on table public.domain_check_history is
    'Record of SPF/DKIM/DMARC checks for outreach sender domains. Surfaced in /admin/outreach settings tab.';

-- ── 4. outreach_optouts admin notes column ───────────────────────────────
-- Manual / bulk-import suppression rows can carry a free-text note so the
-- admin can record "imported from MailGun export 2026-06-10" or similar.
alter table public.outreach_optouts
    add column if not exists admin_notes text;
