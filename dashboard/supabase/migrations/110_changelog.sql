-- Changelog table — admin-editable, public-readable. Replaces nothing —
-- there was no changelog before; the user noted /updates currently doesn't
-- work because the page exists but reads from a deleted/empty source.
--
-- Each entry has a slug (URL-friendly), a date (release date, may differ
-- from inserted_at), a title, a markdown body, optional cover image,
-- optional category tag (feature/fix/improvement/breaking), and a
-- published flag so drafts can sit in the DB without being publicly visible.

create table if not exists public.changelog_entries (
    id              uuid primary key default gen_random_uuid(),
    slug            text not null unique,                       -- "ai-proposal-writer-v2" etc
    title           text not null,
    body_md         text not null,                              -- markdown source
    cover_image_url text,                                       -- optional hero
    category        text not null default 'feature'
        check (category in ('feature', 'fix', 'improvement', 'breaking')),
    released_at     timestamptz not null default now(),         -- date shown publicly
    published       boolean not null default false,
    author_email    text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

-- Common access pattern: public list ordered by date, only published.
create index if not exists changelog_entries_public_idx
    on public.changelog_entries (released_at desc)
    where published = true;

-- Admin pulls all (incl. drafts) by recency.
create index if not exists changelog_entries_admin_idx
    on public.changelog_entries (created_at desc);

alter table public.changelog_entries enable row level security;

-- Anyone can read PUBLISHED rows (drives /changelog public page).
create policy changelog_public_read on public.changelog_entries
    for select to anon, authenticated
    using (published = true);

-- Admins do everything.
create policy changelog_admin_all on public.changelog_entries
    for all to authenticated
    using (
        exists (
            select 1 from public.user_profiles
            where user_profiles.auth_user_id = auth.uid()
              and user_profiles.account_type = 'admin'
        )
    );

-- Service role bypass for the admin API route.
create policy changelog_service_all on public.changelog_entries
    for all to service_role using (true) with check (true);

-- Auto-update updated_at on row changes.
create or replace function public.changelog_touch_updated_at() returns trigger
language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end
$$;

drop trigger if exists changelog_touch on public.changelog_entries;
create trigger changelog_touch
    before update on public.changelog_entries
    for each row execute function public.changelog_touch_updated_at();

-- Seed a few entries so /changelog isn't empty on first deploy.
insert into public.changelog_entries (slug, title, body_md, category, released_at, published, author_email) values
(
    'pricing-tiers-light-pro',
    'New pricing: Light $39 + Pro $89',
    '## What''s new

We restructured pricing into two clear tiers:

- **Light — $39/mo** — Federal opportunities + 200 matches/day + full competitor and partner profiles
- **Pro — $89/mo** — Everything in Light + 48 states of state/local opportunities + AI proposals + AI summaries + export + API access + 3 team seats

Plus a **14-day free trial** on signup with full Pro access (except API + export — anti-scrape).

Annual saves 20%. Cancel anytime; we offer 25% off your next 2 months if you change your mind.

## Why

Direct competitors charge $1,800-$5,500/yr for what we bundle into $89/mo. We wanted the entry tier to feel obviously worth it and the upgrade to feel like a no-brainer once you start hitting state/local opportunities.

[Full pricing strategy doc](https://github.com/Globerocker/CaptiorpilotV3/blob/main/docs/PRICING_STRATEGY.md) (public).',
    'feature',
    now() - interval '1 day',
    true,
    'andre@capturepilot.com'
),
(
    'sled-coverage-48-states',
    'State/local coverage: now 48 of 50 states',
    '## What''s new

The State + Local + Education (SLED) ingest pipeline now covers **48 of 50 states**, up from 4 cities + Texas a week ago. We added 200+ active procurement portals across Bonfire, OpenGov, and Socrata.

## Behind the scenes

- Wired FlareSolverr (Chromium-based CF bypass) into the OpenGov and Bonfire scrapers to unblock 32 previously-CF-protected portals
- Added blind-seed discovery for Bonfire tenants — found Fargo ND + others
- Migration 105 fixed a missing notice_id constraint that was silently failing every upsert for 4 days

Iowa, Montana, North Dakota, and Vermont each have at least one portal seeded but use proprietary state systems for which we don''t yet have a scraper. Those four are next.',
    'improvement',
    now() - interval '2 hours',
    true,
    'andre@capturepilot.com'
),
(
    'crawl-protection-rate-limit',
    'Crawl protection added to public endpoints',
    '## What''s new

Added server-side rate limiting + bot detection on the three highest-risk public API endpoints (`/public/stats`, `/public/contractors`, `/public/contractor/[slug]`).

Per-IP per-minute limits (120/30/60 respectively). Real browsers and indexers (Googlebot, ClaudeBot, GPTBot, etc.) pass through; scrapers using `python-requests`, `curl`, `Scrapy`, `Selenium` etc. user-agents get an immediate 403.

## Why

Light tier ($39/mo) without export was a tempting "pay once, scrape, cancel" target. Server-side rate limiting closes that loophole on top of the in-app export gate.',
    'fix',
    now(),
    true,
    'andre@capturepilot.com'
)
on conflict (slug) do nothing;

notify pgrst, 'reload schema';
