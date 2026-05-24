-- Track Meta Lead Ads webhook submissions in marketing_leads.
-- The leadgen_id is Meta's stable per-submission identifier; the form_id
-- groups submissions by the specific lead form (e.g. CP-Lead-01).
-- Both are useful for debugging and for re-processing a single lead if
-- the Resend send fails and the row gets stranded with resend_synced=false.

alter table marketing_leads
  add column if not exists meta_leadgen_id text,
  add column if not exists meta_form_id text;

-- Unique on leadgen_id so Meta's automatic retry storm (up to 36h on non-2xx)
-- can't double-insert the same lead. Email-level dedup already exists via
-- marketing_leads_email_magnet_idx, but leadgen_id is the tighter, source-of-
-- truth signal.
create unique index if not exists marketing_leads_meta_leadgen_idx
  on marketing_leads (meta_leadgen_id)
  where meta_leadgen_id is not null;
