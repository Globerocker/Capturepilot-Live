-- Audit 2026-06-10 #6: bounce/complaint events from Resend webhook need to
-- propagate into outreach_optouts so future sends short-circuit. Add a
-- `source` column to attribute optouts (resend_webhook vs unsubscribe_link
-- vs admin_manual) for cleanup + reporting.

alter table public.outreach_optouts
    add column if not exists source text;

create index if not exists idx_outreach_optouts_source
    on public.outreach_optouts(source);

comment on column public.outreach_optouts.source is
    'Origin of the optout: resend_webhook (bounce/complaint), unsubscribe_link (user clicked footer), admin_manual (admin added).';
