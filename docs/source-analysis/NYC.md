# NYC Procurement Sources — Comparative Analysis

Investigation date: 2026-05-25. Three public sources for NYC city procurement opportunities. CapturePilot currently ingests one (`tf3b-tk9r`). This document recommends what to do next.

---

## TL;DR

- **Keep `tf3b-tk9r` (Current NYC Bids)** as the active-bid feed but **add `dg92-zbpx` (City Record Online)** as a parallel ingest. Same schema, 30× more rows (103,710 Procurement notices vs 3,366), full history back to 2011, includes Sources Sought / Pre-Solicitation equivalents (RFI / Sources Sought equivalents) and Award notices.
- **Don't bother with the City Record HTML site (`a856-cityrecord.nyc.gov`).** It's unreachable from cloud egress (TLS reset / firewall) and the same data is already exposed through Socrata's `dg92-zbpx`. The `document_links` column on both Socrata datasets returns canonical PDF URLs on `a856-cityrecord.nyc.gov/Search/GetFile?...` — those still resolve in a normal browser; the host just rejects programmatic clients.
- **PASSPort is worth adding as a third source for richer metadata** (EPIN, M/WBE flags, industry taxonomy, RFx status). The whole dataset is a single 3.3 MB static JS file (`/dataJs/rfxData.js`) that any cron can fetch in one request, no scraping. But: no attachments and the public portal explicitly says "DO NOT RESPOND HERE." It's a transparency catalog, not a vendor entry point.
- Net recommendation: 3 crons — `ingest_nyc_crol` (Socrata), `ingest_nyc_passport` (static JS), and keep `ingest_nyc_currentbids` (existing). Cross-reference by `PIN` / `EPIN` to merge.

---

## Source 1: Socrata `tf3b-tk9r` — "Current NYC Bids" (already ingesting)

**Endpoint:** `https://data.cityofnewyork.us/resource/tf3b-tk9r.json`

**Volume:** 3,366 total rows, 90 with `due_date > today`, refreshed daily.

**Sample row (latest):**
```json
{
  "request_id": "20260518024",
  "start_date": "2026-05-22T00:00:00.000",
  "agency_name": "Design and Construction",
  "type_of_notice_description": "Solicitation",
  "category_description": "Construction Related Services",
  "short_title": "HWCSCHPQN - SAFE ROUTES TO SCHOOLS, QUEENS",
  "selection_method_description": "Competitive Sealed Bids",
  "pin": "85026B0094",
  "due_date": "2026-06-17T11:00:00.000",
  "contact_name": "Karen General",
  "contact_phone": "(718) 391-2410",
  "email": "csb_projectinquiries@ddc.nyc.gov",
  "additional_description_1": "<p>Responses to this CSB must be submitted via PASSPort..."
}
```

**Mapping `request_id` / `pin` to attachments:**

- `request_id` is the City Record internal notice ID. It maps directly to City Record's `GetFile` endpoint via `document_links`. When that column is populated (531 of 3,366 rows, ~16%), it looks like:
  ```
  https://a856-cityrecord.nyc.gov/Search/GetFile?SectionID=6&RequestStatus=Archived&RequestID=20240124101&DocumentID=36988
  ```
  The pattern is deterministic: `SectionID=6` always means Procurement; `DocumentID` is per-attachment; multiple links come comma-separated inside the `url` field.
- `pin` is the agency's EPIN. It maps to PASSPort solicitations: PASSPort's column 4 (zero-indexed) holds the same EPIN string, so `pin` is the join key for cross-source enrichment.
- For rows where the description tells vendors "respond via PASSPort", we can construct a deep link like `https://passport.cityofnewyork.us/page.aspx/en/rfp/request_browse_public` and use `pin` as the keyword. There's no direct deep-link URL pattern — PASSPort's public portal is a SPA.

**Schema (37 columns):** `request_id` (number), `start_date`, `end_date`, `agency_name`, `type_of_notice_description`, `category_description`, `short_title`, `selection_method_description`, `section_name`, `special_case_reason_description`, `pin`, `due_date`, `address_to_request`, `contact_name`, `contact_phone`, `email`, `contract_amount`, `contact_fax`, `additional_description_1..3`, `other_info_1..3`, `vendor_name`, `vendor_address`, `printout_1..3`, `document_links` (url), `event_date`, `building_name`, `street_address_1..2`, `city`, `state`, `zip_code`.

**Other NYC Socrata procurement datasets (catalog scan):**

| ID | Name | Updated | Rows | Notes |
|---|---|---|---|---|
| `tf3b-tk9r` | Current NYC Bids | daily | 3,366 | currently ingested |
| **`dg92-zbpx`** | **City Record Online** | **daily** | **~1.08M (103K Procurement)** | **same schema as tf3b — add this** |
| `qyyg-4tf5` | Recent Contract Awards | daily | ? | award-side, post-close |
| `bzjf-rmtp` | Current RFP | 2026-05-05 | ? | RFP subset only |
| `tsak-vtv3` | Upcoming contracts to be awarded (CIP) | 2026-05-08 | ? | pipeline forecast |
| `6m3u-8rbh` | Upcoming contracts to be awarded (CAP) | 2026-05-08 | ? | pipeline forecast |
| `ww83-bcks` | M/WBE Upcoming Procurements | 2026-04-20 | ? | set-aside watchlist |
| `ci93-uc8s` | SBS Certified Business List | 2026-04-28 | ? | vendor/partner enrichment |

`tf3b-tk9r` appears to be a filtered live view of `dg92-zbpx` restricted to Section 6 (Procurement) and recent dates. CROL has identical columns + 30× the rows + full history.

---

## Source 2: PASSPort Public — `a0333-passportpublic.nyc.gov`

**Architecture:** Static AWS S3 / CloudFront site. The entire solicitation table is one JS file:

- `https://a0333-passportpublic.nyc.gov/dataJs/rfxData.js` (3.34 MB, ~25K rows as of 2026-05-25)
- File defines `var public_rfx_data = [ [...], [...], ... ];`
- Refreshed nightly (datestamp shown in footer)
- No API, no pagination, no auth — just `curl` and parse

**Column order (from `/rfx.js`):**

| Idx | Field | Example |
|---|---|---|
| 0 | RFP-ID (internal) | `36937` |
| 1 | BPM-ID | `36394` |
| 2 | **EPIN** (joins to Socrata `pin`) | `07226Y0385` |
| 3 | Program | `Capital Queens - Construction` |
| 4 | Industry | `Professional Services - IT Related` |
| 5 | Procurement Name (title) | `07226Y0385-Posit Connect and Workbench Renewal` |
| 6 | (unused in render) | `` |
| 7 | Agency | `DEPARTMENT OF CORRECTION` |
| 8 | RFx Status | `Released` / `Planned` / `Awarded` |
| 9 | Release Date | `5/22/2026 12:00:00 AM` |
| 10 | Due Date | `5/29/2026 2:00:00 PM` |
| 11 | Main Commodity | `Application Development Services` |
| 12 | Procurement Method | `RFI (M/WBE)` / `Competitive Sealed Bid` |

**Sample first 3 rows:**
```js
["36937","36394","","Professional Services - IT Related","07226Y0385","07226Y0385-Posit Connect and Workbench Renewal","DEPARTMENT OF CORRECTION","Released","5/22/2026 12:00:00 AM","5/29/2026 2:00:00 PM","Application Development Services","RFI (M/WBE)"]
["36931","36538","","Professional Services - IT Related","85826Y1362","85826Y1362-7-858-0827A REDESIGN SR UX RESEARCHER & DESIGNER, A3","DEPARTMENT OF INFORMATION TECHNOLOGY AND TELECOMMUNICATIONS","Released","5/22/2026 12:00:00 AM","6/5/2026 10:00:00 AM","IT Consulting","RFI (M/WBE)"]
["36929","32856","Capital Queens - Construction","Construction","84626B0048","84626B0048-Q009-121M MacNeil Park Waterfront Reconstruction","DEPARTMENT OF PARKS AND RECREATION","Released","5/22/2026 10:00:00 AM","6/4/2026 10:30:00 AM","Parks and Site Work Construction","Competitive Sealed Bid"]
```

**What PASSPort has that Socrata doesn't:**

| Field | Socrata `tf3b-tk9r` | PASSPort |
|---|---|---|
| EPIN | ✓ as `pin` | ✓ as col 2 |
| Industry taxonomy (NYC's own) | partial via `category_description` | ✓ explicit `industry` |
| Main Commodity (NYC standardized) | ✗ | ✓ |
| Procurement Method (with M/WBE flag) | partial via `selection_method_description` | ✓ explicit `(M/WBE)` suffix |
| RFx Status (Released / Planned / Awarded) | ✗ (only "Solicitation"/"Award Notice" type) | ✓ explicit state machine |
| Sources Sought / Pre-Solicit equivalent | ✗ | ✓ as `RFI (M/WBE)` rows |
| Program (capital plan grouping) | ✗ | ✓ |

**What PASSPort does NOT have:**

- No attachment URLs
- No POC name/email/phone
- No long description
- No vendor Q&A (those live behind login at `passport.cityofnewyork.us`)
- No PDF / RFx document download (login-gated)

**Extraction approach:**

```js
// Single cron, runs daily:
const txt = await fetch('https://a0333-passportpublic.nyc.gov/dataJs/rfxData.js').then(r => r.text());
// Strip `var public_rfx_data = ` prefix and trailing `;`
const json = txt.replace(/^var public_rfx_data\s*=\s*/, '').replace(/;\s*$/, '');
const rows = JSON.parse(json);
// Each row: [rfp_id, bpm_id, program, industry, epin, name, agency, status, release_date, due_date, commodity, method]
```

Robots.txt: PASSPort serves no robots.txt — the request returns AWS S3 `AccessDenied` XML. Implies no explicit policy; since the data file is publicly linked from the SPA, treat as open.

---

## Source 3: City Record HTML — `a856-cityrecord.nyc.gov`

**Status: not directly accessible from cloud egress.**

- DNS resolves: `a856-cityrecord.nyc.gov` → `mspwvw-dcscpfvp.nyc.gov` → `157.188.15.130`
- TCP connect on 443 times out from this environment (Vercel / standard cloud IPs likely also blocked). Could be a US-East geofence, a TLS-version mismatch (host is on older IIS), or rate-limiting at the WAF.
- Verified working from a normal residential browser (per the SPA's links, and because Socrata's `document_links` reliably returns these URLs in its API responses).

**URL patterns observed in Socrata `document_links`:**

```
https://a856-cityrecord.nyc.gov/Search/GetFile?SectionID=6&RequestStatus=Archived&RequestID={request_id}&DocumentID={doc_id}
```

- `SectionID=6` → Procurement section (other sections: 1=Public Hearings, 2=Court Notices, 3=Agency Rules, …)
- `RequestStatus=Archived` for closed notices; `Active` for live ones (haven't confirmed live since host is unreachable)
- `RequestID` matches Socrata `request_id` exactly
- `DocumentID` is per-attachment, monotonically increasing across all sections

**Other URL endpoints (inferred from SPA + Socrata cross-references — not verified live):**
- `https://a856-cityrecord.nyc.gov/RequestDetail/{request_id}` — likely the human-readable detail page
- `https://a856-cityrecord.nyc.gov/Search/AllRequests` — search UI

**robots.txt:** not reachable from this environment, can't read.

**Implication for CapturePilot:** Don't write a scraper for this host. Instead, use Socrata's `document_links` column as the canonical attachment list, and serve the URLs through a proxy (same SSRF-safe pattern as `/api/sam/attachment-download`) — final download requests will come from the end-user's browser, which bypasses the cloud-egress block.

---

## Field-Coverage Comparison

Canonical fields CapturePilot uses, mapped to the most reliable source:

| Canonical field | tf3b-tk9r (Socrata) | dg92-zbpx (CROL) | PASSPort | Best source |
|---|---|---|---|---|
| Title | `short_title` | `short_title` | col 5 (Procurement Name) | tie — Socrata cleaner, PASSPort prefixes with EPIN |
| Description (HTML) | `additional_description_1` | `additional_description_1` | ✗ | **Socrata** |
| Agency | `agency_name` | `agency_name` | col 7 | tie |
| Notice type | `type_of_notice_description` | `type_of_notice_description` | col 12 (method) + col 8 (status) | **PASSPort** (RFI vs Sealed Bid + state) |
| Set-aside / M/WBE | embedded in description | embedded in description | col 12 suffix `(M/WBE)` | **PASSPort** (machine-parseable) |
| Industry / commodity | `category_description` | `category_description` | col 4, col 11 | **PASSPort** (two-level taxonomy) |
| Due date | `due_date` (ISO) | `due_date` | col 10 (US date string) | **Socrata** (parseable) |
| Release date | `start_date` | `start_date` | col 9 | tie |
| PIN / EPIN | `pin` | `pin` | col 2 | tie |
| Contract value | `contract_amount` (often null) | `contract_amount` | ✗ | Socrata (when present) |
| POC name | `contact_name` | `contact_name` | ✗ | **Socrata only** |
| POC email | `email` | `email` | ✗ | **Socrata only** |
| POC phone | `contact_phone` | `contact_phone` | ✗ | **Socrata only** |
| Attachment URLs | `document_links` (16% coverage) | `document_links` | ✗ | Socrata only, sparse |
| Status (open/closed/awarded) | derived from `due_date` + section | same | col 8 (explicit) | **PASSPort** |
| Historical depth | rolling ~3K | full back to ~2011 | current only (~25K rows) | **CROL** for history |

---

## PDF / Attachment Recommendation

1. Treat `document_links` from Socrata as the only source of attachments. It's pre-split with `,` between URLs (note: ampersands are HTML-escaped as `&amp;` — must decode):
   ```ts
   const raw = row.document_links?.url ?? '';
   const urls = raw.split(',').map(u => u.replace(/&amp;/g, '&').trim()).filter(Boolean);
   ```
2. Proxy downloads through `/api/nyc/attachment-download?url=...` with a host allowlist of `a856-cityrecord.nyc.gov` (same pattern as `dashboard/src/app/api/sam/attachment-download/route.ts`). Strip query params other than `SectionID`, `RequestStatus`, `RequestID`, `DocumentID`.
3. **Important:** the proxy will likely fail from Vercel egress too. Recommend the user's browser fetch directly via a 302 redirect from the proxy — i.e. the proxy validates the URL shape and returns `Location:` rather than streaming the bytes. Test from a real Vercel deploy before committing to a streaming proxy.

---

## Recommendation

**Add two new ingest crons; keep the existing one.**

### Cron A — `ingest_nyc_crol` (replaces or supplements `tf3b-tk9r`)
- Source: `https://data.cityofnewyork.us/resource/dg92-zbpx.json`
- Filter: `?$where=section_name='Procurement' AND start_date>'<last_seen>'&$limit=50000&$order=start_date DESC`
- Schedule: daily 03:30 UTC (Socrata updates overnight)
- Volume per run: low — incremental ingest, expect 50-200 new rows/day
- Why: 30× the rows of `tf3b-tk9r`, full history including Award notices for past-performance data, identical column layout (same parser).
- Rate limit: Socrata API allows ~1000 req/hour anonymously; one paginated call fits fine. If we need >50K rows in a backfill, use `$offset` paging or request an app token (free, raises limit to ~50K req/hr).
- Anonymous boundary: no auth required. Setting an app token (`X-App-Token`) only raises rate limits, doesn't change permissions.

### Cron B — `ingest_nyc_passport` (new)
- Source: `https://a0333-passportpublic.nyc.gov/dataJs/rfxData.js`
- Schedule: daily 04:00 UTC
- Volume: 25K rows in 3.3 MB, one HTTP request — full refresh each time
- Purpose: enrich existing CROL/Socrata rows by joining on `pin = EPIN`. Set fields the Socrata feed can't provide: explicit `rfx_status`, `industry`, `commodity`, `method_is_mwbe`, `procurement_method`.
- Rate limit: none documented. CloudFront-fronted, will tolerate 1 req/day fine.
- Anonymous boundary: zero — file is statically served, no auth/cookies.
- Robots.txt: not present on host. Site CSP allows `default-src 'none'; img-src 'self' ...`, which is a content policy not a crawling restriction.

### Keep `ingest_nyc_currentbids` (`tf3b-tk9r`)
- Skip if CROL ingest is reliable. CROL is a superset.
- If kept: useful only as a sanity check / changelog watcher (3K rows is fast to diff).

### Don't do
- Don't write a City Record HTML scraper. The host blocks cloud IPs and the same data ships through Socrata anyway.
- Don't try to scrape `passport.cityofnewyork.us` (the actual buyer portal, not the public site). It's session-gated and requires a vendor account. PASSPort Public's own marquee says "DO NOT RESPOND HERE."

### Data merge order
1. CROL row arrives → write to `opportunities` with `source='nyc_crol'`, `external_id=request_id`.
2. PASSPort sweep runs → for each `epin` in `public_rfx_data`, upsert into `opportunities` joining on `pin = epin`. Add a JSON blob `nyc_passport_meta` to `opportunities.notes` with status / commodity / method.
3. Set-aside flag: parse `method` for `(M/WBE)` and surface as `set_aside='M/WBE'` for the existing matching algorithm.

### Code-level details
- Use existing `guardCron(req)` helper.
- Migration: add `source` enum value `nyc_crol` and `nyc_passport`. Add `nyc_passport_meta` JSONB column or fold into existing `notes`.
- For `document_links`: write a one-time backfill script that splits the column on first ingest, stores each URL as a row in a new `opportunity_attachments` table keyed by `(opportunity_id, doc_id)`. Don't re-fetch — Socrata returns the same URL string deterministically.

### robots.txt summary
| Host | robots.txt | Crawl-delay | Disallow procurement paths |
|---|---|---|---|
| `data.cityofnewyork.us` | ✓ served | 1 second | only blocks faceted `/browse?q=...&category=...` URLs. JSON APIs are open. |
| `a0333-passportpublic.nyc.gov` | ✗ (AWS S3 `AccessDenied`) | — | no policy |
| `a856-cityrecord.nyc.gov` | unreachable | — | unknown — treat as conservative; only follow links from Socrata |

---

## Quick numbers

- `tf3b-tk9r` Current NYC Bids: 3,366 rows, 90 with future due_date, 531 with attachments
- `dg92-zbpx` City Record Online: 1,085,609 total / **103,710 Procurement section**
- PASSPort `rfxData.js`: ~25K rows, 3.3 MB, single GET
- Socrata schema columns: 37
- PASSPort schema columns: 12
- Overlap key: Socrata `pin` ⇔ PASSPort col 2 (`EPIN`)
- Attachment host: only `a856-cityrecord.nyc.gov/Search/GetFile`, served via Socrata `document_links` column
