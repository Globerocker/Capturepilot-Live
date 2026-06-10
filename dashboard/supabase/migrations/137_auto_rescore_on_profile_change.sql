-- 137 — Auto-rescore worker job on user_profile change
--
-- Two changes that go together:
--   (1) Extend worker_jobs.dedup_key so payload->>'user_profile_id' is part of
--       the uniqueness window. Without this, every rescore_user_matches row
--       collapses to "rescore_user_matches|" and the partial unique index
--       blocks all but the first one in flight.
--   (2) Add an AFTER UPDATE trigger on user_profiles that enqueues a
--       rescore_user_matches worker job whenever a scoring-relevant column
--       changes. The existing dedup index then coalesces rapid edits (e.g.
--       the settings page autosaves three fields in 5 seconds) into a single
--       queued job, so we never pile up redundant scoring runs.
--
-- The trigger fires for any change to the columns the scorer reads. New
-- scoring inputs added later should be appended to the WHEN clause.

------------------------------------------------------------
-- 1. Drop + re-add the generated dedup_key column with
--    payload->>'user_profile_id' included.
------------------------------------------------------------

alter table worker_jobs drop column dedup_key;

alter table worker_jobs
    add column dedup_key text generated always as (
        task_type || '|' || coalesce(
            payload->>'opp_id',
            payload->>'host',
            payload->>'company_id',
            payload->>'lead_id',
            payload->>'user_profile_id',
            ''
        )
    ) stored;

-- Recreate the partial unique index that was dropped with the column.
create unique index if not exists worker_jobs_dedup_active_idx
    on worker_jobs (dedup_key)
    where status in ('pending', 'running');

------------------------------------------------------------
-- 2. Auto-rescore trigger on user_profiles.
------------------------------------------------------------

create or replace function enqueue_user_rescore() returns trigger
language plpgsql
as $$
begin
    -- Insert ON CONFLICT DO NOTHING — multiple rapid saves coalesce to a
    -- single in-flight rescore via the dedup_key partial unique index.
    insert into worker_jobs (task_type, payload, priority)
    values (
        'rescore_user_matches',
        jsonb_build_object('user_profile_id', new.id, 'reason', 'profile_change'),
        8
    )
    on conflict (dedup_key) where status in ('pending','running') do nothing;
    return new;
end;
$$;

drop trigger if exists on_user_profile_change_rescore on user_profiles;

-- Fire only when a column the scorer actually reads changes. Otherwise
-- every autosave (e.g. updating notes JSON or last_seen_at) would
-- needlessly enqueue a rescore.
create trigger on_user_profile_change_rescore
    after update on user_profiles
    for each row
    when (
        new.naics_codes is distinct from old.naics_codes
        or new.primary_keywords is distinct from old.primary_keywords
        or new.secondary_keywords is distinct from old.secondary_keywords
        or new.sba_certifications is distinct from old.sba_certifications
        or new.state is distinct from old.state
        or new.target_states is distinct from old.target_states
        or new.revenue is distinct from old.revenue
        or new.target_psc_codes is distinct from old.target_psc_codes
        or new.preferred_agencies is distinct from old.preferred_agencies
        or new.federal_awards_count is distinct from old.federal_awards_count
        or new.is_veteran_owned is distinct from old.is_veteran_owned
        or new.veteran_cert_type is distinct from old.veteran_cert_type
    )
    execute function enqueue_user_rescore();

comment on function enqueue_user_rescore() is
    'Enqueues a rescore_user_matches worker_jobs row whenever a scoring-relevant column on user_profiles changes. Idempotent via worker_jobs.dedup_key (migration 137).';
