# State, County & City Procurement Sources — Ingestion Catalog (May 2026)

A vetted list of state/local procurement data sources for CapturePilot's expansion beyond federal (SAM.gov / USASpending / Grants.gov / SBIR / HigherGov). Sources verified via web research May 2026. Ranked by integration ROI for a small-business federal contractor.

## TL;DR — Strategy

1. **Two free state goldmines exist**: Virginia eVA (full open-data API w/ JSON) and California Cal eProcure (public-search HTML, well-structured). Build these first.
2. **One scraper per portal-vendor** unlocks dozens of agencies. The top 4 platforms (OpenGov, Bonfire/Euna, IonWave, Periscope/BidSync) cover the bulk of US cities/counties under predictable URL schemes.
3. **Socrata SODA API** is the universal back door for ~50+ city/state open-data portals (NYC, Chicago, LA, SF, etc.) — single client library, free, no auth required for read.
4. **Avoid paid aggregators as ingestion sources** (BidNet, Periscope, DemandStar) — their ToS prohibits redistribution. Use them only for manual research / customer onboarding parity checks.

---

## Tier 1 — Free, API-First, Build Now

| Source | Coverage | Access | Lift | Notes |
|---|---|---|---|---|
| **Virginia eVA Open Data** ([data.virginia.gov](https://data.virginia.gov/dataset/eva-procurement-data-2025)) | VA state + 900+ VA local bodies | REST/JSON/CSV/XML via VA Open Data Portal (CKAN-style API) | **Low** | Yearly datasets 2022-2025, free, no key required for read. 245 agencies + 900 locals already on platform. |
| **NYC Open Data — Current NYC Bids** ([data.cityofnewyork.us/d/tf3b-tk9r](https://data.cityofnewyork.us/City-Government/Current-NYC-Bids/tf3b-tk9r)) | NYC (5 boroughs, all agencies) | Socrata SODA API (JSON/CSV/RSS) | **Low** | App token recommended but anonymous reads work. Updated continuously. |
| **NYC PASSPort Public** ([a0333-passportpublic.nyc.gov](https://a0333-passportpublic.nyc.gov/)) | NYC city-wide (post-2022) | HTML scrape (no documented API yet) | Medium | End-to-end procurement transparency portal. Solicitations + awards + vendor data. |
| **California Cal eProcure CSCR** ([caleprocure.ca.gov/pages/public-search.aspx](https://caleprocure.ca.gov/pages/public-search.aspx)) | CA state agencies | HTML scrape (public search page, well-formed) | Medium | No official API. Third-party scrapers exist on Apify, prove it's tractable. |
| **Chicago Data Portal** ([data.cityofchicago.org](https://chicago.socrata.com/)) | Chicago city | Socrata SODA | **Low** | Search "contracts" / "bids" datasets. Same client as NYC. |
| **City of Philadelphia Open Contracts** ([cityofphiladelphia.github.io/contracts](https://cityofphiladelphia.github.io/contracts/)) | Philadelphia | Static + GitHub-hosted data | **Low** | Open data project. CSV downloads. |
| **LA Open Data — RAMP Bid Opportunities** ([data.lacity.org](https://data.lacity.org/City-Infrastructure-Service-Requests/RAMP-Open-Bid-Opportunities/hf3r-utnq)) | Los Angeles | Socrata SODA | **Low** | RAMP feeds public works opportunities. |
| **Massachusetts COMMBUYS** ([mass.gov/info-details/bidding-opportunities](https://www.mass.gov/info-details/bidding-opportunities)) | MA state + local | HTML scrape (publishes daily bid count export at `/doc/commbuys-home-page-bid-count/download`) | Medium | Daily MS-Word/PDF export is parsable; no JSON API. |
| **Georgia Procurement Registry** ([doas.ga.gov/state-purchasing/bids-and-contracts](https://doas.ga.gov/state-purchasing/bids-and-contracts)) | GA state + GA locals (≥$100K bids must post here by law) | HTML search | Medium | Free for vendors. Mandatory posting threshold = high signal. |
| **North Carolina IPS** ([ips.state.nc.us/ips/openbidsearch.aspx](https://www.ips.state.nc.us/ips/openbidsearch.aspx)) | NC state + many NC agencies | HTML scrape (legacy ASP.NET form) | Medium | Long-running stable interface. |
| **Texas ESBD / SmartBuy** ([txsmartbuy.gov/esbd](https://www.txsmartbuy.gov/esbd)) | TX state ($25K+ threshold) | HTML scrape (two public tabs: Solicitations + Awards) | Medium | No public API — Texas DIR/Comptroller has not exposed one. Confirmed via ESBD User Guide. |
| **Florida Vendor Bid System / MFMP VIP** ([vendor.myfloridamarketplace.com/search/bids](https://vendor.myfloridamarketplace.com/search/bids)) | FL state | HTML scrape | Medium | Next-gen VIP went live March 2022, structured search. No public API. |

## Tier 2 — Portal-Software Multipliers (One Scraper → Dozens of Agencies)

These are the dominant SaaS platforms US state/county/city governments run their procurement on. Each has a predictable URL scheme, so a single scraper template unlocks many agencies. Verified URL patterns below.

| Platform | URL Pattern | Sample Tenants | Lift |
|---|---|---|---|
| **OpenGov Procurement** (formerly IonWave under new ownership) | `procurement.opengov.com/portal/<slug>` | City of Orlando, City of Phoenix (launched Apr 2025), Sacramento County, Dane County WI, Orange County FL, Gallup NM | **Low** — public listing page, no auth needed for browse. Maintain a slug registry. |
| **Bonfire / Euna Supplier Network** | `<slug>.bonfirehub.com/portal/` (also `.eunasolutions.com`) | TxDOT (`txdot.bonfirehub.com`), City of Detroit, Delaware DFM, Gregg County TX | **Low-Medium** — listing pages public; some require free vendor account for full docs. |
| **IonWave (legacy IWT Procurement Suite)** | `<slug>.ionwave.net` | School districts, smaller municipalities | Medium — older portals being migrated to OpenGov post-acquisition. |
| **Periscope S2G / BidSync** | `prod.bidsync.com` (aggregator, single domain) | 2,000+ public agencies aggregated | High — they explicitly market themselves as having "no public API." ToS likely forbids scraping. Skip. |
| **Public Purchase** ([publicpurchase.com](https://www.publicpurchase.com/)) | Single domain, agency-filter URLs | 1,970+ agencies across US | Medium — free vendor browse, but ToS check needed before redistribution. |
| **BidNet Direct** ([bidnetdirect.com](https://www.bidnetdirect.com/)) | Single domain | 1,600+ agencies, state group purchasing | Skip — paid plans ($100-600/mo per state); ToS forbids scraping. |
| **DemandStar (now part of Euna)** | Single domain | 700+ agencies; partner-model | Skip for ingestion — paid ($199/mo+). |

**Action**: Build OpenGov + Bonfire scrapers first. They are public, free, and cover hundreds of municipalities under URL patterns we can enumerate from a manually-curated tenant slug list.

## Tier 3 — Other State Portals (HTML-Scrape Only, No API)

Verified via search; all are free-to-browse but lack a public JSON/RSS feed. Each is a one-off scraper.

| State | Portal | URL | Lift |
|---|---|---|---|
| Illinois | BidBuy | [illinois.gov BidBuy](https://cei.illinois.gov/vendor-resources/illinois-procurement-opportunities.html) | Medium |
| Pennsylvania | eMarketplace | [emarketplace.state.pa.us](https://www.emarketplace.state.pa.us) | Medium |
| Michigan | SIGMA VSS / Contract Connect | [michigan.gov/dtmb/procurement](https://www.michigan.gov/dtmb/procurement/contractconnect) | Medium |
| Washington | WEBS | [washington WEBS](https://pr-webs-vendor.des.wa.gov/) | Medium |
| Mississippi | MAGIC / DFA Contract Bid Search | [ms.gov/dfa/contract_bid_search/bid](https://www.ms.gov/dfa/contract_bid_search/bid) | Medium |
| South Carolina | SCEIS Procurement | [procurement.sc.gov/doing-biz/bid-ops](https://procurement.sc.gov/doing-biz/bid-ops) | Medium |
| New York State | NYS Contract Reporter / OGS | [ogs.ny.gov/procurement](https://ogs.ny.gov/procurement) | Medium |

## Tier 4 — Open Data Aggregators (Universal Read APIs)

| Source | Coverage | Access | Notes |
|---|---|---|---|
| **Socrata SODA** ([dev.socrata.com](https://dev.socrata.com/data/)) | NYC, Chicago, LA, SF, Seattle, Austin, Dallas, state of CA, state of NY, state of CT, state of HI, etc. (50+ portals) | REST JSON; no auth required, app token recommended | **Universal** — one client (`pysoda`, or just HTTP) hits any Socrata portal. Search `procurement`, `bids`, `contracts` per portal. |
| **CKAN portals** | data.gov (federal catalog), Virginia (data.virginia.gov), Maryland, Hawaii, others | CKAN action API (JSON) | data.gov stores metadata only — follow the resource URL for actual data. VA is the standout. |
| **Open Data Network** ([opendatanetwork.com](http://opendatanetwork.com)) | Cross-portal search across Socrata catalogs | REST | Discovery layer, not ingest. |
| **USAspending API** ([api.usaspending.gov](https://api.usaspending.gov/)) | Federal awards including subawards to state/local pass-through recipients | REST JSON, no key required | Already on roadmap. Add `subaward=true` filter for state/local-flowed money. |

## Tier 5 — Aggregator Alternatives (For Customer-Facing Parity, Not Ingestion)

These are competitors / reference points. Useful for benchmarking, not for ingestion (ToS forbids re-publishing).

| Tool | Pricing | Strengths |
|---|---|---|
| **GovTribe** ([govtribe.com](https://govtribe.com)) | From $1,350/yr | Aggregates SAM + USASpending + grants.gov + state. Single-pane competitor reference. |
| **SamSearch** ([samsearch.co](https://samsearch.co)) | AI-flavored | Natural-language search of federal opps. |
| **EZGovOpps** | Mid-tier | IDIQ + task-order focus. |
| **Federal Compass** | Mid-tier | Recompete tracking. |
| **GovWin IQ (Deltek)** | Enterprise ($10K+/yr) | Gold standard, includes state/local intel. |
| **BidPrime / GovSpend** | Mid-enterprise | State/local heavy. |
| **Public Bid Tracker** ([publicbidtracker.com](https://publicbidtracker.com)) | Free read | "No paywall, no account" — interesting to monitor; check ToS before scraping. |

## Caveats & Legal

- **ToS check required** on every paid platform (BidNet, Periscope, DemandStar, Public Purchase) before any automated access. Free vendor browse ≠ permission to redistribute.
- **Robots.txt + reasonable rate limits** for every HTML-scrape source (Cal eProcure, ESBD, MyFlorida VBS, etc.). Identify CapturePilot in User-Agent + email contact.
- **Socrata app tokens**: free, but recommended above ~1000 req/hr per portal. Register one per portal for headroom.
- **Bonfire / OpenGov**: free vendor account may be required to read full attachment payloads on some tenants. Listing page + solicitation metadata is public.
- **CKAN/Socrata data freshness varies** — NYC Bids updates near-realtime; Virginia eVA datasets are yearly snapshots (good for awards history, weak for live RFPs).

## Recommended Build Order (Sprint Plan)

**Sprint 1 — Federal-adjacent free wins (1 week):**
1. Virginia eVA — CKAN JSON pull → `opportunities` table with `source='va_eva'`.
2. NYC Current Bids — Socrata SODA → `source='nyc_socrata'`.
3. Chicago + LA + Philadelphia Socrata pulls (template after NYC).

**Sprint 2 — Portal-vendor multipliers (1-2 weeks):**
4. OpenGov Procurement scraper + tenant-slug seed list (start with 30 known tenants).
5. Bonfire/Euna scraper + subdomain seed list.

**Sprint 3 — Big-state HTML scrapers (2-3 weeks):**
6. Cal eProcure (CSCR) — high state ROI.
7. Texas ESBD — second-largest state by procurement volume.
8. Florida VBS, NC IPS, Georgia GPR.

**Sprint 4 — Long tail:**
9. Massachusetts COMMBUYS, Washington WEBS, Illinois BidBuy, Pennsylvania eMarketplace, Michigan SIGMA.
10. USAspending subawards filter add-on.

## Schema Notes

Reuse existing `opportunities` table (per `CLAUDE.md`). Add:
- `source` enum: `sam | usaspending | grants_gov | sbir | highergov | va_eva | nyc_socrata | chi_socrata | la_socrata | phl_static | ca_eprocure | tx_esbd | fl_vbs | nc_ips | ga_gpr | ma_commbuys | opengov_<slug> | bonfire_<slug> | …`
- `jurisdiction_level`: `federal | state | county | city | special_district`
- `jurisdiction_code`: FIPS or USPS abbreviation for filtering.

Ingest scripts go in `/tools/` under the existing numbered scheme (next free per `CLAUDE.md` is 23+, after `21_enrich_brand_tokens.mjs` and `22_seed_keyword_library.mjs`). Cron handlers go under `/api/cron/ingest_<source>/route.ts` and must call `guardCron(req)`.

---

**Last verified**: May 2026. URLs and pricing change; re-verify before each new ingest source build.
