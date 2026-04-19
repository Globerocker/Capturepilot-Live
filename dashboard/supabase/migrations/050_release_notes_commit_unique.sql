-- ============================================================
-- Migration 050 — release_notes unique index on commit_sha
-- ============================================================
-- The GitHub Action tools/changelog/capture-release-notes.mjs upserts rows
-- keyed on commit_sha. It relies on a unique index so PostgREST's
-- on_conflict=commit_sha resolution actually dedupes.

create unique index if not exists uq_release_notes_commit_sha
    on public.release_notes (commit_sha) where commit_sha is not null;
