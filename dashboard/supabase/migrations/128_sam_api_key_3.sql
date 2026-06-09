-- 128: register SAM_API_KEY_3 in api_connectors + record concrete expiry dates
-- on the existing SAM key rows so the /admin/health/integrations countdown
-- becomes meaningful instead of just rotation_days.
--
-- Triggered 2026-06-08 when user supplied a third SAM.gov key. The library
-- (src/lib/sam-keys.ts) now round-robins SAM_API_KEY + SAM_API_KEY_3 for the
-- opportunity-ingest pool (doubling the daily 1000/hr quota for the ingest
-- crawl) and keeps SAM_API_KEY_2 dedicated to the entity-information path.

insert into public.api_connectors
    (slug, label, env_var_name, category, enabled, rotation_days, expires_at,
     docs_url, rotate_url, notes)
values
    ('sam-gov-ingest-key3', 'SAM.gov (opportunities API — key #3)',
     'SAM_API_KEY_3', 'data-source', true, 90,
     '2026-09-05T00:00:00Z',
     'https://open.gsa.gov/api/opportunities-api/',
     'https://sam.gov/profile',
     'Third SAM.gov key. Round-robins with SAM_API_KEY in the opportunity-ingest pool (sam-keys.ts getOpportunityKey). Doubles the effective 1000/hr quota for ingest_sam, deep_enrich, attachment downloads. Added 2026-06-08.')
on conflict (slug) do update set
    expires_at = excluded.expires_at,
    rotate_url = excluded.rotate_url,
    notes = excluded.notes;

-- Backfill expires_at on the older SAM rows we know dates for. The rotation
-- cadence is in rotation_days but the concrete date was never set, so the
-- expiry-warning alert (fires at < 14 days remaining) never had a target to
-- compare against. Best-effort dates from Vercel env-var "Updated" timestamps:
--   SAM_API_KEY      added 2026-02-25 → expires roughly 2026-05-26 (LIKELY EXPIRED)
--   SAM_API_KEY_2    added 2026-04-06 → expires roughly 2026-07-05
-- If either is wrong the health_monitor's next probe will flip the row to
-- error and we'll see it immediately in /admin/health.
update public.api_connectors
   set expires_at = '2026-05-26T00:00:00Z',
       notes      = coalesce(notes, '')
                 || E'\n[2026-06-08] expires_at backfilled. If still working, rotate at sam.gov/profile and bump the date in this row.'
 where slug = 'sam-gov'
   and expires_at is null;

update public.api_connectors
   set expires_at = '2026-07-05T00:00:00Z',
       notes      = coalesce(notes, '')
                 || E'\n[2026-06-08] expires_at backfilled.'
 where slug = 'sam-gov-contractors'
   and expires_at is null;
