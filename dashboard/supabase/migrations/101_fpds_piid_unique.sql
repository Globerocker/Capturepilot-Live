/**
 * Add a true unique constraint on fpds_awards.piid so the Supabase JS
 * client can use it as an onConflict target.
 *
 * Background: migration 047 created uq_fpds_natural as an EXPRESSION
 * index on (piid, coalesce(referenced_idv, ''), coalesce(modification_number, '')).
 * That's unique but PostgREST/Supabase's onConflict parameter can only
 * take plain column names — expression indexes are invisible to it.
 *
 * Since we migrated FPDS ingestion to USAspending (where Award IDs are
 * globally unique), piid alone is a safe natural key now. The old
 * referenced_idv + modification_number columns stay null for new rows.
 */

-- Drop any duplicate piid rows first (would block the constraint).
-- Keep the most recently fetched row per piid.
delete from public.fpds_awards a
using public.fpds_awards b
where a.piid = b.piid
  and a.fetched_at < b.fetched_at;

alter table public.fpds_awards
    add constraint fpds_awards_piid_unique unique (piid);
