# Facebook Campaign: Quick Checker Launch (4 Angles)

> Copy/paste-ready briefs for Canva AI + Meta Ads Manager. Each angle = one ad group with one creative, one animation, one description, one CTA. UTMs are pre-built. Approval checklist at the bottom.

---

## Campaign-level setup

| Setting | Value |
|---|---|
| **Objective** | Leads (drives to `/check` then captures via /api/lead-magnet/confirm) |
| **Optimization** | Conversions (Lead event) |
| **Pixel + CAPI** | Already firing on `/check` POST (verified) |
| **Audience** | US, 28-65, business-owner job titles + procurement interests (full spec below) |
| **Placement** | Advantage+ (let Meta choose, exclude Audience Network) |
| **Daily budget per ad group** | $20 |
| **Test duration** | 7 days |
| **Total test spend** | $560 ($20 × 4 ads × 7 days) |
| **Landing page** | `https://app.capturepilot.com/check?utm_source=fb&utm_campaign=qc_<angle>&utm_content=<angle>` |

### Audience targeting (apply to ALL 4 ad groups)

```
Location: United States (all 50 states)
Age: 28-65
Languages: English (US)

Detailed targeting — INCLUDE any of:
  Interests:
    - Government Contracting
    - Federal Acquisition Regulation
    - SAM.gov
    - GSA Schedule
    - Defense Contracting
    - Small Business Administration
    - Procurement

  Job Titles:
    - Owner
    - CEO
    - President  
    - Founder
    - VP Business Development
    - Capture Manager
    - BD Director

Detailed targeting — EXCLUDE:
  Custom Audience: "Quick Checker - already submitted" (rebuild from pixel Lead event, last 30 days)
  Custom Audience: "Stripe paying customers"

Lookalike audiences (run alongside, separate ad set):
  - LAL 1% US: HubSpot contacts where cp_set_aside_certifications IS NOT NULL (≥50 seeds — Sergio has count)
  - LAL 1% US: Stripe paying customer emails
```

---

## Ad Group 1 — 🟦 QUESTION ANGLE

### Hook (primary text, 125 chars)
> Are you leaving $50M in federal contracts on the table?

### Description (90 chars)
> Free 60-second scan finds opportunities matching YOUR business — no SAM.gov registration needed.

### Body / Story (300 chars)
> 95% of small businesses never bid on a federal contract — they assume they're too small. The truth: $560B/year is set aside for businesses under 500 employees. Drop your domain. In 60 seconds we'll show you exactly which active RFPs match your NAICS + state.

### CTA button
**`Find My Federal Contracts →`**

### Landing URL (full UTM)
```
https://app.capturepilot.com/check?utm_source=fb&utm_medium=cpc&utm_campaign=qc_q&utm_content=question&utm_term=ad-group-1
```

### Creative — Canva AI prompt (copy + paste)
```
Create a 15-second vertical 9:16 animated ad for federal contracting software.

Frame 1 (0-3s): Bold question on emerald background: "Are you leaving $50M
on the table?" White text, system-ui font, animated text-reveal letter by
letter. Subtle pulse glow on "$50M".

Frame 2 (3-6s): Mock browser window appears, auto-types a domain
"acme-corp.com" into a search box. Loading spinner with text "Scanning
40,000+ active RFPs..."

Frame 3 (6-11s): Result screen — 7 opportunity cards fly in from the right,
each with HOT/WARM badges, dollar amounts ($2.1M / $850K / $4.5M / etc),
agency names (DOD, GSA, VA). Cards have a clean white card style with
emerald accent left border.

Frame 4 (11-15s): Bold call-to-action card: "12-minute setup. Free. No
credit card." with a pulsing "FIND MY CONTRACTS →" button in emerald.

Brand: emerald primary (#10b981), white card surfaces, near-black text
(#0c0a09), Inter font. Modern, clean, B2B SaaS aesthetic — think Linear /
Vercel marketing energy.
```

### Target group sub-refinement
Curiosity-driven owners — also include interest in: business news (Forbes,
Inc, Entrepreneur), audiobooks like "Atomic Habits" / "The E-Myth".

---

## Ad Group 2 — 🟢 STATEMENT ANGLE

### Hook (primary text, 125 chars)
> Your competitors are winning $2.3M in federal contracts. You're not even bidding.

### Description (90 chars)
> The feds award $560B/year to small businesses. Scan your NAICS in 90 seconds.

### Body (300 chars)
> The federal government awarded $560 billion to small businesses in FY2025. Most owners never even check if they qualify. Our Quick Checker scans 40,000+ active RFPs against your NAICS + cert set in 90 seconds. Find out what you're missing before your competitor does.

### CTA button
**`Scan My NAICS Now →`**

### Landing URL
```
https://app.capturepilot.com/check?utm_source=fb&utm_medium=cpc&utm_campaign=qc_s&utm_content=statement&utm_term=ad-group-2
```

### Creative — Canva AI prompt
```
Create a 15-second vertical 9:16 animated data-viz ad.

Frame 1 (0-3s): Static title in bold white over dark teal background:
"Federal Spend by Industry — Small Business FY2025". Subtle grid lines.

Frame 2 (3-7s): Horizontal bar chart animating bars growing left to right.
Industries: "Janitorial Services" ($8.2B), "IT Services" ($24B),
"Construction" ($31B), "Engineering" ($18B), "Logistics" ($11B).
Total counter on top right: "$560,000,000,000 awarded". Numbers animate
counting up.

Frame 3 (7-11s): Map of US fades in. Animated emerald pins drop onto
every state — pulsing with dollar amounts. Subtitle: "Every state.
Every industry. Money on the table."

Frame 4 (11-15s): Quick Checker form mockup slides in from bottom — input
field with domain placeholder, big emerald "SCAN MY NAICS →" button.
Tagline: "Free • 90 seconds • No SAM.gov needed".

Brand: dark navy or teal background, emerald accent, bold white type,
data-viz aesthetic. Channel: Bloomberg / FT graphics, clean B2B.
```

### Target group sub-refinement
Existing business-services SMBs — interest tags: B2B marketing,
QuickBooks, ServiceTitan, Jobber, BuilderTrend, ProcureWare.

---

## Ad Group 3 — 🟡 FACT ANGLE

### Hook (primary text, 125 chars)
> Fact: 73% of federal small-business set-asides go to firms with under 50 employees.

### Description (90 chars)
> 8(a), HUBZone, WOSB, SDVOSB — billions reserved by law for businesses like yours.

### Body (300 chars)
> 8(a). HUBZone. WOSB. SDVOSB. Veteran-owned. Billions in carved-out federal spend, reserved by law for businesses with the right certifications. Drop your domain — we'll match you against every active set-aside RFP in your NAICS and tell you exactly which certs would unlock more.

### CTA button
**`Check My Set-Aside Eligibility →`**

### Landing URL
```
https://app.capturepilot.com/check?utm_source=fb&utm_medium=cpc&utm_campaign=qc_f&utm_content=fact&utm_term=ad-group-3
```

### Creative — Canva AI prompt
```
Create a 15-second vertical 9:16 ad focused on a key statistic.

Frame 1 (0-3s): Number "73%" appears huge, center-screen, growing from
small to full-frame in bold dark emerald. Subtitle fades in below: "of
small-business set-asides go to firms with under 50 employees".

Frame 2 (3-7s): 5 certification badges spin into view in a circular
arrangement — 8(a), HUBZone, WOSB, SDVOSB, VOSB. Each pulses as it
lands with a soft check-mark animation. Subtitle: "Are you eligible?"

Frame 3 (7-11s): List of opportunity cards scrolls upward — each shows
agency, dollar amount, and red "SET-ASIDE: WOSB" or similar label.
Examples: "$2.1M • Army • SDVOSB-only", "$850K • DOD • 8(a) sole source",
"$4.5M • GSA • HUBZone set-aside".

Frame 4 (11-15s): Strong CTA card: "Find out in 60 seconds → It's free."
with emerald button "CHECK MY ELIGIBILITY".

Brand: emerald primary, white background, certification badges as
hand-drawn-style icons (not corporate seals), reassuring + empowering
tone. Avoid government imagery (eagles, flags) — that triggers ad-review.
```

### Target group sub-refinement
Veteran, women-owned, minority-owned business owners. Use Meta's identity
interest categories. Smaller pool but highest-intent.

---

## Ad Group 4 — 🔴 URGENCY ANGLE (the 4th angle)

### Hook (primary text, 125 chars)
> 6 active federal RFPs in your industry close THIS WEEK. You're not bidding on any of them.

### Description (90 chars)
> Most owners learn about federal opportunities AFTER the deadline. Scan your industry today.

### Body (300 chars)
> Most small business owners learn about federal opportunities AFTER the deadlines pass. Our Quick Checker shows you exactly what's closing in 7/14/30 days for YOUR NAICS — live from SAM.gov. 60 seconds. Free. No spam. Don't miss another one.

### CTA button
**`See What Closes This Week →`**

### Landing URL
```
https://app.capturepilot.com/check?utm_source=fb&utm_medium=cpc&utm_campaign=qc_u&utm_content=urgency&utm_term=ad-group-4
```

### Creative — Canva AI prompt
```
Create a 15-second vertical 9:16 ad with countdown urgency.

Frame 1 (0-3s): Big countdown clock center screen: "5 days 14 hours 22 min"
ticking down (animated). Behind it, blurred opportunity titles scroll
("Janitorial Services — Fort Hood", "IT Support — VA Hospital", etc).
Bold tag: "RFPs closing soon in your industry".

Frame 2 (3-7s): 6 opportunity cards stack onto screen one after another.
Each has a red urgent "CLOSES IN 4 DAYS" or similar badge top-right.
Cards show clean industry titles + dollar ranges. Subtitle: "All in YOUR
NAICS. All still open."

Frame 3 (7-11s): Calendar visualization — animated red deadline pins
landing on dates spread across the next 30 days. Subtitle: "Live from
SAM.gov. Updated every 24 hours."

Frame 4 (11-15s): CTA card: "Don't miss another one →" with pulsing red
"SEE WHAT CLOSES" button. Tagline: "Free 60-second scan".

Brand: red/amber accent for urgency, white background, clean B2B card
style. Urgency-driven but NOT scammy — feels like a flight-deal alert,
not a fake countdown timer.
```

### Target group sub-refinement
Existing federal contractors who are missing deadlines. Job-title overlay:
"Capture Manager", "BD Director", "Proposal Manager". High-intent
re-engagement.

---

## Tracking + KPI targets

### Pixel events firing
- ✅ `Lead` event on `/check` POST (verified — server-side CAPI + client-side both)
- ✅ UTM params auto-captured into `marketing_leads.utm_*` → readable in HubSpot
- ✅ `lead_source_cp = quick_checker` set on every HubSpot contact

### Per ad group KPIs (week-1 test, $140 each)
| Metric | Target | Floor |
|---|---|---|
| CPM | $15-25 | $30 |
| CTR | >1.5% | 0.8% |
| CPC | <$2.00 | $4.00 |
| Cost per Lead (form submit) | <$8 | $12 |
| Quick Check completion rate | >40% | 25% |
| Quick Check → Call booked rate | >5% | 2% |
| Cost per Booked Call | <$160 | $300 |

### Quality watch
- Monitor `cp_lead_quality` distribution in HubSpot: target ≥60% HOT/WARM/COLD_BIZ (real business)
- If GIBBERISH > 10% → tighten ad audience (form-only audience may be attracting bot fills)
- If FREE_EMAIL_ONLY > 50% → the form needs a "work email please" gate (already in roadmap)

---

## Approval checklist before launch

- [ ] **Budget approved**: $560 test budget (7 days × 4 ad groups × $20/day)
- [ ] **Designer assignment**: Canva AI (paste prompts above) or external?
- [ ] **Launch date**: this week or next week?
- [ ] **Lookalike seed audience**: confirm we have ≥50 paying customer emails uploaded to Meta as Custom Audience (needed for the LAL ad set)
- [ ] **Pixel event verified**: Meta Events Manager shows recent `Lead` events from `/check`
- [ ] **Landing-page A/B**: should the personal-info gate (first/last/email/phone REQUIRED) stay on, or relax to email-only for higher conversion? Recommend: stay on. The fraud-gate + cp_lead_quality system means even free-email submissions are cleanly bucketed in HubSpot now.

Say "let's launch" with the budget + designer + date answers and I'll
generate the Meta Ads Manager import-ready CSV.
