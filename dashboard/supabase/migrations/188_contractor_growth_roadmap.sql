-- 188: Sales Cockpit "Growth" tab cache.
-- Caches the per-contractor GrowthRoadmap (data_gaps, cert_unlock, adjacent_naics,
-- geo_expansion, email_hook, computed_at) so the heavy NAICS-scoped opportunity
-- scan runs at most once per 24h per lead. Read by contractor_id (primary key),
-- so no extra index is needed.
alter table contractors add column if not exists growth_roadmap jsonb;

comment on column contractors.growth_roadmap is
  'Cached GrowthRoadmap for the Sales Cockpit Growth tab: { data_gaps, cert_unlock, adjacent_naics, geo_expansion, email_hook, computed_at }. Refreshed on demand with a 24h TTL.';
