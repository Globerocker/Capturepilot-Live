# LA RAMP (rampla.org) — Source Analysis

**Investigated**: 2026-05-25
**Source**: Socrata `hf3r-utnq` on `data.lacity.org` (LA Procurement Opportunities)
**Detail page host**: `https://www.rampla.org/s/opportunity-details?id=<sfId>`
**Underlying platform**: Salesforce **Experience Cloud** (formerly Community Cloud), Aura framework

---

## TL;DR

- Plain HTTP `GET` on the detail page returns a 371 KB Aura SPA shell with **zero opportunity content** — full client-side hydration.
- Salesforce exposes anonymous guest read via `POST /s/sfsites/aura` (the standard Aura action endpoint), no auth token needed.
- Three calls cover ~95% of what's visible on the detail page (~1.7 req/s sustained, no observed throttling, parallelizable):
  1. `serviceComponent://ui.force.components.controllers.detail.DetailController/ACTION$getRecord` — full Opportunity record w/ Account, ~40 fields
  2. `aura://ApexActionController/ACTION$execute` → `CompanyProfileController.getContentDocuments({recordId})` — attached files (ID, Title, FileType, ContentSize)
  3. `aura://ApexActionController/ACTION$execute` → `CompanyProfileController.getCompanyDetailsWithId({accountId})` — full agency profile (address, type)
- **Attachments download via**: `https://www.rampla.org/sfc/servlet.shepherd/document/download/<069...ContentDocumentId>` — verified, returns the real PDF/ZIP with correct Content-Type.
- **No SEO list of opportunity URLs** in sitemap.xml. Must enumerate via the Socrata dataset (which carries the SF Id in `url.url`).
- **Recommended ingestion**: per-Socrata-row enrichment with 1–2 batched Aura calls per opportunity → no Playwright needed for the data we want.
- **Playwright only needed if** we ever want the lazy-loaded line items / Bid Q&A / contact roles (gated behind authenticated planholder, not guest).

---

## URLs sampled

| Purpose | URL | Result |
|---|---|---|
| robots.txt at root | `https://www.rampla.org/robots.txt` | 401 → redirects to Salesforce login. Not the real robots. |
| Sitemap index | `https://www.rampla.org/s/sitemap.xml` | 200, XML index pointing to 2 child sitemaps |
| Sitemap (page list) | `https://www.rampla.org/s/sitemap-view-1.xml` | 200, lists **only the ~35 static route pages** (e.g. `/s/opportunities`, `/s/opportunity-details`, `/s/announcements`). **No per-record URLs.** |
| Sitemap (listview) | `https://www.rampla.org/s/sitemap-listview-1.xml` | 200, single entry: `/s/recordlist/Opportunity/00B6g00000DZHqOEAX` (list view ID, gated when accessed) |
| Opportunities landing | `https://www.rampla.org/s/opportunities` | 200, 153 KB HTML, **JS-only content** (loading spinner only in initial paint) |
| Announcements landing | `https://www.rampla.org/s/announcements` | 200, 153 KB HTML, same SPA shell |
| Opportunity detail #1 | `https://www.rampla.org/s/opportunity-details?id=006Ql00000fCBmTIAW` (SYLMAR RC- BLEACHERS, General Services) | 200, 371 KB HTML — shell only |
| Opportunity detail #2 | `https://www.rampla.org/s/opportunity-details?id=006Ql00000f8WW9IAM` (LADWP Fall Protection) | 200 — shell |
| Opportunity detail #3 | `https://www.rampla.org/s/opportunity-details?id=006Ql00000eXWZzIAO` (BPW Avalon Blvd construction RFB, 6 attachments) | 200 — shell |
| Opportunity detail #4 | `https://www.rampla.org/s/opportunity-details?id=006Ql00000aWq5CIAS` (DCA Graphic Design PQS) | 200 — shell |
| Opportunity detail #5 | `https://www.rampla.org/s/opportunity-details?id=006Ql00000WdO1dIAF` (LAPL AV Services RFP) | 200 — shell |
| Procurement Announcement detail | `https://www.rampla.org/s/procurement-announcement-details?id=a1NQl000003cCsrMAE` (Pure Water LA Phase 1A) | 200 — shell |
| Aura action endpoint | `POST https://www.rampla.org/s/sfsites/aura?r=<n>` | 200 — JSON, the actual data path |

All sampled IDs verified accessible anonymously (no cookies beyond the auto-issued `CookieConsentPolicy` + `renderCtx`).

---

## Page hydration mechanism

**Salesforce Experience Cloud (Aura framework + LWC interop)**. Identifying markers in the response:

- `Server: sfdcedge`
- `Set-Cookie: renderCtx=…pageId%22%3A%225619d1bb-1f31-4611-a256-75689ef34407…`
- Preload-link to `aura_prod.js`, `bootstrap.js`, `resources.js`, `app.js` under `/s/sfsites/...`
- Inline `<script>window.Aura = {…}</script>` and `auraConfig = {…}`
- Tenant: `00D6g000008Ltrv` (Salesforce org)
- Community/Network: `0DM6g000000a08E`
- Lightning host (file domain): `lacity.lightning.force.com`, `lacity.file.force.com`, `lacity.my.salesforce.com`

The initial HTML is **a 371 KB SPA shell**: meta tags, CSP, link preloads, and one `<div id="auraAppRoot">`. There is **no SSR** of opportunity content — `grep -c 'opportunity\|description\|deadline' /tmp/rampla_detail.html` returns 0 inside the rendered body.

The `bootstrap.js` (662 KB, fetched from `/s/sfsites/l/<context>/bootstrap.js`) contains the **full Apex action descriptor registry** for the app shell. Page-specific components are lazy-loaded by route. The `app.js` (4.6 MB) contains the LWC bundle.

**Aura context for guest** (extracted, valid for all calls in this doc):
- `fwuid` = `ZkJhOVpLN2NZQkJrd2NWd3pMcnFOdzJEa1N5enhOU3R5QWl2VzNveFZTbGcxMy4tMjE0NzQ4MzY0OC4xMzEwNzIwMA`
- `app` = `siteforce:communityApp`
- `loaded["APPLICATION@markup://siteforce:communityApp"]` = `1547_6p-2GBd9IQWZ4UXs1Im3BQ`
- `aura.token` = `undefined` (literal string — guest user requires no real CSRF token on this site)

Both `fwuid` and `loaded` hash rotate when Salesforce redeploys the org (~every few weeks). They are easy to re-extract from the page HTML: a single GET of any `/s/*` route, then `grep 'fwuid'` + `grep '"APPLICATION@markup://siteforce:communityApp"'`.

---

## Anonymous-readable JSON endpoints

Yes — **`POST /s/sfsites/aura?r=<n>`** with form-encoded body. Supports **batched actions** (multiple action descriptors in one `message`, all results returned together).

### Required body params

```
message     = {"actions":[ <action descriptor list> ]}
aura.context = {"mode":"PROD","fwuid":"<fwuid>","app":"siteforce:communityApp","loaded":{"APPLICATION@markup://siteforce:communityApp":"<loaded>"},"dn":[],"globals":{},"uad":false}
aura.pageURI = /s/opportunity-details?id=<sfId>     (or any matching public route)
aura.token   = undefined
```

Each action is `{"id":"1;a","descriptor":"<descriptor>","callingDescriptor":"UNKNOWN","params":{…}}`.

### Verified-working action descriptors (guest user)

| Descriptor | Purpose | Verified for |
|---|---|---|
| `serviceComponent://ui.force.components.controllers.detail.DetailController/ACTION$getRecord` | Full record w/ layout fields + nested Account/CreatedBy | Opportunity (`006Ql...`), Procurement_Announcement__c (`a1NQl...`) |
| `aura://RecordUiController/ACTION$getRecordWithFields` | LDS-style field-explicit fetch with dotted lookups (`Account.Name`) | Opportunity |
| `aura://RecordUiController/ACTION$getObjectInfo` | Full schema for an SObject (fields, recordTypes, childRelationships) | Opportunity, Procurement_Announcement__c, ContentDocument, ContentVersion, Account, BIP__c, NAICS_Opportunity__c |
| `aura://ApexActionController/ACTION$execute` → `CompanyProfileController.getContentDocuments({recordId})` | Attached files (id, title, type, size) on ANY parent record | Opportunity, Procurement_Announcement__c |
| `aura://ApexActionController/ACTION$execute` → `CompanyProfileController.getCompanyDetailsWithId({accountId})` | Agency profile (name, type, billing address, certs) | Account `0016g00001cBi51AAC` (General Services) |
| `aura://ApexActionController/ACTION$execute` → `CompanyProfileController.getOwnedAnnouncements({})` | List of active/expired Procurement_Announcements (only 3 returned to guest — looks like featured set, not complete) | Listing |

### Blocked (returns `actions: []` or "No apex action available")

- `serviceComponent://ui.force.components.controllers.relatedListContainer.RelatedListContainerController/*`
- `serviceComponent://ui.force.components.controllers.relatedList.RelatedListController/*`
- `serviceComponent://ui.force.components.controllers.lookup.LookupController/*`
- `serviceComponent://ui.force.components.controllers.lists.*ListView*Controller/*`
- `aura://RecordUiController/getRecords`, `getRecordUi`, `getLookupRecords`
- `DL_GenericUtilityController.*` (returns `"You do not have access to the Apex class named 'DL_GenericUtilityController'."`)
- `DL_KreatorComponentController.*` (no methods discovered)
- Most listing methods on `CompanyProfileController` (`getRelatedOpportunities`, `getOutreach`, `getContact`) return `SUCCESS` with empty array `[]` — they exist for guest but require an authenticated session to return rows.

---

## Field-to-extractor mapping (Opportunity)

From `DetailController.getRecord` on `006Ql...` IDs — same 40-field set regardless of agency or RecordType. The `__f` suffix is "formatted display", `__l` is "label" (usually same as `__f`). Use the bare field for raw values.

| Logical field | Salesforce path | Type | Notes |
|---|---|---|---|
| RAMP record id | `Id` | string | 18-char SF id (e.g. `006Ql00000fCBmTIAW`) |
| Title | `Name` | string | Often includes the RFP number prefix |
| Description / scope | `Description` | textarea | **Most-important free-text field.** 1–4 paragraphs typical. Some opps just point to external portals (LADWP eRSP, LACounty BAI). |
| Solicitation type | `Type` | string | `RFP - Request For Proposal`, `IFB - Invitation for Bid`, `RFQ - Request for Quote`, `RFB - Request For Bid`, `RFI - Request for Information`, `PQS - Prequalified Solicitation` |
| Category | `Category__c` | picklist | `Commodity`, `Construction`, `Personal Services`, `None` |
| Stage | `StageName` | picklist | `Open`, `Closed Won`, `Closed Lost`, etc. (typically `Open` for active) |
| Probability | `Probability` | number | Usually 50 for Open. Internal sales metric, ignore. |
| Amount (estimated) | `Amount` | currency | Often 0 — not the contract value most of the time |
| Posted date | `CreatedDate` | datetime ISO | When the opp was created in RAMP |
| Modified date | `LastModifiedDate` / `SystemModstamp` | datetime ISO | Use for incremental sync |
| Bid due date+time (UTC) | `Bid_Due__c` | datetime ISO | **Authoritative deadline.** `Bid_DT_UTC__c` is the same value (custom mirror). |
| Bid due time (LA local) | `Bid_Due_Time__c` | time | e.g. `11:00:00.000Z` (UTC, but represents LA local — yes, Salesforce stores it as UTC even though it's wall-clock LA) |
| Display close date | `CloseDate` | date | Matches Bid_Due__c calendar date |
| Agency / department | `Account.Name` | string (nested) | E.g. `General Services`, `Water & Power`, `Cultural Affairs`, `LAUSD`, `Los Angeles County`, `Engineering Bureau, Public Works`, `Library, Los Angeles Public`, `Airports, Los Angeles World` |
| Agency id | `AccountId` | string | Fetch full profile via `CompanyProfileController.getCompanyDetailsWithId` |
| Record type id | `RecordTypeId` | string | `0126g0000008CpNAAU` = "RFP, RFQ, RFI, RFB, TOS, Sole Source" (the common one across all 9 sampled opps). Other types exist (`Sole Source`, `TOS`) but rare. |
| Posted by | `CreatedBy.Name` | string | Buyer name (e.g. "FMS Service", "Larry Goldberg"). Real-person fields not present for guest. |

**Fields NOT returned for guest** (visible in `getObjectInfo` but not in `getRecord` layout): `Budget_Confirmed__c`, `Discovery_Completed__c`, `Loss_Reason__c`, `ROI_Analysis_Completed__c`, `OwnerId`, `LeadSource`, `ForecastCategoryName`, plus all field history. These are internal-only.

### Sample payload (verbatim, BPW Avalon Blvd opp `006Ql00000eXWZzIAO`)

```
Name:          Avalon Boulevard Improvements 56th Street to Manchester Avenue (Complete Streets Program)
Type:          RFB - Request For Bid
StageName:     Open
Category__c:   Construction
RecordTypeId:  0126g0000008CpNAAU
Account.Name:  Engineering Bureau, Public Works
Bid_Due__c:    2026-06-12T19:00:00.000Z
Description:   This street project consists of reconstructing and repairing damaged street pavement,
               sidewalk, curb ramps, curbs and gutters, installation of bus pads, bus islands, and raised
               bike lanes. The project will also include vision zero and green elements...
               ● See bid package for full scope & details
               ●● Bid package only on RAMPLA- download it to be a planholder
               ● For planholders lists & bid results visit: http://engineering.laci...
```

---

## Field-to-extractor mapping (Procurement_Announcement__c — sources-sought / pre-solicitation)

Separate object at `/s/procurement-announcement-details?id=<a1NQl...>`. **31 fields total, 19 custom.** Schema is richer than Opportunity for early-look info.

| Field | Type | Notes |
|---|---|---|
| `Name` | string | Project name |
| `Announcement_ID__c` | string | RAMP internal ID (e.g. `PA-00078`) |
| `RFP_Number__c` | text | Buyer's internal RFP number |
| `Stage__c` | picklist | `Posted`, `Expired`, `Draft` |
| `Description__c` | textarea | **Rich-text description** (often longer than Opportunity.Description) |
| `Category__c` | picklist | Same domain as Opportunity.Category__c |
| `NAICS__c` | multipicklist | **NAICS tags** — directly usable for scoring |
| `Certifications__c` | multipicklist | **Set-aside flags** (DVBE/SBE/MBE/etc.) |
| `Announcement_Date__c` | datetime | When the announcement was published |
| `Anticipated_Opportunity_Post_Date__c` | datetime | **Early-warning date** — when RAMP expects the live solicitation |
| `Bid_Due__c` / `Bid_Due_Time__c` | datetime/time | If known |
| `CloseDate__c` | date | Announcement close (not bid close) |
| `Amount__c` | currency | Estimated budget |
| `Display_Budget_Online__c` | bool | If true, Amount is public |
| `Account__c` / `Account__r.Name` | reference | Issuing agency |
| `Opportunity__c` | reference | **FK to Opportunity record when the announcement becomes a live solicitation** — primary join key |
| `Active__c`, `Published__c`, `Partner__c` | boolean | Status flags |

Verified payload (Pure Water LA Phase 1A, `a1NQl000003cCsrMAE`): `Description__c` is a ~2 KB block of project rationale, `Announcement_ID__c=PA-00078`, `Category__c=Construction`, 1 attached PDF (1.2 MB notification statement).

**Procurement_Announcement__c is sources-sought-equivalent.** When a buyer flips an announcement live, `Opportunity__c` populates and the regular Opportunity workflow takes over. This object is the closest analogue to SAM.gov's `Sources Sought` notice type — same early-look value.

---

## Attachments

### Listing files for a record

```
POST /s/sfsites/aura?r=<n>
message = {"actions":[{"id":"1;a","descriptor":"aura://ApexActionController/ACTION$execute","callingDescriptor":"UNKNOWN","params":{"namespace":"","classname":"CompanyProfileController","method":"getContentDocuments","params":{"recordId":"<parentId>"},"cacheable":false,"isContinuation":false}}]}
```

Returns array of:

```json
{
  "Id":          "069Ql00000qAeG1IAK",         // 18-char ContentDocumentId
  "Title":       "E1908427_info",
  "FileType":    "PDF",                         // or ZIP, DOCX, XLSX, etc.
  "ContentSize": 135995,                        // bytes
  "ContentModifiedDate": "2026-05-13T22:01:42.000Z",
  "PublishStatus": "P"                          // P = Published (visible to community)
}
```

Works for **any parent record id** — Opportunity, Procurement_Announcement__c. The Apex method is `CompanyProfileController.getContentDocuments(String recordId)`. It does a SOQL on `ContentDocumentLink` filtered by `LinkedEntityId = :recordId`. Guest user has read access via the community profile's sharing rules.

### Downloading a file

```
GET https://www.rampla.org/sfc/servlet.shepherd/document/download/<ContentDocumentId>
```

**Verified for `069Ql00000qAeG1IAK` (135 KB PDF)** — returns 200 with `Content-Type: application/pdf; charset=UTF-8` and the actual document bytes. `pdftotext` extracted "Avalon Boulevard Improvements... NOTICE TO BIDDERS... CONTRACTOR'S LICENSE CLASSIFICATION: A..." successfully.

**Gotchas**:
- `/s/sfc/servlet.shepherd/document/download/<id>` (note the `/s/` prefix) → 404 HTML. Drop the `/s/`.
- `/sfc/servlet.shepherd/version/download/<id>` → 200 with empty JSON `{}` — that path expects a ContentVersionId (068...), not a ContentDocumentId (069...). We don't have direct ContentVersion ids without an authenticated session, but the document URL is what the community UI also uses.
- Files can be large: the BPW Avalon opp has 5 ZIPs of 31–75 MB each + a 135 KB info PDF (total ~243 MB across 6 docs). Plan storage accordingly.
- Public-only files (`PublishStatus = "P"`) come down clean. Drafts (`"R"`) would 403, but we never see those in the listing.

---

## Recommended ingestion strategy

The cleanest approach is **per-Socrata-row enrichment**, NOT a full crawl of `rampla.org`. Reasoning:

1. **Socrata `hf3r-utnq` is already the canonical index.** It includes the SF Opportunity Id in `url.url`, the title, agency, type, category, post date, close date. Pulling it covers row discovery — no Salesforce search call needed (which is gated anyway).
2. Each new/updated Socrata row triggers **1–2 batched Aura calls** to enrich:
   - **Call A** (single batched POST): `DetailController.getRecord` + `CompanyProfileController.getContentDocuments` → adds `Description`, `Bid_Due__c` (exact UTC), `Amount`, `RecordTypeId`, `AccountId`, attachment list.
   - **Call B** (optional, async): for each attachment with `FileType in (PDF, DOCX, XLSX, TXT)` and `ContentSize < some-cap (e.g. 25 MB)`, GET `/sfc/servlet.shepherd/document/download/<id>` and store in our existing `opportunity-attachments` bucket. ZIPs and >25 MB files defer to background.
3. Procurement_Announcement__c records (`a1NQl...` ids) are a separate ingest pipeline if/when we add a "RAMP Sources Sought" feed. Use a similar Aura `getRecord` + `getContentDocuments` pattern. Discovery of new announcements would require a Playwright pass on `/s/announcements` (or polling `CompanyProfileController.getOwnedAnnouncements` which gives 3 records — possibly the "featured" set).

### Cron-friendly pseudo-flow

```text
cron rampla_ingest (every 6h):
  rows = socrata.query("hf3r-utnq", $where = "closedate >= now()", limit=1000)
  upsert into opportunities (rampid, title, ..., status='ACTIVE')
  for each new/changed row:
    enqueue rampla_enrich_one(opp_id, sf_id)

job rampla_enrich_one(opp_id, sf_id):
  aura_context = ensure_context_cached()      # 24-hour cache, re-extract from page if 500s
  res = aura_batch_post(sf_id, [
    DetailController.getRecord(sf_id, FULL, VIEW),
    CompanyProfileController.getContentDocuments(sf_id),
  ])
  patch opportunities set
    description = res[0].record.Description,
    bid_due_at = res[0].record.Bid_Due__c,
    amount = res[0].record.Amount,
    account_id = res[0].record.AccountId,
    record_type_id = res[0].record.RecordTypeId,
    attachments_count = len(res[1])
  for each doc in res[1] where doc.FileType in WHITELIST and doc.ContentSize < CAP:
    file_bytes = curl /sfc/servlet.shepherd/document/download/<doc.Id>
    storage.upload("opportunity-attachments/rampla/<doc.Id>.<ext>", file_bytes)
    insert into opportunity_attachments (opp_id, content_document_id, title, file_type, size, storage_url)
```

### Why NOT Playwright

- Aura POST is **5–10× cheaper** in CPU/time than spinning up Chromium per opp.
- Salesforce Communities sometimes deliver SSR HTML for SEO — **this one does not**. Confirmed by inspecting all sampled pages: zero opportunity content in initial HTML.
- The only data we'd gain from Playwright is the **related-list rows** (Bid Q&A, line items, OpportunityContactRoles) which are gated for guest in both paths anyway.

### When to fall back to Playwright

Only if/when we add use-cases that need authenticated-planholder data: pre-bid Q&A threads, addenda notifications, line items, evaluation criteria documents stored as ContentNotes (not files). That would require an authenticated RAMP account and a Playwright session — out of scope for the current Socrata-fed pipeline.

---

## Rate-limit caveats

Tested behavior (single source IP, no special headers):

- **15 sequential calls in 9 s** → 100% success (1.7 req/s observed).
- **20 parallel calls in 1 s** → 100% success.
- No `429`, no Retry-After header, no IP block on the test run.

Salesforce community guest users share the org's **API rate-limit pool** with the entire community (defaults: 15,000 API calls / 24h for orgs ≤ 1 M licenses, but Experience Cloud sites have separate "Guest User" entitlements — typically higher in production). Empirically we never tripped a limit.

### Production guardrails

- **Cap per-cron budget**: ~5,000 enrichment calls / hour (i.e. ≤ 1.4 req/s sustained) leaves ample headroom for the org's other consumers.
- **Batch actions**: combine `getRecord` + `getContentDocuments` in a single POST. Cuts request count in half.
- **Respect `Cache-Control` semantics**: `LastModifiedDate` / `SystemModstamp` from `getRecord` is precise enough for skip-if-unchanged logic. Most opportunities don't change after post; addenda changes the timestamp.
- **Rotate the `aura.context` cache** when the response starts returning the literal string `"fwuid is invalid"` or actions disappear silently (`actions: []`). Re-fetch any `/s/*` page, re-extract `fwuid` + `loaded` hash from the inline `<script>auraConfig = {…}`.
- **Don't share cookies across machines** — `renderCtx` is bound to the page-render context and is cheap to regenerate per session.
- **Be a polite citizen**: identify the crawler in `User-Agent` (`CapturePilot/1.0 (+https://capturepilot.com)`) so LA's SOC can reach out instead of blocking.

---

## Open / nice-to-have

- **Listing-page enumeration**: still no anonymous "list all open opportunities" endpoint. Discovery currently relies on Socrata. If Socrata ever lags, fallback options: scrape `/s/opportunities` via Playwright (Aura action descriptors used by that page can be sniffed once and replayed), or build a guest-readable SOQL proxy by experimenting with `aura://ApexActionController.search` variants we haven't tried.
- **Bid Q&A**: visible on the live page for planholders only; not exposed to guest. Would require auth.
- **Line items**: `OpportunityLineItem` object schema is queryable for guest (`getObjectInfo` works) but `getRecord` on a specific line item id requires the related-list-blocked path — confirmed not reachable.
- **Contact info (program manager)**: `CompanyProfileController.getContact({contactId})` errors with `"List has no rows for assignment to SObject"` regardless of input — buyer contact fields are not exposed to guest. The PDF info documents typically include a phone+email, so PDF text extraction is the practical workaround.
- **Procurement_Announcement listing**: `getOwnedAnnouncements` returned 3 records (1 live, 2 expired test PAs). Need to determine if that's the full active set or a featured-only slice. Initial read suggests it's intentionally narrow; broader discovery may require Playwright on `/s/announcements`.
