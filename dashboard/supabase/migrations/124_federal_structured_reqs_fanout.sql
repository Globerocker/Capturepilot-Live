-- Federal (SAM.gov) structured_requirements extraction fan-out.
--
-- Builds on migrations 121 (county), 122 (city), 123 (state). Teaches the
-- on_new_opportunity_enrich trigger to route federal SAM.gov rows to the
-- source-tuned federal extractor (extract_structured_reqs_federal, backed by
-- /lib/structured-requirements/federal.ts) instead of the generic
-- extract_structured_reqs.
--
-- Federal rows are identified by:
--   1. source = 'sam'   (canonical — SAM.gov sync writes this)
--   2. source = 'federal' (alias used by some downstream ingesters)
--   3. source = 'sbir' / 'grants' (federal-flavored, share FAR/DFARS phrasing
--      + identical evaluation-factor patterns — same extractor handles both
--      well enough that we don't need a separate task type today)
--
-- Routing precedence (most specific first):
--   1. City  (source='city'  or jurisdiction_level='city')
--   2. County (source='county' or jurisdiction_level='county')
--   3. State  (source='state' or jurisdiction_level='state' or
--             source='sled'  with no jurisdiction_level)
--   4. Federal (source IN ('sam','federal','sbir','grants'))
--   5. Generic fallback (everything else)
--
-- Existing SLED Chromium scrape + SAM attachment OCR branches are preserved
-- verbatim. The pre-existing SAM rows continue to queue analyze_attachments
-- in parallel — the federal extractor reads attachment text from
-- opportunity_attachments.extracted_text on the next pass, so the two paths
-- compose instead of competing.
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
    --   1. City
    --   2. County
    --   3. State (incl. unlabeled sled rows)
    --   4. Federal (sam / federal / sbir / grants)
    --   5. Generic fallback
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
    elsif new.source in ('sam', 'federal', 'sbir', 'grants') then
        insert into worker_jobs (task_type, payload, priority)
        values ('extract_structured_reqs_federal', jsonb_build_object('opp_id', new.id), 6)
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

    -- SAM rows → queue attachment OCR (runs in parallel with the federal
    -- extractor; analyze_attachments fills opportunity_attachments and the
    -- federal extractor's next pass picks up the extracted_text).
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
