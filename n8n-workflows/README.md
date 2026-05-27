# CapturePilot — n8n workflow templates

3 ready-to-import workflow JSON files for the n8n instance on the Hostinger VPS (`https://n8n.srv1113360.hstgr.cloud`). Each replaces a piece of logic that would otherwise live in a Vercel cron handler.

## Setup once (5 min)

1. Open n8n: `https://n8n.srv1113360.hstgr.cloud`
2. Settings → Variables (or `.env` in the n8n container) — add:
   - `SUPABASE_SERVICE_KEY` = same one in Vercel/Railway
   - `RESEND_API_KEY` = your Resend key
   - `HUBSPOT_ACCESS_TOKEN` = HubSpot private app token
   - `HUBSPOT_SAAS_STAGE_SIGNED_UP`, `_QUICK_CHECK`, `_TRIAL`, `_SUBSCRIBED`, `_ENGAGED`, `_CHURNED` — same values you set in Vercel for HubSpot stage IDs
3. For each workflow file: Workflows → Import from File → pick the JSON
4. Review nodes (left-to-right wiring), then toggle **Active** in top-right

## Workflows

### 01_outreach_drip.json
- **Trigger**: daily 09:00 UTC
- **What**: fetches `marketing_leads` where `lead_brief_status=done` AND created >3d ago AND `drip_status` not yet set, sends a "checking in" follow-up via Resend, tags `drip_status=touch_1_sent`. Per run: up to 20 leads.
- **Pre-req**: `marketing_leads` table needs `drip_status` + `drip_last_touch_at` columns. Not in current schema — add via:
  ```sql
  alter table public.marketing_leads
    add column if not exists drip_status text,
    add column if not exists drip_last_touch_at timestamptz;
  ```
- **To extend to 3 touches**: clone this workflow with filter changes (`drip_status=eq.touch_1_sent` + waited 5d, etc).

### 02_hubspot_pipeline_sync.json
- **Trigger**: every 15 min (polling — n8n's free Supabase realtime is flaky)
- **What**: finds `user_pursuits` rows updated in last 20 min with a `hubspot_deal_id` set, maps internal stage (discovered/researching/preparing/submitted/awarded/lost/no_bid) to HubSpot stage IDs from env vars, PATCHes HubSpot deal.
- **Pre-req**: `user_pursuits` must have `hubspot_deal_id` column populated (the existing HubSpot integration in `/dashboard/src/lib/connectors.ts` should already be filling this on create — verify in `/admin/pipeline`).

### 03_opp_deadline_reminders.json
- **Trigger**: daily 07:00 UTC
- **What**: queries pursuits in `researching` or `preparing` stage whose linked opportunity closes in 23-26 hours, sends a reminder email to the user, tags `deadline_reminder_sent_at` so we don't double-send.
- **Pre-req**: `user_pursuits` needs `deadline_reminder_sent_at timestamptz` column. Add:
  ```sql
  alter table public.user_pursuits
    add column if not exists deadline_reminder_sent_at timestamptz;
  ```

## Why n8n instead of Vercel cron?

- **Visual debugging**: see exactly which step failed + the payload at that point
- **No 40-cron Pro-plan ceiling**: unlimited
- **No 300s function limit**: long-running drips can wait days between steps
- **Edit without redeploy**: tweak a stage mapping in the UI, takes effect immediately

## Saving back to repo

n8n stores workflows in its internal DB. To version-control changes:
1. Make edit in n8n UI
2. Download via "..." menu → Export workflow → JSON
3. Replace the file in this directory
4. `git commit + push`
