-- ============================================================
-- Migration 039: Beta invites
-- ============================================================
-- Admin manually sends beta invitations (e.g. to LinkedIn contacts).
-- Each invite gets a tokenized signup link that pre-fills the signup
-- form and locks the email. Marked claimed when the invitee signs up.
-- ============================================================

create table if not exists public.beta_invites (
    id                uuid primary key default gen_random_uuid(),
    email             text not null,
    recipient_name    text,
    company_name      text,
    personal_note     text,
    token             text not null unique,
    sent_by           uuid references auth.users(id) on delete set null,
    sent_at           timestamptz not null default now(),
    claimed_at        timestamptz,
    claimed_by        uuid references auth.users(id) on delete set null,
    expires_at        timestamptz not null default (now() + interval '30 days'),
    created_at        timestamptz not null default now()
);

create index if not exists idx_beta_invites_token on public.beta_invites(token);
create index if not exists idx_beta_invites_email on public.beta_invites(lower(email));
create index if not exists idx_beta_invites_sent_at on public.beta_invites(sent_at desc);

alter table public.beta_invites enable row level security;

-- No public policies — all access goes through service-key admin endpoints.
-- The public /api/beta-invites/[token] route uses the service client to
-- look up an invite by its unguessable token.

comment on table public.beta_invites is
    'Manual beta invitations sent by admins. Token-based signup prefill.';
