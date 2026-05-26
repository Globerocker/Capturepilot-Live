# CapturePilot Data Sources — Status Audit

**Snapshot date**: 2026-05-26
**Purpose**: Single-page answer to "what sources do we have, what's the data quality, what are we missing, and what to do about each."

Anchored against the source-analysis reports in `docs/source-analysis/*.md` and migration history.

---

## Quality scorecard legend

| ✅ Good | Data ingests; key fields populated; consumable on the detail page and in matching |
| 🟡 Partial | Data ingests but key fields are missing/empty; needs enrichment work |
| 🔴 Broken / TODO | Source identified but no ingest yet, OR ingest exists but fundamentally not working |
| ⏭ Skip | Identified but explicitly out of scope (paid + ToS-restricted) |

---

## FEDERAL — fully operational

| Source | Method | Cadence | Status | Notes |
|---|---|---|---|---|
| **SAM.gov Contract Opportunities** | `/api/cron/ingest_sam` (X-Api-Key) | Daily 02:00 UTC | ✅ Good | ~30k active opps. SAM_API_KEY rotates every 90 days. SAM_API_KEY_2 currently invalid → user to regenerate. |
| **SAM.gov Entity API** | Used ad-hoc by `/api/admin/enrich-profile` + quick-checker | On-demand | ✅ Good | 1000/day quota on basic key. |
| **USAspending.gov — awards search** | `/api/cron/enrich_contractors_usaspending` + `/api/intelligence/market-size` | Daily + per-request | ✅ Good | Free, no auth. Per-NAICS leaderboard powers the contractor SEO directory. |
| **USAspending.gov — recipient hash** | `src/lib/usaspending.ts` (new today) | Per-contractor | ✅ Good | Single-call lifetime totals + by-year + by-agency. Powers all 1,176 contractor profile pages. |
| **Grants.gov** | `/api/cron/ingest_grants` (free key) | Daily | ✅ Good | Federal grants — narrower than SAM but covers HHS / NIH / NSF / DOE. |
| **SBIR.gov** | `/api/sbir/search` (no key, free) | On-demand | ✅ Good | Small-business R&D opps. Underused in matching scoring. |
| **HigherGov** | `/api/cron/ingest_highergov` (paid) | Daily | 🟡 Partial | Need to verify the cron is still healthy — last reviewed Apr. |
| **FPDS / SAM Contract Awards** | Migrated to SAM in Feb 2026 | TBD | 🟡 Partial | Per Feb 2026 migration, FPDS data now flows through SAM. Need to confirm we're consuming the new endpoints. |

**What's still missing on federal:**
- We don't surface **subaward / pass-through** data (state/local recipients of federal money). USAspending exposes it via `spending_level: "subawards"` — would add a new dimension to state/local market intel.
- **DoD SBIR open topics** at `dodsbirsttr.mil/topics-app/api/public` — undocumented but stable.
- **DIBBS / DLA** for defense supply parts — separate scraper, low priority unless we get a parts/manufacturing client.

---

## STATE — coverage by state (currently 11 of 50 in some form)

### ✅ Texas — fully ingesting (NEW today)

| Item | Status |
|---|---|
| TX ESBD via `/api/cron/ingest_tx_esbd` | ✅ 199 active solicitations on first run |
| Detail fields populated | ✅ Title, agency, contact email/phone, NIGP codes, attachments, due date+time, raw HTML |
| Used in matching | ✅ via score_matches (after my NAICS-short-circuit fix earlier) |
| Cron schedule | ⚠ Operator-triggered (40/40 cron cap reached — no slot for auto-daily) |

### ✅ New York City — covered

| Dataset | Coverage | Status |
|---|---|---|
| tf3b-tk9r ("Current Bids") | ~3.4k narrow active | ✅ Ingesting daily |
| **dg92-zbpx (City Record Online)** | **103k historical**, daily growth | ✅ NEW today — ingesting daily, filtered to `section_name='Procurement'` |
| qyyg-4tf5 (Recent Awards), tsak-vtv3 (Upcoming), 6m3u-8rbh (M/WBE) | Identified | 🔴 Not yet ingested |
| PASSPort static JSON | EPIN cross-link with Socrata | 🔴 Not yet ingested — would enrich existing rows with status/industry/M/WBE flag |
| City Record host scraping | Geo-blocked from cloud egress | ⏭ Skip — proxy via Socrata's document_links instead |

### ✅ Illinois (Chicago only) — partial

| Dataset | Status |
|---|---|
| rsxa-ify5 (Chicago Contracts) | ✅ 170 rows/poll, deduped at the line-item layer |
| State-level Illinois BidBuy | 🔴 Not yet built — Tier 3 HTML scrape |

### ✅ California (Los Angeles only) — partial

| Dataset | Status |
|---|---|
| hf3r-utnq (LA RAMP) | ✅ 200 rows/poll. Links to rampla.org for detail |
| **rampla.org Aura enrichment** | 🟡 Researched (full API mapped), parser pending. Would add attachments + full description |
| **State Cal eProcure** | 🔴 Complex — PeopleSoft SPA, needs Playwright. Largest single-state procurement spend in the US |

### 🔴 Other states with significant SAM-ingest gaps

| State | Portal | Lift estimate | Recommendation |
|---|---|---|---|
| Florida | VBS / MFMP VIP | Medium HTML scrape (~2 days) | Build next after Bonfire JSON |
| North Carolina | IPS (legacy ASP.NET) | Medium (~2 days) | High SLED-bid volume |
| Georgia | Procurement Registry | Medium (~2 days) | Mandatory ≥$100K bid posting law = strong signal |
| Massachusetts | COMMBUYS | Medium — has a daily Word/PDF export | Lower priority |
| Washington | WEBS | Medium | Lower priority |
| Pennsylvania | eMarketplace | Medium | Lower priority |
| Michigan | SIGMA VSS | Medium | Lower priority |
| New York State | NYS Contract Reporter / OGS | Medium | Useful complement to our NYC city coverage |

### ⏭ Virginia eVA — researched, deferred

VA has a CKAN-style open-data portal (`data.virginia.gov`) with full procurement records back to 2022. 245 state agencies + 900+ local bodies. Yearly snapshots only (good for awards history, weak for live RFPs).
**Action**: build the CKAN puller (~1 day) when we want award-history coverage for VA.

---

## COUNTY + CITY — coverage via Bonfire RSS

### Current state

100+ Bonfire portals seeded in `rss_sources` via migrations 066 + 067. Bulk ingest works: last manual trigger pulled 696 active contracts in 48s across 89 polled portals.

**Geographies covered (sampled)**:
- VA — Fairfax County, Arlington Public Schools, Chesterfield County, Fauquier County, etc.
- TX — Fort Bend County, Dallas ISD, Houston CC, Cypress-Fairbanks ISD, etc.
- CA — Alameda County, Oakland USD, Elk Grove USD
- FL — Broward County, Hillsborough County, Jacksonville Port
- IL — Chicago Public Schools, Joliet, Metra
- MI — Detroit
- NV — Clark County (Las Vegas)
- WA — Clark County
- AZ — Maricopa Community Colleges, Pinal County, Peoria, Goodyear
- + ~50 more

### Quality per Bonfire portal

| Field | Status |
|---|---|
| title, description | ✅ Always populated |
| agency, posted date, deadline | ✅ Populated |
| Contact email/phone | 🟡 Extracted via regex from description (90%+ hit rate after structured-reqs agent runs) |
| NAICS code | 🔴 Missing — Bonfire RSS doesn't expose it; relies on AI keyword matching for scoring |
| Attachments (PDFs) | 🔴 Missing — vendor-account-gated even for public notices |

### Open issue: Bonfire JSON API upgrade

Per `docs/source-analysis/BONFIRE.md`: discovered undocumented endpoint `/PublicPortal/getOpenPublicOpportunitiesSectionData` that serves anonymously and returns richer data than RSS (includes `PrivateProjectID`, win/loss intel, alternate-name aliases). Switching ALL portals from RSS to this JSON would:
- Add `is_subcontract`-style flags we don't currently get
- Surface past-award winners per portal
- Reduce false negatives on legacy/closed projects

**Lift**: ~2 days. **Risk**: low (additive — old RSS keeps working until cutover).
**Recommendation**: build but ship behind a per-source feature flag.

---

## PORTAL SOFTWARE — multiplier coverage

Building one scraper per platform unlocks dozens of tenants.

| Platform | Tenants we know about | Status |
|---|---|---|
| **Bonfire / Euna** | 100+ seeded | ✅ Ingesting via RSS, JSON-API upgrade pending |
| **OpenGov Procurement** | 44 seeded (disabled), researched 545 total tenants | 🟡 Research done — anonymous API at `api.procurement.opengov.com/api/v1` works. Parser implementation pending (~3-5 days for ~80 cities). |
| **IonWave (legacy)** | Many; being migrated to OpenGov | ⏭ Skip — wait for OpenGov migration |
| **Periscope / BidSync** | 2k+ public agencies aggregated | ⏭ Skip — paid + explicit "no public API" ToS |
| **DemandStar (Euna)** | 700+ agencies | ⏭ Skip — paid |
| **BidNet Direct** | 1,600+ agencies, state group purchasing | ⏭ Skip — paid + ToS |
| **Public Purchase** | 1,970+ agencies | 🔴 ToS check needed before any automation |

---

## Aggregator / OTHER

| Source | Status |
|---|---|
| **Socrata SODA** (city/state open data, ~50 portals) | ✅ Universal pattern; we use it for NYC, LA, Chicago. ~20 more tenants worth adding |
| **CKAN portals** (Virginia, Maryland, Hawaii) | 🔴 Researched, not built |
| **USAspending subawards** | 🔴 Identified — would surface state/local recipients of federal money |
| **GovTribe** | Paid competitor — not for ingestion |
| **GovWin / Bloomberg Government** | Enterprise pricing, no public API |

---

## DATA QUALITY — per-field health on the existing 30k+ opportunity rows

(snapshot from `/api/admin/db-stats` field_fill_rates as of 2026-05-26)

| Field | Coverage | Action |
|---|---|---|
| description | ~99% | ✅ ok |
| agency | ~95% | ✅ ok |
| place_of_performance_state | ~85% | ✅ ok |
| naics_code | ~60% | 🟡 Many SLED rows have no NAICS. Could backfill via keyword→NAICS heuristic. |
| psc_code | ~50% | 🟡 Federal only. |
| set_aside_code | ~30% | 🟡 Only when explicit. |
| response_deadline | ~80% | ✅ |
| **structured_requirements** | **~5% → backfill in progress** | 🟡 90%+ hit rate verified on backfill batches. Will be ~95% once 5k drain completes (~30 min). |
| ai_win_strategy | varies | 🟡 Cron runs daily, lags. |
| strategic_scoring | ~100% | ✅ |
| extracted_emails | ~60% | ✅ After contact-extraction backfill (40,214 of 56,309 rows). |
| extracted_phones | ~35% | ✅ |
| extracted_attachment_urls | ~25% | 🟡 Higher for SAM rows (resource_links); lower for SLED. |
| extracted_keywords | ~10% (AI cron drains hourly) | 🟡 Auto-fills over time. |
| estimated_value_max | ~15% | 🟡 Regex extractor catches ranges and NTE values. |
| opportunity_class (prime / sub / teaming) | ~20% | 🟡 Only when description has explicit hints. |
| extracted_offices | ~30% | ✅ |

---

## RECOMMENDED PRIORITY for the next 4 weeks

| # | Item | Lift | Why |
|---|---|---|---|
| 1 | **OpenGov Procurement parser** (44 disabled portals → ~80 active) | 3-5 days | Biggest tenant-count multiplier. Anonymous API works per research. |
| 2 | **Bonfire JSON-API upgrade** (100+ portals → richer data) | 2 days | All existing Bonfire portals get richer data. Low risk. |
| 3 | **LA RAMP Aura enrichment** | 1 day | Adds attachments + contact info to the 200 LA opps we already have. |
| 4 | **Florida VBS HTML scraper** | 2 days | Third-largest state by procurement spend. |
| 5 | **North Carolina IPS HTML scraper** | 2 days | High SLED-bid volume. |
| 6 | **NAICS-from-keyword backfill agent** | 1 day | Fixes the 60% NAICS coverage on SLED rows → unlocks matching score on them. |
| 7 | **USAspending subawards ingest** | 2 days | Fills state/local pass-through data hole. |
| 8 | **California Cal eProcure (Playwright)** | 4-5 days | Largest state spend but biggest tech lift. |

---

## OPERATOR ACTION ITEMS

- 🔑 Regenerate `SAM_API_KEY_2` at sam.gov/profile/details (current key is invalid)
- 🔑 Regenerate Gemini API key at aistudio.google.com/apikey (Google flagged the existing one as leaked)
- 💳 Top up Apollo credits (currently exhausted — pages render without industry/website/LinkedIn data)
- 📋 Answer 5 questions in `docs/BACKLINK_OUTREACH_TEMPLATE.md` to activate the contractor outreach
- 📊 Consider upgrading from 40/40 cron slot cap (current Vercel Pro plan ceiling). Daily TX ESBD, OpenGov, future state scrapers all need slots.
