-- Internal health-monitor system: registry of every API connector we depend
-- on + a delta-only alert log so the hourly health_monitor cron can email
-- info@fillcart.de when something changes state (green→yellow/red) or when a
-- key expiry crosses the 14-day countdown threshold.
--
-- Why these two tables instead of just polling /api/admin/env-health on a
-- timer: the env-health endpoint is stateless. To send an alert ONLY when
-- something actually changed, we need history. Plus we want to track expiry
-- dates per connector (SAM.gov rotates every 90 days; HubSpot tokens are
-- annual) which the live probe can't infer.

create table if not exists api_connectors (
  id              uuid primary key default gen_random_uuid(),
  -- Stable kebab-case key matched against the probe registry in
  -- src/lib/connectors.ts. Inserts that don't have a corresponding probe
  -- entry are still tracked (configured/expiry) but `reachable` stays unknown.
  slug            text unique not null,
  label           text not null,
  env_var_name    text not null,
  category        text not null default 'integration',  -- ingest|enrichment|email|payments|llm|monitoring|integration
  enabled         boolean not null default true,
  -- Rotation tracking: rotation_days is the cadence (90 for SAM, 365 for
  -- yearly tokens, null for keys with no expiry like Stripe). expires_at is
  -- the next concrete deadline if we know it; once it's < now() + 14 days
  -- the health_monitor fires a warning alert.
  rotation_days   int,
  expires_at      timestamptz,
  -- Operator-facing metadata: where to read docs, where to rotate the key.
  docs_url        text,
  rotate_url      text,
  notes           text,
  -- Last health-monitor results, updated in place each cron run so the
  -- admin UI doesn't have to re-probe to render a status badge.
  last_check_at   timestamptz,
  last_status     text,                 -- ok | error | unknown | disabled
  last_detail     text,
  consecutive_fails int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists api_connectors_category_idx on api_connectors(category);
create index if not exists api_connectors_expires_at_idx on api_connectors(expires_at) where expires_at is not null;

-- Append-only history. Each row is a STATE-CHANGE event, not every probe.
-- The health_monitor cron writes a new row only when current status differs
-- from the previous row for the same connector, OR when an expiry alert
-- fires (which gets a separate alert_type).
create table if not exists health_alerts (
  id              uuid primary key default gen_random_uuid(),
  connector_slug  text not null,
  alert_type      text not null,  -- status_change | expiry_warning | cron_stale | cron_failed | recovery
  severity        text not null,  -- info | warning | critical
  title           text not null,
  detail          text,
  payload         jsonb,
  fired_at        timestamptz not null default now(),
  resolved_at     timestamptz,
  emailed         boolean not null default false
);

create index if not exists health_alerts_unresolved_idx
  on health_alerts (fired_at desc)
  where resolved_at is null;

create index if not exists health_alerts_connector_idx
  on health_alerts (connector_slug, fired_at desc);

-- Seed the existing stack. Anything wired right now goes in here so the
-- hourly health_monitor has something to do on first run.
insert into api_connectors (slug, label, env_var_name, category, rotation_days, docs_url, rotate_url, notes) values
  ('sam-gov',       'SAM.gov',           'SAM_API_KEY',           'ingest',     90,   'https://open.gsa.gov/api/get-opportunities-public-api/', 'https://sam.gov/profile/details', 'X-Api-Key header. Rotates every 90 days.'),
  ('apollo',        'Apollo.io',         'APOLLO_API_KEY',        'enrichment', 365,  'https://docs.apollo.io/',                'https://app.apollo.io/#/settings/integrations/api', 'Free tier covers people/match. Annual rotation hygiene.'),
  ('resend',        'Resend (email)',    'RESEND_API_KEY',        'email',      365,  'https://resend.com/docs/api-reference',   'https://resend.com/api-keys', 'Transactional + lead-magnet delivery.'),
  ('stripe',        'Stripe',            'STRIPE_SECRET_KEY',     'payments',   365,  'https://stripe.com/docs/api',             'https://dashboard.stripe.com/apikeys', 'Restricted keys — yearly rotation.'),
  ('openai',        'OpenAI',            'OPENAI_API_KEY',        'llm',        90,   'https://platform.openai.com/docs/api-reference', 'https://platform.openai.com/api-keys', 'Quarterly rotation hygiene for user-facing features.'),
  ('deepseek',      'DeepSeek',          'DEEPSEEK_API_KEY',      'llm',        365,  'https://api-docs.deepseek.com/',          'https://platform.deepseek.com/api_keys', 'Cheaper LLM fallback.'),
  ('mistral',       'Mistral OCR',       'MISTRAL_API_KEY',       'llm',        365,  'https://docs.mistral.ai/',                'https://console.mistral.ai/api-keys/', 'PDF OCR for attachments.'),
  ('firecrawl',     'Firecrawl',         'FIRECRAWL_API_KEY',     'enrichment', 365,  'https://docs.firecrawl.dev/',             'https://www.firecrawl.dev/account', 'Website scraping for brand + competitors.'),
  ('hubspot',       'HubSpot CRM',       'HUBSPOT_API_KEY',       'integration', 365, 'https://developers.hubspot.com/docs/api/overview', 'https://app.hubspot.com/private-apps/', 'Lead sync from /api/leads + Quick Checker.'),
  ('supabase',      'Supabase (DB)',     'SUPABASE_SERVICE_KEY',  'integration', null, 'https://supabase.com/docs',              'https://supabase.com/dashboard/project/_/settings/api', 'Service role key — rotate on team changes only.'),
  ('meta-capi',     'Meta CAPI',         'META_CAPI_TOKEN',       'integration', 365, 'https://developers.facebook.com/docs/marketing-api/conversions-api', 'https://business.facebook.com/events_manager2/', 'Server-side conversion API token.'),
  ('meta-webhook',  'Meta Webhook App',  'META_APP_SECRET',       'integration', null, 'https://developers.facebook.com/docs/graph-api/webhooks', 'https://developers.facebook.com/apps/', 'App secret for Lead Ads HMAC signature verification.'),
  ('vercel',        'Vercel (API)',      'VERCEL_TOKEN',          'integration', 365, 'https://vercel.com/docs/rest-api',         'https://vercel.com/account/tokens', 'Used by /admin/connectors to write env vars + trigger redeploy.')
on conflict (slug) do nothing;

-- One pre-populated expiry on SAM since the 90-day clock started rolling
-- from migration 074's date. Operator can edit via /admin/connectors.
update api_connectors
   set expires_at = now() + interval '60 days'
 where slug = 'sam-gov' and expires_at is null;
