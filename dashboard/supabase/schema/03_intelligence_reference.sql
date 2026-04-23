-- Intelligence & reference data — market intel, teaming, forecasts
-- Curated reference tables for scoring, teaming, market analysis
-- Generated from live_schema.sql (pg_dump v17.6) on 2026-04-22
-- DO NOT EDIT directly: regenerate via tools/28_split_schema_bootstrap.mjs if schema changes.

--
-- Name: agency_forecast_changes; Type: TABLE; Schema: public
--

--

CREATE TABLE public.agency_forecast_changes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_id uuid NOT NULL,
    detected_at timestamp with time zone DEFAULT now() NOT NULL,
    diff_summary text,
    added_lines text[] DEFAULT '{}'::text[],
    removed_lines text[] DEFAULT '{}'::text[],
    naics_detected text[] DEFAULT '{}'::text[],
    raw_snippet text,
    notified_users uuid[] DEFAULT '{}'::uuid[]
);


--
--
-- Name: agency_forecast_sources; Type: TABLE; Schema: public
--

--

CREATE TABLE public.agency_forecast_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency text NOT NULL,
    agency_code text,
    label text NOT NULL,
    url text NOT NULL,
    selector text,
    changedetection_watch_id text,
    last_checked_at timestamp with time zone,
    last_hash text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
--
-- Name: agency_spend_forecast; Type: TABLE; Schema: public
--

--

CREATE TABLE public.agency_spend_forecast (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rank integer,
    agency_name text NOT NULL,
    fiscal_year integer NOT NULL,
    fiscal_period text DEFAULT 'Q4'::text NOT NULL,
    unobligated_balance_usd bigint,
    hot_naics text[] DEFAULT '{}'::text[],
    hot_opportunities text,
    why_now text,
    source text,
    published_at date,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
--
-- Name: TABLE agency_spend_forecast; Type: COMMENT; Schema: public
--

--

COMMENT ON TABLE public.agency_spend_forecast IS 'Per-agency Q4 unobligated-balance forecast, used by the Year-End Spend Radar widget. One row per (agency, fiscal_year, fiscal_period).';


--
--
-- Name: COLUMN agency_spend_forecast.unobligated_balance_usd; Type: COMMENT; Schema: public
--

--

COMMENT ON COLUMN public.agency_spend_forecast.unobligated_balance_usd IS 'Estimated dollars authorized but not yet obligated — the "use it or lose it" pool.';


--
--
-- Name: bid_protests; Type: TABLE; Schema: public
--

--

CREATE TABLE public.bid_protests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    docket_number text NOT NULL,
    protester text,
    solicitation text,
    agency text,
    decision_date date,
    outcome text,
    decision_url text,
    summary text,
    related_uei text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bid_protests_outcome_check CHECK ((outcome = ANY (ARRAY['sustained'::text, 'denied'::text, 'dismissed'::text, 'withdrawn'::text, 'pending'::text, 'other'::text])))
);


--
--
-- Name: company_analyses; Type: TABLE; Schema: public
--

--

CREATE TABLE public.company_analyses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_name text NOT NULL,
    website text NOT NULL,
    uei text,
    status text DEFAULT 'pending'::text,
    crawl_data jsonb DEFAULT '{}'::jsonb,
    sam_data jsonb DEFAULT '{}'::jsonb,
    inferred_naics jsonb DEFAULT '[]'::jsonb,
    company_summary text,
    preview_matches jsonb DEFAULT '[]'::jsonb,
    inferred_profile jsonb DEFAULT '{}'::jsonb,
    converted_user_id uuid,
    converted_at timestamp with time zone,
    ip_address inet,
    error_message text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    cert_recommendations jsonb DEFAULT '[]'::jsonb,
    easy_wins jsonb DEFAULT '[]'::jsonb,
    lead_email text,
    is_saved boolean DEFAULT false,
    competitors jsonb,
    selected_naics_codes text[],
    readiness_score integer,
    readiness_breakdown jsonb,
    ai_match_summaries jsonb,
    opportunity_stats jsonb,
    CONSTRAINT company_analyses_status_check CHECK ((status = ANY (ARRAY['crawling'::text, 'enriching'::text, 'classifying'::text, 'awaiting_naics_selection'::text, 'finding_opportunities'::text, 'scoring'::text, 'finding_competitors'::text, 'generating'::text, 'complete'::text, 'error'::text])))
);


--
--
-- Name: COLUMN company_analyses.competitors; Type: COMMENT; Schema: public
--

--

COMMENT ON COLUMN public.company_analyses.competitors IS 'Top 5 competitors auto-discovered from SAM.gov Entity API, USASpending, and the contractors table, with enrichment and inferred strengths/weaknesses.';


--
--
-- Name: COLUMN company_analyses.selected_naics_codes; Type: COMMENT; Schema: public
--

--

COMMENT ON COLUMN public.company_analyses.selected_naics_codes IS 'NAICS codes explicitly selected by the user/admin for scoring (max 2)';


--
--
-- Name: COLUMN company_analyses.readiness_score; Type: COMMENT; Schema: public
--

--

COMMENT ON COLUMN public.company_analyses.readiness_score IS 'Government contracting readiness score, 0-10 scale';


--
--
-- Name: COLUMN company_analyses.readiness_breakdown; Type: COMMENT; Schema: public
--

--

COMMENT ON COLUMN public.company_analyses.readiness_breakdown IS 'JSONB breakdown of readiness score components and factors';


--
--
-- Name: COLUMN company_analyses.ai_match_summaries; Type: COMMENT; Schema: public
--

--

COMMENT ON COLUMN public.company_analyses.ai_match_summaries IS 'JSONB map of opportunity_id to AI-generated 2-3 sentence fit summaries';


--
--
-- Name: COLUMN company_analyses.opportunity_stats; Type: COMMENT; Schema: public
--

--

COMMENT ON COLUMN public.company_analyses.opportunity_stats IS 'Aggregated opportunity landscape stats used by the Quick Checker results page — totals by NAICS and state, plus HOT/WARM match counts.';


--
--
-- Name: daily_dod_awards; Type: TABLE; Schema: public
--

--

CREATE TABLE public.daily_dod_awards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    announcement_date date NOT NULL,
    contractor_name text NOT NULL,
    contractor_uei text,
    amount_usd numeric(15,2),
    location text,
    agency text,
    contract_number text,
    sow_summary text,
    source_url text,
    raw_text text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
--
-- Name: far_clauses_cache; Type: TABLE; Schema: public
--

--

CREATE TABLE public.far_clauses_cache (
    clause_id text NOT NULL,
    title text NOT NULL,
    body_text text NOT NULL,
    body_html text,
    section_url text,
    last_amended date,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL
);


--
--
-- Name: federal_hierarchy; Type: TABLE; Schema: public
--

--

CREATE TABLE public.federal_hierarchy (
    fh_id text NOT NULL,
    org_name text NOT NULL,
    org_type text,
    parent_fh_id text,
    parent_name text,
    agency_code text,
    fpds_code text,
    dodaac text,
    status text,
    address_state text,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL
);


--
--
-- Name: fpds_awards; Type: TABLE; Schema: public
--

--

CREATE TABLE public.fpds_awards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    piid text NOT NULL,
    referenced_idv text,
    modification_number text,
    contractor_uei text,
    contractor_name text,
    awarding_agency text,
    awarding_sub_agency text,
    naics_code text,
    psc_code text,
    set_aside text,
    obligation_amount numeric(15,2),
    base_and_exercised numeric(15,2),
    base_and_all_options numeric(15,2),
    signed_date date,
    effective_date date,
    current_end_date date,
    ultimate_end_date date,
    contract_action_type text,
    idv_type text,
    contract_type text,
    type_of_contract_pricing text,
    extent_competed text,
    solicitation_procedures text,
    number_of_offers_received integer,
    is_termination boolean GENERATED ALWAYS AS ((contract_action_type = ANY (ARRAY['DCA'::text, 'TCA'::text, 'TFC'::text]))) STORED,
    is_option_exercise boolean GENERATED ALWAYS AS ((contract_action_type = 'B'::text)) STORED,
    is_modification boolean GENERATED ALWAYS AS (((modification_number IS NOT NULL) AND (modification_number <> '0'::text) AND (modification_number <> ''::text))) STORED,
    source_url text,
    raw_xml_hash text,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL
);


--
--
-- Name: gov_keywords; Type: TABLE; Schema: public
--

--

CREATE TABLE public.gov_keywords (
    keyword text NOT NULL,
    display_label text NOT NULL,
    category text,
    aliases text[] DEFAULT '{}'::text[] NOT NULL,
    frequency integer DEFAULT 0 NOT NULL,
    title_frequency integer DEFAULT 0 NOT NULL,
    source text DEFAULT 'mined'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    added_by_user_id uuid,
    CONSTRAINT gov_keywords_source_check CHECK ((source = ANY (ARRAY['mined'::text, 'ai'::text, 'manual'::text])))
);


--
--
-- Name: TABLE gov_keywords; Type: COMMENT; Schema: public
--

--

COMMENT ON TABLE public.gov_keywords IS 'Curated keyword library for matching companies to federal opportunities. Seeded from opportunity title/description n-grams, optionally clustered via AI. Read-only to authenticated users; writes via service role.';


--
--
-- Name: COLUMN gov_keywords.added_by_user_id; Type: COMMENT; Schema: public
--

--

COMMENT ON COLUMN public.gov_keywords.added_by_user_id IS 'Auth user who added this keyword (only populated when source = ''user''). Lets us show ownership and filter per-user pending terms.';


--
--
-- Name: labor_rates; Type: TABLE; Schema: public
--

--

CREATE TABLE public.labor_rates (
    id bigint NOT NULL,
    labor_category text NOT NULL,
    education_level text,
    min_years_experience integer,
    contractor_name text,
    schedule text,
    sin text,
    hourly_rate_year1 numeric(10,2),
    hourly_rate_current numeric(10,2),
    idv_piid text,
    business_size text,
    worksite text,
    keywords text,
    source_id text DEFAULT 'gsa_calc'::text NOT NULL,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL
);


--
--
-- Name: labor_rates_id_seq; Type: SEQUENCE; Schema: public
--

--

CREATE SEQUENCE public.labor_rates_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
--
-- Name: labor_rates_id_seq; Type: SEQUENCE OWNED BY; Schema: public
--

--

ALTER SEQUENCE public.labor_rates_id_seq OWNED BY public.labor_rates.id;


--
--
-- Name: market_watch_searches; Type: TABLE; Schema: public
--

--

CREATE TABLE public.market_watch_searches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_profile_id uuid NOT NULL,
    name text NOT NULL,
    query_text text NOT NULL,
    filters_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    active boolean DEFAULT true NOT NULL,
    last_run_at timestamp with time zone,
    last_result_count integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
--
-- Name: naics_market_stats; Type: TABLE; Schema: public
--

--

CREATE TABLE public.naics_market_stats (
    naics_code text NOT NULL,
    period_years integer DEFAULT 5 NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    total_spend numeric DEFAULT 0 NOT NULL,
    avg_yearly_spend numeric DEFAULT 0 NOT NULL,
    yoy_growth_pct numeric DEFAULT 0 NOT NULL,
    market_trend text DEFAULT 'STABLE'::text NOT NULL,
    yearly_spend jsonb DEFAULT '[]'::jsonb NOT NULL,
    top_agencies jsonb DEFAULT '[]'::jsonb NOT NULL,
    top_states jsonb DEFAULT '[]'::jsonb NOT NULL,
    top_sub_agencies jsonb DEFAULT '[]'::jsonb NOT NULL,
    computed_at timestamp with time zone DEFAULT now() NOT NULL,
    refresh_after timestamp with time zone DEFAULT (now() + '30 days'::interval) NOT NULL
);


--
--
-- Name: prime_sblos; Type: TABLE; Schema: public
--

--

CREATE TABLE public.prime_sblos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_scope text,
    prime_company text NOT NULL,
    sblo_name text,
    sblo_email text,
    sblo_phone text,
    notes text,
    source text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
--
-- Name: TABLE prime_sblos; Type: COMMENT; Schema: public
--

--

COMMENT ON TABLE public.prime_sblos IS 'Prime contractor Small Business Liaison Officers. Used for subcontracting outreach from Partners → Primes tab.';


--
--
-- Name: tribal_contractors; Type: TABLE; Schema: public
--

--

CREATE TABLE public.tribal_contractors (
    uei text NOT NULL,
    cage_code text,
    business_name text NOT NULL,
    primary_naics_code text,
    all_naics_codes text[] DEFAULT '{}'::text[],
    small_naics_codes text[] DEFAULT '{}'::text[],
    certifications text[] DEFAULT '{}'::text[],
    contact_name text,
    contact_email text,
    address_line_1 text,
    address_line_2 text,
    city text,
    state text,
    zipcode text,
    capabilities_narrative text,
    capabilities_statement_url text,
    sba_profile_url text,
    source text,
    source_imported_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    capability_narrative text,
    capability_keywords text[] DEFAULT '{}'::text[],
    poc_name text,
    poc_email text,
    poc_phone text,
    year_established integer,
    employee_count integer,
    annual_revenue numeric,
    is_veteran_owned boolean DEFAULT false
);


--
--
-- Name: TABLE tribal_contractors; Type: COMMENT; Schema: public
--

--

COMMENT ON TABLE public.tribal_contractors IS 'SBA-certified (8(a), HUBZone, WOSB, SDVOSB) small businesses curated for teaming suggestions. ~900 rows seeded from GovCon Giants tribal list (Apr 2026).';


--
--
-- Name: COLUMN tribal_contractors.small_naics_codes; Type: COMMENT; Schema: public
--

--

COMMENT ON COLUMN public.tribal_contractors.small_naics_codes IS 'Subset of all_naics_codes that qualify under SBA size standards.';


--
--
-- Name: COLUMN tribal_contractors.certifications; Type: COMMENT; Schema: public
--

--

COMMENT ON COLUMN public.tribal_contractors.certifications IS 'Parsed certifications: 8(a), HUBZone, WOSB, EDWOSB, VOSB, SDVOSB, 8(a) JV.';


--
--
-- Name: labor_rates id; Type: DEFAULT; Schema: public
--

--

ALTER TABLE ONLY public.labor_rates ALTER COLUMN id SET DEFAULT nextval('public.labor_rates_id_seq'::regclass);


--
--
-- Name: agency_forecast_changes agency_forecast_changes_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.agency_forecast_changes
    ADD CONSTRAINT agency_forecast_changes_pkey PRIMARY KEY (id);


--
--
-- Name: agency_forecast_sources agency_forecast_sources_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.agency_forecast_sources
    ADD CONSTRAINT agency_forecast_sources_pkey PRIMARY KEY (id);


--
--
-- Name: agency_forecast_sources agency_forecast_sources_url_key; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.agency_forecast_sources
    ADD CONSTRAINT agency_forecast_sources_url_key UNIQUE (url);


--
--
-- Name: agency_spend_forecast agency_spend_forecast_agency_name_fiscal_year_fiscal_period_key; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.agency_spend_forecast
    ADD CONSTRAINT agency_spend_forecast_agency_name_fiscal_year_fiscal_period_key UNIQUE (agency_name, fiscal_year, fiscal_period);


--
--
-- Name: agency_spend_forecast agency_spend_forecast_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.agency_spend_forecast
    ADD CONSTRAINT agency_spend_forecast_pkey PRIMARY KEY (id);


--
--
-- Name: bid_protests bid_protests_docket_number_key; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.bid_protests
    ADD CONSTRAINT bid_protests_docket_number_key UNIQUE (docket_number);


--
--
-- Name: bid_protests bid_protests_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.bid_protests
    ADD CONSTRAINT bid_protests_pkey PRIMARY KEY (id);


--
--
-- Name: company_analyses company_analyses_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.company_analyses
    ADD CONSTRAINT company_analyses_pkey PRIMARY KEY (id);


--
--
-- Name: daily_dod_awards daily_dod_awards_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.daily_dod_awards
    ADD CONSTRAINT daily_dod_awards_pkey PRIMARY KEY (id);


--
--
-- Name: far_clauses_cache far_clauses_cache_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.far_clauses_cache
    ADD CONSTRAINT far_clauses_cache_pkey PRIMARY KEY (clause_id);


--
--
-- Name: federal_hierarchy federal_hierarchy_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.federal_hierarchy
    ADD CONSTRAINT federal_hierarchy_pkey PRIMARY KEY (fh_id);


--
--
-- Name: fpds_awards fpds_awards_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.fpds_awards
    ADD CONSTRAINT fpds_awards_pkey PRIMARY KEY (id);


--
--
-- Name: gov_keywords gov_keywords_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.gov_keywords
    ADD CONSTRAINT gov_keywords_pkey PRIMARY KEY (keyword);


--
--
-- Name: labor_rates labor_rates_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.labor_rates
    ADD CONSTRAINT labor_rates_pkey PRIMARY KEY (id);


--
--
-- Name: market_watch_searches market_watch_searches_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.market_watch_searches
    ADD CONSTRAINT market_watch_searches_pkey PRIMARY KEY (id);


--
--
-- Name: naics_market_stats naics_market_stats_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.naics_market_stats
    ADD CONSTRAINT naics_market_stats_pkey PRIMARY KEY (naics_code);


--
--
-- Name: prime_sblos prime_sblos_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.prime_sblos
    ADD CONSTRAINT prime_sblos_pkey PRIMARY KEY (id);


--
--
-- Name: tribal_contractors tribal_contractors_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.tribal_contractors
    ADD CONSTRAINT tribal_contractors_pkey PRIMARY KEY (uei);


--
--
-- Name: idx_agency_spend_forecast_fy; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_agency_spend_forecast_fy ON public.agency_spend_forecast USING btree (fiscal_year);


--
--
-- Name: idx_agency_spend_forecast_naics_gin; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_agency_spend_forecast_naics_gin ON public.agency_spend_forecast USING gin (hot_naics);


--
--
-- Name: idx_company_analyses_created; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_company_analyses_created ON public.company_analyses USING btree (created_at DESC);


--
--
-- Name: idx_company_analyses_status; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_company_analyses_status ON public.company_analyses USING btree (status);


--
--
-- Name: idx_company_analyses_website; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_company_analyses_website ON public.company_analyses USING btree (website);


--
--
-- Name: idx_dod_awards_agency; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_dod_awards_agency ON public.daily_dod_awards USING btree (agency);


--
--
-- Name: idx_dod_awards_contractor; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_dod_awards_contractor ON public.daily_dod_awards USING btree (contractor_uei) WHERE (contractor_uei IS NOT NULL);


--
--
-- Name: idx_dod_awards_date; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_dod_awards_date ON public.daily_dod_awards USING btree (announcement_date DESC);


--
--
-- Name: idx_fh_agency; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_fh_agency ON public.federal_hierarchy USING btree (agency_code) WHERE (agency_code IS NOT NULL);


--
--
-- Name: idx_fh_fpds; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_fh_fpds ON public.federal_hierarchy USING btree (fpds_code) WHERE (fpds_code IS NOT NULL);


--
--
-- Name: idx_fh_parent; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_fh_parent ON public.federal_hierarchy USING btree (parent_fh_id);


--
--
-- Name: idx_forecast_changes_naics_gin; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_forecast_changes_naics_gin ON public.agency_forecast_changes USING gin (naics_detected);


--
--
-- Name: idx_forecast_changes_source; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_forecast_changes_source ON public.agency_forecast_changes USING btree (source_id, detected_at DESC);


--
--
-- Name: idx_forecast_sources_agency; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_forecast_sources_agency ON public.agency_forecast_sources USING btree (agency);


--
--
-- Name: idx_fpds_agency_naics; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_fpds_agency_naics ON public.fpds_awards USING btree (awarding_agency, naics_code);


--
--
-- Name: idx_fpds_signed_date; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_fpds_signed_date ON public.fpds_awards USING btree (signed_date DESC);


--
--
-- Name: idx_fpds_uei; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_fpds_uei ON public.fpds_awards USING btree (contractor_uei);


--
--
-- Name: idx_fpds_uei_mod; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_fpds_uei_mod ON public.fpds_awards USING btree (contractor_uei) WHERE (is_modification = true);


--
--
-- Name: idx_fpds_uei_term; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_fpds_uei_term ON public.fpds_awards USING btree (contractor_uei) WHERE (is_termination = true);


--
--
-- Name: idx_gov_keywords_added_by; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_gov_keywords_added_by ON public.gov_keywords USING btree (added_by_user_id) WHERE (added_by_user_id IS NOT NULL);


--
--
-- Name: idx_gov_keywords_aliases; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_gov_keywords_aliases ON public.gov_keywords USING gin (aliases);


--
--
-- Name: idx_gov_keywords_category; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_gov_keywords_category ON public.gov_keywords USING btree (category);


--
--
-- Name: idx_gov_keywords_frequency; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_gov_keywords_frequency ON public.gov_keywords USING btree (frequency DESC);


--
--
-- Name: idx_labor_rates_category; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_labor_rates_category ON public.labor_rates USING gin (to_tsvector('english'::regconfig, labor_category));


--
--
-- Name: idx_labor_rates_education; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_labor_rates_education ON public.labor_rates USING btree (education_level);


--
--
-- Name: idx_labor_rates_rate; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_labor_rates_rate ON public.labor_rates USING btree (hourly_rate_current);


--
--
-- Name: idx_market_watch_user; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_market_watch_user ON public.market_watch_searches USING btree (user_profile_id) WHERE (active = true);


--
--
-- Name: idx_naics_market_stats_refresh; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_naics_market_stats_refresh ON public.naics_market_stats USING btree (refresh_after);


--
--
-- Name: idx_prime_sblos_agency_scope; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_prime_sblos_agency_scope ON public.prime_sblos USING btree (agency_scope);


--
--
-- Name: idx_prime_sblos_prime_company; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_prime_sblos_prime_company ON public.prime_sblos USING btree (prime_company);


--
--
-- Name: idx_protests_agency; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_protests_agency ON public.bid_protests USING btree (agency);


--
--
-- Name: idx_protests_date; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_protests_date ON public.bid_protests USING btree (decision_date DESC);


--
--
-- Name: idx_protests_outcome; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_protests_outcome ON public.bid_protests USING btree (outcome);


--
--
-- Name: idx_protests_uei; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_protests_uei ON public.bid_protests USING btree (related_uei) WHERE (related_uei IS NOT NULL);


--
--
-- Name: idx_tc_keywords_gin; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_tc_keywords_gin ON public.tribal_contractors USING gin (capability_keywords);


--
--
-- Name: idx_tc_source; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_tc_source ON public.tribal_contractors USING btree (source);


--
--
-- Name: idx_tc_veteran; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_tc_veteran ON public.tribal_contractors USING btree (is_veteran_owned) WHERE (is_veteran_owned = true);


--
--
-- Name: idx_tribal_contractors_certs_gin; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_tribal_contractors_certs_gin ON public.tribal_contractors USING gin (certifications);


--
--
-- Name: idx_tribal_contractors_naics_gin; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_tribal_contractors_naics_gin ON public.tribal_contractors USING gin (all_naics_codes);


--
--
-- Name: idx_tribal_contractors_primary_naics; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_tribal_contractors_primary_naics ON public.tribal_contractors USING btree (primary_naics_code);


--
--
-- Name: idx_tribal_contractors_state; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_tribal_contractors_state ON public.tribal_contractors USING btree (state);


--
--
-- Name: uq_fpds_natural; Type: INDEX; Schema: public
--

--

CREATE UNIQUE INDEX uq_fpds_natural ON public.fpds_awards USING btree (piid, COALESCE(referenced_idv, ''::text), COALESCE(modification_number, ''::text));


--
--
-- Name: agency_forecast_changes agency_forecast_changes_source_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.agency_forecast_changes
    ADD CONSTRAINT agency_forecast_changes_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.agency_forecast_sources(id) ON DELETE CASCADE;


--
--
-- Name: gov_keywords gov_keywords_added_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.gov_keywords
    ADD CONSTRAINT gov_keywords_added_by_user_id_fkey FOREIGN KEY (added_by_user_id) REFERENCES auth.users(id);


--
--
-- Name: market_watch_searches market_watch_searches_user_profile_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.market_watch_searches
    ADD CONSTRAINT market_watch_searches_user_profile_id_fkey FOREIGN KEY (user_profile_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;


--
--
-- Name: company_analyses Allow anonymous insert on company_analyses; Type: POLICY; Schema: public
--

--

CREATE POLICY "Allow anonymous insert on company_analyses" ON public.company_analyses FOR INSERT TO authenticated, anon WITH CHECK (true);


--
--
-- Name: company_analyses Allow service role full access on company_analyses; Type: POLICY; Schema: public
--

--

CREATE POLICY "Allow service role full access on company_analyses" ON public.company_analyses TO service_role USING (true) WITH CHECK (true);


--
--
-- Name: agency_forecast_changes; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.agency_forecast_changes ENABLE ROW LEVEL SECURITY;

--
--
-- Name: agency_forecast_sources; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.agency_forecast_sources ENABLE ROW LEVEL SECURITY;

--
--
-- Name: agency_spend_forecast; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.agency_spend_forecast ENABLE ROW LEVEL SECURITY;

--
--
-- Name: agency_spend_forecast agency_spend_forecast_select; Type: POLICY; Schema: public
--

--

CREATE POLICY agency_spend_forecast_select ON public.agency_spend_forecast FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
--
-- Name: agency_spend_forecast agency_spend_forecast_service_write; Type: POLICY; Schema: public
--

--

CREATE POLICY agency_spend_forecast_service_write ON public.agency_spend_forecast USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
--
-- Name: bid_protests; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.bid_protests ENABLE ROW LEVEL SECURITY;

--
--
-- Name: agency_forecast_changes changes_read; Type: POLICY; Schema: public
--

--

CREATE POLICY changes_read ON public.agency_forecast_changes FOR SELECT USING (true);


--
--
-- Name: company_analyses; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.company_analyses ENABLE ROW LEVEL SECURITY;

--
--
-- Name: daily_dod_awards; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.daily_dod_awards ENABLE ROW LEVEL SECURITY;

--
--
-- Name: daily_dod_awards dod_awards_read; Type: POLICY; Schema: public
--

--

CREATE POLICY dod_awards_read ON public.daily_dod_awards FOR SELECT USING (true);


--
--
-- Name: far_clauses_cache; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.far_clauses_cache ENABLE ROW LEVEL SECURITY;

--
--
-- Name: far_clauses_cache far_read; Type: POLICY; Schema: public
--

--

CREATE POLICY far_read ON public.far_clauses_cache FOR SELECT USING (true);


--
--
-- Name: federal_hierarchy; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.federal_hierarchy ENABLE ROW LEVEL SECURITY;

--
--
-- Name: federal_hierarchy fh_read; Type: POLICY; Schema: public
--

--

CREATE POLICY fh_read ON public.federal_hierarchy FOR SELECT USING (true);


--
--
-- Name: fpds_awards; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.fpds_awards ENABLE ROW LEVEL SECURITY;

--
--
-- Name: fpds_awards fpds_read; Type: POLICY; Schema: public
--

--

CREATE POLICY fpds_read ON public.fpds_awards FOR SELECT USING (true);


--
--
-- Name: gov_keywords; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.gov_keywords ENABLE ROW LEVEL SECURITY;

--
--
-- Name: gov_keywords gov_keywords read; Type: POLICY; Schema: public
--

--

CREATE POLICY "gov_keywords read" ON public.gov_keywords FOR SELECT TO authenticated USING (true);


--
--
-- Name: gov_keywords gov_keywords user insert; Type: POLICY; Schema: public
--

--

CREATE POLICY "gov_keywords user insert" ON public.gov_keywords FOR INSERT TO authenticated WITH CHECK ((source = 'user'::text));


--
--
-- Name: gov_keywords gov_keywords user update; Type: POLICY; Schema: public
--

--

CREATE POLICY "gov_keywords user update" ON public.gov_keywords FOR UPDATE TO authenticated USING ((source = 'user'::text)) WITH CHECK ((source = 'user'::text));


--
--
-- Name: labor_rates; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.labor_rates ENABLE ROW LEVEL SECURITY;

--
--
-- Name: labor_rates labor_rates_read; Type: POLICY; Schema: public
--

--

CREATE POLICY labor_rates_read ON public.labor_rates FOR SELECT USING (true);


--
--
-- Name: market_watch_searches market_watch_owner; Type: POLICY; Schema: public
--

--

CREATE POLICY market_watch_owner ON public.market_watch_searches USING ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: market_watch_searches; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.market_watch_searches ENABLE ROW LEVEL SECURITY;

--
--
-- Name: naics_market_stats; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.naics_market_stats ENABLE ROW LEVEL SECURITY;

--
--
-- Name: naics_market_stats naics_market_stats read; Type: POLICY; Schema: public
--

--

CREATE POLICY "naics_market_stats read" ON public.naics_market_stats FOR SELECT TO authenticated USING (true);


--
--
-- Name: prime_sblos; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.prime_sblos ENABLE ROW LEVEL SECURITY;

--
--
-- Name: prime_sblos prime_sblos_select; Type: POLICY; Schema: public
--

--

CREATE POLICY prime_sblos_select ON public.prime_sblos FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
--
-- Name: prime_sblos prime_sblos_service_write; Type: POLICY; Schema: public
--

--

CREATE POLICY prime_sblos_service_write ON public.prime_sblos USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
--
-- Name: bid_protests protests_read; Type: POLICY; Schema: public
--

--

CREATE POLICY protests_read ON public.bid_protests FOR SELECT USING (true);


--
--
-- Name: agency_forecast_sources sources_read; Type: POLICY; Schema: public
--

--

CREATE POLICY sources_read ON public.agency_forecast_sources FOR SELECT USING (true);


--
--
-- Name: tribal_contractors; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.tribal_contractors ENABLE ROW LEVEL SECURITY;

--
--
-- Name: tribal_contractors tribal_contractors_select; Type: POLICY; Schema: public
--

--

CREATE POLICY tribal_contractors_select ON public.tribal_contractors FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
--
-- Name: tribal_contractors tribal_contractors_service_write; Type: POLICY; Schema: public
--

--

CREATE POLICY tribal_contractors_service_write ON public.tribal_contractors USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--