-- 183_contractors_capability_keywords.sql
--
-- Reverse-matching (government opportunity -> ranked contractors) needs to
-- pre-filter ~84k contractors fast. Until now capability keywords lived only
-- inside the capability_summary_ai JSONB blob, which can't be GIN-indexed for
-- a cheap `&&` overlap pre-filter. Promote them to a real text[] column +
-- GIN index. Backfilled in-place from capability_summary_ai->'capability_keywords'
-- (17,526 rows at migration time); rows enriched later fill it via the
-- enrich/QuickCheck write path.
alter table contractors add column if not exists capability_keywords text[];

create index if not exists idx_contractors_capability_keywords
  on contractors using gin (capability_keywords);

-- One-time backfill (already applied via MCP; safe/idempotent to re-run):
-- update contractors c set capability_keywords = sub.kws
-- from (
--   select id, array_agg(distinct lower(btrim(kw))) filter (where btrim(kw) <> '') as kws
--   from contractors, jsonb_array_elements_text(capability_summary_ai->'capability_keywords') as kw
--   where jsonb_typeof(capability_summary_ai->'capability_keywords') = 'array'
--     and jsonb_array_length(capability_summary_ai->'capability_keywords') > 0
--   group by id
-- ) sub
-- where c.id = sub.id and c.capability_keywords is null;
