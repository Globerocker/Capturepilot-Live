-- 060_opportunities_attachable_view.sql
--
-- View of opportunities that need attachment analysis. PostgREST's filter
-- language can't express `jsonb_array_length(resource_links) > 0` without
-- false-matching null rows, so the route queries this view instead.

create or replace view public.opportunities_attachable as
select id, notice_id, title, description, resource_links, structured_requirements, ai_win_strategy, posted_date, is_archived
from public.opportunities
where is_archived = false
  and resource_links is not null
  and jsonb_typeof(resource_links) = 'array'
  and jsonb_array_length(resource_links) > 0
  and (structured_requirements->>'_analyzed_attachments_at') is null;

grant select on public.opportunities_attachable to service_role, authenticated;
