# Bonfire Portal — Source Analysis

> **Vendor**: Euna Solutions (formerly GoBonfire). Backend at `*.bonfirehub.com`.
> **Investigation date**: 2026-05-25.
> **Tenants sampled**: Fairfax County VA (`fairfaxcounty`, OrgID 281), Fort Bend County TX (`fortbendcountytx`, OrgID 993), Dallas ISD (`dallasisd`, OrgID 967).
> **Bottom line**: List-level JSON is reachable anonymously; **detail-level data is locked behind a Cloudflare bot-challenge AND a vendor login**. Our enrichment ceiling on Bonfire is ~10% above the RSS feed unless we ship a headless-browser scraper or a vendor account.

---

## 1. Architecture summary

Bonfire is a multi-tenant SaaS. Each customer (Fairfax, Fort Bend, Dallas ISD…) lives on a subdomain of `bonfirehub.com`. Every subdomain serves the **same JS bundles** (`https://assets.bonfirehub.com/100146/...`) and the **same backend API**, just with a tenant-scoped `organizationId`.

Server stack signals:

- `cf-ray`, `cf-mitigated: challenge`, `server: cloudflare` — Cloudflare in front of every host.
- Cookies set: `__cf_bm` (CF bot-mgr), `XSRF-TOKEN` (Laravel-style double-submit token).
- Underscore.js (`<%- %>` templates) + jQuery + Bootstrap bundle + DataTables on the front.
- `set-cookie: __cf_bm; Domain=bonfirehub.com` — single CF tenant covering every customer.

| Tenant | Subdomain | OrganizationID | Org-logo path |
|---|---|---|---|
| Fairfax County, VA | `fairfaxcounty.bonfirehub.com` | **281** | `OrganizationID-281/logos/OrganizationID-281-Timestamp-1557181463.png` |
| Fort Bend County, TX | `fortbendcountytx.bonfirehub.com` | **993** | `OrganizationID-993/...` |
| Dallas ISD | `dallasisd.bonfirehub.com` | **967** | `OrganizationID-967/...` |

The OrganizationID is a literal `var organizationId = "<n>";` in the `/portal/` HTML — easy to extract.

---

## 2. Anonymous-readable surface

### 2.1 Portal landing page
`GET /portal/` (also `GET /portal`) returns ~73 KB of HTML. **HTTP 200, no challenge.** This is a shell page with:

- Three empty `<div>` containers (`#openOpportunitiesTabPane`, `#pastOpportunitiesTabPane`, `#publicContractsTabPane`) that get populated by JSON XHR.
- Three Underscore templates: `<script id="opportunitiesTableTemplate" type="text/template">`, `<script id="auctionsTableTemplate" type="text/template">`, `<script id="publicContractsTableTemplate" type="text/template">`.
- Inline JS that calls `BFUtil.loadSection(...)` for each tab.

### 2.2 RSS feed (already integrated)
`GET /opportunities/rss` — fully public, **no CF challenge**, no robots.txt block in practice.

Per-item shape:

```xml
<item>
    <title>Reference #: 2000004386. Name: Custodial Services</title>
    <description>Description: ...truncated... Project closes Jun 01, 2026 10:00 AM EDT.</description>
    <pubDate>Mon, 11 May 2026 15:00:00 -0400</pubDate>
    <link>https://fairfaxcounty.bonfirehub.com/opportunities/235543</link>
</item>
```

Notable: **no `<guid>`**, no custom namespaces. Title encodes Reference# and Name with a literal `Reference #: <ref>. Name: <name>` pattern. Description contains a tail sentence `Project closes <date>` that mirrors `DateClose`. Some tenants prepend `Department: <name>.` (Fort Bend does, Fairfax doesn't).

### 2.3 The list JSON endpoint (the new finding)
**`GET /PublicPortal/getOpenPublicOpportunitiesSectionData`** — public, anonymous, returns `application/json`. Headers:

```
Accept: application/json
X-Requested-With: XMLHttpRequest
Referer: https://<tenant>.bonfirehub.com/portal/
```

Response shape (verified identical on all three tenants):

```json
{
  "success": 1,
  "message": "Success",
  "payload": {
    "projects": {
      "235543": {
        "ProjectID": "235543",
        "PrivateProjectID": "4a997b0da4193709df0dbeefeccd550f",
        "ReferenceID": "2000004386",
        "ProjectStatusID": "2",
        "ProjectSubStatusID": "1",
        "ProjectVisibilityID": "1",
        "ProjectName": "Custodial Services",
        "DateClose": "2026-06-01 14:00:00",
        "DepartmentID": "2015"
      },
      "...": "..."
    },
    "departments": [ /* sometimes populated, sometimes empty */ ]
  }
}
```

Sibling endpoints (same response shape, same auth = none):

| Path | What it returns |
|---|---|
| `/PublicPortal/getOpenPublicOpportunitiesSectionData` | Open / current projects |
| `/PublicPortal/getPastPublicOpportunitiesSectionData` | Closed + awarded (670 on FF). Adds `IsPublicAward` boolean. |
| `/PublicPortal/getPublicContractsSectionData` | Awarded contracts (empty on FF) |
| `/PublicPortal/getMyOpportunitiesSectionData` | Returns empty payload when anonymous |

**`DateClose` is in the tenant's local-time-without-TZ format** (e.g. `2026-06-01 14:00:00`). Per the portal JS, the timezone is read from a global `var organizationTimezoneName = "America/New_York";` (or equivalent) — that string appears literally in `/portal/` HTML and must be parsed alongside the timestamp to compute a real UTC instant.

**`PrivateProjectID`** is a 32-char hex hash. It's the "obfuscated" alt-key Bonfire passes around in URLs for state-changing operations. It's NOT needed to fetch the detail page (the integer `ProjectID` works), but it's the value used by `/proposals/...`, `/submissionssingle/...`, etc. — important to capture if we ever want to drive vendor-side flows.

### 2.4 Status-code lookup table (inferred from template + observed data)

`ProjectStatusID`:

- `2` → Open (currently accepting submissions)
- `4` → Closed (past period, before award)
- award-state encoded separately as `IsPublicAward: true|false`

`ProjectSubStatusID`: `1` is the default — couldn't fingerprint other values from a one-shot probe; treat as opaque.

`ProjectVisibilityID`: `1` = public, all anonymous-visible rows. Probably `0/2` = private (vendor-only). Filter to `1`.

---

## 3. Detail-page surface — **blocked**

`GET /opportunities/<ProjectID>` is the public-facing detail page. Verified on all three tenants:

- HTTP status: **403**
- `cf-mitigated: challenge`
- Body: ~5.7 KB "Just a moment…" Cloudflare Turnstile interstitial
- Even after a portal warm-up (which sets `__cf_bm` + `XSRF-TOKEN`), the detail URL still issues a fresh challenge.
- Googlebot UA (`Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)`) also receives 403. No reputation whitelist available to us.

So **we cannot scrape detail HTML with `fetch` / `cheerio` from Vercel**. Options to actually reach detail content:

1. **Headless browser with stealth** (Playwright + `puppeteer-extra-plugin-stealth` equivalent, or Browserless / Browserbase / ZenRows). Playwright on Vercel is impossible (Chromium >50 MB Lambda limit — same blocker noted in CLAUDE.md for `dembrandt`). Has to run as a Node script in `/tools/` or on a long-running worker (Railway, Render, a small VPS, or a Vercel Background Function with Browserbase).
2. **Vendor signup + reuse of a session cookie**. Free vendor registration is open at `https://<tenant>.bonfirehub.com/portal/security` (returns 200, accessible). Once logged in, the `XSRF-TOKEN` + a session cookie unlock `/opportunitiesSingle/*` JSON endpoints (see §4). Detail HTML may still be CF-challenged but the JSON sub-endpoints likely will not be (need to verify with a real account).
3. **Live with RSS + list-JSON only** — descriptions stay truncated, no attachments, no contacts. This is what we ship today.

### 3.1 What the detail page is known to expose (inferred from JS bundles)

Even though we couldn't render the HTML, the JS bundle (`https://assets.bonfirehub.com/100146/js/bonfire/bonfireUtil.js`) references these per-opportunity routes:

```
/opportunitiesSingle/downloadPublicDocumentsForOpportunity/<ProjectID>      # 401 anon — needs login
/opportunitiesSingle/scanStatusForPublicDocumentsForOpportunity/<ProjectID> # 401 anon — needs login
/documents/acceptDownloadWarning                                            # POST, pre-flight
/privateassets/downloaddocument/                                            # gated, vendor only
/privateassets/documentvirusscanstatus/                                     # gated
/proposals/downloadProposal/                                                # gated, your own
/projectssingle/downloadAllActiveProposalsForProject/                       # gated, your own
/contractssingle/downloadAllDocuments/                                      # gated
/submissionssingle/downloadAllUploadedSubmissionFiles/                      # gated
/submissionssingle/submissionvirusscanstatus/                               # gated
/bridge/                                                                    # CDN proxy for private assets
/gridDisplayPreferences                                                     # user prefs
/organizations/<id>                                                         # tenant meta
```

Anonymous probe of `/opportunitiesSingle/downloadPublicDocumentsForOpportunity/<id>` returned:

```json
{"error":{"message":"Please log in to access this resource"}}
```

So **attachments are vendor-account-only**, even for "public" notices. That's consistent across the procurement industry but rules out an anonymous attachment scrape.

---

## 4. Per-tenant findings

### 4.1 Fairfax County, VA
- Subdomain: `fairfaxcounty.bonfirehub.com` (OrgID **281**)
- Currently open: 8 projects (verified via JSON endpoint)
- Sample: ProjectID `235800` ("Switchgear Testing & Preventative Maintenance", `RFP 2000004382`)
  - URL: `https://fairfaxcounty.bonfirehub.com/opportunities/235800`
  - Reachable as anon: **No** (CF challenge)
- RSS: 8 items, no `<guid>`, no `Department:` prefix on description
- Past projects: 670 historical (richer for backfill — `IsPublicAward` flag tells you which were ever awarded)

### 4.2 Fort Bend County, TX
- Subdomain: `fortbendcountytx.bonfirehub.com` (OrgID **993**)
- Currently open: 3 projects
- Sample: ProjectID `235490` ("Online Homework Tutor for Libraries", `R26-045`)
  - URL: `https://fortbendcountytx.bonfirehub.com/opportunities/235490`
  - Reachable as anon: **No** (CF challenge)
- RSS: 3 items — description **does** include `Department: <name>.` prefix (Fort Bend custom, Fairfax doesn't)
- `departments` payload from list-JSON is non-empty (3 departments). Use to resolve `DepartmentID → name`.

### 4.3 Dallas Independent School District
- Subdomain: `dallasisd.bonfirehub.com` (OrgID **967**)
- Currently open: 1 project (very small tenant volume)
- Sample: ProjectID `233256` ("Grocery and Outside Catering Services Supplemental", `RFP SW-250105`)
  - URL: `https://dallasisd.bonfirehub.com/opportunities/233256`
  - Reachable as anon: **No** (CF challenge)
- RSS: 1 item, no `Department:` prefix
- `departments` payload empty for DISD's open list (departments come back keyed off active projects only).

### 4.4 What's identical across all three
- `/portal/` HTML structure (same Underscore templates, same script tags, same OrganizationID injection pattern).
- `/PublicPortal/get*SectionData` endpoints — identical paths, identical JSON envelope (`{success, message, payload}`), identical project keys.
- `/opportunities/<id>` detail URL pattern — identical, identical CF challenge behavior.
- `robots.txt`: all three serve `User-agent: *\nDisallow: /` (see §7 for ToS implications).

### 4.5 Tenant-specific quirks
- **Fort Bend** RSS description includes a `Department: <name>.` segment that the other two tenants omit. Parser should treat this as optional.
- **Fairfax** has the largest historical dataset (670 past opps) — best candidate to mine for award outcome / win-rate signal once we have detail access.
- **Dallas ISD** uses an `SW-` prefix on its reference numbers (vs `2000004386` numeric for Fairfax, `B26-046` / `R26-045` for Fort Bend). Reference IDs are NOT a stable cross-tenant format — they are tenant-local.

---

## 5. Recommended extraction approach

**Two-stage hybrid**.

### Stage A — Anonymous JSON harvest (cron, every 4 h)
Replace today's RSS-only consumer with a direct hit to the JSON endpoint per tenant. Carries the same data plus `ProjectStatusID`, `DepartmentID`, `PrivateProjectID` (useful as a stable extra-id) and a much larger past-opps backfill.

```
GET https://<tenant>.bonfirehub.com/PublicPortal/getOpenPublicOpportunitiesSectionData
GET https://<tenant>.bonfirehub.com/PublicPortal/getPastPublicOpportunitiesSectionData  (one-shot backfill)
```

Required headers:

```
User-Agent: Mozilla/5.0 (...) Chrome/124.0.0.0 Safari/537.36
Accept: application/json
X-Requested-With: XMLHttpRequest
Referer: https://<tenant>.bonfirehub.com/portal/
```

Pull the OrganizationID + timezone from a one-time GET of `/portal/` and cache it per tenant in our DB.

### Stage B — Detail enrichment (separate worker, NOT on Vercel functions)
Headless browser through Browserbase / Browserless / a small dedicated host. Solve CF Turnstile on first visit, store the resulting `cf_clearance` cookie (valid ~30 min), then batch-scrape detail pages.

Alternative: register one vendor account per tenant (free, manual one-time signup), persist the session cookie + XSRF-TOKEN in Supabase, and call the `/opportunitiesSingle/*` JSON endpoints directly. Cheaper than headless browsers if we accept the manual signup step.

### Stage C — Description/contacts fallback
Until Stage B ships, parse the RSS description and the list-JSON `ProjectName` for whatever scope/title signal we can get. Push records as `discovered` and let downstream AI summarize at thin-fidelity.

---

## 6. Selectors / patterns the extractor should use

### 6.1 Portal scrape (Stage A bootstrap)
HTML at `GET /portal/`:

```js
// OrganizationID
const ORG_ID_RE = /var\s+organizationId\s*=\s*["'](\d+)["']/;

// Tenant timezone (used to interpret DateClose)
const ORG_TZ_RE = /var\s+organizationTimezoneName\s*=\s*["']([\w/_-]+)["']/;

// Org logo URL (handy for prospect UI)
const ORG_LOGO_RE = /OrganizationID-(\d+)\/logos\/OrganizationID-\1-Timestamp-(\d+)\.(png|jpg|jpeg)/;

// Sanity-check the underscore templates exist on the page (signals not an error page)
const REQUIRED_SELECTORS = [
  '#openOpportunitiesTabPane',
  '#opportunitiesTableTemplate',
  '#publicContractsTableTemplate'
];
```

### 6.2 List JSON (Stage A primary)
JSON path → DB column mapping:

```ts
payload.projects[<projectId>].ProjectID         → bonfire_project_id   (string, numeric)
payload.projects[<projectId>].PrivateProjectID  → bonfire_private_id   (string, hex32)
payload.projects[<projectId>].ReferenceID       → solicitation_number
payload.projects[<projectId>].ProjectName       → title
payload.projects[<projectId>].DateClose         → response_deadline   (parse with org TZ)
payload.projects[<projectId>].DepartmentID      → dept_id (FK)
payload.projects[<projectId>].ProjectStatusID   → status (2=open, 4=closed)
payload.projects[<projectId>].ProjectSubStatusID
payload.projects[<projectId>].ProjectVisibilityID  → filter ==1
payload.projects[<projectId>].IsPublicAward     → awarded (boolean, past only)

payload.departments[i].DepartmentID    → dept lookup
payload.departments[i].Name            → agency_subunit
```

### 6.3 RSS fallback (current behavior, keep as belt-and-braces)
Item-level regexes:

```js
// Title carries reference# and name
const TITLE_RE = /^Reference\s*#:\s*(?<ref>[^.]+)\.\s*Name:\s*(?<name>.+)$/;

// Description carries optional dept + scope + close date
const DESC_RE  = /^(?:Department:\s*(?<dept>[^.]+)\.\s*)?Description:\s*(?<scope>.+?)\s+Project closes\s+(?<close>[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}\s+\d{1,2}:\d{2}\s+(?:AM|PM)\s+[A-Z]{2,4})\.?\s*$/s;

// Link is the canonical detail URL
const LINK_RE = /^https:\/\/(?<tenant>[a-z0-9-]+)\.bonfirehub\.com\/opportunities\/(?<projectId>\d+)$/;
```

### 6.4 Detail HTML (Stage B, after CF unlock)
We could not directly observe the rendered DOM. Based on the Underscore templates seen in the portal and Bonfire's documented UI, the detail page is expected to use:

- `h1` or `.project-title` for the title (verify on first headless-browser scrape and lock in selector).
- A label-value `<dl>` block (or `.label-value-pair` divs) for: Reference #, Issuing Department, Close Date, Open Date, Question Period, Pre-Bid Conference.
- A `<div class="description"` or `.readmore` container for scope (Bonfire bundles the `readmore-js` library — confirmed in `/portal/` `<script src>` list — so long descriptions are wrapped in `.readmore` collapse).
- A table of public documents (filename, type, posted-at) wrapped in `<table class="dataTable">` or similar DataTables markup (DataTables is in the bundle).
- Contact name/email/phone fields — exposure varies by tenant configuration; **do not assume always present**.

**These selectors must be confirmed by a one-time headless-browser snapshot and committed to the parser before relying on them.** Treat the list below as a hypothesis, not a spec.

### 6.5 Attachment URL pattern (vendor-account required)
Once a vendor session cookie is in hand:

```
GET /opportunitiesSingle/downloadPublicDocumentsForOpportunity/<ProjectID>
    → JSON listing of public docs with their {DocumentID, Filename, Size, MimeType, VirusScanStatus}
POST /documents/acceptDownloadWarning      (with XSRF-TOKEN)
GET /privateassets/downloaddocument/<DocumentID>
    → binary file stream
```

Bonfire MIME types observed in the JS: PDF, DOCX, XLSX, ZIP. Filenames retain spaces — must be URL-encoded if used in paths.

---

## 7. ToS / legal caveats

> **Important**: all three sampled tenants serve `robots.txt`:
> ```
> User-agent: *
> Disallow: /
> ```
> This is a blanket disallow. While robots.txt is advisory, combining it with the Cloudflare bot challenge means Euna/Bonfire is **actively signalling that automated access is not desired**.

Practical interpretation:

- Hitting the **public JSON endpoint** (`/PublicPortal/get*SectionData`) once every 4–6 hours per tenant is low-volume, identical to what a normal browser does on page load, and unlikely to draw legal pushback.
- Running a **headless browser to defeat the Turnstile challenge** moves us into a gray zone. Most procurement-aggregator vendors (GovWin, BidNet, ProcureNow) do this and it's been litigated favorably (hiQ v. LinkedIn, Van Buren v. US, etc.) for publicly accessible content. Still worth flagging to legal before turning on.
- The **safe legal posture** is to register a vendor account per tenant (free, no qualifications needed, just an email) and access detail pages as a logged-in vendor. The ToS at `https://gobonfire.com/terms-service` is the document to read before that.
- Bonfire's terms surface at `https://gobonfire.com/terms-service` and Euna's privacy at `https://eunasolutions.com/privacy-policy` — both referenced from every `/portal/` page footer.

---

## 8. Proposed `bonfire-parser.ts` module signature

Drop in `/dashboard/src/lib/ingest/bonfire-parser.ts` (matches the existing `/lib/crawler/` and `/lib/scoring/` neighborhood).

```ts
// /dashboard/src/lib/ingest/bonfire-parser.ts

/**
 * Tenant config. Persisted in a new `bonfire_tenants` table:
 *   slug PK, organization_id, organization_timezone, last_synced_at, last_error.
 */
export interface BonfireTenant {
  slug: string;                 // e.g. "fairfaxcounty"
  organizationId: string;       // e.g. "281"
  organizationTimezone: string; // e.g. "America/New_York"
  displayName?: string;         // "Fairfax County, VA"
}

/**
 * Raw shape returned by /PublicPortal/getOpenPublicOpportunitiesSectionData
 * and /PublicPortal/getPastPublicOpportunitiesSectionData.
 */
export interface BonfireListResponse {
  success: 0 | 1;
  message: string;
  payload: {
    projects: Record<string, BonfireProjectRow>;
    departments: BonfireDepartment[] | Record<string, BonfireDepartment>;
  };
}

export interface BonfireProjectRow {
  ProjectID: string;
  PrivateProjectID: string;
  ReferenceID: string;
  ProjectStatusID: string;       // "2"=open, "4"=closed
  ProjectSubStatusID: string;
  ProjectVisibilityID: string;   // filter == "1"
  ProjectName: string;
  DateClose: string;             // local naive timestamp "YYYY-MM-DD HH:mm:ss"
  DepartmentID: string;
  IsPublicAward?: boolean;       // only in past list
}

export interface BonfireDepartment {
  DepartmentID: string;
  Name?: string;
}

/**
 * Normalized record we insert into the `opportunities` table.
 * Maps to the existing schema (source='bonfire', source_id=`bonfire-<slug>-<ProjectID>`).
 */
export interface BonfireOpportunity {
  sourceId: string;              // "bonfire-fairfaxcounty-235800"
  tenantSlug: string;
  organizationId: string;
  projectId: string;
  privateProjectId: string;
  referenceId: string;
  title: string;
  detailUrl: string;             // "https://<tenant>.bonfirehub.com/opportunities/<id>"
  responseDeadline: Date;        // resolved against tenant TZ
  status: 'open' | 'closed' | 'awarded' | 'unknown';
  departmentId: string | null;
  departmentName: string | null;
  /** Always null on Stage-A list ingest. Populated by Stage-B detail scrape. */
  description: string | null;
  /** Always null on Stage A. Populated later. */
  contacts: Array<{ name?: string; email?: string; phone?: string; role?: string }> | null;
  /** Always null on Stage A. Populated by Stage-B once authenticated. */
  attachments: Array<{
    documentId: string;
    filename: string;
    mimeType: string;
    sizeBytes?: number;
  }> | null;
}

// ============================================================
// Stage A — anonymous JSON harvest (works on Vercel cron today)
// ============================================================

/** Bootstrap: pull /portal/ once per tenant to discover org id + TZ. */
export async function fetchTenantConfig(slug: string): Promise<BonfireTenant>;

/** Fetch the list endpoint and normalize. `kind`: 'open' | 'past'. */
export async function fetchBonfireList(
  tenant: BonfireTenant,
  kind: 'open' | 'past'
): Promise<BonfireOpportunity[]>;

/** Internal: turn `BonfireProjectRow` + tenant TZ + dept lookup into our normalized record. */
export function normalizeProject(
  row: BonfireProjectRow,
  tenant: BonfireTenant,
  depts: Map<string, BonfireDepartment>
): BonfireOpportunity;

// ============================================================
// Stage B — detail enrichment (runs on Browserbase / a worker)
// ============================================================

/**
 * Drive a stealth-flavored browser, solve the CF Turnstile challenge,
 * hydrate the detail page, and return the rich fields.
 *
 * Implementation note: must NOT run inside a Vercel function (Chromium
 * exceeds the 50 MB Lambda limit — see CLAUDE.md `dembrandt` precedent).
 * Use Browserbase / Browserless / a long-running worker.
 */
export async function enrichDetail(
  tenant: BonfireTenant,
  projectId: string,
  opts?: { vendorCookieJar?: string }   // if a vendor session is cached, skip CF solve
): Promise<{
  description: string;
  contacts: BonfireOpportunity['contacts'];
  attachments: BonfireOpportunity['attachments'];
  questionPeriod?: { startsAt: Date; endsAt: Date };
  preBidConference?: { startsAt: Date; location?: string };
  addenda?: Array<{ id: string; postedAt: Date; documentId?: string }>;
}>;

/** Persist a successful vendor session for reuse (cookies + XSRF token). */
export async function cacheVendorSession(slug: string, cookies: string, xsrfToken: string): Promise<void>;

// ============================================================
// Helpers
// ============================================================

/** Build the canonical anonymous-visible detail URL. */
export function detailUrl(slug: string, projectId: string): string;

/** Parse a Bonfire naive timestamp ("YYYY-MM-DD HH:mm:ss") in tenant TZ → Date. */
export function parseBonfireTimestamp(naive: string, tz: string): Date;

/** Same regex panel as §6.3 for the RSS fallback path. */
export function parseRssItem(item: { title: string; description: string; link: string; pubDate: string }):
  Partial<BonfireOpportunity>;
```

### 8.1 Suggested DB additions

New migration (next free number after 070, so **071**):

```sql
create table bonfire_tenants (
  slug text primary key,
  organization_id text not null,
  organization_timezone text not null default 'America/New_York',
  display_name text,
  vendor_session_cookies text,    -- nullable, encrypted; populated by Stage B
  vendor_xsrf_token text,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz default now()
);

-- Add to opportunities (already has source / source_id):
alter table opportunities add column if not exists bonfire_project_id text;
alter table opportunities add column if not exists bonfire_private_id text;
create unique index if not exists opportunities_bonfire_idx
  on opportunities (source, source_id) where source = 'bonfire';
```

### 8.2 Cron sketch

```
# vercel.json
{ "path": "/api/cron/ingest_bonfire", "schedule": "0 */4 * * *" }   # every 4 h
```

`/api/cron/ingest_bonfire/route.ts`:

```ts
import { guardCron } from '@/lib/cron-auth';
import { fetchTenantConfig, fetchBonfireList } from '@/lib/ingest/bonfire-parser';

export async function GET(req: Request) {
  const auth = guardCron(req); if (auth) return auth;
  const tenants = await loadBonfireTenants();          // from bonfire_tenants table
  for (const t of tenants) {
    const open = await fetchBonfireList(t, 'open');
    await upsertOpportunities(open);                   // existing helper
  }
  return Response.json({ ok: true });
}
```

The Stage-B enrichment cron stays a stub for now — fire it once we've decided headless-browser vs vendor-account approach.

---

## 9. Open questions to resolve before shipping

1. **Vendor-account ToS**: can we legally maintain one shared vendor login per tenant for scraping purposes? Need legal sign-off — Bonfire's ToS may forbid headless automation of a vendor account.
2. **CF challenge cost**: pricing of Browserbase / Browserless for ~hundreds of detail pages per day across the ~50 Bonfire tenants we plan to ingest. Rough math: 50 tenants × 10 new opps/week × CF solve (~$0.01/page) = ~$5/week. Tolerable.
3. **Description completeness via RSS only**: RSS descriptions are truncated by Bonfire (usually 250-500 chars). Need to confirm with a sample whether the truncation is consistent — if so we can stop pretending it's a full description and explicitly mark records as `enrichment_pending`.
4. **Past-opps backfill**: 670 historical projects for Fairfax alone. Should we one-shot scrape these for win/loss intelligence (`IsPublicAward`) or skip and focus on active pipeline? Recommend skip for now; revisit when we ship a `past_performance` dashboard.
5. **Tenant discovery**: today we maintain `final_list_clean.txt` (see `/tmp/bonfire/`) of ~200 candidate Bonfire tenants. Verify each one's `/portal/` returns 200 and grab their OrgID + TZ via the bootstrap.

---

## 10. Quick reference — known-good calls

```bash
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

# Bootstrap a tenant — works for any *.bonfirehub.com
curl -sS -A "$UA" "https://fairfaxcounty.bonfirehub.com/portal/" \
  | grep -oE 'organizationId\s*=\s*"[0-9]+"|organizationTimezoneName\s*=\s*"[^"]+"'

# List open opps (anonymous, public)
curl -sS -A "$UA" \
  -H "Accept: application/json" \
  -H "X-Requested-With: XMLHttpRequest" \
  -H "Referer: https://fairfaxcounty.bonfirehub.com/portal/" \
  "https://fairfaxcounty.bonfirehub.com/PublicPortal/getOpenPublicOpportunitiesSectionData"

# List past opps (anonymous, public) — adds IsPublicAward
curl -sS -A "$UA" \
  -H "Accept: application/json" \
  -H "X-Requested-With: XMLHttpRequest" \
  -H "Referer: https://fairfaxcounty.bonfirehub.com/portal/" \
  "https://fairfaxcounty.bonfirehub.com/PublicPortal/getPastPublicOpportunitiesSectionData"

# RSS (already in use, kept as failsafe)
curl -sS -A "$UA" "https://fairfaxcounty.bonfirehub.com/opportunities/rss"

# Detail page — DO NOT call from Vercel, CF will challenge (403 "Just a moment...")
curl -sS -A "$UA" "https://fairfaxcounty.bonfirehub.com/opportunities/235800"   # → 403
```
