-- Lead-magnet capture v2: collect first/last name + phone, enrich via Apollo,
-- sync to HubSpot before delivery. Adds the columns to marketing_leads and
-- swaps the unique index from (lower(email), magnet_key) to (email, magnet_key)
-- so upsert can target it via ON CONFLICT (email, magnet_key). The API
-- lowercases server-side before insert, so the lower() wrapping is redundant
-- and was the cause of the HTTP 500 on www.capturepilot.com/downloads/* forms
-- (Supabase upsert couldn't match a functional index to the column-only
-- onConflict string and fell back to a plain insert that violated the
-- functional unique → "duplicate" error masked as "insert failed").

alter table marketing_leads
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists phone text,
  add column if not exists apollo_enriched_at timestamptz,
  add column if not exists apollo_data jsonb,
  add column if not exists hubspot_contact_id text,
  add column if not exists hubspot_synced_at timestamptz;

drop index if exists marketing_leads_email_magnet_idx;
create unique index if not exists marketing_leads_email_magnet_idx
  on marketing_leads (email, magnet_key);
