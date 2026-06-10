-- Migration 149: outreach replies + inbox + sentiment classification
-- Stream R3-M1.2
--
-- Adds the reply-side of the outreach pipeline. Once an outbound campaign
-- email goes out via R3-M1.x, replies hit Resend's inbound webhook and land
-- here. A lightweight Postgres helper marks every new row as 'unsure'; a
-- Vercel route running gpt-4o-mini in JSON mode then back-fills the real
-- sentiment + intent and (optionally) auto-pauses the campaign.
--
-- Tables
--   outreach_replies         — one row per inbound message
--   outreach_inbox_settings  — singleton (id=1) with classifier/auto-pause toggles
--
-- The FKs to outreach_campaign_step_runs / outreach_contacts use ON DELETE
-- SET NULL so a reply survives campaign/contact cleanup (we still want the
-- human conversation log).

create table if not exists public.outreach_replies (
    id                         uuid primary key default gen_random_uuid(),
    campaign_step_run_id       uuid references public.outreach_campaign_step_runs(id) on delete set null,
    contact_id                 uuid references public.outreach_contacts(id) on delete set null,
    from_email                 text not null,
    from_name                  text,
    subject                    text,
    body_text                  text,
    body_html                  text,
    received_at                timestamptz not null default now(),
    message_id                 text,
    in_reply_to                text,
    sentiment                  text
        check (sentiment in ('positive','neutral','negative','unsure','auto_reply','unsubscribe')),
    intent                     text
        check (intent in ('interested','not_interested','meeting_request','reschedule','forwarded','oof','unknown')),
    parsed_meeting_url         text,
    classification_confidence  numeric,
    classified_at              timestamptz,
    is_handled                 boolean not null default false,
    handled_at                 timestamptz,
    handled_by                 uuid references public.user_profiles(id) on delete set null,
    notes                      text,
    created_at                 timestamptz not null default now()
);

create index if not exists idx_outreach_replies_received_at
    on public.outreach_replies (received_at desc);

create index if not exists idx_outreach_replies_sentiment_handled
    on public.outreach_replies (sentiment, is_handled);

create index if not exists idx_outreach_replies_campaign_step_run
    on public.outreach_replies (campaign_step_run_id);

create index if not exists idx_outreach_replies_contact
    on public.outreach_replies (contact_id);

create unique index if not exists uq_outreach_replies_message_id
    on public.outreach_replies (message_id)
    where message_id is not null;


-- Singleton settings row. Forced to id=1 so the app can upsert without
-- worrying about row identity.
create table if not exists public.outreach_inbox_settings (
    id                              integer primary key default 1,
    sentiment_classifier_enabled    boolean not null default true,
    auto_pause_campaign_on_reply    boolean not null default true,
    default_signature               text,
    default_reply_to                text,
    updated_at                      timestamptz not null default now(),
    constraint outreach_inbox_settings_singleton check (id = 1)
);

insert into public.outreach_inbox_settings (id)
    values (1)
    on conflict (id) do nothing;


-- Placeholder classifier. The real classification happens in a Vercel route
-- (gpt-4o-mini JSON mode) which UPDATEs the row with the actual sentiment +
-- intent + parsed_meeting_url. This function just gives the DB a stable
-- fallback so a new row is never NULL on sentiment.
create or replace function public.classify_reply_sentiment(p_body text, p_subject text)
returns text
language plpgsql
immutable
security invoker
set search_path = public, pg_temp
as $$
begin
    -- Placeholder: real classification runs out-of-band from /api/outreach/classify-reply.
    -- Returning 'unsure' lets the cron / UI pick this row up and route it through
    -- the LLM call. Lower-case unsub keywords are caught here as a cheap fast-path
    -- so we never accidentally auto-reply to an unsubscribe request.
    if p_body is not null and (
        lower(p_body) like '%unsubscribe%'
        or lower(p_body) like '%opt out%'
        or lower(p_body) like '%remove me%'
        or lower(p_body) like '%take me off%'
    ) then
        return 'unsubscribe';
    end if;

    if p_subject is not null and (
        lower(p_subject) like '%out of office%'
        or lower(p_subject) like '%auto%reply%'
        or lower(p_subject) like '%automatic reply%'
    ) then
        return 'auto_reply';
    end if;

    return 'unsure';
end;
$$;

comment on function public.classify_reply_sentiment(text, text) is
    'Placeholder sentiment classifier. Returns ''unsubscribe'' / ''auto_reply'' on obvious keyword hits, else ''unsure''. The real LLM-based classifier runs from /api/outreach/classify-reply and overwrites the row.';


-- ===========================
-- RLS — admin-only
-- ===========================
alter table public.outreach_replies enable row level security;

drop policy if exists outreach_replies_admin_all on public.outreach_replies;
create policy outreach_replies_admin_all
    on public.outreach_replies
    for all
    to authenticated
    using (
        exists (
            select 1 from public.user_profiles
            where auth_user_id = auth.uid() and account_type = 'admin'
        )
    )
    with check (
        exists (
            select 1 from public.user_profiles
            where auth_user_id = auth.uid() and account_type = 'admin'
        )
    );

alter table public.outreach_inbox_settings enable row level security;

drop policy if exists outreach_inbox_settings_admin_all on public.outreach_inbox_settings;
create policy outreach_inbox_settings_admin_all
    on public.outreach_inbox_settings
    for all
    to authenticated
    using (
        exists (
            select 1 from public.user_profiles
            where auth_user_id = auth.uid() and account_type = 'admin'
        )
    )
    with check (
        exists (
            select 1 from public.user_profiles
            where auth_user_id = auth.uid() and account_type = 'admin'
        )
    );


-- ===========================
-- Comments / column docs
-- ===========================
comment on table  public.outreach_replies is
    'Inbound replies to outbound campaign emails. Resend inbound webhook -> /api/outreach/inbound writes here. Classifier (gpt-4o-mini) back-fills sentiment + intent + parsed_meeting_url.';
comment on column public.outreach_replies.campaign_step_run_id is
    'FK to the original outbound send (outreach_campaign_step_runs.id). NULL if we cannot match the reply to a known send.';
comment on column public.outreach_replies.contact_id is
    'Resolved by from_email lookup against outreach_contacts. NULL when the sender is not in our list (forwarded reply, new contact, etc.).';
comment on column public.outreach_replies.sentiment is
    'positive | neutral | negative | unsure | auto_reply | unsubscribe. ''unsure'' means the LLM has not classified yet.';
comment on column public.outreach_replies.intent is
    'interested | not_interested | meeting_request | reschedule | forwarded | oof | unknown.';
comment on column public.outreach_replies.parsed_meeting_url is
    'Calendly / Cal.com / HubSpot meeting link the LLM extracted from the reply body, if any.';
comment on column public.outreach_replies.classification_confidence is
    '0..1 confidence score from the LLM classifier. NULL until classified.';

comment on table  public.outreach_inbox_settings is
    'Singleton (id=1) of inbox-wide toggles: classifier on/off, auto-pause-on-reply, default signature + reply-to.';
