-- Sprint 22: Lead Magnet v2 — cert recommendations, easy wins, lead email capture

ALTER TABLE company_analyses
  ADD COLUMN IF NOT EXISTS cert_recommendations JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS easy_wins JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS lead_email TEXT;
