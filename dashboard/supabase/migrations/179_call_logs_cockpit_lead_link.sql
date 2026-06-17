-- 179_call_logs_cockpit_lead_link.sql
--
-- call_logs previously could only attach to an opportunity_id (opportunity-scoped
-- "Call & Transcribe" panel on /opportunities/[id]). The cockpit (/admin/cockpit)
-- lets a partner record/transcribe a sales call directly against a lead — a
-- contractors row or an outreach_contacts row — which has no opportunity. Add two
-- nullable foreign keys so a call log can hang off a cockpit lead instead. A row
-- still requires user_profile_id; opportunity_id / contractor_id / outreach_contact_id
-- are all optional and mutually independent.
alter table public.call_logs
  add column if not exists contractor_id uuid references public.contractors(id) on delete set null,
  add column if not exists outreach_contact_id uuid references public.outreach_contacts(id) on delete set null;

create index if not exists idx_call_logs_contractor
  on public.call_logs (contractor_id)
  where contractor_id is not null;

create index if not exists idx_call_logs_outreach_contact
  on public.call_logs (outreach_contact_id)
  where outreach_contact_id is not null;
