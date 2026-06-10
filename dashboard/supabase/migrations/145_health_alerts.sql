-- 035_health_alerts.sql
-- Stream X5.1 (Sentry alert wiring)
--
-- Lightweight audit table for Sentry-tracked alerts so the
-- /api/cron/health_monitor route can quickly read recent recipe
-- firings, dedupe spammy ones, and surface them to /admin/health.
--
-- This table does NOT replace Sentry as the source of truth — it's a
-- thin local index so dashboards don't need a Sentry API call.

create table if not exists health_alerts (
    id           uuid primary key default gen_random_uuid(),
    recipe       text not null,           -- e.g. 'cron_failed', 'worker_queue_spike'
    severity     text not null default 'error',
    route        text,                    -- e.g. '/api/cron/ingest_sam'
    provider     text,                    -- for webhook_signature_invalid: 'stripe' | 'hubspot' | 'resend'
    task_type    text,                    -- for worker_queue_spike
    details      jsonb not null default '{}'::jsonb,
    fired_at     timestamptz not null default now()
);

create index if not exists idx_health_alerts_recipe_fired
    on health_alerts (recipe, fired_at desc);

create index if not exists idx_health_alerts_fired_at
    on health_alerts (fired_at desc);

-- RLS: admin-only via service key (no anon read).
alter table health_alerts enable row level security;

-- Only authenticated admins can read.
drop policy if exists health_alerts_admin_select on health_alerts;
create policy health_alerts_admin_select on health_alerts
    for select using (
        exists (
            select 1 from user_profiles
            where user_profiles.auth_user_id = auth.uid()
              and user_profiles.account_type = 'admin'
        )
    );

comment on table  health_alerts is 'Local audit of Sentry alert recipe firings (cron_failed, worker_queue_spike, webhook_signature_invalid, openai_failure).';
comment on column health_alerts.recipe   is 'Sentry alert recipe name';
comment on column health_alerts.details  is 'Full payload for the alert (route, status, error, etc.)';
