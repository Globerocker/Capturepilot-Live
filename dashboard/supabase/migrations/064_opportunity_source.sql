-- ============================================================
-- Migration 064: opportunity source tagging
-- ============================================================
-- Why: we're starting to ingest opportunities from multiple data sources
-- beyond SAM.gov — Federal Grants (Grants.gov), and State/Local/Education
-- (SLED) via HigherGov. The downstream UI + scoring engine treats all
-- opportunities the same, but the operator needs to filter / count / debug
-- by source. Without this column, "0 new opps from HigherGov" is silently
-- mixed in with the SAM ingest count.
-- ============================================================

alter table public.opportunities
    add column if not exists source text not null default 'sam'
        check (source in ('sam', 'grants_gov', 'sled', 'sbir', 'state', 'local'));

create index if not exists idx_opportunities_source
    on public.opportunities(source);

comment on column public.opportunities.source is
    'Where this opportunity came from. ''sam''=SAM.gov federal contracts (default for legacy rows), ''grants_gov''=Federal grants via grants.gov, ''sled''=State/Local/Education via HigherGov, ''sbir''=SBIR.gov small-business R&D, ''state''/''local''=direct state portals when added.';
