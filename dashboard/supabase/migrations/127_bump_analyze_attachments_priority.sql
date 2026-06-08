-- 2026-06-08: Bump analyze_attachments queue priority from 4 → 8.
--
-- Why: investigation found the opportunity-attachments Storage bucket had
-- not received a new upload since 2026-04-06 (2 months of no-op). Root
-- cause was twofold:
--   1. handleAnalyzeAttachments in /api/cron/run_worker_jobs wrote
--      extracted TEXT to opportunity_attachments TABLE but never uploaded
--      file BYTES to the Storage bucket. (Fixed in route.ts in the same
--      commit — bucket uploads now mirror the table write.)
--   2. analyze_attachments jobs were enqueued at priority 4, which sits
--      below classify_naics (6-7), extract_keywords (6),
--      extract_structured_reqs (6), and extract_structured_reqs_federal
--      (10). With 10k+ pending jobs in the higher-priority lanes, the
--      Vercel consumer's 55-second budget per tick burned out before
--      claim_jobs ever reached the priority-4 rows. Net effect: 12,836
--      analyze_attachments jobs were stuck pending (0 done, 0 failed,
--      0 running).
--
-- Fix: bump the trigger-emitted priority to 8 so analyze_attachments
-- out-ranks the classifier/keyword/struct-req lanes. Backlog flush of the
-- existing 12,836 pending rows happens via a one-shot UPDATE in the same
-- ship (kept out of this migration so the file stays idempotent).
--
-- Side effect: as soon as run_worker_jobs starts claiming these, the new
-- in-route storage-upload path will populate the bucket — first new
-- objects in the bucket since 2026-04-06.

create or replace function public.enqueue_opp_enrichment()
returns trigger
language plpgsql
as $function$
begin
    -- Always-on enrichers
    insert into worker_jobs (task_type, payload, priority) values
        ('classify_naics',          jsonb_build_object('opp_id', new.id), 7),
        ('extract_structured_reqs', jsonb_build_object('opp_id', new.id), 6),
        ('extract_keywords',        jsonb_build_object('opp_id', new.id), 6)
    on conflict (dedup_key) where status in ('pending','running') do nothing;

    -- SLED rows with a portal link → queue Chromium scrape
    if new.source = 'sled' and new.link is not null and char_length(new.link) > 4 then
        insert into worker_jobs (task_type, payload, priority)
        values ('scrape_portal_detail', jsonb_build_object('opp_id', new.id, 'url', new.link), 5)
        on conflict (dedup_key) where status in ('pending','running') do nothing;
    end if;

    -- SAM rows → queue attachment OCR (analyze_attachments task type).
    -- Priority 8 (was 4 prior to 2026-06-08) so these out-rank the
    -- classifier/keyword/struct-req lanes and don't starve under a heavy
    -- classify_naics backlog.
    if new.source = 'sam' then
        insert into worker_jobs (task_type, payload, priority)
        values ('analyze_attachments', jsonb_build_object('opp_id', new.id), 8)
        on conflict (dedup_key) where status in ('pending','running') do nothing;
    end if;

    return new;
end;
$function$;
