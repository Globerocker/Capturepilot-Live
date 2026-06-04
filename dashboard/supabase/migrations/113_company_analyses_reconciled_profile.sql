-- Phase 3 of the Quick Checker overhaul. Persists the reconciled profile
-- (crawl + SAM + USAspending merged into a single fact-tagged blob) on
-- the analysis row so downstream readers (UI cert badges, HubSpot push,
-- analytics) don't have to re-run the reconciliation.
--
-- Shape lives in dashboard/src/lib/quick-checker/reconcile.ts
-- (`ReconciledProfile` type). JSONB so the shape can evolve without
-- another migration.

alter table public.company_analyses
    add column if not exists reconciled_profile jsonb;

notify pgrst, 'reload schema';
