-- 131: bump source-tuned structured_requirements task priority from 6 to 8
-- in the trigger function, so NEW opportunities don't recreate the priority-
-- inversion that 130 introduced.
--
-- Context:
-- Migration 130 set analyze_attachments to priority 8 (was 4) to drain the
-- 12k+ backlog that was starving behind the priority-6 lanes. Side effect:
-- the source-tuned struct-reqs lanes (extract_structured_reqs_federal/state/
-- county/city) sat at priority 6 and were now LOWER than attachments. Since
-- claim_jobs orders by priority DESC then created_at ASC, the main worker
-- (run_worker_jobs) burned its 60-sec budget on attachments and never
-- reached struct-reqs.
--
-- This migration:
-- 1. Bumps trigger-emitted struct-reqs priority from 6 to 8 (ties with
--    attachments — claim_jobs then falls back to created_at for fair share).
-- 2. Updates all existing pending struct-reqs rows to priority 8 (already
--    done via one-shot UPDATE on 2026-06-09 but included here for
--    re-runnability against fresh databases).
--
-- Paired with code change in /api/cron/run_worker_jobs/route.ts that removes
-- analyze_attachments from HTTP_TASK_TYPES — attachments now drain
-- exclusively via the dedicated /api/cron/run_worker_jobs_attachments cron
-- so the two lanes never compete for the same worker tick budget.

create or replace function enqueue_opp_enrichment() returns trigger
language plpgsql
as $$
begin
    insert into worker_jobs (task_type, payload, priority) values
        ('classify_naics',   jsonb_build_object('opp_id', new.id), 7),
        ('extract_keywords', jsonb_build_object('opp_id', new.id), 6)
    on conflict (dedup_key) where status in ('pending','running') do nothing;

    -- Source-tuned struct-reqs at priority 8 (was 6 in mig 124, bumped here
    -- to tie with analyze_attachments and prevent the main worker from
    -- starving them under heavy attachment backlog).
    if new.source = 'city' or new.jurisdiction_level = 'city' then
        insert into worker_jobs (task_type, payload, priority)
        values ('extract_structured_reqs_city', jsonb_build_object('opp_id', new.id), 8)
        on conflict (dedup_key) where status in ('pending','running') do nothing;
    elsif new.source = 'county' or new.jurisdiction_level = 'county' then
        insert into worker_jobs (task_type, payload, priority)
        values ('extract_structured_reqs_county', jsonb_build_object('opp_id', new.id), 8)
        on conflict (dedup_key) where status in ('pending','running') do nothing;
    elsif new.source = 'state'
          or new.jurisdiction_level = 'state'
          or (new.source = 'sled' and new.jurisdiction_level is null) then
        insert into worker_jobs (task_type, payload, priority)
        values ('extract_structured_reqs_state', jsonb_build_object('opp_id', new.id), 8)
        on conflict (dedup_key) where status in ('pending','running') do nothing;
    elsif new.source in ('sam', 'federal', 'sbir', 'grants') then
        insert into worker_jobs (task_type, payload, priority)
        values ('extract_structured_reqs_federal', jsonb_build_object('opp_id', new.id), 8)
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

-- Backfill pending rows to priority 8 (idempotent — already done on 2026-06-09
-- via a one-shot UPDATE, but included for fresh-DB re-runnability).
update worker_jobs
   set priority = 8
 where task_type in (
     'extract_structured_reqs_federal',
     'extract_structured_reqs_state',
     'extract_structured_reqs_county',
     'extract_structured_reqs_city'
   )
   and status = 'pending'
   and priority < 8;
