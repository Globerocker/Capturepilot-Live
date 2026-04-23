-- Seed reference data — idempotent
--
-- Run this after 01..04 on a fresh instance.
-- Safe to re-run: every INSERT uses ON CONFLICT DO NOTHING (or DO UPDATE for
-- forecast rows, since those evolve quarterly).
--
-- NOT seeded here (too big to check in):
--   * tribal_contractors         → tools/24_ingest_tribal_contractors.mjs  (~900 rows)
--   * naics_codes / psc_codes    → populated during ingestion
--   * opportunities / contractors / contacts → populated by SAM.gov ingest
--
-- Consolidated from migrations 022 (email_settings), 041 (teaming), 049 (academy/release_notes).

-- ============================================================
-- Email settings — runtime-configurable enabled/audience flags
-- ============================================================
INSERT INTO public.email_settings (key, enabled, audience, category, label, description) VALUES
    ('welcome',               true, ARRAY['self_service'],                'transactional', 'Welcome (Self-Service)',      'Sent when a new self-service user completes signup.'),
    ('consulting_welcome',    true, ARRAY['consulting'],                  'transactional', 'Welcome (Consulting)',        'Sent when admin onboards a consulting client with portal login.'),
    ('task_notification',     true, ARRAY['consulting'],                  'transactional', 'Task Assignment',             'Sent when a task is assigned to a consulting client.'),
    ('opportunity_alert',     true, ARRAY['all_users'],                   'transactional', 'Opportunity Alert',           'Daily email with top matching opportunities (max 1 per user per 24h).'),
    ('quick_checker',         true, ARRAY['lead'],                        'marketing',     'Quick Checker Results',       'Sent when a Quick Checker lead provides their email.'),
    ('trial_expiring_3d',     true, ARRAY['self_service'],                'transactional', 'Trial Expiring (3 days)',     'Sent 3 days before trial ends.'),
    ('trial_expiring_1d',     true, ARRAY['self_service'],                'transactional', 'Trial Expiring (Last day)',   'Final warning on last day of trial.'),
    ('payment_failed',        true, ARRAY['self_service'],                'transactional', 'Payment Failed',              'Sent when Stripe payment fails.'),
    ('subscription_canceled', true, ARRAY['self_service'],                'transactional', 'Subscription Canceled',       'Sent when subscription is canceled.'),
    ('beta_deadline_8d',      true, ARRAY['self_service'],                'marketing',     'Beta Deadline (8 days)',      'First beta deadline reminder with BETA25 promo.'),
    ('beta_deadline_1d',      true, ARRAY['self_service'],                'marketing',     'Beta Deadline (Last day)',    'Final beta deadline reminder.'),
    ('edu_contracting_101',   true, ARRAY['consulting'],                  'marketing',     'Learning: Federal Contracting 101', 'Intro guide to federal contracting.'),
    ('edu_naics_codes',       true, ARRAY['self_service'],                'marketing',     'Learning: NAICS Codes Explained',   'Explainer on NAICS codes and how to pick them.'),
    ('edu_set_asides',        true, ARRAY['all_users'],                   'marketing',     'Learning: Set-Aside Programs',      'Deep dive into set-aside programs.'),
    ('edu_capability_statement', true, ARRAY['consulting'],               'marketing',     'Learning: Capability Statement Guide', '6 essential sections of a winning capability statement.')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- Prime contractor Small Business Liaison Officers (SBLOs)
-- ============================================================
INSERT INTO public.prime_sblos (agency_scope, prime_company, sblo_name, sblo_email, sblo_phone, source) VALUES
    ('DoD / Cyber', 'Booz Allen Hamilton',   'Ashley Burton',        'smallbusinesscompliance@bah.com', NULL,           'govcon_giants_dec_2025'),
    ('DoD / Cyber', 'Leidos',                'Rebecca Thompson',     'sbcomp@leidos.com',               NULL,           'govcon_giants_dec_2025'),
    ('DoD / Cyber', 'General Dynamics IT',   'Virginia Foley',       'smallbusiness@gdit.com',          '571-404-3094', 'govcon_giants_dec_2025'),
    ('Army',        'BAE Systems',           'Marianne Tenore',      'Marianne.Tenore@BAESYSTEMS.COM',  '603-885-8470', 'govcon_giants_dec_2025'),
    ('Army',        'BAE Systems',           'Amanda Bennett',       'Amanda.bennett@baesystems.com',   '603-885-4548', 'govcon_giants_dec_2025'),
    ('Air Force',   'General Electric',      'Bethani Clever',       'Bethani.Clever@ge.com',           '513-243-1719', 'govcon_giants_dec_2025'),
    ('Air Force',   'Honeywell',             'Melissa Audain',       'Melissa.Audain@honeywell.com',    NULL,           'govcon_giants_dec_2025'),
    ('MDA / Space', 'Lockheed Martin',       'Sefnee A. Manzanares', 'sefnee.a.manzanares@lmco.com',    '817-777-0997', 'govcon_giants_dec_2025'),
    ('MDA',         'Raytheon',              'Crystal L. King',      'crystal.l.king@rtx.com',          '571-250-3725', 'govcon_giants_dec_2025')
ON CONFLICT DO NOTHING;

-- ============================================================
-- FY2026 Q4 agency unobligated-balance forecast
-- Upserts on (agency_name, fiscal_year, fiscal_period) — refresh quarterly.
-- ============================================================
INSERT INTO public.agency_spend_forecast
    (rank, agency_name, fiscal_year, fiscal_period, unobligated_balance_usd, hot_naics, hot_opportunities, why_now, source, published_at)
VALUES
    (1,  'Department of Defense (overall)', 2026, 'Q4', 38000000000, ARRAY['541512','541330','561210'], 'IT/cyber services, engineering, facilities',    '$145.94B RDT&E authorized but only ~$143B outlaid YTD; December push to obligate before FY close.', 'govcon_giants_dec_2025', '2025-12-01'),
    (2,  'Army Procurement',               2026, 'Q4', 10000000000, ARRAY['336992','336611','541330'], 'Ground vehicles, weapons systems, logistics',   '$169.17B total procurement authorized; $6B under outlay. December recompetes for FY26 prep.',       'govcon_giants_dec_2025', '2025-12-01'),
    (3,  'Navy Shipbuilding',              2026, 'Q4',  8000000000, ARRAY['336611','541330'],          'Maritime tech, ship repair, subsystems',        '$167.85B procurement gap; year-end obligations to avoid $4B carryover.',                            'govcon_giants_dec_2025', '2025-12-01'),
    (4,  'Air Force RDT&E',                2026, 'Q4',  7000000000, ARRAY['541715','336411','541330'], 'Aircraft upgrades, space systems, AI prototypes', '$143.77B RDT&E authorized but $2B unspent; December for tech prototypes.',                        'govcon_giants_dec_2025', '2025-12-01'),
    (5,  'Defense Logistics Agency',       2026, 'Q4',  5000000000, ARRAY['423990','488510','493110'], 'Supply chain, MRO, energy products',            '$305.24B O&M gap; December to stockpile before FY end. HUBZone set-asides prioritized.',            'govcon_giants_dec_2025', '2025-12-01'),
    (6,  'Missile Defense Agency',         2026, 'Q4',  4000000000, ARRAY['336419','541330','541715'], 'Missile tech, sensors, testing',                'High funding / low outlay (~$1B gap); December for rapid prototyping via OTAs.',                    'govcon_giants_dec_2025', '2025-12-01'),
    (7,  'Cyber Command',                  2026, 'Q4',  3500000000, ARRAY['541512','541519','541511'], 'Cybersecurity, zero trust, cloud migration',    '$294.46B O&M authorized but $1.9B under; December surge for cyber threats.',                         'govcon_giants_dec_2025', '2025-12-01'),
    (8,  'DOE / Atomic Energy Defense',    2026, 'Q4',  2500000000, ARRAY['562910','541620'],          'Nuclear cleanup, environmental services',       'Multi-year remediation recompetes landing in December before FY close.',                            'govcon_giants_dec_2025', '2025-12-01'),
    (9,  'Space Force',                    2026, 'Q4',  2800000000, ARRAY['541715','517410'],          'Satellite support, launch services, R&D',       'New Vice Chief role accelerates obligations; nontraditional small-biz pilots.',                      'govcon_giants_dec_2025', '2025-12-01'),
    (10, 'Defense Health Program',         2026, 'Q4',  2000000000, ARRAY['541512','621111','339112'], 'Medical IT, telehealth, equipment',             'DHA IT modernization + end-of-year equipment refresh cycle.',                                       'govcon_giants_dec_2025', '2025-12-01')
ON CONFLICT (agency_name, fiscal_year, fiscal_period) DO UPDATE SET
    rank                    = EXCLUDED.rank,
    unobligated_balance_usd = EXCLUDED.unobligated_balance_usd,
    hot_naics               = EXCLUDED.hot_naics,
    hot_opportunities       = EXCLUDED.hot_opportunities,
    why_now                 = EXCLUDED.why_now,
    source                  = EXCLUDED.source,
    published_at            = EXCLUDED.published_at,
    updated_at              = NOW();

-- ============================================================
-- Academy articles (learning library, lead magnets)
-- ============================================================
INSERT INTO public.academy_articles (slug, title, excerpt, body_md, category, reading_minutes, featured, teaser_public, published_at)
VALUES
    (
        'sdvosb-first-90-days',
        'Your First 90 Days as an SDVOSB',
        'A week-by-week playbook for veteran-owned firms getting their first federal contract — what to do in weeks 1-4, 5-8, and 9-12.',
        E'# Your First 90 Days as an SDVOSB\n\nRegistered your UEI. Signed up for CapturePilot. Now what?\n\nThis playbook was written by our capture team — every step is something we coach our managed clients through.\n\n## Weeks 1-4: Foundation\n\n- Confirm VetCert status via SAM.gov\n- Build your capability statement (use our AI drafter)\n- Pick your 3 primary NAICS codes\n- Register with the VA OSDBU\n- Attend one veteran matchmaking event\n\n## Weeks 5-8: First Pursuits\n\n- Set up HOT match alerts on SDVOSB set-asides\n- Respond to your first Sources Sought\n- Reach out to 5 prime contractors as a subcontractor\n- Join a GSA Schedule if annual revenue >$500K\n\n## Weeks 9-12: First Bid\n\n- Identify one winnable < $250K SAP opportunity\n- Use our Capture Brief to assess PWin\n- Draft with the AI Proposal Writer\n- Submit and iterate\n\n---\n\nRun out of runway? Book a 20-minute vet-to-vet call with Andre at americurial.com.',
        'playbook', 6, true, true, NOW()
    ),
    (
        'recompete-radar-how-to',
        'How to Use Recompete Radar',
        'Recompete Radar flags contracts expiring in the next 3-18 months. Here''s how to convert those leads into wins before the RFP drops.',
        E'# Using Recompete Radar\n\n**Goal**: Identify the incumbent on an expiring contract, then position yourself 6-12 months before the recompete RFP drops.\n\n## Step 1: Filter to high-confidence candidates\n\nUse the confidence filter in `/recompetes`. High-confidence = 70%+ likely to recompete based on agency history + contract end date + competition pattern.\n\n## Step 2: Build the capture case\n\nFor each candidate:\n1. Research the incumbent''s past performance\n2. Identify 2-3 incumbent weaknesses\n3. Map your strengths to those gaps\n\n## Step 3: Engage the contracting officer early\n\nSend a capability statement. Request an industry day. Ask to be added to the Sources Sought distribution.\n\n## Step 4: Generate a Capture Brief\n\nFrom the opportunity detail page, click **Generate Brief**. Review the win themes.\n\n## Step 5: Monitor for the RFP\n\nSubscribe to `recompete.high_confidence` webhooks or Slack alerts — we fire the moment the solicitation drops.',
        'playbook', 4, true, true, NOW()
    ),
    (
        'vetcert-2026-checklist',
        'VetCert 2026: The Definitive Checklist',
        'The SBA merged CVE and Vets First into one VetCert program. Here''s the complete 14-point readiness checklist — exactly what you need before filing.',
        E'# VetCert 2026 Readiness Checklist\n\n**Who this is for**: Veteran-owned firms preparing to apply for SDVOSB or VOSB certification through the SBA''s new VetCert portal (which replaced CVE + Vets First in 2023).\n\n## Entity Documents\n\n- [ ] SAM.gov active registration with UEI\n- [ ] Articles of incorporation / LLC operating agreement\n- [ ] All ownership documents (51%+ veteran ownership)\n- [ ] DD-214 for all veteran owners\n- [ ] VA disability rating letter (SDVOSB only)\n\n## Control Documents\n\n- [ ] Bylaws showing veteran control\n- [ ] Signature authority on bank account(s)\n- [ ] Board resolutions / meeting minutes\n- [ ] Executive compensation records\n\n## Operational Documents\n\n- [ ] Business license + state registration\n- [ ] Federal tax return (last 3 years)\n- [ ] Financial statements\n- [ ] Payroll records (veteran owner paid > all non-veterans)\n\n## Tips\n\n- Processing takes 60-90 days\n- Recertify every 3 years\n- Keep veteran control documentation updated after any ownership change\n\n---\n\nQuestions? Run our `Quick Eligibility Check` in the app.',
        'cert', 5, false, true, NOW()
    )
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- Release notes (public changelog)
-- ============================================================
INSERT INTO public.release_notes (title, summary, category, highlights, shipped_at, is_public)
VALUES
    (
        '20% Veteran Discount, Verified via SAM.gov',
        'Verified SDVOSB and VOSB firms now get 20% off every paid plan — forever. We verify directly via the SAM Entity API, with a self-declare fallback for new VetCert holders.',
        'feature',
        ARRAY['SAM Entity API verification', 'Self-declaration fallback', 'Auto-applied at Stripe checkout', 'Strike-through pricing on the pricing page'],
        NOW() - INTERVAL '2 days',
        true
    ),
    (
        'Capture Briefs, Compliance Matrices, and Voice Briefs',
        'Three AI tools shipped together: a 2-page capture brief with PWin + bid/no-bid, a full Section L/M compliance matrix with XLSX export, and a hold-to-record voice brief you can listen to between meetings.',
        'feature',
        ARRAY['Auto-generated capture briefs', 'XLSX-exportable compliance matrices', 'Whisper + OpenAI TTS voice briefs', 'Cached per opportunity'],
        NOW() - INTERVAL '1 day',
        true
    ),
    (
        'Recompete Radar + Agency Forecast Watcher',
        'Two new scanners live daily: expiring contracts from USASpending scored 3-18 months ahead, and change-detection across the top federal agency forecast pages.',
        'feature',
        ARRAY['Confidence-scored recompete candidates', 'NAICS-matched forecast alerts', 'Daily scan cron'],
        NOW() - INTERVAL '12 hours',
        true
    ),
    (
        'MCP, Zapier, and Slack Integrations',
        'CapturePilot now plugs into Claude Desktop (via MCP), Zapier (7,000+ apps), and Slack (slash commands + OAuth install). Generate API tokens at /settings/integrations.',
        'integration',
        ARRAY['MCP server with 6 tools', 'Zapier Platform CLI app', 'Slack OAuth install + workspace-scoped commands', 'HMAC-signed outbound webhooks'],
        NOW() - INTERVAL '6 hours',
        true
    ),
    (
        'Tribal + SBA-Certified Partner Directory',
        'Our teaming partner search now includes ~800 curated tribal, 8(a), HUBZone, WOSB, and SDVOSB firms — with capability narratives, PoC contacts, and NAICS overlap scoring.',
        'feature',
        ARRAY['Curated directory', 'NAICS overlap matching', 'Save-to-shortlist', 'DSBS import tool for 300K-firm refresh'],
        NOW() - INTERVAL '3 hours',
        true
    )
ON CONFLICT DO NOTHING;
