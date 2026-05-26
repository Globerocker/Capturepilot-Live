# USAspending.gov API — Source Analysis

**Base URL**: `https://api.usaspending.gov/api/v2/`
**Auth**: None. All endpoints below are public, unauthenticated, and free. No API key registration is required for any endpoint we use.
**Content-Type**: All `POST` endpoints require `Content-Type: application/json`.
**Tested**: 2026-05-25 against live production API with real UEIs (Lockheed `G4KDGE4JFFK7`, Boeing `NU2UC8MX6NK1`).

---

## 0. Key concepts before we dive in

USAspending does NOT use UEI as a primary key. It uses an internal `recipient_id` (also called "recipient hash") that looks like:

```
6cf5fb1b-4988-d087-5dc1-70939d8fc6c4-C
8e2862a3-62bd-4514-180d-47f089a24644-P
```

The trailing suffix matters:
- `-C` = **Child** (a single legal entity / one DUNS+UEI registration)
- `-P` = **Parent** (a corporate parent rolling up many `-C` entities)
- `-R` = **Recipient** (used in some legacy responses; rare)

A single corporation like Lockheed Martin can have **dozens of `-C` hashes** (different subsidiaries, different state registrations, even different UEIs for the same legal name in different cities). The `-P` hash aggregates all of them.

**Important**: our `contractors` table key is UEI, but USAspending's lifetime totals are keyed on hash. To enrich a contractor with USAspending data you must do a UEI → hash lookup first (Section 2 below).

---

## 1. Per-recipient lifetime totals — `/recipient/{hash}/`

### `GET /api/v2/recipient/{recipient_hash}/`

Returns a single recipient's lifetime federal-award total in one call. This is the cheapest, fastest endpoint for the "show lifetime $ on a contractor card" use case.

**Optional query param**: `year=latest` | `year=all` (default) | `year=2024` etc. The default `all` is what we want for lifetime totals.

#### Example: Lockheed Martin (the big `-C`)

```bash
curl 'https://api.usaspending.gov/api/v2/recipient/6cf5fb1b-4988-d087-5dc1-70939d8fc6c4-C/'
```

Real response (truncated):

```json
{
  "name": "LOCKHEED MARTIN CORPORATION",
  "alternate_names": [
    "GENERAL DYNAMICS CORPORATION",
    "GENERAL DYNMICS/FORT WORTH DIV",
    "LOCKHEED MARTIN CORPORATION (3632)"
  ],
  "duns": "008016958",
  "uei": "G4KDGE4JFFK7",
  "recipient_id": "6cf5fb1b-4988-d087-5dc1-70939d8fc6c4-C",
  "recipient_level": "C",
  "parent_id": "8e2862a3-62bd-4514-180d-47f089a24644-P",
  "parent_name": "LOCKHEED MARTIN CORPORATION",
  "parent_duns": "834951691",
  "parent_uei": "JSQTW5L2SSM1",
  "parents": [
    { "parent_id": "8e2862a3-62bd-4514-180d-47f089a24644-P",
      "parent_duns": "834951691", "parent_uei": "JSQTW5L2SSM1",
      "parent_name": "LOCKHEED MARTIN CORPORATION" },
    { "parent_id": "738b71ca-a1fd-b59f-ab44-c884d1bc7b2b-P",
      "parent_name": "SIKORSKY SUPPORT SERVICES INC", "parent_uei": "WXTSNW5E97R6" }
  ],
  "business_types": [
    "category_business",
    "corporate_entity_not_tax_exempt",
    "manufacturer_of_goods",
    "other_than_small_business"
  ],
  "location": {
    "address_line1": "1 LOCKHEED BLVD",
    "city_name": "FORT WORTH", "state_code": "TX",
    "zip": "76108", "zip4": "3619", "country_code": "USA",
    "congressional_code": "12"
  },
  "total_transaction_amount": 24507932944.6,
  "total_transactions": 1609,
  "total_face_value_loan_amount": 0.0,
  "total_face_value_loan_transactions": 0
}
```

**Notes / gotchas**
- `total_transaction_amount` is the **lifetime** amount (all years USAspending has, FY2008–present).
- Returns `404 {"detail": "Recipient is not listed as a parent..."}` if you query a `-P` hash on a row that isn't a parent. Use the `-C` for child, `-P` for parent.
- `alternate_names` is golden for fuzzy matching, but they're literal data-quality blobs (note the misspellings).
- Rate hint: cache `key:` header indicates this endpoint hits an upstream cache (`Cache-Trace: hit-cache` on the second request), so don't worry about hammering it within reason.

---

## 2. UEI → recipient_hash lookup

There is **no direct `/recipient/uei/{uei}` endpoint**. Two viable patterns:

### 2a. Search via `POST /api/v2/recipient/` with `keyword`

The `keyword` field searches name, UEI, and DUNS at the same time, BUT it does not work reliably with raw UEI strings — we tested `keyword: "7N4UAUYJD9C5"` and got 0 results. Use the company name as the keyword and filter the returned list by UEI client-side.

```bash
curl -X POST 'https://api.usaspending.gov/api/v2/recipient/' \
  -H 'Content-Type: application/json' \
  -d '{
    "keyword": "Lockheed Martin Corporation",
    "award_type": "all",
    "limit": 50, "page": 1,
    "order": "desc", "sort": "amount"
  }'
```

Real response:

```json
{
  "page_metadata": {"page": 1, "total": 157, "limit": 5, "next": 2, "hasNext": true},
  "results": [
    { "id": "6cf5fb1b-4988-d087-5dc1-70939d8fc6c4-C",
      "duns": "008016958", "uei": "G4KDGE4JFFK7",
      "name": "LOCKHEED MARTIN CORPORATION",
      "recipient_level": "C",
      "amount": 24507932944.6 },
    { "id": "779b3e3e-364f-7cbc-28a4-a2b4484b86f4-C",
      "uei": "XFJMYSYFJEK4", "name": "LOCKHEED MARTIN CORPORATION",
      "recipient_level": "C", "amount": 8626392993.81 }
  ]
}
```

**Filters**: `award_type` (`contracts` | `grants` | `loans` | `direct_payments` | `other` | `all`), `recipient_levels` (`["P"]` to get parents only, etc.), `sort` (`name` | `amount` | `duns` | `uei`), `q` (location filter).

### 2b. Autocomplete (faster, lighter)

```bash
curl -X POST 'https://api.usaspending.gov/api/v2/autocomplete/recipient/' \
  -H 'Content-Type: application/json' \
  -d '{"search_text":"Lockheed Martin","limit":5}'
```

Response is name+UEI only (no hash):

```json
{
  "count": 5,
  "results": [
    {"recipient_name":"LOCKHEED MARTIN CORPORATION","uei":null,"duns":null},
    {"recipient_name":"LOCKHEED MARTIN INTEGRATED SYSTEMS, LLC","uei":null,"duns":null}
  ]
}
```

UEI/DUNS come back as `null` in autocomplete — fine for a typeahead, useless for our enrichment use case. Use 2a.

### 2c. `GET /api/v2/recipient/children/{DUNS_OR_UEI}/` — only for parent UEIs

```bash
curl 'https://api.usaspending.gov/api/v2/recipient/children/JSQTW5L2SSM1/'
```

Returns array of every child `-C` under that parent, each with its own `recipient_id`, `uei`, `state_province`, and `amount`. Real response:

```json
[
  {"recipient_id":"d7df489c-...-C","name":"LOCKHEED MARTIN CORPORATION",
   "duns":"848028494","uei":"CWM4UN76ZQW8","amount":726143387.65,"state_province":"NJ"},
  {"recipient_id":"3f24e8a2-...-C","name":"LOCKHEED MARTIN SIPPICAN, INC.",
   "duns":"032046666","uei":"YS2TNLEU8EK3","amount":0,"state_province":"NY"}
]
```

Returns `404 {"detail":"Recipient is not listed as a parent: 'G4KDGE4JFFK7'."}` if the UEI is a child UEI. So this endpoint works **only** for parent UEIs.

**Recommended UEI → hash flow for our enrichment job**:
1. `POST /recipient/` with `keyword: "<company_name>"`, `sort: "amount"`, `limit: 50`.
2. Filter results client-side by exact `uei` match.
3. If 0 matches, fall back to `recipient_search_text` filter in `spending_by_award` (which is what we do today).

---

## 3. Award timeline / by-year aggregates

### `POST /api/v2/search/spending_over_time/`

This is the canonical "show me this contractor's spending by year" endpoint.

```bash
curl -X POST 'https://api.usaspending.gov/api/v2/search/spending_over_time/' \
  -H 'Content-Type: application/json' \
  -d '{
    "group": "fiscal_year",
    "filters": {
      "recipient_id": "6cf5fb1b-4988-d087-5dc1-70939d8fc6c4-C",
      "time_period": [{"start_date":"2020-10-01","end_date":"2025-09-30"}],
      "award_type_codes": ["A","B","C","D"]
    }
  }'
```

**`group`** accepts: `fiscal_year` | `quarter` | `month`.
**`award_type_codes`**: `["A","B","C","D"]` = procurement contracts only. Use `["02","03","04","05"]` for grants. Use all 12 codes for "everything".

Real response for Lockheed `-C` (FY21–FY25):

```json
{
  "group": "fiscal_year",
  "results": [
    {"aggregated_amount": 10552503788.64, "time_period": {"fiscal_year":"2021"},
     "Contract_Obligations": 10552503788.64, "total_outlays": null},
    {"aggregated_amount": 17045434315.61, "time_period": {"fiscal_year":"2022"},
     "Contract_Obligations": 17045434315.61},
    {"aggregated_amount": 32453242236.61, "time_period": {"fiscal_year":"2023"}},
    {"aggregated_amount": 14364263254.06, "time_period": {"fiscal_year":"2024"}},
    {"aggregated_amount": 34094675624.06, "time_period": {"fiscal_year":"2025"}}
  ],
  "spending_level": "transactions",
  "messages": [
    "For searches, time period start and end dates are currently limited to an earliest date of 2007-10-01...",
    "The 'subawards' field will be deprecated in the future. Set 'spending_level' to 'subawards' instead."
  ]
}
```

**Gotchas**
- `time_period` start cannot go earlier than **2007-10-01** for the search endpoints. For older data you must use bulk download (§5).
- `aggregated_amount` is obligation $, not outlay $. Outlay fields exist (`Contract_Outlays`, etc.) but currently always `null` for most recipients — USAspending is still building outlay coverage.
- Use `recipient_id` (the hash) in `filters`, NOT `recipient_search_text`, when you have the hash. It's far more accurate.

### Drill-down by agency / NAICS / state

`POST /api/v2/search/spending_by_category/{category}` — same filter shape, just swap `category`:

- `awarding_agency` — who's giving them money
- `awarding_subagency` — bureau level
- `naics` — what kind of work
- `psc` — Product/Service Code
- `recipient` — top-N recipients (see §4)
- `district` | `state_territory` | `country` — geographic breakdowns
- `cfda` — assistance programs (grants)

Real example, Lockheed by NAICS for FY24:

```bash
curl -X POST 'https://api.usaspending.gov/api/v2/search/spending_by_category/naics/' \
  -H 'Content-Type: application/json' \
  -d '{
    "category": "naics",
    "filters": {
      "recipient_id": "6cf5fb1b-4988-d087-5dc1-70939d8fc6c4-C",
      "time_period": [{"start_date":"2023-10-01","end_date":"2024-09-30"}],
      "award_type_codes": ["A","B","C","D"]
    },
    "limit": 5, "page": 1
  }'
```

```json
{
  "category": "naics", "spending_level": "transactions",
  "results": [
    {"code":"336411","name":"Aircraft Manufacturing","amount":12356985968.64},
    {"code":"541715","name":"R&D in Physical/Engineering/Life Sciences","amount":558762381.96},
    {"code":"336413","name":"Other Aircraft Parts","amount":509000941.3},
    {"code":"541330","name":"Engineering Services","amount":387123729.6},
    {"code":"334511","name":"Search/Detection/Navigation Instruments","amount":314887490.25}
  ]
}
```

By awarding agency, same filter, gives:

```json
{"results":[
  {"name":"Department of Defense","id":1173,"code":"DOD","agency_slug":"department-of-defense","amount":14357199729.58},
  {"name":"National Aeronautics and Space Administration","amount":6697817.55},
  {"name":"Department of Homeland Security","amount":365706.93}
]}
```

---

## 4. Top contractors / leaderboard

### `POST /api/v2/search/spending_by_category/recipient/`

This is the leaderboard endpoint — top-N contractors filtered by ANY combination of NAICS, agency, state, set-aside, fiscal year. **No paging through millions of awards required.**

```bash
curl -X POST 'https://api.usaspending.gov/api/v2/search/spending_by_category/recipient/' \
  -H 'Content-Type: application/json' \
  -d '{
    "category": "recipient",
    "filters": {
      "naics_codes": ["541330"],
      "time_period": [{"start_date":"2024-10-01","end_date":"2025-09-30"}],
      "award_type_codes": ["A","B","C","D"]
    },
    "limit": 10, "page": 1
  }'
```

Real top-10 engineering-services (NAICS 541330) contractors for FY25:

```json
{
  "category": "recipient", "spending_level": "transactions",
  "results": [
    {"amount":6302184384.08,"recipient_id":"d5ab5f51-...-C","name":"ELECTRIC BOAT CORPORATION","uei":"E7BEKJ4V9528"},
    {"amount":1770201991.02,"recipient_id":"ffca72e5-...-C","name":"BOOZ ALLEN HAMILTON INC","uei":"JCBMLGPE6Z71"},
    {"amount":1285669642.41,"recipient_id":"20af0683-...-C","name":"SCIENCE APPLICATIONS INTERNATIONAL CORPORATION","uei":"MMLKPW9JLX64"},
    {"amount":971129007.54,"name":"BAE SYSTEMS TECHNOLOGY SOLUTIONS & SERVICES INC.","uei":"LX3BSV6NNW58"},
    {"amount":741115287.32,"name":"CACI, INC. - FEDERAL","uei":"N3PBJAVNKF61"},
    {"amount":694134804.52,"name":"AMENTUM SERVICES, INC.","uei":"QEMLRQA7PLG4"},
    {"amount":690896036.02,"name":"TCOM, L.P.","uei":"HEZDP5MN11A3"},
    {"amount":654091950.55,"name":"GENERAL DYNAMICS INFORMATION TECHNOLOGY, INC.","uei":"SMNWM6HN79X5"},
    {"amount":634755801.45,"name":"RAYTHEON COMPANY","uei":"QF4VA87ST9F7"},
    {"amount":622404121.77,"name":"HII MISSION TECHNOLOGIES CORP","uei":"G5H7HWC4L2R5"}
  ],
  "page_metadata": {"page":1,"next":2,"hasNext":true}
}
```

The page metadata uses `hasNext` + `next` for cursor-style paging. Each page returns `limit` rows; max documented `limit` is 100.

**Useful filter combinations for our SEO use case**:
- `naics_codes` + `time_period` → top contractors in a NAICS for a year
- `place_of_performance_locations` (state objects) + `naics_codes` → "top janitorial contractors in Virginia FY25"
- `set_aside_type_codes` (`["8A"]`, `["SBA"]`, `["WOSB"]`) → top 8(a) / WOSB contractors
- `agencies` array → top contractors at a specific agency

### Other "spending by" shortcuts you don't need to compute yourself

- `POST /api/v2/award_spending/recipient/` — top recipients at a specific awarding agency for a fiscal year (legacy, lighter than `spending_by_category`, kept for backward compat).
- `GET /api/v2/recipient/state/` — array of every state/territory with total prime-award $ and award count. Use this for state landing pages.
- `GET /api/v2/recipient/state/{FIPS}/` — single-state profile (population, median income, total amount, outlays).
- `GET /api/v2/recipient/state/awards/{FIPS}/` — by-type breakdown for a state (contracts vs grants vs loans).

Real `/recipient/state/06/` (California):

```json
{
  "name": "California", "code": "CA", "fips": "06", "type": "state",
  "population": 39536653, "pop_year": 2017,
  "median_household_income": 67739.0,
  "total_prime_amount": 290986818390.89,
  "total_prime_awards": 290450,
  "total_face_value_loan_amount": 38014401819.48,
  "total_face_value_loan_prime_awards": 106375,
  "award_amount_per_capita": 7359.93,
  "total_outlays": 216838555248.44
}
```

Real `/recipient/state/awards/06/`:

```json
[
  {"type":"contracts","amount":27338083309.69,"count":131586,"total_outlays":8580453952.24},
  {"type":"direct_payments","amount":156342270882.13,"count":33706,"total_outlays":121627182063.54},
  {"type":"grants","amount":107797562374.21,"count":16185},
  {"type":"loans","amount":-752602372.79,"count":106375},
  {"type":"other_financial_assistance","amount":261504197.65,"count":2598}
]
```

These three state endpoints are pure gold for our state-level SEO pages — no paging, single JSON object, no filter logic needed.

---

## 5. Bulk download — `POST /api/v2/bulk_download/awards/`

For "year's worth of awards for all contractors matching a filter" the search endpoints will time out and only return up to 100 awards/page. Bulk download is async: you POST a request, get back a `status_url` + `file_url`, poll until status is `finished`, then download a ZIP of CSVs.

### Request

```bash
curl -X POST 'https://api.usaspending.gov/api/v2/bulk_download/awards/' \
  -H 'Content-Type: application/json' \
  -d '{
    "filters": {
      "prime_award_types": ["A","B","C","D"],
      "agencies": [{"type":"awarding","tier":"toptier","name":"National Aeronautics and Space Administration"}],
      "date_type": "action_date",
      "date_range": {"start_date":"2025-01-01","end_date":"2025-01-07"}
    },
    "file_format": "csv"
  }'
```

Real response:

```json
{
  "status_url": "https://api.usaspending.gov/api/v2/download/status?file_name=All_PrimeTransactions_2026-05-25_H23M16S10183757.zip",
  "file_name": "All_PrimeTransactions_2026-05-25_H23M16S10183757.zip",
  "file_url": "https://files.usaspending.gov/generated_downloads/All_PrimeTransactions_2026-05-25_H23M16S10183757.zip",
  "download_request": {
    "download_types": ["prime_awards"],
    "file_format": "csv",
    "filters": {
      "agencies": [{"name":"National Aeronautics and Space Administration","tier":"toptier","type":"awarding"}],
      "prime_and_sub_award_types": {"prime_awards":["A","B","C","D"]},
      "time_period": [{"date_type":"action_date","end_date":"2025-01-07","start_date":"2025-01-01"}]
    },
    "request_type": "award"
  }
}
```

### Poll status

```bash
curl 'https://api.usaspending.gov/api/v2/download/status?file_name=All_PrimeTransactions_2026-05-25_H23M16S10183757.zip'
```

Real response (took 5 seconds for one week of NASA contracts = 180 rows):

```json
{
  "status": "finished",
  "file_name": "All_PrimeTransactions_2026-05-25_H23M16S10183757.zip",
  "file_url": "https://files.usaspending.gov/generated_downloads/All_PrimeTransactions_2026-05-25_H23M16S10183757.zip",
  "total_size": 75.094,
  "total_columns": 297,
  "total_rows": 180,
  "seconds_elapsed": "5.2291"
}
```

`status` values: `ready` (queued) → `running` → `finished` | `failed`.
`total_size` is in MB. A full fiscal year for a top-10 agency runs 200-500 MB and 30-60 seconds.

### Filter shape

| Key | Required | Example |
|---|---|---|
| `prime_award_types` | yes | `["A","B","C","D","IDV_A","02","03","04","05","06","07","08","09","10","11"]` |
| `sub_award_types` | optional | `["procurement","grant"]` — adds a subawards CSV to the ZIP |
| `agencies` | yes | `[{"type":"awarding","tier":"toptier","name":"..."}]` |
| `date_type` | yes | `"action_date"` or `"last_modified_date"` |
| `date_range` | yes | `{"start_date":"2024-10-01","end_date":"2025-09-30"}` |
| `place_of_performance_locations` | optional | `[{"country":"USA","state":"VA"}]` |
| `place_of_performance_scope` | optional | `"domestic"` or `"foreign"` |
| `recipient_locations` | optional | `[{"country":"USA","state":"VA"}]` |
| `recipient_scope` | optional | `"domestic"` or `"foreign"` |
| `keyword` | optional | free-text search across award text |
| `file_format` (top-level) | optional | `"csv"` (default) | `"tsv"` | `"pstxt"` |

**For NAICS / set-aside filtering you cannot use bulk_download/awards** — those filters aren't supported here. Use `POST /api/v2/download/search/` instead (same async pattern, accepts full search-filter shape including `naics_codes`, `set_aside_type_codes`).

### Bulk-download retention

`file_url` files live at `files.usaspending.gov` for several days (USAspending doesn't publish exact TTL, but anecdotally ~7 days). Re-issue the request if expired.

---

## 6. Rate limits

USAspending **does not publish rate limits anywhere in their public docs** (we checked `/docs/using-the-api`, the GitHub README, and the openapi contracts). Empirical findings from testing:

- No `X-RateLimit-Limit` / `X-RateLimit-Remaining` / `Retry-After` headers are returned on any endpoint (verified with `-I` HEAD calls and rapid GET sequences).
- 5 back-to-back calls to `/recipient/state/06/` returned 200s with ~600ms latency each, no throttling.
- `Cache-Trace: hit-cache` header indicates Akamai/Fastly-style caching for the read-heavy GET endpoints — repeated identical requests are cheap.
- The big bulk-download endpoint enforces concurrency limits informally (you'll get queued behind other users; `status` will sit at `running` longer at peak).

**Recommended client-side throttling for our crons** (since they don't tell us):
- 5 requests/second sustained on search endpoints (we burst higher in practice without issue).
- 1 request every 10 seconds when polling `download/status`.
- Implement exponential backoff on any `5xx` or `429` (we have never seen a `429` from this API, but treat it as advisory).
- Send `User-Agent: capturepilot.com bot (contact: info@fillcart.de)` so they can identify us if they need to.

---

## 7. Subaward / pass-through data

Subawards = the secondary recipients (often state/local governments, universities, small businesses) that prime contractors flow money to. **This is the data we need for our state-local SEO pages.**

### 7a. `POST /api/v2/search/spending_by_award/` with `spending_level: "subawards"`

```bash
curl -X POST 'https://api.usaspending.gov/api/v2/search/spending_by_award/' \
  -H 'Content-Type: application/json' \
  -d '{
    "spending_level": "subawards",
    "filters": {
      "recipient_search_text": ["LOCKHEED MARTIN CORPORATION"],
      "time_period": [{"start_date":"2024-10-01","end_date":"2025-09-30"}],
      "award_type_codes": ["A","B","C","D"]
    },
    "fields": ["Sub-Award ID","Sub-Awardee Name","Sub-Award Amount","Sub-Award Date","Prime Award ID"],
    "limit": 3, "page": 1
  }'
```

Real response:

```json
{
  "spending_level": "subawards", "limit": 3,
  "results": [
    {"internal_id":"SR20250626","prime_award_internal_id":298269108,
     "Sub-Award ID":"SR20250626",
     "Sub-Awardee Name":"LOCKHEED MARTIN CORPORATION",
     "Sub-Award Amount":160481.0,"Sub-Award Date":"2025-03-31",
     "Prime Award ID":"FA521524C0003",
     "prime_award_generated_internal_id":"CONT_AWD_FA521524C0003_9700_-NONE-_-NONE-"}
  ],
  "page_metadata": {"page":1,"hasNext":true,"last_record_unique_id":"298269108","last_record_sort_value":"SR20250607"}
}
```

**Important caveat we found in testing**: the search endpoint **silently ignores `recipient_id` when `spending_level` is `subawards`**. Use `recipient_search_text` (an array of name strings) instead, or use the unfiltered subaward endpoint:

### 7b. `POST /api/v2/subawards/` — all subawards under a prime award

```bash
curl 'https://api.usaspending.gov/api/v2/awards/count/subaward/CONT_AWD_75S20324F42002_7522_75S20322D00024_7522/'
# → {"subawards": 5}
```

Get the subaward count for a prime award, then list them via `POST /api/v2/subawards/` with the `award_id` filter. Use this when you already have a prime award and want its subawards.

### 7c. Subawards in bulk download

Include `"sub_award_types": ["procurement","grant"]` in the bulk-download filter block (§5) and the ZIP gets an additional `..._Subawards_...csv` file. This is the right approach for our "all subawards in NAICS X across FY25" SEO ingestion job.

---

## 8. Recommended call sequence — enrich a single contractor with EVERYTHING

Given a UEI (e.g. `G4KDGE4JFFK7`):

```
1. POST /recipient/                              keyword=<company_name>, sort=amount, limit=50
   → array of candidate hashes; filter client-side by uei == "G4KDGE4JFFK7"
   → store recipient_id, parent_id, parent_uei

2. GET  /recipient/{recipient_id}/               (the -C hash)
   → lifetime totals, business_types, alternate_names, location, parent linkage

3. (optional, only if parent_id present)
   GET /recipient/{parent_id}/                   (the -P hash)
   → parent-level rollup

4. (optional, only if -P)
   GET /recipient/children/{parent_uei}/         (parent UEI as path param)
   → array of every -C subsidiary with state + amount

5. POST /search/spending_over_time/              filters.recipient_id=<hash>, group=fiscal_year, time_period=2007-10-01..today
   → annual revenue chart

6. POST /search/spending_by_category/awarding_agency/   same filter shape
   → agency mix pie chart

7. POST /search/spending_by_category/naics/      same filter shape
   → NAICS mix; tells you what they actually do

8. POST /search/spending_by_category/psc/        same filter shape
   → PSC mix; finer-grained than NAICS for contracts

9. POST /search/spending_by_award/               filters.recipient_id=<hash>, limit=100
   → top 100 individual awards for the contractor card

10. POST /search/spending_by_award/              spending_level=subawards, recipient_search_text=[<name>], limit=100
    → top subawards they distributed (only meaningful for primes)
```

**Total calls per contractor**: 8-10 sequential. At 5 RPS that's ~2 seconds per contractor. For our 80K-contractor `contractors` table, batch in parallel workers — 10 concurrent workers gives ~4-5 hours for a full refresh. Stagger across days using `last_modified_date`-style incremental crawls instead of full re-pulls.

**Cache strategy**: lifetime totals change daily (USAspending refreshes nightly). Refresh contractor profiles every 24-72 hours; never more often than 24h since the underlying data only updates once per day.

---

## 9. Recommended call sequence — SEO use case (top-N contractors with award history)

For an SEO page like "Top 50 Janitorial Contractors in Virginia FY25":

```
1. POST /search/spending_by_category/recipient/
   filters: {
     naics_codes: ["561720"],
     place_of_performance_locations: [{"country":"USA","state":"VA"}],
     time_period: [{"start_date":"2024-10-01","end_date":"2025-09-30"}],
     award_type_codes: ["A","B","C","D"]
   }
   limit: 50
   → 50 recipient hashes + names + UEIs + total amounts (one call!)

2. For each of the 50 (parallelize): GET /recipient/{hash}/
   → location, business_types, parent info, alternate_names

3. For each (parallelize): POST /search/spending_over_time/
   filters: {recipient_id: <hash>, time_period: [<last 5 FYs>]}
   group: "fiscal_year"
   → 5-year revenue spark line per contractor
```

**Total**: 1 + 50 + 50 = 101 calls per SEO page. Page generation: ~30 seconds at 5 RPS, or 5 seconds with 10-way parallelism. Cache the resulting page for 7 days minimum (data only updates daily anyway).

For state landing pages without a NAICS filter:

```
GET /recipient/state/{FIPS}/                 → state-level totals + demographics
GET /recipient/state/awards/{FIPS}/          → contracts vs grants vs loans
POST /search/spending_by_category/recipient/ filters.place_of_performance_locations=[{state}], limit=100
POST /search/spending_by_category/awarding_agency/ same → top agencies giving money to that state
POST /search/spending_by_category/naics/ same → top NAICS in that state
```

5 calls = full state SEO landing page.

---

## 10. Endpoint cheat-sheet

| Endpoint | Method | Use case | Auth |
|---|---|---|---|
| `/recipient/{hash}/` | GET | Lifetime totals for one contractor | none |
| `/recipient/` | POST | UEI → hash lookup (via keyword + client filter) | none |
| `/autocomplete/recipient/` | POST | Typeahead (no UEI returned) | none |
| `/recipient/children/{uei}/` | GET | List all -C subsidiaries of a parent UEI | none |
| `/recipient/state/` | GET | List all states with totals | none |
| `/recipient/state/{FIPS}/` | GET | One state's totals + demographics | none |
| `/recipient/state/awards/{FIPS}/` | GET | One state's award-type breakdown | none |
| `/search/spending_over_time/` | POST | Yearly/quarterly/monthly time series | none |
| `/search/spending_by_category/recipient/` | POST | **Top-N leaderboard** | none |
| `/search/spending_by_category/naics/` | POST | NAICS mix for any filter | none |
| `/search/spending_by_category/awarding_agency/` | POST | Agency mix for any filter | none |
| `/search/spending_by_category/psc/` | POST | PSC mix for any filter | none |
| `/search/spending_by_award/` | POST | Individual awards or subawards (100/page) | none |
| `/awards/count/subaward/{award_id}/` | GET | Count subawards under a prime | none |
| `/subawards/` | POST | List subawards of a prime | none |
| `/bulk_download/awards/` | POST | Async CSV ZIP of awards | none |
| `/download/search/` | POST | Async CSV ZIP w/ full search-filter shape (NAICS, set-asides) | none |
| `/download/status` | GET | Poll bulk-download progress | none |

**None of these require an API key.** Compare to SAM.gov where everything needs `X-Api-Key` — USAspending is fully open. Just be a good citizen: send a `User-Agent`, throttle to ~5 RPS, cache aggressively (data only refreshes nightly).

---

## 11. Migration notes for our current code

Our current pattern:

```ts
POST /api/v2/search/spending_by_award/
  filters: { recipient_search_text: [UEI], ... }
  limit: 100
```

…returns up to 100 awards per contractor — fine for "recent awards" but **misses lifetime totals**. Replacement:

1. Add a `usaspending_recipient_hash` column to `contractors` (one-time backfill via §2).
2. Schedule a cron that calls `GET /recipient/{hash}/` for each contractor weekly. Stores `total_transaction_amount`, `total_transactions`, `alternate_names`, `business_types`, parent linkage.
3. Keep our existing `spending_by_award` call but switch the filter from `recipient_search_text` (fuzzy, returns dupes) to `recipient_id` (exact, fast).

Net effect: lifetime $ on every contractor profile + accurate award lists + parent rollups. Migration risk is low — both new and old endpoints are public, free, and stable.
