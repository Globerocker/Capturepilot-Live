# Smoke Test Checklist — CapturePilot 2.0

## Quick Checker (Public)
- [ ] Go to `app.capturepilot.com/check`
- [ ] Enter: Company Name + Website
- [ ] Loading stepper shows 5 steps (Crawling → Enriching → Classifying → Finding → Generating)
- [ ] Results page loads with: Summary, Matches, NAICS codes, Key Account Holder
- [ ] PDF Export button works
- [ ] Save button works
- [ ] "Run New Check" button works

## Signup & Login
- [ ] `app.capturepilot.com/signup` — create account with email
- [ ] `app.capturepilot.com/signup` — Google OAuth works
- [ ] `app.capturepilot.com/login` — email login works
- [ ] `app.capturepilot.com/login` — Google login works
- [ ] Self-service user → redirects to `/onboard`
- [ ] Consulting user → redirects to `/portal`
- [ ] Admin user → redirects to `/admin/overview`

## Onboarding (Self-Service)
- [ ] Step 0: SAM.gov UEI lookup pre-fills data
- [ ] Step 1-4: Form fields work, validation
- [ ] Save → triggers match scoring
- [ ] Welcome email sent
- [ ] Redirect to `/dashboard`

## SaaS Dashboard
- [ ] Dashboard shows KPIs (Matches, Strong Matches, Available Contracts, Urgent)
- [ ] Market Intelligence component loads (spending charts, top agencies)
- [ ] My Matches page loads with filtered results (no expired)
- [ ] Eligibility badges show on each match card (✓ Eligible / Cert Needed / Open)
- [ ] Click match title → opens `/opportunities/[id]` detail page
- [ ] Browse All page loads with grid/list view
- [ ] My Deals (Pipeline) shows kanban stages
- [ ] Find Partners page → search SAM.gov
- [ ] Capability Statement page → voice recording + brand extraction + AI generation
- [ ] Settings page → save changes, Google Connect button, Nationwide toggle
- [ ] Sign Out → clears session, redirects to login

## Consulting Portal (SmartPipe Test)
- [ ] Login: `donny.mccallum@smart-pipe.com` / `CP-4b2X2kxt!`
- [ ] Redirects to `/portal`
- [ ] Overview: stats, expiring opps, tasks, activity
- [ ] My Matches: filtered (no expired), eligibility badges
- [ ] Click match → detail page with Eligibility Check, AI Analysis, Proposal buttons
- [ ] My Deals: kanban pipeline with stage changes
- [ ] To-Do List: 10 tasks, mark complete, expand details
- [ ] Capability Statement: voice + brand + generate
- [ ] Find Partners: search by NAICS
- [ ] Competitors: 5 competitors with overlap scores, expandable details
- [ ] Documents: upload (check RLS works), delete
- [ ] Account: edit profile, change password, Google Connect
- [ ] Sign Out works cleanly (no back-button cache issue)

## Admin Panel
- [ ] Login: `admin@capturepilot.com` / `Admin2026!CP`
- [ ] Or: `admin.capturepilot.com`
- [ ] Dashboard: KPIs, client table, health scores, needs-attention
- [ ] Clients: list, search, expand, click name → detail page
- [ ] Client Detail: edit form, tabs (Overview, Pipeline, Tasks, Docs, Competitors, Activity)
- [ ] Client Detail: assign task with email notification
- [ ] Opportunities: browse all, filters (status, NAICS, set-aside, veteran/wosb/sb)
- [ ] Opportunities: pagination works
- [ ] Leads: Quick Checker results, pipeline status, AI outreach button
- [ ] Sales Pipeline: kanban with 10 stages
- [ ] Users: list, edit email/password, switch account type, delete
- [ ] Tools: NAICS crawler, AI analysis, proposal writer, SBIR search, partner search, IDIQ search
- [ ] Settings: URLs, database info, API keys, infrastructure

## Email (requires RESEND_API_KEY)
- [ ] Welcome email on signup
- [ ] Consulting welcome email on client creation
- [ ] Task notification email on task assignment
- [ ] Opportunity alert email (daily cron)

## Crons (Vercel)
- [ ] Check Sentry for errors from crons
- [ ] Verify ingest_sam ran (check recent opportunities)
- [ ] Verify score_matches ran (check user_matches table)

## Data Quality
- [ ] 892 NAICS codes with titles ✓
- [ ] 39K+ opportunities in database
- [ ] Descriptions: check count (should increase daily from enrichment)
- [ ] Estimated values: check count (should increase from enrichment)
