-- Flip the 44 seeded OpenGov tenant rows from enabled=false → enabled=true.
-- The new /api/cron/ingest_opengov cron route uses the OpenGov anonymous
-- JSON API at api.procurement.opengov.com/api/v1 (researched May 2026,
-- verified anonymous + CF-clean). No Playwright needed.
--
-- Idempotent (only flips opengov rows). Operator-trigger only — the
-- 40/40 vercel.json cron cap is already hit so this cron is operator-
-- run via CRON_SECRET, not scheduled.

update rss_sources
   set enabled = true
 where provider = 'opengov'
   and enabled = false;
