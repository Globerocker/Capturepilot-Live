-- 062_govtribe_cache.sql
--
-- Shared cache for GovTribe MCP aggregation responses. Each MCP call costs
-- ~1-2 s (3 round-trips through their session protocol), so we keep the
-- response keyed by (tool_name, args_hash) with a per-tool TTL.

create table if not exists public.govtribe_cache (
    cache_key   text primary key,
    tool_name   text not null,
    args        jsonb not null,
    response    jsonb not null,
    fetched_at  timestamptz not null default now(),
    expires_at  timestamptz not null
);
create index if not exists govtribe_cache_expires_idx on public.govtribe_cache (expires_at);
create index if not exists govtribe_cache_tool_idx on public.govtribe_cache (tool_name);

alter table public.govtribe_cache enable row level security;
drop policy if exists govtribe_cache_service_all on public.govtribe_cache;
create policy govtribe_cache_service_all on public.govtribe_cache
    for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
