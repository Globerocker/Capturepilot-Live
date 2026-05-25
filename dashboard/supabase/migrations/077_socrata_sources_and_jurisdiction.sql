-- Sprint 1 — Socrata sources + cross-cutting jurisdiction columns.
--
-- WHY: Socrata's SODA API is a single REST shape — one client unlocks 50+
-- city/state portals (NYC, Chicago, LA, Philadelphia, SF, Austin, state of CA
-- etc.). Each portal hosts datasets with non-uniform field names, so we keep
-- a per-row `field_map` JSONB that maps Socrata column names → our canonical
-- opportunity fields (title, description, agency, posted_date, response_deadline,
-- link). Adding a new dataset = one SQL insert, no code change.
--
-- ALSO: small cross-cutting schema add — jurisdiction_level + jurisdiction_code
-- on `opportunities`. Helps filtering on the matches page + per-state market
-- intelligence. Backfilled lazily by ingest crons (each cron knows the level
-- for its source).

-- ─── Cross-cutting: jurisdiction columns ──────────────────────────────────────

alter table opportunities
  add column if not exists jurisdiction_level text,
  add column if not exists jurisdiction_code  text;

create index if not exists opportunities_jurisdiction_idx
  on opportunities (jurisdiction_level, jurisdiction_code)
  where jurisdiction_level is not null;

-- ─── Socrata sources config table ─────────────────────────────────────────────

create table if not exists socrata_sources (
    id uuid primary key default gen_random_uuid(),

    -- Where to fetch
    portal_host text not null,                  -- 'data.cityofnewyork.us'
    dataset_id text not null,                   -- 'tf3b-tk9r' (the Socrata 4x4 ID)

    -- How to namespace + display
    source_prefix text not null unique,         -- 'socrata-nyc-bids' → notice_id: 'socrata-nyc-bids-<hash>'
    agency_name text,
    agency_type text default 'SLED',
    state text,                                 -- 2-letter
    city text,
    jurisdiction_level text default 'city',     -- city | state | county | special_district
    jurisdiction_code text,                     -- FIPS or USPS
    website text,

    -- Field mapping. The keys below are our canonical opportunity fields; the
    -- values are the Socrata column names to read from. Use array values for
    -- "try in order" semantics (e.g. ["short_title", "title"]).
    --
    -- Example for NYC tf3b-tk9r:
    --   { "title": "short_title",
    --     "description": "additional_description_1",
    --     "agency": "agency_name",
    --     "posted_date": "start_date",
    --     "response_deadline": "due_date",
    --     "contact_name": "contact_name",
    --     "contact_phone": "contact_phone",
    --     "contact_email": "email",
    --     "notice_type_value": "type_of_notice_description",
    --     "psc_or_category": "category_description",
    --     "key_field": "request_id",         /* drives unique notice_id */
    --     "link_field": "request_id",        /* optional: builds detail URL */
    --     "link_pattern": "https://a856-cityrecord.nyc.gov/" /* optional: prefix */
    --   }
    field_map jsonb not null default '{}'::jsonb,

    -- App token for rate-limit headroom. Free; register one per portal at
    -- https://dev.socrata.com/. Anonymous reads work below ~1000 req/hr.
    -- Stored as env var name (so the actual secret stays in Vercel env).
    app_token_env text,

    -- Runtime
    enabled boolean not null default true,
    last_fetched_at timestamptz,
    last_status text,
    last_count integer default 0,
    consecutive_failures integer not null default 0,
    notes text,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create index if not exists socrata_sources_enabled_idx on socrata_sources(enabled) where enabled = true;

-- ─── Seed: 4 verified datasets ────────────────────────────────────────────────
-- Field maps reflect the actual column names observed via live probes against
-- each dataset on May 25, 2026. Sources beyond these four are one SQL insert
-- away — see field_map example above for the canonical schema.

insert into socrata_sources (portal_host, dataset_id, source_prefix, agency_name, state, city, jurisdiction_level, jurisdiction_code, website, field_map, notes) values
  (
    'data.cityofnewyork.us', 'tf3b-tk9r',
    'socrata-nyc-bids',
    'City of New York', 'NY', 'New York', 'city', 'NYC',
    'https://data.cityofnewyork.us/d/tf3b-tk9r',
    '{
      "title": "short_title",
      "description": "additional_description_1",
      "agency": "agency_name",
      "posted_date": "start_date",
      "response_deadline": "due_date",
      "contact_name": "contact_name",
      "contact_phone": "contact_phone",
      "contact_email": "email",
      "notice_type_value": "type_of_notice_description",
      "psc_or_category": "category_description",
      "key_field": "request_id"
    }'::jsonb,
    'NYC Current Bids — daily refresh. ~hundreds of active solicitations across all city agencies.'
  ),
  (
    'data.lacity.org', 'hf3r-utnq',
    'socrata-la-ramp',
    'City of Los Angeles', 'CA', 'Los Angeles', 'city', 'LAX',
    'https://data.lacity.org/d/hf3r-utnq',
    '{
      "title": "title",
      "description": "title",
      "agency": "department",
      "posted_date": "bidpost",
      "response_deadline": "closedate",
      "notice_type_value": "type",
      "psc_or_category": "category",
      "key_field": "rampid",
      "link_field": "url.url"
    }'::jsonb,
    'LA RAMP Open Bid Opportunities — General Services + works.'
  ),
  (
    'data.cityofchicago.org', 'rsxa-ify5',
    'socrata-chicago-contracts',
    'City of Chicago', 'IL', 'Chicago', 'city', 'CHI',
    'https://data.cityofchicago.org/Administration-Finance/Contracts/rsxa-ify5',
    '{
      "title": "purchase_order_description",
      "description": "purchase_order_description",
      "agency": "department",
      "posted_date": "start_date",
      "response_deadline": "end_date",
      "key_field": "purchase_order__contract__number"
    }'::jsonb,
    'Chicago contracts dataset. Awards-heavy (historical), good for competitive intel + recompete signals.'
  ),
  (
    'phl.carto.com', 'opa_properties_public',
    'socrata-philly-contracts',
    'City of Philadelphia', 'PA', 'Philadelphia', 'city', 'PHL',
    'https://cityofphiladelphia.github.io/contracts/',
    '{
      "key_field": "id",
      "title": "subject",
      "description": "description"
    }'::jsonb,
    'PLACEHOLDER — Philadelphia contracts live in a GitHub-hosted JSON/CSV repo, not Socrata. Update field_map + portal_host once the right CKAN/static feed is identified. Disabled pending review.'
  )
on conflict (source_prefix) do nothing;

-- Philadelphia is a placeholder until we identify the right feed shape —
-- disable it so the cron doesn't poll a guess.
update socrata_sources set enabled = false where source_prefix = 'socrata-philly-contracts';
