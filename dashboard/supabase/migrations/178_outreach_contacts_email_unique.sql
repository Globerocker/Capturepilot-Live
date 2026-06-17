-- 178_outreach_contacts_email_unique.sql
--
-- outreach_contacts had no unique constraint on email, so every upsert with
-- ON CONFLICT (email) — the segment-build flow and the Match-Drop prepare route —
-- failed with "no unique or exclusion constraint matching the ON CONFLICT
-- specification". The 1,256 existing rows are already email-unique, so this is
-- a clean add. Email is the natural dedupe key for an outreach contact.
create unique index if not exists outreach_contacts_email_key on public.outreach_contacts (email);
