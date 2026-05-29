/**
 * Two related fixes:
 *
 * 1. Indexes for `n()` count queries in send_daily_digest.
 *    The current query `select count from opportunities where created_at >= yesterday`
 *    silently returns 0 on timeout because there's no index on created_at. That's
 *    why the morning digest has been reporting "0 new opportunities" for days
 *    even though federal grew +600/24h.
 *
 *    Same problem for contractors.created_at and contractor_profile_pages.published_at.
 *
 * 2. link_broken flag for the link-validator cron.
 *    Some SLED opps land with link = `https://<portal>/opportunities/<id>` where
 *    the project_id has rotated or the listing was deleted. We need a way to
 *    flag known-broken links so the frontend can hide the dead button + show a
 *    Google-search fallback instead.
 */

-- ─── Indexes for digest counts ─────────────────────────────────────────────
create index if not exists idx_opportunities_created_at
    on public.opportunities(created_at desc);

create index if not exists idx_opportunities_source_created_at
    on public.opportunities(source, created_at desc);

create index if not exists idx_contractors_created_at
    on public.contractors(created_at desc);

-- ─── Link validation ───────────────────────────────────────────────────────
alter table public.opportunities
    add column if not exists link_broken boolean default false,
    add column if not exists link_last_checked_at timestamptz;

-- Index supports "next 500 to validate" worker queries (oldest checks first,
-- and not-yet-checked rows first).
create index if not exists idx_opportunities_link_check
    on public.opportunities(link_last_checked_at nulls first)
    where source = 'sled' and is_archived = false and link is not null;
