-- Update company_analyses status check constraint to include new statuses
-- from the 2-stage NAICS selection workflow

ALTER TABLE company_analyses DROP CONSTRAINT IF EXISTS company_analyses_status_check;

ALTER TABLE company_analyses ADD CONSTRAINT company_analyses_status_check
  CHECK (status IN (
    'crawling',
    'enriching',
    'classifying',
    'awaiting_naics_selection',
    'finding_opportunities',
    'scoring',
    'finding_competitors',
    'generating',
    'complete',
    'error'
  ));
