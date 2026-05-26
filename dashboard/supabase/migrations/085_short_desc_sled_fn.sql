-- Function the Playwright worker calls to fetch its next batch of SLED rows
-- needing description enrichment. PostgREST can't express char_length() as a
-- filter directly, and the worker's previous JS-side "or empty" check missed
-- the long tail of rows where the upstream RSS landed a stub like
-- "Department: Procurement" (~30-50 chars) — they're non-empty but useless.
--
-- Takes the link-host substring list as a text[] so the worker can update its
-- target portals without a migration.
create or replace function get_sled_rows_needing_enrichment(
    host_patterns text[],
    max_desc_len int default 500,
    batch_size int default 3
)
returns table(
    id uuid,
    title text,
    link text,
    description text
)
language sql
stable
as $$
    select o.id, o.title, o.link, o.description
    from opportunities o
    where o.source = 'sled'
      and o.is_archived = false
      and o.link is not null
      and o.link <> ''
      and (o.description is null or char_length(o.description) < max_desc_len)
      and exists (
          select 1 from unnest(host_patterns) p
          where o.link ilike p
      )
    order by o.last_crawled_at asc nulls first
    limit batch_size;
$$;

grant execute on function get_sled_rows_needing_enrichment(text[], int, int) to service_role;
