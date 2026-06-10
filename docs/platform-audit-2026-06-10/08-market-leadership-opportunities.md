# Market Leadership Opportunities

## Where CapturePilot is already differentiated

Honest read on what's actually unique versus the incumbents:

**Real differentiation, today:**

- **Quick Checker as a true cold-start funnel.** SAM.gov has no front door. GovTribe and Bloomberg Government assume you already know what you're looking for. FedDataPoint and Highergov demand a paid demo before they'll show you anything personalized. CapturePilot points a website at the funnel and within 30 seconds shows a contractor their NAICS, their likely set-asides, their fit-scored opportunities, and 10 LLM-generated match summaries. Nothing on the market does that anonymously.
- **Worker_jobs fan-out queue per opportunity.** The migration-086 architecture — every new opp triggers 3-5 enrichment jobs that run on Vercel + Railway — is structural. Competitors run nightly batch enrichment. We can wire signal-to-pursuit in single-digit minutes once the queue is actually draining (it isn't right now — see weakness section).
- **Lifecycle-aware opportunity table.** ACTIVE → EXPIRING_SOON → MARKET_RESEARCH → EXPIRED → AWARDED → DISCOVERED is a real schema, not a filter. Highergov treats expired opps as gone. We keep them because incumbent intelligence lives there.
- **Capability Statement + Proposal generation tied to the actual user profile + opportunity.** Bloomberg has none of this. GovTribe has none. Highergov has a template library, not generation. Ours generates from the user's NAICS, past performance, certifications, and the opportunity's structured requirements when those fields are populated.
- **FlareSolverr-routed SLED ingestion.** Bonfire, OpenGov, TX SmartBuy — these portals are dark to most aggregators because of Cloudflare. We have a working defeat path (when the env vars are actually set on the worker, which today they aren't). At scale this is 5,000+ city/county/state opportunities competitors don't carry.
- **Bidirectional HubSpot push for consulting clients.** Strategic-brief auto-push on Quick Checker complete (Phase 5/6 shipped Jun 2026) means the sales side of the consulting business has CRM-grade lead intel without manual entry. No competitor does this because no competitor runs a consulting practice on top of their SaaS.

**Not actually differentiated (be honest):**

- Match scoring formula. NAICS+PSC+set-aside+geo+value+deadline is the standard 6-factor model. Highergov, GovTribe, and SAM.gov's own Watchlist do the same.
- Daily digest emails. Table stakes.
- Pipeline kanban. Every modern SaaS has this.
- "AI-powered" anything in the marketing copy. Everyone says this. It's noise.

---

## Data advantages to deepen

Four datasets, in order of moat depth:

**1. Past-performance graph (highest leverage).** We have 80K contractors, 91K SAM POCs, 78K opportunities, and FPDS award data. What we don't have is the bipartite graph: contractor → agency → NAICS → award-size → recompete-cycle. Build this and we can answer "who realistically wins this in your zone" — which is the question every capture manager actually asks. Stop at the surface-level "past awards panel" we ship today. Invest in the graph: nodes for contractor, agency-office, NAICS, contract vehicle; edges weighted by award count, dollar volume, recency, and incumbency length. The infrastructure is half there in `past_performance_stats` (compute_past_performance_stats cron, currently unscheduled — last ran Jun 8).

**2. Incumbent flip-prediction.** The recompete table exists. The intelligence that should sit behind it doesn't. Predict probability of incumbent loss on each upcoming recompete based on: contract performance period extensions, GAO protests against the incumbent, FPDS modification history (frequent mods = trouble), key-personnel turnover signals from LinkedIn, SEC 8-K filings for publicly-traded primes. The components exist — `gao_protests`, `sec_prime_filings`, `forecast_change_detection`, `recompete_scan` — they don't talk to each other. Wire them. This is the killer "should I bid?" feature.

**3. Agency-pain-points dataset.** We already have the marketing page at `/resources/agency-pain-points`. What we don't have is the structured data behind it — per-agency-office, the 5-10 recurring pain points evidenced by repeated sources-sought, RFI cancellations, protest patterns, sole-source justifications. Mine the existing 27K EXPIRED opportunities. Cluster by agency + NAICS + cancellation/award outcome. Surface "DLA Aviation has issued 12 sources-sought for predictive maintenance in 24 months and awarded nothing — they don't know what they want, here's the angle that wins" as a per-opportunity card.

**4. NAICS × set-aside × agency fit-scoring.** Today the matching score treats set-aside as a 20% binary factor. It should be a multivariate likelihood: an SDVOSB targeting VA construction in Region 4 has a wildly different win probability than the same SDVOSB targeting DoD R&D in Region 9 — and we have the FPDS data to prove it. Build the lookup table once (per quarter), cache it in `naics_stats` (the rollups are already structured for it), and the matching algorithm gets sharper than every competitor overnight.

---

## Automation moats

Workflows that are hard to copy because they require integrated data, not just one API:

**SDVOSB-cert + NAICS + agency-history-driven auto-pursuit.** When a new sources-sought lands that matches a user's NAICS AND their SBA certification AND the agency-office has awarded ≥3 times in the last 24 months to firms with their cert profile, auto-create a pursuit, auto-generate the response draft, and auto-schedule the 3-day follow-up email to the listed POC. Two competitors can mimic part of this. None can mimic all three integrated.

**Recompete loss-prevention for prime contractors.** A subset of users *are* the incumbents. For them, watch for: their contract entering its final 18 months, a sources-sought for the recompete posted in adjacent NAICS, a key competitor's NAICS expansion, a protest filed adjacent to their work. Trigger an automatic "your contract is at risk — here's the brief" notification 12-18 months out. This requires the past-performance graph + protest data + opportunity ingest + user profile. Highergov can see one signal at a time. We can see the pattern.

**Teaming-partner auto-introductions on capability gaps.** When a user starts pursuing an opp but their profile lacks a critical NAICS or cert the opp requires, surface 3-5 pre-vetted teaming candidates from the `tribal_contractors` table or our 80K contractor base, ranked by NAICS overlap and prior co-prime relationships from FPDS subaward data. Generate the intro email. One-click send through their email account (Gmail OAuth already wired). The partners table exists. The auto-recommendation logic doesn't.

**SLED-to-Federal bridging.** Most contractors do one or the other. The data shows the same NAICS often have buyers across both. When a user wins (or loses) a SLED opportunity, surface the 3 federal opportunities most similar in scope from the next 6 months. The mirror also works. This is a Highergov blind spot — they only do federal.

**Capability-statement auto-refresh on profile pivot.** When user changes NAICS, adds a certification, lands a marquee award — silently re-generate their capability statement variants in the background. They open the app a week later, see "We refreshed your capability statement based on your new GSA Schedule win — want to use it?". Retention play.

---

## AI/learning foundation

Six months from now we'll be in a position to ship a real win-prediction model — but only if we wire the telemetry now. The codebase reveals we're missing every loop that would let us learn.

**Wire today, harvest in 6 months:**

1. **Win/loss outcome capture at pipeline close.** `user_pursuits` has stages `submitted/awarded/lost/no_bid`. When a user moves a pursuit to awarded or lost, ask 2 questions: "What was the winning price?" (numeric, optional) and "Why did you win/lose?" (3 checkbox options + free text). Persist to `capture_outcomes` (table exists, 0 rows — never wired). 6 months × 200 users × 5 outcomes/month = 6,000 labeled training rows. Enough to train a binary fit-score classifier.

2. **Proposal-edit telemetry.** When a user generates a proposal section and edits it before download, capture the diff. Today the proposal generation runs as a background job and the user's final exported version is opaque to us. Add an "I'm done editing — save final version" button that persists the user-edited text alongside the AI draft. After 6 months we know which sections need the most editing (= worst prompt) and which contractor profiles consistently produce minimal edits (= best prompt match).

3. **Match-pursued telemetry.** When we recommend a HOT match and the user dismisses it without pursuing, that's a label. When they pursue without it being a HOT match, that's also a label. Today: `user_matches.is_dismissed` exists but is never analyzed. Build a weekly cron that computes "false-positive HOT rate" and "false-negative pursuit rate" per user. After 8 weeks the per-user weighting can shift personally — Sergio cares about set-aside more than value, Andre cares about agency-relationship more than NAICS depth.

4. **Email-engagement → opportunity-engagement correlation.** We have Resend webhook events (when they're actually flowing — currently dead, see weakness). Tie email open/click on a digest item back to whether the user opened the opportunity detail page. That builds a personalized digest ranker.

5. **Lead-brief outcome tracking.** Quick Checker → registered → first pursuit → first proposal → first award. Five funnel stages. Track time-between and drop-off per NAICS, per company size, per state. After 6 months we can target Quick Checker marketing at the segments that actually convert (and stop spending on the ones that don't).

6. **Capability-statement A/B telemetry.** The streaming SSE endpoint generates 6 sections sequentially. Randomly assign two prompt variants per section across users. Track which variants produce fewer edits and more downloads. After 4 months we have an evidence-based prompt library.

None of this requires fancy infrastructure. It's all `INSERT INTO outcomes_log` + a weekly aggregation cron. The competitive moat is the labeled dataset, not the model.

---

## Pricing + packaging insights

The codebase tells a story about pricing that doesn't match the actual value being shipped.

**Current pricing (per billing/page.tsx):** Free, Light $39/mo, Pro $89/mo, Consulting (custom).

**The honest read:**

- **We are dramatically underpriced for what Pro does.** Pro gets unlimited matching, AI proposal generation, capability statement builder, partner search, competitor tracking, recompete intelligence, forecast tracking, market intelligence, OAuth Google Drive save, AI email drafter, NAICS-tuned digest. Highergov charges $4K-$15K/year for less. GovTribe is $200-$400/mo. Bloomberg Government is $5K+/year. We're at $1,068/year.
- **The Light tier is a trap.** $39/mo with the same dataset access but capped features sends a signal that the core data isn't worth much. Either kill Light or reposition as a true "watchlist" tier (3 saved searches, weekly digest only, no AI features) at $19/mo.
- **There is no tier above Pro for serious users.** A capture manager at a 50-person firm pursuing $50M+ in opps would happily pay $499/mo for: unlimited proposal generations, team seats with shared pipeline, custom NAICS keyword libraries, API access for their CRM integration, priority enrichment (their opps jump the worker_jobs queue), dedicated competitor monitoring, capability statement variants per agency, recompete loss-prevention alerts on their own contracts. This tier doesn't exist.
- **The Startup Pack at one-time $$ is selling under value too.** The Quick Checker → Startup Pack flow shows real intent and real intel. Whatever it's priced at, it's likely too low — these buyers are sophisticated and reaching for help.

**Concrete repackaging:**

- **Watchlist** $19/mo — 3 saved searches, weekly digest, basic match scoring. Cap at 50 matches/month displayed.
- **Pro** $129/mo (up from $89) — everything we ship today.
- **Team** $399/mo for 5 seats — shared pipeline, team-wide saved searches, CRM API access, custom keyword library, capability statement variants.
- **Enterprise / Consulting** custom — managed onboarding, dedicated CSM, recompete loss-prevention, custom integrations.
- **Quick Checker Startup Pack** — keep one-time but bump price and add a 14-day "Pro trial included" hook to convert one-time to recurring.

The price increases are defensible because the product genuinely does more than the competition. The current pricing was set when the product was thinner. It hasn't been updated as features shipped.

---

## 90-day market position plays

Five concrete moves. Each has marketing leverage and trades on existing infrastructure:

**1. Ship "Recompete Radar" as a free public tool, gated only by email.** Take the recompete intelligence we already compute and put a public landing page at `/recompete-radar` that lets anyone paste a contract number and get a free 1-page report: when it expires, who the incumbent is, what protests have been filed against them, what adjacent opportunities have been posted. Capture the email, drop into the lead funnel. This is the kind of thing federal contractors share in Reddit r/govcon and on LinkedIn. SEO + LLM-citation moat (we already allow GPTBot, ClaudeBot per robots.ts).

**2. "Set-Aside Eligibility Audit" interactive checker.** Anyone can drop their UEI and get a one-page report on which set-asides they qualify for, which they're close to qualifying for, and what's required to get the missing certs. SBA's own tools require 5+ form pages. We have the SAM entity API + the cert taxonomy. 90-minute build using existing components. Massive top-of-funnel conversion because it answers a question every small contractor asks weekly.

**3. Publish a quarterly "State of the Federal Pipeline" report.** Pull from our 78K-opp corpus + FPDS + USASpending. Identify the 10 fastest-growing NAICS, the 10 agencies with the biggest unobligated-balance year-end spend coming, the 5 agencies cancelling the most sources-sought. PDF + interactive web version. Gated download. This is the kind of report Bloomberg Government charges $5K to subscribe to. We give it away. Press picks it up because it's data-driven and actually useful.

**4. Ship the HubSpot Marketplace integration as a free app.** Per the roadmap memory, this is parked-but-on-roadmap. Unparking it means every HubSpot user in govcon (and there are many — that's the dominant CRM in the segment) sees CapturePilot in their app store. The product itself is the marketing. Building it requires the work that's already done for our consulting clients' HubSpot push.

**5. "Compare to Highergov / GovTribe" feature pages with honest pricing tables.** Federal contractors search "Highergov alternative" and "GovTribe vs" constantly. Build clean comparison pages with our actual feature set, our actual pricing, and one differentiator they can't beat: Quick Checker as the cold-start. Pure SEO play — keyword volume is real and competition is weak.

---

## The honest weakness

Where competitors are still ahead, and what closing the gap costs:

**Coverage breadth.** Highergov pulls 50+ SLED portals, every state DOT, every federal IDIQ vehicle. We're at ~5,300 SLED rows after months of work, and the Cloudflare-defeat path that's supposed to scale this is currently broken (FlareSolverr env not set on the worker, 27% warm_cf_cookie failure rate). They have a 2-year head start on SLED. Close it: get the worker env fixed this week, then run a 30-day sprint to add 200+ Bonfire tenant seeds and the top 50 OpenGov portals. Expected gain: 20K+ new SLED opps.

**Contractor / decision-maker data depth.** GovTribe has spent years cultivating a contracting officer database with org charts. We have 91K SAM POCs and 5.8K government_contacts but no rolodex. They sell "warm intro" as a feature; we don't have that data. Close it: license a third-party (USASpending APIs + a paid Apollo refresh) for 6 months while we build our own from POC scraping + lead-brief enrichment outputs.

**Enterprise trust signals.** Bloomberg Government, FedDataPoint, GovTribe all have SOC 2 Type II, FedRAMP-aligned hosting talking points, named enterprise customers, and a sales motion built around procurement compliance. We have none of that, and the audit shows real security gaps (32 RLS-enabled tables with zero policies, public SECURITY DEFINER functions, fail-open cron auth on 12 routes, public file URLs for capability statements). Until these are closed, no enterprise contractor will sign. Close it: 4-week security hardening sprint (which is also documented in this audit's other reports), then immediately pursue SOC 2 readiness. The auditors will find none of these issues once we've done the fixes — they're all known and addressable.

**Data quality reliability.** 81% of our opps have null ai_win_strategy. 74% have null structured_requirements. 100% have null opportunity_score. Highergov ships enrichment that works. We ship enrichment that's broken (worker_jobs queue starved for 14 days, 88% analyze_attachments failure rate). The features competitors don't have are useless if the data behind them is empty. Close it: this audit's other reports cover the worker queue fixes. They're high-leverage, low-effort. Do them this week.

**Brand recognition.** Bloomberg Government has been around since 2009. Highergov for 5+ years. GovTribe similarly. We're new. The Quick Checker funnel + HubSpot marketplace + recompete-radar plays above are the path to recognition that doesn't require an outbound sales team we can't yet afford. Be the tool that helps newcomers, while the incumbents fight over the same 500 enterprise contracts.

---

The pattern: we have a structurally better architecture than the incumbents (job queue, lifecycle-aware data model, Quick Checker funnel, lifecycle integration with consulting CRM) and a worse execution layer right now (queue not draining, RLS gaps, env misconfiguration, pricing left at beta levels). Fix the execution this quarter and the architectural advantages compound. Don't fix it and the architectural advantages are theoretical.
