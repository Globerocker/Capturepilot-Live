-- ============================================================
-- Migration 035: Allow users to add custom keywords to the library
-- ============================================================
-- The KeywordPicker falls back to "Add 'xyz' as new keyword" when a user's
-- search returns zero library matches. This migration lets authenticated
-- users insert rows *only* when source='user' — the curated 'mined' and 'ai'
-- rows still require service-role writes.
-- ============================================================

drop policy if exists "gov_keywords user insert" on public.gov_keywords;
create policy "gov_keywords user insert"
    on public.gov_keywords
    for insert
    to authenticated
    with check (source = 'user');

-- Allow users to update only rows they added. Keeps tweakability without
-- letting anyone rename curated keywords out from under other users.
drop policy if exists "gov_keywords user update" on public.gov_keywords;
create policy "gov_keywords user update"
    on public.gov_keywords
    for update
    to authenticated
    using (source = 'user')
    with check (source = 'user');

-- Track who added the keyword for audit / future moderation.
do $$ begin
    alter table public.gov_keywords add column added_by_user_id uuid references auth.users(id);
exception when duplicate_column then null;
end $$;

create index if not exists idx_gov_keywords_added_by on public.gov_keywords(added_by_user_id) where added_by_user_id is not null;

comment on column public.gov_keywords.added_by_user_id is
    'Auth user who added this keyword (only populated when source = ''user''). Lets us show ownership and filter per-user pending terms.';
