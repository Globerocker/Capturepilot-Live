-- Migration 166 — template approval workflow.
-- The partner reviews each outreach template and approves it via a checkbox in
-- the Templates tab. `approved` gates which templates are safe to send.

ALTER TABLE public.outreach_templates
    ADD COLUMN IF NOT EXISTS approved     boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS approved_at  timestamptz,
    ADD COLUMN IF NOT EXISTS approved_by  text;
