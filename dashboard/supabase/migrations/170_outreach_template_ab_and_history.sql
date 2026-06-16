-- 170_outreach_template_ab_and_history.sql
--
-- A/B variants + change history for outreach_templates.
--
-- 1. Adds subject_b / body_b so every template carries a "B" variant for
--    split-testing (subject line and body, independently).
-- 2. Adds outreach_template_versions — an automatic, append-only history of
--    every edit, so a bad rewrite is always one click from rollback.
-- 3. A BEFORE UPDATE trigger snapshots the PRE-edit row into the history table
--    whenever any content column changes. The first time we touch a template
--    (e.g. the B-variant seed) it captures the pristine original as version 1.

-- ── 1. A/B columns ──────────────────────────────────────────────────────────
alter table public.outreach_templates
    add column if not exists subject_b text,
    add column if not exists body_b    text;

-- ── 2. History table ────────────────────────────────────────────────────────
create table if not exists public.outreach_template_versions (
    id           uuid primary key default gen_random_uuid(),
    template_id  uuid not null references public.outreach_templates(id) on delete cascade,
    version      integer not null,
    name         text,
    channel      text,
    subject      text,
    subject_b    text,
    body         text,
    body_b       text,
    category     text,
    description  text,
    approved     boolean,
    snapshot_at  timestamptz not null default now()
);

create unique index if not exists outreach_template_versions_tpl_ver_idx
    on public.outreach_template_versions (template_id, version);
create index if not exists outreach_template_versions_tpl_idx
    on public.outreach_template_versions (template_id, snapshot_at desc);

-- Internal admin table — lock it from the anon/authenticated REST surface.
-- (Admin routes use the service key, which bypasses RLS.)
alter table public.outreach_template_versions enable row level security;

-- ── 3. Snapshot trigger ─────────────────────────────────────────────────────
-- Captures the OLD (pre-edit) row as the next version number for that template
-- on any content change. Combined with the B-variant seed below, version 1 of
-- every template is its pristine pre-A/B copy.
create or replace function public.snapshot_outreach_template_version()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
    next_v integer;
begin
    select coalesce(max(version), 0) + 1
      into next_v
      from public.outreach_template_versions
     where template_id = OLD.id;

    insert into public.outreach_template_versions
        (template_id, version, name, channel, subject, subject_b, body, body_b,
         category, description, approved, snapshot_at)
    values
        (OLD.id, next_v, OLD.name, OLD.channel, OLD.subject, OLD.subject_b,
         OLD.body, OLD.body_b, OLD.category, OLD.description, OLD.approved, now());

    return NEW;
end;
$$;

drop trigger if exists trg_snapshot_outreach_template on public.outreach_templates;
create trigger trg_snapshot_outreach_template
    before update on public.outreach_templates
    for each row
    when (
        OLD.subject     is distinct from NEW.subject
        or OLD.subject_b is distinct from NEW.subject_b
        or OLD.body      is distinct from NEW.body
        or OLD.body_b    is distinct from NEW.body_b
        or OLD.name      is distinct from NEW.name
        or OLD.category  is distinct from NEW.category
        or OLD.description is distinct from NEW.description
    )
    execute function public.snapshot_outreach_template_version();
