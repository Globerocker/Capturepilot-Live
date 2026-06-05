-- Phase 20 of the Quick Checker overhaul. Persists the geo expansion
-- suggestions (top 5 non-targeted states + per-NAICS opp counts) so the
-- UI banner can render the "+N more opps if you add FL/GA/LA" prompt
-- without re-computing on every page load.
--
-- Shape: see GeoExpansionResult in
-- dashboard/src/lib/quick-checker/geo-expansion.ts. JSONB so the shape
-- can evolve without another migration.
--
-- Already applied to production via Supabase MCP on 2026-06-05.

alter table public.company_analyses
    add column if not exists geo_expansion jsonb;

notify pgrst, 'reload schema';
