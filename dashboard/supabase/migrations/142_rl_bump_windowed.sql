-- Migration 142 — Windowed rate-limiter RPC + admin observability view (R2-X3)
--
-- The original `protectCrawl()` helper at `dashboard/src/lib/protect-crawl.ts`
-- used an in-memory Map keyed by `route:ip`. That worked when a single Vercel
-- container served every request, but once Vercel horizontally scales (which
-- it does on burst traffic) each container saw its own bucket and the cap was
-- effectively `instances × maxPerMin`. The 2026-06-10 audit flagged this as a
-- "move to rl_bump RPC or Upstash Redis when convenient".
--
-- The previously-added RPC `rl_bump(p_bucket text)` (migration 109) is locked
-- to per-minute buckets keyed by `ip|route|YYYY-MM-DDTHH:MM`. That works for
-- `crawl-protection.ts` which only ever uses a 60s window, but the simpler
-- `protect-crawl.ts` helper accepts a custom `windowMs` (the
-- upload-cap-statement route caps at 3 uploads/hour, for example). So this
-- migration adds a windowed sibling that takes the window + limit explicitly
-- and returns a single boolean — `true` means the request is under the cap.
--
-- Layout:
--   key            text  — caller-chosen, e.g. "route:ip" or "user_id:route"
--   window_seconds int   — sliding-window size (60 for "per minute")
--   max_count      int   — request budget within that window
--
-- Returns:
--   true  → under limit, request is allowed (counter has been incremented)
--   false → at-or-over limit, request should be 429'd
--
-- Implementation reuses the existing `rate_limit_buckets` table by quantising
-- the timestamp into the window before forming the bucket key. A 60s window
-- collapses to the same buckets `rl_bump` already produces, so the GC sweep
-- and storage cost stay the same.

create or replace function public.rl_bump_windowed(
    p_key text,
    p_window_seconds int,
    p_max_count int
) returns boolean
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
    -- Window the timestamp by truncating to the start of the bucket.
    -- e.g. window_seconds=60 collapses to per-minute buckets;
    --      window_seconds=3600 collapses to per-hour buckets.
    window_start timestamptz := to_timestamp(
        floor(extract(epoch from now()) / greatest(p_window_seconds, 1))
        * greatest(p_window_seconds, 1)
    );
    bucket_key text := p_key || '|' || extract(epoch from window_start)::bigint::text;
    new_count integer;
begin
    insert into public.rate_limit_buckets (bucket, count)
    values (bucket_key, 1)
    on conflict (bucket) do update set count = rate_limit_buckets.count + 1
    returning count into new_count;

    -- Lazy GC — same opportunistic sweep `rl_bump` uses (1-in-100 calls).
    -- Keeps the table small without a dedicated cron.
    if (random() * 100)::int = 0 then
        delete from public.rate_limit_buckets where created_at < now() - interval '15 minutes';
    end if;

    return new_count <= p_max_count;
end
$$;

-- Service-role only. The protectCrawl callers all run server-side with the
-- SUPABASE_SERVICE_KEY, so this keeps the function unavailable from anon /
-- authenticated PostgREST endpoints (no bypass via client-side JS).
grant execute on function public.rl_bump_windowed(text, int, int) to service_role;
revoke execute on function public.rl_bump_windowed(text, int, int) from public, anon, authenticated;

-- Observability — sticky "last 60 seconds" view of top rate-limited keys.
-- `/admin/health` reads this to surface abusive IPs / routes. We can't see
-- *which* requests were 429'd (that's a Vercel log thing) but we can see the
-- top buckets that hit ≥ 80% of their budget, which is the same signal.
--
-- Buckets in `rate_limit_buckets` are keyed by `key|window_epoch`. We strip
-- the trailing window_epoch so the view rolls up to the human-readable key.
create or replace view public.top_rate_limited_60s as
    select
        -- Strip the trailing `|<window_epoch>` suffix so the view shows the
        -- raw caller key (e.g. "brand:1.2.3.4" instead of
        -- "brand:1.2.3.4|1718037600").
        regexp_replace(bucket, '\|\d+$', '') as key,
        count                                  as hit_count,
        created_at
    from public.rate_limit_buckets
    where created_at > now() - interval '60 seconds'
    order by count desc
    limit 50;

-- The view inherits the underlying table's RLS, so anon/authenticated still
-- can't read it from PostgREST. Service-role and admin-only API routes can.
grant select on public.top_rate_limited_60s to service_role;

notify pgrst, 'reload schema';
