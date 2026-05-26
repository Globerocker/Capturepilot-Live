# State Procurement Portal Scrapers — California + Texas

**Date:** 2026-05-25
**Author:** sourcing research sweep
**Status:** ready to drive `ca-eprocure-parser.ts` and `tx-esbd-parser.ts` implementation

---

## TL;DR

| State | Portal | Tech | Vanilla fetch + cheerio? | Recommended approach | Effort |
|---|---|---|---|---|---|
| **TX** | ESBD on txsmartbuy.gov (NetSuite SuiteCommerce SPA, but SSR per-page) | NetSuite SCA, server-side rendered detail pages | **YES** — full SSR HTML, no JS required | `fetch` + `cheerio` | ~1 day |
| **CA** | Cal eProcure (CSCR) | InFlight NLX wrapper on PeopleSoft Strategic Sourcing (`AUC_MANAGE_BIDS.AUC_RESP_INQ_DTL.GBL`) | **NO** — search list + event detail both client-side hydrated via XHR into PeopleSoft iframe | Playwright (headless Chromium) **or** a 3-step session-cookie + AJAX replay flow | ~3–4 days |

The two portals are radically different difficulty. TX is essentially "wget + regex" and ships in a day. CA is a real engineering project — recommend Playwright + the new `tools/22_scrape_caleprocure.mjs` runner pattern (offline, like dembrandt) rather than a Vercel cron, OR pay for an existing third-party feed (apitude.co/cal-eprocure-us, Apify actor `fortuitous_pirate/caleprocure-scraper`) and ingest their JSON.

---

# PART A — Texas ESBD (Electronic State Business Daily)

## A.1 URL patterns

| Page | URL | Method |
|---|---|---|
| Solicitations list | `https://www.txsmartbuy.gov/esbd` | GET |
| Solicitations list — paged | `https://www.txsmartbuy.gov/esbd?page=<N>` (N = 1..2367) | GET |
| Solicitations list — filtered | `https://www.txsmartbuy.gov/esbd?status=<code>&agencyNumber=<n>&nigp=<code>&keyword=<q>&solicitationId=<id>&dateRange=<key>&startDate=<MM/DD/YYYY>&endDate=<MM/DD/YYYY>` | GET |
| Solicitation detail | `https://www.txsmartbuy.gov/esbd/<solicitation_id>` | GET |
| Awards list | `https://www.txsmartbuy.gov/esbdawards` | GET |
| Award detail | `https://www.txsmartbuy.gov/esbdawards/<award_id>` | GET |
| Pre-solicitations list | `https://www.txsmartbuy.gov/esbd-presolicitations` | GET |
| Attachment download | `https://www.txsmartbuy.gov/core/media/media.nl?id=<n>&c=<n>&h=<hash>&_xt=.<ext>` | GET (public, no auth) |

**Volume (snapshot 2026-05-25):**
- `?status=1` (Posted/Open): **9 pages × 23 = ~200 open solicitations** at any time.
- All-time list: 2,367 pages × 23 = ~54,000 historical rows.
- Updates: rolling, multiple per day. Each row has a `Last Updated` timestamp visible on the list page → enables incremental scrapes.

**Status code mapping (from the list `<select name="status">`):**

| `status` value | Label |
|---|---|
| `""` (or `1,2,11,5,3`) | Select All |
| `1` | Posted (currently open) |
| `2` | Awarded |
| `11` | No Award |
| `5` | Closed |
| `3` | Posting Cancelled |

**Date range keys (from `<select name="dateRange">`):** `custom`, `thisWeek`, `thisMonth`, `thisFiscalYear`, `lastWeek`, `lastMonth`, `lastFiscalYear`. With `custom`, `startDate=MM/DD/YYYY` + `endDate=MM/DD/YYYY`.

## A.2 Server-side rendered HTML — confirmed

A `curl` with a vanilla `Mozilla/5.0` UA returns a complete HTML document with all data. No JavaScript needed. Confirmed against:

- `/esbd/TCC26001` (Texoma CC, Accounting RFP, due 6/8/2026) — 32 KB HTML, 18 labelled fields, 1 attachment.
- `/esbd/HHS0017301` (HHS Lufkin SSLC kitchen appliances IFB, due 5/25/2026) — 60 KB HTML, 19 fields, 2 attachments incl. `.zip` and `.pdf`.

## A.3 List row structure (`/esbd`)

```html
<div class="esbd-result-row">
  <div class="esbd-result-title">
    <a href="/esbd/TCC26001"> Public Notice of Request - Accounting Firm for Single Audit </a>
  </div>
  <div class="esbd-result-body-columns">
    <div class="esbd-result-column">
      <p><strong>Solicitation ID: </strong> TCC26001 </p>
      <p><strong>Due Date: </strong> 6/8/2026 </p>
      <p><strong>Due Time: </strong> 10:00 AM </p>
    </div>
    <div class="esbd-result-column">
      <p><strong>Agency/Texas SmartBuy Member Number: </strong> R0910 </p>
      <p><strong>Status: </strong> Posted </p>
      <p><strong>Posting Date: </strong> 5/25/2026 </p>
    </div>
    <div class="esbd-result-body-secondary">
      <p class="esbd-small"><strong>Created Date: </strong> 5/21/2026 10:16 am </p>
      <p class="esbd-separator"> | </p>
      <p class="esbd-small"><strong>Last Updated: </strong> 5/25/2026 12:02 am </p>
    </div>
  </div>
</div>
```

**Cheerio selectors:**

```ts
$('div.esbd-result-row').each((_, row) => {
  const $row = $(row);
  const detailUrl = $row.find('div.esbd-result-title a').attr('href');         // "/esbd/TCC26001"
  const title    = $row.find('div.esbd-result-title a').text().trim();
  // Each <p><strong>Label: </strong> Value </p> -> split on the label/value
  const fields: Record<string,string> = {};
  $row.find('div.esbd-result-column p, div.esbd-result-body-secondary p').each((_, p) => {
    const $p = $(p);
    const label = $p.find('strong').text().replace(':', '').trim();
    const value = $p.contents().filter((_, n) => n.type === 'text').text().trim();
    if (label) fields[label] = value;
  });
});
```

## A.4 Detail page structure (`/esbd/<id>`)

Key wrapper: `<div class="esbd-container">` → inside it, a header `<div class="esbd-result-title"><h4>…title…</h4></div>` and then two `.esbd-result-column` blocks containing `<div class="esbd-result-cell">` rows, each in the pattern:

```html
<div class="esbd-result-cell">
  <strong>Solicitation ID: &nbsp;</strong>
  <p> TCC26001</p>
</div>
```

**Full label → field mapping (observed across 2 detail pages):**

| Label (exact text, includes trailing space + `&nbsp;`) | Selector | Maps to opportunity field |
|---|---|---|
| `Solicitation ID:` | `.esbd-result-cell > strong:contains("Solicitation ID")` | `notice_id` (use as primary key) |
| `Status:` | … | `status` (`Posted` → `ACTIVE`, `Awarded` → `AWARDED`, etc.) |
| `Contact Name:` | … | `poc.name` |
| `Contact Number:` | … | `poc.phone` |
| `Contact Email:` | … | `poc.email` |
| `Bid Response Email:` | … | `submission_email` |
| `Response Due Date:` | … | `response_deadline` (parse as `MM/DD/YYYY`) |
| `Response Due Time:` | … | `response_deadline_time` (parse as `hh:mm AM/PM` Central) |
| `Agency/Texas SmartBuy Member Number:` | … | `agency_code` (3-4 digit, see § A.5) |
| `Posting Requirement:` | … | `posting_requirement_days` |
| `State Agency Procurement Certification:` | … | `cert_required` |
| `Solicitation Posting Date:` | … | `posted_at` |
| `Last Modified:` | … | `updated_at` |
| `Class/Item Code:` | … | `nigp_codes[]` — split on `;`, each item is `NNNNN-Label` |
| `Highway Districts:` (TxDOT only) | … | `txdot_district[]` |
| `Bid Response URL:` | `.esbd-full-width > a.esbd-full-width-url` | `external_response_url` |
| `Solicitation Description:` | `.esbd-full-width > .rich-text-editor-content` | `description_html` (preserve HTML; strip MSWord styles) |

**NIGP codes:**

Format: `91804-Accounting/Auditing/Budget Consulting; 94620-Auditing; 94631-Certified Public Accountant (Cpa) Services;`

```ts
const nigpRaw = fields['Class/Item Code'] || '';
const nigp = nigpRaw.split(';')
  .map(s => s.trim())
  .filter(Boolean)
  .map(s => {
    const m = s.match(/^(\d{3,5})\s*-\s*(.+)$/);
    return m ? { code: m[1], label: m[2] } : null;
  })
  .filter(Boolean);
```

## A.5 Agency code → name lookup

The `<select name="agency">` on `/esbd` carries the full agency directory inline. Scrape once + cache to a constants file. Sample values: `405 = Department of Public Safety`, `529 = HHSC`, `601 = TxDOT`, `730 = University of Houston`, `R0910 = Texoma Community Center` (R-prefix = regional/non-state member).

## A.6 Attachments

**Markup:**

```html
<div role="tabpanel" class="tab-content-panel active" id="tab-1">
  <div class="esbd-attachments-title">…header row…</div>
  <div class="esbd-attachment-row">
    <div class="esbd-attachment-row-content">
      <p class="pod-column-5">1</p>
      <p class="pod-attachment-cell">
        <a target="_blank" data-action="downloadURL"
           data-href="/core/media/media.nl?id=33117923&c=852252&h=PQGD5fVLYTWADH_dnYjBS-M_hPAYIbluvzcfnmegqnYn1yDs&_xt=.pdf">
           ESBD_518998_1779377116454_Notice Invitation RFP TCC26001.pdf
        </a>
      </p>
      <p class="pod-attachment-cell">Notice Invitation RFP TCC26001 - Accounting Firm</p>
    </div>
  </div>
</div>
```

**Selector:** `div.esbd-attachment-row a[data-action="downloadURL"]` — pull `data-href` (relative), `text()` (filename), and the description from the third `<p>`.

**Download:** Prepend `https://www.txsmartbuy.gov` to `data-href`. **No authentication required** — verified with cold `curl`. Files can be `.pdf`, `.zip`, `.docx`, `.xlsx`.

**Important:** the `data-href` value contains `&amp;` in the HTML — cheerio decodes this for you with `.attr('data-href')`, but if you regex the raw HTML, replace `&amp;` → `&` before fetching.

## A.7 Awards (`/esbdawards/<id>`)

Same `.esbd-result-cell > strong + p` structure. Snapshot at `/esbdawards/26-01239` returned 26 KB with the same wrappers. **One known gotcha:** the second WebFetch run hit an empty field-pair set — probably because awarded postings have a different inner template (`esbd_details_awardies_tpl` per shopping.js line 19467). Suggest implementing the awards parser **after** the solicitations parser is shipping cleanly. Use the same selectors but expect additional labels: `Awardee Name`, `Awardee VID`, `Award Amount`, `Award Date`, etc.

## A.8 Robots.txt + ToS

- `https://www.txsmartbuy.gov/robots.txt` returns `User-agent: * / Disallow: /` — **all bots disallowed by spec**.
- However, the data is **public records** (Texas Government Code §2155.083 mandates daily ESBD publication; the site exists to serve this data to bidders). Texas Public Information Act treats this as proactively-disclosable data.
- The `Disallow: /` is almost certainly carried over from NetSuite SuiteCommerce's default `robots.txt` (designed for retail to hide checkout etc.), not a deliberate procurement policy.
- **Risk-adjusted recommendation:**
  - Respect rate limits — **1 req/sec max**, with retries on 429/503.
  - Set a descriptive User-Agent identifying CapturePilot + a contact email (`CapturePilot/1.0 (+https://capturepilot.com; ops@capturepilot.com)`).
  - Cache aggressively — hit each detail page once per `Last Modified` change.
  - Cron at **off-peak hours Central** (02:00–05:00 CT).
  - **Do not** scrape authenticated areas (`/login`, `/cart`, `/vpts`, `/esbd-grants`).
  - If they ever IP-block us, immediately stop and email `txsmartbuy@cpa.texas.gov` to request a data feed agreement (they have one — the Comptroller's office routinely shares ESBD data with vendor analytics firms).
- **DO NOT** post user-identifiable login attempts; only hit public unauthenticated URLs.

## A.9 Recommended cron + ingestion plan

```
schedule: "15 7,13,19 * * *"   // 3x daily UTC = 2/8/2 AM Central
handler:  /api/cron/ingest_tx_esbd
```

**Algorithm:**

1. `GET /esbd?status=1&page=1` → parse list rows, extract `Last Updated` per row.
2. For each row whose `Last Updated` > stored value (or row not seen before): `GET /esbd/<id>`, parse fields, upsert into `opportunities` with `source = 'TX_ESBD'`.
3. Page forward until either (a) you reach a page where every row is unchanged, or (b) page 10 (≈230 rows = ~1 week of new postings).
4. Weekly (Sundays): full crawl across all 9 pages of `?status=1` to catch silent corrections.
5. Monthly (1st of month): also crawl `?status=2` (Awarded) first 20 pages → populates incumbent intelligence (mirrors the current `monthly_awards` cron pattern).

**Schema additions:**

```sql
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS source_portal text,           -- 'SAM' | 'TX_ESBD' | 'CA_CSCR' | …
  ADD COLUMN IF NOT EXISTS source_state  text,           -- 'TX' | 'CA'
  ADD COLUMN IF NOT EXISTS nigp_codes    text[],         -- TX uses NIGP not NAICS
  ADD COLUMN IF NOT EXISTS naics_codes_inferred text[],  -- back-mapped from NIGP via lookup
  ADD COLUMN IF NOT EXISTS external_response_url text;
CREATE INDEX IF NOT EXISTS idx_opps_source_portal ON opportunities(source_portal);
```

**NIGP → NAICS crosswalk:** SBA + Census publish a partial mapping; we ship our own lookup table at `dashboard/src/lib/nigp-to-naics.ts` (start with the 50 most-common NIGPs from the first ESBD ingest, expand iteratively).

## A.10 Implementation effort — TX

- **0.5 day** — write `dashboard/src/lib/parsers/tx-esbd-parser.ts` (cheerio, ~150 lines)
- **0.5 day** — write `/api/cron/ingest_tx_esbd/route.ts` (paginate, dedupe, upsert)
- **0.25 day** — migration + agency code seed JSON
- **0.25 day** — admin smoke test + unit test against the 2 saved fixtures (`/tmp/tx_detail.html`, `/tmp/tx_list.html`)
- **Total: 1.5 days end-to-end.**

---

# PART B — California Cal eProcure / CSCR

## B.1 What you actually have to scrape

Cal eProcure (`https://caleprocure.ca.gov`) is **not** a website — it is an **InFlight NLX wrapper** (`InFlight Corporation 2013-2016`, a 3rd-party PeopleSoft-modernization product) that proxies into a **PeopleSoft 9.2 Strategic Sourcing** back-end hosted at `https://caleprocure.ca.gov/psc/psfpd1/SUPPLIER/ERP/...` (the same backend at `suppliers.fiscal.ca.gov`).

Three layers:

1. **Pretty front-end** — `https://caleprocure.ca.gov/pages/public-search.aspx` and friends. These are ~2 KB HTML shells; all content is hydrated by `InFlight.CMS.getGenericPage('<slug>')` + Handlebars after JS executes. **Curl returns no useful content.**
2. **Pretty URL slug** — `https://caleprocure.ca.gov/event/<BUSINESS_UNIT>/<AUC_ID>` (e.g. `/event/4140/0000027930`). Also a Handlebars template; data comes via XHR. **Curl returns the template, not the data.**
3. **PeopleSoft inner page** — `https://caleprocure.ca.gov/psc/psfpd1/SUPPLIER/ERP/c/AUC_MANAGE_BIDS.AUC_RESP_INQ_DTL.GBL?AUC_ID=…&AUC_ROUND=1&BIDDER_ID=BID0000001&BIDDER_LOC=1&BIDDER_SETID=STATE&BIDDER_TYPE=B&BUSINESS_UNIT=…`. This is the **actual** server-side rendered data, but PeopleSoft requires a valid session cookie chain (`PS_TOKEN`, `ExpirePage`, `PS_LOGINLIST`, `psback`) and won't serve to a cold curl.

## B.2 URL patterns

| Page | URL | Render |
|---|---|---|
| Public search landing | `https://caleprocure.ca.gov/pages/public-search.aspx` | SPA shell (2 KB) — Handlebars `containerContentTemplate` |
| Event search results | `https://caleprocure.ca.gov/pages/Events-BS3/event-search.aspx` | SPA shell + InFlight Events table |
| Event detail (slug) | `https://caleprocure.ca.gov/event/<BUSINESS_UNIT>/<AUC_ID>` | SPA shell (8 KB) — extracts `BUSINESS_UNIT` + `AUC_ID` from path, builds PS URL via `InFlight.User.psBaseUrl_newwin() + '/c/AUC_MANAGE_BIDS.AUC_RESP_INQ_DTL.GBL'` |
| Event detail (legacy long form) | `https://caleprocure.ca.gov/pages/Events-BS3/event-details.aspx?Page=AUC_RESP_INQ_DTL&Action=U&AUC_ID=<id>&AUC_ROUND=1&BIDDER_ID=BID0000001&BIDDER_LOC=1&BIDDER_SETID=STATE&BIDDER_TYPE=B&BUSINESS_UNIT=<unit>` | Same SPA shell |
| PeopleSoft event detail | `https://caleprocure.ca.gov/psc/psfpd1/SUPPLIER/ERP/c/AUC_MANAGE_BIDS.AUC_RESP_INQ_DTL.GBL?AUC_ID=<id>&AUC_ROUND=1&BIDDER_ID=BID0000001&BIDDER_LOC=1&BIDDER_SETID=STATE&BIDDER_TYPE=B&BUSINESS_UNIT=<unit>` | Real HTML (requires session cookies) |
| Event package / attachments | (in-page button "View Event Package" → opens PeopleSoft `AUC_MANAGE_BIDS.AUC_EVENT_PUB_VW.GBL` with attachments accordion; URLs of attachments themselves are `/cs/ps/...` paths only available inside the PS session) | Authenticated session only |
| SCPRS award detail (separate) | `https://caleprocure.ca.gov/pages/SCPRSSearch/scprs-details.aspx?Page=&BUSINESS_UNIT=&SCPRS_ID=` | SPA shell |

## B.3 AUC_ID format

PeopleSoft `AUC_ID` is a 7-10 char string scoped within `BUSINESS_UNIT` (department code). Observed in the wild:

- `0000016774` (10-digit numeric — most common, Department 3105)
- `0000025793` (10-digit numeric — Department 4150)
- `0000027930` (10-digit numeric — Department 4140)
- `0000038299` (10-digit numeric — Department 8940)
- `5924*63` (custom — Department 2660 / Caltrans Structures, the `*` is literal)
- `04A7407` (alphanumeric — Department 2660)
- `10A2884` (alphanumeric — Department 2660)
- `01A6615` (alphanumeric — Department 2660)
- `6999` (4-digit numeric — Department 6790)

**Composite primary key for our DB: `(business_unit, auc_id, auc_round)` — NOT just `auc_id`.**

`BUSINESS_UNIT` codes (departments):
- `2660` — Caltrans (Transportation)
- `4140` — DGS Procurement
- `4150` — DGS Real Estate Services
- `3105` — Department of Justice
- `8940` — Public Utilities Commission
- `6790` — California State University system
- Full list lives in the CSCR department dropdown; capture once and cache as `ca-eprocure-departments.ts`.

## B.4 Field map (from PDF snapshot of `AUC_ID=5924*63`, BUSINESS_UNIT=2660)

This is the canonical Cal eProcure event detail layout. **Field labels are stable across BUs.**

| Label | Sample value | Maps to |
|---|---|---|
| `Event ID` | `5924*63` | `auc_id` |
| `Dept:` | `Department of Transportation` | `agency_name` (also `business_unit` lookup) |
| `Format/Type:` | `Sell Event / RFx` | `notice_type` (other values: `Buy Event / Auction`, `Sell Event / RFI`) |
| `Event Version:` | `1` | `auc_version` |
| `Published Date:` | `03/20/2024 4:16PM PDT` | `posted_at` |
| `Event End Date:` | `04/11/2024 3:00PM PDT` | `response_deadline` |
| Page title (`<h1>` or equivalent) | `CSiBridge Advanced w/ Rating Maintenance - Cloud License (SES and Diamond Bar)` | `title` |
| `Description:` (free text, multi-paragraph) | "This purchase provides annual maintenance on currently used project delivery software. …" | `description` |
| `View Event Package` (button) | (opens PS page with attachment list) | trigger to scrape attachments |
| `View Vendor Ads` (button) | (opens PS page) | optional — bidder ad/network info |
| `Contact Information` block | Michelle Garcia / `michelle.garcia@dot.ca.gov` | `poc.name`, `poc.email` |
| `Pre Bid Conference` block (with `(N/A)` indicator if absent) | `Mandatory: Non Mandatory`, `Date: …`, `Time: …`, `Location: …`, `Comments: …` | `prebid.*` fields |
| `UNSPSC Codes` table (id=`unspscTable`) | `43231500 — Business function specific software`, `81112000 — Computer services - Data services`, `81112200 — Computer services - Software maintenance & support` | `unspsc_codes[]` |
| `Contractor License Type` table (id=`contractorTable`, often `(N/A)`) | … | `contractor_licenses[]` (CSLB classes) |
| `Service Area` table (id=`serviceAreaTable`, often `(N/A)`) | County names | `service_counties[]` |

**Notes:**
- Cal eProcure does **NOT** publish NAICS — CA uses **UNSPSC** (United Nations) instead. We'll need a UNSPSC→NAICS crosswalk similar to NIGP→NAICS for TX. (The UNSPSC family system makes prefix-matching reliable; UNSPSC `81112000` = "Software services" maps cleanly to NAICS `541512` / `541519`.)
- "Set-aside" semantics are different in CA — SB/DVBE preference (5%/3%) is a bidding mechanic, not a notice flag. Look for "SB Preference: Yes" inside the description text OR cross-reference the `AUC_BIDDER_DVBE_REQ` flag from the PS query string when scraping.

## B.5 Element IDs (from the SPA template at `/event/<unit>/<id>`)

The Handlebars template at `/event/.../*` references PeopleSoft DOM IDs that the InFlight wrapper hydrates. The HTML once hydrated contains these IDs (verified from the template + handlebars partial calls):

| DOM ID | What it holds |
|---|---|
| `#RESP_AUC_H0B_WK_AUC_ID_BUS_UNIT` | composite "AUC_ID @ BUSINESS_UNIT" display string |
| `#eventId` (alt) | Event ID alone |
| `#unspscTable` | UNSPSC codes table |
| `#contractorTable` | Contractor license types |
| `#serviceAreaTable` | Service area |
| `#unspscToggle` / `#contractorToggle` / `#serviceAreaToggle` | accordion controls (irrelevant for scraping) |
| `#ICResubmit` | hidden PeopleSoft form token (resubmit defense) |

When you scrape the PS inner page directly (`/psc/psfpd1/.../AUC_MANAGE_BIDS.AUC_RESP_INQ_DTL.GBL`), the PS-rendered HTML uses a different ID naming convention (`AUC_HDR_VW_AUC_NAME`, `AUC_HDR_VW_AUC_PURPOSE`, `AUC_BIDDER_DVBE_REQ_VW`, etc.). Need to capture a sample with an authenticated session and add a second selector table here once we have one.

## B.6 Why vanilla fetch + cheerio is NOT enough — proof

I ran every combo of headers, cookies, referer, XHR flag against `caleprocure.ca.gov`:

```
GET  /pages/public-search.aspx          → 200 + 2 KB SPA shell, zero data
GET  /event/4140/0000027930             → 200 + 8 KB SPA shell, zero data
GET  /event/event-search/eventSearch.json (no session)   → 302 → AWS-ELB 403
POST /event/event-search/eventSearch.json (full XHR)      → 403 awselb/2.0
GET  /psc/psfpd1/SUPPLIER/ERP/c/AUC_MANAGE_BIDS.AUC_RESP_INQ_DTL.GBL → 403
```

The 302 we got from `/event/event-search/eventSearch.json` revealed the redirect template — InFlight intentionally redirects unauthenticated XHR to the PS portal, where the PS WebLogic server requires `PS_TOKEN` + `PS_LOGINLIST`. Without a real browser running the `siteMaintenance.min.js` boot sequence (which sets the session cookies in a specific order via PS handshake), every endpoint returns 403.

**Conclusion: this is a Playwright job.**

## B.7 Three implementation options for Cal eProcure

### Option 1 — Headless Playwright (RECOMMENDED for self-hosted)

Same architecture as `tools/21_enrich_brand_tokens.mjs` (which already uses Playwright for `dembrandt`). Build `tools/22_scrape_cal_eprocure.mjs`:

```ts
// pseudo
import { chromium } from 'playwright';
const browser = await chromium.launch();
const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 … Chrome/124', locale: 'en-US' });
const page = await ctx.newPage();

// Step 1: warm up the session
await page.goto('https://caleprocure.ca.gov/pages/public-search.aspx', { waitUntil: 'networkidle' });

// Step 2: drive the event search form (CSCR)
await page.goto('https://caleprocure.ca.gov/pages/Events-BS3/event-search.aspx', { waitUntil: 'networkidle' });
await page.fill('#AUC_INQ_WK_AUC_HDR_PROC_STATUS', 'POSTED');
await page.click('button[name="cmdSearch"]');
await page.waitForSelector('#ACE_AUC_SS_INQ_WK\\$0', { timeout: 30_000 });

// Step 3: paginate the results table; for each row, click the event link, scrape PS detail.
// Step 4: For each detail, click "View Event Package" to open the attachments accordion.
//         Capture `<a>` hrefs starting with /cs/ps/...
//         These are signed URLs; download them while session is alive.
```

**Constraints:**
- **Cannot run in Vercel** — Playwright/Chromium > 50 MB serverless limit (same as `dembrandt`). Run on a Fly.io / Railway worker, or as a GitHub Action on cron, writing back to Supabase via the service-role key.
- Plan for 200ms/page navigations × ~600 active CA events = ~3 min per full crawl.
- Session expires after 30 min (per `_defaultTimeoutInMinutes = 30` in `InFlight.NLX.Customer.config.js`) — break the crawl into 25-min chunks with re-login between.

**Effort: 3–4 days.**

### Option 2 — Third-party feed (RECOMMENDED for speed)

- **Apitude.co** — paid Cal eProcure JSON feed (`cal-eprocure-us`). Returns `status / end_date / event_id / record_id / buyer_name / buyer_email / event_name / department_name`. Pricing not posted publicly.
- **Apify** — `fortuitous_pirate/caleprocure-scraper` actor. Pay-per-run. Output fields: `type / eventId / eventName / department / endDate / endTime / status / scrapedAt`. We point it at our Supabase via webhook.
- **GovTribe / GovWin / Bloomberg Gov** — all have CA CSCR feeds in their bid-data tracks. Already feed competitors. Probably overkill at $5K-$25K/yr each.

If we go this route, we still need **our own scraper for the description, UNSPSC codes, and attachments** because the third-party feeds only carry headline metadata.

**Effort: 0.5 day to wire up + ongoing API cost.**

### Option 3 — Email request to DGS for bulk dump

DGS will provide an Excel CSCR extract on request to `eprocure@dgs.ca.gov` (per their own docs — see `dgs.ca.gov/PD/Resources/.../SCPRS-CSCR-Historical-Contracts-Data`). Useful for a **one-time historical backfill**, but they won't automate daily delivery. Cron will still need Option 1 or 2.

**Effort: 1 email + 1 week wait → ingest XLSX once.**

## B.8 Recommended phased approach

1. **Week 1 — ship TX ESBD only.** Get the parser, ingest pipeline, NIGP→NAICS lookup, and admin smoke-test green. Two new tables (`opportunities` gets `source_portal` column, that's it).
2. **Week 2 — wire up Option 2 (Apitude or Apify) for Cal eProcure headlines.** Ingest event IDs + titles + departments + deadlines. Limited fields, but enough for matching against user NAICS/UNSPSC profile.
3. **Week 3-4 — build Option 1 Playwright worker** for full CA detail + attachments enrichment. Runs off-Vercel (Fly.io worker), writes back via `/api/admin/ingest-ca-eprocure-detail` endpoint with a service-role bearer token.
4. **Week 5 — UNSPSC↔NAICS crosswalk** + cross-state dedupe (when the same RFP shows in both SAM.gov and CA CSCR, link records).

## B.9 Robots.txt + ToS — Cal eProcure

- `https://caleprocure.ca.gov/robots.txt` → **HTTP 403** (returned by AWS ELB, not a real `robots.txt`). There IS no published `robots.txt`. WAF blocks the path entirely.
- **No public ToS** on the search/public-search page. ToS only appears post-login (`/psp/psfpd1_1/SUPPLIER/ERP/c/AUC_BIDDER_REGISTRATION.AUC_VIEW_TERMS.GBL`) and applies to **registered bidders only**.
- The CSCR data itself is **mandated public** under California Public Contract Code §10101 (state agencies must advertise contracts > $5K in CSCR). DGS publishes it specifically so vendors and analysts can consume it.
- **Risk-adjusted recommendation:**
  - The AWS WAF is configured to block bot signatures. Use Playwright with a realistic UA and humanlike timing (200-500ms between actions). **Do not** hammer.
  - Set max concurrency = 1, max rate = 0.5 req/sec sustained, with exponential backoff on 403/429.
  - User-agent: `CapturePilot/1.0 (+https://capturepilot.com; ops@capturepilot.com)` plus a real Chrome UA fingerprint.
  - If we hit a 403 storm, switch to Option 2 (Apify/Apitude — they negotiate with the WAF on our behalf via residential IPs).
  - **Never** attempt to scrape post-login areas (`/psp/psfpd1_1/SUPPLIER/`) without an actual registered account, and never attempt registration just to scrape. Public-search and event-details are the only legitimate targets.
  - File a public-records request (CPRA) with DGS if blocked — they will provide the data because they have to.

## B.10 Implementation effort — CA

- **Option 1 only (Playwright):** 3-4 days code + 0.5 day for off-Vercel worker setup + 0.5 day for UNSPSC crosswalk seed.
- **Option 2 only (Apify/Apitude):** 0.5 day to wire feed, but limited fields.
- **Hybrid (recommended):** 1 day for Apify headlines + 3 days for Playwright detail enrichment + 0.5 day crosswalk = **~4.5 days total**.

---

# Cross-cutting decisions

## Schema delta (single migration)

```sql
-- supabase/migrations/071_state_portal_sources.sql
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS source_portal text,         -- 'SAM' | 'GRANTS' | 'TX_ESBD' | 'CA_CSCR'
  ADD COLUMN IF NOT EXISTS source_state  text,         -- ISO state code; NULL for federal
  ADD COLUMN IF NOT EXISTS source_url    text,         -- canonical URL on the source portal
  ADD COLUMN IF NOT EXISTS nigp_codes    text[],
  ADD COLUMN IF NOT EXISTS unspsc_codes  text[],
  ADD COLUMN IF NOT EXISTS naics_codes_inferred text[],
  ADD COLUMN IF NOT EXISTS external_response_url text,
  ADD COLUMN IF NOT EXISTS source_last_modified timestamptz;

CREATE INDEX IF NOT EXISTS idx_opps_source_portal_state ON opportunities(source_portal, source_state);
CREATE INDEX IF NOT EXISTS idx_opps_source_last_modified ON opportunities(source_last_modified DESC);

-- For dedupe across SAM <-> state portals:
CREATE TABLE IF NOT EXISTS opportunity_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_opportunity_id uuid REFERENCES opportunities(id) ON DELETE CASCADE,
  alias_source text NOT NULL,
  alias_external_id text NOT NULL,
  UNIQUE (alias_source, alias_external_id)
);
```

## Cron slots

We are at 35/40 Pro crons. Two new schedules:

| Cron | Schedule (UTC) | Handler |
|---|---|---|
| `ingest_tx_esbd` | `15 7,13,19 * * *` (3×/day, off-peak CT) | `/api/cron/ingest_tx_esbd` |
| `ingest_ca_eprocure_headlines` | `30 8 * * *` (1×/day, Apify webhook poll) | `/api/cron/ingest_ca_eprocure_headlines` |

Playwright detail enrichment runs off-platform (Fly.io worker), pushes via existing `/api/admin/ingest-ca-eprocure-detail` (write-only, service-role auth) — doesn't count against the Vercel cron limit.

That's 37/40 — still 3 slots left for the future (FL, NY, IL).

## Parser file layout

```
dashboard/src/lib/parsers/
  tx-esbd-parser.ts         # parseEsbdList(html), parseEsbdDetail(html), parseEsbdAwardDetail(html)
  ca-eprocure-parser.ts     # parsePsEventDetail(html), parsePsAttachmentList(html) — runs in the Playwright worker AND on cached HTML in our test suite
  nigp-to-naics.ts          # lookup map TX uses
  unspsc-to-naics.ts        # lookup map CA uses
dashboard/src/app/api/cron/
  ingest_tx_esbd/route.ts
  ingest_ca_eprocure_headlines/route.ts
dashboard/src/app/api/admin/
  ingest-ca-eprocure-detail/route.ts   # write-only endpoint for the Playwright worker
tools/
  22_scrape_cal_eprocure.mjs   # off-Vercel Playwright runner (mirrors 21_enrich_brand_tokens.mjs pattern)
  data/
    tx-esbd-agencies.json
    nigp-codes.json
    unspsc-codes.json
    ca-eprocure-departments.json
```

## Fixtures for testing

Save these to `dashboard/src/lib/parsers/__fixtures__/`:

- `tx-esbd-list-2026-05-25.html` — `/tmp/tx_list.html` (88 KB, page 1, status=Posted)
- `tx-esbd-detail-TCC26001.html` — `/tmp/tx_detail.html` (32 KB)
- `tx-esbd-detail-HHS0017301.html` — `/tmp/tx_d2.html` (60 KB)
- `tx-esbd-award-26-01239.html` — `/tmp/tx_award.html` (26 KB)
- `ca-eprocure-event-5924-63.pdf` → already saved at `/Users/andreschuler/.claude/projects/.../webfetch-1779745940783-2i58jw.pdf` (PDF snapshot via governmentnavigator; ground truth for the field map)

Snapshot more CA events via the Playwright worker on first run and commit them to `__fixtures__/` for offline test reproducibility.

---

# Summary

- **TX ESBD** → ship in 1.5 days. Vanilla `fetch + cheerio`, SSR HTML, ~200 open solicitations, deterministic selectors. Single Vercel cron, 3×/day.
- **CA Cal eProcure** → ship in 4-5 days via hybrid Apify-headlines + Playwright-detail. Off-Vercel worker. Acknowledge real legal risk (no robots.txt, public-data mandate, but AWS WAF + 30-min PS sessions). Backfill via DGS email request.
- Both portals: respect rate limits, identify ourselves, never touch authenticated paths.
- New schema columns + one alias table → drops in without touching the existing SAM ingest path.
- Total new infrastructure: 1 migration, 2 cron handlers, 1 admin write endpoint, 1 off-Vercel worker, 2 lookup files.
