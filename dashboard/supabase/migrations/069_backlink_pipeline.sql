-- ============================================================
-- Migration 069: backlink acquisition pipeline
-- ============================================================
-- Six tables for the end-to-end backlink workflow:
--   1. backlink_prospects  — candidate domains to pursue (Tier 1-5)
--   2. backlink_contacts   — people at each prospect (editors, PR, etc.)
--   3. backlink_outreach   — every email/message sent or drafted
--   4. backlink_monitor    — links we've acquired; auto-checks they stay live
--   5. backlink_agents     — registry of automated agents + last-run state
--   6. backlink_todos      — human tasks (Kanban-style) tied to prospects
-- ============================================================

create extension if not exists pgcrypto;

-- ---- 1) prospects -------------------------------------------
create table if not exists public.backlink_prospects (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique,
  authority_score int,
  trust_score int,
  backlinks_num int,
  refdomains_num int,
  category text,
  -- 'editorial' | 'directory' | 'association' | 'comparison' | 'asset' | 'spam' | 'unknown'
  tier int check (tier between 1 and 5),
  -- 1 = high-value editorial; 5 = spam/disavow
  status text not null default 'discovered',
  -- discovered → researching → contact_found → outreach_drafted
  --   → outreach_sent → replied → won | lost | nurture | disavowed
  refdomain_source text,
  competitor_overlap text[],
  link_target_url text,
  link_anchor_suggestion text,
  pitch_angle text,
  notes text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  enrichment_attempted_at timestamptz,
  enrichment_completed_at timestamptz,
  outreach_count int not null default 0,
  reply_received_at timestamptz,
  link_acquired_at timestamptz,
  link_lost_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_backlink_prospects_status on public.backlink_prospects(status);
create index if not exists idx_backlink_prospects_tier on public.backlink_prospects(tier);
create index if not exists idx_backlink_prospects_score on public.backlink_prospects(authority_score desc nulls last);

-- ---- 2) contacts --------------------------------------------
create table if not exists public.backlink_contacts (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.backlink_prospects(id) on delete cascade,
  full_name text,
  role text,
  email text,
  email_pattern text,
  email_confidence text,
  -- 'verified' | 'guessed' | 'crawled' | 'apollo'
  linkedin_url text,
  twitter text,
  source text,
  created_at timestamptz default now()
);
create index if not exists idx_backlink_contacts_prospect on public.backlink_contacts(prospect_id);
create unique index if not exists idx_backlink_contacts_email_uniq
  on public.backlink_contacts(prospect_id, lower(email))
  where email is not null;

-- ---- 3) outreach --------------------------------------------
create table if not exists public.backlink_outreach (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.backlink_prospects(id) on delete cascade,
  contact_id uuid references public.backlink_contacts(id) on delete set null,
  channel text not null default 'email',
  step int not null default 0,
  subject text,
  body_text text,
  body_html text,
  gmail_draft_id text,
  gmail_compose_url text,
  status text not null default 'drafted',
  -- 'drafted' | 'sent' | 'replied' | 'bounced' | 'cancelled'
  scheduled_for timestamptz,
  sent_at timestamptz,
  replied_at timestamptz,
  generated_by text,
  ai_model text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_backlink_outreach_prospect on public.backlink_outreach(prospect_id);
create index if not exists idx_backlink_outreach_status on public.backlink_outreach(status);

-- ---- 4) monitor (acquired/observed links) ------------------
create table if not exists public.backlink_monitor (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid references public.backlink_prospects(id) on delete set null,
  source_url text not null,
  target_url text not null,
  anchor_text text,
  is_dofollow boolean,
  is_live boolean not null default true,
  authority_score int,
  first_seen timestamptz not null default now(),
  last_checked timestamptz not null default now(),
  lost_at timestamptz
);
create unique index if not exists idx_backlink_monitor_source_target
  on public.backlink_monitor(source_url, target_url);
create index if not exists idx_backlink_monitor_is_live on public.backlink_monitor(is_live);

-- ---- 5) agents (the automation registry) -------------------
create table if not exists public.backlink_agents (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  display_name text,
  description text,
  cron_schedule text,
  enabled boolean not null default true,
  last_run_at timestamptz,
  last_run_status text,
  last_run_summary jsonb,
  last_run_duration_ms int
);

insert into public.backlink_agents (name, display_name, description, cron_schedule) values
  ('prospect_discovery',
   'Prospect Discovery',
   'Pulls competitor refdomains from Semrush, classifies them (Tier 1-5), dedupes, and inserts new prospects.',
   '0 5 * * 1'),
  ('contact_enrichment',
   'Contact Enrichment',
   'Crawls /contact, /about, /team, and footer of new prospects to extract editor/PR emails. Falls back to email pattern guessing.',
   '0 6 * * 1-5'),
  ('outreach_drafter',
   'Outreach Drafter',
   'Generates personalized pitch emails for prospects with at least one contact. Saves drafts in DB + Gmail compose URL (human clicks Send).',
   '0 7 * * 1-5'),
  ('link_monitor',
   'Link Monitor',
   'Verifies acquired links are still live (HTTP fetch + anchor check). Flags lost links for re-outreach.',
   '0 8 * * 1'),
  ('disavow_generator',
   'Disavow Generator',
   'Reviews capturepilot.com refdomains weekly, flags Moldova/honeypot/spam patterns, exports public/disavow.txt for Google Search Console.',
   '0 9 * * 1')
on conflict (name) do nothing;

-- ---- 6) todos (human tasks) --------------------------------
create table if not exists public.backlink_todos (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid references public.backlink_prospects(id) on delete cascade,
  title text not null,
  description text,
  assignee text,
  priority text default 'medium',
  status text default 'open',
  due_at timestamptz,
  created_by text,
  created_at timestamptz default now(),
  completed_at timestamptz
);
create index if not exists idx_backlink_todos_status on public.backlink_todos(status);
create index if not exists idx_backlink_todos_prospect on public.backlink_todos(prospect_id);

-- ---- updated_at triggers ----------------------------------
create or replace function public._touch_backlink_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_backlink_prospects_updated on public.backlink_prospects;
create trigger trg_backlink_prospects_updated
  before update on public.backlink_prospects
  for each row execute function public._touch_backlink_updated_at();

drop trigger if exists trg_backlink_outreach_updated on public.backlink_outreach;
create trigger trg_backlink_outreach_updated
  before update on public.backlink_outreach
  for each row execute function public._touch_backlink_updated_at();

-- ---- RLS: admin-only (service-role API access) --------------
alter table public.backlink_prospects enable row level security;
alter table public.backlink_contacts  enable row level security;
alter table public.backlink_outreach  enable row level security;
alter table public.backlink_monitor   enable row level security;
alter table public.backlink_agents    enable row level security;
alter table public.backlink_todos     enable row level security;

-- No public policies — only service-role JWT can read/write. Admin API
-- routes use the service key; the admin UI reads via those routes.
