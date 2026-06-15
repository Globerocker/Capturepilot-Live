-- Migration 165 — explain each outreach template in the library.
-- Adds a short "what / why / when" description shown under the template name
-- in the Templates tab (e.g. "Step 1 · Day 0 · cold open with icebreaker").

ALTER TABLE public.outreach_templates
    ADD COLUMN IF NOT EXISTS description text;
