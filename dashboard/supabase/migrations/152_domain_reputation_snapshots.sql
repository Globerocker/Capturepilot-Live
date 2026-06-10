-- ============================================================
-- Migration 152: Domain reputation snapshots
-- ============================================================
-- Why: Outbound deliverability quietly degrades when SPF, DKIM,
-- or DMARC records flip — and we only learn after bounce rate
-- spikes. This table records a daily snapshot of the sending
-- domain's auth records plus deliverability KPIs (bounce rate,
-- complaint rate, gmail inbox rate) so we can alert on regression
-- and plot trends in /admin/outreach.
-- ============================================================

create table if not exists public.domain_reputation_snapshots (
    id               uuid primary key default gen_random_uuid(),
    domain           text not null,
    snapshot_at      timestamptz not null default now(),
    spf_pass         boolean,
    dkim_pass        boolean,
    dmarc_pass       boolean,
    bounce_rate      numeric,        -- 0..1 (e.g. 0.0123 = 1.23%)
    complaint_rate   numeric,        -- 0..1
    gmail_inbox_rate numeric,        -- 0..1, placeholder until Postmaster Tools wired
    source           text,           -- 'dns' | 'resend' | 'postmaster' | 'manual'
    raw              jsonb not null default '{}'::jsonb
);

create index if not exists idx_domain_rep_domain_time
    on public.domain_reputation_snapshots(domain, snapshot_at desc);
create index if not exists idx_domain_rep_snapshot_at
    on public.domain_reputation_snapshots(snapshot_at desc);

alter table public.domain_reputation_snapshots enable row level security;

-- Service role writes; admins read via API. No direct authenticated read policy —
-- the /api/admin/outreach/* routes gate access via assertAdmin().
drop policy if exists "domain_reputation service write" on public.domain_reputation_snapshots;
create policy "domain_reputation service write"
    on public.domain_reputation_snapshots
    for all
    to service_role
    using (true)
    with check (true);

comment on table public.domain_reputation_snapshots is
    'Daily snapshot of sending-domain auth (SPF/DKIM/DMARC) + deliverability KPIs. Written by /api/cron/check_domain_reputation. Read by /admin/outreach Settings tab.';
comment on column public.domain_reputation_snapshots.bounce_rate is
    'Fraction (0..1). Red line at >0.02 (2%) per Gmail/Yahoo bulk-sender rules.';
comment on column public.domain_reputation_snapshots.complaint_rate is
    'Fraction (0..1). Red line at >0.001 (0.1%) per Gmail/Yahoo bulk-sender rules.';
comment on column public.domain_reputation_snapshots.gmail_inbox_rate is
    'Fraction (0..1) of Gmail-delivered mail landing in Inbox. Populated once Postmaster Tools API is wired.';
