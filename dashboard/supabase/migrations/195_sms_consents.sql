-- 195_sms_consents.sql
-- Applied to prod via Supabase Management API on 2026-07-02; this file is the record.
--
-- Consent registry for outbound SMS, keyed by phone (E.164). The cockpit
-- /api/admin/cockpit/send-sms route HARD-gates on this: no text goes to a
-- number without a recorded, non-revoked consent. Consent is captured only
-- where a lead gives us their number with intent (onboarding checkbox, future
-- opt-in forms), never from scraped SAM/crawl numbers. Consent follows the
-- phone, which is what TCPA + carriers care about.
CREATE TABLE IF NOT EXISTS public.sms_consents (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    phone         text NOT NULL UNIQUE,        -- E.164, e.g. +16025551234
    consented     boolean NOT NULL DEFAULT true,
    source        text,                        -- 'onboarding' | 'signup' | 'readiness_check' | 'manual' | 'reply'
    email         text,
    company       text,
    consented_at  timestamptz NOT NULL DEFAULT now(),
    revoked_at    timestamptz,                 -- set when they reply STOP / opt out
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sms_consents_phone_idx ON public.sms_consents(phone);

ALTER TABLE public.sms_consents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sms_consents FROM anon, authenticated;
-- service_role bypasses RLS; server routes (admin-gated / requireUser) read+write it.

COMMENT ON TABLE public.sms_consents IS
    'Outbound-SMS consent registry keyed by E.164 phone. cockpit/send-sms hard-gates on a non-revoked row here.';
