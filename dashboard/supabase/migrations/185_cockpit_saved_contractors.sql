-- 185_cockpit_saved_contractors.sql
--
-- A per-admin "saved / shortlist" pin for cockpit leads. The cockpit
-- (/admin/cockpit) works a queue of contractors; an admin can star a contractor
-- to pull it back into a focused "Saved" source later (GET .../leads?source=saved).
--
-- One pin per (contractor, admin) — re-saving is an idempotent upsert that can
-- update the note. Unsaving deletes the row. ON DELETE CASCADE on contractor_id
-- keeps the table clean if a contractor is ever purged.
--
-- RLS: enabled. There are NO anon/authenticated policies — every read/write goes
-- through the admin API routes using the SERVICE-ROLE key (assertAdmin() gate +
-- service client), and service-role bypasses RLS. Enabling RLS with no policy
-- therefore fail-closes the anon/authenticated REST surface (no leak) while the
-- guarded API keeps full access.

create table if not exists public.cockpit_saved_contractors (
    id            uuid primary key default gen_random_uuid(),
    contractor_id uuid not null references public.contractors(id) on delete cascade,
    saved_by      uuid,
    note          text,
    created_at    timestamptz not null default now(),
    unique (contractor_id, saved_by)
);

create index if not exists cockpit_saved_contractors_contractor_id_idx
    on public.cockpit_saved_contractors (contractor_id);

create index if not exists cockpit_saved_contractors_saved_by_idx
    on public.cockpit_saved_contractors (saved_by);

alter table public.cockpit_saved_contractors enable row level security;

comment on table public.cockpit_saved_contractors is
    'Per-admin saved/shortlist pins for cockpit leads. Read/written only via the assertAdmin()-gated /api/admin/cockpit/saved route with the service-role key (RLS enabled, no anon policy → REST surface fail-closed). source=saved in the leads API joins this table.';
