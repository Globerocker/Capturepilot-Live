-- Rate-limit storage for lib/crawl-protection.ts.
--
-- One row per (ip, route, minute) tuple. The protectCrawl() helper calls
-- `rl_bump(bucket)` which UPSERTs + atomically increments. Reads are
-- O(1) via the primary key, so 1000+ req/sec scales fine on Supabase Free.
--
-- Cleanup: rows older than 10 min are dead weight. We GC them in a daily
-- cron (handled separately) or via the included trigger which prunes lazily
-- on every Nth INSERT.

create table if not exists public.rate_limit_buckets (
    bucket      text primary key,                -- "ip|route|YYYY-MM-DDTHH:MM"
    count       integer not null default 0,
    created_at  timestamptz not null default now()
);

-- Index on created_at so GC sweeps run fast.
create index if not exists rate_limit_buckets_created_at_idx
    on public.rate_limit_buckets (created_at);

-- Atomic-increment RPC. UPSERT with ON CONFLICT increments + returns new count.
-- Called by lib/crawl-protection.ts on every protected request.
create or replace function public.rl_bump(p_bucket text) returns integer
language plpgsql security definer
as $$
declare
    new_count integer;
begin
    insert into public.rate_limit_buckets (bucket, count)
    values (p_bucket, 1)
    on conflict (bucket) do update set count = rate_limit_buckets.count + 1
    returning count into new_count;

    -- Opportunistic GC: every 1-in-100 calls, sweep rows older than 10 min.
    -- Keeps the table small without needing a dedicated cron.
    if (random() * 100)::int = 0 then
        delete from public.rate_limit_buckets where created_at < now() - interval '10 minutes';
    end if;

    return new_count;
end
$$;

-- RLS: only the service role writes (the API route uses service key).
alter table public.rate_limit_buckets enable row level security;
create policy rate_limit_buckets_service_only on public.rate_limit_buckets
    for all to service_role using (true) with check (true);

-- Allow the rl_bump function to be called by service_role only.
grant execute on function public.rl_bump(text) to service_role;
revoke execute on function public.rl_bump(text) from public, anon, authenticated;

notify pgrst, 'reload schema';
