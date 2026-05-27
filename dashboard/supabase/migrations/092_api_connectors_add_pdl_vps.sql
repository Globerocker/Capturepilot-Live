-- 092: register PDL + SAM_API_KEY_2 + 5 Hostinger VPS services in api_connectors
--
-- Background: health_monitor cron probes every row in api_connectors and
-- alerts on status changes. Before this migration these 7 connectors were
-- invisible to the alert pipeline — a Tika outage or PDL credit exhaustion
-- would have caused silent failures.
--
-- Existing rows (apollo, deepseek, firecrawl, hubspot, meta-*, mistral,
-- openai, resend, sam-gov, stripe, supabase, vercel) are untouched.

insert into public.api_connectors
    (slug, label, env_var_name, category, enabled, rotation_days, docs_url, rotate_url, notes)
values
    -- People Data Labs — Apollo people/match fallback (added 2026-05-27)
    ('pdl', 'People Data Labs',
     'PDL_API_KEY', 'enrichment', true, 365,
     'https://docs.peopledatalabs.com/',
     'https://www.peopledatalabs.com/dashboard/api',
     '1000 calls/mo free tier. Used as Apollo fallback in enrich_apollo_contractors.'),

    -- SAM.gov KEY 2 (entity/contractor scope) — separate quota from KEY 1
    ('sam-gov-contractors', 'SAM.gov (contractors API)',
     'SAM_API_KEY_2', 'data-source', true, 90,
     'https://open.gsa.gov/api/entity-api/',
     'https://sam.gov/data-services/',
     'Dedicated key for entity-information endpoint to avoid quota contention with ingest_sam.'),

    -- Hostinger VPS — Traefik-gated services. Token = the bearer used in
    -- traefik header-matcher rules; tracked separately from URL for clarity.
    ('flaresolverr', 'FlareSolverr (Cloudflare bypass)',
     'FLARESOLVERR_AUTH_TOKEN', 'vps', true, 365,
     'https://github.com/FlareSolverr/FlareSolverr',
     'https://srv1113360.hstgr.cloud/',
     'Hostinger VPS via Traefik. Used for Bonfire CF Turnstile + Salesforce SPA crawl.'),

    ('tika', 'Apache Tika (PDF extraction)',
     'TIKA_AUTH_TOKEN', 'vps', true, 365,
     'https://tika.apache.org/3.0.0/server.html',
     'https://srv1113360.hstgr.cloud/',
     'Hostinger VPS via Traefik. PDF/DOCX text extraction in lib/document-extract.ts.'),

    ('ollama', 'Ollama (local LLM)',
     'OLLAMA_AUTH_TOKEN', 'vps', true, 365,
     'https://github.com/ollama/ollama/blob/main/docs/api.md',
     'https://srv1113360.hstgr.cloud/',
     'Hostinger VPS via Traefik. qwen2.5:7b-instruct loaded. callLLM dispatch when LLM_PROVIDER=ollama.'),

    ('searxng', 'Searxng (meta-search)',
     'SEARXNG_AUTH_TOKEN', 'vps', true, 365,
     'https://docs.searxng.org/',
     'https://srv1113360.hstgr.cloud/',
     'Hostinger VPS via Traefik. Backlink prospect discovery via organic SERPs.'),

    ('crawl4ai', 'Crawl4AI (LLM-friendly crawler)',
     'CRAWL4AI_AUTH_TOKEN', 'vps', true, 365,
     'https://docs.crawl4ai.com/',
     'https://srv1113360.hstgr.cloud/',
     'Hostinger VPS via Traefik. Used in backlinks contact-discovery to bypass simple CF blocks.')
on conflict (slug) do update set
    label = excluded.label,
    env_var_name = excluded.env_var_name,
    category = excluded.category,
    enabled = excluded.enabled,
    rotation_days = excluded.rotation_days,
    docs_url = excluded.docs_url,
    rotate_url = excluded.rotate_url,
    notes = excluded.notes,
    updated_at = now();
