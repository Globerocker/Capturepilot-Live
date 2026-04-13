# CapturePilot 2.0 -- Complete Software Documentation

*Last updated: April 8, 2026*
*For internal use only -- DO NOT share externally*

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture](#2-architecture)
3. [Access & Login Information](#3-access--login-information)
4. [Environment Variables](#4-environment-variables)
5. [Database (Supabase)](#5-database-supabase)
6. [Dashboard App (app.capturepilot.com)](#6-dashboard-app)
7. [Marketing Website (capturepilot.com)](#7-marketing-website)
8. [Cron Jobs & Automation](#8-cron-jobs--automation)
9. [Python Tools](#9-python-tools)
10. [External APIs](#10-external-apis)
11. [Deployment](#11-deployment)
12. [Git Remotes](#12-git-remotes)
13. [Common Tasks & How-Tos](#13-common-tasks--how-tos)

---

## 1. System Overview

### What is CapturePilot?

CapturePilot is a **Strategic Capture Intelligence Engine** for federal government contracting. It helps small and medium-sized businesses find, evaluate, and win federal contracts from SAM.gov and Grants.gov.

Think of it as a "CRM + intelligence platform" specifically designed for the B2G (Business-to-Government) market. The system automatically:

- **Ingests** thousands of federal opportunities daily from SAM.gov and Grants.gov
- **Scores** each opportunity against a user's company profile (NAICS codes, certifications, location, size)
- **Enriches** opportunities with requirement extraction, incumbent identification, and AI win strategies
- **Notifies** users via email about high-scoring matches
- **Tracks** the pursuit pipeline from discovery to award/loss
- **Provides** competitive intelligence (who wins similar contracts, market sizing, competitor monitoring)

### Who Uses It?

There are **three user types** in the system:

| Type | `account_type` | Access | Description |
|------|----------------|--------|-------------|
| **Self-Service (SaaS)** | `self_service` | Full dashboard at `/dashboard` | Users who sign up on their own, complete onboarding, manage their own profile. This is the scalable product. |
| **Consulting Clients** | `consulting` | Portal at `/portal` | Managed clients who are onboarded by the CapturePilot team. They get a lighter, curated view. The consulting team handles strategy. |
| **Admin** | `admin` | Admin panel at `/admin` | Internal team members. Full access to all clients, all data, system tools, messaging, and the lead pipeline. |

### Business Model

- **SaaS tier**: Self-service users on free beta (future: paid plans via Stripe)
- **Consulting tier**: Done-for-you government contracting consulting. Clients are onboarded manually via the admin panel. Higher touch, higher revenue.
- **Lead generation**: The "Quick Checker" tool on the marketing website captures leads by analyzing a company's website and showing free contract matches.

---

## 2. Architecture

### Technology Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Next.js 16.1.6 (Turbopack) | React, Tailwind CSS, TypeScript |
| Backend | Vercel Serverless Functions | All API routes run as serverless functions |
| Database | Supabase (PostgreSQL) | Hosted Postgres with Row Level Security (RLS) |
| Auth | Supabase Auth | Email/password authentication |
| Storage | Supabase Storage | `client-docs` bucket for document uploads |
| Email | Resend | Transactional emails (welcome, alerts, tasks) |
| Payments | Stripe | Checkout, subscriptions, webhooks |
| AI | OpenAI (GPT-4o-mini) | Win strategies, proposal writing, document summarization |
| Python | Python 3.8+ scripts in `/tools/` | Scoring, enrichment, contractor discovery |
| Hosting | Vercel | Auto-deploys from git push |

### Data Flow (Text Diagram)

```
SAM.gov / Grants.gov APIs
        |
        v
[Cron: ingest_sam / ingest_grants] -- daily at 2:00/2:30 UTC
        |
        v
  opportunities table (37K+ records)
        |
        v
[Cron: score_matches] -- daily at 3:00 UTC
        |
        v
  user_matches table (scored per user)
        |
        v
[Cron: notify_matches] -- daily at 10:00 UTC
        |
        v
  Email alerts via Resend
```

```
[Cron: backfill_requirements] -- daily at 6:00 UTC
        |
        v
  Extracts requirements, contacts, values from raw_json

[Cron: deep_enrich] -- daily at 8:00 UTC
        |
        v
  Fetches full descriptions from SAM.gov URLs, downloads PDFs,
  extracts structured requirements, estimates values

[Cron: enrich / enrich_apollo / enrich_contractors]
        |
        v
  Enriches contractors with Apollo.io data, SAM.gov entity data

[Cron: competitor_monitor] -- weekly Sunday 7:00 UTC
        |
        v
  Re-crawls competitor websites, checks USASpending for new awards

[Cron: monthly_awards] -- 1st of each month
        |
        v
  Fetches award notices + forecast notices from SAM.gov
```

### Directory Structure

```
/Caturepilot 2.0/
|-- CLAUDE.md                          # Project rules for AI assistant
|-- DOCUMENTATION.md                   # This file
|-- dashboard/                         # Next.js dashboard app
|   |-- src/
|   |   |-- app/
|   |   |   |-- (public)/             # Login, signup, check, pricing, etc.
|   |   |   |-- (dashboard)/          # Authenticated SaaS dashboard pages
|   |   |   |-- (portal)/             # Consulting client portal pages
|   |   |   |-- (admin)/              # Admin panel pages
|   |   |   |-- (onboarding)/         # Onboarding flow
|   |   |   |-- api/                  # All API routes
|   |   |       |-- admin/            # Admin CRUD operations
|   |   |       |-- ai/               # AI-powered features
|   |   |       |-- cron/             # Scheduled jobs
|   |   |       |-- intelligence/     # Market intelligence endpoints
|   |   |       |-- sam/              # SAM.gov proxy endpoints
|   |   |       |-- stripe/           # Payment processing
|   |   |-- lib/                      # Shared libraries
|   |       |-- crawler.ts            # Website crawler/analyzer
|   |       |-- email.ts              # Resend email templates
|   |       |-- match-scoring.ts      # Opportunity scoring algorithm
|   |       |-- naics-classifier.ts   # NAICS code classification
|   |       |-- supabase/             # Supabase client helpers
|   |-- supabase/
|   |   |-- migrations/               # Database migrations (001-017)
|   |-- vercel.json                   # Cron schedules
|   |-- package.json
|-- website/                          # Marketing website (separate Next.js app)
|   |-- app/                          # Website pages
|-- tools/                            # Python pipeline scripts
    |-- 1_ingest_sam.py
    |-- 2_score_matches.py
    |-- ...
```

---

## 3. Access & Login Information

### Production URLs

| Service | URL | Notes |
|---------|-----|-------|
| Dashboard/App | https://app.capturepilot.com | Main application (Vercel: captiorpilot-v3) |
| Marketing Website | https://www.capturepilot.com | Marketing site (Vercel: capturepilot-website) |
| Supabase Dashboard | https://supabase.com/dashboard/project/ryxgjzehoijjvczqkhwr | Database admin |
| Vercel Dashboard | https://vercel.com/celluiq/capturepilot-v3 | Deployment & logs |
| GitHub Repo | https://github.com/Globerocker/capturepilot-v3 | Source code |

### Admin Login

Admin accounts have `account_type = 'admin'` in the `user_profiles` table. Log in at https://app.capturepilot.com/login with admin credentials. After login, navigate to `/admin/overview`.

### Known Client Accounts

- **TD&I Cable** (consulting client): lee.zubrod@tdicable.com
- **SmartPipe** (consulting client): donny.mccallum@smart-pipe.com

### How Authentication Works

1. User visits `/login` or `/signup`
2. Supabase Auth handles email/password authentication
3. On successful auth, a session cookie is set
4. Every protected page checks for a valid session
5. The `user_profiles` table stores the `auth_user_id` (links Supabase Auth to business data)
6. The `account_type` field determines which UI the user sees:
   - `self_service` -> redirected to `/dashboard`
   - `consulting` -> redirected to `/portal`
   - `admin` -> can access `/admin/*`

---

## 4. Environment Variables

These are the environment variable **names** required for the dashboard app. Actual values are stored in Vercel's environment settings and must NEVER be committed to git.

### Supabase (Required)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (public, used in browser) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous/public key (used in browser for auth) |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (server-side only, bypasses RLS) |

### External APIs

| Variable | Purpose |
|----------|---------|
| `SAM_API_KEY` | SAM.gov API key for opportunity search and entity lookup |
| `APOLLO_API_KEY` | Apollo.io API key for company/people enrichment |
| `OPENAI_API_KEY` | OpenAI API key for AI features (win strategies, proposals, summaries) |
| `RESEND_API_KEY` | Resend email service API key |
| `GRANTS_API_KEY` | Grants.gov / Simpler Grants API key (note: may also be hardcoded) |
| `GEMINI_API_KEY` | Google Gemini API key (used for letter generation) |

### Stripe (Payments)

| Variable | Purpose |
|----------|---------|
| `STRIPE_SECRET_KEY` | Stripe server-side secret key |
| `STRIPE_PRO_PRICE_ID` | Stripe Price ID for the Pro subscription plan |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret for verifying events |

### Application

| Variable | Purpose |
|----------|---------|
| `CRON_SECRET` | Shared secret for authenticating cron job requests (Bearer token) |
| `NEXT_PUBLIC_APP_URL` | Base URL for the app (default: https://app.capturepilot.com) |
| `FROM_EMAIL` | Sender email address for Resend (default: CapturePilot <noreply@capturepilot.com>) |

---

## 5. Database (Supabase)

The database is PostgreSQL hosted on Supabase. All tables use Row Level Security (RLS) to ensure users can only access their own data. The `service_role` key bypasses RLS and is used by API routes and cron jobs.

Supabase project ID: `ryxgjzehoijjvczqkhwr`

### Migrations

Migrations are in `/dashboard/supabase/migrations/` and are numbered 001-017. They should be run in order in the Supabase SQL Editor if setting up a new database.

### Table: `opportunities`

**What it stores**: Federal contract opportunities ingested from SAM.gov and Grants.gov. This is the largest table with 37,000+ records.

**Key columns**:

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `notice_id` | TEXT | SAM.gov notice ID or `GRANT-{id}` for grants (unique) |
| `title` | TEXT | Opportunity title |
| `description` | TEXT | Full description (sometimes a URL to SAM.gov) |
| `agency` | TEXT | Top-level federal agency |
| `sub_agency` | TEXT | Sub-agency |
| `office` | TEXT | Contracting office |
| `naics_code` | TEXT | NAICS code (FK to naics_codes table) |
| `psc_code` | TEXT | Product Service Code (FK to psc_codes table) |
| `set_aside_code` | TEXT | Set-aside type (e.g., "Small Business", "SDVOSB", "WOSB") |
| `notice_type` | TEXT | Type code: r=Sources Sought, p=Presol, o=Sol, k=Combined, Grant |
| `posted_date` | TIMESTAMPTZ | When the opportunity was posted |
| `response_deadline` | TIMESTAMPTZ | Deadline to respond |
| `place_of_performance_state` | TEXT | State code where work is performed |
| `place_of_performance_city` | TEXT | City |
| `solicitation_number` | TEXT | Solicitation/RFP number |
| `award_amount` | NUMERIC | Contract award amount (if awarded) |
| `estimated_value` | NUMERIC | Estimated contract value |
| `link_url` | TEXT | Link to SAM.gov or Grants.gov listing |
| `raw_json` | JSONB | Full raw API response (used for backfill) |
| `status` | TEXT | Lifecycle status (see below) |
| `is_archived` | BOOLEAN | Legacy archive flag (synced with status via triggers) |
| `veteran_relevance_flag` | BOOLEAN | Set-aside relevant to veterans |
| `small_business_relevance_flag` | BOOLEAN | Set-aside relevant to small businesses |
| `wosb_relevance_flag` | BOOLEAN | Set-aside relevant to women-owned businesses |
| `sources_sought_flag` | BOOLEAN | Is a Sources Sought / RFI notice |
| `retention_protected` | BOOLEAN | Protected from auto-deletion (has intel value) |
| `retention_reason` | TEXT | Why it is protected (incumbent_data, award_history, etc.) |
| `incumbent_contractor_name` | TEXT | Name of incumbent contractor (if known) |
| `incumbent_contractor_uei` | TEXT | UEI of incumbent |
| `structured_requirements` | JSONB | Extracted requirements (bonding, insurance, clearance, etc.) |
| `ai_win_strategy` | JSONB | AI-generated win strategy (summary, risks, next steps) |
| `strategic_scoring` | JSONB | Strategic scoring data |
| `last_crawled_at` | TIMESTAMPTZ | Last enrichment timestamp |

**Lifecycle statuses** (managed by cron/db_cleanup):

| Status | Description |
|--------|-------------|
| `SEARCH_SEED` | Forecast / early signal (future opportunity) |
| `DISCOVERED` | Newly ingested, not yet classified |
| `QUALIFIED` | Passed relevance filters |
| `ACTIVE` | Open, deadline in the future |
| `EXPIRING_SOON` | Deadline within 7 days |
| `MARKET_RESEARCH` | Sources Sought / RFI (pre-deadline) |
| `INTELLIGENCE` | Sources Sought / RFI (post-deadline, retained for intel) |
| `EXPIRED` | Deadline has passed |
| `AWARDED` | Award detected (never auto-deleted) |
| `ARCHIVED` | Expired > 120 days, pending deletion |
| `DELETED` | Soft-deleted (hard delete via cleanup) |

**Database triggers**: Bidirectional sync between `status` and `is_archived` columns. Changing one automatically updates the other.

---

### Table: `user_profiles`

**What it stores**: Every user's company profile and account settings. Links to Supabase Auth via `auth_user_id`.

**Key columns**:

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key (referenced by all user-scoped tables) |
| `auth_user_id` | UUID | Links to Supabase `auth.users(id)` (unique) |
| `company_name` | TEXT | Company name (required) |
| `dba_name` | TEXT | "Doing Business As" name |
| `uei` | TEXT | Unique Entity Identifier (SAM.gov registration) |
| `cage_code` | TEXT | Commercial and Government Entity code |
| `email` | TEXT | Primary email |
| `secondary_email` | TEXT | Secondary email |
| `contact_name` | TEXT | Primary contact person name |
| `contact_phone` | TEXT | Phone number |
| `website` | TEXT | Company website URL |
| `address_line_1` | TEXT | Street address |
| `city` | TEXT | City |
| `state` | TEXT | State code |
| `zip_code` | TEXT | ZIP code |
| `phone` | TEXT | Company phone |
| `naics_codes` | TEXT[] | Array of NAICS codes (determines matching) |
| `sba_certifications` | TEXT[] | Array of SBA certs: 8(a), SDVOSB, WOSB, HUBZone, etc. |
| `employee_count` | INTEGER | Number of employees |
| `revenue` | NUMERIC | Annual revenue |
| `years_in_business` | INTEGER | Years in operation |
| `service_radius_miles` | INTEGER | Service radius (default 50) |
| `has_bonding` | BOOLEAN | Has surety bonding |
| `has_fleet` | BOOLEAN | Has vehicle fleet |
| `has_municipal_exp` | BOOLEAN | Has municipal/government experience |
| `federal_awards_count` | INTEGER | Number of past federal awards |
| `target_contract_types` | TEXT[] | Preferred contract types |
| `target_states` | TEXT[] | States they want to work in |
| `target_psc_codes` | TEXT[] | Product Service Codes they target |
| `preferred_agencies` | TEXT[] | Preferred federal agencies |
| `contract_value_min` | NUMERIC | Minimum contract value |
| `contract_value_max` | NUMERIC | Maximum contract value |
| `security_clearances` | TEXT[] | Security clearances held |
| `prime_or_sub` | TEXT | "prime", "sub", or "both" |
| `company_description` | TEXT | Long description of the company |
| `account_type` | TEXT | `self_service`, `consulting`, or `admin` |
| `managed_by` | UUID | Admin who manages this client |
| `client_since` | TIMESTAMPTZ | When they became a consulting client |
| `client_status` | TEXT | `active`, `churned`, etc. |
| `onboarding_complete` | BOOLEAN | Whether onboarding is done |
| `plan_tier` | TEXT | `free_beta`, `pro`, `consulting` |
| `subscription_status` | TEXT | `trialing`, `active`, `canceled` |
| `stripe_customer_id` | TEXT | Stripe customer ID |
| `stripe_subscription_id` | TEXT | Stripe subscription ID |
| `trial_ends_at` | TIMESTAMPTZ | Trial expiration |
| `analysis_id` | UUID | Link to company_analyses (from Quick Checker) |
| `onboarding_source` | TEXT | How they found us: `manual`, `quick_checker`, etc. |
| `notes` | TEXT | Admin notes about this client |
| `notification_preferences` | JSONB | Email notification settings |
| `last_login_at` | TIMESTAMPTZ | Last login timestamp |
| `created_at` | TIMESTAMPTZ | Account creation date |
| `updated_at` | TIMESTAMPTZ | Last profile update |

**RLS**: Users can only read/update their own profile. Service role has full access.

---

### Table: `user_matches`

**What it stores**: Scored opportunity matches for each user. Created/updated by the scoring engine.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_profile_id` | UUID | FK to user_profiles |
| `opportunity_id` | UUID | FK to opportunities |
| `score` | NUMERIC | Match score (0.0 to 1.0) |
| `classification` | TEXT | `HOT` (>=0.70), `WARM` (0.50-0.70), `COLD` (<0.50) |
| `score_breakdown` | JSONB | Detailed score components (NAICS, PSC, geo, set-aside, etc.) |
| `is_saved` | BOOLEAN | User bookmarked this match |
| `is_dismissed` | BOOLEAN | User dismissed this match |

**Unique constraint**: `(user_profile_id, opportunity_id)` -- one score per user per opportunity.

---

### Table: `user_pursuits`

**What it stores**: Opportunities that a user is actively pursuing (their pipeline).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_profile_id` | UUID | FK to user_profiles |
| `opportunity_id` | UUID | FK to opportunities |
| `stage` | TEXT | `discovered`, `researching`, `preparing`, `submitted`, `awarded`, `lost`, `no_bid` |
| `priority` | TEXT | `low`, `medium`, `high` |
| `notes` | TEXT | Free-text notes |
| `stage_changed_at` | TIMESTAMPTZ | When stage last changed |

---

### Table: `client_tasks`

**What it stores**: Tasks assigned to consulting clients by the admin team. When a new consulting client is created, 10 default onboarding tasks are auto-generated.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_profile_id` | UUID | FK to user_profiles |
| `assigned_by` | UUID | Admin who assigned the task |
| `title` | TEXT | Task title |
| `description` | TEXT | Detailed instructions |
| `priority` | TEXT | `urgent`, `high`, `medium`, `low` |
| `status` | TEXT | `pending`, `in_progress`, `waiting_client`, `completed` |
| `due_date` | TIMESTAMPTZ | Due date |
| `completed_at` | TIMESTAMPTZ | When completed |
| `category` | TEXT | `sam_registration`, `email_setup`, `document`, `website`, `compliance`, `registration`, `general` |
| `opportunity_id` | TEXT | Related opportunity (optional) |
| `metadata` | JSONB | Extra data |

---

### Table: `client_documents`

**What it stores**: Documents uploaded by clients or admins. Files are stored in Supabase Storage (`client-docs` bucket), and this table holds metadata.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_profile_id` | UUID | FK to user_profiles |
| `uploaded_by` | UUID | Who uploaded |
| `filename` | TEXT | Original filename |
| `file_url` | TEXT | URL in Supabase Storage |
| `file_size` | INTEGER | File size in bytes |
| `mime_type` | TEXT | MIME type |
| `category` | TEXT | `general`, `capability_statement`, `proposal`, `certificate`, etc. |
| `description` | TEXT | Description |
| `is_template` | BOOLEAN | Whether it is a template |
| `review_status` | TEXT | Admin review status |

---

### Table: `client_competitors`

**What it stores**: Competitors tracked for each consulting client. Crawled weekly by the competitor_monitor cron.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_profile_id` | UUID | FK to user_profiles |
| `competitor_name` | TEXT | Competitor company name |
| `website` | TEXT | Competitor website |
| `uei` | TEXT | SAM.gov UEI |
| `cage_code` | TEXT | CAGE code |
| `naics_codes` | TEXT[] | NAICS codes |
| `employee_count` | TEXT | Estimated employee count |
| `revenue_estimate` | TEXT | Estimated revenue |
| `description` | TEXT | Company description |
| `overlap_score` | INTEGER | How much they overlap with the client (0-100) |
| `federal_presence` | TEXT | Level of federal contracting activity |
| `crawl_data` | JSONB | Latest crawl results (services, leadership, contacts, social) |
| `last_analyzed_at` | TIMESTAMPTZ | Last crawl timestamp |

---

### Table: `client_messages`

**What it stores**: Chat messages between consulting clients and the admin team.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_profile_id` | UUID | FK to user_profiles |
| `sender_type` | TEXT | `client` or `admin` |
| `sender_name` | TEXT | Name of sender |
| `message` | TEXT | Message content |
| `read_at` | TIMESTAMPTZ | When the message was read |
| `opportunity_id` | UUID | Related opportunity (optional) |
| `created_at` | TIMESTAMPTZ | When sent |

**RLS**: Clients can read their own messages and insert messages with `sender_type = 'client'`. Service role has full access (for admin).

---

### Table: `client_activity_log`

**What it stores**: Audit trail of all actions taken on a client account.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_profile_id` | UUID | FK to user_profiles |
| `actor_id` | UUID | Who performed the action |
| `action` | TEXT | Action type: `client_created`, `client_updated`, `task_created`, `email_sent`, `document_uploaded`, `competitor_added`, `profile_enriched`, `naics_crawl`, `competitor_change_detected`, etc. |
| `description` | TEXT | Human-readable description |
| `metadata` | JSONB | Extra data |

---

### Table: `company_analyses`

**What it stores**: Results from the Quick Checker (lead magnet). Each record represents one company analysis -- anonymous users enter their website, and the system crawls it, classifies NAICS codes, and scores against available opportunities.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key (used as `analysisId` in URLs) |
| `company_name` | TEXT | Company name |
| `website` | TEXT | Company website |
| `uei` | TEXT | UEI if found |
| `status` | TEXT | `pending`, `crawling`, `enriching`, `classifying`, `scoring`, `generating`, `complete`, `error`, `failed` |
| `crawl_data` | JSONB | Website crawl results |
| `sam_data` | JSONB | SAM.gov entity data |
| `inferred_naics` | JSONB | AI-classified NAICS codes |
| `company_summary` | TEXT | AI-generated company summary |
| `preview_matches` | JSONB | Top 10 matching opportunities |
| `inferred_profile` | JSONB | Inferred company profile for onboarding pre-fill |
| `cert_recommendations` | JSONB | Recommended SBA certifications |
| `easy_wins` | JSONB | Quick actions to improve eligibility |
| `lead_email` | TEXT | Email captured from the user |
| `converted_user_id` | UUID | If the lead signed up |
| `is_saved` | BOOLEAN | Admin bookmarked this prospect |
| `ip_address` | INET | For analytics |

**RLS**: Anonymous users can INSERT (to start an analysis). Only service role can SELECT/UPDATE.

---

### Table: `contacts`

**What it stores**: Points of contact extracted from SAM.gov opportunities. 91K+ records.

| Column | Type | Description |
|--------|------|-------------|
| `notice_id` | TEXT | SAM.gov notice ID |
| `fullname` | TEXT | Contact name |
| `email` | TEXT | Contact email |
| `phone` | TEXT | Contact phone |
| `title` | TEXT | Job title |
| `fax` | TEXT | Fax number |
| `is_primary` | BOOLEAN | Whether this is the primary POC |

**Unique constraint**: `(notice_id, email, fullname)`

---

### Table: `contractors`

**What it stores**: SAM.gov registered entities (companies). 80K+ records. Enriched with Apollo.io data.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `company_name` | TEXT | Legal business name |
| `uei` | TEXT | Unique Entity Identifier |
| `cage_code` | TEXT | CAGE code |
| `website_url` | TEXT | Website |
| `email` | TEXT | Email |
| `phone` | TEXT | Phone |
| `city` | TEXT | City |
| `state` | TEXT | State |
| `naics_codes` | TEXT[] | NAICS codes |
| `linkedin_url` | TEXT | LinkedIn URL (from Apollo) |
| `employee_count` | INTEGER | Employee count (from Apollo) |
| `revenue` | NUMERIC | Annual revenue (from Apollo) |
| `industry` | TEXT | Industry (from Apollo) |
| `founded_year` | INTEGER | Year founded (from Apollo) |
| `apollo_enriched` | BOOLEAN | Whether Apollo enrichment has been attempted |
| `last_enriched_at` | TIMESTAMPTZ | Last enrichment timestamp |
| `data_quality_flag` | TEXT | `LOW_QUALITY` if missing key fields |

---

### Table: `saved_searches`

**What it stores**: User-saved search filters with optional email alerts.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_profile_id` | UUID | FK to user_profiles |
| `name` | TEXT | Saved search name |
| `filters` | JSONB | Filter criteria: naics_codes, keywords, status, set_aside, state, min_value |
| `alert_enabled` | BOOLEAN | Whether alerts are active |
| `alert_frequency` | TEXT | `daily`, `weekly`, `realtime` |
| `last_alerted_at` | TIMESTAMPTZ | Last alert sent |
| `result_count` | INTEGER | Number of matching results |

---

### Other Lookup/Support Tables

| Table | Description |
|-------|-------------|
| `naics_codes` | NAICS code lookup table (code + description) |
| `psc_codes` | Product Service Code lookup table |
| `set_asides` | Set-aside type lookup (SBA, SBP, 8A, HZC, SDVOSBC, WOSB, etc.) |
| `matches` | Legacy scoring table (replaced by `user_matches`, now empty) |
| `email_drafts` | AI-generated email drafts for outreach to contracting officers |
| `call_logs` | Call/conversation logs |
| `user_action_items` | Action items for SaaS users (research, document, outreach tasks) |
| `user_notifications` | In-app and email notifications |
| `service_requests` | Upsell/service request tracking |
| `enrichment_jobs` | Enrichment pipeline job tracking |
| `opportunity_attachments` | Metadata for downloaded SAM.gov attachments |
| `opportunity_contractors` | Links contractors to opportunities |
| `contractor_contacts` | Contact info for contractors |
| `agency_intelligence_logs` | Intelligence data about agencies |

---

## 6. Dashboard App

The dashboard app lives at https://app.capturepilot.com and is built with Next.js. The source code is in `/dashboard/src/app/`.

Routes are organized into **route groups** (parenthesized folders in Next.js):
- `(public)` -- no authentication required
- `(dashboard)` -- requires auth, for self-service users
- `(portal)` -- requires auth, for consulting clients
- `(admin)` -- requires auth + admin account_type
- `(onboarding)` -- requires auth, onboarding flow

### 6.1 Public Pages (No Authentication Required)

#### `/` (Root/Landing)
- **File**: `(public)/page.tsx`
- **What it does**: Landing page for the app. Typically redirects to login or shows a marketing message.

#### `/login`
- **File**: `(public)/login/page.tsx`
- **What it does**: Email/password login form. Uses Supabase Auth. After successful login, redirects based on account_type:
  - `self_service` -> `/dashboard`
  - `consulting` -> `/portal`
  - `admin` -> `/admin/overview`

#### `/signup`
- **File**: `(public)/signup/page.tsx`
- **What it does**: New user registration. Creates a Supabase Auth account. Redirects to onboarding flow.

#### `/check` (Quick Checker)
- **File**: `(public)/check/page.tsx`
- **What it does**: The **lead magnet** tool. Public users enter their company name and website URL. The system:
  1. Crawls the website to extract services, contacts, leadership
  2. Looks up the company on SAM.gov
  3. Uses AI to classify NAICS codes
  4. Scores against all active opportunities
  5. Shows top matches, cert recommendations, and "easy wins"
- **Key feature**: No login required. Captures leads for the sales pipeline.

#### `/check/[analysisId]` (Quick Checker Results)
- **File**: `(public)/check/[analysisId]/page.tsx`
- **What it does**: Displays the results of a Quick Checker analysis. Shows:
  - Company summary
  - Inferred NAICS codes (editable)
  - Top 10 matching opportunities (3 detailed, 7 titles only until signup)
  - Certification recommendations
  - Easy wins / quick actions
  - Mini-onboarding form to correct data and re-score
- **Note**: Does NOT show personal contact data (LinkedIn, emails, Apollo data). Those are visible in the admin version at `/lead-check/[analysisId]`.

#### `/analyze` and `/analyze/[analysisId]`
- **File**: `(public)/analyze/page.tsx` and `(public)/analyze/[analysisId]/page.tsx`
- **What it does**: Alternative entry point for the Quick Checker (may be used for different marketing campaigns). Same functionality as `/check`.

#### `/pricing`
- **File**: `(public)/pricing/page.tsx`
- **What it does**: Pricing page. May redirect to the marketing website's pricing page.

#### `/privacy`
- **File**: `(public)/privacy/page.tsx`
- **What it does**: Privacy policy.

#### `/terms`
- **File**: `(public)/terms/page.tsx`
- **What it does**: Terms of service.

---

### 6.2 Dashboard (Self-Service Pro Users)

All pages require authentication. User must have `account_type = 'self_service'`.

#### `/dashboard`
- **File**: `(dashboard)/dashboard/page.tsx`
- **What it does**: Main overview dashboard. Shows:
  - Summary stats: total matches, HOT/WARM/COLD counts, upcoming deadlines
  - Recent high-scoring matches
  - Action items / to-dos
  - Quick links to key features

#### `/matches`
- **File**: `(dashboard)/matches/page.tsx`
- **What it does**: Full list of scored opportunity matches. Features:
  - Filter by classification (HOT/WARM/COLD)
  - Filter by NAICS, set-aside, state, agency
  - Sort by score, deadline, posted date
  - Save/dismiss matches
  - Click to view opportunity details
  - Score breakdown popup showing why each opportunity scored how it did

#### `/opportunities`
- **File**: `(dashboard)/opportunities/page.tsx`
- **What it does**: Browse ALL active opportunities (not just matches). Includes search/filter by:
  - Keywords, NAICS codes, PSC codes
  - Set-aside type
  - State/location
  - Agency
  - Contract value range
  - Notice type (Sources Sought, Solicitation, etc.)
- Includes saved searches feature (save filter combos, get alerts)

#### `/opportunities/[id]`
- **File**: `(dashboard)/opportunities/[id]/page.tsx`
- **What it does**: Detailed view of a single opportunity. Shows:
  - Full description
  - Requirements (extracted from description/attachments)
  - AI win strategy (if generated)
  - Score breakdown for this user
  - Contacts (POCs from SAM.gov)
  - Related awards/incumbents
  - Actions: Add to pipeline, generate proposal, write email draft

#### `/pipeline`
- **File**: `(dashboard)/pipeline/page.tsx`
- **What it does**: Kanban-style pursuit pipeline. Tracks opportunities through stages:
  - Discovered -> Researching -> Preparing -> Submitted -> Awarded/Lost/No Bid
  - Drag-and-drop to change stages
  - Add notes per pursuit
  - Priority tagging

#### `/partners`
- **File**: `(dashboard)/partners/page.tsx`
- **What it does**: Teaming partner search. Find potential subcontractors or prime contractors using SAM.gov Entity API. Search by:
  - NAICS code
  - State
  - Set-aside type (8(a), HUBZone, SDVOSB, WOSB)
  - Company name
- Shows UEI, CAGE code, certifications, website, location

#### `/capability-statement`
- **File**: `(dashboard)/capability-statement/page.tsx`
- **What it does**: AI-powered Capability Statement builder. Users can:
  - Enter or dictate (voice-to-text) their capabilities, past projects, differentiators
  - The AI generates a structured capability statement with sections
  - Optionally extract brand kit (colors, logo) from their website
  - Export/download the statement

#### `/settings`
- **File**: `(dashboard)/settings/page.tsx`
- **What it does**: Account settings where users manage their profile:
  - Company information (name, address, website, UEI, CAGE)
  - NAICS codes (add/remove)
  - SBA certifications
  - Target states and contract preferences
  - Notification preferences
  - SAM.gov entity lookup (search by UEI to auto-fill profile)

#### `/billing`
- **File**: `(dashboard)/billing/page.tsx`
- **What it does**: Subscription management. Shows:
  - Current plan (free beta / pro)
  - Stripe checkout to upgrade
  - Stripe portal to manage subscription
  - Trial status

---

### 6.3 Portal (Consulting Clients)

All pages require authentication. User must have `account_type = 'consulting'`. This is a curated, lighter view designed for managed clients.

#### `/portal`
- **File**: `(portal)/portal/page.tsx`
- **What it does**: Client overview dashboard. Shows:
  - Welcome message with client name
  - Summary stats (matches, tasks, competitors)
  - Recent activity
  - Pending tasks
  - Quick links

#### `/portal/opportunities`
- **File**: `(portal)/portal/opportunities/page.tsx`
- **What it does**: Matched opportunities for this client. Similar to dashboard `/matches` but tailored for consulting clients. Shows scored matches with HOT/WARM/COLD classification.

#### `/portal/opportunities/[id]`
- **File**: `(portal)/portal/opportunities/[id]/page.tsx`
- **What it does**: Detailed opportunity view with:
  - Full description
  - AI-generated analysis and win strategy
  - Requirements breakdown
  - Eligibility assessment
  - Actions: Add to pipeline, request proposal help

#### `/portal/pipeline`
- **File**: `(portal)/portal/pipeline/page.tsx`
- **What it does**: Client's pursuit pipeline. Same stages as dashboard pipeline but clients can add notes and the consulting team can see them.

#### `/portal/tasks`
- **File**: `(portal)/portal/tasks/page.tsx`
- **What it does**: Tasks assigned by the consulting team. Shows:
  - Task title, description, priority, due date
  - Status: pending, in_progress, waiting_client, completed
  - Clients can mark tasks complete/incomplete
  - Categories: SAM registration, document upload, website setup, compliance, etc.

#### `/portal/competitors`
- **File**: `(portal)/portal/competitors/page.tsx`
- **What it does**: Competitor tracking dashboard. Shows all tracked competitors with:
  - Name, website, NAICS overlap
  - Employee count, revenue estimate
  - Federal presence level
  - Last analyzed date
  - Add new competitor button

#### `/portal/competitors/[id]`
- **File**: `(portal)/portal/competitors/[id]/page.tsx`
- **What it does**: Detailed competitor profile showing:
  - Crawled data (services, leadership, contacts, social)
  - NAICS overlap analysis
  - Recent federal awards (from USASpending)
  - Changes detected by weekly monitoring

#### `/portal/documents`
- **File**: `(portal)/portal/documents/page.tsx`
- **What it does**: Document management. Clients can:
  - Upload files (capability statements, certificates, proposals, logos)
  - Download files uploaded by the consulting team
  - Files stored in Supabase Storage `client-docs` bucket
  - Categories: general, capability_statement, proposal, certificate

#### `/portal/capability-statement`
- **File**: `(portal)/portal/capability-statement/page.tsx`
- **What it does**: Same AI capability statement builder as the dashboard version, but for consulting clients.

#### `/portal/partners`
- **File**: `(portal)/portal/partners/page.tsx`
- **What it does**: Teaming partner search for consulting clients. Same SAM.gov entity search as dashboard version.

#### `/portal/messages`
- **File**: `(portal)/portal/messages/page.tsx`
- **What it does**: Chat interface with the consulting team. Features:
  - Real-time messaging
  - Voice-to-text input (mic button)
  - File upload attachments
  - Quick message suggestions
  - Messages linked to specific opportunities

#### `/portal/settings`
- **File**: `(portal)/portal/settings/page.tsx`
- **What it does**: Client profile settings. Can update:
  - Contact info, NAICS codes, certifications
  - Target states and preferences
  - Company description

---

### 6.4 Admin Panel

Accessible at `/admin/*`. Requires `account_type = 'admin'`.

#### `/admin/overview`
- **File**: `(admin)/admin/overview/page.tsx`
- **What it does**: Admin command center. Shows:
  - Total clients, users, opportunities, matches
  - Recent activity across all clients
  - System health indicators
  - Quick actions (create client, run tools)

#### `/admin/clients`
- **File**: `(admin)/admin/clients/page.tsx`
- **What it does**: Client management list. Shows all consulting clients with:
  - Company name, email, contact
  - Status (active, churned)
  - Match count, task count, document count
  - Last login date
  - Actions: Edit, enrich profile, send update, deactivate
  - "Create New Client" button

#### `/admin/clients/[id]`
- **File**: `(admin)/admin/clients/[id]/page.tsx`
- **What it does**: Detailed client management view. All-in-one panel:
  - Edit profile fields
  - View/create tasks
  - View/upload documents
  - View/add competitors
  - View matches
  - View activity log
  - Send emails (opportunity alerts or custom)
  - Enrich profile (run full pipeline)
  - View messages

#### `/admin/opportunities`
- **File**: `(admin)/admin/opportunities/page.tsx`
- **What it does**: Browse all opportunities in the database with admin-level filters and actions.

#### `/admin/matches`
- **File**: `(admin)/admin/matches/page.tsx`
- **What it does**: View and manage matches across all users.

#### `/admin/leads`
- **File**: `(admin)/admin/leads/page.tsx`
- **What it does**: Lead pipeline management. Shows leads from the Quick Checker and other sources.

#### `/admin/prospects`
- **File**: `(admin)/admin/prospects/page.tsx`
- **What it does**: Prospect dashboard showing all company_analyses (Quick Checker results). Admins can:
  - See all companies that have used the Quick Checker
  - Save promising prospects
  - View detailed analysis
  - Convert prospects to clients

#### `/admin/pipeline`
- **File**: `(admin)/admin/pipeline/page.tsx`
- **What it does**: Sales pipeline for tracking prospects through the conversion funnel.

#### `/admin/users`
- **File**: `(admin)/admin/users/page.tsx`
- **What it does**: User management. Lists all auth users with their profiles. Can:
  - Update email/password
  - Delete users
  - View account type, last login, onboarding status

#### `/admin/tools`
- **File**: `(admin)/admin/tools/page.tsx`
- **What it does**: System tools dashboard. Buttons to manually trigger:
  - SAM.gov ingestion
  - Match scoring
  - Enrichment orchestrator
  - AI win strategy generation
  - USASpending enrichment
  - Contractor discovery
  - Contact enrichment
  - Attachment download
- Shows output/errors from each run.

#### `/admin/messages`
- **File**: `(admin)/admin/messages/page.tsx`
- **What it does**: Admin inbox showing all client conversations. Shows:
  - List of all clients with unread message counts
  - Click to open conversation
  - Reply as admin
  - Messages sorted by most recent

#### `/admin/settings`
- **File**: `(admin)/admin/settings/page.tsx`
- **What it does**: Admin-level settings (system configuration).

#### `/admin/presentations/tdi`
- **File**: `(admin)/admin/presentations/tdi/page.tsx`
- **What it does**: BCG-style executive sales presentation specifically for TD&I Cable. Web-based slide deck for pitching the consulting service.

#### `/lead-check` and `/lead-check/[analysisId]`
- **File**: `(admin)/lead-check/page.tsx` and `(admin)/lead-check/[analysisId]/page.tsx`
- **What it does**: Internal version of the Quick Checker. Same as `/check` but shows **ALL** data including:
  - LinkedIn URLs
  - Email addresses
  - Apollo enrichment data
  - Phone numbers
  - Full contact details
- Used by the sales team to research leads before outreach.

---

### 6.5 Onboarding

#### `/onboard`
- **File**: `(onboarding)/onboard/page.tsx`
- **What it does**: Multi-step onboarding flow for new self-service users:
  1. Company info (name, website, UEI)
  2. SAM.gov entity lookup (auto-fills profile if registered)
  3. NAICS codes selection
  4. Certifications
  5. Target states and preferences
- After completion, triggers initial match scoring.
- Consulting clients skip this (onboarding_complete = true at creation).

---

### 6.6 API Routes

All API routes are in `/dashboard/src/app/api/`. They run as Vercel Serverless Functions.

#### Admin Routes (`/api/admin/*`)

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/admin/clients` | GET | Admin | List all consulting clients with stats (tasks, docs, matches, last login) |
| `/api/admin/clients` | POST | Admin | Create new consulting client. Creates auth user + profile + 10 default tasks + sends welcome email + triggers NAICS crawl |
| `/api/admin/clients` | PATCH | Admin | Update client profile fields (whitelisted fields only) |
| `/api/admin/clients` | DELETE | Admin | Deactivate client (sets status to "churned", does NOT delete) |
| `/api/admin/tasks` | GET | Admin | List tasks for a client. Query: `?user_profile_id=xxx` |
| `/api/admin/tasks` | POST | Admin | Create task for a client. Can optionally send email notification |
| `/api/admin/tasks` | PATCH | Admin | Update task status (mark complete, change status) |
| `/api/admin/documents` | GET | Admin | List documents for a client |
| `/api/admin/documents` | POST | Admin | Create document record (after file is uploaded to Storage) |
| `/api/admin/documents` | DELETE | Admin | Delete a document record |
| `/api/admin/competitors` | GET | Admin | List competitors. Optional `?user_profile_id=xxx` filter |
| `/api/admin/competitors` | POST | Admin | Add competitor to a client |
| `/api/admin/competitors` | DELETE | Admin | Delete a competitor. Query: `?id=xxx` |
| `/api/admin/enrich-profile` | POST | Admin | Run full enrichment pipeline on a client profile: website crawl, SAM.gov lookup, USASpending history, Apollo people match |
| `/api/admin/send-update` | POST | Admin | Send email to client. Type "opportunities" auto-fetches top matches. Type "custom" sends custom subject/body |
| `/api/admin/crawl-opportunities` | POST | Admin | On-demand SAM.gov crawl by NAICS codes. Used when onboarding new clients. Params: naics_codes[], days_back, user_profile_id |
| `/api/admin/users` | GET | Admin | List all auth users with profiles |
| `/api/admin/users` | PATCH | Admin | Update user email or password |
| `/api/admin/users` | DELETE | Admin | Delete user (auth + profile cascade) |

#### AI Routes (`/api/ai/*`)

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/ai/capability-statement` | POST | Auth | Generate AI capability statement from user profile + optional voice transcript, past projects, differentiators. Uses GPT-4o-mini |
| `/api/ai/generate-proposal` | POST | Auth | Generate structured proposal outline for an opportunity. Returns sections, win themes, differentiators, compliance checklist |
| `/api/ai/write-proposal` | POST | Auth | Full AI proposal writer. Generates complete written sections (not just outlines). Params: notice_id, sections, tone, max_pages |
| `/api/ai/summarize-document` | POST | Auth | Summarize an opportunity description, attached PDF, or arbitrary text. Returns executive summary, key requirements, evaluation criteria |

#### Company Analysis (`/api/analyze-company/*`)

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/analyze-company` | POST | None | Start a Quick Checker analysis. Body: { company_name, website, uei? }. Kicks off async pipeline: crawl -> SAM lookup -> NAICS classification -> scoring -> AI summary. Returns analysis_id |
| `/api/analyze-company/status/[analysisId]` | GET | None | Poll analysis status. Returns current status + results when complete |

#### Cron Routes (`/api/cron/*`)

See [Section 8: Cron Jobs](#8-cron-jobs--automation) for detailed documentation.

#### Intelligence Routes (`/api/intelligence/*`)

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/intelligence/awards` | GET | None | USASpending award intelligence. Params: `naics`, `agency`, `limit`, `years`. Returns awards, top recipients, incumbents, spending by year. Cached 1 hour |
| `/api/intelligence/fpds` | GET | None | FPDS historical contract data. Params: `naics`, `agency`, `company`, `years`. Returns who wins, how much, trends |
| `/api/intelligence/market-size` | GET | None | Market sizing. Params: `naics` (comma-separated), `years`. Returns total spend, YoY growth, top agencies, set-aside breakdown, geographic distribution |

#### SAM.gov Proxy Routes (`/api/sam/*`)

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/sam/entity` | GET | Auth | SAM.gov entity lookup. Params: `uei` or `name`. Returns company registration details: UEI, CAGE, address, NAICS codes, SBA certifications, phone, website |
| `/api/sam/description` | GET | Auth | Fetch full description for a notice. Param: `noticeId`. Handles the case where description is a URL to SAM.gov |
| `/api/sam/attachments` | GET | Auth | Get attachment URLs for a notice from SAM.gov |

#### Stripe Routes (`/api/stripe/*`)

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/stripe/checkout` | POST | Auth | Create Stripe Checkout session for Pro subscription. Returns checkout URL |
| `/api/stripe/portal` | POST | Auth | Create Stripe Customer Portal session for managing subscription |
| `/api/stripe/webhook` | POST | None | Stripe webhook handler. Processes subscription events (created, updated, deleted). Updates user_profiles subscription fields |

#### Other Routes

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/matches/refresh` | POST | Auth | Re-scores all opportunities for the logged-in user. Runs the TypeScript scoring engine in-process. Returns HOT/WARM/COLD counts |
| `/api/partners/search` | GET | None | Search SAM.gov Entity API for teaming partners. Params: `naics`, `state`, `set_aside`, `keyword`, `limit` |
| `/api/opportunities/search-naics` | POST | None | On-demand SAM.gov crawl by NAICS. Ensures we have enough opportunities in the DB for given codes. Body: { naics_codes, min_results, days_back, active_only } |
| `/api/eligibility` | POST | None | Check eligibility for a specific opportunity. Body: { user_profile_id, notice_id }. Returns eligible (bool), reasons, missing items, recommendations, match_strength |
| `/api/lead-matches` | POST | None | Anonymous match scoring for lead magnet. Body: temporary profile. Returns top 10 matches (3 full + 7 titles only). No auth, no DB writes |
| `/api/lead-magnet/confirm` | POST | None | Re-scores matches with user-corrected profile data from Quick Checker mini-onboarding. Updates company_analyses |
| `/api/prospects/save` | POST | None | Mark a company_analyses record as saved (admin prospect bookmarking) |
| `/api/prospects/list` | GET | None | List prospect analyses for admin |
| `/api/prospects/pdf/[analysisId]` | GET | None | Generate PDF report for a prospect analysis |
| `/api/saved-searches` | POST/GET/DELETE | Auth | CRUD for saved searches with alert preferences |
| `/api/email/welcome` | POST | None | Send welcome email. Body: { email, company_name } |
| `/api/brand` | POST | None | Extract brand kit from website (logo, colors, favicon). Body: { website, user_profile_id? } |
| `/api/drafts/generate` | POST | Auth | Generate email drafts for outreach to contracting officers |
| `/api/letters/generate` | POST | Auth | Generate cover/introduction letters using Gemini AI |
| `/api/grants/sbir` | GET | None | Search SBIR.gov for Small Business Innovation Research grants. Params: `keywords`, `agency`, `year`, `open` |
| `/api/idiq` | GET | None | Search for IDIQ contracts via USASpending. Params: `naics`, `agency`, `keyword`, `limit` |
| `/api/enrich/[opportunityId]` | GET | Auth | Trigger enrichment for a specific opportunity |
| `/api/enrich/status/[opportunityId]` | GET | Auth | Check enrichment status for an opportunity |
| `/api/engine/[action]` | POST | None | Run Python tools by name. Actions: ingest, score, drafts, log, discover, enrich_deep, attachments, orchestrate, win_strategy, usaspending, download_attachments |
| `/api/webhooks` | POST | None | General webhook handler |

---

## 7. Marketing Website (capturepilot.com)

The marketing website is a **separate Next.js application** in the `/website/` directory. It is deployed to Vercel separately from the dashboard app.

### Homepage and Core Pages

| Page | URL | Description |
|------|-----|-------------|
| Homepage | `/` | Main marketing landing page. Product overview, hero section, features, social proof, CTA |
| About | `/about` | Company story, team, mission |
| Pricing | `/pricing` | Pricing plans and comparison |
| Process | `/process` | How the consulting service works (step-by-step) |
| Demo | `/demo` | Product demo request or video walkthrough |
| Quick Checker | `/check` | Landing page that embeds or links to the Quick Checker tool |

### Feature Pages

| Page | URL | Description |
|------|-----|-------------|
| Features Overview | `/features` | All features at a glance |
| Matching | `/features/matching` | Opportunity matching and scoring feature |
| Pipeline | `/features/pipeline` | Pursuit pipeline management feature |
| Intelligence | `/features/intelligence` | Market intelligence and incumbent data |
| Proposals | `/features/proposals` | AI proposal writing feature |
| Capability Statement | `/features/capability-statement` | AI capability statement builder |
| Quick Checker | `/features/quick-checker` | Quick Checker feature page |

### Audience Pages

| Page | URL | Description |
|------|-----|-------------|
| Small Business | `/for/small-business` | Tailored messaging for small businesses |
| Veterans | `/for/veterans` | Tailored for veteran-owned businesses (SDVOSB/VOSB) |
| Women-Owned | `/for/women-owned` | Tailored for women-owned businesses (WOSB/EDWOSB) |
| Agencies | `/for/agencies` | Tailored for contracting agencies |

### Competitor Comparison Pages

| Page | URL | Description |
|------|-----|-------------|
| Comparisons Hub | `/vs` | All competitor comparisons |
| vs GovWin | `/vs/govwin` | CapturePilot vs GovWin (Deltek) |
| vs GovTribe | `/vs/govtribe` | CapturePilot vs GovTribe |
| vs BGOV | `/vs/bgov` | CapturePilot vs Bloomberg Government |
| vs Federal Compass | `/vs/federal-compass` | CapturePilot vs Federal Compass |
| vs HigherGov | `/vs/highergov` | CapturePilot vs HigherGov |
| vs GovDash | `/vs/govdash` | CapturePilot vs GovDash |
| vs SAM.gov | `/vs/sam-gov` | CapturePilot vs using SAM.gov directly |
| vs SweetSpot | `/vs/sweetspot` | CapturePilot vs SweetSpot |
| vs Unison | `/vs/unison` | CapturePilot vs Unison Marketplace |
| vs Capture2Proposal | `/vs/capture2proposal` | CapturePilot vs Capture2Proposal |
| vs EZGovOpps | `/vs/ezgovopps` | CapturePilot vs EZGovOpps |

### Blog

| Page | URL | Description |
|------|-----|-------------|
| Blog Index | `/blog` | All blog posts |
| Gov Contracting 101 | `/blog/government-contracting-101` | Introductory guide |
| NAICS Codes Explained | `/blog/naics-codes-explained` | What NAICS codes are and how to use them |
| SAM Registration Guide | `/blog/sam-registration-guide` | Step-by-step SAM.gov registration |
| Set-Aside Programs | `/blog/set-aside-programs` | Guide to SBA set-aside programs |
| Capability Statement Guide | `/blog/capability-statement-guide` | How to write a capability statement |
| Proposal Writing Tips | `/blog/proposal-writing-tips` | Federal proposal best practices |
| How to Find Gov Contracts | `/blog/how-to-find-government-contracts-small-business` | Finding contracts for small business |

### Resources

| Page | URL | Description |
|------|-----|-------------|
| Bid Checklist | `/resources/bid-checklist` | Pre-bid checklist template |
| Proposal Template | `/resources/proposal-template` | Federal proposal template |
| Quick Checker Guide | `/resources/quick-checker-guide` | How to use the Quick Checker tool |

### Presentations

| Page | URL | Description |
|------|-----|-------------|
| Presentations Hub | `/presentations` | Overview of available presentations |
| Product Presentation | `/presentations/product` | Product overview slide deck |
| TDI Presentation | `/presentations/tdi` | TD&I Cable client-specific presentation |

### Other

| Page | URL | Description |
|------|-----|-------------|
| Walkthrough | `/walkthrough` | Interactive product walkthrough |
| Embed | `/embed` | Embeddable widget version of Quick Checker |

---

## 8. Cron Jobs & Automation

Cron jobs are configured in `/dashboard/vercel.json` and run automatically on Vercel. Each cron hits an API route with a `Bearer ${CRON_SECRET}` authorization header.

### Cron Schedule

| # | Name | Schedule (UTC) | Mexico City Time | API Route | Description |
|---|------|---------------|------------------|-----------|-------------|
| 1 | **ingest_sam** | `0 2 * * *` (daily 2:00am) | 8:00pm prev day | `/api/cron/ingest_sam` | Fetch new SAM.gov opportunities from last 3 days. Processes Sources Sought, Presolicitations, Solicitations, and Combined notices. Upserts to opportunities table |
| 2 | **ingest_grants** | `30 2 * * *` (daily 2:30am) | 8:30pm prev day | `/api/cron/ingest_grants` | Fetch grants from Simpler.Grants.gov. Posted and forecasted grants from last 7 days. Stores as notice_type='Grant' with GRANT- prefix on notice_id |
| 3 | **score_matches** | `0 3 * * *` (daily 3:00am) | 9:00pm prev day | `/api/cron/score_matches` | Run Python scoring engine (`tools/2_score_matches.py`). Scores all active opportunities against all user profiles. 140-point scale. Writes to user_matches table |
| 4 | **db_cleanup** | `0 4 * * 0` (weekly Sun 4:00am) | Sat 10:00pm | `/api/cron/db_cleanup` | Lifecycle management. Transitions: ACTIVE->EXPIRING_SOON (7 day), ACTIVE->EXPIRED (past deadline), MARKET_RESEARCH->INTELLIGENCE (past deadline), EXPIRED->ARCHIVED (120 days), ARCHIVED->DELETE (12 months). Also cleans stale matches and flags LOW_QUALITY contractors |
| 5 | **enrich** | `0 5 * * *` (daily 5:00am) | 11:00pm prev day | `/api/cron/enrich` | Run Python enrichment orchestrator (`tools/10_enrichment_orchestrator.py`) |
| 6 | **backfill_requirements** | `0 6 * * *` (daily 6:00am) | 12:00am | `/api/cron/backfill_requirements` | Extract requirements from raw_json. Parses bonding, insurance, clearance, experience years, workforce, equipment, certifications. Also extracts contacts and backfills department/value |
| 7 | **competitor_monitor** | `0 7 * * 0` (weekly Sun 7:00am) | Sun 1:00am | `/api/cron/competitor_monitor` | Re-crawl competitor websites. Check for new services, leadership changes, USASpending awards. Max 10 competitors per run. Logs changes to client_activity_log |
| 8 | **deep_enrich** | `0 8 * * *` (daily 8:00am) | 2:00am | `/api/cron/deep_enrich` | Fetch full descriptions from SAM.gov URLs, download PDF attachments, extract text, parse requirements (bonding amounts, insurance, clearance, equipment, certs, period of performance), estimate values. Processes 50 opportunities per run |
| 9 | **notify_matches** | `0 10 * * *` (daily 10:00am) | 4:00am | `/api/cron/notify_matches` | Send email alerts for high-scoring matches. Only sends to users not notified in last 24 hours. Sends top 5 matches per user via Resend |
| 10 | **monthly_awards** | `0 0 1 * *` (1st of month midnight) | Last day 6:00pm | `/api/cron/monthly_awards` | Fetch Award Notices (identify winners, incumbents) and Forecast Notices (early pipeline signals) from SAM.gov. Last 30 days. Sets retention_protected=true for awards |

### Cron Jobs NOT in vercel.json (inactive/manual only)

| Name | API Route | Description |
|------|-----------|-------------|
| enrich_apollo | `/api/cron/enrich_apollo` | Enrich contractors with Apollo.io data (company search + org enrichment). Processes 50 contractors per run with 1.5s rate limit delay |
| enrich_contractors | `/api/cron/enrich_contractors` | Run Python contractor enrichment script (`tools/5_enrich_contractors.py`). Processes 200 contractors per run |
| ai_strategy | `/api/cron/ai_strategy` | Generate AI win strategies for opportunities using GPT-4o-mini. Processes 20 opportunities per run with 1s delay. NOT scheduled -- run manually from admin tools |

---

## 9. Python Tools

Python scripts in `/tools/` handle heavy processing that runs outside the Node.js serverless environment. They connect directly to Supabase using environment variables.

**Requirements**: Python 3.8+, packages in `/tools/requirements.txt`

### Tool List

| Script | Description | How to Run |
|--------|-------------|------------|
| `1_ingest_sam.py` | Original SAM.gov ingestion script (now replaced by TypeScript cron, kept as backup) | `python3 tools/1_ingest_sam.py` |
| `1a_database_cleanup.py` | Database cleanup/maintenance utility | `python3 tools/1a_database_cleanup.py` |
| `2_score_matches.py` | **Main scoring engine**. Scores all active opportunities against all user profiles using 140-point scale. NAICS (25%), PSC (15%), Set-Aside (20%), Geo (15%), Value (15%), Deadline (10%). Called by cron/score_matches | `python3 tools/2_score_matches.py` |
| `3_generate_email_drafts.py` | Generate outreach email drafts for users based on their matches | `python3 tools/3_generate_email_drafts.py` |
| `4_log_outcome.py` | Weekly outcome logging and intelligence gathering | `python3 tools/4_log_outcome.py` |
| `5_award_intelligence.py` | SAM.gov Award Notice scraper + USASpending. Identifies incumbents and award amounts | `python3 tools/5_award_intelligence.py` |
| `5_enrich_contractors.py` | Enrich SAM.gov contractors with additional data. Called by cron/enrich_contractors | `python3 tools/5_enrich_contractors.py --limit 200` |
| `6_attachment_intelligence.py` | Download and parse SAM.gov attachments (PDFs, docs) | `python3 tools/6_attachment_intelligence.py` |
| `7_discover_contractors.py` | Discover new contractors from SAM.gov entity API | `python3 tools/7_discover_contractors.py` |
| `8_enrich_contacts.py` | Enrich contact information from SAM.gov POCs | `python3 tools/8_enrich_contacts.py` |
| `10_enrichment_orchestrator.py` | **Master enrichment orchestrator**. Coordinates all enrichment tasks. Called by cron/enrich | `python3 tools/10_enrichment_orchestrator.py --trigger auto` |
| `10_enrich_descriptions.py` | Fetch full descriptions from SAM.gov for opportunities with URL-only descriptions | `python3 tools/10_enrich_descriptions.py` |
| `10b_fast_enrich.py` | Fast/lightweight enrichment variant | `python3 tools/10b_fast_enrich.py` |
| `11_backfill_contractors.py` | Backfill contractor data from various sources | `python3 tools/11_backfill_contractors.py` |
| `11_backfill_from_rawjson.py` | Backfill opportunity fields from stored raw_json | `python3 tools/11_backfill_from_rawjson.py` |
| `12_usaspending_enrich.py` | Enrich opportunities with USASpending data (award history, incumbents) | `python3 tools/12_usaspending_enrich.py` |
| `13_download_attachments.py` | Download PDF/DOCX attachments from SAM.gov | `python3 tools/13_download_attachments.py` |
| `14_fix_indexes.sql` | SQL script for fixing/adding database indexes (run in SQL Editor) | Run in Supabase SQL Editor |
| `15_ai_win_strategy.py` | Generate AI win strategies using OpenAI | `python3 tools/15_ai_win_strategy.py` |
| `16_backfill_values.py` | Backfill estimated_value from raw_json/description | `python3 tools/16_backfill_values.py` |
| `17_analyze_company.py` | Company analysis utility (similar to Quick Checker) | `python3 tools/17_analyze_company.py` |
| `20_backfill_all.py` | Master backfill script -- runs all backfill operations | `python3 tools/20_backfill_all.py` |
| `check_db_stats.py` | Print database statistics (counts per table, status distribution) | `python3 tools/check_db_stats.py` |

### Scoring Algorithm (tool 2)

The scoring engine in `2_score_matches.py` uses a deterministic, rules-based approach (NOT AI):

| Factor | Weight | How It Works |
|--------|--------|--------------|
| NAICS Match | 25% | Exact match = full points. Same 4-digit prefix = partial |
| PSC Match | 15% | Exact match on Product Service Code |
| Set-Aside Match | 20% | Full points if user has the required certification |
| Geographic Match | 15% | State match against user's target states |
| Value Fit | 15% | Contract value within user's preferred range |
| Deadline | 10% | Closer deadlines score higher (urgency) |
| Notice Type Bonus | +20 points | Sources Sought/RFI get a bonus (early engagement opportunity) |
| Past Performance | 0-20 points | Based on user's federal_awards_count |
| Incumbent Risk | -15 to 0 | Penalty if incumbent is identified |

**Classification**:
- HOT: score >= 0.70 (70%)
- WARM: score 0.50-0.70
- COLD: score < 0.50

---

## 10. External APIs

### SAM.gov Opportunities API

| Item | Value |
|------|-------|
| Base URL | `https://api.sam.gov/opportunities/v2/search` |
| Auth | `X-Api-Key` header (IMPORTANT: NOT URL params) |
| Env var | `SAM_API_KEY` |
| Rate limit | ~10 requests/second, daily quota varies by tier |
| What we use it for | Daily ingestion of federal contract opportunities. Search by date range, notice type (ptype), NAICS code. Returns titles, descriptions, deadlines, agencies, set-asides, POCs |
| Ptype codes | r=Sources Sought, p=Presolicitation, o=Solicitation, k=Combined, a=Award, f=Forecast |

### SAM.gov Entity API

| Item | Value |
|------|-------|
| Base URL | `https://api.sam.gov/entity-information/v3/entities` |
| Auth | `api_key` URL param + `X-Api-Key` header |
| Env var | `SAM_API_KEY` (same key) |
| What we use it for | Look up companies by UEI or name. Returns registration details, NAICS codes, certifications, addresses, POCs. Used for onboarding (auto-fill profile), partner search, and enrichment |

### USASpending.gov API

| Item | Value |
|------|-------|
| Base URL | `https://api.usaspending.gov/api/v2/` |
| Auth | **None required** (free public API) |
| Env var | None |
| Rate limit | Generous but undocumented. We use AbortSignal timeout of 10-25s |
| Endpoints we use | `search/spending_by_award/` (individual awards), `search/spending_by_category/recipient/` (top recipients), `search/spending_over_time/` (trends) |
| What we use it for | Award intelligence: who wins contracts, how much, market sizing. Incumbent identification. Competitor monitoring (recent awards). Historical spending trends by NAICS/agency |

### Grants.gov / Simpler Grants API

| Item | Value |
|------|-------|
| Base URL | `https://api.simpler.grants.gov/v1/opportunities/search` |
| Auth | `X-Api-Key` header |
| Env var | `GRANTS_API_KEY` |
| What we use it for | Daily ingestion of federal grant opportunities. Stored as notice_type='Grant' with GRANT- prefix on notice_id. Mapped to approximate NAICS codes via category |

### Apollo.io API

| Item | Value |
|------|-------|
| Base URL | `https://api.apollo.io/api/v1/` |
| Auth | `X-Api-Key` header |
| Env var | `APOLLO_API_KEY` |
| Rate limit | Free tier: limited. We use 1.5s delay between requests |
| Endpoints we use | `mixed_companies/search` (company search, free tier), `organizations/enrich` (org enrichment), `people/match` (find person by name + company) |
| What we use it for | Contractor enrichment (website, LinkedIn, employee count, revenue, industry). Lead enrichment in Quick Checker. Finding decision-maker contact details |
| IMPORTANT | Use `mixed_companies/search` (NOT `mixed_people/search` which is blocked on free tier) |

### OpenAI API

| Item | Value |
|------|-------|
| Model | `gpt-4o-mini` |
| Auth | Standard API key |
| Env var | `OPENAI_API_KEY` |
| What we use it for | AI win strategies (analyze opportunity + generate strategy JSON), NAICS classification from website content, proposal outline/writing, document summarization, capability statement generation, company summary for Quick Checker |
| Rate limit | Standard OpenAI rate limits. 1s delay between requests in batch operations |

### Resend (Email)

| Item | Value |
|------|-------|
| Auth | API key |
| Env var | `RESEND_API_KEY` |
| What we use it for | Transactional emails: welcome emails, task notifications, opportunity alerts, custom emails from admin. Sender: CapturePilot <noreply@capturepilot.com> |
| Email templates | Defined in `/dashboard/src/lib/email.ts`: `sendWelcomeEmail`, `sendConsultingWelcomeEmail`, `sendTaskNotification`, `sendOpportunityAlert` |

### Stripe

| Item | Value |
|------|-------|
| Auth | Secret key + webhook secret |
| Env vars | `STRIPE_SECRET_KEY`, `STRIPE_PRO_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` |
| What we use it for | SaaS subscription billing. Checkout sessions, customer portal, webhook processing for subscription lifecycle events |

### SBIR.gov API

| Item | Value |
|------|-------|
| Base URL | `https://www.sbir.gov/api` |
| Auth | **None required** (free public API) |
| What we use it for | Search for SBIR/STTR grants (Small Business Innovation Research). Available in the grants/sbir endpoint |

---

## 11. Deployment

### Dashboard App Deployment

The dashboard app auto-deploys from git push to Vercel.

**Steps to deploy**:

```bash
# From the project root (/Caturepilot 2.0/)
git add .
git commit -m "description of changes"
git push captiorpilot main && git push live main && git push globerocker main
```

- `captiorpilot` remote triggers Vercel auto-deploy for the dashboard
- `live` remote also triggers Vercel auto-deploy (backup)
- `globerocker` remote pushes to GitHub (code backup)

**Vercel settings**:
- Project: capturepilot-v3 (note: there is a typo "captiorpilot" in the Vercel project name)
- Framework: Next.js
- Root directory: `dashboard/` (Vercel builds from this subdirectory)
- Build command: `npm run build`
- Install command: `npm install`

### Marketing Website Deployment

The website is a separate Vercel project. It deploys from the `/website/` directory.

### Local Development

```bash
# Dashboard
cd dashboard
npm install
npm run dev          # Starts dev server on http://localhost:3000

# Build check (before pushing)
npm run build        # Full production build
npm run lint         # Lint check
```

### Clearing Build Cache

If you get mysterious import errors after changes:

```bash
# Local
rm -rf dashboard/.next
npm run build

# Vercel
# Go to Vercel dashboard > Project Settings > Build & Output > Clear Build Cache
```

---

## 12. Git Remotes

| Remote | Repository | Purpose |
|--------|-----------|---------|
| `origin` | capturepilot-v2 (legacy) | **DO NOT USE** -- has embedded token |
| `globerocker` | [github.com/Globerocker/capturepilot-v3](https://github.com/Globerocker/capturepilot-v3) | **Primary GitHub repo**. Use for all pushes |
| `captiorpilot` | CaptiorpilotV3 | **Vercel-connected**. Push here triggers dashboard deploy |
| `live` | Capturepilot-Live | **Also Vercel-connected**. Push here also triggers deploy |

### Standard Deploy Command

```bash
git push captiorpilot main && git push live main && git push globerocker main
```

This pushes to all three remotes. Both `captiorpilot` and `live` trigger Vercel deployments. `globerocker` updates GitHub.

---

## 13. Common Tasks & How-Tos

### How to Add a New Consulting Client

1. Go to **Admin Panel** > **Clients** (`/admin/clients`)
2. Click **"Create New Client"**
3. Fill in the form:
   - **Email**: Client's email (an auth account will be created)
   - **Company Name**: Legal business name
   - **Contact Name**: Primary contact person
   - **Website**: Company website (used for crawling)
   - **UEI**: SAM.gov Unique Entity Identifier (if known)
   - **NAICS Codes**: Their industry codes
   - **State/City**: Location
   - **SBA Certifications**: 8(a), SDVOSB, WOSB, HUBZone, etc.
4. System automatically:
   - Creates Supabase Auth user
   - Creates user_profiles record with `account_type = 'consulting'`
   - Generates 10 default onboarding tasks
   - Sends welcome email with temp password
   - Triggers NAICS-based opportunity crawl (90 days back)
   - Sends Slack notification
5. After creation, go to client detail page and click **"Enrich Profile"** to run the full enrichment pipeline (website crawl, SAM lookup, USASpending, Apollo)

**API equivalent**:
```
POST /api/admin/clients
Body: { email, company_name, contact_name, website, naics_codes, state, sba_certifications }
```

### How to Run the Scorer for a Specific User

**Option A: From the Dashboard (user-facing)**
- The user clicks "Refresh Matches" on their `/matches` page
- This calls `POST /api/matches/refresh` which runs the TypeScript scoring engine

**Option B: Run for ALL users via cron**
- Go to **Admin Panel** > **Tools** (`/admin/tools`)
- Click **"Score Matches"** button
- This triggers `POST /api/engine/score` which runs `python3 tools/2_score_matches.py`
- Or call the cron endpoint: `GET /api/cron/score_matches` with `Authorization: Bearer ${CRON_SECRET}`

### How to Check Cron Logs

1. Go to **Vercel Dashboard** > **capturepilot-v3** > **Logs**
2. Filter by:
   - Function: `/api/cron/ingest_sam` (or any cron route)
   - Time range: last 24 hours
3. Each cron run logs its progress and results:
   - `ingest_sam`: "Processed: X, Upserted: Y"
   - `score_matches`: Python stdout with match counts
   - `db_cleanup`: stats per lifecycle transition
   - `notify_matches`: "sent: X, total_users: Y"

Alternatively, check Vercel > **Crons** tab to see last run status and timing.

### How to Add a New Competitor for a Client

**Option A: Admin Panel**
1. Go to `/admin/clients/[id]`
2. Scroll to Competitors section
3. Click "Add Competitor"
4. Enter: competitor name, website, UEI (if known), NAICS codes
5. The weekly `competitor_monitor` cron will automatically crawl and update

**Option B: Client Portal**
1. Client goes to `/portal/competitors`
2. Clicks "Add Competitor"
3. Enters competitor details

**API**:
```
POST /api/admin/competitors
Body: { user_profile_id, competitor_name, website, naics_codes }
```

### How to Send a Welcome Email

Welcome emails are sent automatically when creating a consulting client. To resend:

```
POST /api/email/welcome
Body: { email: "client@example.com", company_name: "Acme Corp" }
```

### How to Send an Opportunity Update Email

```
POST /api/admin/send-update
Body: { user_profile_id: "uuid-here", type: "opportunities" }
```

This auto-fetches the client's top 5 matches and sends a formatted email.

For custom emails:
```
POST /api/admin/send-update
Body: { user_profile_id: "uuid-here", type: "custom", subject: "Subject", body: "HTML body" }
```

### How to Do a Bulk NAICS Crawl

When you need to ensure the database has enough opportunities for specific NAICS codes (e.g., onboarding a client in a new industry):

```
POST /api/admin/crawl-opportunities
Body: {
  "naics_codes": ["237130", "237110", "237120"],
  "days_back": 90,
  "user_profile_id": "optional-uuid"
}
```

This crawls SAM.gov for all notice types (Sources Sought, Presol, Sol, Combined) for each NAICS code going back the specified number of days.

### How to Run the Full Enrichment Pipeline on a Client

1. Go to `/admin/clients/[id]`
2. Click **"Enrich Profile"** button

This calls `POST /api/admin/enrich-profile` which runs:
1. Website crawl (services, contacts, leadership, social)
2. SAM.gov entity lookup (UEI, CAGE code, address, NAICS, certs)
3. USASpending award history (past federal contracts)
4. Apollo people match (find contact's LinkedIn, phone, email)
5. Updates profile with all discovered data
6. Logs activity

### How to Access the Admin Panel

1. Log in at https://app.capturepilot.com/login with an admin account
2. Navigate to `/admin/overview`
3. Or access any admin URL directly (e.g., `/admin/clients`)

### How to Manually Trigger a Cron Job

From the Admin Tools page (`/admin/tools`), click any tool button. Alternatively, call the cron API directly:

```bash
curl -X GET "https://app.capturepilot.com/api/cron/ingest_sam" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

### How to Check Database Stats

Run the Python utility:

```bash
cd "/Users/andreschuler/Caturepilot 2.0"
python3 tools/check_db_stats.py
```

This prints counts for all tables, opportunity status distribution, match classification breakdown, etc.

### How to Run a Local Development Build

```bash
cd "/Users/andreschuler/Caturepilot 2.0/dashboard"
npm run dev
```

The app will be available at http://localhost:3000. You need a `.env.local` file with all required environment variables (copy from Vercel environment settings).

### Key Rules to Remember

1. **Icons**: ONLY use `lucide-react`. Never add other icon libraries.
2. **Client components**: Add `"use client"` at the top of all interactive pages.
3. **Supabase joins**: They return objects, not arrays. Cast with `as any[]` if TypeScript complains.
4. **SAM API key**: Use `X-Api-Key` header, NOT URL parameters (URL params are deprecated).
5. **Apollo**: Use `mixed_companies/search` endpoint (free tier). Do NOT use `mixed_people/search`.
6. **Never commit**: `.env`, `.env.local`, `.mcp.json`, or any file containing secrets.

---

*End of documentation. Questions? Check Vercel logs, Supabase dashboard, or this document first.*
