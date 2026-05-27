/**
 * Email engagement tracking for Resend deliveries.
 *
 * Resend sends webhooks for delivered / opened / clicked / bounced / complained.
 * We persist every event so /admin/email-tracking can show per-lead engagement.
 *
 * Two pieces:
 *   1. email_events — raw event log, keyed by resend_email_id.
 *   2. marketing_leads.magnet_resend_id / brief_resend_id — pointers from a
 *      lead row to the two messages we sent it, so the admin UI can join
 *      events back to the lead in one query.
 */

create table if not exists public.email_events (
    id uuid primary key default gen_random_uuid(),
    resend_email_id text not null,
    event_type text not null check (event_type in (
        'sent', 'delivered', 'delivery_delayed',
        'opened', 'clicked',
        'bounced', 'complained', 'failed'
    )),
    recipient text,
    link text,
    user_agent text,
    ip text,
    raw jsonb,
    occurred_at timestamptz not null default now(),
    inserted_at timestamptz not null default now()
);

create index if not exists idx_email_events_resend_id
    on public.email_events(resend_email_id);
create index if not exists idx_email_events_type_time
    on public.email_events(event_type, occurred_at desc);
create index if not exists idx_email_events_recipient
    on public.email_events(recipient)
    where recipient is not null;

alter table public.marketing_leads
    add column if not exists magnet_resend_id text,
    add column if not exists brief_resend_id text;

create index if not exists idx_marketing_leads_magnet_resend_id
    on public.marketing_leads(magnet_resend_id)
    where magnet_resend_id is not null;
create index if not exists idx_marketing_leads_brief_resend_id
    on public.marketing_leads(brief_resend_id)
    where brief_resend_id is not null;

alter table public.email_events enable row level security;
-- Service role only; admin UI hits this via /api/admin/* with assertAdmin.
