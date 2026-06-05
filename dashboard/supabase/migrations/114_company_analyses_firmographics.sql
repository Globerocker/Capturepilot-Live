-- Phase 8 of the Quick Checker overhaul. Persists the Apollo + SAM +
-- OpenCorporates + Wayback 4-layer cascade result on each analysis so
-- the UI + HubSpot push can display per-field provenance ("employee
-- count from Apollo, founded year from SAM registration") instead of
-- showing flat unattributed numbers.
--
-- Shape: see FirmographicsResult in
-- dashboard/src/lib/quick-checker/firmographics.ts. JSONB so the shape
-- can evolve without another migration.
--
-- Already applied to production via Supabase MCP on 2026-06-05.

alter table public.company_analyses
    add column if not exists firmographics jsonb;

notify pgrst, 'reload schema';
