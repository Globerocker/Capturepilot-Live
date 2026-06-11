-- Migration 162 — Add dismissed_at + dismissed_by to alert_autofixes
--
-- The morning digest (/api/cron/send_daily_digest) lists every escalated
-- row from the past 24h as "Needs your attention". Without a dismissed
-- column, stale alerts (e.g. the 23 orchestrator-auth failures that were
-- fixed in commit 4321551e hours earlier) kept resurfacing every morning.
--
-- 1. Add the columns.
-- 2. Bulk-dismiss the stale orchestrator-auth rows + anything > 6h old.
-- 3. (App code) Digest query now filters dismissed_at IS NULL.

ALTER TABLE alert_autofixes ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ;
ALTER TABLE alert_autofixes ADD COLUMN IF NOT EXISTS dismissed_by TEXT;

CREATE INDEX IF NOT EXISTS idx_alert_autofixes_active
    ON alert_autofixes (created_at DESC)
    WHERE dismissed_at IS NULL;

UPDATE alert_autofixes
SET dismissed_at = NOW(),
    dismissed_by = 'auto:stale_orchestrator_auth_fix_2026-06-11'
WHERE dismissed_at IS NULL
  AND (
      connector_slug LIKE 'orchestrator:%'
      OR action_taken LIKE '%authentication failing%'
      OR action_taken LIKE '%Vercel env vars and redeploy%'
  );

UPDATE alert_autofixes
SET dismissed_at = NOW(),
    dismissed_by = 'auto:stale_>6h_2026-06-11'
WHERE dismissed_at IS NULL
  AND created_at < NOW() - INTERVAL '6 hours';

NOTIFY pgrst, 'reload schema';
