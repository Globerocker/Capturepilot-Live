-- 058_cleanup_audit_and_safeguards.sql
--
-- Audit log for opportunity lifecycle cleanup + a view of hard-delete candidates
-- that respects user-invested data (pursuits, HOT/WARM matches, extracted
-- attachments). The cleanup cron queries this view instead of opportunities
-- directly, so protected rows are never deleted.

create table if not exists public.cleanup_log (
    id            bigserial primary key,
    run_at        timestamptz not null default now(),
    kind          text not null,              -- 'archived_delete' | 'intelligence_delete' | 'status_transition' | ...
    row_count     integer not null default 0,
    opportunity_ids uuid[] not null default '{}',
    notes         jsonb not null default '{}'::jsonb
);

create index if not exists cleanup_log_run_at_idx on public.cleanup_log (run_at desc);
create index if not exists cleanup_log_kind_idx   on public.cleanup_log (kind);

alter table public.cleanup_log enable row level security;

-- Only service role reads (cron writes, admins query via API)
drop policy if exists cleanup_log_service_all on public.cleanup_log;
create policy cleanup_log_service_all on public.cleanup_log
    for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- View: ARCHIVED rows genuinely safe to hard-delete. Preserves anything a user
-- invested effort in (pursuits, saved matches, extracted attachment text).
create or replace view public.opportunities_deletable_archived as
select o.id
from public.opportunities o
where o.status = 'ARCHIVED'
  and o.retention_protected = false
  and o.status_changed_at < (now() - interval '365 days')
  and not exists (select 1 from public.user_pursuits up where up.opportunity_id = o.id)
  and not exists (
    select 1 from public.user_matches um
    where um.opportunity_id = o.id
      and (um.classification in ('HOT', 'WARM') or um.is_saved = true)
  )
  and not exists (
    select 1 from public.opportunity_attachments oa
    where oa.opportunity_id = o.id
      and oa.extracted_text is not null
      and length(oa.extracted_text) > 500
  );

-- View: INTELLIGENCE rows safe to hard-delete (old sources-sought w/ no linked
-- solicitation and no user investment).
create or replace view public.opportunities_deletable_intelligence as
select o.id
from public.opportunities o
where o.status = 'INTELLIGENCE'
  and o.retention_protected = false
  and o.posted_date < (now() - interval '730 days')
  and o.related_notice_id is null
  and not exists (select 1 from public.user_pursuits up where up.opportunity_id = o.id)
  and not exists (
    select 1 from public.user_matches um
    where um.opportunity_id = o.id
      and (um.classification in ('HOT', 'WARM') or um.is_saved = true)
  );

grant select on public.opportunities_deletable_archived to service_role;
grant select on public.opportunities_deletable_intelligence to service_role;
