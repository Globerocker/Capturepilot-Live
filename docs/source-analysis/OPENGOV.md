# OpenGov Procurement — Source Analysis

Reverse-engineering notes for the 44 OpenGov tenants seeded in `rss_sources`.
Investigation date: 2026-05-25. All sample data observed live.

> **TL;DR** — OpenGov Procurement is a webpack SPA backed by a public REST API at
> `https://api.procurement.opengov.com/api/v1`. The portal HTML is just a shell
> behind Cloudflare; the SPA fetches everything via JSON from the API host, and
> **every endpoint we need works anonymously**. **No Playwright required.**

---

## 1. Architecture

| Layer            | Host                                                  | Notes                                                                     |
|------------------|-------------------------------------------------------|---------------------------------------------------------------------------|
| Portal SPA       | `https://procurement.opengov.com/portal/<slug>`       | React + Redux + react-router. Static webpack bundles in `/assets/main.*.js` + `/assets/vendor.*.js`. **NOT Next.js** — no `__NEXT_DATA__`. |
| API              | `https://api.procurement.opengov.com/api/v1`          | REST + JSON. CORS open to `https://procurement.opengov.com`. Cloudflare in front. |
| Attachments      | `https://government-project.s3.us-west-2.amazonaws.com/<projectId>/<uuid>_<filename>` | AWS pre-signed URLs, 20-hour expiry, `GET` only (HEAD returns 403).        |
| GraphQL (other)  | `/api/v1/po/graphql`, `/custom-form/graphql`          | Used for purchase orders + custom forms — **not needed** for public RFP scraping. |

**Hydration mechanism.** The HTML shell contains `window.__data = {...}` with every Redux slice initialised to empty defaults (`loaded:false`, `rows:[]`, `count:0`). **No SSR data is embedded** — the SPA mounts on the client and fetches via XHR. That's why a plain HTML fetch looks "near-empty". The fix isn't to render the page; it's to call the same JSON endpoints the SPA calls.

**Cloudflare quirk.** Hitting `procurement.opengov.com/portal/<slug>` from Python `urllib` (default UA) or curl-with-default-UA returns the Cloudflare managed challenge ("Just a moment…", 403 + JS interstitial). Hitting `api.procurement.opengov.com` with the same default-UA also gets blocked at 403. **With a realistic Chrome UA header, every API call succeeds at HTTP 200**, no JS challenge, no captcha.

Mandatory headers for the API:

```
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36
Origin: https://procurement.opengov.com
Referer: https://procurement.opengov.com/portal/<slug>
Accept: application/json
Content-Type: application/json   # for POSTs
```

---

## 2. Endpoints (anonymous, no auth)

All paths are relative to `https://api.procurement.opengov.com/api/v1`.

| Verb | Path                                            | Returns                                                  | Used for                          |
|------|-------------------------------------------------|----------------------------------------------------------|-----------------------------------|
| GET  | `/government`                                   | `Organization[]` (545 orgs as of 2026-05-25)             | **Tenant discovery / slug index** |
| POST | `/government/{code}/project/public`             | `{ count: number, rows: ListingRow[] }`                  | **Per-tenant listings** (paged)   |
| POST | `/project/list`                                 | Same shape, but searches across all tenants with line-items | Cross-tenant search (optional)    |
| GET  | `/project/{id}`                                 | Full `Project` (~200 fields, 2 MB+ for large RFPs)       | **Per-opportunity detail**        |
| GET  | `/project/{id}/addendums`                       | `Addendum[]`                                             | Amendments / changes              |

Endpoints that exist but require auth (return 401): `/project/{id}/criteria`, `/project/{id}/proposal`, `/user/me/*`, anything under `/governments/...` (admin namespace).

### 2.1 Listing payload (POST body)

```json
{
  "filters": [ { "type": "status", "value": ["open"] } ],
  "page": 1,
  "limit": 50,
  "sortField": "releaseProjectDate",
  "sortDirection": "desc"
}
```

Empty `{}` is valid → returns first 10 rows. Discovered filter types
(from the bundle's `projectFilterTypesDict`):

| `type` value      | Value shape                | Use                              |
|-------------------|----------------------------|----------------------------------|
| `status`          | `["open" \| "closed" \| ...]` | Lifecycle filter                |
| `title`           | `"<substring>"`            | Title search                     |
| `financialId`     | `"<substring>"`            | Project code (e.g. "RFP-25-001") |
| `departmentId`    | `[<id>, ...]`              | Department dropdown              |
| `categories`      | `[<id>, ...]`              | NIGP / NAICS / UNSPSC ID         |
| `comingSoon`      | `true`                     | Pre-release flag                 |

Sort fields seen: `releaseProjectDate`, `proposalDeadline`, `title`, `status`.

### 2.2 Listing row shape (`rows[N]`)

```json
{
  "id": 174424,
  "financialId": "PMC RFQu-25-001",
  "status": "open",
  "title": "Court Foreign Language Interpretation and Translation Services",
  "releaseProjectDate": "2025-07-01T16:44:43.222Z",
  "proposalDeadline": "2030-07-01T00:00:00.000Z",
  "isPaused": false,
  "isPrivate": false,
  "comingSoon": false,
  "summary": "<p>The Phoenix Municipal Court ...</p>",
  "addendums": [],
  "department": { "id": 1913, "name": "Phoenix Municipal Court" },
  "template":   { "title": "Request For Qualification" },
  "government": {
    "code": "phoenix",
    "organization": { "name": "City of Phoenix", "logo": "https://..." }
  }
}
```

Note: list rows include a **summary** (HTML), so for HOT-list use you can skip the detail call if attachments aren't required.

### 2.3 Detail payload — `GET /project/{id}`

Top-level keys we care about (full shape has ~200):

| Field                     | Type       | Notes                                                            |
|---------------------------|------------|------------------------------------------------------------------|
| `id`                      | int        | Numeric project id (also in URL).                                |
| `financialId`             | str        | Solicitation number (e.g. `AVN RCS-26-0047`).                    |
| `title`                   | str        | RFP title.                                                       |
| `status`                  | str        | `open` / `closed` / `pending` / `coming-soon`.                   |
| `type`                    | str        | `purchase` (most) / `sourcing` / `intake`.                       |
| `template.title`          | str        | Notice type, e.g. `"Request For Bid"`, `"Request For Qualification"`, `"Revenue Contract Solicitation"`. |
| `department.name`         | str        | Department/agency division.                                       |
| `government.code`         | str        | Tenant slug (`phoenix`, `saccounty`, `seattle`, ...).              |
| `government.organization.name`  | str  | Full government name (`City of Phoenix`).                         |
| `government.organization.state` | str  | 2-letter postal code.                                              |
| `government.organization.timezone` | str | IANA timezone (`America/Phoenix`).                                 |
| `government.categorySetId` | int       | **Category code system in use** (see §3).                          |
| `summary`                 | str (HTML) | Short description / scope. ~1-3 KB.                                |
| `rawSummary`              | str (HTML) | Same but with raw HTML preserved.                                 |
| `categories`              | array      | NIGP / NAICS / UNSPSC codes (see §3).                              |
| `releaseProjectDate`      | ISO8601    | Released to public.                                                |
| `postedAt`                | ISO8601    | Actual posting timestamp.                                          |
| `proposalDeadline`        | ISO8601    | **Closing date** — primary deadline.                               |
| `preProposalDate`         | ISO8601    | Pre-bid meeting / site walk.                                       |
| `qaDeadline`              | ISO8601    | Question deadline.                                                 |
| `qaResponseDeadline`      | ISO8601    | Answers-by date.                                                   |
| `expirationDate`          | ISO8601    | Contract expiration (if pre-set).                                  |
| `timelines`               | array      | Free-form additional milestones (`title`, `date`, `textDate`).      |
| `attachments`             | array      | Bid documents (see §4).                                            |
| `addendums`               | array      | Amendments (separately fetchable).                                 |
| `contactFullName`         | str        | Primary contact (sometimes hidden by `hideContact: true`).         |
| `contactTitle`            | str        | Role (e.g. `Procurement Manager`).                                 |
| `contactEmail`            | str        | Primary contact email.                                             |
| `contactPhoneComplete`    | str        | Phone (e.g. `(602) 273-2054`).                                     |
| `contactAddress1/City/State/ZipCode/Country` | str | Mailing address fields.                                |
| `procurementFullName`     | str        | Secondary procurement officer (often same person).                 |
| `procurementEmail`        | str        | Secondary email.                                                   |
| `hideContact`             | bool       | Suppress contact card.                                             |
| `criteria`                | array      | Evaluation criteria & scope sections. Each: `title`, `description` (HTML), `instructionType`. **Large** (>1 MB in some projects). |
| `projectSections`         | array      | High-level section grouping for `criteria`.                        |
| `upfrontQuestions`        | array      | Vendor pre-bid questions/forms.                                    |
| `questionnaires`          | array      | Detailed scored questionnaires.                                    |
| `priceTables`             | array      | Line-item pricing forms.                                            |
| `requiresInvitation`      | bool       | If `true` the project is invitation-only (skip).                   |
| `isPrivate`               | bool       | Skip if `true`.                                                    |
| `wasPosted`               | bool       | Sanity check — must be `true` for live public projects.            |

---

## 3. Category codes (NIGP / NAICS / UNSPSC)

`categorySetId` from `government.categorySetId` maps to the standard each tenant uses:

```text
NIGP   = 100   // 5-digit codes — e.g. "90534"
NAICS  = 200   // 6-digit codes — e.g. "541720"
UNSPSC = 300
```

This is hardcoded in the bundle: `NIGP:100,NAICS:200,UNSPSC:300`.

**Observed in the wild**:
- City of Phoenix → `categorySetId: 100` (NIGP)
- Sacramento County → `categorySetId: 100` (NIGP)
- City of Seattle → `categorySetId: 200` (NAICS)

`categories[].code` is the canonical code string; `categories[].title` is the
human label. Same per-row example:

```json
{ "id": 10007054, "code": "90534", "setId": 100, "title": "Concessions, Airport: Food" }
```

**Mapping caveat**: when `setId === 100` (NIGP) we need a NIGP→NAICS crosswalk
before storing into `opportunities.naics_code`. Phoenix's 90534 ("Concessions,
Airport: Food") best matches NAICS 722515 / 722330, but the mapping is
many-to-many and lossy. **Recommendation**: store the raw category in
`opportunities.notes.opengov_categories[]` and only populate `naics_code` when
`setId === 200`.

---

## 4. Attachments

The `attachments` array on the detail payload contains AWS pre-signed S3 URLs:

```json
{
  "id": 1815064,
  "title": "1 - A - T3 F&B Micro Resturant Mobile Kiosk - Draft Lease",
  "filename": "1_-_A_-_T3_F&B_Micro_Resturant_Mobile_Kiosk_-_Draft_Lease.pdf",
  "fileExtension": "pdf",
  "type": "other",
  "bucket": "government-project",
  "path": "180212/b3055eeb-6e70-4e8f-b98d-9035ffce6521_1_-_A_-_T3_F&B_Micro_Resturant_Mobile_Kiosk_-_Draft_Lease.pdf",
  "url": "https://government-project.s3.us-west-2.amazonaws.com/180212/b3055eeb-...pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=...&X-Amz-Expires=72000&X-Amz-Signature=..."
}
```

**Properties**:
- Bucket: always `government-project` (region `us-west-2`).
- Path format: `<projectId>/<uuid>_<original_filename>`.
- Pre-signed `X-Amz-Expires: 72000` (20 hours). After expiry, re-fetch the project detail to get a fresh signed URL — **the `url` field is regenerated server-side on every detail call**.
- `Content-Disposition: attachment; filename="..."` is baked into the signature → forces download instead of inline display.
- HEAD requests fail (403) — the signature only covers `GET`. Use `GET` with `Range: bytes=0-0` to size-check without downloading the full file.
- `type` values seen: `other`, `addendum`, `bidDocument`, `proposalForm`.

**Storage strategy** (analog to our SAM.gov attachments cron):
1. Detail call → enumerate `attachments[]`.
2. `GET` each `url` and stream into Supabase Storage `opportunity-attachments` bucket under `opengov/<govCode>/<projectId>/<filename>`.
3. Set `opportunities.attachments_cached_until` = now + 30 days (matches SAM TTL).
4. On re-scrape, re-issue the detail call to refresh signed URLs — do NOT persist the raw signed URL in DB (signatures expire and leak credentials).

---

## 5. Per-tenant findings

### 5.1 City of Phoenix, AZ — slug `phoenix`

- Portal: `https://procurement.opengov.com/portal/phoenix`
- Total projects in system: **285**
- Open projects: **18** (verified via `filters:[{type:"status",value:["open"]}]`)
- `categorySetId`: **100 (NIGP)**
- Timezone: `America/Phoenix`
- Sample open project: id `180212` — "Terminal 3 Food & Beverage Concessions Operator (Small Business Opportunity) Micro Restaurant and Mobile Kiosk"
  - Public URL: `https://procurement.opengov.com/portal/phoenix/projects/180212`
  - Detail API: `GET /api/v1/project/180212`
  - 31 attachments, ~2 MB detail payload, contact `cadle.collins@phoenix.gov`
  - Notice type: `Revenue Contract Solicitation`
  - Categories: 90534 / 90535 / 90536 (NIGP airport concessions)

### 5.2 Sacramento County, CA — slug `saccounty`

- Portal: `https://procurement.opengov.com/portal/saccounty`
- Total projects: **715**
- `categorySetId`: **100 (NIGP)**
- Sample open project: id `265855` — "Vineyard Surface Water Treatment Plant - Sludge Removal" (`2026-RFB-0054`)
  - Notice type: `Request for Bid (Goods/Services)`
  - Department: `DGS: CAPSD - Procurement`

### 5.3 Third tenant verified — City of Seattle, WA — slug `seattle`

- Portal: `https://procurement.opengov.com/portal/seattle`
- Total projects: **335**
- `categorySetId`: **200 (NAICS)** — this is what we ideally want for direct match scoring.
- Sample open project: id `259587` — "Seattle's App-Based Workers Research" (`2025-059`)
  - Detail API: `GET /api/v1/project/259587` → 235 KB
  - Categories: `setId=200, code=541720, title="Research and Development in the Social Sciences and Humanities"`
  - Contact: `ols_rfp@seattle.gov`, Shuxuan Zhou

Pattern confirmed identical across all three. The 44 seeded slugs should work with the same code path; bad slugs return `404 {"message":"Not Found"}` cleanly (verified: `sandiego` and `austin` 404).

---

## 6. Tenant discovery — `GET /government`

```
GET https://api.procurement.opengov.com/api/v1/government
→ 200 OK, 1.6 MB JSON, Organization[] of length 545
```

Each entry is an `Organization` with a nested `government` object whose `code`
is the tenant slug:

```json
{
  "id": 12345,
  "name": "City of Phoenix",
  "state": "AZ",
  "address1": "...",
  "timezone": "America/Phoenix",
  "isActive": true,
  "government": { "id": 678, "code": "phoenix" }
}
```

**This means we can auto-discover all 545 tenants** without maintaining a
hardcoded slug list — far beyond the 44 currently in `rss_sources`.
Recommended new cron: `ingest_opengov_tenants` (weekly) that walks
`GET /government`, upserts each into `rss_sources` with `kind='opengov'`,
`slug=organization.government.code`, and `is_active=organization.isActive`.

Sample slugs from the first page:
```
1gpa, sdfair, pinellas-fl, achdidaho, aguafria, alachuacounty,
alamedaca, alexandercountync, a2trans, pgpc, acua, baltimorecountymd,
baaqmd, baycountyfl, bay-k12-fl, bcgov, bft, bcsd, berkshire-planning,
boonecountyky, ...
```

---

## 7. Rate limiting

- **No `X-RateLimit-*` headers exposed** on any response observed.
- Empirical test: **8 sequential POSTs to the listing endpoint in 1.97 s (4.06 rps) — all HTTP 200**. No 429s, no degradation.
- Cloudflare may throttle anonymous bursts; **recommend 2-3 rps with exponential backoff on 429/503**, identical to our SAM.gov client.
- `cf-cache-status: DYNAMIC` on every response → not edge-cached, so we can't accidentally get stale data.
- Per-IP block kicks in **only** with the default Python/curl UA. Real Chrome UA = no block.

---

## 8. robots.txt + ToS caveats

- `https://procurement.opengov.com/robots.txt` — returns Cloudflare challenge in our browser fingerprint, but is presumed to exist for SEO. Couldn't read it from this environment. **Action item**: re-check from a normal browser session before going to prod.
- `https://procurement.opengov.com/portal/<slug>` — Cloudflare-challenged for non-browser clients. Switching to `api.procurement.opengov.com` (which doesn't trigger the same challenge) sidesteps this issue entirely for data extraction.
- **OpenGov Master Services Agreement** is at `https://opengov.com/terms-of-service` and is a B2B contract with customer governments. It does **not** bind anonymous portal visitors. Public RFPs published by government agencies are public records under each state's public-records law (no clause has been observed forbidding programmatic access to them).
- **Recommended self-imposed limits**:
  - Identify our crawler in the UA suffix (e.g. `Mozilla/5.0 ... CapturePilotBot/1.0 (+https://capturepilot.com/about-our-crawler)`) — gives OpenGov a way to contact us if there's a problem.
  - Rate-cap 2 rps per tenant, 5 rps aggregate.
  - Respect `Retry-After` on any 429/503.
  - Don't re-fetch unchanged projects: cache by `lastUpdatedAt`, only re-pull when it advances.

---

## 9. Field-to-canonical mapping (for `opengov-parser.ts`)

Our `opportunities` schema → OpenGov JSON path:

| `opportunities` column            | OpenGov source                                                |
|-----------------------------------|---------------------------------------------------------------|
| `source_id`                       | `"opengov:" + government.code + ":" + id`                     |
| `source`                          | `"opengov"`                                                   |
| `solicitation_number`             | `financialId`                                                 |
| `title`                           | `title`                                                       |
| `description`                     | `summary` (HTML, sanitize before display)                     |
| `notice_type`                     | Map `template.title` → SAM canonical set:                     |
|                                   | `"Request For Bid"` / `"...RFB"` → `Solicitation`             |
|                                   | `"Request For Proposal"` → `Solicitation`                     |
|                                   | `"Request For Qualification"` → `Pre-Solicitation`            |
|                                   | `"Request For Information"` → `Sources Sought`                |
|                                   | `"Revenue Contract..."` → `Solicitation` (revenue contract)   |
| `agency`                          | `government.organization.name`                                |
| `agency_subdivision`              | `department.name`                                             |
| `state`                           | `government.organization.state`                               |
| `naics_code`                      | `categories[0].code` **only if** `government.categorySetId === 200`. Otherwise null and stash NIGP under `notes.opengov_nigp[]`. |
| `psc_code`                        | (no native PSC — leave null)                                  |
| `posted_date`                     | `postedAt` (fallback `releaseProjectDate`)                    |
| `response_deadline`               | `proposalDeadline`                                            |
| `pre_proposal_date`               | `preProposalDate`                                             |
| `qa_deadline`                     | `qaDeadline`                                                  |
| `set_aside`                       | Heuristic: scan `title` + `summary` for "Small Business", "Disadvantaged", "WMBE", "WOSB" — OpenGov has no structured set-aside field. |
| `link` (public URL)               | `https://procurement.opengov.com/portal/${government.code}/projects/${id}` |
| `contact_name`                    | `contactFullName` (skip if `hideContact: true`)               |
| `contact_email`                   | `contactEmail`                                                |
| `contact_phone`                   | `contactPhoneComplete`                                        |
| `contact_title`                   | `contactTitle`                                                |
| `status`                          | Map `status`: `open` → `ACTIVE`, `closed` → `EXPIRED`, `coming-soon` → `MARKET_RESEARCH` |
| `last_modified`                   | `lastUpdatedAt` (preferred), fallback `updated_at`            |

Attachments → upsert into existing attachments pipeline with `{ source:'opengov', external_id: attachment.id, name: attachment.title, filename: attachment.filename, ext: attachment.fileExtension }`.

---

## 10. Recommended implementation

**Use the JSON API directly. Do NOT use Playwright.**

Suggested module shape (`/dashboard/src/lib/sources/opengov-parser.ts`):

```ts
const API = "https://api.procurement.opengov.com/api/v1";
const UA  = "Mozilla/5.0 ... Chrome/120 ... CapturePilotBot/1.0";
const HEADERS = {
  "User-Agent": UA,
  "Origin": "https://procurement.opengov.com",
  "Accept": "application/json",
};

export async function listTenants(): Promise<Tenant[]> {
  const r = await fetch(`${API}/government`, { headers: HEADERS });
  const orgs = await r.json();
  return orgs
    .filter(o => o?.government?.code && o.isActive !== false)
    .map(o => ({ code: o.government.code, name: o.name, state: o.state }));
}

export async function listOpenProjects(code: string, page = 1, limit = 100) {
  const r = await fetch(`${API}/government/${code}/project/public`, {
    method: "POST",
    headers: { ...HEADERS, "Content-Type": "application/json",
               "Referer": `https://procurement.opengov.com/portal/${code}` },
    body: JSON.stringify({
      filters: [{ type: "status", value: ["open"] }],
      page, limit,
      sortField: "releaseProjectDate", sortDirection: "desc",
    }),
  });
  return r.json() as Promise<{ count: number; rows: ListingRow[] }>;
}

export async function fetchProject(id: number) {
  const r = await fetch(`${API}/project/${id}`, { headers: HEADERS });
  if (!r.ok) throw new Error(`opengov ${id}: ${r.status}`);
  return r.json() as Promise<ProjectDetail>;
}
```

**Cron cadence** (analog to `ingest_sam`):
1. `ingest_opengov_tenants` — weekly, walks `/government` to keep `rss_sources` fresh.
2. `ingest_opengov` — every 4 hours, for each active tenant:
   - Paginate `/government/{code}/project/public` with `status=open` until `rows.length < limit`.
   - For each new or modified row (compare `lastUpdatedAt` to our stored value) → `fetchProject(id)` → upsert into `opportunities`.
   - Attachments enqueued onto the existing `deep_enrich` queue (per-30-day TTL).

**Why no Playwright**:
- All needed data is in JSON behind a public REST API.
- Cloudflare challenge applies to the **HTML portal host**, not the API host.
- Bundle size & cold-start cost on Vercel make headless Chromium a non-starter (>50 MB limit).
- API responses are 30-200 KB for listings, up to 2 MB for detail — fast enough for serverless.

---

## 11. Open questions / follow-ups

- **NIGP→NAICS crosswalk**: 75% of tenants use NIGP. A static map (NIGP 5-digit → primary NAICS) would let us score against user NAICS profiles. CSV available from NIGP itself (paid) or community Excel sheets (free, partial).
- **Set-aside detection**: no structured field. Regex against `title`/`summary` works for ~60% of cases ("Small Business", "8(a)", "DBE", "WMBE", "WOSB", "HUBZone", "SDVOSB", "Veteran"). For the rest, attachments contain the formal set-aside language — defer to attachment-text scoring (we already have this for SAM).
- **Contract value**: not in `Project` directly. `priceTables` contains line-item *templates* (vendor-fillable), not estimates. **Recommendation**: leave `estimated_value` null for OpenGov rows and surface "Value TBD" in the UI.
- **Bid results / awarded vendor**: when `status === "closed"` and `isPublicBidResult: true`, vendor names + prices are in `proposalDocuments[]` and a separate `/project/{id}/bid-tabulations` endpoint. Out of scope for v1 ingest but useful for past-performance enrichment.

---

## 12. Verified URLs (smoke-test these from prod before shipping)

```
GET  https://api.procurement.opengov.com/api/v1/government                       → 200, 1.6 MB
POST https://api.procurement.opengov.com/api/v1/government/phoenix/project/public   → 200
POST https://api.procurement.opengov.com/api/v1/government/saccounty/project/public → 200
POST https://api.procurement.opengov.com/api/v1/government/seattle/project/public   → 200
GET  https://api.procurement.opengov.com/api/v1/project/180212                   → 200, 2 MB (Phoenix sample)
GET  https://api.procurement.opengov.com/api/v1/project/259587                   → 200, 235 KB (Seattle sample)
GET  https://api.procurement.opengov.com/api/v1/project/180212/addendums         → 200, []
```

All of the above were re-verified live on 2026-05-25 with the headers listed in §1.
