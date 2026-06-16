-- 172_contractors_top_match_count.sql
--
-- Match-Drop: filterable marker for "has live opportunity matches".
--   NULL = not yet scored by enrich_contractor_matches
--   0    = scored, no biddable matches
--   >0   = N matches stored in capability_summary_ai.top_matches
--
-- The match_drop segment filters on top_match_count > 0; the scoring cron uses
-- NULL as its "unprocessed" claim marker.
alter table public.contractors
    add column if not exists top_match_count integer;

create index if not exists contractors_top_match_count_idx
    on public.contractors (top_match_count)
    where top_match_count is not null;
