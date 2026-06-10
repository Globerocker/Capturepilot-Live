-- ============================================================
-- Migration 138 — RLS read policies + service-role docs for audit-flagged tables
-- ============================================================
-- Context: the 2026-06-10 platform audit (advisor pass) flagged 33 tables that
-- have RLS enabled but no policies. service_role bypasses RLS so server-side
-- code keeps working, but any UI page hitting these via the user-scoped client
-- gets empty results.
--
-- Two intent buckets:
--   1. Read-public reference data (federal public-record lookups, derived
--      stats, public catalogs) — add `FOR SELECT TO authenticated USING (true)`
--      so logged-in users can read them through the anon client.
--   2. Server-only operational tables (job queues, audit logs, internal
--      config, outreach state) — leave policy-less. service_role keeps
--      access via key. We add a COMMENT ON TABLE documenting the intent so
--      future audits don't re-flag them as accidental.
--
-- Tables already covered by migration 054 (agencies, archive_types,
-- opportunity_types, capture_outcomes) are NOT touched here. Idempotent via
-- pg_policies checks + exception-swallowing DO blocks for environments where
-- a table hasn't been created yet.
-- ============================================================

-- ------------------------------------------------------------
-- Bucket 1: read-public reference data
-- Authenticated users can SELECT.
-- ------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'government_contacts')
     and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'government_contacts' and policyname = 'government_contacts_read_auth') then
    execute 'create policy government_contacts_read_auth on public.government_contacts for select to authenticated using (true)';
  end if;
exception when undefined_table then null;
end $$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'dod_contracts')
     and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dod_contracts' and policyname = 'dod_contracts_read_auth') then
    execute 'create policy dod_contracts_read_auth on public.dod_contracts for select to authenticated using (true)';
  end if;
exception when undefined_table then null;
end $$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'gao_protests')
     and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'gao_protests' and policyname = 'gao_protests_read_auth') then
    execute 'create policy gao_protests_read_auth on public.gao_protests for select to authenticated using (true)';
  end if;
exception when undefined_table then null;
end $$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'sec_prime_filings')
     and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'sec_prime_filings' and policyname = 'sec_prime_filings_read_auth') then
    execute 'create policy sec_prime_filings_read_auth on public.sec_prime_filings for select to authenticated using (true)';
  end if;
exception when undefined_table then null;
end $$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'rss_sources')
     and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rss_sources' and policyname = 'rss_sources_read_auth') then
    execute 'create policy rss_sources_read_auth on public.rss_sources for select to authenticated using (true)';
  end if;
exception when undefined_table then null;
end $$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'socrata_sources')
     and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'socrata_sources' and policyname = 'socrata_sources_read_auth') then
    execute 'create policy socrata_sources_read_auth on public.socrata_sources for select to authenticated using (true)';
  end if;
exception when undefined_table then null;
end $$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'wage_determinations')
     and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'wage_determinations' and policyname = 'wage_determinations_read_auth') then
    execute 'create policy wage_determinations_read_auth on public.wage_determinations for select to authenticated using (true)';
  end if;
exception when undefined_table then null;
end $$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'past_performance_stats')
     and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'past_performance_stats' and policyname = 'past_performance_stats_read_auth') then
    execute 'create policy past_performance_stats_read_auth on public.past_performance_stats for select to authenticated using (true)';
  end if;
exception when undefined_table then null;
end $$;

-- ------------------------------------------------------------
-- Bucket 2: server-only tables (service_role bypasses RLS via key)
-- No policies added. Document the intent so future audits know it's
-- deliberate, not an oversight.
-- ------------------------------------------------------------
do $$
declare
  rec record;
  doc_text text := 'Service-role only by design (no RLS policies). Accessed exclusively via SUPABASE_SERVICE_KEY from server-side handlers and cron jobs. Audit-tagged 2026-06-10 (migration 138).';
begin
  for rec in
    select unnest(array[
      '_backfill_targets_federal_2026_06_08',
      'alert_autofixes',
      'api_connectors',
      'attachment_analysis_jobs',
      'backlink_agents',
      'backlink_contacts',
      'backlink_monitor',
      'backlink_outreach',
      'backlink_prospects',
      'backlink_todos',
      'beta_invites',
      'cancellation_feedback',
      'cron_runs',
      'email_events',
      'health_alerts',
      'internal_config',
      'pdf_extract_cache',
      'reengage_sends'
    ]) as t
  loop
    begin
      if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = rec.t) then
        execute format('comment on table public.%I is %L', rec.t, doc_text);
      end if;
    exception when others then null;
    end;
  end loop;
end $$;
