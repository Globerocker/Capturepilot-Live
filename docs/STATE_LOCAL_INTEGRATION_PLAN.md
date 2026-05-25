# State / Local Source Integration Plan

Companion to [`STATE_LOCAL_SOURCES_2026.md`](./STATE_LOCAL_SOURCES_2026.md). The research doc says **what's out there**; this doc says **how we ship it**, in order of ROI.

## What we already have ✅

Per the latest live audit (May 25, 2026):

- **Bonfire / Euna portals** — fully integrated. 89 portals live in `rss_sources`. Last manual trigger pulled **696 new active contracts** in 48s. Cron runs daily at 02:45 UTC.
- **Contact extraction** — every RSS row gets emails / phones / URLs pulled from the description body at insert time. Backfill complete: **40,214 of 56,309 rows** (71.4%) had extractable contacts.
- **Source-aware detail page** — non-SAM rows now link to the original portal URL with the right label ("Open on Bonfire", "Open on OpenGov", etc.).
- **OpenGov subdomains** — 44 rows seeded in `rss_sources` with `enabled=false` pending a provider scraper.

So Bonfire is *done*. The remaining work falls into 4 sprints, ranked below.

---

## Sprint 1 — Socrata cities (NEXT, highest ROI, lowest lift)

**What**: One generic `ingest_socrata` cron + a `socrata_sources` config table. Each row is a (portal_host, dataset_id, mapping) tuple. The Socrata SODA API is a single REST shape — query with `$where`, `$select`, `$order`, get JSON back.

**Why first**: Free, no auth required for reads, well-documented, and unlocks ~50 city/state portals with one client. NYC, Chicago, LA, Philadelphia, SF, Austin, Seattle, state of CA, state of NY all on Socrata.

**Initial seeds (4 cities, ~1 week wall-time)**:

| Portal | Dataset | URL |
|---|---|---|
| NYC | Current NYC Bids (`tf3b-tk9r`) | https://data.cityofnewyork.us/d/tf3b-tk9r |
| Chicago | Contracts (search dataset by keyword "contracts") | https://data.cityofchicago.org |
| LA | RAMP Open Bid Opportunities (`hf3r-utnq`) | https://data.lacity.org |
| Philadelphia | Contracts (CSV + GitHub-hosted JSON) | https://cityofphiladelphia.github.io/contracts |

**Schema**:
- New table `socrata_sources` (mirror of `rss_sources` shape): `portal_host`, `dataset_id`, `source_prefix`, `agency_name`, `agency_type`, `state`, `city`, `field_map jsonb`, `enabled`, last-run telemetry.
- `field_map` lets each dataset declare which Socrata columns map to our `title`, `description`, `agency`, `posted_date`, `response_deadline`, `link` — solves the schema-variance problem in config rather than code.

**Effort**: 1 dev-day for the generic cron + 1 hour per seeded dataset. 4 cities = 1.5 days total.

**Deliverable**: 4 active cities polling daily, plus a self-service path to add more via SQL inserts.

---

## Sprint 2 — Virginia eVA CKAN (1-2 days)

**What**: CKAN dataset puller for `data.virginia.gov`. Annual snapshot — pulls the year's procurement records once a year, mostly for awards history + competitive intel rather than live RFPs.

**Why second**: 245 VA agencies + 900 VA locals. Excellent for awards-based intel like incumbent risk and recompete signals. The dataset is yearly so cron runs weekly (cheap), and it's a one-shot pattern reusable for other CKAN portals (Maryland, Hawaii, data.gov metadata).

**Effort**: 1 dev-day.

**Deliverable**: VA opportunities + historical awards in the same `opportunities` table with `source='va_eva'`.

---

## Sprint 3 — OpenGov scraper (1 week)

**What**: Activate the 44 OpenGov rows already in `rss_sources` (currently `enabled=false`) plus expand the slug list to ~80. OpenGov Procurement is a React SPA so we need provider-specific HTML/JSON-extraction logic — not the same shape as Bonfire's RSS.

**Why third**: Most of the medium/large US cities are on OpenGov. Each tenant is a `procurement.opengov.com/portal/<slug>` URL, hard-coded subdomain pattern. One scraper → 80+ cities.

**Open question**: OpenGov's React SPA hydration. Best fetched via a headless approach OR their internal JSON endpoint (which exists; we just need to reverse-engineer the call pattern from the React app). Recommend the latter; faster + no Playwright dep.

**Effort**: 3-5 days incl. slug curation.

**Deliverable**: ~80 active OpenGov tenants polling daily.

---

## Sprint 4 — Big-state HTML scrapers (2-3 weeks, one at a time)

State portals with no API, well-formed public-search HTML. Build one at a time so each scraper is properly tested before moving on. Order by procurement volume:

1. **California Cal eProcure** (CSCR) — largest state by procurement spend
2. **Texas ESBD / SmartBuy** — second-largest
3. **Florida VBS** — third-largest
4. **North Carolina IPS**
5. **Georgia Procurement Registry**

Each one is its own cron route `/api/cron/ingest_<state>_<portal>/`.

**Effort**: 2-3 days per state.

**Caveats**: HTML scrapers break on portal redesigns. Each needs robust error handling + alerting (the new health monitor catches stalls automatically). Identify CapturePilot in User-Agent + email contact + reasonable rate limits.

---

## Sprint 5 — Long tail (week-by-week as ROI dictates)

- Massachusetts COMMBUYS, Illinois BidBuy, Pennsylvania eMarketplace, Michigan SIGMA, Washington WEBS, Mississippi MAGIC, South Carolina SCEIS, New York State Contract Reporter.
- USAspending subawards filter — adds state/local pass-through money to the existing federal pipeline.
- Public Purchase + DemandStar — **only** if ToS review clears redistribution (currently presumed no).

---

## Cross-cutting work (do once, applies to all sprints)

These are infrastructure adds that benefit every sprint above:

1. **Schema additions** (migration 077):
   - `opportunities.jurisdiction_level` text (`federal | state | county | city | special_district`)
   - `opportunities.jurisdiction_code` text (FIPS or USPS abbreviation)
   - Helps filtering on the matches page + per-state market-intel.

2. **Per-source connectors registry** — extend `api_connectors` (migration 075) with a row per data source so the health-monitor cron alerts when a state portal goes stale. No new table; just inserts.

3. **Slug-curation tool** — a one-off Node script under `/tools/23_curate_opengov_slugs.mjs` that scrapes the OpenGov vendor directory and emits SQL inserts for `rss_sources`. Same pattern as the Bonfire slug curation that produced migration 067.

4. **Robots.txt + User-Agent compliance helper** — `src/lib/scraper-etiquette.ts` that wraps every scraper call with our identifying UA, rate-limited fetch, and a per-source min-interval. Drop-in for Sprints 3-5.

---

## Decisions needed from you

Before I start building, three calls:

1. **Sprint sequencing** — Sprint 1 (Socrata) is the safest highest-ROI starting point. Should I dive in? Or do you want to prioritize a specific state (e.g. CA or TX from Sprint 4)?

2. **OpenGov slug curation** — for Sprint 3, do you want me to scrape the OpenGov vendor directory to auto-discover all ~80 tenants, or do you want to provide a manual slug list of cities you actually care about?

3. **HTML scraper safety net** — for Sprint 4, are you OK with adding **Playwright** as a dependency for the brittle big-state portals (Cal eProcure, Texas ESBD)? Alternative: reverse-engineer their JSON APIs from the JS bundle which is faster + lighter but takes more dev hours per portal.

---

**Once you answer those, I can ship Sprint 1 in this session.** Want me to go straight to it?
