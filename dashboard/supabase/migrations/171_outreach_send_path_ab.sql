-- 171_outreach_send_path_ab.sql
--
-- A/B at the send path. Campaign steps copy both variants from the template;
-- the cadence picks A or B 50/50 per recipient and records which one fired so
-- open/click/reply rates can be compared per variant.
alter table public.outreach_campaign_steps
    add column if not exists subject_b text,
    add column if not exists body_b    text;

alter table public.outreach_campaign_step_runs
    add column if not exists variant text;  -- 'A' | 'B' (null = single-variant step)
