-- Migration 161 — Add resolved_at + resolved_by to health_alerts
--
-- The R2-X5.1 stream shipped migration 145 (`health_alerts`) without the
-- `resolved_at` column the auto-healer + health_monitor query against.
-- Result: every UPDATE in the auto-healer silently failed, so 23 stale
-- orchestrator-auth alerts accumulated on /admin/health long after the
-- root cause (Vercel Deployment Protection on the preview host) was fixed.
--
-- This migration:
--   1. Adds the missing columns (idempotent via IF NOT EXISTS).
--   2. Bulk-resolves every "orchestrator:* authentication failing" alert
--      since that root cause was fixed in commit 4321551e (2026-06-10) +
--      the orchestrator has been running clean.
--   3. Bulk-resolves anything older than 2 hours that was never auto-healed.

ALTER TABLE health_alerts ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE health_alerts ADD COLUMN IF NOT EXISTS resolved_by TEXT;

CREATE INDEX IF NOT EXISTS idx_health_alerts_unresolved
    ON health_alerts (fired_at DESC)
    WHERE resolved_at IS NULL;

UPDATE health_alerts
SET resolved_at = NOW(),
    resolved_by = 'auto:stale_orchestrator_auth_fix_2026-06-11'
WHERE resolved_at IS NULL
  AND (recipe LIKE 'orchestrator:%' OR (details::text LIKE '%authentication failing%'));

UPDATE health_alerts
SET resolved_at = NOW(),
    resolved_by = 'auto:stale_>2h_2026-06-11'
WHERE resolved_at IS NULL
  AND fired_at < NOW() - INTERVAL '2 hours';

NOTIFY pgrst, 'reload schema';
