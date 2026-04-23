-- Core schema — foundation tables, enums, trigger functions
-- Reference data, user auth, core opportunity/contractor/match tables
-- Generated from live_schema.sql (pg_dump v17.6) on 2026-04-22
-- DO NOT EDIT directly: regenerate via tools/28_split_schema_bootstrap.mjs if schema changes.

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET search_path = public, extensions, pg_catalog;

-- Extensions required for defaults like uuid_generate_v4() and GIN indexes
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS btree_gin WITH SCHEMA extensions;

--
-- Name: opportunity_status; Type: TYPE; Schema: public
--

--

CREATE TYPE public.opportunity_status AS ENUM (
    'SEARCH_SEED',
    'DISCOVERED',
    'QUALIFIED',
    'ACTIVE',
    'EXPIRING_SOON',
    'MARKET_RESEARCH',
    'INTELLIGENCE',
    'EXPIRED',
    'AWARDED',
    'ARCHIVED',
    'DELETED'
);


--
--
-- Name: sba_certification_type; Type: TYPE; Schema: public
--

--

CREATE TYPE public.sba_certification_type AS ENUM (
    'SBA',
    'SDB',
    'WOSB',
    'EDWOSB',
    'VOSB',
    'SDVOSB',
    '8A',
    'HUBZone',
    'MINORITY',
    'NATIVE'
);


--
--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public
--

--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


--
--
-- Name: sync_is_archived_from_status(); Type: FUNCTION; Schema: public
--

--

CREATE FUNCTION public.sync_is_archived_from_status() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.is_archived := NEW.status IN ('ARCHIVED', 'DELETED', 'EXPIRED');
    NEW.status_changed_at := now();
    RETURN NEW;
END;
$$;


--
--
-- Name: sync_status_from_archived(); Type: FUNCTION; Schema: public
--

--

CREATE FUNCTION public.sync_status_from_archived() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.is_archived = true AND OLD.is_archived = false THEN
        IF NEW.status NOT IN ('ARCHIVED', 'DELETED', 'EXPIRED', 'AWARDED', 'INTELLIGENCE') THEN
            NEW.status := 'ARCHIVED';
        END IF;
    END IF;
    IF NEW.is_archived = false AND OLD.is_archived = true THEN
        IF NEW.status IN ('ARCHIVED', 'DELETED', 'EXPIRED') THEN
            NEW.status := 'ACTIVE';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;


--
--
-- Name: agencies; Type: TABLE; Schema: public
--

--

CREATE TABLE public.agencies (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    department character varying(255),
    sub_tier character varying(255),
    office character varying(255),
    cgac character varying(50),
    fpds_code character varying(50),
    aac_code character varying(50),
    organization_type character varying(100)
);


--
--
-- Name: agency_intelligence_logs; Type: TABLE; Schema: public
--

--

CREATE TABLE public.agency_intelligence_logs (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    week_start date NOT NULL,
    top_naics jsonb,
    top_agencies jsonb,
    certification_performance jsonb,
    win_rate_by_score_band jsonb,
    competition_trends jsonb,
    generated_at timestamp with time zone DEFAULT now()
);


--
--
-- Name: archive_types; Type: TABLE; Schema: public
--

--

CREATE TABLE public.archive_types (
    id integer NOT NULL,
    name character varying(100) NOT NULL
);


--
--
-- Name: archive_types_id_seq; Type: SEQUENCE; Schema: public
--

--

CREATE SEQUENCE public.archive_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
--
-- Name: archive_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public
--

--

ALTER SEQUENCE public.archive_types_id_seq OWNED BY public.archive_types.id;


--
--
-- Name: capture_outcomes; Type: TABLE; Schema: public
--

--

CREATE TABLE public.capture_outcomes (
    opportunity_id uuid NOT NULL,
    contractor_id uuid NOT NULL,
    submitted boolean DEFAULT false,
    won boolean DEFAULT false,
    loss_reason text,
    bid_hours_spent numeric,
    margin_estimate numeric,
    internal_notes text,
    closed_date timestamp with time zone,
    status character varying(50) DEFAULT 'Identified'::character varying,
    call_status text,
    follow_up_date timestamp with time zone,
    sales_notes text
);


--
--
-- Name: contacts; Type: TABLE; Schema: public
--

--

CREATE TABLE public.contacts (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    notice_id character varying(255),
    is_primary boolean DEFAULT false,
    title character varying(255),
    fullname character varying(255),
    email character varying(255),
    phone character varying(100),
    fax character varying(100)
);


--
--
-- Name: contractor_contacts; Type: TABLE; Schema: public
--

--

CREATE TABLE public.contractor_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contractor_id uuid NOT NULL,
    full_name text,
    title text,
    email text,
    phone text,
    linkedin_url text,
    source text NOT NULL,
    confidence text DEFAULT 'medium'::text,
    verified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT contractor_contacts_confidence_check CHECK ((confidence = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text]))),
    CONSTRAINT contractor_contacts_source_check CHECK ((source = ANY (ARRAY['apollo'::text, 'website_scrape'::text, 'google_business'::text, 'sam_poc'::text, 'manual'::text])))
);


--
--
-- Name: contractors; Type: TABLE; Schema: public
--

--

CREATE TABLE public.contractors (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_name text NOT NULL,
    uei text,
    cage_code text,
    naics_codes text[],
    certifications text[],
    state text,
    company_size_bracket text,
    website text,
    email text,
    phone text,
    sam_registered boolean DEFAULT false,
    last_activity_date timestamp with time zone,
    raw_json jsonb,
    created_at timestamp with time zone DEFAULT now(),
    is_sam_registered boolean DEFAULT true,
    dba_name text,
    address_line_1 text,
    address_line_2 text,
    city text,
    zip_code character varying(20),
    country_code character varying(3),
    business_url text,
    activation_date date,
    expiration_date date,
    primary_poc_name text,
    primary_poc_email text,
    primary_poc_phone character varying(50),
    secondary_poc_name text,
    secondary_poc_email text,
    secondary_poc_phone character varying(50),
    sba_certifications text[],
    psc_codes text[],
    fts tsvector GENERATED ALWAYS AS (to_tsvector('english'::regconfig, ((((((COALESCE(company_name, ''::text) || ' '::text) || COALESCE(dba_name, ''::text)) || ' '::text) || COALESCE(city, ''::text)) || ' '::text) || COALESCE(state, ''::text)))) STORED,
    data_quality_flag character varying DEFAULT 'OK'::character varying,
    employee_count integer,
    revenue numeric,
    federal_awards_count integer,
    total_award_volume numeric,
    last_award_date timestamp with time zone,
    bonded_mentioned boolean DEFAULT false,
    municipal_experience boolean DEFAULT false,
    owner_linkedin text,
    company_linkedin text,
    latitude numeric,
    longitude numeric,
    service_radius_miles numeric DEFAULT 50,
    sam_registration_date timestamp with time zone,
    total_federal_awards numeric DEFAULT 0,
    federal_activity_status text,
    capacity_signals jsonb DEFAULT '{}'::jsonb,
    ownership jsonb DEFAULT '{}'::jsonb,
    main_phone text,
    direct_phone text,
    hq_address text,
    is_manually_edited boolean DEFAULT false,
    google_rating numeric,
    google_reviews_count integer,
    google_place_id text,
    social_facebook text,
    social_linkedin text,
    social_twitter text,
    enrichment_source text,
    last_enriched_at timestamp with time zone,
    apollo_enriched boolean DEFAULT false,
    primary_poc_title text,
    years_in_business integer,
    agency_relationships jsonb DEFAULT '[]'::jsonb,
    naics_awards jsonb DEFAULT '[]'::jsonb,
    last_usaspending_refresh timestamp with time zone
);


--
--
-- Name: COLUMN contractors.agency_relationships; Type: COMMENT; Schema: public
--

--

COMMENT ON COLUMN public.contractors.agency_relationships IS 'Top 10 awarding agencies for this recipient, shape [{name, amount, count}]. Populated by USASpending nightly cron.';


--
--
-- Name: COLUMN contractors.naics_awards; Type: COMMENT; Schema: public
--

--

COMMENT ON COLUMN public.contractors.naics_awards IS 'Top 10 NAICS codes where this recipient has won awards, shape [{code, description, amount, count}]. Populated by USASpending nightly cron.';


--
--
-- Name: COLUMN contractors.last_usaspending_refresh; Type: COMMENT; Schema: public
--

--

COMMENT ON COLUMN public.contractors.last_usaspending_refresh IS 'Timestamp of the last USASpending refresh for this contractor. Rows older than 14 days are re-fetched on demand; cron fills in the long tail.';


--
--
-- Name: enrichment_jobs; Type: TABLE; Schema: public
--

--

CREATE TABLE public.enrichment_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    opportunity_id uuid NOT NULL,
    trigger_type text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    contractors_found integer DEFAULT 0,
    contractors_enriched integer DEFAULT 0,
    error_log jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT enrichment_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text]))),
    CONSTRAINT enrichment_jobs_trigger_type_check CHECK ((trigger_type = ANY (ARRAY['auto'::text, 'manual'::text])))
);


--
--
-- Name: matches; Type: TABLE; Schema: public
--

--

CREATE TABLE public.matches (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    opportunity_id uuid NOT NULL,
    contractor_id uuid NOT NULL,
    score numeric,
    classification text,
    score_breakdown jsonb,
    created_at timestamp with time zone DEFAULT now(),
    pwin_score integer,
    naics_match boolean DEFAULT false,
    keyword_match_count integer DEFAULT 0,
    set_aside_aligned boolean DEFAULT false,
    agency_history_aligned boolean DEFAULT false,
    status character varying(50) DEFAULT 'Identified'::character varying,
    distance_miles numeric,
    CONSTRAINT matches_classification_check CHECK ((classification = ANY (ARRAY['HOT'::text, 'WARM'::text, 'COLD'::text]))),
    CONSTRAINT matches_pwin_score_check CHECK (((pwin_score >= 0) AND (pwin_score <= 100))),
    CONSTRAINT matches_status_check CHECK (((status)::text = ANY ((ARRAY['Identified'::character varying, 'Qualified'::character varying, 'Capture'::character varying, 'Proposed'::character varying, 'Won'::character varying, 'Lost'::character varying, 'Archived'::character varying])::text[])))
);


--
--
-- Name: naics_codes; Type: TABLE; Schema: public
--

--

CREATE TABLE public.naics_codes (
    code character varying(10) NOT NULL,
    industry_title text
);


--
--
-- Name: opportunities; Type: TABLE; Schema: public
--

--

CREATE TABLE public.opportunities (
    notice_id character varying(255) NOT NULL,
    title text NOT NULL,
    solicitation_number character varying(255),
    posted_date timestamp with time zone,
    response_deadline timestamp with time zone,
    naics_code character varying(10),
    psc_code character varying(10),
    award_amount numeric,
    award_date timestamp with time zone,
    award_number character varying(255),
    awardee text,
    description text,
    link text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    fts tsvector GENERATED ALWAYS AS (to_tsvector('english'::regconfig, ((COALESCE(title, ''::text) || ' '::text) || COALESCE(description, ''::text)))) STORED,
    place_of_performance_city text,
    place_of_performance_state text,
    place_of_performance_zip text,
    structured_requirements jsonb DEFAULT '{}'::jsonb,
    strategic_scoring jsonb DEFAULT '{}'::jsonb,
    ai_win_strategy jsonb DEFAULT '{}'::jsonb,
    raw_json jsonb DEFAULT '{}'::jsonb,
    resource_links jsonb DEFAULT '[]'::jsonb,
    agency text,
    department text,
    organization_code text,
    notice_type text,
    set_aside_code text,
    id uuid DEFAULT extensions.uuid_generate_v4(),
    is_archived boolean DEFAULT false,
    attachment_urls jsonb DEFAULT '[]'::jsonb,
    incumbent_contractor_uei text,
    incumbent_contractor_name text,
    status text DEFAULT 'DISCOVERED'::text,
    sub_agency text,
    office text,
    estimated_value numeric,
    follow_on_flag boolean DEFAULT false,
    sources_sought_flag boolean DEFAULT false,
    veteran_relevance_flag boolean DEFAULT false,
    small_business_relevance_flag boolean DEFAULT false,
    opportunity_score integer DEFAULT 0,
    related_notice_id text,
    retention_protected boolean DEFAULT false,
    retention_reason text,
    last_crawled_at timestamp with time zone DEFAULT now(),
    status_changed_at timestamp with time zone DEFAULT now(),
    wosb_relevance_flag boolean DEFAULT false,
    attachments_cached_until timestamp with time zone
);


--
--
-- Name: opportunity_attachments; Type: TABLE; Schema: public
--

--

CREATE TABLE public.opportunity_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    opportunity_id uuid NOT NULL,
    filename text,
    file_url text,
    file_type text,
    file_size_bytes integer,
    extracted_text text,
    requirements_extracted jsonb DEFAULT '{}'::jsonb,
    downloaded_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
--
-- Name: opportunity_contractors; Type: TABLE; Schema: public
--

--

CREATE TABLE public.opportunity_contractors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    opportunity_id uuid NOT NULL,
    contractor_id uuid NOT NULL,
    enrichment_job_id uuid,
    discovery_source text NOT NULL,
    enrichment_status text DEFAULT 'discovered'::text NOT NULL,
    contact_readiness_score integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT opportunity_contractors_contact_readiness_score_check CHECK (((contact_readiness_score >= 0) AND (contact_readiness_score <= 100))),
    CONSTRAINT opportunity_contractors_discovery_source_check CHECK ((discovery_source = ANY (ARRAY['sam_entity'::text, 'google_local'::text, 'existing_match'::text]))),
    CONSTRAINT opportunity_contractors_enrichment_status_check CHECK ((enrichment_status = ANY (ARRAY['discovered'::text, 'enriching'::text, 'enriched'::text, 'failed'::text])))
);


--
--
-- Name: opportunity_types; Type: TABLE; Schema: public
--

--

CREATE TABLE public.opportunity_types (
    id integer NOT NULL,
    name character varying(255) NOT NULL
);


--
--
-- Name: opportunity_types_id_seq; Type: SEQUENCE; Schema: public
--

--

CREATE SEQUENCE public.opportunity_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
--
-- Name: opportunity_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public
--

--

ALTER SEQUENCE public.opportunity_types_id_seq OWNED BY public.opportunity_types.id;


--
--
-- Name: psc_codes; Type: TABLE; Schema: public
--

--

CREATE TABLE public.psc_codes (
    code character varying(10) NOT NULL,
    description text
);


--
--
-- Name: service_requests; Type: TABLE; Schema: public
--

--

CREATE TABLE public.service_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_profile_id uuid NOT NULL,
    service_type text NOT NULL,
    opportunity_id uuid,
    status text DEFAULT 'new'::text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT service_requests_status_check CHECK ((status = ANY (ARRAY['new'::text, 'contacted'::text, 'in_progress'::text, 'completed'::text, 'declined'::text])))
);


--
--
-- Name: set_asides; Type: TABLE; Schema: public
--

--

CREATE TABLE public.set_asides (
    id integer NOT NULL,
    code character varying(50) NOT NULL,
    description text
);


--
--
-- Name: set_asides_id_seq; Type: SEQUENCE; Schema: public
--

--

CREATE SEQUENCE public.set_asides_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
--
-- Name: set_asides_id_seq; Type: SEQUENCE OWNED BY; Schema: public
--

--

ALTER SEQUENCE public.set_asides_id_seq OWNED BY public.set_asides.id;


--
--
-- Name: user_action_items; Type: TABLE; Schema: public
--

--

CREATE TABLE public.user_action_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_profile_id uuid NOT NULL,
    opportunity_id uuid,
    title text NOT NULL,
    description text,
    category text NOT NULL,
    priority text DEFAULT 'medium'::text,
    status text DEFAULT 'pending'::text,
    due_date date,
    upsell_cta text,
    upsell_service text,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT user_action_items_category_check CHECK ((category = ANY (ARRAY['research'::text, 'document'::text, 'outreach'::text, 'compliance'::text, 'teaming'::text]))),
    CONSTRAINT user_action_items_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text]))),
    CONSTRAINT user_action_items_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text, 'skipped'::text])))
);


--
--
-- Name: user_matches; Type: TABLE; Schema: public
--

--

CREATE TABLE public.user_matches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_profile_id uuid NOT NULL,
    opportunity_id uuid NOT NULL,
    score numeric NOT NULL,
    classification text NOT NULL,
    score_breakdown jsonb,
    is_saved boolean DEFAULT false,
    is_dismissed boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT user_matches_classification_check CHECK ((classification = ANY (ARRAY['HOT'::text, 'WARM'::text, 'COLD'::text])))
);


--
--
-- Name: user_notifications; Type: TABLE; Schema: public
--

--

CREATE TABLE public.user_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_profile_id uuid NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    body text,
    metadata jsonb,
    is_read boolean DEFAULT false,
    sent_via text[] DEFAULT '{}'::text[],
    created_at timestamp with time zone DEFAULT now(),
    email_sent boolean DEFAULT false,
    email_sent_at timestamp with time zone,
    CONSTRAINT user_notifications_type_check CHECK ((type = ANY (ARRAY['new_matches'::text, 'deadline_reminder'::text, 'action_due'::text, 'system'::text])))
);


--
--
-- Name: user_profiles; Type: TABLE; Schema: public
--

--

CREATE TABLE public.user_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    auth_user_id uuid NOT NULL,
    company_name text NOT NULL,
    dba_name text,
    uei text,
    cage_code text,
    address_line_1 text,
    city text,
    state text,
    zip_code text,
    website text,
    phone text,
    email text,
    naics_codes text[] DEFAULT '{}'::text[],
    sba_certifications text[] DEFAULT '{}'::text[],
    employee_count integer,
    revenue numeric,
    years_in_business integer,
    service_radius_miles integer DEFAULT 50,
    has_bonding boolean DEFAULT false,
    has_fleet boolean DEFAULT false,
    has_municipal_exp boolean DEFAULT false,
    federal_awards_count integer DEFAULT 0,
    target_contract_types text[] DEFAULT '{}'::text[],
    target_states text[] DEFAULT '{}'::text[],
    onboarding_complete boolean DEFAULT false,
    plan_tier text DEFAULT 'free_beta'::text,
    notification_preferences jsonb DEFAULT '{"email": true, "frequency": "daily"}'::jsonb,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    target_psc_codes text[] DEFAULT '{}'::text[],
    preferred_agencies text[] DEFAULT '{}'::text[],
    contract_value_min numeric,
    contract_value_max numeric,
    security_clearances text[] DEFAULT '{}'::text[],
    prime_or_sub text DEFAULT 'both'::text,
    stripe_customer_id text,
    stripe_subscription_id text,
    trial_ends_at timestamp with time zone,
    subscription_status text DEFAULT 'trialing'::text,
    company_description text,
    analysis_id uuid,
    onboarding_source text DEFAULT 'manual'::text,
    account_type text DEFAULT 'self_service'::text,
    managed_by uuid,
    client_since timestamp with time zone,
    client_status text DEFAULT 'active'::text,
    google_linked boolean DEFAULT false,
    secondary_email text,
    contact_name text,
    contact_phone text,
    notes text,
    capability_statement text,
    capability_statement_html text,
    capability_statement_file_url text,
    capability_statement_file_name text,
    capability_statement_updated_at timestamp with time zone,
    job_title text,
    company_size text,
    annual_revenue_range text,
    has_federal_experience boolean,
    federal_experience_notes text,
    primary_keywords text[] DEFAULT '{}'::text[] NOT NULL,
    secondary_keywords text[] DEFAULT '{}'::text[] NOT NULL,
    is_veteran_owned boolean DEFAULT false NOT NULL,
    veteran_cert_type text,
    veteran_verified_at timestamp with time zone,
    veteran_verified_source text,
    veteran_branch text,
    veteran_discount_code text,
    CONSTRAINT user_profiles_account_type_check CHECK ((account_type = ANY (ARRAY['self_service'::text, 'consulting'::text, 'admin'::text]))),
    CONSTRAINT user_profiles_client_status_check CHECK ((client_status = ANY (ARRAY['active'::text, 'paused'::text, 'churned'::text, 'prospect'::text]))),
    CONSTRAINT user_profiles_company_size_check CHECK ((company_size = ANY (ARRAY['micro'::text, 'small'::text, 'mid'::text, 'large'::text])))
);


--
--
-- Name: COLUMN user_profiles.job_title; Type: COMMENT; Schema: public
--

--

COMMENT ON COLUMN public.user_profiles.job_title IS 'Position/title of the primary contact person (e.g. CEO, Owner, Director). Collected during onboarding.';


--
--
-- Name: COLUMN user_profiles.company_size; Type: COMMENT; Schema: public
--

--

COMMENT ON COLUMN public.user_profiles.company_size IS 'Buckets: micro (1-9), small (10-49), mid (50-249), large (250+). Set in onboarding Step 3.';


--
--
-- Name: COLUMN user_profiles.annual_revenue_range; Type: COMMENT; Schema: public
--

--

COMMENT ON COLUMN public.user_profiles.annual_revenue_range IS 'One of: <1M, 1-5M, 5-25M, 25-100M, 100M+. Stored as label, not a numeric midpoint.';


--
--
-- Name: COLUMN user_profiles.has_federal_experience; Type: COMMENT; Schema: public
--

--

COMMENT ON COLUMN public.user_profiles.has_federal_experience IS 'Has the company ever held a prime federal contract? Distinct from federal_awards_count (which is a numeric tally).';


--
--
-- Name: COLUMN user_profiles.federal_experience_notes; Type: COMMENT; Schema: public
--

--

COMMENT ON COLUMN public.user_profiles.federal_experience_notes IS 'Free-text context on federal experience (e.g. agencies, contract vehicles, notable awards).';


--
--
-- Name: COLUMN user_profiles.primary_keywords; Type: COMMENT; Schema: public
--

--

COMMENT ON COLUMN public.user_profiles.primary_keywords IS 'Up to 3 canonical keywords (gov_keywords.keyword) representing the company''s strongest capability signals. Used by the scorer at full weight.';


--
--
-- Name: COLUMN user_profiles.secondary_keywords; Type: COMMENT; Schema: public
--

--

COMMENT ON COLUMN public.user_profiles.secondary_keywords IS 'Up to 5 canonical keywords (gov_keywords.keyword) for refinement. Used by the scorer at reduced weight (~0.4 of primary).';


--
--
-- Name: COLUMN user_profiles.is_veteran_owned; Type: COMMENT; Schema: public
--

--

COMMENT ON COLUMN public.user_profiles.is_veteran_owned IS 'True if the user qualifies for the 20% veteran discount. Set by SAM verification or self-declaration.';


--
--
-- Name: COLUMN user_profiles.veteran_cert_type; Type: COMMENT; Schema: public
--

--

COMMENT ON COLUMN public.user_profiles.veteran_cert_type IS 'SDVOSB | VOSB | self_declared | manual. Drives the veteran badge shown on billing + dashboard.';


--
--
-- Name: COLUMN user_profiles.veteran_verified_source; Type: COMMENT; Schema: public
--

--

COMMENT ON COLUMN public.user_profiles.veteran_verified_source IS 'sam_entity (verified via SAM), self_declared (user toggled), or admin (granted manually).';


--
--
-- Name: user_pursuits; Type: TABLE; Schema: public
--

--

CREATE TABLE public.user_pursuits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_profile_id uuid NOT NULL,
    opportunity_id uuid NOT NULL,
    stage text DEFAULT 'discovered'::text NOT NULL,
    priority text DEFAULT 'medium'::text,
    notes text,
    stage_changed_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT user_pursuits_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]))),
    CONSTRAINT user_pursuits_stage_check CHECK ((stage = ANY (ARRAY['discovered'::text, 'researching'::text, 'preparing'::text, 'submitted'::text, 'awarded'::text, 'lost'::text, 'no_bid'::text])))
);


--
--
-- Name: archive_types id; Type: DEFAULT; Schema: public
--

--

ALTER TABLE ONLY public.archive_types ALTER COLUMN id SET DEFAULT nextval('public.archive_types_id_seq'::regclass);


--
--
-- Name: opportunity_types id; Type: DEFAULT; Schema: public
--

--

ALTER TABLE ONLY public.opportunity_types ALTER COLUMN id SET DEFAULT nextval('public.opportunity_types_id_seq'::regclass);


--
--
-- Name: set_asides id; Type: DEFAULT; Schema: public
--

--

ALTER TABLE ONLY public.set_asides ALTER COLUMN id SET DEFAULT nextval('public.set_asides_id_seq'::regclass);


--
--
-- Name: agencies agencies_department_sub_tier_office_key; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.agencies
    ADD CONSTRAINT agencies_department_sub_tier_office_key UNIQUE (department, sub_tier, office);


--
--
-- Name: agencies agencies_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.agencies
    ADD CONSTRAINT agencies_pkey PRIMARY KEY (id);


--
--
-- Name: agency_intelligence_logs agency_intelligence_logs_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.agency_intelligence_logs
    ADD CONSTRAINT agency_intelligence_logs_pkey PRIMARY KEY (id);


--
--
-- Name: archive_types archive_types_name_key; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.archive_types
    ADD CONSTRAINT archive_types_name_key UNIQUE (name);


--
--
-- Name: archive_types archive_types_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.archive_types
    ADD CONSTRAINT archive_types_pkey PRIMARY KEY (id);


--
--
-- Name: capture_outcomes capture_outcomes_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.capture_outcomes
    ADD CONSTRAINT capture_outcomes_pkey PRIMARY KEY (opportunity_id, contractor_id);


--
--
-- Name: contacts contacts_notice_id_email_fullname_key; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_notice_id_email_fullname_key UNIQUE (notice_id, email, fullname);


--
--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
--
-- Name: contractor_contacts contractor_contacts_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.contractor_contacts
    ADD CONSTRAINT contractor_contacts_pkey PRIMARY KEY (id);


--
--
-- Name: contractors contractors_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.contractors
    ADD CONSTRAINT contractors_pkey PRIMARY KEY (id);


--
--
-- Name: contractors contractors_uei_key; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.contractors
    ADD CONSTRAINT contractors_uei_key UNIQUE (uei);


--
--
-- Name: enrichment_jobs enrichment_jobs_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.enrichment_jobs
    ADD CONSTRAINT enrichment_jobs_pkey PRIMARY KEY (id);


--
--
-- Name: matches matches_opp_contractor_key; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_opp_contractor_key UNIQUE (opportunity_id, contractor_id);


--
--
-- Name: matches matches_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_pkey PRIMARY KEY (id);


--
--
-- Name: naics_codes naics_codes_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.naics_codes
    ADD CONSTRAINT naics_codes_pkey PRIMARY KEY (code);


--
--
-- Name: opportunities opportunities_id_key; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.opportunities
    ADD CONSTRAINT opportunities_id_key UNIQUE (id);


--
--
-- Name: opportunities opportunities_v2_pkey1; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.opportunities
    ADD CONSTRAINT opportunities_v2_pkey1 PRIMARY KEY (notice_id);


--
--
-- Name: opportunity_attachments opportunity_attachments_opp_filename_unique; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.opportunity_attachments
    ADD CONSTRAINT opportunity_attachments_opp_filename_unique UNIQUE (opportunity_id, filename);


--
--
-- Name: opportunity_attachments opportunity_attachments_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.opportunity_attachments
    ADD CONSTRAINT opportunity_attachments_pkey PRIMARY KEY (id);


--
--
-- Name: opportunity_contractors opportunity_contractors_opportunity_id_contractor_id_key; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.opportunity_contractors
    ADD CONSTRAINT opportunity_contractors_opportunity_id_contractor_id_key UNIQUE (opportunity_id, contractor_id);


--
--
-- Name: opportunity_contractors opportunity_contractors_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.opportunity_contractors
    ADD CONSTRAINT opportunity_contractors_pkey PRIMARY KEY (id);


--
--
-- Name: opportunity_types opportunity_types_name_key; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.opportunity_types
    ADD CONSTRAINT opportunity_types_name_key UNIQUE (name);


--
--
-- Name: opportunity_types opportunity_types_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.opportunity_types
    ADD CONSTRAINT opportunity_types_pkey PRIMARY KEY (id);


--
--
-- Name: psc_codes psc_codes_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.psc_codes
    ADD CONSTRAINT psc_codes_pkey PRIMARY KEY (code);


--
--
-- Name: service_requests service_requests_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_pkey PRIMARY KEY (id);


--
--
-- Name: set_asides set_asides_code_key; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.set_asides
    ADD CONSTRAINT set_asides_code_key UNIQUE (code);


--
--
-- Name: set_asides set_asides_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.set_asides
    ADD CONSTRAINT set_asides_pkey PRIMARY KEY (id);


--
--
-- Name: user_action_items user_action_items_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.user_action_items
    ADD CONSTRAINT user_action_items_pkey PRIMARY KEY (id);


--
--
-- Name: user_matches user_matches_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.user_matches
    ADD CONSTRAINT user_matches_pkey PRIMARY KEY (id);


--
--
-- Name: user_matches user_matches_user_profile_id_opportunity_id_key; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.user_matches
    ADD CONSTRAINT user_matches_user_profile_id_opportunity_id_key UNIQUE (user_profile_id, opportunity_id);


--
--
-- Name: user_notifications user_notifications_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.user_notifications
    ADD CONSTRAINT user_notifications_pkey PRIMARY KEY (id);


--
--
-- Name: user_profiles user_profiles_auth_user_id_key; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_auth_user_id_key UNIQUE (auth_user_id);


--
--
-- Name: user_profiles user_profiles_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (id);


--
--
-- Name: user_pursuits user_pursuits_pkey; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.user_pursuits
    ADD CONSTRAINT user_pursuits_pkey PRIMARY KEY (id);


--
--
-- Name: user_pursuits user_pursuits_user_profile_id_opportunity_id_key; Type: CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.user_pursuits
    ADD CONSTRAINT user_pursuits_user_profile_id_opportunity_id_key UNIQUE (user_profile_id, opportunity_id);


--
--
-- Name: contractors_cage_code_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX contractors_cage_code_idx ON public.contractors USING btree (cage_code);


--
--
-- Name: contractors_expiration_date_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX contractors_expiration_date_idx ON public.contractors USING btree (expiration_date);


--
--
-- Name: contractors_fts_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX contractors_fts_idx ON public.contractors USING gin (fts);


--
--
-- Name: contractors_state_idx; Type: INDEX; Schema: public
--

--

CREATE INDEX contractors_state_idx ON public.contractors USING btree (state);


--
--
-- Name: contractors_uei_idx; Type: INDEX; Schema: public
--

--

CREATE UNIQUE INDEX contractors_uei_idx ON public.contractors USING btree (uei);


--
--
-- Name: idx_contacts_notice_id; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_contacts_notice_id ON public.contacts USING btree (notice_id);


--
--
-- Name: idx_contractor_contacts_contractor; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_contractor_contacts_contractor ON public.contractor_contacts USING btree (contractor_id);


--
--
-- Name: idx_contractor_contacts_source; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_contractor_contacts_source ON public.contractor_contacts USING btree (source);


--
--
-- Name: idx_contractor_contacts_unique; Type: INDEX; Schema: public
--

--

CREATE UNIQUE INDEX idx_contractor_contacts_unique ON public.contractor_contacts USING btree (contractor_id, source, full_name);


--
--
-- Name: idx_contractors_activity; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_contractors_activity ON public.contractors USING btree (federal_activity_status);


--
--
-- Name: idx_contractors_certifications; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_contractors_certifications ON public.contractors USING gin (certifications);


--
--
-- Name: idx_contractors_company_name; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_contractors_company_name ON public.contractors USING btree (company_name);


--
--
-- Name: idx_contractors_last_usaspending_refresh; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_contractors_last_usaspending_refresh ON public.contractors USING btree (last_usaspending_refresh);


--
--
-- Name: idx_contractors_naics_codes; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_contractors_naics_codes ON public.contractors USING gin (naics_codes);


--
--
-- Name: idx_contractors_sam_registered; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_contractors_sam_registered ON public.contractors USING btree (sam_registered);


--
--
-- Name: idx_enrichment_jobs_opportunity; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_enrichment_jobs_opportunity ON public.enrichment_jobs USING btree (opportunity_id);


--
--
-- Name: idx_enrichment_jobs_status; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_enrichment_jobs_status ON public.enrichment_jobs USING btree (status);


--
--
-- Name: idx_matches_classification; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_matches_classification ON public.matches USING btree (classification);


--
--
-- Name: idx_matches_contractor_id; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_matches_contractor_id ON public.matches USING btree (contractor_id);


--
--
-- Name: idx_matches_opp_contractor_unique; Type: INDEX; Schema: public
--

--

CREATE UNIQUE INDEX idx_matches_opp_contractor_unique ON public.matches USING btree (opportunity_id, contractor_id);


--
--
-- Name: idx_matches_opp_id; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_matches_opp_id ON public.matches USING btree (opportunity_id);


--
--
-- Name: idx_matches_score_actual; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_matches_score_actual ON public.matches USING btree (score DESC);


--
--
-- Name: idx_matches_status; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_matches_status ON public.matches USING btree (status);


--
--
-- Name: idx_opp_attachments_opportunity; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_opp_attachments_opportunity ON public.opportunity_attachments USING btree (opportunity_id);


--
--
-- Name: idx_opp_contractors_opportunity; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_opp_contractors_opportunity ON public.opportunity_contractors USING btree (opportunity_id);


--
--
-- Name: idx_opp_contractors_readiness; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_opp_contractors_readiness ON public.opportunity_contractors USING btree (contact_readiness_score DESC);


--
--
-- Name: idx_opp_contractors_status; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_opp_contractors_status ON public.opportunity_contractors USING btree (enrichment_status);


--
--
-- Name: idx_opps_agency; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_opps_agency ON public.opportunities USING btree (agency);


--
--
-- Name: idx_opps_description_type; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_opps_description_type ON public.opportunities USING btree (description) WHERE (description ~~ 'https://api.sam.gov%'::text);


--
--
-- Name: idx_opps_estimated_value; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_opps_estimated_value ON public.opportunities USING btree (estimated_value) WHERE (estimated_value IS NOT NULL);


--
--
-- Name: idx_opps_follow_on; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_opps_follow_on ON public.opportunities USING btree (follow_on_flag) WHERE (follow_on_flag = true);


--
--
-- Name: idx_opps_id_uuid; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_opps_id_uuid ON public.opportunities USING btree (id);


--
--
-- Name: idx_opps_is_archived; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_opps_is_archived ON public.opportunities USING btree (is_archived);


--
--
-- Name: idx_opps_is_archived_posted_date; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_opps_is_archived_posted_date ON public.opportunities USING btree (is_archived, posted_date DESC);


--
--
-- Name: idx_opps_last_crawled; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_opps_last_crawled ON public.opportunities USING btree (last_crawled_at);


--
--
-- Name: idx_opps_notice_type; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_opps_notice_type ON public.opportunities USING btree (notice_type);


--
--
-- Name: idx_opps_place_state; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_opps_place_state ON public.opportunities USING btree (place_of_performance_state);


--
--
-- Name: idx_opps_posted_date; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_opps_posted_date ON public.opportunities USING btree (posted_date DESC);


--
--
-- Name: idx_opps_related_notice; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_opps_related_notice ON public.opportunities USING btree (related_notice_id) WHERE (related_notice_id IS NOT NULL);


--
--
-- Name: idx_opps_retention; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_opps_retention ON public.opportunities USING btree (retention_protected) WHERE (retention_protected = true);


--
--
-- Name: idx_opps_sb_relevance; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_opps_sb_relevance ON public.opportunities USING btree (small_business_relevance_flag) WHERE (small_business_relevance_flag = true);


--
--
-- Name: idx_opps_set_aside_code; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_opps_set_aside_code ON public.opportunities USING btree (set_aside_code);


--
--
-- Name: idx_opps_sources_sought; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_opps_sources_sought ON public.opportunities USING btree (sources_sought_flag) WHERE (sources_sought_flag = true);


--
--
-- Name: idx_opps_status; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_opps_status ON public.opportunities USING btree (status);


--
--
-- Name: idx_opps_status_deadline; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_opps_status_deadline ON public.opportunities USING btree (status, response_deadline);


--
--
-- Name: idx_opps_veteran_relevance; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_opps_veteran_relevance ON public.opportunities USING btree (veteran_relevance_flag) WHERE (veteran_relevance_flag = true);


--
--
-- Name: idx_opps_wosb; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_opps_wosb ON public.opportunities USING btree (wosb_relevance_flag) WHERE (wosb_relevance_flag = true);


--
--
-- Name: idx_user_action_items_profile; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_user_action_items_profile ON public.user_action_items USING btree (user_profile_id);


--
--
-- Name: idx_user_action_items_status; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_user_action_items_status ON public.user_action_items USING btree (status);


--
--
-- Name: idx_user_matches_classification; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_user_matches_classification ON public.user_matches USING btree (classification);


--
--
-- Name: idx_user_matches_dashboard; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_user_matches_dashboard ON public.user_matches USING btree (user_profile_id, classification, is_dismissed, score DESC);


--
--
-- Name: idx_user_matches_dashboard_no_class; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_user_matches_dashboard_no_class ON public.user_matches USING btree (user_profile_id, is_dismissed, score DESC);


--
--
-- Name: idx_user_matches_dismissed; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_user_matches_dismissed ON public.user_matches USING btree (is_dismissed) WHERE (is_dismissed = false);


--
--
-- Name: idx_user_matches_opportunity; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_user_matches_opportunity ON public.user_matches USING btree (opportunity_id);


--
--
-- Name: idx_user_matches_profile; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_user_matches_profile ON public.user_matches USING btree (user_profile_id);


--
--
-- Name: idx_user_matches_saved; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_user_matches_saved ON public.user_matches USING btree (is_saved) WHERE (is_saved = true);


--
--
-- Name: idx_user_matches_score; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_user_matches_score ON public.user_matches USING btree (score DESC);


--
--
-- Name: idx_user_notifications_profile; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_user_notifications_profile ON public.user_notifications USING btree (user_profile_id);


--
--
-- Name: idx_user_notifications_read; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_user_notifications_read ON public.user_notifications USING btree (is_read);


--
--
-- Name: idx_user_profiles_auth_user; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_user_profiles_auth_user ON public.user_profiles USING btree (auth_user_id);


--
--
-- Name: idx_user_profiles_veteran; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_user_profiles_veteran ON public.user_profiles USING btree (is_veteran_owned) WHERE (is_veteran_owned = true);


--
--
-- Name: idx_user_pursuits_opportunity; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_user_pursuits_opportunity ON public.user_pursuits USING btree (opportunity_id);


--
--
-- Name: idx_user_pursuits_profile; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_user_pursuits_profile ON public.user_pursuits USING btree (user_profile_id);


--
--
-- Name: idx_user_pursuits_stage; Type: INDEX; Schema: public
--

--

CREATE INDEX idx_user_pursuits_stage ON public.user_pursuits USING btree (stage);


--
--
-- Name: opportunities trg_sync_is_archived; Type: TRIGGER; Schema: public
--

--

CREATE TRIGGER trg_sync_is_archived BEFORE INSERT OR UPDATE OF status ON public.opportunities FOR EACH ROW EXECUTE FUNCTION public.sync_is_archived_from_status();


--
--
-- Name: opportunities trg_sync_status_from_archived; Type: TRIGGER; Schema: public
--

--

CREATE TRIGGER trg_sync_status_from_archived BEFORE UPDATE OF is_archived ON public.opportunities FOR EACH ROW EXECUTE FUNCTION public.sync_status_from_archived();


--
--
-- Name: capture_outcomes capture_outcomes_contractor_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.capture_outcomes
    ADD CONSTRAINT capture_outcomes_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.contractors(id) ON DELETE CASCADE;


--
--
-- Name: contractor_contacts contractor_contacts_contractor_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.contractor_contacts
    ADD CONSTRAINT contractor_contacts_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.contractors(id) ON DELETE CASCADE;


--
--
-- Name: enrichment_jobs enrichment_jobs_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.enrichment_jobs
    ADD CONSTRAINT enrichment_jobs_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE CASCADE;


--
--
-- Name: matches matches_contractor_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.contractors(id) ON DELETE CASCADE;


--
--
-- Name: opportunities opportunities_v2_naics_code_fkey1; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.opportunities
    ADD CONSTRAINT opportunities_v2_naics_code_fkey1 FOREIGN KEY (naics_code) REFERENCES public.naics_codes(code);


--
--
-- Name: opportunities opportunities_v2_psc_code_fkey1; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.opportunities
    ADD CONSTRAINT opportunities_v2_psc_code_fkey1 FOREIGN KEY (psc_code) REFERENCES public.psc_codes(code);


--
--
-- Name: opportunity_attachments opportunity_attachments_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.opportunity_attachments
    ADD CONSTRAINT opportunity_attachments_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE CASCADE;


--
--
-- Name: opportunity_contractors opportunity_contractors_contractor_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.opportunity_contractors
    ADD CONSTRAINT opportunity_contractors_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.contractors(id) ON DELETE CASCADE;


--
--
-- Name: opportunity_contractors opportunity_contractors_enrichment_job_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.opportunity_contractors
    ADD CONSTRAINT opportunity_contractors_enrichment_job_id_fkey FOREIGN KEY (enrichment_job_id) REFERENCES public.enrichment_jobs(id) ON DELETE SET NULL;


--
--
-- Name: opportunity_contractors opportunity_contractors_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.opportunity_contractors
    ADD CONSTRAINT opportunity_contractors_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE CASCADE;


--
--
-- Name: service_requests service_requests_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE SET NULL;


--
--
-- Name: service_requests service_requests_user_profile_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_user_profile_id_fkey FOREIGN KEY (user_profile_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;


--
--
-- Name: user_action_items user_action_items_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.user_action_items
    ADD CONSTRAINT user_action_items_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE CASCADE;


--
--
-- Name: user_action_items user_action_items_user_profile_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.user_action_items
    ADD CONSTRAINT user_action_items_user_profile_id_fkey FOREIGN KEY (user_profile_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;


--
--
-- Name: user_matches user_matches_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.user_matches
    ADD CONSTRAINT user_matches_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE CASCADE;


--
--
-- Name: user_matches user_matches_user_profile_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.user_matches
    ADD CONSTRAINT user_matches_user_profile_id_fkey FOREIGN KEY (user_profile_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;


--
--
-- Name: user_notifications user_notifications_user_profile_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.user_notifications
    ADD CONSTRAINT user_notifications_user_profile_id_fkey FOREIGN KEY (user_profile_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;


--
--
-- Name: user_profiles user_profiles_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
--
-- Name: user_profiles user_profiles_managed_by_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_managed_by_fkey FOREIGN KEY (managed_by) REFERENCES public.user_profiles(id);


--
--
-- Name: user_pursuits user_pursuits_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.user_pursuits
    ADD CONSTRAINT user_pursuits_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE CASCADE;


--
--
-- Name: user_pursuits user_pursuits_user_profile_id_fkey; Type: FK CONSTRAINT; Schema: public
--

--

ALTER TABLE ONLY public.user_pursuits
    ADD CONSTRAINT user_pursuits_user_profile_id_fkey FOREIGN KEY (user_profile_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;


--
--
-- Name: contractor_contacts Allow anon read contractor_contacts; Type: POLICY; Schema: public
--

--

CREATE POLICY "Allow anon read contractor_contacts" ON public.contractor_contacts FOR SELECT TO authenticated USING (true);


--
--
-- Name: enrichment_jobs Allow anon read enrichment_jobs; Type: POLICY; Schema: public
--

--

CREATE POLICY "Allow anon read enrichment_jobs" ON public.enrichment_jobs FOR SELECT TO authenticated USING (true);


--
--
-- Name: opportunity_attachments Allow anon read opportunity_attachments; Type: POLICY; Schema: public
--

--

CREATE POLICY "Allow anon read opportunity_attachments" ON public.opportunity_attachments FOR SELECT TO authenticated USING (true);


--
--
-- Name: opportunity_contractors Allow anon read opportunity_contractors; Type: POLICY; Schema: public
--

--

CREATE POLICY "Allow anon read opportunity_contractors" ON public.opportunity_contractors FOR SELECT TO authenticated USING (true);


--
--
-- Name: agency_intelligence_logs Allow public select on agency_intelligence_logs; Type: POLICY; Schema: public
--

--

CREATE POLICY "Allow public select on agency_intelligence_logs" ON public.agency_intelligence_logs FOR SELECT TO authenticated USING (true);


--
--
-- Name: contractors Allow public select on contractors; Type: POLICY; Schema: public
--

--

CREATE POLICY "Allow public select on contractors" ON public.contractors FOR SELECT TO authenticated USING (true);


--
--
-- Name: matches Allow public select on matches; Type: POLICY; Schema: public
--

--

CREATE POLICY "Allow public select on matches" ON public.matches FOR SELECT TO authenticated USING (true);


--
--
-- Name: naics_codes Allow public select on naics_codes; Type: POLICY; Schema: public
--

--

CREATE POLICY "Allow public select on naics_codes" ON public.naics_codes FOR SELECT TO authenticated USING (true);


--
--
-- Name: opportunities Allow public select on opportunities; Type: POLICY; Schema: public
--

--

CREATE POLICY "Allow public select on opportunities" ON public.opportunities FOR SELECT TO authenticated USING (true);


--
--
-- Name: psc_codes Allow public select on psc_codes; Type: POLICY; Schema: public
--

--

CREATE POLICY "Allow public select on psc_codes" ON public.psc_codes FOR SELECT TO authenticated USING (true);


--
--
-- Name: set_asides Allow public select on set_asides; Type: POLICY; Schema: public
--

--

CREATE POLICY "Allow public select on set_asides" ON public.set_asides FOR SELECT TO authenticated USING (true);


--
--
-- Name: service_requests Users can create service requests; Type: POLICY; Schema: public
--

--

CREATE POLICY "Users can create service requests" ON public.service_requests FOR INSERT TO authenticated WITH CHECK ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: user_profiles Users can insert own profile; Type: POLICY; Schema: public
--

--

CREATE POLICY "Users can insert own profile" ON public.user_profiles FOR INSERT TO authenticated WITH CHECK ((auth.uid() = auth_user_id));


--
--
-- Name: user_action_items Users can manage own action items; Type: POLICY; Schema: public
--

--

CREATE POLICY "Users can manage own action items" ON public.user_action_items TO authenticated USING ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: user_pursuits Users can manage own pursuits; Type: POLICY; Schema: public
--

--

CREATE POLICY "Users can manage own pursuits" ON public.user_pursuits TO authenticated USING ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: user_matches Users can update own matches; Type: POLICY; Schema: public
--

--

CREATE POLICY "Users can update own matches" ON public.user_matches FOR UPDATE TO authenticated USING ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: user_notifications Users can update own notifications; Type: POLICY; Schema: public
--

--

CREATE POLICY "Users can update own notifications" ON public.user_notifications FOR UPDATE TO authenticated USING ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: user_profiles Users can update own profile; Type: POLICY; Schema: public
--

--

CREATE POLICY "Users can update own profile" ON public.user_profiles FOR UPDATE TO authenticated USING ((auth.uid() = auth_user_id));


--
--
-- Name: user_matches Users can view own matches; Type: POLICY; Schema: public
--

--

CREATE POLICY "Users can view own matches" ON public.user_matches FOR SELECT TO authenticated USING ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: user_notifications Users can view own notifications; Type: POLICY; Schema: public
--

--

CREATE POLICY "Users can view own notifications" ON public.user_notifications FOR SELECT TO authenticated USING ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: user_profiles Users can view own profile; Type: POLICY; Schema: public
--

--

CREATE POLICY "Users can view own profile" ON public.user_profiles FOR SELECT TO authenticated USING ((auth.uid() = auth_user_id));


--
--
-- Name: service_requests Users can view own service requests; Type: POLICY; Schema: public
--

--

CREATE POLICY "Users can view own service requests" ON public.service_requests FOR SELECT TO authenticated USING ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: agencies; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;

--
--
-- Name: agency_intelligence_logs; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.agency_intelligence_logs ENABLE ROW LEVEL SECURITY;

--
--
-- Name: archive_types; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.archive_types ENABLE ROW LEVEL SECURITY;

--
--
-- Name: capture_outcomes; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.capture_outcomes ENABLE ROW LEVEL SECURITY;

--
--
-- Name: contacts; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

--
--
-- Name: contractor_contacts; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.contractor_contacts ENABLE ROW LEVEL SECURITY;

--
--
-- Name: contractors; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.contractors ENABLE ROW LEVEL SECURITY;

--
--
-- Name: enrichment_jobs; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.enrichment_jobs ENABLE ROW LEVEL SECURITY;

--
--
-- Name: matches; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

--
--
-- Name: user_matches matches_update_own; Type: POLICY; Schema: public
--

--

CREATE POLICY matches_update_own ON public.user_matches FOR UPDATE USING ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: naics_codes; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.naics_codes ENABLE ROW LEVEL SECURITY;

--
--
-- Name: opportunities; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;

--
--
-- Name: opportunity_attachments; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.opportunity_attachments ENABLE ROW LEVEL SECURITY;

--
--
-- Name: opportunity_contractors; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.opportunity_contractors ENABLE ROW LEVEL SECURITY;

--
--
-- Name: opportunity_types; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.opportunity_types ENABLE ROW LEVEL SECURITY;

--
--
-- Name: psc_codes; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.psc_codes ENABLE ROW LEVEL SECURITY;

--
--
-- Name: user_pursuits pursuits_insert_own; Type: POLICY; Schema: public
--

--

CREATE POLICY pursuits_insert_own ON public.user_pursuits FOR INSERT WITH CHECK ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: user_pursuits pursuits_update_own; Type: POLICY; Schema: public
--

--

CREATE POLICY pursuits_update_own ON public.user_pursuits FOR UPDATE USING ((user_profile_id IN ( SELECT user_profiles.id
   FROM public.user_profiles
  WHERE (user_profiles.auth_user_id = auth.uid()))));


--
--
-- Name: service_requests; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;

--
--
-- Name: set_asides; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.set_asides ENABLE ROW LEVEL SECURITY;

--
--
-- Name: user_action_items; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.user_action_items ENABLE ROW LEVEL SECURITY;

--
--
-- Name: user_matches; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.user_matches ENABLE ROW LEVEL SECURITY;

--
--
-- Name: user_notifications; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

--
--
-- Name: user_profiles; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

--
--
-- Name: user_pursuits; Type: ROW SECURITY; Schema: public
--

--

ALTER TABLE public.user_pursuits ENABLE ROW LEVEL SECURITY;

--