-- Extend worker_jobs.dedup_key to recognize payload.lead_id, so the
-- enrich_lead_brief task (and any future per-lead jobs) gets a unique
-- dedup key instead of collapsing all rows to "enrich_lead_brief|".
--
-- Generated columns can't be edited in place — drop and re-add with the
-- new expression. Stored data is recomputed automatically.

alter table worker_jobs drop column dedup_key;

alter table worker_jobs
    add column dedup_key text generated always as (
        task_type || '|' || coalesce(
            payload->>'opp_id',
            payload->>'host',
            payload->>'company_id',
            payload->>'lead_id',
            ''
        )
    ) stored;

-- The partial unique index on (dedup_key) where status in ('pending','running')
-- was dropped along with the column. Recreate it.
create unique index if not exists worker_jobs_dedup_active_idx
    on worker_jobs (dedup_key)
    where status in ('pending', 'running');
