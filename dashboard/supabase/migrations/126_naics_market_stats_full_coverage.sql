-- Migration 126: full-coverage NAICS market stats compute.
--
-- Why this exists
-- ---------------
-- `naics_market_stats` had only 30 rows even though we ingest 778 distinct
-- NAICS codes across 75K+ opportunities. The cron in
-- /api/cron/naics_stats_backfill was pulling `opportunities.select("naics_code")`
-- through the JS client, which silently caps at 1000 rows — so the cron only
-- ever "saw" the first 1000 ordered opps (a tiny slice of NAICS in the 1xxxxx
-- range) and never iterated the rest. Every market-intelligence panel for a
-- common NAICS like 541990 ($104B in awards), 541614, 336611 rendered blank.
--
-- The other problem: even with the right NAICS list, looping in JS made 778
-- round-trips to Postgres, each pulling up to 5k rows. That blew the 300s
-- maxDuration budget for any user larger than the seed list.
--
-- Fix: do the whole aggregation in a single SQL pass via this RPC. The cron
-- becomes "call RPC, write rows".

create or replace function public.compute_naics_market_stats(p_years integer default 3)
returns table (
    naics_code text,
    period_years integer,
    start_date date,
    end_date date,
    total_spend numeric,
    avg_yearly_spend numeric,
    yoy_growth_pct numeric,
    market_trend text,
    yearly_spend jsonb,
    top_agencies jsonb,
    top_states jsonb,
    top_sub_agencies jsonb,
    opp_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
    with
        -- 1. Every awarded opp inside the lookback window.
        base as (
            select
                o.naics_code,
                coalesce(o.award_amount, 0)::numeric as amt,
                extract(year from o.posted_date)::int as yr,
                coalesce(o.agency, 'Unknown') as agency,
                o.sub_agency,
                o.place_of_performance_state as state
            from opportunities o
            where o.naics_code is not null
              and o.award_amount is not null
              and o.award_amount > 0
              and o.posted_date >= (now() - (p_years * interval '1 year'))
        ),
        -- 2. Per-NAICS totals.
        totals as (
            select naics_code, sum(amt) as total_spend, count(*) as opp_count
            from base group by naics_code
        ),
        -- 3. Yearly spend per NAICS.
        yearly as (
            select naics_code, yr, sum(amt) as amt
            from base group by naics_code, yr
        ),
        yearly_json as (
            select naics_code,
                   jsonb_agg(jsonb_build_object('year', yr::text, 'spend', amt) order by yr) as yearly_spend
            from yearly group by naics_code
        ),
        -- 4. YoY: compare latest vs. prior calendar year (matches the existing
        --     route's semantics — last bucket vs. second-to-last bucket).
        ranked as (
            select naics_code, yr, amt,
                   row_number() over (partition by naics_code order by yr desc) as rn
            from yearly
        ),
        yoy as (
            select
                naics_code,
                max(case when rn = 1 then amt end) as latest_amt,
                max(case when rn = 2 then amt end) as prior_amt
            from ranked
            group by naics_code
        ),
        -- 5. Top agencies (top 5 by spend).
        agency_totals as (
            select naics_code, agency, sum(amt) as amt
            from base group by naics_code, agency
        ),
        agency_ranked as (
            select naics_code, agency, amt,
                   row_number() over (partition by naics_code order by amt desc) as rn
            from agency_totals
        ),
        agency_json as (
            select naics_code,
                   jsonb_agg(jsonb_build_object('name', agency, 'spend', amt) order by amt desc) as top_agencies
            from agency_ranked where rn <= 5 group by naics_code
        ),
        -- 6. Top sub-agencies (top 5 by spend, only non-null).
        sub_totals as (
            select naics_code, sub_agency, sum(amt) as amt
            from base where sub_agency is not null group by naics_code, sub_agency
        ),
        sub_ranked as (
            select naics_code, sub_agency, amt,
                   row_number() over (partition by naics_code order by amt desc) as rn
            from sub_totals
        ),
        sub_json as (
            select naics_code,
                   jsonb_agg(jsonb_build_object('name', sub_agency, 'spend', amt) order by amt desc) as top_sub_agencies
            from sub_ranked where rn <= 5 group by naics_code
        ),
        -- 7. Top states (top 10 by spend, only non-null).
        state_totals as (
            select naics_code, state, sum(amt) as amt
            from base where state is not null group by naics_code, state
        ),
        state_ranked as (
            select naics_code, state, amt,
                   row_number() over (partition by naics_code order by amt desc) as rn
            from state_totals
        ),
        state_json as (
            select naics_code,
                   jsonb_agg(jsonb_build_object('code', state, 'spend', amt) order by amt desc) as top_states
            from state_ranked where rn <= 10 group by naics_code
        )
    select
        t.naics_code,
        p_years                                       as period_years,
        ((now() - (p_years * interval '1 year'))::date) as start_date,
        (now()::date)                                 as end_date,
        t.total_spend,
        round(t.total_spend / nullif(p_years, 0), 0)::numeric as avg_yearly_spend,
        case
            when yoy.prior_amt is null or yoy.prior_amt = 0 then null
            else round(((yoy.latest_amt - yoy.prior_amt) / yoy.prior_amt) * 100, 0)
        end                                           as yoy_growth_pct,
        case
            when yoy.prior_amt is null or yoy.prior_amt = 0 then 'unknown'
            when ((yoy.latest_amt - yoy.prior_amt) / yoy.prior_amt) * 100 > 15 then 'hot'
            when ((yoy.latest_amt - yoy.prior_amt) / yoy.prior_amt) * 100 > 0 then 'stable'
            when ((yoy.latest_amt - yoy.prior_amt) / yoy.prior_amt) * 100 > -15 then 'soft'
            else 'declining'
        end                                           as market_trend,
        coalesce(yj.yearly_spend, '[]'::jsonb)        as yearly_spend,
        coalesce(aj.top_agencies, '[]'::jsonb)        as top_agencies,
        coalesce(stj.top_states, '[]'::jsonb)         as top_states,
        coalesce(sj.top_sub_agencies, '[]'::jsonb)    as top_sub_agencies,
        t.opp_count
    from totals t
    left join yoy        on yoy.naics_code        = t.naics_code
    left join yearly_json yj on yj.naics_code     = t.naics_code
    left join agency_json aj on aj.naics_code     = t.naics_code
    left join state_json  stj on stj.naics_code   = t.naics_code
    left join sub_json    sj on sj.naics_code     = t.naics_code;
$$;

comment on function public.compute_naics_market_stats(integer) is
    'Per-NAICS aggregate of awarded opportunities in the last N years. '
    'Returns one row per NAICS that has at least one awarded opportunity. '
    'Called by /api/cron/naics_stats_backfill — see migration 126 docstring.';

grant execute on function public.compute_naics_market_stats(integer) to service_role;
