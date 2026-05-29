# SLED expansion roadmap — from 1,740 → 150,000 opportunities

**Last updated:** 2026-05-29
**Owner:** Andre + Claude
**Current state (live):** 1,740 SLED opps across 121 portals, growing ~60/day after yesterday's orchestrator fix

---

## The math problem

To hit 150,000 active SLED opportunities, we need broader portal coverage. There is no single feed that gives us this — the US SLED procurement landscape is fragmented across ~30 platforms, ~50 state procurement systems, and thousands of municipal sites running everything from Granicus to homegrown WordPress.

### Today
| Metric | Count |
|---|---|
| Active SLED opps | 1,740 |
| Portals tracked | 121 (mostly Bonfire seeds) |
| Avg opps per portal | ~14 |

### Target (with realistic assumptions)
| Path | Effort | Outcome |
|---|---|---|
| Wire all 50 US state portals | 2 weeks | +20,000-40,000 |
| Add Periscope ePro (~300 tenants) | 3 days | +5,000-15,000 |
| Add DemandStar (~1,000 cities) | 5 days | +20,000-40,000 |
| Add BidNet RSS (~500 entities) | 2 days | +10,000-25,000 |
| Add IonWave + Vendor Registry + ProcureNow | 4 days | +5,000-10,000 |
| Add Granicus / CivicPlus pages (top 200 cities) | 10 days | +5,000-15,000 |
| Add school district aggregators (TIPS, Sourcewell) | 3 days | +5,000-15,000 |
| **Total realistic ceiling, free paths** | **~6 weeks** | **70,000-160,000** |

Hitting 150K with free-only paths is realistic but takes 6 weeks of focused build. Hitting 150K in **1 week** requires paid aggregators (GovWin / BidNet API / Periscope S2G — $5-50K/year).

---

## Phase 1 — quick wins (this week)

These reuse the orchestrator + existing Playwright worker. No new infra.

### 1a. Major state procurement portals (1-2 days each)

Already wired: **Texas SmartBuy** (yesterday). Order of priority by procurement volume:

| State | Portal | Tech | Est. opps | Notes |
|---|---|---|---|---|
| 1. California | eProcure / Cal eProcure | Custom | ~5,000 | Has CSV export + RSS |
| 2. Florida | MyFloridaMarketPlace | Periscope | ~3,500 | Subscribe via Periscope or scrape |
| 3. New York | NYS Contract Reporter | Custom | ~2,500 | RSS feed exists |
| 4. Illinois | BidBuy (Periscope) | Periscope | ~2,000 | |
| 5. Pennsylvania | DGS PA Supplier Portal | SAP Ariba | ~1,800 | Hardest — Ariba |
| 6. Ohio | Ohio Buys (Jaggaer) | Jaggaer | ~1,500 | |
| 7. Virginia | eVA | Periscope | ~2,500 | |
| 8. Massachusetts | COMMBUYS (Periscope) | Periscope | ~2,000 | |
| 9. Georgia | GeorgiaProcurementRegistry | Custom | ~1,800 | RSS |
| 10. Washington | WEBS (Periscope) | Periscope | ~1,500 | |

If we hit just these 10, **~24,000 new opps**. Most are Periscope-based, so once we have one Periscope adapter, the rest are config.

### 1b. Periscope ePro adapter (3 days)

[Periscope ePro](https://www.periscopeholdings.com/) (formerly BidSync) hosts a chunk of state + city procurement. Their public bid pages have a consistent structure — JSON endpoint at `/bso/external/publicBids.sdo` returns full open bid list per buyer org. We'd:

1. Build `lib/parsers/periscope-json.ts` (mirror of `bonfire-json.ts`)
2. Add `ingest_periscope` cron
3. Seed `rss_sources` with the 30-50 highest-volume Periscope tenants

Initial tenant list to seed (high-traffic):
- Texas Tech, City of Austin, City of Houston, Dallas County, Tarrant County
- Cal eProcure tenants
- Massachusetts COMMBUYS
- Virginia eVA agencies
- Washington WEBS
- Illinois BidBuy

### 1c. DemandStar adapter (5 days)

[DemandStar](https://network.demandstar.com/) hosts ~1,000 municipal procurements. Free public bid pages exist per agency at `https://demandstar.com/agency/<slug>`. Each agency page lists current bids; no API but DOM is consistent.

Architecture:
- Playwright worker task type: `scrape_demandstar_agency` (we already have the worker pool)
- Daily cron lists all known agencies, enqueues one job per agency
- Worker scrapes the bid list, upserts to `opportunities`

### 1d. Open-source seed: fork `jasonstaker/rfp-scraper`

The [rfp-scraper](https://github.com/jasonstaker/rfp-scraper) project (MIT licensed) claims to cover "all 50 US states + DC + major counties" via Selenium. Its Python module structure is per-state. **We don't run their code in production**, but we mine their modules for:
- Portal URLs for each state
- Form-submission flows
- Pagination patterns

This becomes our reference architecture for building TypeScript ports that fit our existing ingest pattern.

---

## Phase 2 — scale (next 2-4 weeks)

### 2a. School district + special district aggregators

- **TIPS Purchasing** (~600 districts, mostly TX/OK)
- **Sourcewell** (~50K members, contracts not bids — different shape)
- **NAEP / NAGCP** — buying co-ops
- **GovQuote** — smaller but free
- **OMNIA Partners** — co-op contracts

### 2b. CivicPlus / Granicus city sites

~10,000 municipalities run CivicPlus or Granicus. Their `/bids` or `/rfp` pages have consistent templates. We could:

1. Maintain a seed list of "active cities to crawl"
2. Daily Playwright worker task per city, extracts the bid list
3. Apply LLM cleanup if HTML structure varies (LangExtract via Ollama on the VPS — free)

This is the heaviest lift but the biggest scale. Top 200 cities = ~6,000-15,000 opps.

### 2c. Open Contracting Data Standard (OCDS) feeds

A handful of US cities publish to OCDS spec:
- San Francisco
- Washington DC
- New York City (partial)
- Chicago (partial)

These are JSON feeds — trivial to integrate, but coverage is thin.

---

## Phase 3 — buy what we can't scrape (decision point)

### Paid aggregator options

| Vendor | Annual cost | Coverage | API quality |
|---|---|---|---|
| **GovWin IQ (Deltek)** | $15-50K | 500K+ SLED + intel | Best — full feed |
| **BidNet Direct API** | $5-15K | 100K+ SLED | Good RSS + API |
| **Periscope S2G** | $10-25K | 200K+ | Decent |
| **BidPrime** | $3-12K | 100K+ | Smaller |

**Recommendation:** if path A delivers <50K in 6 weeks, buy **BidNet API** ($5-15K) as cheapest top-up to hit 100-150K. Don't buy GovWin unless we're going enterprise-tier with $200K+ ARR — its data is best but pricing assumes you're reselling.

---

## Phase 4 — quality (concurrent with everything else)

User feedback: "some opps don't have description, some don't show a link". Three fixes already shipped or in flight:

### 4a. Link validation cron (✅ shipped 2026-05-29)
- `/api/cron/validate_sled_links` runs daily 03:00 UTC
- HEAD-requests each SLED link; marks `link_broken=true` on 404/410
- Frontend now shows Google search fallback when link is missing or broken

### 4b. Description backfill (existing — `enrich_sled_descriptions`)
- Already running via orchestrator at :10 + :40
- Uses Playwright worker to scrape the actual portal page when description was empty at ingest
- Spot-check coverage — if still seeing many empty descriptions, the underlying scraper may need a per-portal handler (Bonfire works, OpenGov may not)

### 4c. LLM description summarization (proposed)
- For opps where the raw description is just a title + boilerplate
- Run Ollama (free, on VPS) over the scraped portal page to extract scope + qualifications + deliverables
- Stores into `structured_requirements` JSON column (already exists per CLAUDE.md)

---

## Open-source projects worth integrating

| Project | Stars | Purpose | License | How we'd use |
|---|---|---|---|---|
| [jasonstaker/rfp-scraper](https://github.com/jasonstaker/rfp-scraper) | ~10 | All 50-state procurement | MIT | Mine URLs + flow patterns |
| [openprocurement/openprocurement.api](https://github.com/openprocurement/openprocurement.api) | ~200 | Reference OCDS impl | Apache-2 | Spec compliance for our own data |
| [civictechspeakers/civic-codes](https://github.com/civictechspeakers/civic-codes) | various | Municipal data | Mixed | Reference scraper patterns |
| [open-contracting/kingfisher-collect](https://github.com/open-contracting/kingfisher-collect) | ~50 | Scrapy-based OCP collector | BSD | Direct reuse for OCDS-publishing cities |

---

## Useful nerdy intel (Reddit / forums)

Searched relevant communities for free SLED scraping intel:

- **r/govtech, r/govcontracts** — mostly federal-focused; one thread on aggregating BidNet RSS feeds
- **GitHub: makegov/awesome-procurement-data** — confirmed federal-only, no SLED
- **OpenContracting Slack** — useful for US cities that publish to OCDS
- **GovTech Slack** — has a #procurement channel; mentions of Sourcewell as a free aggregator
- **HackerNews comments on Govtech.com articles** — recurring mention of `proxycurl-style` price ($300/mo) but for procurement instead of LinkedIn

**Practical takeaway:** there is NO well-maintained free aggregator. Everyone serious in this space (Bloomberg Gov, GovTribe pre-acquisition, etc) built their own scrapers. We're following the same playbook.

---

## What we're NOT going to do

- ❌ Pay $15K/year for GovWin until we're past $200K ARR
- ❌ Build a single "universal scraper" — every portal needs per-source code
- ❌ Try to crawl federal-only sources we already have (SAM is solved at 30K opps)
- ❌ Invest in tax-assessor / property-records / FOIA — not procurement

---

## Sequence I'd actually ship

| Week | Build | Expected SLED count |
|---|---|---|
| **Now** | Digest fix + link validator + Google fallback (✅ shipped) | 1,740 |
| Week 1 | Periscope adapter + seed 30 tenants | ~6,000 |
| Week 2 | DemandStar Playwright path + 50 agencies | ~15,000 |
| Week 3 | 10 state portal customs (CA, NY, IL, PA, OH, VA, MA, GA, WA, NJ) | ~40,000 |
| Week 4 | BidNet RSS + IonWave + Vendor Registry | ~60,000 |
| Week 5 | Top 100 Granicus/CivicPlus cities via Playwright + LLM cleanup | ~80,000 |
| Week 6 | School districts (TIPS, Sourcewell) + remaining states | ~100,000-120,000 |
| Week 7 | Decision: paid aggregator top-up OR continue free-path expansion | 150,000 |

**Each row needs your sign-off before I build it.** Most are 1-3 days of focused work each. The cost is my time + the increasing complexity of maintaining ~30 portal-specific scrapers (offset by Ollama-based LLM cleanup for templated portals).

---

## What needs YOUR decision

1. **Ship Periscope adapter next?** (3 days, +5-15K opps)
2. **Approve paid aggregator budget** ($5-15K BidNet) **if we need it after Week 6?**
3. **Should I move SLED ingestion off Vercel to VPS?** Each Vercel cron has 300s timeout; some portal scrapes will brush against that. Moving to VPS systemd timers gives unlimited runtime + relieves the 40-cron Vercel ceiling.

Reply with one or more of: `periscope`, `vps-move`, `bidnet-budget-yes`, or specific portal names you want prioritized.
