-- 190: reverse-match cache — ranked ELIGIBLE contractors per opportunity.
--
-- Populated by the reverse-match engine (src/lib/reverse-match.ts via
-- /api/admin/reverse-match). Every row here has already passed the set-aside
-- hard gate; `eligibility` is stored for auditability and `set_aside_snapshot`
-- lets a serve-time check invalidate the cache if the opportunity's set-aside
-- changed. Admin/service read only.
create table if not exists opportunity_contractor_matches (
    opportunity_id   uuid not null,
    contractor_id    uuid not null,
    score            numeric not null,
    classification   text,                       -- HOT / WARM / COLD
    eligibility      text not null default 'eligible',
    score_breakdown  jsonb,
    set_aside_snapshot text,                      -- the opp set-aside at compute time
    computed_at      timestamptz not null default now(),
    primary key (opportunity_id, contractor_id)
);

create index if not exists idx_ocm_opportunity_score
  on opportunity_contractor_matches (opportunity_id, score desc);

alter table opportunity_contractor_matches enable row level security;

-- No anon/authenticated policies → service role only (admin reads go through
-- the service client in the admin-gated route). Matches the posture of the
-- other cockpit cache tables.
comment on table opportunity_contractor_matches is
  'Reverse-match cache: ranked set-aside-ELIGIBLE contractors per opportunity. Every row passed the hard gate. Refreshed on demand with a TTL; set_aside_snapshot guards against stale eligibility when an opp set-aside changes.';
