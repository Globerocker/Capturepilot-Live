# State / Local / Education Bulk-Import Sources — Backlog

Audit (2026-05-23). Below is the prioritized list of additional opportunity feeds we should ingest, with what's needed (API key, account, scraper). Use this as the punch list for getting state-level coverage off the ground.

Already covered: SAM.gov (federal), Grants.gov (federal grants), SBIR.gov, HigherGov SLED, 78 Bonfire portals (migration 067), 31 OpenGov portals (seeded disabled in 067 pending HTML scraper).

---

## Tier 1 — High value, low effort (RSS / public API)

### State Procurement Portals with public RSS
These follow the same pattern as Bonfire — add a row to `rss_sources`, the existing `/api/cron/ingest_rss` route picks them up.

| Source | URL | Coverage | Status |
|---|---|---|---|
| **CalPROCURE** (California) | `https://caleprocure.ca.gov` | $billions in CA state contracts | Public RSS at `/event/3/index/SearchEvents.do?_format=rss` — needs adapter |
| **NYS Contract Reporter** | `https://www.nyscr.ny.gov/` | All NY state agencies | Public RSS feed — confirm endpoint |
| **Texas SmartBuy** (TxSmartBuy) | `https://www.txsmartbuy.gov` | State + co-op | RSS via `/sp/RssFeed.aspx` |
| **PA eMarketplace** | `http://www.emarketplace.state.pa.us` | All PA state | RSS at root |
| **Florida MyFloridaMarketPlace** | `https://vendor.myfloridamarketplace.com` | All FL state | RSS via solicitation search |
| **Virginia eVA** | `https://eva.virginia.gov` | All VA state | RSS at `/business-opportunities` |
| **Ohio Bid Express / Ohio Procurement** | `https://procure.ohio.gov` | All OH state | Public listing — scraper |
| **Illinois BidBuy** | `https://www.bidbuy.illinois.gov` | All IL state | Public listing — scraper |
| **Georgia Procurement Registry** | `https://ssl.doas.state.ga.us/PRSapp/PR_index.jsp` | All GA state | Public — scraper |
| **Washington WEBS** | `https://fortress.wa.gov/ga/webs/` | All WA state | RSS unclear — needs investigation |

**Action:** for each one, check `View page source` for `<link rel="alternate" type="application/rss+xml">`. Where RSS exists, add to migration 071. Where not, queue for scraper development.

### Federal supplements
| Source | Why | API |
|---|---|---|
| **FBO.gov archive** | Historical pre-2020 contracts (SAM only covers from migration cutover) | Bulk download |
| **GSA Schedules Sales** | Live IDIQ task orders via GSA Advantage | Auth'd API — needs vendor account |
| **DLA Internet Bid Board (DIBBS)** | Defense Logistics Agency — high-volume parts/supplies | RSS at `https://www.dibbs.bsm.dla.mil/Rfp/RfpFeed.aspx` |
| **VA Office of Small & Disadvantaged Business** | VA-only forecasts | OSDBU RSS |

---

## Tier 2 — Medium effort (account signup required, no scraping)

### BidNet Direct (Nationwide State/Local Network)
- **What:** Aggregator of 100+ municipal/state portals
- **Where:** https://www.bidnetdirect.com
- **Coverage:** ~50 states, education, special districts
- **Cost:** Free tier available for basic search; paid tier $20-100/mo per state for full access
- **Access:** REST API requires partnership; alternative is email digest scraper
- **Action needed:** Sign up at https://www.bidnetdirect.com/register → pick free states → confirm email-digest format → write parser

### DemandStar
- **What:** Municipal/county aggregator (rival to BidNet)
- **Where:** https://network.demandstar.com
- **Coverage:** 1,200+ agencies, heavy in West / Midwest
- **Cost:** Free for vendors searching one state; paid for multi-state
- **Access:** RSS feeds per agency once registered
- **Action needed:** Free signup → enable RSS per agency → bulk-add to `rss_sources` with `provider='demandstar'`

### Periscope S2G (legacy BidSync)
- **What:** State-level e-procurement (mostly Mountain West + SE)
- **Where:** https://www.periscopeholdings.com
- **Coverage:** 30+ states inc. CO, NV, UT, NC, SC
- **Cost:** Free vendor registration
- **Access:** RSS per agency; provider='periscope' already in our enum (migration 066)
- **Action needed:** Register, enable RSS digests per state, add to `rss_sources`

### IonWave (state e-procurement)
- **What:** State portals using IonWave platform
- **Coverage:** ~25 states (NE, IA, KS, MO, OK, etc.)
- **Access:** Public RSS per agency once you know the slug

---

## Tier 3 — Higher effort (HTML scraping / SPA reverse-engineering)

### JAGGAER
- **Where:** https://www.jaggaer.com customer portals (varies per agency)
- **Coverage:** ~80 universities + several state systems
- **Why hard:** Each agency has a unique SSO-gated portal; bot detection
- **Status:** Out of scope unless tier-2 saturates first

### OpenGov SPAs (already seeded disabled in migration 067)
- 31 portals seeded with `enabled=false`. Need a Playwright-based HTML scraper that handles their React SPA.
- **Action needed:** Build `tools/2X_scrape_opengov.mjs` using Playwright. Cron picks it up. Flip enabled=true once tested.

### USA-Spending Forecasts
- Already covered via FPDS + forecast crons. Skip.

### State University Foundations
- Many state univ. foundations procure independently. Low signal-to-noise — defer.

---

## Required signups (operator action items)

The user needs to manually register here before we can ingest:

1. **BidNet Direct** — https://www.bidnetdirect.com/register
2. **DemandStar** — https://network.demandstar.com (free signup, pick 1 state for free tier)
3. **Periscope** — https://www.periscopeholdings.com/contact (request vendor account)
4. **GSA Vendor Support Center** — https://vsc.gsa.gov (already required for SAM ingest but check token works for Schedules Sales)
5. **DLA DIBBS** — https://www.dibbs.bsm.dla.mil/Index.aspx (one-time vendor reg, then RSS works)
6. **Each individual state portal in Tier 1** — most are no-auth public RSS, but verify per state

Add credentials once obtained to:
- `dashboard/.env.local` (local dev)
- Vercel env vars (`captiorpilot` + `live` projects)

---

## Implementation notes

- **rss_sources schema** is permissive — `provider` enum has slots for `bonfire | opengov | periscope | bidnet | demandstar | agency_direct | other`. Add new providers via ALTER TYPE if needed.
- **ingest_rss route** ([dashboard/src/app/api/cron/ingest_rss/route.ts](dashboard/src/app/api/cron/ingest_rss/route.ts)) is generic — it doesn't care which provider, just parses RSS. New sources require zero code if they're plain RSS.
- **Provider-specific scrapers** belong as separate cron routes per provider (e.g. `ingest_opengov`, `ingest_jaggaer`). Keep them out of `ingest_rss` to avoid coupling.
- **Source enum on opportunities** (migration 064) limits `source` to `('sam', 'grants_gov', 'sled', 'sbir', 'state', 'local')`. RSS-imported rows currently land as `sled` regardless of whether they're state, county, or city — fine for UI grouping but could be split if we want city-level rollups later.

---

## Expected impact

Estimated additional opportunities once Tier 1 is ingested:
- CA, TX, NY, FL combined: **~8,000 active state-level RFPs**
- DLA DIBBS: **~50,000 active solicitations** (mostly small DLA parts/supplies — high volume, low avg value)
- Tier 1 total: **conservatively ~60,000 new active opps**, ~doubling our current corpus

Tier 2 (BidNet + DemandStar + Periscope): **~30,000 additional** depending on tier.

Total reachable corpus once everything is wired: **~150k active opportunities** (vs ~37k today).
