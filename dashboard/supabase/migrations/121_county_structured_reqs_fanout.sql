-- Source-tuned structured_requirements extraction fan-out.
--
-- Pre-this: the on_new_opportunity_enrich trigger queued the generic
-- extract_structured_reqs task type for every opp regardless of source. That
-- task fans out to /lib/extract-structured-requirements.ts — a source-agnostic
-- LLM extractor whose single-string scope_of_work field collides with the
-- canonical array shape in /lib/structured-requirements/types.ts.
--
-- This migration teaches the trigger to enqueue source-tuned extractors when
-- a matching one exists. County rows now route to extract_structured_reqs_county
-- (backed by /lib/structured-requirements/county.ts), which writes the
-- canonical shape directly.
--
-- Sibling extractors (federal, state, city, grants, sbir, …) plug in here as
-- they ship — add an elsif branch per source.
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

    -- Source-tuned structured_requirements extraction.
    -- County rows get the county-specific prompt + canonical shape writer.
    -- Everything else falls back to the generic extractor for now (slated to
    -- be retired once federal/state/city extractors ship).
    if new.source = 'county' then
        insert into worker_jobs (task_type, payload, priority)
        values ('extract_structured_reqs_county', jsonb_build_object('opp_id', new.id), 6)
        on conflict (dedup_key) where status in ('pending','running') do nothing;
    else
        insert into worker_jobs (task_type, payload, priority)
        values ('extract_structured_reqs', jsonb_build_object('opp_id', new.id), 6)
        on conflict (dedup_key) where status in ('pending','running') do nothing;
    end if;

    -- SLED rows with a portal link → queue Chromium scrape
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
