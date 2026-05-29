/**
 * Engagement tracking on backlink outreach emails.
 *
 * The new send_backlink_outreach cron pushes 100 emails/day via Resend
 * and webhooks back delivered/opened/clicked events to
 * /api/webhooks/resend. To join those events to the originating outreach
 * row we need resend_message_id on backlink_outreach.
 *
 * Also adds opened_at / clicked_at / bounced_at + simple counters so the
 * morning digest can render "sent 100, opened 32, clicked 8, replied 2"
 * without joining email_events at query time.
 */

alter table public.backlink_outreach
    add column if not exists resend_message_id text,
    add column if not exists opened_at timestamptz,
    add column if not exists clicked_at timestamptz,
    add column if not exists bounced_at timestamptz,
    add column if not exists open_count int not null default 0,
    add column if not exists click_count int not null default 0;

-- Lets the webhook handler join in O(log n) instead of a table scan.
create index if not exists idx_backlink_outreach_resend_id
    on public.backlink_outreach(resend_message_id)
    where resend_message_id is not null;

-- For the digest "sent in last 24h" / "opened in last 24h" rollups.
create index if not exists idx_backlink_outreach_sent_at
    on public.backlink_outreach(sent_at desc)
    where sent_at is not null;
