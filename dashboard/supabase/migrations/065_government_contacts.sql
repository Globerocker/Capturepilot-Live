-- ============================================================
-- Migration 065: government_contacts directory
-- ============================================================
-- Centralized table for government decision-makers (contracting officers,
-- buyers, program managers, SBLOs) sourced from HigherGov /people,
-- SAM.gov POCs, Apollo enrichment, and manual entries. Lets users build
-- targeted outreach lists by agency, role, location, or set-aside.
--
-- Apollo enrichment is layered on top: matching by name + agency domain
-- gives us LinkedIn URL, mobile phone, verified email when available.
-- ============================================================

create table if not exists public.government_contacts (
    id uuid primary key default gen_random_uuid(),

    -- Identity
    name text not null,
    first_name text,
    last_name text,
    title text,

    -- Contact channels (HigherGov often only has email; Apollo fills the rest)
    email text,
    phone text,
    mobile_phone text,
    direct_phone text,
    phone_ext text,
    fax text,
    linkedin_url text,

    -- Agency / employer
    agency_name text,
    agency_abbreviation text,
    agency_key bigint,
    agency_type text,        -- 'Federal' / 'SLED' / 'Local' / 'State' / 'Education'
    agency_domain text,      -- e.g. 'carync.gov' — used for Apollo enrichment
    state text,              -- 2-letter state code when known
    city text,

    -- Source provenance
    source text not null default 'highergov'
        check (source in ('highergov', 'sam_gov', 'apollo', 'manual', 'crawler')),
    contact_type text,       -- 'federal' / 'sled' / 'sblo' / 'co' / 'kp' (key personnel)
    highergov_path text,     -- canonical link back to HigherGov profile
    apollo_id text,

    -- Enrichment metadata
    enriched_at timestamptz,
    enrichment_provider text,   -- 'apollo' / 'manual' / null
    enrichment_quality smallint, -- 0-100 confidence score

    -- LinkedIn intelligence (when scraped/enriched)
    linkedin_headline text,
    linkedin_company text,
    linkedin_years_in_role numeric,   -- tenure in current position
    linkedin_total_experience_years numeric,
    linkedin_skills text[],
    linkedin_education text[],

    -- Outreach state
    last_outreach_at timestamptz,
    outreach_status text check (outreach_status in ('not_contacted','contacted','responded','meeting_booked','do_not_contact','unreachable') or outreach_status is null),
    notes text,

    last_seen_at date,        -- last time the source confirmed this person was active
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Deduplication anchor — same person can appear in multiple sources, but
-- (lower(email)) is the strongest unique key when present. For people
-- without email, the highergov_path is unique per profile.
create unique index if not exists ux_gov_contacts_email
    on public.government_contacts (lower(email))
    where email is not null and email <> '';

create unique index if not exists ux_gov_contacts_highergov_path
    on public.government_contacts (highergov_path)
    where highergov_path is not null;

-- Lookup paths used by the UI + outreach generators
create index if not exists idx_gov_contacts_agency_key
    on public.government_contacts (agency_key)
    where agency_key is not null;

create index if not exists idx_gov_contacts_agency_type
    on public.government_contacts (agency_type);

create index if not exists idx_gov_contacts_state
    on public.government_contacts (state)
    where state is not null;

create index if not exists idx_gov_contacts_outreach_status
    on public.government_contacts (outreach_status)
    where outreach_status is not null;

create index if not exists idx_gov_contacts_last_seen
    on public.government_contacts (last_seen_at desc nulls last);

-- Auto-update updated_at on row changes (standard Supabase pattern)
create or replace function public.tg_government_contacts_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end $$;

drop trigger if exists tg_government_contacts_updated_at on public.government_contacts;
create trigger tg_government_contacts_updated_at
    before update on public.government_contacts
    for each row execute function public.tg_government_contacts_updated_at();

comment on table public.government_contacts is
    'Decision-makers in government — contracting officers, buyers, program managers, SBLOs. Sourced from HigherGov /people, SAM.gov POCs, Apollo enrichment, and the website crawler. Used for targeted outreach generation, BD pipeline contacts, and proposal POCs.';

comment on column public.government_contacts.agency_domain is
    'Email domain of the agency (carync.gov, gsa.gov, etc.). Critical for Apollo /people/match enrichment.';
comment on column public.government_contacts.enrichment_quality is
    'Confidence score 0-100. Higher = more fields verified by enrichment provider. Used to prefer richer records when deduping.';
