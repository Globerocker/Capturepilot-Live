-- Migrate any users still on legacy plan_tier codes to the migration-111
-- equivalents. The plan_tiers seed in 111 only inserts free / light / pro /
-- agency rows, but historic user_profiles rows still point at old codes
-- (free_beta from the public beta period, starter from migration 071,
-- enterprise from pre-rename). Without this they show "Free Beta" badges
-- + the wrong feature set because their plan_tier doesn't match anything
-- in plan_tiers.
--
-- Mapping rationale:
--   free_beta  → free      (beta is over; they need to pick a real plan)
--   starter    → light     (price + feature set match Light $39/mo)
--   enterprise → agency    (rename, no semantic change)

update public.user_profiles
   set plan_tier = 'free'
 where plan_tier = 'free_beta';

update public.user_profiles
   set plan_tier = 'light'
 where plan_tier = 'starter';

update public.user_profiles
   set plan_tier = 'agency'
 where plan_tier = 'enterprise';

-- Drop any orphan plan_tiers rows for the legacy codes so the public
-- /pricing page never accidentally renders them. Safe — migration 111
-- already wiped + re-seeded the canonical four codes.
delete from public.plan_tiers
 where code in ('free_beta', 'starter', 'enterprise');

notify pgrst, 'reload schema';
