-- 185_cockpit_assets_library.sql
--
-- ASSETS LIBRARY for the Sales Cockpit. An admin-curated set of CapturePilot
-- resources (whitepapers, lead magnets, guides, templates) that a rep can attach
-- to outreach for a given lead. The cockpit's Assets tab queries
-- GET /api/admin/cockpit/assets?keywords=...&naics=... and surfaces the best-
-- fitting active assets (by tag / NAICS overlap, else all active).
--
-- RLS: this is admin-curated marketing collateral with public-facing URLs only
-- (no PII). The cockpit reads it server-side via the service key, but we still
-- enable RLS + grant anon/authenticated SELECT so any future public surface
-- (e.g. a resources page) can read the active library directly. Writes stay
-- service-role only (no anon/authenticated insert/update/delete policy) — the
-- /api/admin/cockpit/assets POST path is assertAdmin()-gated and uses the
-- service client.

create table if not exists public.cockpit_assets (
    id          uuid primary key default gen_random_uuid(),
    title       text not null,
    url         text not null,
    kind        text not null default 'guide',   -- whitepaper | lead_magnet | guide | template
    description text,
    tags        text[] not null default '{}',
    naics       text[] not null default '{}',
    is_active   boolean not null default true,
    created_at  timestamptz not null default now()
);

-- GIN indexes so tag / NAICS overlap (&&) stays fast as the library grows.
create index if not exists cockpit_assets_tags_idx  on public.cockpit_assets using gin (tags);
create index if not exists cockpit_assets_naics_idx on public.cockpit_assets using gin (naics);
create index if not exists cockpit_assets_active_idx on public.cockpit_assets (is_active);

alter table public.cockpit_assets enable row level security;

drop policy if exists cockpit_assets_anon_read on public.cockpit_assets;
create policy cockpit_assets_anon_read
    on public.cockpit_assets
    for select
    to anon, authenticated
    using (is_active = true);

grant select on public.cockpit_assets to anon, authenticated;

comment on table public.cockpit_assets is
    'Admin-curated CapturePilot resource library (whitepapers/lead magnets/guides/templates) surfaced in the Sales Cockpit Assets tab. Ranked by tag/NAICS overlap with the lead. Reads via service key in the cockpit; anon/authenticated may SELECT active rows. Writes are service-role only (assertAdmin POST path).';

-- Seed ~6 real CapturePilot resources. Idempotent: only inserts when the table
-- is empty so re-running the migration won't pile up duplicates.
insert into public.cockpit_assets (title, url, kind, description, tags, naics, is_active)
select * from (values
    (
        'Agency Pain Points Guide',
        'https://www.capturepilot.com/resources/agency-pain-points',
        'guide',
        'Eight recurring federal-buyer pain points mapped to small-business strengths, plus a 4-week action plan. Great opener for a firm that has capabilities but no agency relationships yet.',
        array['agency','pain-points','federal','strategy','relationships'],
        array[]::text[],
        true
    ),
    (
        'Capability Statement Template',
        'https://www.capturepilot.com/resources/capability-statement-template',
        'template',
        'One-page federal-ready capability statement template (core competencies, differentiators, past performance, NAICS/PSC, company data). Hand it to a contractor who has no formatted cap statement.',
        array['capability-statement','template','past-performance','differentiators'],
        array[]::text[],
        true
    ),
    (
        'SAM.gov Registration Guide',
        'https://www.capturepilot.com/resources/sam-registration-guide',
        'guide',
        'Step-by-step SAM.gov registration + UEI walkthrough, common rejection reasons, and how to keep the registration active. Use for firms with an expiring or missing SAM registration.',
        array['sam','registration','uei','onboarding','compliance'],
        array[]::text[],
        true
    ),
    (
        'Sources Sought Response Starter Pack',
        'https://www.capturepilot.com/resources/sources-sought-starter-pack',
        'lead_magnet',
        'Templates + checklist for responding to Sources Sought / RFI notices 6-18 months before the solicitation drops — the single highest-leverage federal play for small businesses.',
        array['sources-sought','rfi','market-research','capture','early-engagement'],
        array[]::text[],
        true
    ),
    (
        'Set-Aside Eligibility Whitepaper (8(a) / HUBZone / WOSB / SDVOSB)',
        'https://www.capturepilot.com/resources/set-aside-eligibility-whitepaper',
        'whitepaper',
        'Which certifications unlock which set-asides, the dollar thresholds for sole-source awards, and how to stack certs. For certified or certifiable small businesses.',
        array['set-aside','8a','hubzone','wosb','sdvosb','certifications','small-business'],
        array[]::text[],
        true
    ),
    (
        'Federal Janitorial & Facilities Services Playbook',
        'https://www.capturepilot.com/resources/janitorial-facilities-playbook',
        'guide',
        'How small janitorial / facilities firms win federal custodial and O&M work — the 2.7B sq ft federal real-estate footprint, top buying agencies, and pricing benchmarks.',
        array['janitorial','facilities','custodial','operations-maintenance','services'],
        array['561720','561210','561730','238220'],
        true
    )
) as seed(title, url, kind, description, tags, naics, is_active)
where not exists (select 1 from public.cockpit_assets);
