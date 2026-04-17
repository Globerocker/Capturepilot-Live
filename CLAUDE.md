# Caturepilot 2.0 — Strategic Capture Intelligence Engine

## Stack
- **Frontend**: Next.js 16.1.6 (Turbopack), React 19, Tailwind CSS 4, TypeScript 5
- **Backend**: Supabase (Postgres), Vercel Serverless Functions (**Pro plan** — 40 cron limit, up to 300s maxDuration per route)
- **Observability**: Vercel Speed Insights + Analytics wired into root layout (`@vercel/speed-insights`, `@vercel/analytics`)
- **Python Tools**: SAM.gov ingestion, scoring, enrichment (in `/tools/`)
- **APIs**: SAM.gov, USASpending, SBIR.gov, Apollo.io, Resend, OpenAI, Stripe

## Build & Run
```
cd dashboard && npm run dev          # Dev server (port 3000)
cd dashboard && npm run build        # Production build
cd dashboard && npm run lint         # Lint check (ESLint v9 config currently broken, fix pending)
```

## Deploy
Push to `captiorpilot` and `live` remotes → Vercel auto-deploys from `dashboard/` subdirectory.
```
git push captiorpilot main && git push live main && git push globerocker main
```

## Key Rules
- Icons ONLY from `lucide-react` — never add icon libraries
- `"use client"` for all interactive pages
- Supabase joins return objects not arrays — cast with `as any[]` if needed
- **Use `!inner` on Supabase joins when filtering on the joined table** — otherwise `count` diverges from rendered rows (the row comes back with `opportunities: null` when the filter doesn't match)
- SAM API key via `X-Api-Key` header (NOT URL params — `?api_key=` is deprecated and can cause rejections)
- Apollo: use `mixed_companies/search` (free tier), NOT `mixed_people/search`
- Never commit `.env`, `.env.local`, `.mcp.json`
- When creating migrations, pick the next free number under `supabase/migrations/` (current latest: **041**)

## Architecture
- `/dashboard/src/app/(public)/` — Public pages (login, signup, check, admin)
- `/dashboard/src/app/(dashboard)/` — Authenticated SaaS dashboard
- `/dashboard/src/app/(portal)/` — Consulting client portal (light view)
- `/dashboard/src/app/(onboarding)/` — Onboarding flow
- `/dashboard/src/app/api/` — API routes (cron, admin, analyze, email, sam, sbir, partners, brand, ai)
- `/dashboard/src/lib/` — Shared libs (crawler, scoring, email, supabase, naics-codes, psc-codes)
- `/dashboard/src/components/` — Shared UI components
- `/tools/` — Python + Node enrichment scripts (numbered 1-21)
- `/dashboard/supabase/migrations/` — DB migrations (001-032)

## User Types
- `self_service` — SaaS users (full dashboard, self-onboarding)
- `consulting` — Managed clients (portal view, admin-onboarded, skip onboarding)
- `admin` — Internal team

## Cron Schedule (UTC)
- 02:00 daily: `ingest_sam` — fetch new SAM.gov opportunities
- 03:00 daily: `score_matches` — score opportunities for all users
- 04:00 weekly Sun: `db_cleanup` — lifecycle management
- 05:00 daily: `enrich` — contractor enrichment orchestrator
- 06:00 daily: `backfill_requirements` — extract requirements from raw_json
- 1st monthly: `monthly_awards` — fetch award + forecast notices

## Database (Supabase)
- `opportunities` — 37K+ federal opportunities with lifecycle status (ACTIVE/EXPIRING_SOON/MARKET_RESEARCH/DISCOVERED/EXPIRED/AWARDED)
- `user_profiles` — users with account_type (self_service/consulting/admin), includes `capability_statement`, `capability_statement_html`, `capability_statement_file_url`, `capability_statement_file_name`, `contact_name`, `contact_phone`, `notes` (JSON)
- `user_matches` — per-user opportunity scoring (score 0-1, classification HOT/WARM/COLD, is_saved, is_dismissed)
- `user_pursuits` — pipeline items with stages (discovered/researching/preparing/submitted/awarded/lost/no_bid)
- `user_action_items` — action checklists generated when a user starts pursuing an opportunity
- `client_tasks` — consulting client task management
- `client_documents` — document uploads (storage: `client-docs` bucket)
- `client_competitors` — competitor tracking per client (includes `crawl_data` JSON with services/leadership/social_links)
- `client_activity_log` — admin action audit trail
- `contractors` — 80K SAM.gov registered entities
- `contacts` — 91K SAM.gov opportunity contacts
- `naics_codes` / `psc_codes` — validation whitelists for ingestion

## Recent major changes (2026-04-17 — teaming intelligence)

**Three new tables via migrations 040 + 041**:

- `tribal_contractors` — curated directory of ~800 SBA-certified 8(a)/HUBZone/tribal firms (seeded from `tools/data/tribal-list.csv` via `tools/24_ingest_tribal_contractors.mjs`). Indexed by UEI, NAICS array (GIN), certifications (GIN), state.
- `prime_sblos` — Small Business Liaison Officer contacts at top-tier primes (BAE, Lockheed, Raytheon, GDIT, GE, Honeywell, Booz Allen, Leidos). Seeded in migration 041.
- `agency_spend_forecast` — per-agency FY/period unobligated-balance forecast (10 rows FY2026 Q4 seeded in 041). Unique on (agency, fiscal_year, fiscal_period).

**Partners page — "Certified Teaming" tab**: new source toggle above the SAM.gov search form that switches to the curated directory. Ranks by NAICS overlap with the caller's profile, lets users filter by cert (`8(a)`, `HUBZone`, `WOSB`, …) and save with the existing `savePartnerRaw` pipeline. Backed by `GET /api/partners/tribal`.

**Dashboard — Year-End Spend Radar widget**: new indigo/amber gradient card rendered below `DashboardMarketCard`. Pulls from `agency_spend_forecast`, flags rows whose `hot_naics` overlap the user's profile with a prefix match, shows total unobligated $ + top-3 agencies first. Backed by `GET /api/spend-radar`.

**Marketing site — Agency Pain Points resource**: `/resources/agency-pain-points` on `website/`. 8 pain-point cards, strengths-to-agencies matrix, 4-week action plan, structured-data (Article + FAQ + Breadcrumb JSON-LD). Added to `sitemap.ts`.

## Recent major changes (2026-04-16 — parallel agent sweep)

**Enrichment pipeline fixed** (was completely broken in production):
- `strategic_scoring` was empty on 100% of 57k opps. Now populated by new `/api/cron/strategic_scoring` + `/src/lib/strategic-scoring.ts` (deterministic rules).
- `ai_win_strategy` was empty on 100% — cron existed but wasn't in `vercel.json`. Now scheduled daily.
- `structured_requirements` empty on 94.7% — rewrote `backfill_requirements` cron to produce proper `scope_of_work` / `qualifications` / `deliverables` arrays.
- `/api/cron/enrich` tried to `exec("python ...")` which can't run on Vercel. Replaced with TS-native implementation.
- Latent `link_url` → `link` column mismatch causing silent upsert data loss. Fixed in ingest_sam, ingest_grants, monthly_awards.
- New admin endpoints: `POST /api/admin/enrich-opportunity/[id]` (single opp end-to-end), `POST /api/admin/backfill-enrichment` (up to 5k rows per call).
- After deploy, run backfill: `curl -X POST https://app/api/admin/backfill-enrichment -d '{"limit":5000,"only":"both"}'` repeatedly until all 57k are backfilled.

**Capability Statement**: full rewrite with proper PDF (branded header, color bands, structured sections), Quick Checker crawler prefill, SSE-streamed per-section progress, TipTap bubble-menu AI editing (improve/shorten/expand/tighten), Google Drive save via Supabase provider_token.

**AI Proposal**: moved to background job. New `proposal_jobs` table (migration 026). Generation runs fire-and-forget with `after()`. Per-section progress polled from `/api/ai/write-proposal/status/[jobId]`. Global `<RunningJobsIndicator>` in dashboard layout shows running jobs across navigation. `localStorage` persists active job across reloads.

**Opportunities**: three view modes (card/list/table with column picker), bulk XLSX export (capped 20) via `exceljs`, AI natural-language filter via gpt-4o-mini JSON mode (`/api/matches/ai-filter`). View choice + column picks persisted in localStorage per profile.

**Pipeline**: new `/pipeline/[pursuitId]` detail page with activity timeline + notes + action items. Notice-type tabs (All / Sources Sought / Pre-Solicitation / Solicitation). Custom stage renaming/reordering (config in `user_profiles.notes.pipeline_stages`). New `pipeline_activity` table (migration 027) logs stage/priority/note changes.

**Billing**: multi-step cancel flow with 50% retention offer → reason survey → typed confirmation. Stripe subscription uses `cancel_at_period_end` (soft cancel). Feedback persisted to `cancellation_feedback` (migration 028).

**Attachments**: "Analyze all attachments" button on opportunity detail runs a background job (migration 029) that downloads PDFs/DOCs via existing SAM proxy, uploads to Supabase Storage `opportunity-attachments` bucket, passes combined text to gpt-4o-mini (JSON mode), writes back to `opportunities.structured_requirements`. 30-day TTL via new `attachments_cached_until` column.

## Feature Map (by page)

### Dashboard (`/dashboard`)
- Top-match cards, active opportunities, hot/warm match counts, urgent deadlines
- Counts use `!inner` joins on opportunities with archive + active-status filters

### Opportunities / Matches (`/matches`)
- **View toggle**: "My Matches (≥50%)" vs "All Opportunities"
- **Filters**: classification (HOT/WARM/COLD/SAVED), notice type, set-aside, state, **NAICS prefix**, **security clearance**, **SBA certification**
- **Sort**: score / deadline / agency / notice type, asc/desc
- Server-side search with client-side refinement on joined fields

### Opportunity Detail (`/opportunities/[id]`)
- Auto-expanded description + attachments
- **Inline PDF preview** (click Eye icon) via `react-pdf` — keyboard nav ←/→/Esc
- Attachment downloads proxied through `/api/sam/attachment-download` (strips deprecated api_key, adds X-Api-Key header)
- AI email draft panel, HubSpot intro-call CTA
- Compact `<PursueButton>` with localStorage-backed X-dismiss

### Pipeline (`/pipeline`)
- **View toggle**: Kanban (default) / List
- **Kanban**: drag-and-drop between stages via `@dnd-kit`
- Custom deal creation modal
- Stage-specific service CTAs (capture call, proposal help, debrief coaching)

### AI Proposals (`/proposals`)
- Generates full proposal sections via OpenAI (gpt-4o-mini)
- **Requires capability statement** — 412 `CAPABILITY_STATEMENT_REQUIRED` + redirect if missing
- Per-section error logging (no more silent empty proposals)

### Capability Statement (`/capability-statement`)
- **TipTap rich-text editor** (bold/italic/underline/H2/lists/link)
- **Save to profile** (stores both HTML + plain text)
- **Download as PDF** via `jspdf`
- **Upload your own PDF/DOCX** to Supabase Storage (`client-docs` bucket, `capability-statements/{user_id}/` prefix)
- Voice recording (Web Speech API), paste transcript, or MP3 upload (Whisper)
- Brand extraction auto-fills transcript + differentiators when `/api/brand` returns extracted data

### Partners (`/partners`)
- **NAICS multi-select dropdown** with keyword search (matches code, label, + aliases like "IT", "HVAC", "janitorial")
- **States multi-select** with Select-All / Nationwide shortcut
- **Debounced live company-name search** (3+ chars, 500ms)
- Pre-fills from user profile's NAICS + target states
- API fans out (naics × state) in parallel against SAM.gov Entity API and de-dupes by UEI

### Competitors (`/competitors`)
- List view with overlap score, federal presence, revenue, employees
- **Detail page** at `/competitors/[id]`:
  - Services as name+description cards (not just badges)
  - Leadership w/ avatars
  - NAICS codes with labels
  - Past clients + locations
  - "Likely Bid Targets" section — joins `opportunities` on overlapping NAICS

### Settings (`/settings`)
- **Debounced autosave** (1.2s) on profile edits with status indicator
- **Advanced Settings** expanded by default
- **Google account link button** hides when Google is already linked
- Invoices section moved → lives on `/billing#invoices`

### Billing (`/billing`)
- **Upgrade to Pro** button now hits Stripe checkout (replaces hardcoded "You have full access")
- Monthly/yearly toggle (20% annual discount)
- Invoices & billing history (`<InvoicesSection>`) — relocated from Settings
- Consulting tier CTA → HubSpot call booking

### Onboarding (`/onboard`)
- **Personal contact person** fields (contact_name + contact_phone)
- **Nationwide state selector** — one-click select all 50 states
- NAICS search with keyword aliases

## Installed GitHub / NPM Libraries

| Library | Purpose | Where |
|---|---|---|
| `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` | Kanban pipeline drag-drop | `/components/pipeline/KanbanBoard.tsx` |
| `react-pdf` ([wojtekmaj/react-pdf](https://github.com/wojtekmaj/react-pdf)) | Inline PDF preview of opportunity attachments (SSR-off dynamic import; worker loaded from unpkg CDN) | `/components/PdfPreview.tsx` |
| `@tiptap/react` + StarterKit + Underline + Link | Rich-text editor for capability statement | `/app/(dashboard)/capability-statement/page.tsx` |
| `jspdf` | Client-side PDF generation for cap statement + proposal export | `/app/(dashboard)/capability-statement/page.tsx` |
| `openai` / Chat Completions API | Proposal writing, capability statement drafting, brand description extraction (gpt-4o-mini JSON mode) | `/api/ai/*`, `/api/brand/route.ts` |
| `@supabase/ssr` + `@supabase/supabase-js` | Auth + data access (server + client) | throughout |
| `stripe` + `@stripe/stripe-js` | Subscription management, checkout, portal, invoices | `/api/stripe/*` |
| `resend` | Transactional emails (welcome, task alerts, opportunity alerts) | `/lib/email/` |
| `@sentry/nextjs` | Error monitoring | global |
| `react-email-editor` (Unlayer) | Visual email template builder | `/api/email-templates/` |
| `@crawlee/cheerio` | HTML scraping for competitor/company analysis | `/lib/crawler/` |
| `@dnd-kit/core` + `@dnd-kit/sortable` | Kanban pipeline drag-drop | `/components/pipeline/KanbanBoard.tsx` |
| `react-pdf` | Inline PDF preview of attachments | `/components/PdfPreview.tsx` |
| `exceljs` | Bulk XLSX export of selected matches | `/api/matches/export/route.ts` |
| `lucide-react` | **Only allowed icon library** | everywhere |
| `clsx` + `tailwind-merge` | Conditional class composition | everywhere |

### Offline / Script-Only Tools (not in Vercel bundle)
| Tool | Purpose | Run via |
|---|---|---|
| [`dembrandt`](https://github.com/dembrandt/dembrandt) | One-command design-token extraction (logo, colors, typography, borders) using Playwright | `npx --yes dembrandt` from `tools/21_enrich_brand_tokens.mjs` — **cannot run in Vercel** (Playwright/Chromium exceeds 50 MB serverless limit) |

## API Routes (non-exhaustive)

### Opportunity / SAM data
- `GET /api/sam/attachments?noticeId=...` — list attachments (fixes deprecated api_key URL param)
- `GET /api/sam/attachment-download?url=...&name=...` — proxy download (SSRF-safe, sam.gov host allowlist, strips api_key, streams with proper Content-Disposition)
- `GET /api/sam/entity`, `POST /api/sam/description`
- `POST /api/matches/refresh` — re-score matches for current user

### AI
- `POST /api/ai/write-proposal` — generates proposal sections; **requires capability_statement** (412 `CAPABILITY_STATEMENT_REQUIRED`)
- `POST /api/ai/capability-statement` — drafts cap statement from brand + transcript + past projects
- `POST /api/brand` — extracts logo/colors/description from a website. Uses **HSL-based color filtering** (rejects near-white/near-black/desaturated grays) + **weighted scoring** (theme-color +5, CSS --primary vars +4, msapplication-TileColor +4, freq +1/occurrence). OpenAI JSON-mode extraction fills `company_description`, `services[]`, `differentiators` when `OPENAI_API_KEY` is set.

### Partners (teaming)
- `GET /api/partners/search?naics=...&naics=...&state=...&state=...&set_aside=...&keyword=...`
  - accepts **repeated** `naics` and `state` params
  - fans out across (NAICS × state) cartesian product (capped at 12 upstream calls), dedupes by UEI

### SBIR
- `GET /api/sbir/search?keyword=...&agency=...&open=true&limit=20` — proxies SBIR.gov solicitations API for small-business R&D opportunities not in SAM.gov. Source: [makegov/awesome-procurement-data](https://github.com/makegov/awesome-procurement-data).

### Stripe
- `POST /api/stripe/checkout` — creates session (30-day trial, monthly/yearly)
- `POST /api/stripe/portal` — customer portal
- `GET /api/stripe/subscription`, `GET /api/stripe/invoices`
- `POST /api/stripe/webhook`

### Admin
- `POST /api/admin/clients` — create consulting client (with temp password)
- `POST /api/admin/enrich-profile` — run full Quick Checker pipeline for a user profile
- `POST /api/admin/crawl-opportunities`

## /tools Scripts

Python pipeline (numbered 1–20): SAM ingestion, match scoring, enrichment, award intelligence, etc.

Node scripts:
- **`tools/21_enrich_brand_tokens.mjs`** — runs `dembrandt` locally against each user profile's website and merges design tokens into `user_profiles.notes.brand_tokens`. Usage:
  ```
  node tools/21_enrich_brand_tokens.mjs --all                  # every profile with a website
  node tools/21_enrich_brand_tokens.mjs <user_profile_id>      # one profile
  node tools/21_enrich_brand_tokens.mjs --website acme.com     # dry run, print tokens
  ```
  Requires `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_KEY` env vars.

## Supabase Storage buckets
- `client-docs` — consulting client document uploads + **capability statement uploads** (`capability-statements/{profile_id}/{timestamp}.ext`)
- `opportunity-attachments` — cached SAM.gov attachments (populated by deep_enrich cron)

## Git Remotes
- `origin` — capturepilot-v2 (legacy, has embedded token — don't use)
- `globerocker` — capturepilot-v3 (GitHub active)
- `captiorpilot` — CaptiorpilotV3 (Vercel auto-deploy)
- `live` — Capturepilot-Live (Vercel auto-deploy)
- Vercel URL: https://captiorpilot-v3.vercel.app
- Vercel root dir: `dashboard/`

## Known Issues / Backlog

### Known bugs (unresolved)
- **PSC/email display bug** (reported 2026-04-14 Americurial test): user saw email address rendered under "Product and Service Code" field during onboarding/settings. Code inspection found no mismapping — all UI bindings to `opp.psc_code` are correct, ingest validates against `psc_codes` whitelist. **Cannot reproduce without screenshot or live repro.**
- **ESLint v9 migration**: `eslint` expects `eslint.config.js` but repo has legacy `.eslintrc`. `npm run lint` fails — non-blocking for builds.

### Enrichment pipeline gaps (2026-04-14 user report)
- **Strategic Scoring / Structured Requirements / AI Win Strategy fields empty** on opportunity detail pages for most opps. The `/tools/` Python enrichment scripts (3_generate_email_drafts.py, 5_award_intelligence.py, etc.) appear disconnected from the dashboard — needs audit. Likely causes: cron not running, env missing on Vercel cron, or scripts crashing silently.
- **Market Intelligence fields empty** for common NAICS (e.g. 541511 spending / avg deal size). Need to audit whether tools/5 actually writes to the expected `market_intelligence` / `naics_stats` table.
- **Attachment documents not auto-crawled**: Only SAM.gov metadata fetched; no background download, OCR, or requirement extraction. Needs a new cron that fetches PDF/DOCX attachments, stores them in `opportunity-attachments` bucket, and runs OpenAI extraction into `structured_requirements`.

### Larger reworks backlog (deferred across sessions)

**Opportunity list & search**
- Multi-view toggle (card / list / HubSpot-style customizable table with column picker)
- Bulk Excel export with selection + row cap (max 10–20 per export)
- AI-assisted natural-language filter: user describes what they want in a sentence, LLM sets NAICS / set-aside / state / keyword filters automatically
- Full SAM.gov passthrough search when "All Opportunities" — currently capped at our 37K ingested rows

**Opportunity detail**
- "Analyze all attachments" button — background fetches PDFs, extracts requirements via OpenAI, fills `structured_requirements` + `ai_win_strategy`. Expiration/TTL to avoid DB bloat.
- Show real attachment filename + size before download instead of just "Download" button (done 2026-04-15 but needs polish)

**Pipeline**
- Split pipeline by notice type (Sources Sought / Pre-Solicitation / Solicitation) as separate boards
- Custom stage configuration (user-defined stages, rename, reorder)
- Deal detail page with activity history, notes timeline, contact log — currently cards aren't clickable
- Responsive full-width layout (done 2026-04-15 via max-w-7xl)

**Capability Statement**
- PDF export is a single text blob — needs proper formatting with brand logo, color bands, structured sections, contact block
- Markdown intermediate: render to MD then to PDF (same pipeline as Google Docs import)
- Save-to-Google-Drive integration (user already has Google OAuth linked via Supabase)
- Visual editor with text selection → AI edit (Gemini) for targeted passages
- Progress bar during drafting; run in background so user can switch to other tools without losing state
- Prefill from Quick Checker crawler (which works well) instead of bare brand extraction

**AI Proposal**
- Background job so generation persists when user navigates away (currently 5+ min foreground wait)
- Progress visualization per section (which section is writing now, word count so far)
- Integrate capability statement content into prompt (currently just uses company_description)

**Settings / Billing**
- Billing: cancel flow with retention (discount offer, reason survey, confirmation step)
- Settings: multi-column layout on wide screens instead of single long scroll
- Settings: Advanced Settings already defaults to expanded (verified 2026-04-15)

**Dashboard**
- Sidebar with quick-access Fixed tiles (Quick Checker / Drafter / Refresh Matches / Cap Statement)
- Overall dashboard speed — page loads are sluggish, needs profiling (likely waterfall Supabase queries that should parallelize)

**Partners**
- Bulk-add to pursuit / partner shortlist persistence
- NAICS dropdown wired to keyword search (done 2026-04-15) — replicate in opportunity filters (done)

**Competitors**
- Bulk-add competitors from SAM.gov contractor search
- Competitor comparison table (side-by-side NAICS overlap, revenue, past clients)

**Dembrandt integration**
- Cannot run in Vercel (Playwright/Chromium too large) — use offline script `tools/21_enrich_brand_tokens.mjs`.

## Guidelines for Future Work
- Ship small, ship often. Prefer editing existing files over creating new ones.
- When a bug is traced to Supabase join behavior, first suspect missing `!inner`.
- When adding OpenAI calls, always log failures explicitly and return meaningful errors instead of silent fallbacks.
- When adding user-uploaded files, use Supabase Storage with profile-scoped path prefixes and RLS, not base64 in DB columns.
- When adding new API routes that proxy external services, validate the hostname (avoid SSRF) and strip sensitive query params before forwarding.
