-- Fix: marketing_leads.apollo_enriched_at never written
--
-- Bug: only /api/leads + /api/meta/leadgen-webhook set apollo_enriched_at,
-- and they only set it when Apollo returns a person match. If APOLLO_API_KEY
-- is unset, the lookup errors, or the person isn't in Apollo, the timestamp
-- is never written — so we lose the signal that we tried, and the daily
-- backfill keeps re-picking the same misses. Production showed 106 leads,
-- 0 enriched.
--
-- Fix: introduce a worker_jobs task type `enrich_lead_apollo` handled by
-- /api/cron/run_worker_jobs. Always stamps apollo_enriched_at after the
-- attempt — even on a miss — so we don't burn credits re-querying the same
-- email forever. Triggered automatically on new marketing_leads INSERT and
-- backfillable in bulk via enqueue_marketing_leads_apollo_backfill().

-- 1. Trigger function — fan out one enrich_lead_apollo job per new lead.
--    We always enqueue (even if APOLLO_API_KEY is unset on Vercel side); the
--    handler short-circuits and still stamps apollo_enriched_at so the lead
--    leaves the pending queue. Without this, every new marketing_leads row
--    would silently skip Apollo enrichment.
create or replace function enqueue_marketing_lead_apollo() returns trigger
    language plpgsql
    security definer
    set search_path = public
as $$
begin
    -- Only enqueue when we have an email to query Apollo with.
    if new.email is not null and length(new.email) > 3 then
        insert into worker_jobs (task_type, payload, priority)
        values (
            'enrich_lead_apollo',
            jsonb_build_object('lead_id', new.id),
            7
        )
        on conflict do nothing;  -- dedup index handles concurrent inserts
    end if;
    return new;
end;
$$;

drop trigger if exists on_new_marketing_lead_apollo on marketing_leads;
create trigger on_new_marketing_lead_apollo
    after insert on marketing_leads
    for each row
    execute function enqueue_marketing_lead_apollo();

-- 2. Backfill helper — bulk-enqueue every existing lead that hasn't been
--    stamped yet. Called by the admin /api/admin/leads/apollo route or a
--    one-off cron tick after deploy. Returns the count of jobs queued.
--    Idempotent via the worker_jobs dedup index on (task_type|lead_id) for
--    pending/running rows.
create or replace function enqueue_marketing_leads_apollo_backfill(p_limit int default 500)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
    v_count int;
begin
    with candidates as (
        select id
        from marketing_leads
        where apollo_enriched_at is null
          and email is not null
          and length(email) > 3
        order by created_at asc
        limit p_limit
    ),
    inserted as (
        insert into worker_jobs (task_type, payload, priority)
        select 'enrich_lead_apollo', jsonb_build_object('lead_id', id), 5
        from candidates
        on conflict do nothing
        returning 1
    )
    select count(*)::int into v_count from inserted;
    return v_count;
end;
$$;

comment on function enqueue_marketing_lead_apollo is
    'Fan-out trigger: enqueues an enrich_lead_apollo worker job for every new marketing_leads insert.';
comment on function enqueue_marketing_leads_apollo_backfill is
    'Backfill helper: bulk-enqueues enrich_lead_apollo jobs for the N oldest leads with apollo_enriched_at IS NULL. Idempotent.';
