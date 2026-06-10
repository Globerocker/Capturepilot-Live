-- ============================================================
-- Migration 146: user_profiles.tier column (R2-X4)
-- ============================================================
-- Adds a `tier` column to user_profiles to distinguish Pro vs Team
-- vs Enterprise subscriptions. The legacy `account_type` column
-- (self_service / consulting / admin) stays untouched — it describes
-- *how* a user uses the platform; `tier` describes *what they pay for*.
--
-- All existing rows default to 'pro' so feature gates fall back to the
-- current Pro experience until an upgrade webhook flips the column.
-- ============================================================

do $$ begin
    alter table public.user_profiles
        add column tier text not null default 'pro';
exception when duplicate_column then null;
end $$;

-- Constrain to the four known values. Done as a separate ALTER so the
-- default-fill above can succeed even on tables with millions of rows.
do $$ begin
    alter table public.user_profiles
        add constraint user_profiles_tier_check
        check (tier in ('free', 'pro', 'team', 'enterprise'));
exception when duplicate_object then null;
end $$;

comment on column public.user_profiles.tier is
    'Subscription tier: free | pro | team | enterprise. Distinct from account_type (self_service/consulting/admin) which describes the user model, not the price tier. Updated by the Stripe webhook on checkout.session.completed using subscription metadata.tier.';

-- Backfill: any active/trialing subscription is at least Pro. Anyone
-- still on `subscription_status = 'free'` keeps the 'pro' default — the
-- scoring + UI fall back gracefully and the column matters mainly for
-- the (future) Team feature gates.
update public.user_profiles
   set tier = 'pro'
 where tier is null;
