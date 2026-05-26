-- The "worker_jobs platform" — turns the codebase into a job queue.
--
-- One table holds every "thing that needs doing" across the system. Both
-- Vercel cron handlers and the Railway Playwright worker poll it for jobs
-- they can handle, claim atomically via UPDATE...FOR UPDATE SKIP LOCKED,
-- process, and write back.
--
-- Companion table portal_cookies caches CF clearance / session cookies per
-- portal host, refreshed periodically by a cookie-warmer worker task.
--
-- Trigger on opportunities INSERT fans out enrichment work the moment any
-- ingest_* cron lands a new row. The bulk-backfill cron in
-- /api/cron/enqueue_backfill seeds the queue with work for every existing
-- under-enriched opp.

-- ---------------------------------------------------------------------------
-- worker_jobs
-- ---------------------------------------------------------------------------
create table if not exists worker_jobs (
    id uuid primary key default gen_random_uuid(),
    task_type text not null,
    -- payload is task-specific; example shapes:
    --   { "opp_id": "...uuid..." }
    --   { "host": "fairfaxcounty.bonfirehub.com" }
    --   { "company_id": "...", "website": "https://..." }
    payload jsonb not null default '{}'::jsonb,
    -- 0-10, higher runs first
    priority int not null default 5 check (priority between 0 and 10),
    -- pending → running → done | failed | skipped
    status text not null default 'pending'
        check (status in ('pending','running','done','failed','skipped')),
    attempts int not null default 0,
    max_attempts int not null default 3,
    created_at timestamptz not null default now(),
    started_at timestamptz,
    finished_at timestamptz,
    error_message text,
    result jsonb,
    -- Optional dedup key: when set, INSERT ON CONFLICT DO NOTHING by this
    -- value prevents duplicate jobs for the same (task_type, target).
    dedup_key text generated always as (task_type || '|' || coalesce(payload->>'opp_id', payload->>'host', payload->>'company_id', '')) stored
);

-- Queue-consumer index: pending jobs by priority then FIFO
create index if not exists worker_jobs_queue_idx
    on worker_jobs (status, priority desc, created_at asc)
    where status = 'pending';
create index if not exists worker_jobs_task_status_idx on worker_jobs (task_type, status);
create unique index if not exists worker_jobs_dedup_active_idx
    on worker_jobs (dedup_key)
    where status in ('pending','running');

alter table worker_jobs enable row level security;
create policy worker_jobs_service_all on worker_jobs for all to service_role using (true) with check (true);

-- ---------------------------------------------------------------------------
-- portal_cookies — CF / session cookie cache per portal host
-- ---------------------------------------------------------------------------
create table if not exists portal_cookies (
    host text primary key,
    cookies jsonb not null,                              -- array of {name, value, domain, path, expires}
    user_agent text not null,                            -- UA the cookies were issued for
    fetched_at timestamptz not null default now(),
    expires_at timestamptz,                              -- earliest cookie expiry
    last_used_at timestamptz,
    use_count int not null default 0
);
create index if not exists portal_cookies_expires_idx on portal_cookies (expires_at);

alter table portal_cookies enable row level security;
create policy portal_cookies_service_all on portal_cookies for all to service_role using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Fan-out trigger — every new opportunity → enrichment jobs queued
-- ---------------------------------------------------------------------------
create or replace function enqueue_opp_enrichment() returns trigger
language plpgsql
as $$
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

    -- SAM rows → queue attachment OCR (analyze_match_attachments task type)
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

-- ---------------------------------------------------------------------------
-- Helper: claim_jobs — atomic batch claim for queue consumers
-- ---------------------------------------------------------------------------
create or replace function claim_jobs(
    p_task_types text[],
    p_batch_size int default 5
)
returns setof worker_jobs
language plpgsql
as $$
begin
    return query
    with claimed as (
        select id
        from worker_jobs
        where status = 'pending'
          and task_type = any(p_task_types)
          and attempts < max_attempts
        order by priority desc, created_at asc
        limit p_batch_size
        for update skip locked
    )
    update worker_jobs j
    set status = 'running',
        started_at = now(),
        attempts = attempts + 1
    from claimed c
    where j.id = c.id
    returning j.*;
end;
$$;

grant execute on function claim_jobs(text[], int) to service_role;

-- ---------------------------------------------------------------------------
-- Helper: finish_job — mark done/failed
-- ---------------------------------------------------------------------------
create or replace function finish_job(
    p_job_id uuid,
    p_status text,
    p_result jsonb default null,
    p_error text default null
)
returns void
language sql
as $$
    update worker_jobs
    set status = p_status,
        finished_at = now(),
        result = coalesce(p_result, result),
        error_message = p_error
    where id = p_job_id;
$$;

grant execute on function finish_job(uuid, text, jsonb, text) to service_role;
