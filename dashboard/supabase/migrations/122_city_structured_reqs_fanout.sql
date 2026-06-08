-- City structured_requirements extraction fan-out.
--
-- Builds on migration 121 (county). Teaches the on_new_opportunity_enrich
-- trigger to route city / municipal rows to the source-tuned city extractor
-- (extract_structured_reqs_city, backed by /lib/structured-requirements/city.ts)
-- instead of the generic extract_structured_reqs.
--
-- City rows are identified two ways:
--   1. source = 'city' (explicit, used by any future city-specific ingester)
--   2. source = 'sled' AND jurisdiction_level = 'city' (current SLED reality —
--      Bonfire/OpenGov city portals come in tagged source='sled' with
--      jurisdiction_level='city'). 1,937 such rows existed at the time of
--      this migration.
--
-- County branch from 121 is preserved verbatim (it now also gains a
-- jurisdiction_level fallback for the same reason).
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
    --   3. Generic fallback (everything else)
    if new.source = 'city' or new.jurisdiction_level = 'city' then
        insert into worker_jobs (task_type, payload, priority)
        values ('extract_structured_reqs_city', jsonb_build_object('opp_id', new.id), 6)
        on conflict (dedup_key) where status in ('pending','running') do nothing;
    elsif new.source = 'county' or new.jurisdiction_level = 'county' then
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
