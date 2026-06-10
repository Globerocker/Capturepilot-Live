-- ============================================================
-- Migration 152: Outreach contacts — search indexes for M3.4
-- ============================================================
-- The contacts tab in /admin/outreach/contacts runs free-text search
-- against email/name/company plus filters on engagement window and status.
-- M1.1 (148) already created the table + the GIN indexes on naics_codes
-- and tags. This migration adds the indexes that the UI hot paths need:
--
--   1. A trigram index on (email, first_name, last_name, company_name) for
--      the `?q=` ILIKE search.
--   2. A partial b-tree on (last_engagement_at desc) for the "Last 7d / 30d"
--      filter (the M1.1 schema does not index this column).
--   3. A partial b-tree on opted_out_at + last_bounced_at so the status
--      filter dropdown does not table-scan.
--
-- All wrapped in `if table exists` so the migration is idempotent even when
-- M1.1 hasn't landed in the target DB yet (we ship in parallel).
-- ============================================================

do $$
begin
    if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'outreach_contacts') then
        raise notice 'outreach_contacts not yet present; skipping M3.4 search indexes';
        return;
    end if;

    -- pg_trgm powers the ILIKE search across email / names / company.
    create extension if not exists pg_trgm;

    execute 'create index if not exists idx_outreach_contacts_email_trgm '
        || 'on public.outreach_contacts using gin (email gin_trgm_ops) '
        || 'where email is not null';

    execute 'create index if not exists idx_outreach_contacts_name_trgm '
        || 'on public.outreach_contacts using gin ('
        || '(coalesce(first_name, '''') || '' '' || coalesce(last_name, '''')) gin_trgm_ops'
        || ')';

    execute 'create index if not exists idx_outreach_contacts_company_trgm '
        || 'on public.outreach_contacts using gin (company_name gin_trgm_ops) '
        || 'where company_name is not null';

    -- Engagement window filter ("Last 7d / 30d / never").
    execute 'create index if not exists idx_outreach_contacts_last_engagement '
        || 'on public.outreach_contacts (last_engagement_at desc nulls last)';

    -- Status filter ("subscribed / unsubscribed / bounced").
    execute 'create index if not exists idx_outreach_contacts_opted_out '
        || 'on public.outreach_contacts (opted_out_at) where opted_out_at is not null';

    execute 'create index if not exists idx_outreach_contacts_bounced '
        || 'on public.outreach_contacts (last_bounced_at) where last_bounced_at is not null';
end $$;
