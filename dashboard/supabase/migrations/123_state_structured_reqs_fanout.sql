-- State (SLED) structured_requirements extraction fan-out.
--
-- Builds on migrations 121 (county) and 122 (city). Teaches the
-- on_new_opportunity_enrich trigger to route state-level rows to the
-- source-tuned state extractor (extract_structured_reqs_state, backed by
-- /lib/structured-requirements/state.ts) instead of the generic
-- extract_structured_reqs.
--
-- State rows are identified by:
--   1. source = 'state' (explicit, used by any future state-specific ingester)
--   2. source = 'sled' AND jurisdiction_level = 'state'
--   3. source = 'sled' AND jurisdiction_level IS NULL (default — most SLED
--      ingesters today come in as source='sled' without a jurisdiction_level
--      label, and the vast majority of those are state-level portals like
--      TX SmartBuy, OpenGov state instances, etc. Until a smarter
--      jurisdiction_level classifier lands, treat unlabeled sled rows as
--      state-jurisdiction so they get the state extractor's MBE/WBE/HUB
--      prompt rather than the generic federal-flavored one.)
--
-- Routing precedence (most specific first):
--   1. City (source='city' OR jurisdiction_level='city')
--   2. County (source='county' OR jurisdiction_level='county')
--   3. State (source='state' OR jurisdiction_level='state' OR
--             source='sled' with no jurisdiction_level)
--   4. Generic fallback (everything else — federal/grants/sbir/etc.)
--
-- City/county branches from 121+122 are preserved verbatim. The SLED
-- Chromium scrape and SAM attachment OCR branches are unchanged.
--
-- Safe to re-run; CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS.

create or replace function enqueue_opp_enrichment() returns trigger
language plpgsql
as $$
begin
    -- Always-on enrichers (NAICS + keywords are universal)
    insert into worker_jobs (task_type, payload, priority) values
        ('classify_naics',   jsonb_build_object('opp_id', new.id), 7),
        ('extract_keywords', jsonb_build_object('opp_id', new.id), 6)
    on conflict (dedup_key) where status in ('pending','running') do nothing;

    -- Source-tuned structured_requirements extraction. Routing precedence:
    --   1. City (source='city' or jurisdiction_level='city')
    --   2. County (source='county' or jurisdiction_level='county')
    --   3. State (source='state' or jurisdiction_level='state' or
    --            source='sled' with no jurisdiction_level)
    --   4. Generic fallback (everything else)
    if new.source = 'city' or new.jurisdiction_level = 'city' then
        insert into worker_jobs (task_type, payload, priority)
        values ('extract_structured_reqs_city', jsonb_build_object('opp_id', new.id), 6)
        on conflict (dedup_key) where status in ('pending','running') do nothing;
    elsif new.source = 'county' or new.jurisdiction_level = 'county' then
        insert into worker_jobs (task_type, payload, priority)
        values ('extract_structured_reqs_county', jsonb_build_object('opp_id', new.id), 6)
        on conflict (dedup_key) where status in ('pending','running') do nothing;
    elsif new.source = 'state'
          or new.jurisdiction_level = 'state'
          or (new.source = 'sled' and new.jurisdiction_level is null) then
        insert into worker_jobs (task_type, payload, priority)
        values ('extract_structured_reqs_state', jsonb_build_object('opp_id', new.id), 6)
        on conflict (dedup_key) where status in ('pending','running') do nothing;
    else
        insert into worker_jobs (task_type, payload, priority)
        values ('extract_structured_reqs', jsonb_build_object('opp_id', new.id), 6)
        on conflict (dedup_key) where status in ('pending','running') do nothing;
    end if;

    -- SLED rows with a portal link → queue Chromium scrape (Bonfire/OpenGov/etc.)
    if new.source = 'sled' and new.link is not null and char_length(new.link) > 4 then
        insert into worker_jobs (task_type, payload, priority)
        values ('scrape_portal_detail', jsonb_build_object('opp_id', new.id, 'url', new.link), 5)
        on conflict (dedup_key) where status in ('pending','running') do nothing;
    end if;

    -- SAM rows → queue attachment OCR
    if new.source = 'sam' then
        insert into worker_jobs (task_type, payload, priority)
        values ('analyze_attachments', jsonb_build_object('opp_id', new.id), 4)
        on conflict (dedup_key) where status in ('pending','running') do nothing;
    end if;

    return new;
end;
$$;

drop trigger if exists on_new_opportunity_enrich on opportunities;
create trigger on_new_opportunity_enrich
    after insert on opportunities
    for each row execute function enqueue_opp_enrichment();
