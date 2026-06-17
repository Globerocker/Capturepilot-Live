-- 182_contractor_websites.sql
--
-- Stores the generated one-pager HTML for a contractor so the PUBLIC, no-chrome
-- /site/[slug] route handler can serve it. A non-technical partner clicks
-- "Build website" in the cockpit (POST /api/admin/cockpit/website), we render a
-- self-contained HTML document via buildOnePager(), and stash it here keyed by a
-- stable slug. The partner hands the contractor the shareable URL.
--
-- Idempotent build: the API upserts on contractor_id (one current site per
-- contractor), so re-running "Build website" overwrites html/accent/hero in
-- place rather than piling up rows.
--
-- RLS: the public /site page reads with the ANON key, so we enable RLS and add
-- an anon SELECT policy (+ grant select to anon). The HTML is the contractor's
-- own marketing copy — no PII beyond what they'd put on a public website — and
-- the slug is unguessable enough (name + short contractor id) for a "share this
-- link" preview. Writes stay service-role only (no anon insert/update policy).

create table if not exists public.contractor_websites (
    id             uuid primary key default gen_random_uuid(),
    contractor_id  uuid not null references public.contractors(id) on delete cascade,
    slug           text unique not null,
    html           text not null,
    accent_color   text,
    hero_image_url text,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

-- One current site per contractor → the API upserts on contractor_id.
alter table public.contractor_websites
    drop constraint if exists contractor_websites_contractor_id_key;
alter table public.contractor_websites
    add constraint contractor_websites_contractor_id_key unique (contractor_id);

create index if not exists contractor_websites_contractor_id_idx
    on public.contractor_websites (contractor_id);

alter table public.contractor_websites enable row level security;

drop policy if exists contractor_websites_anon_read on public.contractor_websites;
create policy contractor_websites_anon_read
    on public.contractor_websites
    for select
    to anon, authenticated
    using (true);

grant select on public.contractor_websites to anon;

comment on table public.contractor_websites is
    'Generated shareable one-pager HTML per contractor (cockpit "Build website"). Public /site/[slug] reads it with the anon key. One current row per contractor (upsert on contractor_id).';
