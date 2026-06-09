-- 130: bump analyze_attachments priority from 4 → 8 while preserving the
-- source-tuned routing established in migrations 121-124.
--
-- SUPERSEDES migration 127, which was authored before the source-tuned
-- routing fanout shipped and would have reverted city/county/state/federal
-- routing back to the generic extract_structured_reqs task type. Migration
-- 127's body is now a no-op with a pointer to this file.
--
-- WHY priority bump: per 127's investigation, analyze_attachments had 12,836+
-- pending rows stuck since 2026-05-27 because the Vercel consumer's 55-sec
-- budget per tick burned out on higher-priority (6-7) classifier/keyword/
-- struct-req lanes before ever reaching the priority-4 attachment lane.
-- Bumping to 8 puts attachments above all but classify_naics.
--
-- Net effect: source-tuned extractors still route correctly (federal/state/
-- city/county each get their tailored prompt), AND new SAM rows now enqueue
-- analyze_attachments at priority 8 so they drain. The 12k+ existing
-- pending rows also get priority-bumped via the trailing UPDATE.

create or replace function enqueue_opp_enrichment() returns trigger
language plpgsql
as $$
begin
    insert into worker_jobs (task_type, payload, priority) values
        ('classify_naics',   jsonb_build_object('opp_id', new.id), 7),
        ('extract_keywords', jsonb_build_object('opp_id', new.id), 6)
    on conflict (dedup_key) where status in ('pending','running') do nothing;

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

    if new.source = 'sled' and new.link is not null and char_length(new.link) > 4 then
        insert into worker_jobs (task_type, payload, priority)
        values ('scrape_portal_detail', jsonb_build_object('opp_id', new.id, 'url', new.link), 5)
        on conflict (dedup_key) where status in ('pending','running') do nothing;
    end if;

    if new.source = 'sam' then
        insert into worker_jobs (task_type, payload, priority)
        values ('analyze_attachments', jsonb_build_object('opp_id', new.id), 8)
        on conflict (dedup_key) where status in ('pending','running') do nothing;
    end if;

    return new;
end;
$$;

drop trigger if exists on_new_opportunity_enrich on opportunities;
create trigger on_new_opportunity_enrich
    after insert on opportunities
    for each row execute function enqueue_opp_enrichment();

update worker_jobs
   set priority = 8
 where task_type = 'analyze_attachments'
   and status = 'pending'
   and priority < 8;
