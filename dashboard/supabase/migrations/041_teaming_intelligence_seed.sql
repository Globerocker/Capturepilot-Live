-- ============================================================
-- Migration 041: Seed SBLO contacts + FY2026 Q4 spend forecast
-- ============================================================
-- Static reference data small enough to check into source control.
-- The tribal_contractors table is seeded separately via
-- tools/24_ingest_tribal_contractors.mjs because the CSV is ~900 rows
-- and revises independently of the schema.
-- ============================================================

-- ---- Prime SBLO contacts ----
insert into public.prime_sblos (agency_scope, prime_company, sblo_name, sblo_email, sblo_phone, source) values
    ('DoD / Cyber',   'Booz Allen Hamilton',  'Ashley Burton',       'smallbusinesscompliance@bah.com', null,           'govcon_giants_dec_2025'),
    ('DoD / Cyber',   'Leidos',               'Rebecca Thompson',    'sbcomp@leidos.com',               null,           'govcon_giants_dec_2025'),
    ('DoD / Cyber',   'General Dynamics IT',  'Virginia Foley',      'smallbusiness@gdit.com',          '571-404-3094', 'govcon_giants_dec_2025'),
    ('Army',          'BAE Systems',          'Marianne Tenore',     'Marianne.Tenore@BAESYSTEMS.COM',  '603-885-8470', 'govcon_giants_dec_2025'),
    ('Army',          'BAE Systems',          'Amanda Bennett',      'Amanda.bennett@baesystems.com',   '603-885-4548', 'govcon_giants_dec_2025'),
    ('Air Force',     'General Electric',     'Bethani Clever',      'Bethani.Clever@ge.com',           '513-243-1719', 'govcon_giants_dec_2025'),
    ('Air Force',     'Honeywell',            'Melissa Audain',      'Melissa.Audain@honeywell.com',    null,           'govcon_giants_dec_2025'),
    ('MDA / Space',   'Lockheed Martin',      'Sefnee A. Manzanares','sefnee.a.manzanares@lmco.com',    '817-777-0997', 'govcon_giants_dec_2025'),
    ('MDA',           'Raytheon',             'Crystal L. King',     'crystal.l.king@rtx.com',          '571-250-3725', 'govcon_giants_dec_2025')
on conflict do nothing;

-- ---- FY2026 Q4 unobligated-balance forecast ----
insert into public.agency_spend_forecast
    (rank, agency_name, fiscal_year, fiscal_period, unobligated_balance_usd, hot_naics, hot_opportunities, why_now, source, published_at)
values
    (1,  'Department of Defense (overall)', 2026, 'Q4', 38000000000,
        array['541512','541330','561210'],
        'IT/cyber services, engineering, facilities',
        '$145.94B RDT&E authorized but only ~$143B outlaid YTD; December push to obligate before FY close.',
        'govcon_giants_dec_2025', '2025-12-01'),
    (2,  'Army Procurement',               2026, 'Q4', 10000000000,
        array['336992','336611','541330'],
        'Ground vehicles, weapons systems, logistics',
        '$169.17B total procurement authorized; $6B under outlay. December recompetes for FY26 prep.',
        'govcon_giants_dec_2025', '2025-12-01'),
    (3,  'Navy Shipbuilding',              2026, 'Q4',  8000000000,
        array['336611','541330'],
        'Maritime tech, ship repair, subsystems',
        '$167.85B procurement gap; year-end obligations to avoid $4B carryover.',
        'govcon_giants_dec_2025', '2025-12-01'),
    (4,  'Air Force RDT&E',                2026, 'Q4',  7000000000,
        array['541715','336411','541330'],
        'Aircraft upgrades, space systems, AI prototypes',
        '$143.77B RDT&E authorized but $2B unspent; December for tech prototypes.',
        'govcon_giants_dec_2025', '2025-12-01'),
    (5,  'Defense Logistics Agency',       2026, 'Q4',  5000000000,
        array['423990','488510','493110'],
        'Supply chain, MRO, energy products',
        '$305.24B O&M gap; December to stockpile before FY end. HUBZone set-asides prioritized.',
        'govcon_giants_dec_2025', '2025-12-01'),
    (6,  'Missile Defense Agency',         2026, 'Q4',  4000000000,
        array['336419','541330','541715'],
        'Missile tech, sensors, testing',
        'High funding / low outlay (~$1B gap); December for rapid prototyping via OTAs.',
        'govcon_giants_dec_2025', '2025-12-01'),
    (7,  'Cyber Command',                  2026, 'Q4',  3500000000,
        array['541512','541519','541511'],
        'Cybersecurity, zero trust, cloud migration',
        '$294.46B O&M authorized but $1.9B under; December surge for cyber threats.',
        'govcon_giants_dec_2025', '2025-12-01'),
    (8,  'DOE / Atomic Energy Defense',    2026, 'Q4',  2500000000,
        array['562910','541620'],
        'Nuclear cleanup, environmental services',
        'Multi-year remediation recompetes landing in December before FY close.',
        'govcon_giants_dec_2025', '2025-12-01'),
    (9,  'Space Force',                    2026, 'Q4',  2800000000,
        array['541715','517410'],
        'Satellite support, launch services, R&D',
        'New Vice Chief role accelerates obligations; nontraditional small-biz pilots.',
        'govcon_giants_dec_2025', '2025-12-01'),
    (10, 'Defense Health Program',         2026, 'Q4',  2000000000,
        array['541512','621111','339112'],
        'Medical IT, telehealth, equipment',
        'DHA IT modernization + end-of-year equipment refresh cycle.',
        'govcon_giants_dec_2025', '2025-12-01')
on conflict (agency_name, fiscal_year, fiscal_period) do update set
    rank                    = excluded.rank,
    unobligated_balance_usd = excluded.unobligated_balance_usd,
    hot_naics               = excluded.hot_naics,
    hot_opportunities       = excluded.hot_opportunities,
    why_now                 = excluded.why_now,
    source                  = excluded.source,
    published_at            = excluded.published_at,
    updated_at              = now();
