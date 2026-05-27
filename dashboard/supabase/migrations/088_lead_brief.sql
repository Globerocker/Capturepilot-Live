-- Lead Brief: AI-generated summary + call script Andre gets emailed for
-- every new marketing lead. See lib/lead-brief.ts for the pipeline.
--
-- One row in marketing_leads owns at most one brief; we overwrite if a
-- re-run produces fresher data (Apollo enrichment can lag the initial
-- insert by minutes).

alter table marketing_leads
    add column if not exists lead_brief jsonb,
    add column if not exists lead_brief_sent_at timestamptz,
    add column if not exists lead_brief_status text;

-- lead_brief_status mirrors worker_jobs.status for at-a-glance debugging
-- without a join. Values: 'pending' | 'running' | 'done' | 'failed'.

create index if not exists marketing_leads_brief_status_idx
    on marketing_leads (lead_brief_status)
    where lead_brief_status is not null;

comment on column marketing_leads.lead_brief is
    'AI-generated outreach briefing — company snapshot, SAM.gov status, top opportunity matches, fit score, suggested strategy, call script. Generated async by the enrich_lead_brief worker task.';
comment on column marketing_leads.lead_brief_sent_at is
    'When the brief email landed in americurial@gmail.com. Null = not sent.';
comment on column marketing_leads.lead_brief_status is
    'Latest pipeline status: pending / running / done / failed.';
