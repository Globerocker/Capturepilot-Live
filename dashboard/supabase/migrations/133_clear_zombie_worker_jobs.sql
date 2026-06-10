-- Migration 132 — One-shot zombie reap for worker_jobs.
--
-- Context: The audit on 2026-06-10 found that 42K+ jobs had been starved by
-- the priority-8 federal struct-reqs lane. While we split a dedicated
-- run_worker_jobs_keywords route off to drain the keyword + classify_naics
-- backlog, there are still rows stuck in status='running' from earlier
-- Vercel timeouts and Railway crashes. The partial unique dedup index
-- (status IN ('pending','running')) means each zombie row silently blocks
-- the next enqueue of the same (task_type, target) — every fan-out trigger
-- and enqueue_backfill INSERT does ON CONFLICT DO NOTHING.
--
-- The runtime reap_stale_jobs RPC handles this going forward (called every
-- tick from run_worker_jobs), but this migration sweeps the historical
-- backlog in one shot so the new keyword/classify lane starts from a clean
-- state without burning attempts on already-stuck rows.

UPDATE worker_jobs
SET status = 'failed',
    error_message = 'zombie reaped 2026-06-10 — claimed but never finished',
    finished_at = NOW()
WHERE status = 'running'
  AND started_at < NOW() - INTERVAL '1 hour';
