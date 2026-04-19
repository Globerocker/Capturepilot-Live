-- ============================================================
-- Migration 049 — Academy + Product Updates + Admin Opportunity Pushes
-- ============================================================
-- Three loosely-related additions:
--   1. academy_articles — ungated learning library surfaced inside the app,
--      teased on the marketing site as lead magnets.
--   2. release_notes — "What we're building" timeline. Public on the website,
--      rendered as a vertical changelog feed.
--   3. admin_opportunity_pushes — audit trail for when Andre / an admin
--      hand-picks an opportunity and pushes it into an agency client's
--      pipeline. Paired with a pipeline_activity entry + customer email.

-- ------------------------------------------------------------
-- academy_articles
-- ------------------------------------------------------------
create table if not exists public.academy_articles (
    id             uuid primary key default gen_random_uuid(),
    slug           text not null unique,
    title          text not null,
    excerpt        text,
    body_md        text not null,                    -- Markdown body; rendered server-side for SEO
    category       text not null default 'playbook', -- 'playbook' | 'cert' | 'proposal' | 'pricing' | 'market_intel'
    reading_minutes integer,
    featured       boolean not null default false,
    teaser_public  boolean not null default true,    -- If true, title + excerpt appear on the website (body stays app-only)
    cover_image_url text,
    author_name    text default 'CapturePilot Team',
    published_at   timestamptz,
    updated_at     timestamptz not null default now(),
    created_at     timestamptz not null default now()
);

create index if not exists idx_academy_published on public.academy_articles (published_at desc) where published_at is not null;
create index if not exists idx_academy_category on public.academy_articles (category);

-- ------------------------------------------------------------
-- release_notes
-- ------------------------------------------------------------
create table if not exists public.release_notes (
    id             uuid primary key default gen_random_uuid(),
    version        text,                             -- optional semantic version
    title          text not null,
    summary        text not null,                    -- 1-3 sentences — public-facing, tease without revealing moat
    category       text not null default 'feature',  -- 'feature' | 'fix' | 'performance' | 'integration'
    highlights     text[] default '{}'::text[],      -- bullet list shown under the title
    shipped_at     timestamptz not null default now(),
    is_public      boolean not null default true,
    commit_sha     text,                             -- optional git sha pointer for internal reference
    created_at     timestamptz not null default now()
);

create index if not exists idx_release_notes_shipped on public.release_notes (shipped_at desc);
create index if not exists idx_release_notes_public on public.release_notes (shipped_at desc) where is_public = true;

-- ------------------------------------------------------------
-- admin_opportunity_pushes
-- ------------------------------------------------------------
create table if not exists public.admin_opportunity_pushes (
    id             uuid primary key default gen_random_uuid(),
    user_profile_id uuid not null references public.user_profiles(id) on delete cascade,
    opportunity_id uuid not null,
    pursuit_id     uuid,                             -- populated after pursuit row is created
    pushed_by_user_id uuid references auth.users(id),
    pushed_by_name text default 'Americurial Team',
    notes          text,                             -- internal context
    customer_message text,                           -- free-form message shown in the email to the client
    email_sent_at  timestamptz,
    created_at     timestamptz not null default now()
);

create index if not exists idx_admin_pushes_user on public.admin_opportunity_pushes (user_profile_id, created_at desc);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.academy_articles            enable row level security;
alter table public.release_notes               enable row level security;
alter table public.admin_opportunity_pushes    enable row level security;

do $$
begin
    -- Academy: full content readable to any signed-in user; teaser subset is
    -- handled by the public /api/academy endpoint which uses service key.
    if not exists (select 1 from pg_policies where tablename='academy_articles' and policyname='academy_read_auth') then
        create policy "academy_read_auth" on public.academy_articles for select
            using (auth.uid() is not null);
    end if;

    -- Release notes: public-readable if is_public = true
    if not exists (select 1 from pg_policies where tablename='release_notes' and policyname='release_notes_public') then
        create policy "release_notes_public" on public.release_notes for select
            using (is_public = true);
    end if;

    -- Admin pushes: owner (customer) can read their own
    if not exists (select 1 from pg_policies where tablename='admin_opportunity_pushes' and policyname='pushes_owner_read') then
        create policy "pushes_owner_read" on public.admin_opportunity_pushes for select
            using (user_profile_id in (
                select id from public.user_profiles where auth_user_id = auth.uid()
            ));
    end if;
end $$;

-- ------------------------------------------------------------
-- Seed a handful of Academy articles + release notes so the lists render on first deploy
-- ------------------------------------------------------------
insert into public.academy_articles (slug, title, excerpt, body_md, category, reading_minutes, featured, teaser_public, published_at)
values
    (
        'sdvosb-first-90-days',
        'Your First 90 Days as an SDVOSB',
        'A week-by-week playbook for veteran-owned firms getting their first federal contract — what to do in weeks 1-4, 5-8, and 9-12.',
        E'# Your First 90 Days as an SDVOSB\n\nRegistered your UEI. Signed up for CapturePilot. Now what?\n\nThis playbook was written by our capture team — every step is something we coach our managed clients through.\n\n## Weeks 1-4: Foundation\n\n- Confirm VetCert status via SAM.gov\n- Build your capability statement (use our AI drafter)\n- Pick your 3 primary NAICS codes\n- Register with the VA OSDBU\n- Attend one veteran matchmaking event\n\n## Weeks 5-8: First Pursuits\n\n- Set up HOT match alerts on SDVOSB set-asides\n- Respond to your first Sources Sought\n- Reach out to 5 prime contractors as a subcontractor\n- Join a GSA Schedule if annual revenue >$500K\n\n## Weeks 9-12: First Bid\n\n- Identify one winnable < $250K SAP opportunity\n- Use our Capture Brief to assess PWin\n- Draft with the AI Proposal Writer\n- Submit and iterate\n\n---\n\nRun out of runway? Book a 20-minute vet-to-vet call with Andre at americurial.com.',
        'playbook', 6, true, true, now()
    ),
    (
        'recompete-radar-how-to',
        'How to Use Recompete Radar',
        'Recompete Radar flags contracts expiring in the next 3-18 months. Here''s how to convert those leads into wins before the RFP drops.',
        E'# Using Recompete Radar\n\n**Goal**: Identify the incumbent on an expiring contract, then position yourself 6-12 months before the recompete RFP drops.\n\n## Step 1: Filter to high-confidence candidates\n\nUse the confidence filter in `/recompetes`. High-confidence = 70%+ likely to recompete based on agency history + contract end date + competition pattern.\n\n## Step 2: Build the capture case\n\nFor each candidate:\n1. Research the incumbent''s past performance\n2. Identify 2-3 incumbent weaknesses\n3. Map your strengths to those gaps\n\n## Step 3: Engage the contracting officer early\n\nSend a capability statement. Request an industry day. Ask to be added to the Sources Sought distribution.\n\n## Step 4: Generate a Capture Brief\n\nFrom the opportunity detail page, click **Generate Brief**. Review the win themes.\n\n## Step 5: Monitor for the RFP\n\nSubscribe to `recompete.high_confidence` webhooks or Slack alerts — we fire the moment the solicitation drops.',
        'playbook', 4, true, true, now()
    ),
    (
        'vetcert-2026-checklist',
        'VetCert 2026: The Definitive Checklist',
        'The SBA merged CVE and Vets First into one VetCert program. Here''s the complete 14-point readiness checklist — exactly what you need before filing.',
        E'# VetCert 2026 Readiness Checklist\n\n**Who this is for**: Veteran-owned firms preparing to apply for SDVOSB or VOSB certification through the SBA''s new VetCert portal (which replaced CVE + Vets First in 2023).\n\n## Entity Documents\n\n- [ ] SAM.gov active registration with UEI\n- [ ] Articles of incorporation / LLC operating agreement\n- [ ] All ownership documents (51%+ veteran ownership)\n- [ ] DD-214 for all veteran owners\n- [ ] VA disability rating letter (SDVOSB only)\n\n## Control Documents\n\n- [ ] Bylaws showing veteran control\n- [ ] Signature authority on bank account(s)\n- [ ] Board resolutions / meeting minutes\n- [ ] Executive compensation records\n\n## Operational Documents\n\n- [ ] Business license + state registration\n- [ ] Federal tax return (last 3 years)\n- [ ] Financial statements\n- [ ] Payroll records (veteran owner paid > all non-veterans)\n\n## Tips\n\n- Processing takes 60-90 days\n- Recertify every 3 years\n- Keep veteran control documentation updated after any ownership change\n\n---\n\nQuestions? Run our `Quick Eligibility Check` in the app.',
        'cert', 5, false, true, now()
    )
on conflict (slug) do nothing;

insert into public.release_notes (title, summary, category, highlights, shipped_at, is_public)
values
    (
        '20% Veteran Discount, Verified via SAM.gov',
        'Verified SDVOSB and VOSB firms now get 20% off every paid plan — forever. We verify directly via the SAM Entity API, with a self-declare fallback for new VetCert holders.',
        'feature',
        array['SAM Entity API verification', 'Self-declaration fallback', 'Auto-applied at Stripe checkout', 'Strike-through pricing on the pricing page'],
        now() - interval '2 days',
        true
    ),
    (
        'Capture Briefs, Compliance Matrices, and Voice Briefs',
        'Three AI tools shipped together: a 2-page capture brief with PWin + bid/no-bid, a full Section L/M compliance matrix with XLSX export, and a hold-to-record voice brief you can listen to between meetings.',
        'feature',
        array['Auto-generated capture briefs', 'XLSX-exportable compliance matrices', 'Whisper + OpenAI TTS voice briefs', 'Cached per opportunity'],
        now() - interval '1 day',
        true
    ),
    (
        'Recompete Radar + Agency Forecast Watcher',
        'Two new scanners live daily: expiring contracts from USASpending scored 3-18 months ahead, and change-detection across the top federal agency forecast pages.',
        'feature',
        array['Confidence-scored recompete candidates', 'NAICS-matched forecast alerts', 'Daily scan cron'],
        now() - interval '12 hours',
        true
    ),
    (
        'MCP, Zapier, and Slack Integrations',
        'CapturePilot now plugs into Claude Desktop (via MCP), Zapier (7,000+ apps), and Slack (slash commands + OAuth install). Generate API tokens at /settings/integrations.',
        'integration',
        array['MCP server with 6 tools', 'Zapier Platform CLI app', 'Slack OAuth install + workspace-scoped commands', 'HMAC-signed outbound webhooks'],
        now() - interval '6 hours',
        true
    ),
    (
        'Tribal + SBA-Certified Partner Directory',
        'Our teaming partner search now includes ~800 curated tribal, 8(a), HUBZone, WOSB, and SDVOSB firms — with capability narratives, PoC contacts, and NAICS overlap scoring.',
        'feature',
        array['Curated directory', 'NAICS overlap matching', 'Save-to-shortlist', 'DSBS import tool for 300K-firm refresh'],
        now() - interval '3 hours',
        true
    )
on conflict do nothing;
