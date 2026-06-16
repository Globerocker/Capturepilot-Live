-- 173_contractors_qc_claim.sql
-- Parallel-safe claiming for QC enrichment so multiple workers can run without
-- double-crawling the same contractor (mirrors the worker_jobs claim pattern).
alter table public.contractors
    add column if not exists qc_claimed_at timestamptz;

create index if not exists contractors_qc_claim_idx
    on public.contractors (qc_enriched, qc_claimed_at)
    where qc_enriched = false;

create or replace function public.claim_contractors_for_qc(p_batch integer)
returns setof public.contractors
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  return query
  update public.contractors c
  set qc_claimed_at = now()
  where c.id in (
    select id from public.contractors
    where qc_enriched = false
      and (website is not null or business_url is not null)
      and (qc_claimed_at is null or qc_claimed_at < now() - interval '15 minutes')
    order by (email is not null) desc, federal_awards_count desc nulls last
    limit greatest(1, least(p_batch, 50))
    for update skip locked
  )
  returning c.*;
end;
$$;

revoke execute on function public.claim_contractors_for_qc(integer) from anon, authenticated, public;
