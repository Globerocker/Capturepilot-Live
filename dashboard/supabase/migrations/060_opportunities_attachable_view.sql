-- 060_opportunities_attachable_view.sql
--
-- View of opportunities that need attachment analysis. PostgREST's filter
-- language can't express `jsonb_array_length(resource_links) > 0` without
-- false-matching null rows, so the route queries this view instead.

-- jsonb_array_length errors on non-array values — Postgres planner can
-- reorder the AND clauses past the jsonb_typeof guard, so wrap in CASE.
create or replace view public.opportunities_attachable as
select id, notice_id, title, description, resource_links, structured_requirements, ai_win_strategy, posted_date, is_archived
from public.opportunities
where is_archived = false
  and resource_links is not null
  and (structured_requirements->>'_analyzed_attachments_at') is null
  and (case when jsonb_typeof(resource_links) = 'array' then jsonb_array_length(resource_links) else 0 end) > 0;

grant select on public.opportunities_attachable to service_role, authenticated;
