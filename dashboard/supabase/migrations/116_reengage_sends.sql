-- Idempotency + audit trail for the scripts/reengage-backlog.ts re-engagement
-- emails. One row per (cohort, email) when we ship the one-off email so the
-- script can skip recipients we've already touched.
CREATE TABLE IF NOT EXISTS reengage_sends (
    id            BIGSERIAL PRIMARY KEY,
    cohort        TEXT NOT NULL CHECK (cohort IN ('biz_fb', 'freemail_fb', 'qc')),
    template_key  TEXT NOT NULL,
    email         TEXT NOT NULL,
    source_table  TEXT NOT NULL,
    source_id     TEXT NOT NULL,
    resend_id     TEXT,
    status        TEXT NOT NULL CHECK (status IN ('sent', 'delivered', 'bounced', 'complained', 'failed', 'unknown')),
    error_message TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reengage_sends_cohort_email ON reengage_sends (cohort, email);
CREATE INDEX IF NOT EXISTS idx_reengage_sends_created_at   ON reengage_sends (created_at DESC);
