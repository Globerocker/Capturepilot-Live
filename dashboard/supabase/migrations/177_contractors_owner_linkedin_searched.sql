-- 177_contractors_owner_linkedin_searched.sql
--
-- The owner/CEO LinkedIn finder (/api/cron/find_owner_linkedin) resolves a
-- contractor decision-maker's personal LinkedIn profile via search when the
-- company site doesn't link it. This marker records that we've already searched
-- a row (found or not) so the finder never re-searches the same contractor in a
-- loop. NULL = never searched; non-NULL = searched (owner_linkedin may still be
-- NULL if no confident match was found).
alter table public.contractors
  add column if not exists owner_linkedin_searched_at timestamptz;
