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
- When creating migrations, pick the next free number under `supabase/migrations/` (current latest: **141**)
- **Cron handlers must use `guardCron(req)` from `@/lib/cron-auth`** — fail-closed in production. See [CRON.md](CRON.md) for the complete cron + agent reference.
- **Any AI-writing prompt for user-facing copy must prepend `HUMAN_VOICE_RULES` from `@/lib/llm/humanizer`** so output matches the CapturePilot voice. Full style guide in [HUMANIZER.md](HUMANIZER.md). Invoke `/humanizer` to review or rewrite copy.
- **Admin handlers must call `assertAdmin()` from `@/lib/auth-admin`** at the top of every exported `GET`/`POST`/`PATCH`/`DELETE`. Returns `NextResponse` on reject; caller does `if (unauth) return unauth`. Re-run `node tools/30_smoke_admin.mjs --base <url>` after touching `/api/admin/**` to verify the gate is still there.
- **Public POST routes must call `protectCrawl(req, { route, maxPerMin })` from `@/lib/protect-crawl`** before any work — IP-bucketed rate limiter that killed the `/api/brand` enrichment-billing abuse pattern (2026-06-10 audit #15-18).
- **Storage reads from `client-docs` must use `signedDocUrl(sb, path, ttlSec)` from `@/lib/signed-doc-url`** — the bucket is private since migration 135. Never call `getPublicUrl()` on this bucket; it returns `null` and silently breaks the UI.
- **`POST /api/matches/refresh` is async** — it enqueues a `rescore_user_matches` worker job claimed by `/api/cron/run_worker_jobs_rescore`. The scoring runs inside `rescoreUserMatches()` from `@/lib/rescore-user-matches`. A Postgres AFTER UPDATE trigger on `user_profiles` (migration 137) auto-enqueues the same job whenever a scoring column changes — UI no longer needs to call refresh after every settings save.

## Architecture
- `/dashboard/src/app/(public)/` — Public pages (login, signup, check, admin)
- `/dashboard/src/app/(dashboard)/` — Authenticated SaaS dashboard
- `/dashboard/src/app/(portal)/` — Consulting client portal (light view)
- `/dashboard/src/app/(onboarding)/` — Onboarding flow
- `/dashboard/src/app/api/` — API routes (cron, admin, analyze, email, sam, sbir, partners, brand, ai)
- `/dashboard/src/lib/` — Shared libs (crawler, scoring, email, supabase, naics-codes, psc-codes)
- `/dashboard/src/components/` — Shared UI components
- `/tools/` — Python + Node enrichment scripts (numbered 1-21) + smoke/bulk harnesses (30+)
- `/dashboard/supabase/migrations/` — DB migrations (001-141)
- `/docs/platform-audit-2026-06-10/` — 137-finding audit deliverables (8 reports + raw JSON)

## User Types
- `self_service` — SaaS users (full dashboard, self-onboarding)
- `consulting` — Managed clients (portal view, admin-onboarded, skip onboarding)
- `admin` — Internal team

## Cron Schedule
**Full reference: [CRON.md](CRON.md)** — every scheduled task with what it does, what it writes, where the handler lives.

38 scheduled Vercel crons (Pro limit 40, 2 slots free after 2026-06-10 VPS migration). High-level groups:
- **Ingest** (8) — SAM.gov, Grants.gov, RSS, HigherGov, monthly awards
- **Scoring** (3) — score_matches, naics_stats_backfill, past_performance_stats
- **Worker queue lanes** (4) — `run_worker_jobs` (general HTTP), `run_worker_jobs_keywords` (extract_keywords drain, batch=150, maxDuration=300), `run_worker_jobs_attachments` (analyze_attachments, isolated from struct-reqs to kill priority inversion), `run_worker_jobs_rescore` (claims `rescore_user_matches` jobs — see "Async rescore" below)
- **Enrichment orchestrator** (1 cron drives 8 sub-tasks every 5-10 min)
- **Backlinks orchestrator** (1 cron drives 5 sub-agents daily by day-of-week)
- **Apollo/USAspending enrichment** (3)
- **Email + notifications** (5) — notify_matches, trial_reminders, scheduled_emails, market_watch_digest, outreach_send
- **Prospect pipeline** (2) — discover_new_prospects, enrich_prospects
- **Data quality** (1) — `backfill_opportunity_score` (computes `opportunities.opportunity_score` via `computeOpportunityScore()` — column was 78k/78k NULL pre-audit)
- **Other** (5) — db_cleanup, competitor_monitor, recompete_scan, sync_govtribe_activity, **publish_next_blog** (auto-publishes from `website/blog-topics.json`)

**VPS systemd timers** (6 low-frequency crons migrated off Vercel on 2026-06-10 to free ceiling slots, see `tools/vps-cron/` + `reference_vps_cron_pattern.md`):
- `ingest_fpds_awards`, `ingest_subawards`, `ingest_gsa_schedule`, `ingest_gsa_elibrary`, `ingest_calc`, `ingest_dol_wage_determinations`, `ingest_sec_filings_primes`, `forecast_change_detection` (daily / weekly cadences). Each timer hits the matching Vercel route over HTTPS with the `CRON_SECRET` bearer — same `guardCron()` gate, just driven from outside Vercel.

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
- `worker_jobs` — job queue (migration 086); fan-out trigger on opportunities insert. `dedup_key` extended in migration 137 to include `payload->>'user_profile_id'` so per-user rescore jobs no longer collide. Migration 119 added a 5-min zombie reaper (`worker_jobs_reaper`) that finalizes any `running` job past its lease.
- `portal_cookies` — CF clearance / session cookies per portal host, used by Playwright worker
- `pursuit_outcomes` — final disposition of a `user_pursuits` row (`won`/`lost`/`no_bid`/`withdrawn`, amount_awarded, lessons_learned). Captured by `POST /api/learning/pursuit-outcome` (migration 141).
- `proposal_edit_events` — diff between AI-generated proposal section and what the user shipped. Captured by `POST /api/learning/proposal-edit` (migration 141). Future training data for the proposal model.
- `match_engagement_events` — every click/dismiss/save/pursue/export action on a match card, posted from the UI to `POST /api/learning/match-event` (migration 141). Feeds the learning loop with implicit relevance signals.
- `outreach_optouts` — suppression list (email → reason → source). Populated by `/api/webhooks/resend` on bounce/complaint and by the HubSpot inbound webhook on unsubscribe (migration 134 added the `source` column). The shared `send()` helper in `@/lib/email.ts` checks this table before every send.
- `client_documents.storage_path` — added in migration 135 so app code persists the storage key alongside the (now-stale) public URL. Reads go through `signedDocUrl()`.
- `opportunities.opportunity_score` — deterministic 0-100 intrinsic value score independent of any user profile; populated by `/api/cron/backfill_opportunity_score` via `computeOpportunityScore()`. Pre-audit this column existed but no cron wrote to it (78k/78k NULL).

## Recent major changes (2026-06-10 — platform audit + weeks 1-4 roadmap)

End-to-end audit and the first four weeks of the post-audit roadmap shipped in a single session. 137 verified findings landed in [`docs/platform-audit-2026-06-10/`](docs/platform-audit-2026-06-10/) (8 synthesis docs + `99-raw-findings.json`). Every critical + high severity issue from `02-critical-issues.md` was closed; weeks 1-4 of `03-optimization-roadmap.md` shipped on top.

**Security hardening** (audit critical + high block):

- Migration 132 + 136 — `REVOKE EXECUTE … FROM anon, authenticated, PUBLIC` on 6 `SECURITY DEFINER` RPCs (`trigger_cron_route`, `purge_old_activity_log`, `enqueue_marketing_lead_apollo`, `enqueue_marketing_leads_apollo_backfill`, `compute_naics_market_stats`, `rls_auto_enable`). Pre-fix any anonymous client could fire any cron handler, wipe `client_activity_log`, or burn Apollo credits.
- Migration 138 — `ALTER FUNCTION … SET search_path = pg_catalog, public` on 16 `SECURITY DEFINER` + trigger functions, locking out search-path hijack attacks.
- Migration 139 — RLS read policies on 33 audit-flagged tables (audit logs, cron telemetry, queue tables) so the anon REST surface stops leaking.
- Migration 140 — `company_analyses` public-insert path now rate-limited + validated; previously any anonymous POST could bloat the table.
- `/api/admin/impersonate` token is now HMAC-signed via `@/lib/impersonate.ts` (`sign(payload)` returns first 32 hex chars of `sha256(secret|payload)`); every read re-verifies the signature. Cookie-tampering can no longer escalate to a target profile.
- `/api/brand` route — SSRF host allowlist + IDOR profile-id check + `protectCrawl()` rate limit. The pre-fix shape let an attacker enrich arbitrary domains against your OpenAI key.
- `/api/engine` + `/api/enrich` deleted — both were unauth ML-call shells that double-billed OpenAI usage with no user mapping.
- 6 AI routes (`/api/ai/write-proposal`, `/api/ai/capability-statement`, `/api/ai/improve-section`, `/api/ai/match-summary`, `/api/ai/email-draft`, `/api/ai/draft-rfp-response`) now require `requireUser()` from `@/lib/auth-server` — previously anonymous, abuse-prone.
- `/api/leads`, `/api/lead-magnet/deliver`, `/api/beta-invites` — auth gates restored + dedup-by-email so the same address can't trigger N sends. `/api/leads` also calls `protectCrawl()`.
- 8 cron routes that still relied on the old inline `CRON_SECRET` check migrated to `guardCron(req)` (`/api/cron/strategic_scoring`, `/api/cron/health_monitor`, `/api/cron/backfill_naics`, `/api/cron/recalc_contractor_rankings`, others). Fail-closed in production.
- HubSpot webhook (`/api/hubspot/webhook`) now fail-closed: missing signing secret returns 500 instead of accepting the payload, contact lookups require email, unauth signature mismatch returns 401.

**Async rescore + auto-rescore trigger** (R2 backend-async-rematch):

- `/api/matches/refresh` was synchronous — loaded 78k opportunities + scored + delete/upsert in one Vercel function. Hit 300s ceiling for any user with a wide profile; UI hung.
- Refactor: route enqueues a `rescore_user_matches` worker job with the profile id, returns immediately. New `/api/cron/run_worker_jobs_rescore` lane claims it and runs `rescoreUserMatches()` from `@/lib/rescore-user-matches.ts`. The `match.hot` webhook now fires AFTER the rescore actually finishes (was misleading before).
- Migration 137 — AFTER UPDATE trigger on `user_profiles` for any change to scoring columns (naics_codes, target_states, set_aside, capability_keywords, …) enqueues the same `rescore_user_matches` job. The existing dedup-key index coalesces rapid edits into one job. Settings autosave just works.
- UI now polls `/api/matches/refresh/status` and shows "Refreshing your matches…" with a spinner instead of hanging on a 5-min request.

**Queue platform improvements**:

- Migration 119 — `worker_jobs_reaper` scheduled function finalizes any `running` job past its lease (5-min default). Killed the burn-loop where a crashed handler left `dedup_key` blocked forever.
- Migration 133 — bulk DELETE for zombie `worker_jobs` rows older than 24h with status `running` — one-time cleanup after the reaper landed.
- `run_worker_jobs_keywords` — dedicated drain lane for `extract_keywords` with `batch_size=150` and `maxDuration=300` so the long tail of the 30k+ pending backlog drains in days, not weeks. New admin endpoint `/api/admin/drain_keywords_now` triggers it on demand.
- `run_worker_jobs_attachments` — isolated lane for `analyze_attachments` so OCR + LLM extraction can't starve `extract_structured_reqs` (priority inversion killed both at once before).

**Email — Resend webhook + suppression**:

- `/api/webhooks/resend` verified live (signature + replay protection). Bounces, complaints, and spam reports insert into `outreach_optouts` (migration 134 added the `source` column to record `resend:hard_bounce`, `resend:complaint`, `hubspot:unsubscribed`, etc.).
- HubSpot inbound webhook mirrors `hs_email_hard_bounced` / `hs_unsubscribed_from_all_email` into the same `outreach_optouts` table — single source of truth.
- `@/lib/email.ts` `send()` helper now checks `outreach_optouts` before every send. Log line `[email] {to} opted out ({reason}), skipping {key}` makes drops auditable. Suppression-list failure is non-blocking (logged but allows the send) so a transient Supabase blip doesn't black-hole transactional traffic.
- `sendRoleChangedEmail()` added so `/api/admin/clients` PATCH fires a notice when an admin flips an account_type.

**Storage hardening**:

- Migration 135 — `client-docs` bucket flipped to `public = false` + storage RLS keyed off `(storage.foldername(name))[2]` resolving to the caller's `user_profiles.id`. Three pages were calling `getPublicUrl()` and shipping forever-valid links.
- `client_documents.storage_path` column added so app code persists the storage key. New helper `signedDocUrl(sb, path, ttlSec)` from `@/lib/signed-doc-url.ts` mints short-lived URLs (default 300s). Every doc-render path migrated.

**Data quality**:

- `@/lib/opportunity-score.ts` + `/api/cron/backfill_opportunity_score` — populates `opportunities.opportunity_score` (0-100). Sources Sought / RFI = highest, set-asides boost, past-due deadline = heavy penalty.
- `/api/admin/env-health` extended with data-quality KPIs (`null_ai_win_strategy_pct`, `null_opportunity_score_pct`, queue depth, stale-cron count). `/admin/health` surfaces these as tiles.

**Onboarding/UX polish** (R2 settings-ux-tabs + matches-ui-polling):

- `/settings` Advanced Settings defaults open and is split into 4 internal tabs (Capacity / Industry / Codes / Targeting) instead of one 1200-line scroll.
- `/admin/users` row-action menu — role change (fires `sendRoleChangedEmail`), suspend, reset password, delete. Was previously read-only.
- `/matches` filters now run inside the Supabase query (was client-side filter on 500-row cap → divergent counts).

**Performance pass** (R2 perf streams):

- `/signup` + `/login` slimmed for sub-2.5s LCP: dynamic imports for non-critical UI, removed framer-motion from auth shell, server-rendered above-the-fold copy.
- `/terms` + `/privacy` set `export const dynamic = "force-static"` + minimal layout — they were re-rendering through the full dashboard chrome on every hit.
- 12 read-only public routes switched to `export const runtime = "edge"` (`/api/public/stats`, `/api/sbir/search`, `/api/sam/entity`, others).
- `/dashboard` parallelizes its 7 Supabase queries through `Promise.all` + Suspense boundaries; before it was 7 sequential awaits at ~1.8s p95 → now ~640ms p95.

**Learning loop foundation** (R2 W3-4.2):

- Migration 141 + `@/lib/learning-capture.ts` — three RLS-scoped tables (`pursuit_outcomes`, `proposal_edit_events`, `match_engagement_events`) plus capture endpoints `/api/learning/pursuit-outcome`, `/api/learning/proposal-edit`, `/api/learning/match-event`. Foundation only — training pipeline lands later.

**Lead-magnet → trial nurture** (R2 W3-4.3):

- 7-day drip + 3-feature trial prompt modal wired into the lead-magnet path. Drip respects `outreach_optouts`. Conversion event posts to `match_engagement_events` so we can measure pull-through.

**VPS cron migration** (R2 W3-4.1):

- 6 low-frequency Vercel crons moved to systemd timers on the Hostinger VPS (FPDS / subawards / GSA schedule / eLibrary / CALC / DoL wage / SEC filings / forecast change detection). Each timer hits the matching Vercel route over HTTPS with `Authorization: Bearer CRON_SECRET` so the same `guardCron()` gate enforces auth. Pattern documented in `reference_vps_cron_pattern.md`. Frees Vercel cron slots for higher-frequency jobs without giving up the route handler logic.

## Recent major changes (2026-05-26 — worker_jobs queue platform)

Turned the codebase into a job-queue system. Before this, enrichment work was a sprawl of 40 Vercel crons each doing batch passes. Now there's one table — `worker_jobs` — that any worker (Vercel or Railway) can claim from. Bottleneck removed.

**Migration 086** (`dashboard/supabase/migrations/086_worker_jobs_platform.sql`):
- `worker_jobs` table with `task_type`, `payload jsonb`, `priority`, `status`, `attempts`, generated `dedup_key` column.
- Partial unique index on `dedup_key WHERE status IN ('pending','running')` — prevents duplicate work in flight, allows re-queueing once done.
- `claim_jobs(task_types[], batch_size)` RPC — atomic claim via `FOR UPDATE SKIP LOCKED`.
- `finish_job(id, status, result, error)` RPC.
- Fan-out trigger `on_new_opportunity_enrich`: every opp INSERT fans out 3-5 enrichment jobs (`classify_naics`, `extract_structured_reqs`, `extract_keywords`, conditionally `scrape_portal_detail` for SLED + `analyze_attachments` for SAM).
- `portal_cookies` table caches CF clearance per host.

**Two consumers:**
- `/api/cron/run_worker_jobs` (Vercel) — handles HTTP-only task types: `classify_naics`, `extract_structured_reqs`, `extract_keywords`. Tops up `warm_cf_cookie` jobs at the start of each run if cookies are expiring within 6 min.
- `tools/playwright-worker/worker.js` (Railway, $5/mo Hobby plan) — handles browser task types: `scrape_portal_detail`, `warm_cf_cookie`. Uses `playwright-extra` + stealth plugin to defeat headless detection. Loads cookies from `portal_cookies` before navigating CF-protected portals (Bonfire, etc).

**Bulk backfill** (`/api/cron/enqueue_backfill`) re-enqueues every under-enriched opp + warms cookies for every known Bonfire host. Idempotent via `dedup_key`. Wired into orchestrator at `:30` hourly.

**Admin dashboard** at `/admin/queue` auto-refreshes every 10s, shows per-task-type counts (pending/running/done/failed), 5/30/60-min throughput, and the `portal_cookies` table with per-host expiry.

**Live counters**:
- `/api/public/stats` — anonymous, 5-min cached aggregate counts (federal_opps, sled_opps, contractors_tracked, etc).
- `components/LiveCounter.tsx` — reusable count-up component + `PublicStat` helper that fetches `/api/public/stats` and animates the target value into place. Used on the Quick Checker `AnalysisLoadingScreen`.

**Playwright worker quirks** (in `tools/playwright-worker/worker.js`):
- **No `--single-process`** flag — Chromium SIGSEGVs after first `context.close()` with stealth patches loaded. Multi-process (+150MB RAM) is stable.
- **Fresh browser per batch** — was per-tick, accumulated state crashed after ~5 batches.
- **2s sleep between batch browser launches** — back-to-back Chromium init occasionally SIGSEGV on Railway's container.
- **Stealth plugin loaded conditionally** — worker still boots if `playwright-extra` or `puppeteer-extra-plugin-stealth` aren't installed.
- **ws polyfill** — Playwright base image ships Node 20 which lacks native WebSocket; supabase-js realtime needs one or `createClient` throws.

**Cron orchestrator schedule additions**:
- `run_worker_jobs` — every orchestrator tick (also tops up cookie warmers).
- `enqueue_backfill` — :30 hourly.
- `discover_bonfire_tenants` — 04:00 UTC daily (probes 220+ slug seed list).
- `enrich_sled_descriptions` — :10 and :40 hourly.
- SAM attachment OCR runs via the `worker_jobs` queue (`analyze_attachments` task type, fan-out trigger on new SAM opps → claimed by `run_worker_jobs`). The standalone `/api/cron/analyze_match_attachments` route was deleted on 2026-06-08 because the task-type name collided with the per-opp queue handler.

**Bonfire CF defeat path** (commit `754d7a7f` + `3e9de51b`):
1. `warm_cf_cookie` task opens portal homepage in stealth Chromium, sits through JS challenge, harvests `cf_clearance` + `__cf_bm` cookies.
2. `portal_cookies` table stores them keyed by host with `expires_at`.
3. `scrape_portal_detail` loads cookies into the context BEFORE navigating → Bonfire serves the real SPA instead of the challenge.
4. `run_worker_jobs` auto-refreshes cookies expiring within 6 min.

**SEO/LLM** (commit `dd2a030` on website):
- `website/app/robots.ts` explicitly allows GPTBot, ClaudeBot, PerplexityBot, Google-Extended, Bytespider, Amazonbot, Applebot-Extended, Meta-ExternalAgent, CCBot, etc. We want to be cited in AI answers.

## Recent major changes (2026-05-22 — admin-panel hardening + cleanup)

Four-phase rework of `/admin/*` after a security + dead-code audit. Detailed audit lives in commit history; the deliverables:

**Phase 1 — security hotfix** (commit `48b0a7a9`):

- New [`src/lib/auth-admin.ts`](dashboard/src/lib/auth-admin.ts) exposes `assertAdmin()` (returns the 401/403 NextResponse) and `assertAdminWithUser()` (also returns the caller's id/email). Canonical column is `auth_user_id` — every admin route now uses this helper.
- 30 unprotected admin-API routes gated. Pre-fix, `GET /api/admin/users` was a public dump of every auth user; `PATCH /api/admin/users` was a public password reset. Same category for `/api/admin/{beta-invites, enrich-profile, enrich-opportunity, leads/*, send-update, send-test-email, competitors, documents, academy, email-settings, email-templates, crawl-opportunities, enrich-contractors, enrich-campaign-audience, backfill-enrichment, sam-debug, tasks, clients, backlinks/*}`.
- Admin shell layout now redirects non-admins to `/dashboard` after `getUser()` (was only checking for any session).
- Bug-fix nebenbei: `cron-trigger` + `cron-runs` queried `user_profiles.user_id` (column doesn't exist) → "Run now" buttons in `/admin/crons` always 403'd. Both now use the shared helper.

**Phase 2 — code-friedhof aufgeräumt** (commits `b902cc66` + `8397095e`):

- New [`src/lib/cron-auth.ts`](dashboard/src/lib/cron-auth.ts) exposes `guardCron(req)` + `isAuthorizedCron(authHeader)` — fail-closed in production. 31 cron routes migrated off the duplicated inline pattern (`if (process.env.CRON_SECRET) {...}` silently bypassed every cron when the env var was unset).
- 3 orphaned admin pages stub'd to `redirect()` (analog zur bestehenden `/admin/users` redirect): `/admin/lead-check` → `/admin/leads`, `/admin/lead-check/[analysisId]` → `/check/[analysisId]`, `/admin/prospects` → `/admin/leads`. Net delete ~3,800 lines.
- `opportunities/page.tsx`: dropped duplicate local `fmtCurrency` that shadowed the shared `@/lib/display-helpers` import (local stopped at millions, broke 1B+ values); removed 6 unused lucide imports.
- `tools/page.tsx`: hardcoded "9 jobs" cron block replaced with live `/api/admin/cron-runs` pull (actual count: 35 today); 6 `document.getElementById`-pattern inputs/selects converted to controlled `useState`.

**Phase 3 — features** (commit `26dcf19b`):

- Push-Opportunity-to-Client folded into `/admin/opportunities` as a per-row modal: every row has a "Send" button that opens a client-picker + stage + priority + customer-message + next-steps form, pre-filled with the row's notice. Same backing API (`POST /api/admin/push-opportunity`). `/admin/push-opportunity` is now a 9-line redirect-stub.
- Bulk Email button on `/admin/clients` hardened: previous version did `.catch(() => {})` so all failures were silently swallowed. New version: visible counter "Sending… 12/50", 600 ms throttle (under Resend's 2/sec free-tier ceiling), per-send try/catch, final tally includes failure count + first 3 failing companies + their error messages.
- `/api/admin/env-health`: added live reachability probes for Resend (GET /domains), Stripe (GET /v1/balance), and Supabase (HEAD count on `opportunities`). New `cron_summary` payload returns last_run / last_status / runs_7d per cron route, stalest first.
- `/admin/health` page rewritten in the light theme to match the admin chrome; KPI strip (Healthy / Failing / Not configured / Total) + cron-status table feeding off the new `cron_summary`.
- `/admin/settings` API-Keys section: was hardcoded `"Configured"` per key (lied if a key was unset). Now pulls from `/api/admin/env-health` and shows real per-key state with refresh button + link to `/admin/health` for the full view.

**Phase 4 — verification + housekeeping**:

- New [`tools/30_smoke_admin.mjs`](tools/30_smoke_admin.mjs): Node script (no Playwright dep) that hits every `/admin/*` page + every `/api/admin/*` route unauthenticated and asserts the gate fires. Catches the most common regression class — accidentally removing `assertAdmin()`. Run via `node tools/30_smoke_admin.mjs --base https://captiorpilot-v3.vercel.app`. Exits non-zero if any check fails (CI-friendly).
- Type-cleanup in `/admin/leads`: dropped 7 `as any` casts on `inferred_profile` by introducing an `InferredProfile` interface that types the JSON blob's known fields (`contact_person`, `synced_to_hubspot`, `pipeline_status`, …) without losing the index signature for unknown keys.
- Reference docs: [`CRON.md`](CRON.md) catalogs all 35 scheduled tasks (schedule, what they write, how to debug). [`USER_TASKS.md`](USER_TASKS.md) is the active "things only you can do" punch-list (env vars, migrations, ad-platform connections).

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
| `@vercel/speed-insights` + `@vercel/analytics` | RUM + page-view telemetry wired into root layout | `dashboard/src/app/layout.tsx` |
| Microsoft Clarity | Session replay + heatmaps (added 2026-06 for lead-magnet funnel debugging) | root layout |

### Offline / Script-Only Tools (not in Vercel bundle)
| Tool | Purpose | Run via |
|---|---|---|
| [`dembrandt`](https://github.com/dembrandt/dembrandt) | One-command design-token extraction (logo, colors, typography, borders) using Playwright | `npx --yes dembrandt` from `tools/21_enrich_brand_tokens.mjs` — **cannot run in Vercel** (Playwright/Chromium exceeds 50 MB serverless limit) |

## API Routes (non-exhaustive)

### Opportunity / SAM data
- `GET /api/sam/attachments?noticeId=...` — list attachments (fixes deprecated api_key URL param)
- `GET /api/sam/attachment-download?url=...&name=...` — proxy download (SSRF-safe, sam.gov host allowlist, strips api_key, streams with proper Content-Disposition)
- `GET /api/sam/entity`, `POST /api/sam/description`
- `POST /api/matches/refresh` — enqueues `rescore_user_matches` worker job and returns immediately. Poll `GET /api/matches/refresh/status` for completion. Pre-2026-06-10 this ran inline and hung past 300s.

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
- `POST /api/admin/clients` — create consulting client (with temp password); PATCH for role change fires `sendRoleChangedEmail`
- `POST /api/admin/enrich-profile` — run full Quick Checker pipeline for a user profile
- `POST /api/admin/crawl-opportunities`
- `POST /api/admin/impersonate` — sets HMAC-signed cookie (see `@/lib/impersonate.ts`); every read re-verifies signature
- `POST /api/admin/drain_keywords_now` — manually fire the keywords drain lane (long backlog tool)
- `POST /api/admin/users` — row-action endpoints: role change, suspend, reset password, delete (admin shell row menu)

### Learning loop (2026-06-10)
- `POST /api/learning/pursuit-outcome` — capture final disposition of a `user_pursuits` row
- `POST /api/learning/proposal-edit` — capture diff between AI section and shipped section
- `POST /api/learning/match-event` — fire from match cards for click/dismiss/save/pursue/export

### Webhooks
- `POST /api/webhooks/resend` — signature-verified Resend events → `outreach_optouts` (hard_bounce, complaint, spam)
- `POST /api/hubspot/webhook` — fail-closed signature gate; mirrors HubSpot suppression into `outreach_optouts`

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

- **`tools/30_smoke_admin.mjs`** — security-regression smoke test for `/admin/*`. Unauthenticated hit on every admin page (expects 302/307/200-with-client-guard) + every admin API route (expects 401/403). Exit non-zero on any failure. Usage:

  ```bash
  node tools/30_smoke_admin.mjs --base https://captiorpilot-v3.vercel.app
  node tools/30_smoke_admin.mjs --base http://localhost:3000 --verbose
  ```

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
- **ESLint v9 migration**: still open as of 2026-06-10. `dashboard/` has no `eslint.config.mjs` or `.eslintrc` — `npm run lint` fails fast. Non-blocking for builds (Next.js skips lint during prod build). Round-2 roadmap to add a minimal flat-config + re-enable in CI.

### Open backlog (deferred across sessions)

Items already shipped — see "Recent major changes" sections (2026-04-16, 2026-04-17, 2026-05-22, 2026-05-26, 2026-06-10) — are not repeated here. Anything below is still open.

#### 2026-06-10 audit deferrals

- **Learning loop training pipeline** — capture endpoints + tables exist (migration 141) but the actual training job that consumes `pursuit_outcomes` + `proposal_edit_events` + `match_engagement_events` is not yet wired. Lands in a future round.
- **Past-performance graph + auto-pursuit recommendations + Enterprise tier** — market-leadership plays from `08-market-leadership-opportunities.md`, queued for Round 2.
- **Sentry coverage** — `@sentry/nextjs` is installed but DSN coverage on cron + admin routes is uneven. Round-2 to instrument every route + add a Sentry breadcrumb on every `guardCron` reject.
- **`tools/30_smoke_admin.mjs --admin-cookie` happy-path mode** — still open from 2026-05-22 Phase-5.
- **CLAUDE.md doc rotation** — this file is now ~470 lines; consider splitting the change-log sections into a dated `CHANGELOG.md` so the top stays terse.

#### Opportunity list & search

- Full SAM.gov passthrough search when "All Opportunities" — currently capped at our 37K ingested rows.

#### Market intelligence

- Common NAICS (e.g. 541511) still missing market-intelligence rollups (spend / avg deal size / agency mix). Need to audit whether `naics_stats` is populated end-to-end and surface a fallback when it isn't.

#### Dashboard

- Sidebar with quick-access fixed tiles (Quick Checker / Drafter / Refresh Matches / Cap Statement).
- Overall dashboard speed — page loads are sluggish, needs profiling (likely waterfall Supabase queries that should parallelize).

#### Partners

- Bulk-add to pursuit / partner shortlist persistence.

#### Competitors

- Bulk-add competitors from SAM.gov contractor search.
- Competitor comparison table (side-by-side NAICS overlap, revenue, past clients).

#### Settings

- Multi-column layout on wide screens instead of single long scroll.

#### Dembrandt integration

- Cannot run in Vercel (Playwright/Chromium too large) — use offline script `tools/21_enrich_brand_tokens.mjs`.

#### Admin smoke tests

- `tools/30_smoke_admin.mjs` currently covers gate-presence only (401 on every admin API unauthenticated). Phase-5 follow-up: optional `--admin-cookie` mode that uses a CI test account to verify the happy-path (200 with expected JSON shape) for each endpoint.

## Guidelines for Future Work
- Ship small, ship often. Prefer editing existing files over creating new ones.
- When a bug is traced to Supabase join behavior, first suspect missing `!inner`.
- When adding OpenAI calls, always log failures explicitly and return meaningful errors instead of silent fallbacks.
- When adding user-uploaded files, use Supabase Storage with profile-scoped path prefixes and RLS, not base64 in DB columns.
- When adding new API routes that proxy external services, validate the hostname (avoid SSRF) and strip sensitive query params before forwarding.
