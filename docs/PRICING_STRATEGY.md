# CapturePilot Pricing Strategy

**Last updated**: 2026-06-03
**Replaces**: Migration 071 seed (Starter $49 / Pro $149) — now obsolete

## TL;DR

| Tier | Price | Annual | Includes |
|---|---|---|---|
| **Free** | $0 (post-trial fallback) | — | 50 matches/day, federal only, no AI, no export |
| **Light** ⭐ | **$39/mo** | **$374/yr (20% off)** | Federal + competitor + partner profiles · 200 matches/day · no AI · no API · no export |
| **Pro** | **$89/mo** | **$854/yr (20% off)** | Everything in Light + state/local (48 states) + AI proposals + AI summaries + capability statement AI + export + API + 3 team seats |
| Enterprise | Contact sales | — | Custom seats + SLA + dedicated support |

**14-day free trial** on signup gives full Pro access EXCEPT API + export (anti-scrape).

---

## Why these prices

### Market positioning

Direct competitors at the price band where Light + Pro will compete (data from `archive/research-2026-04/COMPETITIVE_ANALYSIS.md`, validated 2026-06):

| Competitor | Entry | Mid | Top | Trial |
|---|---|---|---|---|
| **GovTribe** | $1,350/yr ($112/mo) Federal-only | $1,800/yr ($150/mo) +SLED | $5,500/yr Growth Plus | 14d |
| **HigherGov** | $500/yr ($42/mo) 1 user/1K exports | $2,500/yr ($208/mo) 10 users | $5,000/yr Leader | trial |
| **SamSearch** | ~$99/mo Starter | ~$149-199/mo Pro | $1,000/yr/seat Enterprise | 7d |
| **Gov Contract Finder** | $0 (5 searches/day) | $39-99/mo Professional | $299/mo Max | trial |
| **Fed-Spend** | $0 (10 searches/mo) | $49/mo Researcher | $199/mo Pro · $999/mo Ent | mo-to-mo |
| **FindRFP** | $19.95/mo Regional | $29.95/mo National | — | trial |
| **BidNet (SOVRA)** | ~$9/state/mo Group | ~$36/state/mo SLED | ~$45/state/mo Fed+SLED | annual |
| **CapturePilot** ⭐ | **$0** (free trial) | **$39/mo Light** | **$89/mo Pro** | **14d full** |

**Where we land in this market**:

- $39 Light is **cheaper than every direct competitor** offering federal opportunity discovery. Only HigherGov Starter ($42/mo equiv) and Gov Contract Finder Free are remotely close, and neither offers competitor/partner profiles.
- $89 Pro is **significantly cheaper than the next-cheapest SLED+AI combo** (GovTribe Launch Plus $150/mo, SamSearch Pro $149-199/mo). We're offering ~40% more value for ~50% less.
- The Light→Pro gap is **$50/mo** — meaningful enough to make Pro feel like a real upgrade, small enough that converting Light users feels affordable.

### Why this gap works (Light → Pro psychology)

Pro is **$50/mo more** than Light. To justify it, Pro unlocks **5 distinct capability bundles** Light doesn't have:

1. **48 states of SLED** — 4,600+ state/local opportunities + 200 portals scraped via Bonfire + OpenGov + Socrata
2. **AI proposals** — full-section proposal writer (worth ~$50/mo at GovTribe's a-la-carte rate)
3. **AI summaries** — every opportunity gets a one-paragraph AI rollup
4. **Export** (CSV + XLSX) — bulk download up to 20 opps at a time, capability statement PDF
5. **API + team seats** — programmatic access, 3 collaborator seats

That's 5 high-value bundles each worth $20-100/mo standalone elsewhere — bundled at $50 incremental. Light users should see the upgrade as obviously worth it.

### Why we don't go cheaper (no $29 / $19 tier)

A few competitors charge $19-30/mo (FindRFP, BidNet per-state). They're focused on raw discovery only — no NAICS scoring, no AI, no competitor intelligence. Our Light tier matches them on price but bundles more (competitor + partner profiles, NAICS-aware match scoring).

Going lower would **train the market to expect $19/mo for the kind of bundle we offer**, which makes upgrade conversion much harder. $39 is the price floor we can sustain without devaluing the brand.

### Why we don't go higher (no $129 / $149 Pro)

GovTribe Growth Plus is $5,500/yr ($458/mo equivalent) for what's essentially our Pro tier plus an in-house analyst service. SamSearch Pro is $149-199/mo. Going $129+ on Pro would put us in their sales-friction zone where prospects expect demos, contracts, and account managers.

$89 sits in the **self-serve sweet spot**: low enough that a small business signs up without scheduling a call, high enough to be a real budget line for capture managers.

### Risk: "cheap = bad" perception

Buyers paying $24K/yr for GovWin may see $89/mo CapturePilot Pro as "too cheap to trust." Mitigation:

- **Pricing page positioning**: lead with capability comparison, not headline price
- **Trial = full Pro**: prospects experience the actual product, not a feature-limited preview
- **Case studies / testimonials**: surface them prominently on the pricing page once we have 5+ paying customers
- **Enterprise tier** still exists — large customers who need SLA + custom seats route there

---

## What's in each tier (full matrix)

| Feature | Free | Trial | Light | Pro | Enterprise |
|---|---|---|---|---|---|
| Federal opportunities (SAM.gov) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Matches per day | 50 | 1000 | 200 | 1000 | 10000 |
| Saved searches | 1 | 25 | 5 | 25 | 999 |
| State/local opportunities (48 states) | ❌ | ✅ | ❌ | ✅ | ✅ |
| Competitor profiles (view) | View only | ✅ | ✅ | ✅ | ✅ |
| Partner profiles (search + save) | ❌ | ✅ | ✅ | ✅ | ✅ |
| SAM.gov passthrough search | ❌ | ✅ | ✅ | ✅ | ✅ |
| Capability statement AI editor | ❌ | ✅ | ❌ | ✅ | ✅ |
| AI proposal writer (per month) | 0 | 25 | 0 | 25 | 999 |
| AI opportunity summaries | ❌ | ✅ | ❌ | ✅ | ✅ |
| Export to CSV / XLSX | ❌ | ❌ | ❌ | ✅ | ✅ |
| Capability statement PDF download | ❌ | ❌ | ❌ | ✅ | ✅ |
| API access | ❌ | ❌ | ❌ | ✅ | ✅ |
| Team seats | 1 | 1 | 1 | 3 | 999 |
| 14-day full trial | — | ✅ | ✅ | ✅ | — |
| 25% retention discount (cancel-flow) | — | — | ✅ | ✅ | custom |

---

## Trial mechanics

- **Length**: 14 days from signup
- **Card required**: Yes (we ask at signup, defer first charge to day 15)
- **What trial includes**: Full Pro access EXCEPT export + API (data-protection: prevents scrape-and-cancel)
- **Trial expiration**: User auto-converts to Pro on day 15 if card is on file. If card fails, they downgrade to Free.
- **Downgrade path**: User can switch to Light during trial without losing trial — they just keep paying $39/mo after day 15 instead of $89
- **Re-trial**: One trial per company / email domain — second-time signups go straight to paid

## Cancellation retention

The CancelFlow component (`src/components/billing/CancelFlow.tsx`) drives the experience:

1. **Step 1** — User clicks Cancel in `/billing`
2. **Step 2** — Reason questionnaire (5 buckets: too expensive / not enough opps / missing features / not ready / other)
3. **Step 3** — **Retention offer**: 25% off for 2 months (Stripe coupon `RETAIN25_2MO`)
   - If accepted → Stripe coupon applied, subscription continues, win
   - If declined → proceed to step 4
4. **Step 4** — Hard cancel confirmation (user types `CANCEL` to confirm)

After the 2-month discount window, the subscription auto-reverts to full price. User can cancel again at full-price renewal but won't get another retention offer for 12 months.

## Anti-scraping protection (Light = no export)

The decision to gate export to Pro only is **data-protection**:

- Light users paying $39/mo could pull our 65k federal opps + 200 SLED portals' worth of curated data in a single CSV export, then cancel — netting a one-time data dump for $39
- By gating export to Pro ($89/mo) we force serial customers to pay for ongoing access
- We also rate-limit on the server side via `lib/crawl-protection.ts` (per-IP + per-user request caps) so even Pro users can't industrial-scale scrape

## Annual discount math

- Light monthly: $39 × 12 = $468/yr · annual price $374/yr · **save $94/yr (20%)**
- Pro monthly: $89 × 12 = $1,068/yr · annual price $854/yr · **save $214/yr (20%)**

Annual incentive is the standard SaaS 20% — competitive with GovTribe (annual-only), HigherGov (annual-only), and SamSearch (~17% annual discount).

## Starter Pack (one-time, deferred)

Separately from the subscription tiers, we sell a **$70 one-time Capture Kit** (nurture email #8 advertises this). Post-checkout redirects to a Google Drive folder copy-link the buyer can clone into their own Drive.

**Status**: Not yet wired in Stripe. Awaiting Google Drive folder URL from user before building the redirect endpoint + Stripe product.

---

## When to revisit this pricing

Revisit triggers:
- **<2% trial→paid conversion** after 3 months at this price → consider lowering Pro to $69 or adding a $19 micro-tier
- **>10% Pro→Light downgrade** → bundle more into Light (e.g., 1 AI proposal/mo)
- **<3 cancellations accepting the 25% retention offer per month** → bump retention to 40% or extend to 3 months
- **Light revenue >5× Pro revenue** → pricing is too aggressive on Light; raise to $49

Don't revisit pricing for cosmetic reasons (e.g., "competitor X raised theirs") without trial-conversion data.
