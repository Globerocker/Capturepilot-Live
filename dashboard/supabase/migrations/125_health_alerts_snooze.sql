-- Adds `snoozed_until` to health_alerts so an admin can hush a noisy alert
-- without resolving it. The self_heal cron and morning digest filter on
-- (resolved_at IS NULL AND (snoozed_until IS NULL OR snoozed_until < now()))
-- once they pick up this column.
--
-- Why a separate column instead of bumping fired_at: we want to preserve the
-- original firing timestamp for postmortem and to keep age-of-issue accurate
-- when the snooze elapses.

alter table public.health_alerts
    add column if not exists snoozed_until timestamptz,
    add column if not exists snoozed_by    uuid,
    add column if not exists resolved_by   uuid,
    add column if not exists resolved_note text;

create index if not exists health_alerts_snoozed_idx
    on public.health_alerts (snoozed_until)
    where snoozed_until is not null;

comment on column public.health_alerts.snoozed_until is
    'When set in the future, suppress this alert from digests + self_heal until elapsed. Cleared on resolve.';
comment on column public.health_alerts.snoozed_by is
    'auth_user_id of the admin who snoozed the alert.';
comment on column public.health_alerts.resolved_by is
    'auth_user_id of the admin who manually resolved the alert (null when self_heal resolved it).';
comment on column public.health_alerts.resolved_note is
    'Optional free-text note from the admin explaining manual resolution.';
