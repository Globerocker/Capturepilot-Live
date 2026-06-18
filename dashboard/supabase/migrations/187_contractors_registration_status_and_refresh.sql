-- Migration 187: SAM-REFRESH lane support columns.
-- registration_status: authoritative SAM 'Active' | 'Inactive' (no column existed before).
-- sam_refreshed_at: last time the refresh_sam_registration cron touched this row
--                   (stamped even on not-found so we don't loop forever).
-- (sam_registration_date + expiration_date already exist.)

alter table contractors add column if not exists registration_status text;
alter table contractors add column if not exists sam_refreshed_at timestamptz;

-- Index for the cron's queue prioritization + the cockpit Active/Inactive filter.
create index if not exists idx_contractors_registration_status
  on contractors (registration_status);

-- Index to make the "stale / never-refreshed first" scan cheap.
create index if not exists idx_contractors_sam_refreshed_at
  on contractors (sam_refreshed_at nulls first);
