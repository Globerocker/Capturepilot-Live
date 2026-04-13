# HubSpot CRM Integration Plan

*Last updated: April 13, 2026*
*Americurial LLC — CapturePilot + Americurial Website*

---

## 1. Overview

Connect HubSpot as the central CRM for both CapturePilot (app.capturepilot.com) and Americurial (americurial.com). Every lead, customer, and touchpoint flows into HubSpot so we have a single source of truth for pipeline, email automation, and reporting.

### What HubSpot Replaces/Augments
| Currently | After HubSpot |
|---|---|
| Resend (transactional emails only) | Resend for transactional + HubSpot for marketing/nurture sequences |
| No CRM — leads sit in Supabase `company_analyses` table | HubSpot Contacts + Deals for every lead |
| No pipeline visibility outside the app | HubSpot deal board with stage tracking |
| Manual outreach via email | Automated sequences triggered by lifecycle events |
| No attribution tracking | HubSpot forms + tracking code on both websites |

---

## 2. HubSpot Setup Requirements

### 2.1 Properties (Custom Fields)

Create these custom contact properties in HubSpot:

| Property Name | Type | Description |
|---|---|---|
| `capturepilot_user_id` | Single-line text | Supabase user_profiles.id |
| `account_type` | Dropdown: self_service, consulting, admin | CapturePilot account type |
| `subscription_status` | Dropdown: free, trialing, active, past_due, canceled | Stripe status |
| `readiness_score` | Number (0-10) | Government Contracting Readiness Score |
| `naics_codes` | Multi-line text | Comma-separated NAICS codes |
| `sam_registered` | Checkbox | Whether they're on SAM.gov |
| `uei` | Single-line text | SAM.gov UEI |
| `state` | Single-line text | Business state |
| `quick_checker_url` | Single-line text | Link to their Quick Checker results |
| `lead_source` | Dropdown | quick_checker, signup, contact_form, americurial_form, calendly, manual |
| `beta_feedback_given` | Checkbox | Whether they completed beta feedback survey |
| `matched_opportunities_count` | Number | How many HOT/WARM matches they have |
| `veteran_owned` | Checkbox | VOSB/SDVOSB status |

### 2.2 Pipelines

#### Pipeline 1: CapturePilot SaaS Pipeline
For self-service users (website visitors → free users → paid subscribers).

| Stage | Trigger | Description |
|---|---|---|
| **Quick Check Lead** | Someone runs Quick Checker (with or without email) | Raw lead — we have website + maybe email |
| **Email Captured** | Lead provides email on results page | Now contactable |
| **Signed Up (Free)** | Creates a CapturePilot account | In the app but not paying |
| **Onboarding Complete** | Finishes onboarding flow | Profile filled, matches generated |
| **Engaged (Active)** | Logs in 3+ times or views 5+ opportunities | Using the product |
| **Trial Active** | Started Stripe trial | Credit card on file |
| **Subscribed (Pro)** | Paying $199/mo or $149/mo beta | Revenue! |
| **Churned** | Canceled or payment failed | Win-back sequence |

#### Pipeline 2: Americurial Agency Pipeline
For consulting/agency clients (inbound from americurial.com or referrals).

| Stage | Trigger | Description |
|---|---|---|
| **Inquiry** | Contact form submission on americurial.com | New lead |
| **Discovery Call Booked** | HubSpot meeting scheduled | Calendly/HubSpot meeting |
| **Discovery Call Done** | Meeting completed | Qualified or disqualified |
| **Proposal Sent** | We send a proposal/SOW | Deal in negotiation |
| **Contract Signed** | Client signs | Won deal |
| **Onboarding** | Portal account created | Setting up their CapturePilot portal |
| **Active Client** | Ongoing engagement | Recurring revenue |
| **Closed Lost** | Didn't close | Nurture for later |

#### Pipeline 3: Government Contract Capture Pipeline
For tracking actual federal contracts we're pursuing for consulting clients.

| Stage | Trigger | Description |
|---|---|---|
| **Identified** | Opportunity matched to client | SAM.gov opportunity found |
| **Qualified** | Bid/no-bid decision: GO | Worth pursuing |
| **Teaming** | Finding partners/subs | Building team |
| **Proposal In Progress** | Writing the proposal | Active capture |
| **Submitted** | Proposal submitted | Waiting for award |
| **Won** | Contract awarded | Revenue event |
| **Lost** | Not selected | Lessons learned |

### 2.3 Lists (Segments)

| List Name | Criteria | Purpose |
|---|---|---|
| Quick Checker Leads (No Account) | lead_source = quick_checker AND account_type is empty | Nurture → signup |
| Free Users (No Trial) | account_type = self_service AND subscription_status = free | Nurture → trial |
| Trial Users | subscription_status = trialing | Convert → paid |
| Beta Feedback Users | beta_feedback_given = true | Lock-in $149/mo offer |
| Pro Subscribers | subscription_status = active | Retention + upsell |
| Churned Users | subscription_status = canceled | Win-back |
| Consulting Leads | lead_source = americurial_form OR calendly | Agency pipeline |
| Veteran-Owned | veteran_owned = true | Targeted content |
| High Readiness (7+) | readiness_score >= 7 | Ready to buy |
| Low Readiness (<4) | readiness_score < 4 | Education sequence |

---

## 3. Email Sequences Needed

### 3.1 Quick Checker → Signup Nurture (5 emails, 7 days)
**Trigger:** Lead runs Quick Checker, provides email, but doesn't sign up.

| Day | Subject | Content |
|---|---|---|
| 0 (immediate) | Your CapturePilot Quick Check Results | Results summary, readiness score, top match, CTA: "Create free account to see all 10" |
| 1 | 3 things your Quick Check revealed about [Company] | Highlight readiness gaps, what they're missing, CTA: sign up |
| 3 | [Company], you matched X federal opportunities | Tease match count + total value, CTA: sign up to see details |
| 5 | How [similar company] won their first federal contract | Case study / social proof, CTA: sign up |
| 7 | Last chance: your Quick Check results expire in 48h | Urgency, CTA: sign up to save results |

### 3.2 Free → Pro Conversion (4 emails, 14 days)
**Trigger:** User signs up but doesn't start trial.

| Day | Subject | Content |
|---|---|---|
| 1 | Welcome to CapturePilot — here's what to do first | Onboarding checklist, highlight top match |
| 3 | You have X HOT matches waiting | Show match preview, CTA: upgrade to see AI fit summaries |
| 7 | Your competitors are already bidding on these | Competitor intel tease, urgency |
| 14 | Beta pricing ends May 9 — lock in $149/mo forever | Deadline urgency, BETA25 promo code |

### 3.3 Trial → Paid Conversion (3 emails)
**Trigger:** User starts Stripe trial.

| Day | Subject | Content |
|---|---|---|
| 1 | Your 30-day Pro trial is active | What's now unlocked, quick wins to try |
| 14 | Halfway through your trial — here's what you've found | Stats: X matches, Y opportunities, readiness score |
| 25 | Trial ends in 5 days — keep your access | What they'll lose, CTA: add payment |

### 3.4 Churned / Win-Back (3 emails)
**Trigger:** Subscription canceled or payment failed.

| Day | Subject | Content |
|---|---|---|
| 0 | We're sorry to see you go | What they're losing, feedback ask, re-subscribe CTA |
| 7 | X new opportunities matched since you left | FOMO — show what they're missing |
| 30 | Come back: 25% off for 3 months | Win-back offer |

### 3.5 Weekly Opportunity Digest
**Trigger:** Every Monday, for active users.

| Subject | Content |
|---|---|
| Your Weekly Federal Intel Brief | Top 5 new matches, pipeline summary, readiness score reminder, next steps |

### 3.6 Consulting Client Onboarding (5 emails, 14 days)
**Trigger:** Admin creates consulting client.

| Day | Subject | Content |
|---|---|---|
| 0 | Welcome to CapturePilot Consulting — [Company] | Portal login, what to expect, intro call booking |
| 1 | Your first task: upload your capability statement | Task assignment, why it matters |
| 3 | Your pipeline is being built | Progress update, X opportunities identified |
| 7 | Week 1 recap: here's what we found | Summary of opportunities, competitor landscape |
| 14 | Your capture strategy is ready | Review meeting CTA, next steps |

### 3.7 Americurial Agency Leads (3 emails)
**Trigger:** Contact form on americurial.com.

| Day | Subject | Content |
|---|---|---|
| 0 (immediate) | Thanks for reaching out — Andre from Americurial | Personal email, confirm receipt, book call CTA |
| 2 | What we build (and how fast) | Portfolio showcase, CapturePilot case study |
| 5 | Quick question about your project | Soft follow-up, re-book CTA |

---

## 4. Forms Needed

### CapturePilot Website (capturepilot.com)
| Form | Location | Fields | HubSpot Action |
|---|---|---|---|
| Quick Checker Email Capture | /check/[id] results page | email, company_name | Create contact, add to Quick Checker Lead list |
| Signup | /signup | email (via Supabase Auth) | Create/update contact, move to Signed Up stage |
| Beta Feedback | Feedback widget | rating, feedback_text, email | Update contact, set beta_feedback_given = true |
| Book Strategy Call | /pricing, CTA sections | HubSpot meeting embed | Create contact, create deal in SaaS Pipeline |

### Americurial Website (americurial.com)
| Form | Location | Fields | HubSpot Action |
|---|---|---|---|
| Contact Form | /contact | name, email, company, message | Create contact, create deal in Agency Pipeline |
| Book a Call | Nav CTA, page CTAs | HubSpot meeting embed | Create contact, move to Discovery Call Booked |

---

## 5. Technical Integration Points

### 5.1 HubSpot Tracking Code
Add to both websites (in root layout):
```html
<!-- HubSpot Tracking Code -->
<script type="text/javascript" id="hs-script-loader" async defer src="//js.hs-scripts.com/YOUR_PORTAL_ID.js"></script>
```

### 5.2 API Integration (CapturePilot → HubSpot)

Create `/dashboard/src/lib/hubspot.ts`:

```typescript
// Sync events to HubSpot via API
// Trigger: signup, trial_start, subscription_active, subscription_canceled, 
//          quick_check_complete, match_found, feedback_submitted

async function syncContactToHubspot(email, properties) { ... }
async function createDealInHubspot(contactId, pipeline, stage) { ... }
async function updateDealStage(dealId, stage) { ... }
```

**Events to sync:**
| App Event | HubSpot Action |
|---|---|
| Quick Checker complete (with email) | Create/update contact, set readiness_score, naics_codes |
| User signs up | Update contact lifecycle to "lead", set account_type |
| Onboarding complete | Update contact, set matched_opportunities_count |
| Trial started | Create deal in SaaS Pipeline at "Trial Active" |
| Subscription active | Move deal to "Subscribed", update subscription_status |
| Subscription canceled | Move deal to "Churned", trigger win-back sequence |
| Payment failed | Update subscription_status to "past_due" |
| Admin creates consulting client | Create deal in Agency Pipeline |
| Consulting client portal login | Update last_activity in HubSpot |

### 5.3 HubSpot Webhook → CapturePilot
For meeting bookings and form submissions that happen in HubSpot:

Create `/dashboard/src/app/api/hubspot/webhook/route.ts`:
- Handle `contact.creation` — sync to Supabase if from Quick Checker
- Handle `deal.propertyChange` — update pipeline stage in our DB
- Handle `meeting.created` — log in client_activity_log

### 5.4 Env Vars Required

```
HUBSPOT_ACCESS_TOKEN=pat-xxx        # Private app token
HUBSPOT_PORTAL_ID=12345678          # For tracking code
HUBSPOT_SAAS_PIPELINE_ID=xxx        # SaaS pipeline
HUBSPOT_AGENCY_PIPELINE_ID=xxx      # Agency pipeline
HUBSPOT_CAPTURE_PIPELINE_ID=xxx     # Capture pipeline
```

---

## 6. Implementation Order

| Phase | What | Effort |
|---|---|---|
| **Phase 1** | HubSpot account setup, custom properties, pipelines, tracking code on both sites | 1 day |
| **Phase 2** | Contact form → HubSpot (americurial.com), Quick Checker email → HubSpot sync | 1 day |
| **Phase 3** | Signup/trial/subscription lifecycle sync via API | 2 days |
| **Phase 4** | Email sequences (Quick Checker nurture, Free→Pro, Trial→Paid) | 2 days |
| **Phase 5** | Weekly digest, consulting onboarding sequence | 1 day |
| **Phase 6** | Win-back, churn prevention, advanced automation | 1 day |

**Total estimated: 8 working days**

---

## 7. HubSpot Plan Recommendation

**HubSpot Marketing Hub Starter** ($20/mo) covers:
- 1,000 marketing contacts
- Email automation (sequences)
- Forms + landing pages
- Ad tracking
- Reporting dashboard

Upgrade to **Professional** ($890/mo) when you need:
- 2,000+ marketing contacts
- A/B testing
- Custom reporting
- Workflows (advanced automation beyond sequences)

**For now: Starter is sufficient for beta launch.**
