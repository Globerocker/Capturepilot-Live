/**
 * Columns required by the 3 n8n workflows on the VPS:
 *   - 01_outreach_drip — tags marketing_leads after touch 1 sent
 *   - 03_opp_deadline_reminders — tags user_pursuits after 24h-before-close reminder
 *
 * Partial indexes target the "not yet processed" subset since both workflows
 * filter on `IS NULL` to avoid double-sending.
 */

alter table public.marketing_leads
  add column if not exists drip_status text,
  add column if not exists drip_last_touch_at timestamptz;

alter table public.user_pursuits
  add column if not exists deadline_reminder_sent_at timestamptz;

create index if not exists idx_marketing_leads_drip_status_null
  on public.marketing_leads(created_at)
  where drip_status is null;

create index if not exists idx_user_pursuits_deadline_reminder_null
  on public.user_pursuits(stage)
  where deadline_reminder_sent_at is null;
