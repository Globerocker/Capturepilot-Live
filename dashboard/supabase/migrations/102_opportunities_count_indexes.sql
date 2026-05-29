/**
 * compute_public_stats keeps returning federal_opps=0 even after the
 * exact-count switch in commit 87560827. Root cause: the count queries
 * filter on (source = 'sam' AND is_archived = false) AND can include a
 * created_at >= timestamp filter. None of our existing indexes match
 * that predicate set well enough for a count without scanning many
 * rows past Postgres's default statement_timeout.
 *
 * Migration 099 added (source, created_at desc) but NOT a is_archived
 * predicate. Adding partial indexes on the "active" subset.
 */

-- Partial index: counts source='sam' active rows in O(log n)
create index if not exists idx_opportunities_active_source
    on public.opportunities(source)
    where is_archived = false;

-- Partial index: counts by source + jurisdiction for SLED breakdowns
create index if not exists idx_opportunities_active_source_jur
    on public.opportunities(source, jurisdiction_level)
    where is_archived = false;

-- Generic active count
create index if not exists idx_opportunities_active
    on public.opportunities((1))
    where is_archived = false;
