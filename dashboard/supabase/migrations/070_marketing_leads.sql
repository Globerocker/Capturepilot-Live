-- Marketing leads — anonymous email captures from lead-magnet forms on the
-- public website (resource downloads, /lp/* gated guides, exit-intent forms).
-- Distinct from `company_analyses.lead_email` which only fires on Quick Checker.

create table if not exists marketing_leads (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  company text,
  magnet_key text not null,        -- e.g. 'sdvosb-opportunity-map', 'bid-checklist'
  source text,                     -- URL path where the form was submitted
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  referrer text,
  user_agent text,
  ip_hash text,                    -- sha256(ip) — for dedup without storing IP
  resend_synced boolean default false,
  created_at timestamptz default now()
);

create unique index if not exists marketing_leads_email_magnet_idx
  on marketing_leads (lower(email), magnet_key);

create index if not exists marketing_leads_created_idx
  on marketing_leads (created_at desc);

alter table marketing_leads enable row level security;

-- Service-key-only writes (lead capture happens server-side).
create policy "marketing_leads_admin_select" on marketing_leads
  for select using (auth.jwt() ->> 'role' = 'service_role');
