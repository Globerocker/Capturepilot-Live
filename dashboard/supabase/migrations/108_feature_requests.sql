-- feature_requests table — local persistence for the in-app feedback form
-- (FeatureRequestForm.tsx + /api/feature-request). Row goes in here AND
-- a HubSpot ticket gets created in parallel; either failing on its own
-- doesn't lose the request.
--
-- The admin reviews them at /admin/feature-requests (UI to follow). The
-- HubSpot ticket is the source of truth for status changes — webhook
-- syncs status back when the ticket gets closed/won/lost in HubSpot.

create table if not exists public.feature_requests (
    id                 uuid primary key default gen_random_uuid(),
    user_profile_id    uuid references public.user_profiles(id) on delete set null,
    requester_email    text not null,
    category           text not null check (category in ('bug', 'feature', 'question', 'other')),
    title              text not null,
    description        text not null,
    urgency            text not null check (urgency in ('nice_to_have', 'important', 'blocking')),
    context_feature    text,                                  -- which feature surface they were on (e.g. "ai_proposals")
    hubspot_ticket_id  text,                                  -- mirror of the HubSpot ticket created in parallel
    status             text not null default 'open' check (status in ('open', 'in_progress', 'shipped', 'declined', 'wont_fix')),
    admin_notes        text,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now()
);

-- Index for the admin listing: open tickets sorted by urgency then age
create index if not exists feature_requests_status_urgency_idx
    on public.feature_requests (status, urgency, created_at desc);

-- Per-user view for "my submitted requests" in user settings later
create index if not exists feature_requests_user_idx
    on public.feature_requests (user_profile_id, created_at desc);

alter table public.feature_requests enable row level security;

-- Admins see all
create policy feature_requests_admin_all on public.feature_requests
    for all to authenticated
    using (
        exists (
            select 1 from public.user_profiles
            where user_profiles.auth_user_id = auth.uid()
              and user_profiles.account_type = 'admin'
        )
    );

-- Users see only their own
create policy feature_requests_self_select on public.feature_requests
    for select to authenticated
    using (
        user_profile_id in (
            select id from public.user_profiles where auth_user_id = auth.uid()
        )
    );

-- Service role does everything (the API route)
create policy feature_requests_service_all on public.feature_requests
    for all to service_role using (true) with check (true);

notify pgrst, 'reload schema';
