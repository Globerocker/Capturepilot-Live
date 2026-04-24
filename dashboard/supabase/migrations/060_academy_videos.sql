-- ============================================================
-- Migration 060 — Academy: video support + admin CMS scaffolding
-- ============================================================
-- Lets admins publish videos alongside markdown articles. Keeps the existing
-- schema backward-compatible: old rows default to content_type='article',
-- body_md becomes optional (videos don't need it), video_* fields are null.

alter table public.academy_articles
    add column if not exists content_type     text not null default 'article',
    add column if not exists video_url        text,
    add column if not exists video_provider   text,
    add column if not exists video_embed_id   text,
    add column if not exists duration_seconds integer,
    add column if not exists thumbnail_url    text;

-- Loosen body_md: videos can live without a body (we still let authors
-- attach one if they want show notes).
alter table public.academy_articles
    alter column body_md drop not null;

-- Sanity constraint: content_type must be one of the supported kinds.
do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'academy_articles_content_type_chk'
    ) then
        alter table public.academy_articles
            add constraint academy_articles_content_type_chk
            check (content_type in ('article', 'video'));
    end if;
end $$;

create index if not exists idx_academy_content_type
    on public.academy_articles (content_type);
