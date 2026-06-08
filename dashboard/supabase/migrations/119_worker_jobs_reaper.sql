-- Fix: stale "running" worker_jobs blocking the dedup index.
--
-- When a Vercel function times out or a Railway worker crashes mid-job, the
-- row stays in status='running' forever. Because the partial unique index
-- worker_jobs_dedup_active_idx covers status IN ('pending','running'), the
-- stuck row's dedup_key blocks every re-enqueue attempt for the same
-- (task_type, target) — silently dropped via ON CONFLICT DO NOTHING in the
-- fan-out trigger and in /api/cron/enqueue_backfill.
--
-- reap_stale_jobs() recovers jobs that have been "running" longer than
-- 10 minutes (well past every handler's own budget):
--   - if attempts < max_attempts → flip back to 'pending' so a fresh worker
--     can re-claim it.
--   - otherwise mark 'failed' with a clear error_message so the row exits
--     the active dedup window.
--
-- Called from the top of GET /api/cron/run_worker_jobs every tick. Cheap:
-- the worker_jobs_task_status_idx covers the status='running' filter and
-- the running set is small (<100 rows at worst).

create or replace function reap_stale_jobs(
    p_stale_after interval default interval '10 minutes'
)
returns table (requeued int, failed int)
language plpgsql
as $$
declare
    v_requeued int := 0;
    v_failed int := 0;
begin
    with reset as (
        update worker_jobs
        set status = 'pending',
            started_at = null
        where status = 'running'
          and started_at < now() - p_stale_after
          and attempts < max_attempts
        returning 1
    )
    select count(*)::int into v_requeued from reset;

    with killed as (
        update worker_jobs
        set status = 'failed',
            finished_at = now(),
            error_message = coalesce(error_message, '') ||
                case when error_message is null or error_message = '' then '' else ' | ' end ||
                'reaped after stuck running > ' || p_stale_after::text
        where status = 'running'
          and started_at < now() - p_stale_after
          and attempts >= max_attempts
        returning 1
    )
    select count(*)::int into v_failed from killed;

    return query select v_requeued, v_failed;
end;
$$;

grant execute on function reap_stale_jobs(interval) to service_role;
