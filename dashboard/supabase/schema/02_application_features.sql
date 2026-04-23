-- Application features — consulting portal, pipeline, docs, proposals
-- User-facing SaaS + consulting features
-- Generated from live_schema.sql (pg_dump v17.6) on 2026-04-22
-- DO NOT EDIT directly: regenerate via tools/28_split_schema_bootstrap.mjs if schema changes.

--
-- Name: touch_proposal_jobs_updated_at(); Type: FUNCTION; Schema: public
--

--

CREATE FUNCTION public.touch_proposal_jobs_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
--
-- Name: attachment_analysis_jobs; Type: TABLE; Schema: public
--

--

CREATE TABLE public.attachment_analysis_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    notice_id text NOT NULL,
    user_profile_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    files_total integer,
    files_done integer DEFAULT 0,
    current_file text,
    extracted_requirements jsonb,
    error text,
    created_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone
);


--
--
-- Name: call_logs; Type: TABLE; Schema: public
--

--

CREATE TABLE public.call_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_profile_id uuid NOT NULL,
    opportunity_id uuid,
    contact_name text,
    contact_phone text,
    transcription text,
    notes text,
    duration_seconds integer,
    created_at timestamp with time zone DEFAULT now()
);


--
--
-- Name: cancellation_feedback; Type: TABLE; Schema: public
--

--

CREATE TABLE public.cancellation_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_profile_id uuid NOT NULL,
    stripe_subscription_id text,
    reason text NOT NULL,
    free_text text,
    accepted_retention_offer boolean DEFAULT false,
    cancelled boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
--
-- Name: capability_matrices; Type: TABLE; Schema: public
--

--

CREATE TABLE public.capability_matrices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_profile_id uuid NOT NULL,
    opportunity_id uuid NOT NULL,
    matrix_json jsonb NOT NULL,
    overall_fit text,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT capability_matrices_overall_fit_check CHECK ((overall_fit = ANY (ARRAY['strong'::text, 'moderate'::text, 'weak'::text, 'poor'::text])))
);


--
--
-- Name: capture_briefs; Type: TABLE; Schema: public
--

--

CREATE TABLE public.capture_briefs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_profile_id uuid,
    opportunity_id uuid NOT NULL,
    notice_id text,
    brief_json jsonb NOT NULL,
    pwin_estimate integer,
    model_used text,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT capture_briefs_pwin_estimate_check CHECK (((pwin_estimate >= 0) AND (pwin_estimate <= 100)))
);


--
--
-- Name: client_activity_log; Type: TABLE; Schema: public
--

--

CREATE TABLE public.client_activity_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_profile_id uuid NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    description text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
--
-- Name: client_competitors; Type: TABLE; Schema: public
--

--

CREATE TABLE public.client_competitors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_profile_id uuid NOT NULL,
    competitor_name text NOT NULL,
    website text,
    uei text,
    cage_code text,
    naics_codes text[],
    employee_count text,
    revenue_estimate text,
    description text,
    overlap_score integer DEFAULT 0,
    federal_presence text,
    crawl_data jsonb,
    last_analyzed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT client_competitors_federal_presence_check CHECK ((federal_presence = ANY (ARRAY['strong'::text, 'moderate'::text, 'limited'::text, 'none'::text, 'unknown'::text])))
);


--
--
-- Name: client_documents; Type: TABLE; Schema: public
--

--

CREATE TABLE public.client_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_profile_id uuid NOT NULL,
    uploaded_by uuid,
    filename text NOT NULL,
    file_url text NOT NULL,
    file_size integer,
    mime_type text,
    category text DEFAULT 'general'::text,
    description text,
    is_template boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    review_status text,
    CONSTRAINT client_documents_category_check CHECK ((category = ANY (ARRAY['capability_statement'::text, 'past_performance'::text, 'certification'::text, 'proposal'::text, 'contract'::text, 'financial'::text, 'legal'::text, 'general'::text, 'sam_registration'::text, 'website_assets'::text, 'logo'::text])))
);


--
--
-- Name: client_messages; Type: TABLE; Schema: public
--

--

CREATE TABLE public.client_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_profile_id uuid NOT NULL,
    sender_type text NOT NULL,
    sender_name text,
    message text NOT NULL,
    read_at timestamp with time zone,
    opportunity_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT client_messages_sender_type_check CHECK ((sender_type = ANY (ARRAY['client'::text, 'admin'::text])))
);


--
--
-- Name: client_partners; Type: TABLE; Schema: public
--

--

CREATE TABLE public.client_partners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_profile_id uuid NOT NULL,
    company_name text NOT NULL,
    website text,
    uei text,
    naics_codes text[] DEFAULT '{}'::text[] NOT NULL,
    status text DEFAULT 'potential'::text NOT NULL,
    description text,
    employee_count text,
    revenue_estimate text,
    state text,
    certifications text[] DEFAULT '{}'::text[] NOT NULL,
    crawl_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    notes text,
    last_analyzed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT client_partners_status_check CHECK ((status = ANY (ARRAY['active'::text, 'potential'::text, 'archived'::text])))
);


--
--
-- Name: TABLE client_partners; Type: COMMENT; Schema: public
--

--

COMMENT ON TABLE public.client_partners IS 'User-curated partner list. Seeded from /api/partners/search (SAM.gov) or from Quick Checker analyses. Status=active means actively working together, potential means shortlisted.';


--
--
-- Name: client_tasks; Type: TABLE; Schema: public
--

--

CREATE TABLE public.client_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_profile_id uuid NOT NULL,
    assigned_by uuid,
    title text NOT NULL,
    description text,
    priority text DEFAULT 'medium'::text,
    status text DEFAULT 'pending'::text,
    due_date timestamp with time zone,
    completed_at timestamp with time zone,
    category text,
    opportunity_id text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT client_tasks_category_check CHECK ((category = ANY (ARRAY['onboarding'::text, 'document'::text, 'registration'::text, 'website'::text, 'proposal'::text, 'opportunity'::text, 'compliance'::text, 'general'::text, 'email_setup'::text, 'sam_registration'::text]))),
    CONSTRAINT client_tasks_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text]))),
    CONSTRAINT client_tasks_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'waiting_client'::text, 'completed'::text, 'cancelled'::text])))
);


--
--
-- Name: compliance_matrices; Type: TABLE; Schema: public
--

--

CREATE TABLE public.compliance_matrices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    opportunity_id uuid NOT NULL,
    notice_id text,
    matrix_json jsonb NOT NULL,
    compliance_score numeric,
    model_used text,
    generated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
--
-- Name: email_drafts; Type: TABLE; Schema: public
--

--

CREATE TABLE public.email_drafts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_profile_id uuid NOT NULL,
    opportunity_id uuid NOT NULL,
    contact_name text,
    contact_email text,
    strategy text NOT NULL,
    subject text NOT NULL,
    body text NOT NULL,
    status text DEFAULT 'draft'::text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT email_drafts_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text, 'archived'::text]))),
    CONSTRAINT email_drafts_strategy_check CHECK ((strategy = ANY (ARRAY['standard_alert'::text, 'certification_leverage'::text, 'early_engagement'::text])))
);


--
--
-- Name: past_perf_ratings; Type: TABLE; Schema: public
--

--

CREATE TABLE public.past_perf_ratings (
    uei text NOT NULL,
    contractor_name text,
    total_contracts integer,
    total_value_usd numeric,
    completed_contracts integer,
    modification_count integer,
    avg_modifications numeric,
    extension_ratio numeric,
    termination_count integer,
    protest_against_count integer,
    protest_filed_count integer,
    primary_agencies text[] DEFAULT '{}'::text[],
    repeat_customer_ratio numeric,
    rating text,
    rating_score numeric,
    reasoning text,
    computed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT past_perf_ratings_rating_check CHECK ((rating = ANY (ARRAY['exceptional'::text, 'very_good'::text, 'satisfactory'::text, 'marginal'::text, 'unsatisfactory'::text, 'insufficient_data'::text]))),
    CONSTRAINT past_perf_ratings_rating_score_check CHECK (((rating_score >= (0)::numeric) AND (rating_score <= (1)::numeric)))
);


--
--
-- Name: pipeline_activity; Type: TABLE; Schema: public
--

--

CREATE TABLE public.pipeline_activity (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pursuit_id uuid NOT NULL,
    user_profile_id uuid NOT NULL,
    activity_type text NOT NULL,
    from_value text,
    to_value text,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT pipeline_activity_activity_type_check CHECK ((activity_type = ANY (ARRAY['stage_changed'::text, 'note_added'::text, 'note_updated'::text, 'action_completed'::text, 'priority_changed'::text, 'created'::text])))
);


--
--
-- Name: profile_invitations; Type: TABLE; Schema: public
--

--

CREATE TABLE public.profile_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    email text NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    feature_access jsonb DEFAULT '{}'::jsonb NOT NULL,
    token text NOT NULL,
    invited_by uuid NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '14 days'::interval) NOT NULL,
    accepted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT profile_invitations_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'member'::text, 'viewer'::text])))
);


--
--
-- Name: TABLE profile_invitations; Type: COMMENT; Schema: public
--

--

COMMENT ON TABLE public.profile_invitations IS 'Pending invitations. Accept endpoint converts to profile_members on signup / existing-user acceptance.';


--
--
-- Name: profile_members; Type: TABLE; Schema: public
--

--

CREATE TABLE public.profile_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    auth_user_id uuid NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    feature_access jsonb DEFAULT '{}'::jsonb NOT NULL,
    invited_by uuid,
    invited_at timestamp with time zone DEFAULT now() NOT NULL,
    accepted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT profile_members_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text, 'viewer'::text])))
);


--
--
-- Name: TABLE profile_members; Type: COMMENT; Schema: public
--

--

COMMENT ON TABLE public.profile_members IS 'Team members for a company profile. Owner sits in user_profiles.auth_user_id; additional members linked here with roles.';


--
--
-- Name: proposal_jobs; Type: TABLE; Schema: public
--

--

CREATE TABLE public.proposal_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_profile_id uuid NOT NULL,
    notice_id text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    sections_requested text[],
    sections_completed jsonb DEFAULT '[]'::jsonb,
    sections_errored jsonb DEFAULT '[]'::jsonb,
    current_section text,
    total_sections integer,
    completed_sections integer DEFAULT 0,
    result jsonb,
    error text,
    tone text DEFAULT 'formal'::text,
    max_pages integer DEFAULT 10,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone
);


--
--
-- Name: recompete_candidates; Type: TABLE; Schema: public
--

--

CREATE TABLE public.recompete_candidates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_award_id text,
    incumbent_uei text,
    incumbent_name text,
    agency text,
    naics_code text,
    psc_code text,
    set_aside text,
    original_award_value numeric,
    contract_end_date date,
    months_to_end integer,
    confidence text,
    confidence_score numeric,
    reasoning text,
    matched_sam_notice_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_refreshed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT recompete_candidates_confidence_check CHECK ((confidence = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text]))),
    CONSTRAINT recompete_candidates_confidence_score_check CHECK (((confidence_score >= (0)::numeric) AND (confidence_score <= (1)::numeric)))
);


--
--
-- Name: saved_searches; Type: TABLE; Schema: public
--

--

CREATE TABLE public.saved_searches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_profile_id uuid NOT NULL,
    name text NOT NULL,
    filters jsonb DEFAULT '{}'::jsonb NOT NULL,
    alert_enabled boolean DEFAULT true,
    alert_frequency text DEFAULT 'daily'::text,
    last_alerted_at timestamp with time zone,
    result_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
--
-- Name: user_documents; Type: TABLE; Schema: public
--

--

CREATE TABLE public.user_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_profile_id uuid NOT NULL,
    name text NOT NULL,
    category text DEFAULT 'other'::text NOT NULL,
    file_url text,
    storage_path text,
    file_size bigint,
    mime_type text,
    content text,
    tags text[] DEFAULT '{}'::text[],
    linked_pursuit_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT user_documents_category_check CHECK ((category = ANY (ARRAY['proposal'::text, 'capability'::text, 'cert'::text, 'reference'::text, 'template'::text, 'other'::text])))
);


--
--
-- Name: user_feedback; Type: TABLE; Schema: public
--

--

CREATE TABLE public.user_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_profile_id uuid,
    rating integer,
    likes text,
    improvements text,
    would_recommend boolean,
    page_url text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT user_feedback_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


--
--
-- Name: user_views; Type: TABLE; Schema: public
--

--

CREATE TABLE public.user_views (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_profile_id uuid NOT NULL,
    page text NOT NULL,
    name text NOT NULL,
    filter_state jsonb DEFAULT '{}'::jsonb NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_views_page_check CHECK ((page = ANY (ARRAY['matches'::text, 'opportunities'::text])))
);


--
--
-- Name: TABLE user_views; Type: COMMENT; Schema: public
--

--

COMMENT ON TABLE public.user_views IS 'User-saved filter presets for list pages (matches, opportunities). filter_state is opaque JSON — page layer defines the shape.';


--
--
-- Name: attachment_analysis_jobs attachment_analysis_jobs_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.attachment_analysis_jobs
    ADD CONSTRAINT attachment_analysis_jobs_pkey PRIMARY KEY (id);


--
--
-- Name: call_logs call_logs_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.call_logs
    ADD CONSTRAINT call_logs_pkey PRIMARY KEY (id);


--
--
-- Name: cancellation_feedback cancellation_feedback_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.cancellation_feedback
    ADD CONSTRAINT cancellation_feedback_pkey PRIMARY KEY (id);


--
--
-- Name: capability_matrices capability_matrices_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.capability_matrices
    ADD CONSTRAINT capability_matrices_pkey PRIMARY KEY (id);


--
--
-- Name: capture_briefs capture_briefs_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.capture_briefs
    ADD CONSTRAINT capture_briefs_pkey PRIMARY KEY (id);


--
--
-- Name: client_activity_log client_activity_log_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.client_activity_log
    ADD CONSTRAINT client_activity_log_pkey PRIMARY KEY (id);


--
--
-- Name: client_competitors client_competitors_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.client_competitors
    ADD CONSTRAINT client_competitors_pkey PRIMARY KEY (id);


--
--
-- Name: client_documents client_documents_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.client_documents
    ADD CONSTRAINT client_documents_pkey PRIMARY KEY (id);


--
--
-- Name: client_messages client_messages_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.client_messages
    ADD CONSTRAINT client_messages_pkey PRIMARY KEY (id);


--
--
-- Name: client_partners client_partners_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.client_partners
    ADD CONSTRAINT client_partners_pkey PRIMARY KEY (id);


--
--
-- Name: client_tasks client_tasks_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.client_tasks
    ADD CONSTRAINT client_tasks_pkey PRIMARY KEY (id);


--
--
-- Name: compliance_matrices compliance_matrices_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.compliance_matrices
    ADD CONSTRAINT compliance_matrices_pkey PRIMARY KEY (id);


--
--
-- Name: email_drafts email_drafts_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.email_drafts
    ADD CONSTRAINT email_drafts_pkey PRIMARY KEY (id);


--
--
-- Name: email_drafts email_drafts_user_profile_id_opportunity_id_strategy_key; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.email_drafts
    ADD CONSTRAINT email_drafts_user_profile_id_opportunity_id_strategy_key UNIQUE (user_profile_id, opportunity_id, strategy);


--
--
-- Name: past_perf_ratings past_perf_ratings_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.past_perf_ratings
    ADD CONSTRAINT past_perf_ratings_pkey PRIMARY KEY (uei);


--
--
-- Name: pipeline_activity pipeline_activity_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.pipeline_activity
    ADD CONSTRAINT pipeline_activity_pkey PRIMARY KEY (id);


--
--
-- Name: profile_invitations profile_invitations_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.profile_invitations
    ADD CONSTRAINT profile_invitations_pkey PRIMARY KEY (id);


--
--
-- Name: profile_invitations profile_invitations_token_key; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.profile_invitations
    ADD CONSTRAINT profile_invitations_token_key UNIQUE (token);


--
--
-- Name: profile_members profile_members_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.profile_members
    ADD CONSTRAINT profile_members_pkey PRIMARY KEY (id);


--
--
-- Name: proposal_jobs proposal_jobs_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.proposal_jobs
    ADD CONSTRAINT proposal_jobs_pkey PRIMARY KEY (id);


--
--
-- Name: recompete_candidates recompete_candidates_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.recompete_candidates
    ADD CONSTRAINT recompete_candidates_pkey PRIMARY KEY (id);


--
--
-- Name: saved_searches saved_searches_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.saved_searches
    ADD CONSTRAINT saved_searches_pkey PRIMARY KEY (id);


--
--
-- Name: user_documents user_documents_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.user_documents
    ADD CONSTRAINT user_documents_pkey PRIMARY KEY (id);


--
--
-- Name: user_feedback user_feedback_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.user_feedback
    ADD CONSTRAINT user_feedback_pkey PRIMARY KEY (id);


--
--
-- Name: user_views user_views_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.user_views
    ADD CONSTRAINT user_views_pkey PRIMARY KEY (id);


--
--
-- Name: idx_activity_created; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_activity_created ON public.client_activity_log USING btree (created_at);


--
--
-- Name: idx_activity_user; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_activity_user ON public.client_activity_log USING btree (user_profile_id);


--
--
-- Name: idx_attachment_jobs_notice; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_attachment_jobs_notice ON public.attachment_analysis_jobs USING btree (notice_id);


--
--
-- Name: idx_attachment_jobs_profile; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_attachment_jobs_profile ON public.attachment_analysis_jobs USING btree (user_profile_id);


--
--
-- Name: idx_attachment_jobs_status; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_attachment_jobs_status ON public.attachment_analysis_jobs USING btree (status);


--
--
-- Name: idx_call_logs_user; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_call_logs_user ON public.call_logs USING btree (user_profile_id);


--
--
-- Name: idx_cancellation_profile; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_cancellation_profile ON public.cancellation_feedback USING btree (user_profile_id);


--
--
-- Name: idx_capability_user_opp; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_capability_user_opp ON public.capability_matrices USING btree (user_profile_id, opportunity_id, generated_at DESC);


--
--
-- Name: idx_capture_briefs_user_opp; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_capture_briefs_user_opp ON public.capture_briefs USING btree (user_profile_id, opportunity_id, generated_at DESC);


--
--
-- Name: idx_client_messages_profile; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_client_messages_profile ON public.client_messages USING btree (user_profile_id, created_at DESC);


--
--
-- Name: idx_client_partners_status; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_client_partners_status ON public.client_partners USING btree (user_profile_id, status);


--
--
-- Name: idx_client_partners_user; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_client_partners_user ON public.client_partners USING btree (user_profile_id);


--
--
-- Name: idx_competitors_user; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_competitors_user ON public.client_competitors USING btree (user_profile_id);


--
--
-- Name: idx_compliance_opp; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_compliance_opp ON public.compliance_matrices USING btree (opportunity_id, generated_at DESC);


--
--
-- Name: idx_docs_category; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_docs_category ON public.client_documents USING btree (category);


--
--
-- Name: idx_docs_user; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_docs_user ON public.client_documents USING btree (user_profile_id);


--
--
-- Name: idx_email_drafts_user; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_email_drafts_user ON public.email_drafts USING btree (user_profile_id);


--
--
-- Name: idx_past_perf_rating; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_past_perf_rating ON public.past_perf_ratings USING btree (rating);


--
--
-- Name: idx_pipeline_activity_profile; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_pipeline_activity_profile ON public.pipeline_activity USING btree (user_profile_id, created_at DESC);


--
--
-- Name: idx_pipeline_activity_pursuit; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_pipeline_activity_pursuit ON public.pipeline_activity USING btree (pursuit_id, created_at DESC);


--
--
-- Name: idx_profile_invitations_email; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_profile_invitations_email ON public.profile_invitations USING btree (lower(email));


--
--
-- Name: idx_profile_invitations_token; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_profile_invitations_token ON public.profile_invitations USING btree (token);


--
--
-- Name: idx_profile_members_user; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_profile_members_user ON public.profile_members USING btree (auth_user_id);


--
--
-- Name: idx_proposal_jobs_active; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_proposal_jobs_active ON public.proposal_jobs USING btree (user_profile_id, created_at DESC) WHERE (status = ANY (ARRAY['pending'::text, 'writing'::text]));


--
--
-- Name: idx_proposal_jobs_user; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_proposal_jobs_user ON public.proposal_jobs USING btree (user_profile_id, status);


--
--
-- Name: idx_recompete_agency_naics; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_recompete_agency_naics ON public.recompete_candidates USING btree (agency, naics_code);


--
--
-- Name: idx_recompete_confidence; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_recompete_confidence ON public.recompete_candidates USING btree (confidence, confidence_score DESC);


--
--
-- Name: idx_recompete_end_date; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_recompete_end_date ON public.recompete_candidates USING btree (contract_end_date) WHERE (contract_end_date IS NOT NULL);


--
--
-- Name: idx_saved_searches_alert; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_saved_searches_alert ON public.saved_searches USING btree (alert_enabled) WHERE (alert_enabled = true);


--
--
-- Name: idx_saved_searches_user; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_saved_searches_user ON public.saved_searches USING btree (user_profile_id);


--
--
-- Name: idx_tasks_due; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_tasks_due ON public.client_tasks USING btree (due_date) WHERE (status <> 'completed'::text);


--
--
-- Name: idx_tasks_status; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_tasks_status ON public.client_tasks USING btree (status);


--
--
-- Name: idx_tasks_user; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_tasks_user ON public.client_tasks USING btree (user_profile_id);


--
--
-- Name: idx_user_documents_category; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_user_documents_category ON public.user_documents USING btree (category);


--
--
-- Name: idx_user_documents_pursuit; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_user_documents_pursuit ON public.user_documents USING btree (linked_pursuit_id);


--
--
-- Name: idx_user_documents_tags; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_user_documents_tags ON public.user_documents USING gin (tags);


--
--
-- Name: idx_user_documents_user; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_user_documents_user ON public.user_documents USING btree (user_profile_id);


--
--
-- Name: idx_user_views_user_page; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_user_views_user_page ON public.user_views USING btree (user_profile_id, page, sort_order);


--
--
-- Name: uq_client_partners_user_uei; Type: INDEX; Schema: public
--

--

CREATE UNIQUE INDEX uq_client_partners_user_uei ON public.client_partners USING btree (user_profile_id, uei) WHERE (uei IS NOT NULL);


--
--
-- Name: uq_client_partners_user_website; Type: INDEX; Schema: public
--

--

CREATE UNIQUE INDEX uq_client_partners_user_website ON public.client_partners USING btree (user_profile_id, website) WHERE (website IS NOT NULL);


--
--
-- Name: uq_profile_invitations_profile_email_pending; Type: INDEX; Schema: public
--

--

CREATE UNIQUE INDEX uq_profile_invitations_profile_email_pending ON public.profile_invitations USING btree (profile_id, lower(email)) WHERE (accepted_at IS NULL);


--
--
-- Name: uq_profile_members_profile_user; Type: INDEX; Schema: public
--

--

CREATE UNIQUE INDEX uq_profile_members_profile_user ON public.profile_members USING btree (profile_id, auth_user_id);


--
--
-- Name: uq_recompete_source_award; Type: INDEX; Schema: public
--

--

CREATE UNIQUE INDEX uq_recompete_source_award ON public.recompete_candidates USING btree (source_award_id) WHERE (source_award_id IS NOT NULL);


--
--
-- Name: proposal_jobs trg_proposal_jobs_updated_at; Type: TRIGGER; Schema: public
--

--

CREATE TRIGGER trg_proposal_jobs_updated_at BEFORE UPDATE ON public.proposal_jobs FOR EACH ROW EXECUTE FUNCTION public.touch_proposal_jobs_updated_at();


--
--
-- Name: call_logs call_logs_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.call_logs
    ADD CONSTRAINT call_logs_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE SET NULL;


--
--
-- Name: call_logs call_logs_user_profile_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.call_logs
    ADD CONSTRAINT call_logs_user_profile_id_fkey FOREIGN KEY (user_profile_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;


--
--
-- Name: capability_matrices capability_matrices_user_profile_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.capability_matrices
    ADD CONSTRAINT capability_matrices_user_profile_id_fkey FOREIGN KEY (user_profile_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;


--
--
-- Name: capture_briefs capture_briefs_user_profile_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.capture_briefs
    ADD CONSTRAINT capture_briefs_user_profile_id_fkey FOREIGN KEY (user_profile_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;


--
--
-- Name: client_activity_log client_activity_log_actor_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.client_activity_log
    ADD CONSTRAINT client_activity_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.user_profiles(id);


--
--
-- Name: client_activity_log client_activity_log_user_profile_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.client_activity_log
    ADD CONSTRAINT client_activity_log_user_profile_id_fkey FOREIGN KEY (user_profile_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;


--
--
-- Name: client_competitors client_competitors_user_profile_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.client_competitors
    ADD CONSTRAINT client_competitors_user_profile_id_fkey FOREIGN KEY (user_profile_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;


--
--
-- Name: client_documents client_documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.client_documents
    ADD CONSTRAINT client_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.user_profiles(id);


--
--
-- Name: client_documents client_documents_user_profile_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.client_documents
    ADD CONSTRAINT client_documents_user_profile_id_fkey FOREIGN KEY (user_profile_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;


--
--
-- Name: client_messages client_messages_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.client_messages
    ADD CONSTRAINT client_messages_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id);


--
--
-- Name: client_messages client_messages_user_profile_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.client_messages
    ADD CONSTRAINT client_messages_user_profile_id_fkey FOREIGN KEY (user_profile_id) REFERENCES public.user_profiles(id);


--
--
-- Name: client_partners client_partners_user_profile_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.client_partners
    ADD CONSTRAINT client_partners_user_profile_id_fkey FOREIGN KEY (user_profile_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;


--
--
-- Name: client_tasks client_tasks_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.client_tasks
    ADD CONSTRAINT client_tasks_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.user_profiles(id);


--
--
-- Name: client_tasks client_tasks_user_profile_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.client_tasks
    ADD CONSTRAINT client_tasks_user_profile_id_fkey FOREIGN KEY (user_profile_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;


--
--
-- Name: email_drafts email_drafts_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.email_drafts
    ADD CONSTRAINT email_drafts_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE CASCADE;


--
--
-- Name: email_drafts email_drafts_user_profile_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.email_drafts
    ADD CONSTRAINT email_drafts_user_profile_id_fkey FOREIGN KEY (user_profile_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;


--
--
-- Name: pipeline_activity pipeline_activity_pursuit_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.pipeline_activity
    ADD CONSTRAINT pipeline_activity_pursuit_id_fkey FOREIGN KEY (pursuit_id) REFERENCES public.user_pursuits(id) ON DELETE CASCADE;


--
--
-- Name: pipeline_activity pipeline_activity_user_profile_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.pipeline_activity
    ADD CONSTRAINT pipeline_activity_user_profile_id_fkey FOREIGN KEY (user_profile_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;


--
--
-- Name: profile_invitations profile_invitations_invited_by_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.profile_invitations
    ADD CONSTRAINT profile_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id);


--
--
-- Name: profile_invitations profile_invitations_profile_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.profile_invitations
    ADD CONSTRAINT profile_invitations_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;


--
--
-- Name: profile_members profile_members_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.profile_members
    ADD CONSTRAINT profile_members_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
--
-- Name: profile_members profile_members_invited_by_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.profile_members
    ADD CONSTRAINT profile_members_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id);


--
--
-- Name: profile_members profile_members_profile_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.profile_members
    ADD CONSTRAINT profile_members_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;


--
--
-- Name: proposal_jobs proposal_jobs_user_profile_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.proposal_jobs
    ADD CONSTRAINT proposal_jobs_user_profile_id_fkey FOREIGN KEY (user_profile_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;


--
--
-- Name: saved_searches saved_searches_user_profile_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.saved_searches
    ADD CONSTRAINT saved_searches_user_profile_id_fkey FOREIGN KEY (user_profile_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;


--
--
-- Name: user_documents user_documents_linked_pursuit_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.user_documents
    ADD CONSTRAINT user_documents_linked_pursuit_id_fkey FOREIGN KEY (linked_pursuit_id) REFERENCES public.user_pursuits(id) ON DELETE SET NULL;


--
--
-- Name: user_documents user_documents_user_profile_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.user_documents
    ADD CONSTRAINT user_documents_user_profile_id_fkey FOREIGN KEY (user_profile_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;


--
--
-- Name: user_feedback user_feedback_user_profile_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.user_feedback
    ADD CONSTRAINT user_feedback_user_profile_id_fkey FOREIGN KEY (user_profile_id) REFERENCES public.user_profiles(id);


--
--
-- Name: user_views user_views_user_profile_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.user_views
    ADD CONSTRAINT user_views_user_profile_id_fkey FOREIGN KEY (user_profile_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;


--
--
-- Name: pipeline_activity Users can manage own pipeline activity; Type: POLICY; Schema: public
--

--

CREATE POLICY "Users can manage own pipeline activity" ON public.pipeline_activity USING ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid())))) WITH CHECK ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: call_logs Users manage own call logs; Type: POLICY; Schema: public
--

--

CREATE POLICY "Users manage own call logs" ON public.call_logs TO authenticated USING ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: email_drafts Users manage own drafts; Type: POLICY; Schema: public
--

--

CREATE POLICY "Users manage own drafts" ON public.email_drafts TO authenticated USING ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: client_activity_log activity_admin; Type: POLICY; Schema: public
--

--

CREATE POLICY activity_admin ON public.client_activity_log USING (true) WITH CHECK (true);


--
--
-- Name: client_activity_log activity_own; Type: POLICY; Schema: public
--

--

CREATE POLICY activity_own ON public.client_activity_log FOR SELECT USING ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: attachment_analysis_jobs; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.attachment_analysis_jobs ENABLE ROW LEVEL SECURITY;

--
--
-- Name: call_logs; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

--
--
-- Name: cancellation_feedback; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.cancellation_feedback ENABLE ROW LEVEL SECURITY;

--
--
-- Name: capability_matrices; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.capability_matrices ENABLE ROW LEVEL SECURITY;

--
--
-- Name: capability_matrices capability_owner; Type: POLICY; Schema: public
--

--

CREATE POLICY capability_owner ON public.capability_matrices USING ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: capture_briefs; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.capture_briefs ENABLE ROW LEVEL SECURITY;

--
--
-- Name: capture_briefs capture_briefs_owner; Type: POLICY; Schema: public
--

--

CREATE POLICY capture_briefs_owner ON public.capture_briefs USING ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: client_activity_log; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.client_activity_log ENABLE ROW LEVEL SECURITY;

--
--
-- Name: client_competitors; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.client_competitors ENABLE ROW LEVEL SECURITY;

--
--
-- Name: client_documents; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.client_documents ENABLE ROW LEVEL SECURITY;

--
--
-- Name: client_messages; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.client_messages ENABLE ROW LEVEL SECURITY;

--
--
-- Name: client_partners; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.client_partners ENABLE ROW LEVEL SECURITY;

--
--
-- Name: client_partners client_partners delete own; Type: POLICY; Schema: public
--

--

CREATE POLICY "client_partners delete own" ON public.client_partners FOR DELETE TO authenticated USING ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: client_partners client_partners insert own; Type: POLICY; Schema: public
--

--

CREATE POLICY "client_partners insert own" ON public.client_partners FOR INSERT TO authenticated WITH CHECK ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: client_partners client_partners read own; Type: POLICY; Schema: public
--

--

CREATE POLICY "client_partners read own" ON public.client_partners FOR SELECT TO authenticated USING ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: client_partners client_partners update own; Type: POLICY; Schema: public
--

--

CREATE POLICY "client_partners update own" ON public.client_partners FOR UPDATE TO authenticated USING ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid())))) WITH CHECK ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: client_tasks; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.client_tasks ENABLE ROW LEVEL SECURITY;

--
--
-- Name: client_messages clients_insert_own_messages; Type: POLICY; Schema: public
--

--

CREATE POLICY clients_insert_own_messages ON public.client_messages FOR INSERT TO authenticated WITH CHECK (((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))) AND (sender_type = 'client'::text)));


--
--
-- Name: client_messages clients_read_own_messages; Type: POLICY; Schema: public
--

--

CREATE POLICY clients_read_own_messages ON public.client_messages FOR SELECT TO authenticated USING ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: client_competitors competitors_admin; Type: POLICY; Schema: public
--

--

CREATE POLICY competitors_admin ON public.client_competitors USING (true) WITH CHECK (true);


--
--
-- Name: client_competitors competitors_insert_own; Type: POLICY; Schema: public
--

--

CREATE POLICY competitors_insert_own ON public.client_competitors FOR INSERT WITH CHECK ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: client_competitors competitors_own; Type: POLICY; Schema: public
--

--

CREATE POLICY competitors_own ON public.client_competitors FOR SELECT USING ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: compliance_matrices; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.compliance_matrices ENABLE ROW LEVEL SECURITY;

--
--
-- Name: compliance_matrices compliance_read; Type: POLICY; Schema: public
--

--

CREATE POLICY compliance_read ON public.compliance_matrices FOR SELECT USING (true);


--
--
-- Name: client_documents docs_admin; Type: POLICY; Schema: public
--

--

CREATE POLICY docs_admin ON public.client_documents USING (true) WITH CHECK (true);


--
--
-- Name: client_documents docs_delete_own; Type: POLICY; Schema: public
--

--

CREATE POLICY docs_delete_own ON public.client_documents FOR DELETE USING ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: client_documents docs_insert_own; Type: POLICY; Schema: public
--

--

CREATE POLICY docs_insert_own ON public.client_documents FOR INSERT WITH CHECK ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: client_documents docs_own; Type: POLICY; Schema: public
--

--

CREATE POLICY docs_own ON public.client_documents FOR SELECT USING ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: client_documents docs_update_own; Type: POLICY; Schema: public
--

--

CREATE POLICY docs_update_own ON public.client_documents FOR UPDATE USING ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: email_drafts; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.email_drafts ENABLE ROW LEVEL SECURITY;

--
--
-- Name: past_perf_ratings; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.past_perf_ratings ENABLE ROW LEVEL SECURITY;

--
--
-- Name: past_perf_ratings past_perf_read; Type: POLICY; Schema: public
--

--

CREATE POLICY past_perf_read ON public.past_perf_ratings FOR SELECT USING (true);


--
--
-- Name: pipeline_activity; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.pipeline_activity ENABLE ROW LEVEL SECURITY;

--
--
-- Name: profile_invitations; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.profile_invitations ENABLE ROW LEVEL SECURITY;

--
--
-- Name: profile_invitations profile_invitations read own; Type: POLICY; Schema: public
--

--

CREATE POLICY "profile_invitations read own" ON public.profile_invitations FOR SELECT TO authenticated USING ((profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: profile_invitations profile_invitations write owner; Type: POLICY; Schema: public
--

--

CREATE POLICY "profile_invitations write owner" ON public.profile_invitations TO authenticated USING ((profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid())))) WITH CHECK ((profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: profile_members; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.profile_members ENABLE ROW LEVEL SECURITY;

--
--
-- Name: profile_members profile_members read own; Type: POLICY; Schema: public
--

--

CREATE POLICY "profile_members read own" ON public.profile_members FOR SELECT TO authenticated USING (((auth_user_id = auth.uid()) OR (profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid())))));


--
--
-- Name: profile_members profile_members write owner; Type: POLICY; Schema: public
--

--

CREATE POLICY "profile_members write owner" ON public.profile_members TO authenticated USING ((profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid())))) WITH CHECK ((profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: proposal_jobs; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.proposal_jobs ENABLE ROW LEVEL SECURITY;

--
--
-- Name: proposal_jobs proposal_jobs_own; Type: POLICY; Schema: public
--

--

CREATE POLICY proposal_jobs_own ON public.proposal_jobs USING ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid())))) WITH CHECK ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: proposal_jobs proposal_jobs_service; Type: POLICY; Schema: public
--

--

CREATE POLICY proposal_jobs_service ON public.proposal_jobs USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
--
-- Name: recompete_candidates; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.recompete_candidates ENABLE ROW LEVEL SECURITY;

--
--
-- Name: recompete_candidates recompete_read; Type: POLICY; Schema: public
--

--

CREATE POLICY recompete_read ON public.recompete_candidates FOR SELECT USING (true);


--
--
-- Name: saved_searches; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.saved_searches ENABLE ROW LEVEL SECURITY;

--
--
-- Name: saved_searches saved_searches_admin; Type: POLICY; Schema: public
--

--

CREATE POLICY saved_searches_admin ON public.saved_searches USING (true) WITH CHECK (true);


--
--
-- Name: saved_searches saved_searches_own; Type: POLICY; Schema: public
--

--

CREATE POLICY saved_searches_own ON public.saved_searches USING ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid())))) WITH CHECK ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: user_feedback service_role_all_feedback; Type: POLICY; Schema: public
--

--

CREATE POLICY service_role_all_feedback ON public.user_feedback TO service_role USING (true) WITH CHECK (true);


--
--
-- Name: client_messages service_role_all_messages; Type: POLICY; Schema: public
--

--

CREATE POLICY service_role_all_messages ON public.client_messages TO service_role USING (true) WITH CHECK (true);


--
--
-- Name: client_tasks tasks_admin; Type: POLICY; Schema: public
--

--

CREATE POLICY tasks_admin ON public.client_tasks USING (true) WITH CHECK (true);


--
--
-- Name: client_tasks tasks_own; Type: POLICY; Schema: public
--

--

CREATE POLICY tasks_own ON public.client_tasks FOR SELECT USING ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: client_tasks tasks_update_own; Type: POLICY; Schema: public
--

--

CREATE POLICY tasks_update_own ON public.client_tasks FOR UPDATE USING ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: user_documents; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.user_documents ENABLE ROW LEVEL SECURITY;

--
--
-- Name: user_documents user_documents_own; Type: POLICY; Schema: public
--

--

CREATE POLICY user_documents_own ON public.user_documents USING ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid())))) WITH CHECK ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: user_feedback; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;

--
--
-- Name: user_views; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.user_views ENABLE ROW LEVEL SECURITY;

--
--
-- Name: user_views user_views delete own; Type: POLICY; Schema: public
--

--

CREATE POLICY "user_views delete own" ON public.user_views FOR DELETE TO authenticated USING ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: user_views user_views insert own; Type: POLICY; Schema: public
--

--

CREATE POLICY "user_views insert own" ON public.user_views FOR INSERT TO authenticated WITH CHECK ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: user_views user_views read own; Type: POLICY; Schema: public
--

--

CREATE POLICY "user_views read own" ON public.user_views FOR SELECT TO authenticated USING ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: user_views user_views update own; Type: POLICY; Schema: public
--

--

CREATE POLICY "user_views update own" ON public.user_views FOR UPDATE TO authenticated USING ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid())))) WITH CHECK ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: client_documents users_delete_own_docs; Type: POLICY; Schema: public
--

--

CREATE POLICY users_delete_own_docs ON public.client_documents FOR DELETE TO authenticated USING ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: client_documents users_insert_own_docs; Type: POLICY; Schema: public
--

--

CREATE POLICY users_insert_own_docs ON public.client_documents FOR INSERT TO authenticated WITH CHECK ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: user_feedback users_insert_own_feedback; Type: POLICY; Schema: public
--

--

CREATE POLICY users_insert_own_feedback ON public.user_feedback FOR INSERT TO authenticated WITH CHECK ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: client_documents users_read_own_docs; Type: POLICY; Schema: public
--

--

CREATE POLICY users_read_own_docs ON public.client_documents FOR SELECT TO authenticated USING ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--