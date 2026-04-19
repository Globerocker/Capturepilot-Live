# Action Plan — Based on Competitive Research 2026-04-17

**Status**: Internal strategic document. Not for public sharing.
**Audience**: Andre + Americurial team
**Positioning anchor**: *"Veterans helping veteran-owned businesses win the government contracts they've earned."*

---

## 0. POSITIONING DECISION (drives everything below)

### Core narrative

- **Who we serve**: SDVOSB + VOSB + veteran-owned SMBs (plus allied small-business cohorts — 8(a), HUBZone, WOSB — but veteran-owned is the wedge)
- **Who we are**: Veterans + operators running the software (CapturePilot) AND the agency (Americurial)
- **What's unique**: Software-enabled consulting. Nobody else has our bundle. **Keep this quiet in public messaging.**
- **What we sell publicly**: Outcomes — more pipeline, more wins, less wasted time.
- **What we DON'T advertise** (competitive shield):
  - Our 140-point deterministic scoring formula
  - The specific cron pipeline architecture (ingest → score → enrich → backfill)
  - Our internal feature roadmap (B2G_FREE_TOOLS_RESEARCH §12)
  - The agency+SaaS hybrid model details — tease it, don't explain it
  - Exact TAM numbers from research (those are internal)
  - Which competitors we're beating on which axis

### Tagline candidates (pick one for both sites)

1. **"Veterans who help veterans win."** (short, punchy, sticks)
2. **"The veteran's edge in federal contracting."**
3. **"Federal contracts, built by veterans for veterans."**
4. **"We've served. Now we help you win what you've earned."**

Recommendation: **#1** for hero, **#4** as sub-headline or closing line.

---

## 1. WEBSITE CHANGES

Three sites. Each gets a different priority.

### 1.1 Americurial.com (agency site) — **HIGHEST PRIORITY**

**This site needs the most work. Goal: convert SDVOSB/VOSB visitors into discovery calls.**

#### This week (2026-04-17 → 04-24)

1. **Hero rework**:
   - Headline: "Veterans Who Help Veterans Win."
   - Sub: "Americurial is the veteran-led capture agency behind \$X billion in federal wins for veteran-owned small businesses." *(leave $X blank until we have a real number — use a case study once we land the first 3 wins)*
   - Primary CTA: **"Book a 20-min Vet-to-Vet Call"** (not "contact us", not "schedule demo" — specific + in-group language)
   - Secondary CTA: **"Download: The SDVOSB's $14B Opportunity Map"** (lead magnet — see §1.1 below)

2. **Founder page / "Who We Are"**:
   - Andre's veteran story (1 paragraph, honest, no hero-complex)
   - Team photos in something other than suits (polo shirts, on-site, humanizing)
   - "We've been where you are" positioning

3. **Publish pricing** (biggest differentiator in the agency tier — see §4.2):
   - Starter / Growth / Scale packages with clear monthly prices
   - Transparent = trust for a cohort burned by consultants

#### Short-term (this month)

4. **Build a "Free Tools" hub** — copy SamSearch's playbook (14 interactive tools). Start with:
   - **SDVOSB Eligibility Checker** (simple form → PASS/NEEDS-WORK/FAIL) — biggest SEO opportunity; no agency competitor owns this
   - **Veteran Contract Match Finder** (enter NAICS + state → surface 3 live SDVOSB set-asides from SAM.gov) — front-end for our existing `/api/partners/search`
   - **Wrap Rate Calculator** (SamSearch has this; we can replicate in 1 day)
   - **Capability Statement Builder** (we already have this in CapturePilot — expose a free version on americurial.com)
   - **NAICS AI Lookup** (we already have this — expose free version)

5. **Lead magnets (gated PDFs — email capture)**:
   - *The SDVOSB's $14B Opportunity Map* — list of top 50 agencies buying from SDVOSBs + avg contract size + top NAICS
   - *How to Win Your First VA Contract in 90 Days* (the VA is the #1 SDVOSB buyer — lead with it)
   - *VetCert Migration Checklist* (SBA merged CVE + Vets First into VetCert in 2023; many veterans confused — own this confusion)
   - *7 Mistakes Veterans Make on Their First Federal Proposal*
   - *Sources Sought → Award: A Veteran's Playbook*

6. **Case study page** — as soon as we have 1 win, write it up. "Company X, SDVOSB out of Texas, won a $1.2M VA contract in 4 months. Here's exactly how."

#### Medium-term (this quarter)

7. **Blog + SEO**: one post per week targeting veteran-specific keywords:
   - "How to get VetCert certification 2026"
   - "SDVOSB vs VOSB: which should I apply for?"
   - "Best NAICS codes for veteran-owned businesses"
   - "How SDVOSBs win VA contracts without a GSA Schedule"
   - "Top federal agencies buying from veteran-owned businesses (ranked)"
   - Target: rank in top 10 within 6 months for ~20 SDVOSB-specific queries

8. **Founder content engine** (copy Neil McDonnell playbook):
   - Andre does a **weekly LinkedIn Live**: "Veteran GovCon Office Hours — ask me anything"
   - Clip highlights into short-form video → LinkedIn + YouTube Shorts
   - Repurpose into blog posts and newsletter

### 1.2 CapturePilot.com (SaaS site)

#### This week

1. **Add veteran lens to hero** without making the product feel niche:
   - Headline: "The federal-contract OS built by veterans who've won them."
   - Sub: "CapturePilot helps small businesses — especially SDVOSBs, VOSBs, 8(a)s, HUBZones, and WOSBs — find, score, and win federal contracts."
   - Primary CTA: **"Start free (no credit card)"** (self-serve matters; see §4.1)
   - Secondary CTA: **"See a 2-min demo"** (video, not a call booking)

2. **Publish pricing** (we already want to; competitive research confirms transparent pricing is our edge):
   - Free / Explorer / Builder / Winner (see §4.1 for numbers)
   - **Veteran discount**: 20% off any paid tier for verified SDVOSB/VOSB (gated by SAM UEI lookup)

3. **Social proof panel**: swap "testimonials" for "Built by veterans, trusted by veterans" with customer logos (once we have them)

#### Short-term

4. **Free-tool pages** — same tools as americurial.com but deeper inside the product funnel:
   - `/tools/sdvosb-checker`
   - `/tools/wrap-rate`
   - `/tools/capability-statement-builder` (free tier — 1 save, 1 download, upgrade prompt for more)
   - `/tools/naics-lookup`
   - `/tools/far-clause-lookup` (new — powered by eCFR API, see §5)
   - Each tool ends with "Want this for every opportunity you track? Try CapturePilot free →"

5. **Blog + resource hub** — separate from Americurial's. CapturePilot.com blog is product + data insights:
   - "We analyzed 37K federal opportunities. Here's what we found."
   - "The 10 most profitable NAICS codes for SDVOSBs in FY26"
   - "Why 95% of SAM.gov opportunities never get bid on" (HigherGov has a good post on this — write the veteran-lens version)

6. **Integrations page**: list Slack, Zapier (once built), MCP (once built). Even "coming soon" signals seriousness.

#### Medium-term

7. **Comparison pages** (steal from Fed-Spend playbook — they have 6+ comparison posts):
   - `/compare/govwin-alternative`
   - `/compare/samsearch-alternative`
   - `/compare/cleatus-alternative`
   - `/compare/highergov-alternative`
   - Each honest about when their tool is better + when ours is
   - Ranks for "X alternative" SEO + captures mid-funnel buyers

### 1.3 American (americurial spelled differently?) — clarify

*Note: task said "americareal.com" but the repo has `americurial/`. Treat as same site. If different, flag to me.*

---

## 2. SOFTWARE FEATURES & AUTOMATIONS

Prioritized from [B2G_FREE_TOOLS_RESEARCH §12](B2G_FREE_TOOLS_RESEARCH.md#12-feature-gap-backlog-vs-software-competitors). Timeline assumes 1 full-time dev (Andre or hire).

### 2.1 Sprint 1 (next 2 weeks) — P0 table-stakes

| # | Feature | Effort | Where it lives |
|---|---|---|---|
| 1 | **Capture Briefs (auto-generator)** | 2 days | `/api/ai/capture-brief` + opportunity detail button |
| 2 | **GSA CALC labor rates ingestion** | 1-2 days | New cron + `labor_rates` table + Price-to-Win tab |
| 3 | **Compliance Matrix generator (XLSX export)** | 1 week | `/api/ai/compliance-matrix` + extend `structured_requirements` |
| 4 | **SBA DSBS 300K firm ingestion** | 3 days | Upgrade `tribal_contractors` to full DSBS dataset |
| 5 | **Veteran-profile flag** | 0.5 days | Add `is_veteran_owned`, `veteran_cert_type` to `user_profiles`; auto-detect via SAM Entity API; use in scoring weights |

### 2.2 Sprint 2 (weeks 3-4) — P1 differentiators

| # | Feature | Effort |
|---|---|---|
| 6 | FAR Clause Inline Lookup (powered by eCFR + far-rag-api) | 2-3 days |
| 7 | DoD Daily Contracts feed ingestion (war.gov scraper) | 1 day |
| 8 | Federal Hierarchy API integration (replaces hand-maintained agency list) | 1 day |
| 9 | DeepSeek V3.2 as secondary LLM for proposal drafting (cut LLM cost 70-90%) | 2 days |
| 10 | Market Watch (saved search → weekly Monday digest email) | 1 week |

### 2.3 Sprint 3 (month 2) — Differentiators

| # | Feature | Effort |
|---|---|---|
| 11 | AI Capability Matrix (company × opp fit) | 2-3 days |
| 12 | Recompete Radar (expiring contracts → score likelihood) | 1 week |
| 13 | GAO Bid Protest tracker ("Protest Radar") | 1 week |
| 14 | MCP Server (connect Claude/ChatGPT to CapturePilot data) | 1 week |
| 15 | Zapier integration (Pursuit Added trigger → any CRM) | 1-2 weeks |

### 2.4 Sprint 4+ (month 3+) — Moonshots

Ordered by veteran-relevance first:

| # | Feature | Why veterans specifically benefit |
|---|---|---|
| 16 | **Veteran-weighted scoring boost** | Automatically up-weight opportunities with SDVOSB set-asides or VA agency by +15 points for veteran profiles |
| 17 | **VetCert status cache** | Scrape SBA Cert Search for user's UEI monthly; alert if cert is expiring in 90 days |
| 18 | Agency Forecast Change Detection (changedetection.io) | First-mover advantage on VA + DoD forecasts |
| 19 | Voice-First Capture Briefs | Consultants drive between meetings; this differentiates |
| 20 | Slack/Teams bot ("@capturepilot what RFPs dropped today?") | Retention + stickiness |
| 21 | CPARS-proxy Past-Perf Rating (FPDS mods + GAO protests → synthesized rating) | Helps SDVOSBs position against incumbents |
| 22 | Pre-Proposal Conference Tracker | Most veterans don't know about industry days — this surfaces them |

### 2.5 Always-on automations (cron schedule additions)

Add to `vercel.json` over time:

- **08:00 UTC daily**: DoD war.gov scrape → `daily_dod_awards` table
- **10:00 UTC daily**: GAO Protest RSS → `bid_protests` table
- **12:00 UTC daily**: Agency forecast change detection → `forecast_changes` table
- **02:00 UTC Sunday**: Weekly Market Watch digest emails
- **03:00 UTC 1st of month**: Full DSBS refresh (~300K firms)
- **04:00 UTC 1st of month**: Full CALC labor rates refresh
- **04:00 UTC Sunday**: VetCert status check for all veteran profiles

---

## 3. PROCESS OPTIMIZATION — Colleague Customer Acquisition Guide

**For**: Andre's team member running sales/BD.
**Goal**: a repeatable playbook so 10 discovery calls a week turn into 2+ signed clients.

### 3.1 ICP — who we target (in priority order)

1. **Certified SDVOSB/VOSB with UEI and CAGE code, 1-50 employees, <$10M revenue, 0-5 federal wins** (primary — they need the most help and have highest LTV relative to CAC)
2. **Veteran-owned 8(a) or HUBZone firms** (secondary — broader set-aside eligibility)
3. **Transitioning veterans starting a business in year 1-2** (tertiary — long sales cycle but high loyalty)
4. **Non-veteran small businesses teaming with veterans** (quaternary — if they book, upsell them, but don't lead outreach to them)

**Never target**: Fortune 500, defense primes, companies already using GovWin/Deltek. We will lose to them on enterprise features. Our wedge is SMB + veteran.

### 3.2 Sourcing targets (daily 30-minute routine)

Every weekday, spend 30 minutes building the daily prospect list:

- **SAM.gov Entity Search**: filter `SDVOSB = true` or `VOSB = true` + state + NAICS → pull 20 new companies/day
- **LinkedIn**: search `"SDVOSB" OR "service disabled veteran owned" "small business"` + filter by company size 2-50
- **APEX Accelerators (formerly PTAC)**: each state has one; they maintain veteran client lists publicly
- **VA OSDBU events**: VA's Office of Small and Disadvantaged Business Utilization runs monthly veteran matchmaking events — register + connect
- **Reddit / forums**: r/govcon, r/smallbusiness, LinkedIn groups "SDVOSB Network", "Veteran Entrepreneurs"
- **GovCon Giants YouTube comments**: Eric Coffie's audience is heavily veteran — Andre replies with value, not pitches

### 3.3 Outreach sequence (5-touch, 14-day cycle)

**Day 1 — LinkedIn connection request**:
> "Hi {first name}, fellow veteran here — I saw {SDVOSB cert} + your focus on {NAICS}. I run Americurial, help vet-owned firms land federal contracts. Open to trade notes sometime?"

**Day 3 — If accepted, follow-up message**:
> "Thanks for connecting. One thing I noticed about {their agency target / NAICS}: {1 specific insight from their SAM profile or public data}. Happy to send you a 1-page market map for {their NAICS} — no strings. DM me your email?"
>
> *(Send the 1-pager. Not a pitch — a genuine useful market snapshot.)*

**Day 7 — Email follow-up**:
> Subject: Veteran-to-veteran favor
>
> Body: "Saw you're a {SDVOSB}. Americurial has helped {X} veteran firms land federal work in the last year. Would 20 minutes next week be useful? I promise a no-BS conversation — we either fit or we don't."
>
> — One link: calendar.americurial.com/vet-call

**Day 11 — Book-a-call reminder** (only if Day 7 read but no reply):
> "Hey {first}, last nudge — if you're open to talking, here's a 20-min slot: {link}. If not, no worries and stay in the fight."

**Day 14 — Drop from sequence.** Re-enter in 90 days with a different angle (new case study, free tool launch, etc.).

### 3.4 Discovery call script (20 minutes)

**Minute 1-3 — Rapport (veteran-to-veteran)**:
- "What branch? When did you serve?"
- Share 1 personal hook (1-2 sentences, genuine, NOT resume recitation)
- State the goal: "I've got 20 minutes. My job today is to see if we're a fit. If we're not, I'll tell you who is."

**Minute 3-8 — Listen**:
- "Walk me through where you are. Certified already? How many federal bids have you submitted? Any wins?"
- "What's been the hardest part — finding opportunities, bidding, or winning?"
- "If we nailed this together in 6 months, what does that look like for your business?"

**Minute 8-15 — Position**:
- Match their pain to 2-3 specific Americurial services (NOT the whole menu)
- Show them the CapturePilot dashboard briefly (screen-share, 60 seconds max) with an opportunity that matches their profile
- "Here's what we'd do in the first 30 / 60 / 90 days with your firm..."

**Minute 15-18 — Pricing & next step**:
- Quote a tier (see §4.2). If they hesitate, offer paid pilot ($500, 30 days, scoped deliverable).
- "Here's the agreement — I'll send it by EOD. If you're in, we start Monday."

**Minute 18-20 — Close or graceful exit**:
- If fit: schedule kickoff call and send contract
- If not fit: refer them to a free resource (FedBiz'5 podcast, GovCon Chamber Live, an SBA APEX Accelerator in their state) + stay warm for 6-month follow-up

### 3.5 Things the colleague should NEVER say on calls

- "Our algorithm uses 140 points..." (don't reveal scoring specifics)
- "We scrape data from..." (never "scrape" — always "ingest" or "aggregate")
- "Our competitors don't have..." (punching down looks insecure)
- "We charge $X because competitor Y charges $Z" (anchor on outcomes, not their pricing)
- Any specific number for "how many clients we have" unless we've confirmed the number that week
- Our future feature roadmap beyond the next 30 days

### 3.6 Things to emphasize repeatedly

- **Veteran-to-veteran trust**: in-group signals matter; be specific about service (branch, years, not classified details)
- **Outcomes**: contracts won, not features shipped. "{Client} won $1.2M" > "Our platform has 22 features"
- **Speed**: "First opportunity surfaced in 24 hours, first bid submitted in 30 days"
- **Transparency**: "Here's exactly what we do, here's exactly what it costs, here's exactly when"
- **Veteran-specific knowledge**: reference VetCert, VA OSDBU, VOSB/SDVOSB set-aside preferences, specific VA NAICS behaviors

### 3.7 Weekly operating rhythm

- **Monday 8am**: 30-min pipeline review (prospects in each stage, next action for each)
- **Tue-Fri 8-9am**: outreach hour (30 new prospects + all Day-3/7/11 follow-ups)
- **Tue-Thu 10-4**: discovery calls and client work
- **Friday 3pm**: weekly wrap — what worked, what didn't, 1 experiment for next week

---

## 4. PRICING RESTRUCTURE

### 4.1 CapturePilot (SaaS) — publish on pricing page

| Tier | Monthly | Annual (20% off) | Who it's for | What's in it |
|---|---|---|---|---|
| **Free** | $0 | $0 | Veterans exploring GovCon | SAM.gov search · 3 saved opportunities · Basic scoring · Capability statement builder |
| **Explorer** | $49 | $39/mo ($468/yr) | Solo vet launching | Everything free + unlimited saves · AI scoring (HOT/WARM/COLD) · 10 AI proposal drafts/mo · Email alerts · NAICS/PSC filters |
| **Builder** | $149 | $119/mo ($1,428/yr) | SDVOSB with 1-5 employees | Everything Explorer + pipeline/Kanban · capture briefs · compliance matrix · 50 AI drafts/mo · Slack alerts · teaming partner search |
| **Winner** | $299 | $239/mo ($2,868/yr) | Growing vet firm 5-20 employees | Everything Builder + labor rate Price-to-Win · recompete radar · protest radar · unlimited AI drafts · 3 seats · API access |
| **Enterprise** | Custom | Custom | 20+ employees | Everything Winner + MCP server · Zapier · custom integrations · dedicated success manager · SSO · white-label option |

**Veteran discount**: 20% off any paid tier for verified SDVOSB/VOSB (we verify via SAM Entity API cert lookup on signup — zero-touch).

**Annual discount**: 20% off when paid yearly. Shown prominently.

**Free trial**: 14 days on Builder (no card). After trial, auto-downgrade to Free.

### 4.2 Americurial (Agency) — publish on pricing page

| Tier | Monthly | Setup | Who it's for | What's in it |
|---|---|---|---|---|
| **Vet Starter** | $499/mo | $0 | SDVOSB, pre-revenue federal | SAM registration + maintenance · capability statement · 1 opportunity review/mo · CapturePilot Builder included · weekly 30-min check-in |
| **Vet Growth** | $1,499/mo | $500 | SDVOSB with 1-3 federal wins or active pursuit | Everything Starter + capture management for up to 2 active pursuits · proposal review · teaming partner sourcing · CapturePilot Winner included · bi-weekly 60-min strategy call |
| **Vet Scale** | $3,500/mo | $1,500 | SDVOSB $1M+ in pursuits, expanding | Everything Growth + full proposal development (up to 2/quarter) · orals coaching · post-award compliance (CPARS, invoicing) · CapturePilot Enterprise · weekly working session + on-call support |
| **Capture Sprint** | $4,999 flat | — | One-off, high-stakes bid | Full capture + proposal for a single opportunity, 30-60 day engagement, fixed fee |

**Success fee option** (optional add-on): 2% of contract value for wins >$500K. Clients opt in; reduces monthly fees by $500 in exchange.

**Why this pricing works**:

- **Starter at $499/mo** is 2x RSM Federal's $249/mo Inner Circle — but we include the software (which RSM doesn't have). Same transparency.
- **Mid-tier at $1,499/mo** matches typical GovCon consultant hourly burn (~10 hours at $150/hr) but productized.
- **Scale at $3,500/mo** is well below Lohfeld/Shipley's fully-loaded rates ($5-10K+/mo) but with software leverage.
- **Sprint at $4,999 flat** gives a low-commitment entry point — no monthly lock-in.

### 4.3 Bundled pricing (the hidden weapon)

Any Americurial client gets the matching CapturePilot tier included. This is our unique moat.

**On the site**: phrase it as "CapturePilot access included" — DON'T break out the software value. If competitors can see we bundle $299/mo software into $1,499/mo service, they'll copy it. Keep the bundle opaque.

---

## 5. DATA ENRICHMENT — Tools to Add to the Database

Full detail in [B2G_FREE_TOOLS_RESEARCH.md Part 2](B2G_FREE_TOOLS_RESEARCH.md#part-2--2026-04-17-update-additional-tools--feature-gaps-from-competitor-analysis). Here's the prioritized implementation list:

### 5.1 Immediate (this sprint) — expand contractor + opportunity database

| Tool | What it adds | Implementation |
|---|---|---|
| **SBA DSBS bulk ingestion** (§8.11) | ~300K certified small businesses (vs our current 800 tribal + whatever's in `contractors`) — including 40K+ SDVOSB/VOSBs | Python tool `tools/25_ingest_dsbs.mjs` → `contractors` table with cert columns |
| **GSA CALC labor rates** (§8.1) | 500K+ awarded labor rates by category, education, experience | New `labor_rates` table + nightly cron |
| **SAM.gov Entity Management API** (§1.5 original) | Full contractor details — certs, NAICS arrays, POCs, business size — for any UEI | Enrichment cron that fills gaps in `contractors` |
| **Federal Hierarchy API** (§8.3) | Authoritative agency org chart (replaces hardcoded lists) | One-time load → `agencies` table |
| **war.gov DoD Daily Contracts** (§8.10) | Real-time ≥$7.5M DoD awards (3-6 months before FPDS) | Daily scraper → `daily_dod_awards` table |
| **SBA Certification Search** (§8.12) | Real-time VetCert / 8(a) / HUBZone / WOSB status | Monthly batch per user; on-demand per partner |

### 5.2 Medium-term — deeper intelligence

| Tool | What it adds |
|---|---|
| **FPDS via `fpds` Python package** (§7.1 original + §8 new) | Historical award detail, modifications, competition intel for every UEI |
| **GAO Bid Protests RSS + scrape** (§8.9) | Protest docket + outcomes — feeds "Protest Radar" feature |
| **govinfo API** (§8.7) | Agency budget documents → replaces hardcoded `agency_spend_forecast` |
| **Regulations.gov API** (§8.4) | Rulemaking signals that precede contract opportunities |
| **Federal Register API** (§8.5) | EOs + agency notices |
| **GLEIF LEI Lookup** (§8.13) | Corporate family trees for competitor intel |
| **Congress.gov API** (§8.8) | Appropriations + authorization bill tracking |
| **eCFR API + far-rag-api** (§8.6 + §9.3) | FAR/DFARS clause lookup |
| **Archive.org Wayback** (§4.4 original) | Competitor cap-statement history |

### 5.3 Long-term — defensive moats

| Tool | What it enables |
|---|---|
| **changedetection.io** (§9.6) | Monitor agency forecasts + competitor sites for changes (BidPrime-killer) |
| **Mistral OCR** (§10.1) | Better/cheaper attachment parsing than current pipeline |
| **DeepSeek V3.2** (§10.4) | 70-90% cheaper LLM calls for proposal drafting |
| **Apify marketplace** (§11.3) | Pre-built scrapers for LinkedIn, niche gov sites |
| **Section 889 Compliance Tool** (§9.2 — NASA OSS) | Compliance self-check for user profiles |

### 5.4 Database schema adds (new migrations)

Propose new migrations after 041:

- `042_veteran_profile_flags.sql` — add `is_veteran_owned`, `veteran_cert_type`, `veteran_branch`, `discharge_type` to `user_profiles`
- `043_labor_rates.sql` — GSA CALC ingestion target
- `044_daily_dod_awards.sql` — war.gov ingestion
- `045_bid_protests.sql` — GAO data
- `046_forecast_changes.sql` — agency forecast change detection
- `047_expanded_dsbs.sql` — extended contractor schema for DSBS bulk load

---

## 6. 90-DAY ROLLOUT CALENDAR

### Month 1 (2026-04-17 → 2026-05-17) — Foundation

- **Week 1**: Americurial site hero + pricing + vet CTAs · CapturePilot pricing page live · Sprint 1 software features (Capture Briefs, CALC, DSBS) · Colleague onboarded on outreach playbook
- **Week 2**: 5 free tools live on Americurial (SDVOSB checker, NAICS, wrap rate, cap statement, opportunity finder) · 50 cold outreach attempts (target: 5 discovery calls booked)
- **Week 3**: Sprint 1 ships · 2 lead-magnet PDFs published (SDVOSB Opportunity Map, VA 90-day playbook) · First case study if any early client wins · LinkedIn Live #1
- **Week 4**: Sprint 2 begins · Blog posts #1-4 live · 10 discovery calls / 2 signed clients target

### Month 2 (2026-05-17 → 2026-06-17) — Automation + Reach

- Sprint 2 ships (FAR lookup, Market Watch, war.gov feed)
- 4 more blog posts · 1 more lead magnet · LinkedIn Live weekly rhythm established
- First comparison page live (`/compare/cleatus-alternative` or similar)
- Target: 3 Americurial clients paying, 10+ CapturePilot Builder/Winner users

### Month 3 (2026-06-17 → 2026-07-17) — Scale

- Sprint 3 ships (Recompete Radar, Protest Radar, MCP)
- Referral program launched (1 month free for referred client)
- First veteran-only webinar (100 attendees target)
- Target: $10K MRR from software + $8-12K MRR from agency retainers

---

## 7. GUARDRAILS — WHAT WE DO NOT PUBLISH

Put this on a sticky note:

1. **Don't publish the scoring formula.** "Proprietary matching" is fine. "140-point deterministic scoring across NAICS, PSC, set-aside, geography, value, and deadline" is too much.
2. **Don't publish the tool stack.** Customers don't care we use Supabase + Vercel + OpenAI. Competitors do.
3. **Don't publish roadmap items >30 days out.** Show momentum, not moat.
4. **Don't publish exact customer count** unless >100. "Hundreds of veteran contractors" is fine; "47 customers" undermines.
5. **Don't publish the agency + SaaS bundle ratio.** Say "CapturePilot access included." Don't say "Includes $299/mo software."
6. **Don't name-drop competitors on our main pages.** Only mention them on purpose-built comparison pages.
7. **Don't reveal which data APIs feed which features.** "Multi-source intelligence" > "We pull from FPDS + USASpending + DSBS + CALC."

---

## 8. METRICS TO TRACK (weekly)

| Category | Metric | Target Month 1 | Target Month 3 |
|---|---|---|---|
| **Website (Americurial)** | Unique visitors | 500/wk | 2,500/wk |
| | Email captures (lead magnets) | 10/wk | 75/wk |
| | Discovery calls booked | 5/wk | 15/wk |
| **Website (CapturePilot)** | Free signups | 20/wk | 150/wk |
| | Free → Paid conversion | 5% | 12% |
| **Sales** | Discovery calls taken | 5/wk | 20/wk |
| | Calls → signed clients | 40% | 30% |
| | Americurial MRR | $2K | $12K |
| | CapturePilot MRR | $500 | $10K |
| **Product** | Feature ships/sprint | 3-5 | 4-6 |
| | Opportunity DB size | 37K | 50K+ |
| | Contractor DB size | 80K | 300K+ |

---

**Next review**: 2026-05-17. Update this file with real numbers vs targets; adjust the plan.
