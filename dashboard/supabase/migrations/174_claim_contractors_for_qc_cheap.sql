-- 174_claim_contractors_for_qc_cheap.sql
--
-- Hotfix (2026-06-16 incident): the migration-173 version of this claim RPC
-- ordered by `(email is not null) desc, federal_awards_count desc` over the
-- whole un-enriched set (~40k rows) on EVERY call. With several parallel QC
-- workers hammering it, those repeated sorts saturated Postgres CPU and
-- cascaded into statement/connection timeouts (which also degraded the live
-- app). Dropping the ORDER BY lets the claim use the partial index
-- (contractors_qc_claim_idx) + LIMIT + SKIP LOCKED and stay cheap.
--
-- Trade-off: we lose strict email-first prioritization. Acceptable — drain
-- order matters far less than not melting the database. If we want priority
-- back later, add a supporting index (e.g. on (qc_enriched, email)) rather
-- than an unindexed sort.
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
    limit greatest(1, least(p_batch, 50))
    for update skip locked
  )
  returning c.*;
end;
$$;
