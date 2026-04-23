-- Admin & integrations — email, webhooks, outreach, academy
-- Admin-facing + third-party integrations
-- Generated from live_schema.sql (pg_dump v17.6) on 2026-04-22
-- DO NOT EDIT directly: regenerate via tools/28_split_schema_bootstrap.mjs if schema changes.

--
-- Name: academy_articles; Type: TABLE; Schema: public
--

--

CREATE TABLE public.academy_articles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    excerpt text,
    body_md text NOT NULL,
    category text DEFAULT 'playbook'::text NOT NULL,
    reading_minutes integer,
    featured boolean DEFAULT false NOT NULL,
    teaser_public boolean DEFAULT true NOT NULL,
    cover_image_url text,
    author_name text DEFAULT 'CapturePilot Team'::text,
    published_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
--
-- Name: admin_opportunity_pushes; Type: TABLE; Schema: public
--

--

CREATE TABLE public.admin_opportunity_pushes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_profile_id uuid NOT NULL,
    opportunity_id uuid NOT NULL,
    pursuit_id uuid,
    pushed_by_user_id uuid,
    pushed_by_name text DEFAULT 'Americurial Team'::text,
    notes text,
    customer_message text,
    email_sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
--
-- Name: api_tokens; Type: TABLE; Schema: public
--

--

CREATE TABLE public.api_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_profile_id uuid NOT NULL,
    token_prefix text NOT NULL,
    token_hash text NOT NULL,
    kind text NOT NULL,
    label text,
    last_used_at timestamp with time zone,
    expires_at timestamp with time zone,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT api_tokens_kind_check CHECK ((kind = ANY (ARRAY['mcp'::text, 'zapier'::text, 'api'::text])))
);


--
--
-- Name: beta_invites; Type: TABLE; Schema: public
--

--

CREATE TABLE public.beta_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    recipient_name text,
    company_name text,
    personal_note text,
    token text NOT NULL,
    sent_by uuid,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    claimed_at timestamp with time zone,
    claimed_by uuid,
    expires_at timestamp with time zone DEFAULT (now() + '30 days'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
--
-- Name: TABLE beta_invites; Type: COMMENT; Schema: public
--

--

COMMENT ON TABLE public.beta_invites IS 'Manual beta invitations sent by admins. Token-based signup prefill.';


--
--
-- Name: email_settings; Type: TABLE; Schema: public
--

--

CREATE TABLE public.email_settings (
    key text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    audience text[] DEFAULT '{}'::text[] NOT NULL,
    category text DEFAULT 'transactional'::text NOT NULL,
    label text,
    description text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_settings_category_check CHECK ((category = ANY (ARRAY['transactional'::text, 'marketing'::text])))
);


--
--
-- Name: email_templates; Type: TABLE; Schema: public
--

--

CREATE TABLE public.email_templates (
    template_key text NOT NULL,
    design_json jsonb,
    html text,
    subject text,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    published boolean DEFAULT false NOT NULL
);


--
--
-- Name: outreach_optouts; Type: TABLE; Schema: public
--

--

CREATE TABLE public.outreach_optouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    reason text,
    opted_out_at timestamp with time zone DEFAULT now() NOT NULL
);


--
--
-- Name: TABLE outreach_optouts; Type: COMMENT; Schema: public
--

--

COMMENT ON TABLE public.outreach_optouts IS 'Global opt-out list. Any email here is excluded from all future outreach sends.';


--
--
-- Name: outreach_prospects; Type: TABLE; Schema: public
--

--

CREATE TABLE public.outreach_prospects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    uei text,
    cage_code text,
    company_name text NOT NULL,
    website text,
    state text,
    city text,
    naics_codes text[] DEFAULT '{}'::text[] NOT NULL,
    certifications text[] DEFAULT '{}'::text[] NOT NULL,
    registration_date date,
    primary_email text,
    primary_name text,
    primary_title text,
    primary_phone text,
    enriched_at timestamp with time zone,
    source text DEFAULT 'sam_new_registration'::text NOT NULL,
    status text DEFAULT 'pending_review'::text NOT NULL,
    match_score integer DEFAULT 0,
    rejection_reason text,
    notes text,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    discovered_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    contractor_id uuid,
    unsubscribe_token text DEFAULT md5(((random())::text || (clock_timestamp())::text)) NOT NULL,
    CONSTRAINT outreach_prospects_source_check CHECK ((source = ANY (ARRAY['sam_new_registration'::text, 'sam_naics_match'::text, 'manual'::text, 'import'::text]))),
    CONSTRAINT outreach_prospects_status_check CHECK ((status = ANY (ARRAY['pending_review'::text, 'approved'::text, 'rejected'::text, 'queued'::text, 'sent'::text, 'replied'::text, 'bounced'::text, 'opted_out'::text])))
);


--
--
-- Name: TABLE outreach_prospects; Type: COMMENT; Schema: public
--

--

COMMENT ON TABLE public.outreach_prospects IS 'Cold-outreach pipeline. Discovered by /api/cron/discover_new_prospects, reviewed by admin, enriched, sent through drip.';


--
--
-- Name: COLUMN outreach_prospects.unsubscribe_token; Type: COMMENT; Schema: public
--

--

COMMENT ON COLUMN public.outreach_prospects.unsubscribe_token IS 'Per-prospect token embedded in the List-Unsubscribe header + footer link. Token-only lookup at /api/outreach/unsubscribe so unsub works without login.';


--
--
-- Name: outreach_sequence_state; Type: TABLE; Schema: public
--

--

CREATE TABLE public.outreach_sequence_state (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    prospect_id uuid NOT NULL,
    step_index integer NOT NULL,
    template_key text NOT NULL,
    status text DEFAULT 'scheduled'::text NOT NULL,
    scheduled_for timestamp with time zone,
    sent_at timestamp with time zone,
    opened_at timestamp with time zone,
    clicked_at timestamp with time zone,
    bounced_at timestamp with time zone,
    replied_at timestamp with time zone,
    error_msg text,
    resend_message_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT outreach_sequence_state_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'sent'::text, 'opened'::text, 'clicked'::text, 'replied'::text, 'bounced'::text, 'skipped'::text, 'failed'::text])))
);


--
--
-- Name: TABLE outreach_sequence_state; Type: COMMENT; Schema: public
--

--

COMMENT ON TABLE public.outreach_sequence_state IS '3-step cold-outreach drip tracking. step_index 0=intro, 1=followup (+3d), 2=final (+7d). The send cron flips scheduled → sent; webhooks from Resend update opened/clicked/replied/bounced.';


--
--
-- Name: release_notes; Type: TABLE; Schema: public
--

--

CREATE TABLE public.release_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    version text,
    title text NOT NULL,
    summary text NOT NULL,
    category text DEFAULT 'feature'::text NOT NULL,
    highlights text[] DEFAULT '{}'::text[],
    shipped_at timestamp with time zone DEFAULT now() NOT NULL,
    is_public boolean DEFAULT true NOT NULL,
    commit_sha text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
--
-- Name: scheduled_emails; Type: TABLE; Schema: public
--

--

CREATE TABLE public.scheduled_emails (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_profile_id uuid,
    email_address text NOT NULL,
    contact_name text,
    template_key text NOT NULL,
    sequence_key text,
    scheduled_for timestamp with time zone NOT NULL,
    sent_at timestamp with time zone,
    status text DEFAULT 'pending'::text NOT NULL,
    failure_reason text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT scheduled_emails_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text, 'canceled'::text])))
);


--
--
-- Name: slack_installations; Type: TABLE; Schema: public
--

--

CREATE TABLE public.slack_installations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id text NOT NULL,
    team_name text,
    enterprise_id text,
    enterprise_name text,
    bot_user_id text,
    bot_token text,
    user_id text,
    installer_email text,
    scopes text[] DEFAULT '{}'::text[],
    user_profile_id uuid,
    app_id text,
    installed_at timestamp with time zone DEFAULT now() NOT NULL,
    uninstalled_at timestamp with time zone,
    last_used_at timestamp with time zone,
    raw_response jsonb
);


--
--
-- Name: veteran_verifications; Type: TABLE; Schema: public
--

--

CREATE TABLE public.veteran_verifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_profile_id uuid NOT NULL,
    source text NOT NULL,
    cert_type text,
    uei text,
    sam_certifications text[],
    raw_response jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT veteran_verifications_source_check CHECK ((source = ANY (ARRAY['sam_entity'::text, 'self_declared'::text, 'admin'::text])))
);


--
--
-- Name: webhook_deliveries; Type: TABLE; Schema: public
--

--

CREATE TABLE public.webhook_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    webhook_id uuid NOT NULL,
    event text NOT NULL,
    payload jsonb NOT NULL,
    status_code integer,
    response_text text,
    error_message text,
    attempt integer DEFAULT 1 NOT NULL,
    delivered_at timestamp with time zone DEFAULT now() NOT NULL
);


--
--
-- Name: webhook_endpoints; Type: TABLE; Schema: public
--

--

CREATE TABLE public.webhook_endpoints (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_profile_id uuid NOT NULL,
    url text NOT NULL,
    events text[] DEFAULT '{}'::text[] NOT NULL,
    secret text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
--
-- Name: academy_articles academy_articles_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.academy_articles
    ADD CONSTRAINT academy_articles_pkey PRIMARY KEY (id);


--
--
-- Name: academy_articles academy_articles_slug_key; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.academy_articles
    ADD CONSTRAINT academy_articles_slug_key UNIQUE (slug);


--
--
-- Name: admin_opportunity_pushes admin_opportunity_pushes_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.admin_opportunity_pushes
    ADD CONSTRAINT admin_opportunity_pushes_pkey PRIMARY KEY (id);


--
--
-- Name: api_tokens api_tokens_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.api_tokens
    ADD CONSTRAINT api_tokens_pkey PRIMARY KEY (id);


--
--
-- Name: api_tokens api_tokens_token_hash_key; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.api_tokens
    ADD CONSTRAINT api_tokens_token_hash_key UNIQUE (token_hash);


--
--
-- Name: beta_invites beta_invites_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.beta_invites
    ADD CONSTRAINT beta_invites_pkey PRIMARY KEY (id);


--
--
-- Name: beta_invites beta_invites_token_key; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.beta_invites
    ADD CONSTRAINT beta_invites_token_key UNIQUE (token);


--
--
-- Name: email_settings email_settings_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.email_settings
    ADD CONSTRAINT email_settings_pkey PRIMARY KEY (key);


--
--
-- Name: email_templates email_templates_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_pkey PRIMARY KEY (template_key);


--
--
-- Name: outreach_optouts outreach_optouts_email_key; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.outreach_optouts
    ADD CONSTRAINT outreach_optouts_email_key UNIQUE (email);


--
--
-- Name: outreach_optouts outreach_optouts_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.outreach_optouts
    ADD CONSTRAINT outreach_optouts_pkey PRIMARY KEY (id);


--
--
-- Name: outreach_prospects outreach_prospects_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.outreach_prospects
    ADD CONSTRAINT outreach_prospects_pkey PRIMARY KEY (id);


--
--
-- Name: outreach_prospects outreach_prospects_unsubscribe_token_key; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.outreach_prospects
    ADD CONSTRAINT outreach_prospects_unsubscribe_token_key UNIQUE (unsubscribe_token);


--
--
-- Name: outreach_sequence_state outreach_sequence_state_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.outreach_sequence_state
    ADD CONSTRAINT outreach_sequence_state_pkey PRIMARY KEY (id);


--
--
-- Name: release_notes release_notes_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.release_notes
    ADD CONSTRAINT release_notes_pkey PRIMARY KEY (id);


--
--
-- Name: scheduled_emails scheduled_emails_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.scheduled_emails
    ADD CONSTRAINT scheduled_emails_pkey PRIMARY KEY (id);


--
--
-- Name: slack_installations slack_installations_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.slack_installations
    ADD CONSTRAINT slack_installations_pkey PRIMARY KEY (id);


--
--
-- Name: slack_installations slack_installations_team_id_key; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.slack_installations
    ADD CONSTRAINT slack_installations_team_id_key UNIQUE (team_id);


--
--
-- Name: veteran_verifications veteran_verifications_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.veteran_verifications
    ADD CONSTRAINT veteran_verifications_pkey PRIMARY KEY (id);


--
--
-- Name: webhook_deliveries webhook_deliveries_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.webhook_deliveries
    ADD CONSTRAINT webhook_deliveries_pkey PRIMARY KEY (id);


--
--
-- Name: webhook_endpoints webhook_endpoints_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.webhook_endpoints
    ADD CONSTRAINT webhook_endpoints_pkey PRIMARY KEY (id);


--
--
-- Name: idx_academy_category; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_academy_category ON public.academy_articles USING btree (category);


--
--
-- Name: idx_academy_published; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_academy_published ON public.academy_articles USING btree (published_at DESC) WHERE (published_at IS NOT NULL);


--
--
-- Name: idx_admin_pushes_user; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_admin_pushes_user ON public.admin_opportunity_pushes USING btree (user_profile_id, created_at DESC);


--
--
-- Name: idx_api_tokens_user; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_api_tokens_user ON public.api_tokens USING btree (user_profile_id) WHERE (revoked_at IS NULL);


--
--
-- Name: idx_beta_invites_email; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_beta_invites_email ON public.beta_invites USING btree (lower(email));


--
--
-- Name: idx_beta_invites_sent_at; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_beta_invites_sent_at ON public.beta_invites USING btree (sent_at DESC);


--
--
-- Name: idx_beta_invites_token; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_beta_invites_token ON public.beta_invites USING btree (token);


--
--
-- Name: idx_email_settings_enabled; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_email_settings_enabled ON public.email_settings USING btree (enabled);


--
--
-- Name: idx_email_templates_published; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_email_templates_published ON public.email_templates USING btree (template_key) WHERE (published = true);


--
--
-- Name: idx_outreach_optouts_email; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_outreach_optouts_email ON public.outreach_optouts USING btree (lower(email));


--
--
-- Name: idx_outreach_prospects_discovered; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_outreach_prospects_discovered ON public.outreach_prospects USING btree (discovered_at DESC);


--
--
-- Name: idx_outreach_prospects_naics; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_outreach_prospects_naics ON public.outreach_prospects USING gin (naics_codes);


--
--
-- Name: idx_outreach_prospects_status; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_outreach_prospects_status ON public.outreach_prospects USING btree (status);


--
--
-- Name: idx_outreach_sequence_prospect; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_outreach_sequence_prospect ON public.outreach_sequence_state USING btree (prospect_id);


--
--
-- Name: idx_outreach_sequence_status_scheduled; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_outreach_sequence_status_scheduled ON public.outreach_sequence_state USING btree (status, scheduled_for) WHERE (status = 'scheduled'::text);


--
--
-- Name: idx_release_notes_public; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_release_notes_public ON public.release_notes USING btree (shipped_at DESC) WHERE (is_public = true);


--
--
-- Name: idx_release_notes_shipped; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_release_notes_shipped ON public.release_notes USING btree (shipped_at DESC);


--
--
-- Name: idx_scheduled_emails_due; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_scheduled_emails_due ON public.scheduled_emails USING btree (scheduled_for) WHERE ((sent_at IS NULL) AND (status = 'pending'::text));


--
--
-- Name: idx_scheduled_emails_sequence; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_scheduled_emails_sequence ON public.scheduled_emails USING btree (sequence_key, user_profile_id);


--
--
-- Name: idx_scheduled_emails_user; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_scheduled_emails_user ON public.scheduled_emails USING btree (user_profile_id);


--
--
-- Name: idx_slack_team_active; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_slack_team_active ON public.slack_installations USING btree (team_id) WHERE (uninstalled_at IS NULL);


--
--
-- Name: idx_slack_user_profile; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_slack_user_profile ON public.slack_installations USING btree (user_profile_id);


--
--
-- Name: idx_veteran_verifications_user; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_veteran_verifications_user ON public.veteran_verifications USING btree (user_profile_id, created_at DESC);


--
--
-- Name: idx_webhook_deliveries_wid; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_webhook_deliveries_wid ON public.webhook_deliveries USING btree (webhook_id, delivered_at DESC);


--
--
-- Name: idx_webhook_user_active; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_webhook_user_active ON public.webhook_endpoints USING btree (user_profile_id) WHERE (active = true);


--
--
-- Name: uq_outreach_prospects_uei; Type: INDEX; Schema: public
--

--

CREATE UNIQUE INDEX uq_outreach_prospects_uei ON public.outreach_prospects USING btree (uei) WHERE (uei IS NOT NULL);


--
--
-- Name: uq_outreach_sequence_prospect_step; Type: INDEX; Schema: public
--

--

CREATE UNIQUE INDEX uq_outreach_sequence_prospect_step ON public.outreach_sequence_state USING btree (prospect_id, step_index);


--
--
-- Name: uq_release_notes_commit_sha; Type: INDEX; Schema: public
--

--

CREATE UNIQUE INDEX uq_release_notes_commit_sha ON public.release_notes USING btree (commit_sha) WHERE (commit_sha IS NOT NULL);


--
--
-- Name: admin_opportunity_pushes admin_opportunity_pushes_pushed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.admin_opportunity_pushes
    ADD CONSTRAINT admin_opportunity_pushes_pushed_by_user_id_fkey FOREIGN KEY (pushed_by_user_id) REFERENCES auth.users(id);


--
--
-- Name: admin_opportunity_pushes admin_opportunity_pushes_user_profile_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.admin_opportunity_pushes
    ADD CONSTRAINT admin_opportunity_pushes_user_profile_id_fkey FOREIGN KEY (user_profile_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;


--
--
-- Name: api_tokens api_tokens_user_profile_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.api_tokens
    ADD CONSTRAINT api_tokens_user_profile_id_fkey FOREIGN KEY (user_profile_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;


--
--
-- Name: beta_invites beta_invites_claimed_by_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.beta_invites
    ADD CONSTRAINT beta_invites_claimed_by_fkey FOREIGN KEY (claimed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
--
-- Name: beta_invites beta_invites_sent_by_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.beta_invites
    ADD CONSTRAINT beta_invites_sent_by_fkey FOREIGN KEY (sent_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
--
-- Name: email_templates email_templates_updated_by_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
--
-- Name: outreach_prospects outreach_prospects_contractor_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.outreach_prospects
    ADD CONSTRAINT outreach_prospects_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.contractors(id) ON DELETE SET NULL;


--
--
-- Name: outreach_prospects outreach_prospects_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.outreach_prospects
    ADD CONSTRAINT outreach_prospects_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);


--
--
-- Name: outreach_sequence_state outreach_sequence_state_prospect_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.outreach_sequence_state
    ADD CONSTRAINT outreach_sequence_state_prospect_id_fkey FOREIGN KEY (prospect_id) REFERENCES public.outreach_prospects(id) ON DELETE CASCADE;


--
--
-- Name: scheduled_emails scheduled_emails_user_profile_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.scheduled_emails
    ADD CONSTRAINT scheduled_emails_user_profile_id_fkey FOREIGN KEY (user_profile_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;


--
--
-- Name: slack_installations slack_installations_user_profile_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.slack_installations
    ADD CONSTRAINT slack_installations_user_profile_id_fkey FOREIGN KEY (user_profile_id) REFERENCES public.user_profiles(id) ON DELETE SET NULL;


--
--
-- Name: veteran_verifications veteran_verifications_user_profile_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.veteran_verifications
    ADD CONSTRAINT veteran_verifications_user_profile_id_fkey FOREIGN KEY (user_profile_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;


--
--
-- Name: webhook_deliveries webhook_deliveries_webhook_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.webhook_deliveries
    ADD CONSTRAINT webhook_deliveries_webhook_id_fkey FOREIGN KEY (webhook_id) REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE;


--
--
-- Name: webhook_endpoints webhook_endpoints_user_profile_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.webhook_endpoints
    ADD CONSTRAINT webhook_endpoints_user_profile_id_fkey FOREIGN KEY (user_profile_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;


--
--
-- Name: email_settings Admins can insert email_settings; Type: POLICY; Schema: public
--

--

CREATE POLICY "Admins can insert email_settings" ON public.email_settings FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.account_type = 'admin'::text)))));


--
--
-- Name: email_templates Admins can insert email_templates; Type: POLICY; Schema: public
--

--

CREATE POLICY "Admins can insert email_templates" ON public.email_templates FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.account_type = 'admin'::text)))));


--
--
-- Name: email_settings Admins can read email_settings; Type: POLICY; Schema: public
--

--

CREATE POLICY "Admins can read email_settings" ON public.email_settings FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.account_type = 'admin'::text)))));


--
--
-- Name: email_templates Admins can read email_templates; Type: POLICY; Schema: public
--

--

CREATE POLICY "Admins can read email_templates" ON public.email_templates FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.account_type = 'admin'::text)))));


--
--
-- Name: scheduled_emails Admins can read scheduled_emails; Type: POLICY; Schema: public
--

--

CREATE POLICY "Admins can read scheduled_emails" ON public.scheduled_emails FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.account_type = 'admin'::text)))));


--
--
-- Name: email_settings Admins can update email_settings; Type: POLICY; Schema: public
--

--

CREATE POLICY "Admins can update email_settings" ON public.email_settings FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.account_type = 'admin'::text)))));


--
--
-- Name: email_templates Admins can update email_templates; Type: POLICY; Schema: public
--

--

CREATE POLICY "Admins can update email_templates" ON public.email_templates FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.account_type = 'admin'::text)))));


--
--
-- Name: academy_articles; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.academy_articles ENABLE ROW LEVEL SECURITY;

--
--
-- Name: academy_articles academy_read_auth; Type: POLICY; Schema: public
--

--

CREATE POLICY academy_read_auth ON public.academy_articles FOR SELECT USING ((auth.uid() IS NOT NULL));


--
--
-- Name: admin_opportunity_pushes; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.admin_opportunity_pushes ENABLE ROW LEVEL SECURITY;

--
--
-- Name: api_tokens; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.api_tokens ENABLE ROW LEVEL SECURITY;

--
--
-- Name: api_tokens api_tokens_owner; Type: POLICY; Schema: public
--

--

CREATE POLICY api_tokens_owner ON public.api_tokens USING ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: beta_invites; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.beta_invites ENABLE ROW LEVEL SECURITY;

--
--
-- Name: email_settings; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.email_settings ENABLE ROW LEVEL SECURITY;

--
--
-- Name: email_templates; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

--
--
-- Name: outreach_optouts; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.outreach_optouts ENABLE ROW LEVEL SECURITY;

--
--
-- Name: outreach_optouts outreach_optouts admin all; Type: POLICY; Schema: public
--

--

CREATE POLICY "outreach_optouts admin all" ON public.outreach_optouts TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_profiles
  WHERE ((user_profiles.auth_user_id = auth.uid()) AND (user_profiles.account_type = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_profiles
  WHERE ((user_profiles.auth_user_id = auth.uid()) AND (user_profiles.account_type = 'admin'::text)))));


--
--
-- Name: outreach_prospects; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.outreach_prospects ENABLE ROW LEVEL SECURITY;

--
--
-- Name: outreach_prospects outreach_prospects admin all; Type: POLICY; Schema: public
--

--

CREATE POLICY "outreach_prospects admin all" ON public.outreach_prospects TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_profiles
  WHERE ((user_profiles.auth_user_id = auth.uid()) AND (user_profiles.account_type = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_profiles
  WHERE ((user_profiles.auth_user_id = auth.uid()) AND (user_profiles.account_type = 'admin'::text)))));


--
--
-- Name: outreach_prospects outreach_prospects approved read; Type: POLICY; Schema: public
--

--

CREATE POLICY "outreach_prospects approved read" ON public.outreach_prospects FOR SELECT TO authenticated USING ((status = 'approved'::text));


--
--
-- Name: outreach_sequence_state outreach_sequence admin all; Type: POLICY; Schema: public
--

--

CREATE POLICY "outreach_sequence admin all" ON public.outreach_sequence_state TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_profiles
  WHERE ((user_profiles.auth_user_id = auth.uid()) AND (user_profiles.account_type = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_profiles
  WHERE ((user_profiles.auth_user_id = auth.uid()) AND (user_profiles.account_type = 'admin'::text)))));


--
--
-- Name: outreach_sequence_state; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.outreach_sequence_state ENABLE ROW LEVEL SECURITY;

--
--
-- Name: veteran_verifications owner_select_veteran_verifications; Type: POLICY; Schema: public
--

--

CREATE POLICY owner_select_veteran_verifications ON public.veteran_verifications FOR SELECT USING ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: admin_opportunity_pushes pushes_owner_read; Type: POLICY; Schema: public
--

--

CREATE POLICY pushes_owner_read ON public.admin_opportunity_pushes FOR SELECT USING ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: release_notes; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.release_notes ENABLE ROW LEVEL SECURITY;

--
--
-- Name: release_notes release_notes_public; Type: POLICY; Schema: public
--

--

CREATE POLICY release_notes_public ON public.release_notes FOR SELECT USING ((is_public = true));


--
--
-- Name: scheduled_emails; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.scheduled_emails ENABLE ROW LEVEL SECURITY;

--
--
-- Name: slack_installations; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.slack_installations ENABLE ROW LEVEL SECURITY;

--
--
-- Name: slack_installations slack_owner_select; Type: POLICY; Schema: public
--

--

CREATE POLICY slack_owner_select ON public.slack_installations FOR SELECT USING ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: veteran_verifications; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.veteran_verifications ENABLE ROW LEVEL SECURITY;

--
--
-- Name: webhook_deliveries; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

--
--
-- Name: webhook_deliveries webhook_deliveries_owner; Type: POLICY; Schema: public
--

--

CREATE POLICY webhook_deliveries_owner ON public.webhook_deliveries FOR SELECT USING ((webhook_id IN ( SELECT webhook_endpoints.id
   FROM public.webhook_endpoints
  WHERE (webhook_endpoints.user_profile_id IN ( SELECT user_profiles.id
           FROM public.user_profiles
          WHERE (user_profiles.auth_user_id = auth.uid()))))));


--
--
-- Name: webhook_endpoints; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;

--
--
-- Name: webhook_endpoints webhooks_owner; Type: POLICY; Schema: public
--

--

CREATE POLICY webhooks_owner ON public.webhook_endpoints USING ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
-- End of bootstrap (04)
--

