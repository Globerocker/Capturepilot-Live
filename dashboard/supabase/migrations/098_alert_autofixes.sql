/**
 * Audit log for the auto-healer cron (`/api/cron/self_heal`).
 *
 * Every time the self-heal cron walks open health_alerts, it logs ONE row
 * per attempt here: which recipe ran, what it did, whether it worked.
 * The morning digest reads this table to surface "auto-fixed in last 24h"
 * separately from "needs your attention".
 *
 * Keeping it as a separate audit table (not just resolving the alert)
 * because:
 *   - we want history even after the alert is resolved
 *   - one alert can have multiple fix attempts (recipe runs, fails, escalates)
 *   - distinguishes recipe-driven recovery from self-recovery (Firecrawl
 *     blip resolves itself on next probe → no autofix row)
 */

create table if not exists public.alert_autofixes (
    id uuid primary key default gen_random_uuid(),
    alert_id uuid references public.health_alerts(id) on delete cascade,
    connector_slug text,
    recipe_slug text not null,
    status text not null check (status in ('fixed', 'escalated', 'no_recipe', 'error')),
    action_taken text,
    payload jsonb,
    created_at timestamptz not null default now()
);

create index if not exists idx_alert_autofixes_created on public.alert_autofixes(created_at desc);
create index if not exists idx_alert_autofixes_status on public.alert_autofixes(status, created_at desc);
create index if not exists idx_alert_autofixes_alert on public.alert_autofixes(alert_id);

alter table public.alert_autofixes enable row level security;
-- Service role only; admin UI hits via /api/admin/* with assertAdmin.

-- One-line schema note for the health_alerts side: we use the existing
-- `emailed` boolean to mark alerts the self-healer has acknowledged.
-- A row with emailed=true AND resolved_at=null means "auto-healer
-- acknowledged but couldn't fix — will be in the next morning digest."
