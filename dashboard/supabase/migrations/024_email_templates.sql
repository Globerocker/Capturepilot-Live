-- Email templates — admin-editable custom HTML per template.
-- When a row exists for a template_key, the send logic uses the custom HTML
-- with merge tag substitution. Otherwise falls back to the code template.

CREATE TABLE IF NOT EXISTS email_templates (
    template_key TEXT PRIMARY KEY,
    -- Unlayer design JSON (used to re-load the editor)
    design_json JSONB,
    -- Exported HTML from Unlayer (with {{merge_tags}} for variable substitution)
    html TEXT,
    -- Subject line (also supports merge tags)
    subject TEXT,
    -- Who last edited
    updated_by UUID REFERENCES auth.users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Published flag: only published templates are used in production sends
    published BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_email_templates_published
    ON email_templates (template_key)
    WHERE published = true;

-- RLS: admin-only
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read email_templates"
    ON email_templates FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.account_type = 'admin'
        )
    );

CREATE POLICY "Admins can insert email_templates"
    ON email_templates FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.account_type = 'admin'
        )
    );

CREATE POLICY "Admins can update email_templates"
    ON email_templates FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.account_type = 'admin'
        )
    );
