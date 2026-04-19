-- ============================================================
-- Migration 048 — Slack workspace installations
-- ============================================================
-- One row per Slack workspace that has installed the CapturePilot app.
-- Mapping is keyed by Slack team_id so the events handler can resolve
-- the right CapturePilot user_profile for slash commands + mentions.
--
-- Tokens are stored encrypted at rest (pgsodium) when available; for the
-- MVP we keep them as plain text behind service-role-only RLS.

create table if not exists public.slack_installations (
    id                  uuid primary key default gen_random_uuid(),
    team_id             text not null unique,        -- Slack team/workspace id (e.g. "T0A1B2C3")
    team_name           text,
    enterprise_id       text,
    enterprise_name     text,
    bot_user_id         text,                        -- Slack bot user id (U...)
    bot_token           text,                        -- xoxb- token used by chat.postMessage etc.
    user_id             text,                        -- Slack user id of the installer
    installer_email     text,
    scopes              text[]      default '{}'::text[],
    user_profile_id     uuid references public.user_profiles(id) on delete set null,
    app_id              text,
    installed_at        timestamptz not null default now(),
    uninstalled_at      timestamptz,
    last_used_at        timestamptz,
    raw_response        jsonb
);

create index if not exists idx_slack_user_profile on public.slack_installations (user_profile_id);
create index if not exists idx_slack_team_active on public.slack_installations (team_id) where uninstalled_at is null;

alter table public.slack_installations enable row level security;

do $$
begin
    if not exists (select 1 from pg_policies where tablename='slack_installations' and policyname='slack_owner_select') then
        create policy "slack_owner_select" on public.slack_installations for select
            using (user_profile_id in (
                select id from public.user_profiles where auth_user_id = auth.uid()
            ));
    end if;
end $$;
