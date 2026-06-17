-- 180_contractors_check_analysis_id.sql
--
-- Lets the cockpit "materialize a shareable check page" flow be idempotent.
-- POST /api/admin/cockpit/materialize-check synthesizes a `company_analyses`
-- row FROM a contractor (so the existing public /check/[analysisId] page can
-- render it), then stashes that row's id back here. Re-running the endpoint for
-- the same contractor UPDATES the same company_analyses row instead of leaving
-- a trail of duplicates.
--
-- Nullable uuid — most contractors never get a materialized check page. No FK
-- to company_analyses on purpose: if a check row is ever hard-deleted we just
-- re-materialize on the next click rather than blocking the delete.

ALTER TABLE contractors
    ADD COLUMN IF NOT EXISTS check_analysis_id uuid;

COMMENT ON COLUMN contractors.check_analysis_id IS
    'company_analyses.id of the shareable /check page materialized from this contractor (cockpit materialize-check). Nullable; updated in place on re-run.';
