# Email System — Current State + Roadmap

*Last updated: April 13, 2026*

---

## 1. Current Email Infrastructure

**Provider:** Resend (resend.com)
**Sender:** `CapturePilot <noreply@capturepilot.com>`
**Template engine:** Inline HTML strings in `/dashboard/src/lib/email.ts`
**Tracking:** Logged to `client_activity_log` table (action = "email_sent")

---

## 2. Emails We Currently Send (4 types)

### 2.1 Welcome Email (Self-Service)
- **File:** `src/lib/email.ts:18-65`
- **Trigger:** User signs up → `/api/email/welcome` called from auth callback
- **Subject:** "Welcome to CapturePilot, {company}!"
- **Content:** Logo, welcome message, 3-bullet "what happens next" (scanning 30K+ opps, HOT/WARM/COLD leads, alerts), CTA → Dashboard
- **Style:** Light bg, black text, pill CTA, system fonts, 600px max-width

### 2.2 Consulting Welcome Email
- **File:** `src/lib/email.ts:68-132`
- **Trigger:** Admin creates consulting client → `/api/admin/clients` POST
- **Subject:** "Your CapturePilot Portal is Ready — {company}"
- **Content:** Login info (email + temp password + Google option), 5-bullet portal features, green accent box, CTA → Portal Login
- **Style:** Same as welcome + green feature box

### 2.3 Task Assignment Notification
- **File:** `src/lib/email.ts:135-180`
- **Trigger:** Admin creates task with `notify: true` → `/api/admin/tasks` POST
- **Subject:** "Action Required: {task title}"
- **Content:** Task title, description, due date (red highlight), CTA → View Task
- **Style:** Yellow alert box for task details

### 2.4 Opportunity Alert (Daily Matches)
- **File:** `src/lib/email.ts:183-236`
- **Trigger:** Daily cron `/api/cron/notify_matches` (no fixed schedule — must be configured in vercel.json)
- **Subject:** "{count} New Matching Opportunities Found"
- **Content:** Table with up to 5 opportunities (title, agency, score badge with green/yellow/blue), CTA → View All Opportunities
- **Rate limit:** Max 1 per user per 24h (checked via client_activity_log)
- **Threshold:** Only matches scoring >= 45%

### 2.5 Admin Custom Email
- **File:** `src/app/api/admin/send-update/route.ts`
- **Trigger:** Admin manually sends from admin panel
- **Content:** Arbitrary subject + body, uses opportunity alert template format
- **Logged:** `client_activity_log` with action = "custom_email_sent"

---

## 3. Lead Capture Flow (NO email sent)

### Quick Checker → Lead Magnet
1. User enters website on `/check` page
2. Analysis runs (crawl → classify → score → compete → readiness)
3. Results displayed on `/check/[analysisId]`
4. User can enter email to "Save" results → `/api/lead-magnet/confirm` stores `lead_email`
5. **NO confirmation email is sent** — lead just sits in `company_analyses.lead_email`
6. Admin sees leads in `/admin/leads` and `/admin/pipeline`

**Gap:** We capture the email but never follow up. This is the #1 conversion leak.

---

## 4. What's Missing (Critical Gaps)

### Must-Have (Phase 1)
| Email | Trigger | Why It Matters |
|---|---|---|
| **Quick Checker Results Email** | Lead provides email on results page | #1 lead conversion — send them their results with a signup CTA |
| **Trial Expiring Warning** (3 days) | trial_ends_at - 3 days | Prevent surprise churn |
| **Trial Expired** | trial_ends_at passed | Last chance to convert |
| **Payment Failed** | Stripe webhook: invoice.payment_failed | Prevent involuntary churn |
| **Subscription Canceled** | Stripe webhook: subscription.deleted | Win-back opportunity |

### Should-Have (Phase 2)
| Email | Trigger | Why It Matters |
|---|---|---|
| **Weekly Opportunity Digest** | Every Monday for active users | Engagement + retention |
| **Onboarding Drip** (3 emails) | Day 1, 3, 7 after signup | Guide users to value |
| **First Match Alert** | First HOT match found for user | Excitement + habit loop |
| **Milestone Emails** | 10th login, 50th match, etc. | Celebration + engagement |
| **Beta Deadline Reminder** | May 1, May 5, May 8 | Convert free → paid before cutoff |

### Nice-to-Have (Phase 3)
| Email | Trigger | Why It Matters |
|---|---|---|
| **Re-engagement** (inactive 14 days) | No login for 2 weeks | Prevent silent churn |
| **Competitor Intel Update** | New competitor found in their NAICS | Value demonstration |
| **Monthly Pipeline Report** | 1st of month | Executive summary feel |
| **Referral Ask** | After 30 days active | Growth loop |
| **NPS Survey** | After 60 days | Product feedback |

---

## 5. Email Design Problems

### Current Issues
1. **No brand consistency** — each template is a separate HTML blob with slightly different styles
2. **No dark mode support** — all templates are light-only (our brand is dark-first)
3. **No responsive testing** — inline styles with max-width 600px but no mobile optimization
4. **Emoji in headers** — "⚡ CapturePilot" uses emoji as logo substitute
5. **No unsubscribe link** — legally required for marketing emails (CAN-SPAM)
6. **No preheader text** — wasted real estate in inbox preview
7. **No logo image** — text-only header
8. **Plain text fallback missing** — only HTML, no text/plain alternative

### Recommended Email Design System
Build a shared email template that matches the brand:

```
┌──────────────────────────────────────┐
│  [CP Logo]              [View in browser] │
├──────────────────────────────────────┤
│                                          │
│  Subject line as H1                      │
│  Preheader text (hidden in body,         │
│  visible in inbox preview)               │
│                                          │
│  ┌────────────────────────────────┐     │
│  │  Content card (stone-50 bg)    │     │
│  │  with rounded corners          │     │
│  └────────────────────────────────┘     │
│                                          │
│  [CTA Button — emerald-600 bg]          │
│                                          │
├──────────────────────────────────────┤
│  Footer: unsubscribe | capturepilot.com  │
│  Americurial LLC, Jacksonville, FL       │
└──────────────────────────────────────┘
```

**Colors:** Black (#0c0a09) header bar, white body, emerald (#059669) CTAs, stone-500 footer text
**Font:** System font stack (same as current)
**Logo:** Actual PNG logo, not emoji

---

## 6. Implementation Checklist

### Immediate (this week)
- [ ] Build shared email template component (`src/lib/email-template.ts`)
- [ ] Add logo image hosted at `https://www.capturepilot.com/logo.png`
- [ ] Add unsubscribe link to all marketing emails
- [ ] Add preheader text to all emails
- [ ] Create Quick Checker Results Email (send immediately on email capture)
- [ ] Create Trial Expiring Warning email
- [ ] Create Payment Failed email

### Next sprint
- [ ] Wire Stripe webhook → payment failed email
- [ ] Wire trial_ends_at cron check → trial expiring email
- [ ] Build Weekly Opportunity Digest cron
- [ ] Build Onboarding Drip (3 emails over 7 days)
- [ ] Add Beta Deadline Reminder sequence (May 1, 5, 8)

### After beta launch
- [ ] Migrate marketing emails to HubSpot sequences
- [ ] Keep Resend for transactional only (task notifications, password resets)
- [ ] Add re-engagement and win-back sequences in HubSpot
- [ ] A/B test subject lines via HubSpot

---

## 7. Cron Schedule for Email Jobs

Current cron config (vercel.json):
```json
{
  "crons": [
    { "path": "/api/cron/notify_matches", "schedule": "0 14 * * *" }
  ]
}
```

Proposed additions:
```json
{
  "crons": [
    { "path": "/api/cron/notify_matches", "schedule": "0 14 * * *" },
    { "path": "/api/cron/weekly_digest", "schedule": "0 14 * * 1" },
    { "path": "/api/cron/trial_reminders", "schedule": "0 13 * * *" },
    { "path": "/api/cron/beta_deadline", "schedule": "0 12 * * *" }
  ]
}
```

All times UTC. Sends arrive ~10am ET on weekdays.
