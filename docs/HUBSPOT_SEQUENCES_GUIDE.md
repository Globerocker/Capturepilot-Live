# HubSpot Email Sequences — Setup Guide
*Americurial LLC — CapturePilot*
*Created: April 13, 2026*

> **Note:** HubSpot Sequences cannot be created via API — they must be built in the HubSpot UI.
> Follow this guide to set up all 7 sequences after the account is provisioned.

---

## How to Create a Sequence in HubSpot

1. Go to **HubSpot** → **Automation** → **Sequences**
2. Click **Create sequence**
3. Choose **From scratch**
4. Add steps using the guide below (email delays are from enrollment date unless noted)
5. Set the **From name**: Andre Schuler | **From email**: andre@americurial.com
6. Set **Unenroll from sequence when**: Contact replies, Meeting booked, or Contact unsubscribes

---

## Sequence 1: Quick Checker → Signup Nurture
**Trigger:** Contact enrolls when Quick Checker completes AND email is provided  
**Enrollment list:** `Quick Checker Leads (No Account)`

| Step | Delay | Email Subject | Content Summary |
|---|---|---|---|
| 1 | Immediately | Your CapturePilot Quick Check Results | Results summary, readiness score, top match. CTA: "Create free account to see all 10 matches" |
| 2 | 1 day | 3 things your Quick Check revealed about [company] | Highlight readiness gaps, missing certifications, what competitors have. CTA: sign up |
| 3 | 3 days | [company], you matched X federal opportunities | Tease match count + total contract value. CTA: sign up to see full details |
| 4 | 5 days | How a [similar company] won their first federal contract | Case study / social proof. CTA: sign up |
| 5 | 7 days | Last chance: your Quick Check results expire in 48h | Urgency. CTA: sign up to save results |

**Unenroll when:** Contact creates a CapturePilot account (lifecycle stage = Customer)

---

## Sequence 2: Free → Pro Conversion
**Trigger:** User signs up but hasn't started a trial after 24 hours  
**Enrollment list:** `Free Users (No Trial)`

| Step | Delay | Email Subject | Content Summary |
|---|---|---|---|
| 1 | 1 day | Welcome to CapturePilot — here's what to do first | Onboarding checklist, link to profile setup, highlight top match. CTA: Complete profile |
| 2 | 3 days | You have X HOT matches waiting | Show match preview (blur sensitive details). CTA: Upgrade to see AI fit summaries |
| 3 | 7 days | Your competitors are already bidding on these | Competitor intel tease, urgency around bid deadlines. CTA: Start free trial |
| 4 | 14 days | Beta pricing ends May 9 — lock in $149/mo forever | BETA25 promo code, deadline urgency. CTA: Start trial at $149/mo |

**Unenroll when:** Contact starts a trial OR subscribes

---

## Sequence 3: Trial → Paid Conversion
**Trigger:** Stripe trial starts → `onTrialStarted()` enrolls contact  
**Enrollment list:** `Trial Users`

| Step | Delay | Email Subject | Content Summary |
|---|---|---|---|
| 1 | Immediately | Your 30-day Pro trial is active | What's now unlocked (AI summaries, unlimited matches, export). 3 quick wins to try today |
| 2 | 14 days | Halfway through your trial — here's what you've found | Stats: X matches viewed, Y opportunities saved, readiness score delta. CTA: Keep your access |
| 3 | 25 days | Trial ends in 5 days — keep your access | What they'll lose (AI summaries go away, limited to 3 matches). CTA: Add payment method |

**Unenroll when:** Contact subscribes (subscription_status = active)

---

## Sequence 4: Churned / Win-Back
**Trigger:** Subscription canceled → `onSubscriptionCanceled()` enrolls contact  
**Enrollment list:** `Churned Users`

| Step | Delay | Email Subject | Content Summary |
|---|---|---|---|
| 1 | Immediately | We're sorry to see you go, [first name] | What they're losing, link to feedback survey (typeform), re-subscribe offer. CTA: Give us feedback |
| 2 | 7 days | X new opportunities matched since you left | FOMO — specific opportunities they're missing. CTA: Come back |
| 3 | 30 days | Come back: 25% off for 3 months | Win-back coupon code (WINBACK25). Expires in 72h. |

---

## Sequence 5: Weekly Opportunity Digest
**Trigger:** Every Monday at 8am CT for all Active Pro subscribers  
**Enrollment list:** `Pro Subscribers`  
**Type:** This should be a **Workflow** (not a Sequence) — set up under Automation → Workflows

| Cadence | Email Subject | Content Summary |
|---|---|---|
| Every Monday | Your Weekly Federal Intel Brief — [date] | Top 5 new HOT/WARM matches, pipeline summary, readiness score, 2 upcoming bid deadlines, next steps |

> **Setup as Workflow:**
> - Create Workflow: `Weekly Digest — Pro Subscribers`
> - Trigger: Enrollment every week on Monday
> - Enrolled contacts: `Pro Subscribers` list
> - Action: Send email (create email template)

---

## Sequence 6: Consulting Client Onboarding
**Trigger:** Admin creates consulting client → `onConsultingClientCreated()` enrolls contact  
**Enrollment list:** Consulting clients (account_type = consulting)

| Step | Delay | Email Subject | Content Summary |
|---|---|---|---|
| 1 | Immediately | Welcome to CapturePilot Consulting — [Company] | Portal login link, what to expect in week 1, intro call booking (HubSpot meeting link) |
| 2 | 1 day | Your first task: upload your capability statement | Where to upload, why it matters, what we'll do with it |
| 3 | 3 days | Your pipeline is being built | Progress update: X opportunities identified in their NAICS codes, market overview |
| 4 | 7 days | Week 1 recap: here's what we found | Summary of top 5 opportunities, competitor landscape, go/no-go framework |
| 5 | 14 days | Your capture strategy is ready | Review meeting CTA, next steps (proposal writing, teaming, etc.) |

---

## Sequence 7: Americurial Agency Leads
**Trigger:** Contact form submitted on americurial.com → `onAmericurialContactForm()` enrolls contact  
**Enrollment list:** `Consulting Leads`

| Step | Delay | Email Subject | Content Summary |
|---|---|---|---|
| 1 | Immediately | Thanks for reaching out — Andre from Americurial | Personal reply tone, confirm receipt, what happens next. CTA: Book intro call (HubSpot meeting link) |
| 2 | 2 days | What we build (and how fast) | Portfolio: CapturePilot case study, other projects, tech stack. CTA: See our work |
| 3 | 5 days | Quick question about your project | Soft follow-up, 2-3 qualifying questions, re-book CTA |

---

## Post-Setup Checklist

After creating all sequences:

- [ ] Set **From email** to `andre@americurial.com` on all sequences
- [ ] Connect sequences to enrollment lists above using **Workflows** → trigger enrollment when contact is added to list
- [ ] Configure **meeting link** in sequence step 1 of Sequence 6 & 7: `https://meetings-na2.hubspot.com/americurial/intro-call`
- [ ] Add HubSpot **subscription type** for marketing emails (required for CAN-SPAM compliance)
- [ ] Set up **unsubscribe footer** in email templates
- [ ] Test each sequence with a test contact email before going live
