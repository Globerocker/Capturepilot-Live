# HubSpot CRM Setup via AI Coding Agent
### A Complete Guide for Agencies, Consultants & Developers

*Created: April 2026 — Distilled from a real production setup for Americurial LLC / CapturePilot*

---

> **What this is:** A step-by-step guide + copy-paste prompts to set up a fully configured HubSpot CRM portal — custom properties, pipelines, contact lists, tracking code, and app integrations — in under 2 hours using an AI coding assistant (Claude, Cursor, etc.) instead of clicking through the HubSpot UI for days.
>
> **Who it's for:** Agencies onboarding new clients, SaaS founders connecting their app to HubSpot, CRM consultants, or anyone who wants to go from zero to a production-ready HubSpot setup fast.

---

## Table of Contents

1. [The Approach — Why AI + API beats clicking the UI](#1-the-approach)
2. [What You Need Before Starting](#2-prerequisites)
3. [Phase 1 — Plan Your CRM Architecture (Brainstorm Prompt)](#3-phase-1-brainstorm)
4. [Phase 2 — Create Your HubSpot Private App + Scopes](#4-phase-2-private-app)
5. [Phase 3 — Run the AI Provisioning Agent (Master Prompt)](#5-phase-3-provisioning)
6. [Phase 4 — Connect Your Website/App](#6-phase-4-connect)
7. [Phase 5 — Email Sequences & Automation](#7-phase-5-sequences)
8. [HubSpot Plan Comparison & API Limits](#8-plan-limits)
9. [Lessons Learned & Gotchas](#9-gotchas)
10. [Adapting This for Pipedrive & Other CRMs](#10-other-crms)
11. [The Master Brain Prompt (Copy-Paste Ready)](#11-master-prompt)

---

## 1. The Approach

**The old way:** Click through HubSpot UI → create properties one by one → manually configure pipelines → copy-paste tracking code → weeks of setup.

**The AI way:**
1. Write a spec document describing your CRM needs
2. Give it to an AI coding agent with your HubSpot API token
3. The agent writes and runs a Node.js provisioning script that hits HubSpot's REST API
4. Everything is created in minutes — idempotent (safe to re-run)
5. IDs are automatically written back to your `.env` files
6. The agent then wires up your existing app/website

**What gets automated:**
- ✅ All custom contact properties (dropdowns, checkboxes, numbers, text)
- ✅ Deal pipelines with all stages and win probabilities
- ✅ Contact list segments
- ✅ Tracking code on all websites
- ✅ API integration hooks (Stripe, signup, forms)
- ✅ Env variables populated with real IDs

**What still requires the HubSpot UI:**
- ❌ Email sequences (Sales Hub Sequences — API doesn't support creation)
- ❌ Workflow automation (Marketing Hub Workflows — limited API support)
- ❌ Meeting scheduling pages
- ❌ Email template design

---

## 2. Prerequisites

Before you start, collect the following:

### From HubSpot
- [ ] HubSpot account created (free at hubspot.com)
- [ ] **Portal ID** — found in HubSpot URL: `app.hubspot.com/contacts/XXXXXX`
- [ ] **Private App Token** — created in Settings → Integrations → Private Apps (see Phase 2)

### From Your Project
- [ ] Your tech stack (Next.js, Rails, Django, etc.)
- [ ] Where your users sign up (Supabase, Firebase, Auth0, etc.)
- [ ] Your payment processor if any (Stripe, Paddle, etc.)
- [ ] Website URLs (e.g., `app.yourproduct.com`, `yourwebsite.com`)
- [ ] What lifecycle events matter (signup, trial, paid, churn)

### Tools
- [ ] Node.js installed (`node --version`)
- [ ] An AI coding agent (Claude Code, Cursor, Windsurf, etc.)

---

## 3. Phase 1 — Plan Your CRM Architecture

Before writing a single line of code, use this brainstorm prompt with your AI to define your CRM structure. **This is the most important step** — it generates the spec document that drives everything else.

### 🧠 Brainstorm Prompt

Copy this into Claude (or any AI chat), fill in `[YOUR PROJECT]` sections, and you'll get back a complete CRM spec:

```
I want to set up HubSpot CRM for [YOUR COMPANY/PROJECT NAME].

Here's what we do:
[2-3 sentence description of your product/service]

Our customers are:
[Who buys from you — e.g., "small businesses", "freelancers", "e-commerce brands"]

Our business model:
[e.g., "SaaS with free trial and $99/mo paid plan", "agency with project-based billing", "marketplace with commission"]

Our current tech stack:
- Frontend: [React/Next.js/Vue/etc.]
- Auth: [Supabase/Firebase/Auth0/etc.]
- Payments: [Stripe/Paddle/none]
- Database: [PostgreSQL/MongoDB/etc.]
- Hosting: [Vercel/AWS/Heroku/etc.]
- Websites: [list all domains]

Key lifecycle events I care about:
[e.g., "lead visits landing page", "fills out contact form", "signs up", "starts trial", "pays", "cancels", "churns"]

Based on this, please design my HubSpot CRM architecture including:

1. **Custom Contact Properties** — what data fields we need beyond the HubSpot defaults
   (include: name, data type, dropdown options if applicable, description)

2. **Deal Pipelines** — what sales processes we have
   (each pipeline needs: name, stages in order, trigger for each stage, close probability)

3. **Contact Lists/Segments** — what groups we need to email separately
   (each list needs: name, filter criteria)

4. **Events to Track** — what app events should sync to HubSpot
   (map each event to a HubSpot action: create contact, update property, create deal, move stage)

5. **Forms Needed** — what forms on our sites should feed into HubSpot
   (location, fields, what HubSpot action they trigger)

6. **Email Sequences Needed** — nurture or sales sequences
   (trigger, number of emails, timing, goal)

Output this as a structured markdown document I can use as a spec to build the integration.
```

### What You Get Back

The AI will output a complete spec like the one in `docs/HUBSPOT_INTEGRATION.md` in this project. **Save that document** — it becomes the input for Phase 3.

---

## 4. Phase 2 — Create Your HubSpot Private App

This is the one step you MUST do manually in the HubSpot UI. It takes 5 minutes.

### Step-by-Step

1. Go to: `https://app.hubspot.com/private-apps/YOUR_PORTAL_ID`
2. Click **"Create a private app"**
3. Give it a name: `[Your Project] CRM Integration`
4. Click the **Scopes** tab
5. Search for and enable ALL of the following:

**CRM Scopes (required):**
```
crm.objects.contacts.read
crm.objects.contacts.write
crm.objects.deals.read
crm.objects.deals.write
crm.objects.companies.read
crm.objects.companies.write
crm.schemas.contacts.read
crm.schemas.contacts.write
crm.schemas.deals.read
crm.schemas.deals.write
crm.lists.read
crm.lists.write
crm.import
```

**Optional (add if you need them):**
```
crm.objects.leads.read
crm.objects.leads.write
account-info.security.read
content                          (for CMS/pages integration)
```

6. Click **"Create app"**
7. Copy the **Access Token** (`pat-na2-...` or `pat-eu1-...`)
8. Save it somewhere safe — you'll never see it again after closing the modal

> **⚠️ IMPORTANT:** If you add more scopes later, you MUST click "Rotate token" to get a new token that includes the new scopes. The old token will NOT pick up new scopes automatically.

### Find Your Portal ID

Your Portal ID is in the HubSpot URL when you're logged in:
```
https://app.hubspot.com/contacts/245197783  ← this number
```

Or go to: **Settings → Account Setup → Account Details**

---

## 5. Phase 3 — Run the AI Provisioning Agent

Now give your spec document + API token to an AI coding agent and use this prompt:

### 🤖 Master Provisioning Prompt

```
I have a HubSpot CRM spec document and I want you to set up my entire HubSpot account 
programmatically via the HubSpot REST API.

Here are my credentials:
- HubSpot Private App Token: pat-na2-XXXXXXXX (replace with yours)
- HubSpot Portal ID: XXXXXXXX (replace with yours)

Here is my CRM spec:
[PASTE YOUR FULL SPEC DOCUMENT FROM PHASE 1]

Please do the following:

1. Write a Node.js ES module script at /tmp/setup-hubspot-account.mjs that:
   - Authenticates with the HubSpot API using the token above
   - Creates all custom contact properties defined in the spec
   - Creates all deal pipelines with their stages
   - Creates all contact lists/segments
   - Is idempotent (skips items that already exist, doesn't duplicate)
   - Logs every action with emoji indicators (✅ created, ⏭️ skipped, ❌ error)
   - Prints a summary report at the end
   - Writes all created IDs back to .env files

2. Run the script immediately after writing it

3. Fix any API errors that occur:
   - Boolean properties need explicit true/false options array
   - Free plan allows max 2 deal pipelines (Starter also 2, Professional = 15)
   - Lists may need different API versions (v1 vs v3)
   - 409 conflict = already exists (skip gracefully)

4. After successful run, update all env files with real IDs

Important technical notes:
- Use fetch() (Node 18+), no external dependencies
- Boolean checkboxes need: options: [{label:'Yes',value:'true',...},{label:'No',value:'false',...}]
- Pipeline stages need metadata: {probability: '0.5'} and {isClosed: 'true'} for won/lost
- List creation: try /crm/v3/lists/ first, fallback to /contacts/v1/lists
- Use Authorization: Bearer {TOKEN} header, never hapikey query param
- The API base URL is: https://api.hubapi.com
```

### What the Agent Does

The agent will:
1. Write the provisioning script
2. Run it with `node /tmp/setup-hubspot-account.mjs`
3. Read the output and fix any errors
4. Re-run until everything is created
5. Store all pipeline IDs, stage IDs in your `.env` files

**Expected output:**
```
🚀  HubSpot Account Provisioning
    Portal ID : 245197783
    Token     : pat-na2-xxxx...
🔑  Token verified — API access confirmed

─── 1. Creating Custom Contact Properties ───
✅  Created: subscription_status (enumeration)
✅  Created: readiness_score (number)
⏭️   Already exists: email

─── 2. Creating Deal Pipelines ───
✅  Created pipeline: "SaaS Pipeline" → ID: 2195541747
  Stage: Free Signup (ID: 3501956828)
  Stage: Trial Active (ID: 3501956833)
  Stage: Subscribed (ID: 3501956834)

─── 3. Creating Contact Lists ───
✅  Created list: "Trial Users" → ID: 10
✅  Created list: "Churned Users" → ID: 13

  Properties : 8/8 ✅
  Pipelines  : 2/2 ✅
  Lists      : 5/5 ✅
🎉  Done!
```

---

## 6. Phase 4 — Connect Your Website/App

Once provisioning is done, use this prompt to wire up your existing codebase:

### 🔌 App Integration Prompt

```
My HubSpot account is now provisioned. I have these IDs in my .env:
[PASTE YOUR ENV VARS WITH IDS]

Now please connect my existing [Next.js / React / etc.] application to HubSpot.

My project is at: [path to your project]
My existing routes include: [list key files/routes]

Please:

1. Create src/lib/hubspot.ts (or .js) — a HubSpot client library with:
   - syncContactToHubspot(email, properties) — create/update by email (upsert)
   - createDealInHubspot(contactId, pipelineId, stageId) — create deal + associate contact
   - updateDealStage(dealId, stageId) — move deal to new stage
   - findOpenDealForContact(contactId, pipelineId) — avoid duplicate deals
   - High-level event handlers for each lifecycle event:
     [LIST YOUR EVENTS from your spec, e.g. onUserSignup, onTrialStarted, onCanceled]

2. Create /api/hubspot/webhook/route.ts — inbound webhook handler:
   - Verify HubSpot HMAC signature
   - Handle: contact.creation, deal.propertyChange, meeting.created
   - Log events to database

3. Wire the following existing routes to HubSpot (add HubSpot calls, fire-and-forget):
   [LIST YOUR ROUTES, e.g. /api/stripe/webhook, /api/auth/signup, /api/contact]

4. Add HubSpot tracking code to the root layout of each website:
   <script src="//js.hs-scripts.com/YOUR_PORTAL_ID.js" async defer />
   Portal ID: [YOUR PORTAL ID]

5. Add env var stubs for any IDs not yet populated

Key implementation rules:
- All HubSpot calls must be fire-and-forget (never block user-facing requests)
- Use try/catch everywhere, log errors but never throw
- Handle 409 conflicts by updating the existing record instead
- TypeScript types for all properties
- Test that TypeScript compiles with tsc --noEmit before finishing
```

---

## 7. Phase 5 — Email Sequences & Automation

Email sequences cannot be created via API — they must be built in the HubSpot UI. Use this as your guide:

### In HubSpot: Automation → Sequences → Create Sequence

For each sequence in your spec:
1. Name it clearly (e.g., "Quick Check → Signup Nurture")
2. Set **From name** and **From email**
3. Add email steps with the correct delays
4. Set unenrollment triggers ("when contact replies" or "when lifecycle stage changes")
5. Connect it to an enrollment trigger via **Workflows**

### Enrollment via Workflows

Go to **Automation → Workflows → Create Workflow**:
- Trigger: Contact is added to list `[YOUR LIST]`
- Action: Enroll in sequence `[YOUR SEQUENCE]`

This connects your programmatic list membership (updated by your app via API) to the sequence enrollment automatically.

---

## 8. HubSpot Plan Comparison & API Limits

| Feature | Free | Starter ($20/mo) | Professional ($890/mo) |
|---|---|---|---|
| Deal Pipelines | 2 | 2 | 15 |
| Marketing Contacts | 1,000 | 1,000 | 2,000 |
| Email sequences | ❌ | ✅ (basic) | ✅ (advanced) |
| A/B testing | ❌ | ❌ | ✅ |
| Workflows | ❌ | ❌ | ✅ |
| Custom reports | ❌ | ❌ | ✅ |
| API rate limit | 100 req/10s | 100 req/10s | 100 req/10s |

### API Gotchas by Plan

**Free + Starter (2 pipeline limit):**
- Delete the default "Sales Pipeline" to free a slot for your second custom pipeline
- Can't create a 3rd pipeline — must upgrade to Professional

**All plans:**
- Rate limit: 100 requests per 10 seconds (watch for bulk operations)
- Always add 100-200ms delays between bulk API calls
- Batch upserts where possible

---

## 9. Lessons Learned & Gotchas

These are the exact issues we hit building this, so you don't have to:

### 🐛 Boolean Properties Need Explicit Options
```js
// ❌ WRONG — HubSpot rejects this
{ name: 'sam_registered', type: 'bool', fieldType: 'booleancheckbox' }

// ✅ CORRECT — must include true/false options
{
  name: 'sam_registered',
  type: 'bool',
  fieldType: 'booleancheckbox',
  options: [
    { label: 'Yes', value: 'true', displayOrder: 0, hidden: false },
    { label: 'No', value: 'false', displayOrder: 1, hidden: false },
  ]
}
```

### 🔑 Rotating Token Required After Adding Scopes
If you add scopes to an existing Private App, the old token still has the OLD scopes. You must click **"Rotate token"** to get a new token that includes the new scopes.

### 🌍 EU vs NA Token Prefixes
- `pat-eu1-...` = EU data center (portal created with European account)
- `pat-na2-...` = North America data center

Your portal ID determines your region. The provisioning script works the same for both — just use the correct token.

### 📋 Lists API: v1 vs v3
- `crm/v3/lists` — newer API, requires `crm.lists.read` + `crm.lists.write` scopes
- `contacts/v1/lists` — legacy API, requires `contacts-lists-access` scope
- The v3 scope names are different from what the v1 API error message suggests
- **Best approach:** try v3 first, fallback to v1

### 💥 409 Conflict = Contact Already Exists
When creating a contact, HubSpot returns 409 if the email already exists. Extract the existing ID from the error message and PATCH instead of POST:
```js
if (err.message.includes('409')) {
  return updateContactByEmail(email, properties); // PATCH instead
}
```

### 🔗 Deal Associations Need a Separate Call
Creating a deal does NOT automatically associate it with a contact. You need a second API call:
```
PUT /crm/v3/objects/deals/{dealId}/associations/contacts/{contactId}/deal_to_contact
```

### 🚫 Personal Access Key ≠ API Token
HubSpot has two different key types:
- **Personal Access Key** (PAK) — used for `hubspot` CLI and local dev tools only
- **Private App Token** (`pat-na2-...`) — used for REST API calls

The PAK does NOT work as a Bearer token for CRM API calls.

### ✅ Idempotency Pattern
Always check if something exists before creating it:
```js
const existing = existingItems.find(i => i.label === newItem.label);
if (existing) {
  log('⏭️', `Skipping: ${newItem.label}`);
  continue;
}
// proceed with creation
```

---

## 10. Adapting for Pipedrive & Other CRMs

The same approach works for other CRMs. Here's the mapping:

| Concept | HubSpot | Pipedrive | Salesforce |
|---|---|---|---|
| Contact | Contact | Person | Contact |
| Deal | Deal | Deal | Opportunity |
| Pipeline | Pipeline | Pipeline | Opportunity Stage |
| Custom field | Contact Property | Custom Field | Custom Field |
| Segment/List | Contact List | Filter | Report/List View |
| Automation | Workflow | Automation | Flow |
| API auth | Private App Token | API Key / OAuth | OAuth |

### Pipedrive Quick Start

Replace the HubSpot API calls with Pipedrive equivalents:
```
Base URL: https://api.pipedrive.com/v1
Auth: ?api_token=YOUR_TOKEN (query param) or Bearer header
Create person: POST /persons
Create deal: POST /deals
Add custom field: POST /personFields
Create pipeline: POST /pipelines
Create stage: POST /stages
```

The provisioning script pattern is identical — just swap the endpoints.

---

## 11. The Master Brain Prompt

This is the single prompt you give to an AI coding agent at the start of a NEW project to get a fully configured HubSpot CRM from scratch. **Copy-paste this directly into Claude Code, Cursor, or your preferred AI agent.**

---

```
# HubSpot CRM Setup — AI Agent Task

You are setting up a complete HubSpot CRM integration for a software project.
Follow this exact workflow without stopping to ask questions unless truly blocked.

## Project Context

Company: [COMPANY NAME]
Product: [PRODUCT NAME — brief description]
Website(s): [LIST ALL DOMAINS]
Tech Stack: [FRAMEWORK, AUTH, PAYMENTS, DATABASE]
Codebase: [PATH TO PROJECT]

## HubSpot Credentials

Private App Token: [pat-na2-XXXXXXXX]
Portal ID: [XXXXXXXX]

## CRM Requirements

### Custom Contact Properties to Create:
[LIST EACH PROPERTY AS: name | type | options if dropdown | description]

Examples:
- subscription_status | enumeration | free, trialing, active, canceled | Stripe subscription state
- readiness_score | number | — | Score 0-10
- veteran_owned | bool | — | VOSB/SDVOSB flag

### Deal Pipelines to Create:
[LIST EACH PIPELINE WITH ITS STAGES]

Example:
Pipeline: SaaS Growth Pipeline
  Stage 1: Lead (prob: 10%)
  Stage 2: Signed Up (prob: 25%)
  Stage 3: Trial Active (prob: 60%)
  Stage 4: Subscribed - WON (prob: 100%, closed)
  Stage 5: Churned - LOST (prob: 0%, closed)

### Contact Lists/Segments to Create:
[LIST EACH LIST WITH ITS PURPOSE]

Example:
- Trial Users — subscription_status = trialing → targeting trial conversion emails
- Churned Users — subscription_status = canceled → win-back sequence

### App Events to Wire to HubSpot:
[MAP EACH APP EVENT TO A HUBSPOT ACTION]

Example:
- User submits contact form → Create contact + Inquiry deal in pipeline
- User signs up → Create/update contact, set account_type
- Stripe trial starts → Move deal to Trial Active stage
- Stripe payment succeeds → Move deal to Subscribed stage
- Stripe subscription canceled → Move deal to Churned, update status

### Files to Wire (existing app routes):
[LIST WHICH EXISTING FILES NEED HUBSPOT CALLS ADDED]

Example:
- app/api/stripe/webhook/route.ts → add trial/paid/churn syncs
- app/api/contact/route.ts → add contact + deal creation

## Instructions

### Phase 1 — Provision HubSpot Account

1. Write a Node.js ES module at /tmp/setup-hubspot-[project]-account.mjs
2. The script must:
   - Verify the token works before doing anything
   - Create all custom contact properties (skip if exists, handle bool options format)
   - Create all deal pipelines and stages (skip if exists, respect plan limits)
   - Create all contact lists (try v3 API, fallback to v1)
   - Write all created IDs to .env files
   - Print a clear summary report
   - Exit with code 0 on success, 1 on auth failure
3. Run the script with: node /tmp/setup-[project]-account.mjs
4. Fix any errors and re-run until all items are created

Technical requirements for the script:
- Use fetch() only, no npm packages
- Add 150ms delay between API calls to respect rate limits
- Handle 409 conflicts gracefully (skip = already exists)
- Boolean properties MUST have options array with true/false values
- Pipeline stages MUST have metadata.probability as string
- Closed stages MUST have metadata.isClosed = 'true'

### Phase 2 — Create HubSpot Client Library

Create [project]/src/lib/hubspot.ts with:
- Base API wrapper function with auth headers + error handling
- Type definitions for all custom properties
- Core functions: syncContactToHubspot, createDealInHubspot, updateDealStage, findOpenDealForContact
- High-level event handlers for every app lifecycle event listed above
- All calls must be fire-and-forget (never throw, always log errors)

### Phase 3 — Create Inbound Webhook Handler

Create [project]/src/app/api/hubspot/webhook/route.ts:
- Verify HubSpot HMAC-SHA256 signature (skip verification when no secret configured)
- Handle arrays of events (HubSpot sends batches)
- Handle: contact.creation, deal.propertyChange, meeting.created
- Log all events to database activity log
- Return 200 immediately (never 4xx unless auth fails)

### Phase 4 — Wire Existing Routes

For each file listed in "Files to Wire" above:
- Import the relevant event handlers from src/lib/hubspot.ts
- Add fire-and-forget HubSpot calls at the right points
- Never change the existing logic — only ADD HubSpot calls
- All HubSpot calls: .catch(console.error) — never block the main flow

### Phase 5 — Add Tracking Code

Add to the root layout of every website listed:
<script type="text/javascript" id="hs-script-loader" async defer 
  src="//js.hs-scripts.com/[PORTAL_ID].js" />

### Phase 6 — Update Env Files

Update all .env and .env.local files in the project with:
- HUBSPOT_ACCESS_TOKEN
- HUBSPOT_PORTAL_ID
- HUBSPOT_WEBHOOK_SECRET (leave empty until webhook is created in HubSpot UI)
- All pipeline IDs
- All stage IDs

### Phase 7 — Verify

1. Run: tsc --noEmit (must be zero errors)
2. Confirm all env vars are populated
3. Print a final checklist of what was done and what still needs manual HubSpot UI work

## Manual Steps (remind me what I need to do in HubSpot UI)

After you finish, tell me:
1. What URL to register as the inbound webhook in HubSpot Settings
2. Which email sequences I need to build manually (and refer to the sequences guide)
3. Whether to add any Vercel environment variables

## Done

When complete, return a clear summary with:
- ✅ What was completed
- ⚠️ What needs manual steps
- 🔑 All created IDs for reference
```

---

## Quick Reference Card

### HubSpot REST API Base
```
https://api.hubapi.com
Authorization: Bearer pat-na2-XXXXXXXX
```

### Key Endpoints
```
# Properties
GET  /crm/v3/properties/contacts          — list all
POST /crm/v3/properties/contacts          — create

# Contacts
POST /crm/v3/objects/contacts             — create
PATCH /crm/v3/objects/contacts/{id}       — update
PATCH /crm/v3/objects/contacts/{email}?idProperty=email  — update by email
POST /crm/v3/objects/contacts/search      — search

# Deals
POST /crm/v3/objects/deals                — create
PATCH /crm/v3/objects/deals/{id}          — update stage
PUT /crm/v3/objects/deals/{id}/associations/contacts/{contactId}/deal_to_contact

# Pipelines
GET  /crm/v3/pipelines/deals              — list
POST /crm/v3/pipelines/deals              — create
DELETE /crm/v3/pipelines/deals/{id}       — delete

# Lists
GET  /crm/v3/lists                        — list (v3, needs crm.lists.read)
POST /crm/v3/lists/                       — create (v3)
POST /contacts/v1/lists                   — create (v1 legacy)

# Account
GET /account-info/v3/details              — verify token + get portal info
```

### Property Type Reference
```
string       → fieldType: text
string       → fieldType: textarea  (for long text)
number       → fieldType: number
bool         → fieldType: booleancheckbox  (needs options array!)
enumeration  → fieldType: select  (needs options array)
enumeration  → fieldType: checkbox (multi-select, needs options)
date         → fieldType: date
```

---

*Guide created from the CapturePilot / Americurial HubSpot setup — April 2026*
*Distilled by Antigravity (Claude) + Andre Schuler*
