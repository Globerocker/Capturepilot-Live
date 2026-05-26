-- Bonfire JSON-API ingest opt-in flag.
--
-- The existing /api/cron/ingest_rss path stays the default. Adding a column
-- so we can flip individual tenants to the JSON endpoint (richer data per
-- docs/source-analysis/BONFIRE.md) without a code change.
--
-- Once a tenant has use_json_api=true AND a non-null bonfire_org_id (the
-- numeric OrganizationId scraped from /portal/ HTML), the new
-- /api/cron/ingest_bonfire_json cron picks it up and the RSS cron skips it.

alter table rss_sources
  add column if not exists use_json_api  boolean not null default false,
  add column if not exists bonfire_org_id int;

create index if not exists rss_sources_bonfire_json_idx
  on rss_sources (use_json_api, provider)
  where use_json_api = true;
