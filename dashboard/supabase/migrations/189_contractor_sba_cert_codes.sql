-- 189: normalized SAM set-aside cert codes on contractors, for the reverse-match
-- (government-buyer) set-aside HARD GATE.
--
-- sba_cert_codes is a normalized, GIN-indexed text[] derived ONLY from the
-- SAM-authoritative sba_certifications column (never the AI capability blob),
-- so an `&&` array-overlap pre-filter can exclude ineligible vendors in SQL.
-- The canonical per-row gate (contractorIsEligible) re-derives from the live
-- sba_certifications, so this column is a performance pre-filter, not the
-- authority. Codes: 8A · SDVOSB · VOSB · HUBZONE · WOSB · EDWOSB · TRIBAL_8A.
alter table contractors add column if not exists sba_cert_codes text[] not null default '{}';

create index if not exists idx_contractors_sba_cert_codes
  on contractors using gin (sba_cert_codes);

-- Reverse matching also narrows candidates by NAICS overlap; this GIN index was
-- missing and the array-overlap pre-filter needs it to stay fast over 80k rows.
create index if not exists idx_contractors_naics_codes_gin
  on contractors using gin (naics_codes);

comment on column contractors.sba_cert_codes is
  'Normalized SAM set-aside cert codes (8A/SDVOSB/VOSB/HUBZONE/WOSB/EDWOSB/TRIBAL_8A) derived ONLY from sba_certifications. Performance pre-filter for the reverse-match hard gate; the canonical gate re-derives from live sba_certifications. Backfilled by tools/50_backfill_sba_cert_codes.mjs.';
