# Technical Debt Report

This is the long-term work — the stuff that doesn't show up as a P0 outage but quietly drags the team down every week. Most of it is the cost of moving fast: copies of the same helper drift apart, dependencies get added then forgotten, observability stops at "console.warn", and crons multiply until the Vercel limit forces a reckoning.

If we did nothing else from this list for the next quarter except the four refactor proposals at the bottom, the dashboard would be measurably smaller, faster, and easier to reason about.

## Debt themes

**Duplicated helpers everywhere.** The same small functions are reimplemented across the codebase, and each copy has drifted slightly. There are 16 inline `fmtCurrency` definitions (three in a single file — `check/[analysisId]/page.tsx`), 12 `formatDate/timeAgo` variants, 7 `normalizeUrl` implementations with different escape rules, 5 `escapeHtml` copies, and a canonical `src/lib/display-helpers.ts` that almost nobody imports. Every fix has to be made N times, and every drift is a future bug. Same pattern at a coarser scale: two `extractStructuredRequirements` exports clobber each other on the same `opportunities.structured_requirements` column, and two `scoreOpportunity*` functions classify the same opp as HOT or WARM depending on which user flow you came from.

**Cron sprawl and the 40-cron ceiling.** Vercel Pro caps at 40 scheduled functions and we're at 40/40 — adding any new cron now requires displacing an existing one. 78 cron route files exist on disk; about 39 are never scheduled at all (some are admin-triggered, some are dead, some are orchestrator-only). Five low-frequency weekly ingest crons could move to the Hostinger VPS systemd timers and free slots that finding #2 in the queue audit desperately needs (a dedicated `extract_keywords` drainer). The CRON.md doc claims 35 tasks, vercel.json has 40, the orchestrator dispatches ~22 sub-tasks — nobody can tell at a glance what's live.

**Observability stops at `console.warn`.** Several silent-failure paths burn money or destroy UX with zero signal. `match-summary.ts` swallows every OpenAI failure into a fallback string with no log line — during a rate-limit window, all 10 per-match summaries silently degrade and the user sees "completed". `summarize-document` catches file-fetch failures into an empty 500. The deep-extract LLM cascade falls back to heuristic extraction with no DB column to mark it. SMS partner-alert failures only `console.warn` — no `sms_events` table, no admin counter, so when Sergio stops getting lead alerts we find out by him calling us. `analyze_attachments` failure rate hit 88% lifetime (since fixed in commit 9e929569, per refutation) but nobody had an alert on it — we discovered it in the audit.

**Dead code that looks alive.** Eight npm dependencies are declared but never imported (`@crawlee/cheerio`, `@mendable/firecrawl-js`, `@pdfme/common`, `@pdfme/generator`, `docx`, `pdf-lib`, `react-grid-layout`, `tailwind-merge`) — ~150MB of node_modules and a `serverExternalPackages` line in `next.config.ts` for Crawlee that no code uses. Four lib files export helpers no caller imports (~314 LOC across `veteran.ts`, `impersonate.ts`, `subscription.ts`, `api-contracts.ts`). Three legacy crawler files at ~1061 LOC sit under `src/lib/crawler/` from before the Quick Checker rewrite. A stray `dashboard/18_bulk_hubspot_sync.ts` at app root would crash on first run because its `dotenv` import isn't in `package.json`.

**The schema is full of "RLS on, no policies" tables and ambiguous identity columns.** 32-33 tables have RLS enabled with zero policies — they return empty to anon and authenticated, but service-role bypasses everything, so the security model is incoherent. 36 tables key user-scoped data on `user_profile_id`, 4 on `auth_user_id`, 2 on `profile_id`, and CLAUDE.md already documents one regression (`cron-runs` queried `user_profiles.user_id`, a column that doesn't exist, and silently 403'd every "Run now" button). Four duplicate-numbered migration files exist (019, 039, 060, 062) — these are documented as intentional in `dashboard/supabase/migrations/README.md`, but new contributors don't read that README first.

## Specific items, by file/system

### `dashboard/src/lib/` — duplicated helpers

- **16 inline `fmtCurrency` / `formatCurrency` copies** vs canonical `src/lib/display-helpers.ts:57`. Worst offender: `check/[analysisId]/page.tsx` defines it three times in one file (lines 468, 805, 1634). Some cap at M, some go to B, some use locale strings.
- **12 inline `formatDate` / `fmtDate` / `timeAgo` copies** vs canonical `display-helpers.ts:66`.
- **7 `normalizeUrl` implementations** — some force https, some strip trailing slashes, some keep. Sits in the analyze-company → quick-checker → lead-brief pipeline; one helper might re-introduce a scheme the previous one stripped.
- **5 identical `escapeHtml` four-liners** across `send_daily_digest/route.ts`, `capability-statement/page.tsx`, `lead-magnets.ts`, `lead-brief.ts`, `backlinks/draft-generator.ts`.

### `dashboard/src/lib/` — duplicated business logic

- **`extract-requirements.ts` (regex, 140 LOC) vs `extract-structured-requirements.ts` (AI, 143 LOC)** — both export `extractStructuredRequirements`, both write to `opportunities.structured_requirements` with different field shapes. Six routes use the regex version, two use the AI version. Last writer wins, UI surfaces inconsistent fields.
- **`match-scoring.ts`** has `scoreOpportunityLeadMagnet` (HOT ≥ 0.65) and `scoreOpportunity` (HOT ≥ 0.70) with ~60% overlapping field logic. Same opp classified differently depending on whether the user is logged in.
- **`lead-brief.ts`** duplicates the NAICS inference prompt verbatim between `generateLeadBrief` and `previewLeadBrief` with subtly different system-prompt wording.
- **`ai_strategy` cron + `bulk_enrich_ai` cron + `summarize-document` route** all write to `opportunities.ai_win_strategy` with three different JSON shapes. Different temperatures, different `max_tokens`, only one uses `response_format: json_object`.

### `dashboard/src/lib/` — dead files (~314 LOC + 1061 LOC)

- `src/lib/veteran.ts` (43 lines) — `isVeteranEligible`, `veteranCertLabel`, `VETERAN_DISCOUNT_PERCENT` exported, zero importers.
- `src/lib/impersonate.ts` (39 lines) — `decodeImpersonateToken` exported. The live `api/admin/impersonate/route.ts` doesn't import it.
- `src/lib/subscription.ts` (43 lines) — only self-references.
- `src/lib/api-contracts.ts` (189 lines of Zod schemas) — comment claims smoke tests parse responses against them. No test does.
- `src/lib/crawler/extractors.ts` (948 lines), `sitemap.ts` (75), `ssrf.ts` (38) — all marked "Ported from tools/17_analyze_company.py" and superseded by `@/lib/quick-checker`. Zero importers.
- `src/lib/backlinks/searxng.ts` (96 lines) — string `'searxng'` referenced in a health check; function never called.
- `src/components/Toast.tsx` and `src/components/NaicsSelectionGate.tsx` — defined, never imported. Live toast is in `GlobalToast.tsx`.

### `dashboard/` (root) — orphans

- `dashboard/18_bulk_hubspot_sync.ts` (264 lines) — imports `dotenv` which isn't in `package.json`. Would crash on first run. Sits at app root instead of `/tools`.
- `dashboard/progress.md` (6 lines, duplicated content from March).
- `dashboard/PLATFORM_AUDIT.md` (253 lines, dated March 15 2026 — three months stale).

### `dashboard/package.json` — unused deps (~150MB savings)

`@crawlee/cheerio`, `@mendable/firecrawl-js`, `@pdfme/common`, `@pdfme/generator`, `docx`, `pdf-lib`, `react-grid-layout`, `@types/react-grid-layout`, `tailwind-merge`. Firecrawl is called via raw `fetch` to the REST API in `quick-checker/firecrawl.ts`; `docx` is only referenced as a file-extension string; the others have zero references. `next.config.ts:4` still lists `@crawlee/*` in `serverExternalPackages`.

### `dashboard/src/app/api/cron/**` — sprawl

- **40/40 Vercel cron slots used.** Five weekly ingest crons (`ingest_calc`, `ingest_dol_wage_determinations`, `ingest_gsa_elibrary`, `ingest_sec_filings_primes`, `ingest_subawards`), one monthly (`ingest_federal_hierarchy`), and `compute_public_stats` (every 10 min, trivial COUNT queries) are prime candidates to move to Hostinger VPS systemd timers — freeing ~7 slots for dedicated worker-job drainers.
- **39 cron route files on disk are never scheduled.** ~22 are orchestrator-dispatched; that leaves ~10 routes that are neither scheduled nor dispatched: `backfill_extracted_contacts`, `backfill_naics`, `backfill_structured_requirements`, `beta_deadline`, `cleanup_contractor_pages`, `enrich_apollo`, `enrich_la_ramp`, `voice_brief_process`, `compute_past_performance_stats` (last manually triggered 2026-06-08).
- **CRON.md isn't auto-synced** with `vercel.json` + orchestrator TASKS map + backlinks_orchestrator dispatch. Three sources of truth, all drift independently.

### `dashboard/src/app/api/ai/**` — observability gaps

- `match-summary.ts:151-158` — silent fallback string on OpenAI failure. No log, no telemetry, no count on `company_analyses`.
- `summarize-document/route.ts:84-101` — file fetch failures swallowed by empty catch. `if (!response.ok)` returns opaque 500 without OpenAI's response body.
- `voice-brief/route.ts:217-233` — no `if (!r.ok)` check. On OpenAI failure the literal string "Unable to summarize the brief." becomes the TTS narration. Job marks "complete".
- `quick-checker/deep-extract.ts:366-369` — LLM cascade falls back to heuristic extraction. The `errors[]` array is returned but `quick-checker-finish.ts` reads `crawl_data`, not `errors`, so the signal never reaches the DB.
- `lib/lead-brief.ts:311-349` — `quickWebsiteSummary` returns `null` on LLM failure but the renderer always shows "site blocked the crawler", misattributing the cause.

### `dashboard/src/app/api/ai/**` — voice rule drift

- `capture-brief/route.ts:34-48`, `capability-matrix/route.ts:44-71`, `compliance-matrix/route.ts:46-75`, `competitor-suggest/route.ts:66`, `summarize-document/route.ts:117` — none prepend `HUMAN_VOICE_RULES`. The CLAUDE.md rule says every AI-writing prompt for user-facing copy must include it; these five don't.
- `competitor-suggest/route.ts:64` — uses `model: 'gpt-4o'` (16× cost of mini) for a task on par with ai-filter and keywords/suggest, both of which use mini correctly.
- `ai-filter/route.ts:83` — inlines `NAICS_CODES.slice(0,60)` into the system prompt every call (~450 tokens) without OpenAI prompt-caching placement.

### `dashboard/src/components/layout/Sidebar.tsx`

14 top-level items + 7 children = 21 ungrouped nav targets. No visual hierarchy. "Recompetes" / "Contract Winners" / "Opportunities" / "Forecasts" overlap conceptually. New users don't know where anything is.

### `dashboard/supabase/migrations/`

- Four duplicate-numbered pairs (019, 039, 060, 062) — flagged in audit but **documented as intentional and frozen** in `dashboard/supabase/migrations/README.md`. See "What NOT to clean up".
- CLAUDE.md says "current latest: 070" — real latest is 131. Devs are guessing the next number.
- 33 tables have RLS enabled with zero policies (see security report).
- 17 SECURITY DEFINER functions have mutable `search_path`.
- Mixed identity columns: 36 tables on `user_profile_id`, 4 on `auth_user_id`, 2 on `profile_id`. `slack_installations` has both `user_id` and `user_profile_id`.

### Database — scale and cleanup

- `opportunities` has redundant unique indexes on `notice_id` (PK + extra unique) and `id` (PK-ish + extra unique + btree). `idx_opps_is_archived` is subsumed by `idx_opps_is_archived_posted_date`.
- GIN indexes on `contractors.naics_codes`, `contractors.fts`, `contractors.certifications`, `opportunities.extracted_keywords` have `idx_scan=0`. Built but never used. Meanwhile `contractors` shows 3,781 sequential scans reading 188M tuples — query patterns bypass the GINs.
- 8 mutable tables have no `updated_at` column: `attachment_analysis_jobs`, `client_competitors`, `client_documents`, `health_alerts`, `marketing_leads`, `plan_tiers`, `user_action_items`, `user_pursuits`.
- `cron_runs`, `alert_autofixes`, `scheduled_emails`, `reengage_sends` grow unbounded. No archive cron.
- Three near-duplicate `extract_structured_reqs_*` task types fragment the queue.
- Staging table `_backfill_targets_federal_2026_06_08` (100 rows) and 11 other empty/single-purpose tables (`matches`, `capture_outcomes`, `saved_searches`, `user_notifications`, etc.) clutter the schema.

### Resend / SMS / HubSpot integration

- Four different `From` addresses (`noreply@`, `andre@`, `briefs@`, `alerts@`) — each needs separate DKIM/SPF. If even one isn't verified, those emails spam-folder silently.
- `email_templates` table is empty in production — the entire Unlayer custom-template feature is dead code today (loader runs on every send, falls through to code defaults).
- HubSpot client falls back through three env vars (`HUBSPOT_API_KEY || HUBSPOT_ACCESS_TOKEN || HUBSPOT_PRIVATE_APP_TOKEN`). No expiry tracking despite the user's stated rule that every key needs a rotation countdown.
- SMS recipient list parsed from env on every send (`SMS_PARTNER_PHONES`). No DB-side recipient table, no admin UI — changes require a Vercel redeploy.
- Stripe handlers do `.catch(console.error)` fire-and-forget on every HubSpot sync call (webhook lines 138, 141, 152, 154, 199, 224, 249). No retry queue.

## Refactor proposals

These are the small consolidations that eliminate whole categories of debt.

**1. `src/lib/display-helpers.ts` becomes the only source for formatters.** Move `fmtCurrency`, `fmtDate`, `timeAgo`, `escapeHtml`, `normalizeUrl` into one barrel; add an ESLint `no-restricted-syntax` rule banning local definitions named `fmt*`, `format*`, `escapeHtml`, `normalizeUrl`. Delete 16 currency copies, 12 date copies, 7 URL copies, 5 HTML-escape copies. **Replaces ~50 inline definitions across 40+ files.**

**2. `src/lib/ai-win-strategy.ts` becomes the single AI-strategy generator.** One prompt, one Zod-validated return shape, JSON-mode on. Both `ai_strategy` and `bulk_enrich_ai` crons call into it. `summarize-document` writes to a new `ai_document_summary` column instead of clobbering `ai_win_strategy`. **Replaces three competing writers on one DB column.**

**3. Lifted `CapabilityStatementBuilder` shared between dashboard + portal.** Dashboard cap-statement page is 704 lines (TipTap, streaming progress, PDF, Drive save); portal version is 322 lines (textarea + one button). Lift the dashboard implementation into `src/components/capability-statement/` and import from both surfaces — consulting clients get the premium tool they pay for.

**4. `extract-structured-requirements.ts` (AI) becomes the only extractor.** Make it return a superset that includes the regex version's fields (`scope_of_work`, `requirements`, `qualifications`, `deliverables`) plus the AI version's (`min_workforce`, `years_experience`, `performance_period`). Re-point 6 callers, delete `extract-requirements.ts`. **Replaces dual-writer drift on `opportunities.structured_requirements`.**

**5. Cron-doc auto-generator.** A `npm run cron:audit` script that reads `vercel.json` + the orchestrator TASKS map + backlinks dispatch and regenerates `CRON.md` with `[VERCEL]`, `[ORCHESTRATOR]`, `[BACKLINKS]` tags. Also flags any route file with no schedule and no dispatch. Eliminates the documentation rot that made this audit harder than it needed to be.

**6. Shared `PortalContext` provider for portal pages.** Lift `auth.getUser()` + `profile.id` resolution into the portal layout. Child pages currently re-fetch both on mount (3-4 round-trips per page open). One-shot fix for `portal/page.tsx`, `portal/pipeline/page.tsx`, `portal/opportunities/page.tsx`, `portal/messages/page.tsx`.

## What NOT to clean up

These look like debt but are load-bearing or intentional. Leave them alone.

- **Duplicate-numbered migrations (019/039/060/062).** `dashboard/supabase/migrations/README.md` explicitly documents these as "Known historical conflicts" that have shipped to prod, are frozen by design, and apply in deterministic alphabetical-by-suffix order. Renaming them would either re-apply the SQL (breaking idempotency-unsafe statements) or hard-error with "migration already applied but contents changed". The convention is honored going forward — migrations 063-131 are all uniquely numbered.

- **Redirect-stub admin pages.** The Phase-2 cleanup (commit `b902cc66`, 2026-05-22) intentionally stubbed `/admin/lead-check`, `/admin/lead-check/[analysisId]`, `/admin/prospects`, and `/admin/push-opportunity` to `redirect()` instead of deleting. CLAUDE.md documents this. Don't "clean up" the 9-line redirect files — they preserve external bookmarks and email links.

- **`analyze_attachments` 82% failure rate (audit aggregate).** Already addressed in commit `9e929569` (2026-06-10) — split into a dedicated drain route at `/api/cron/run_worker_jobs_attachments`, 150s budget under the 180s cron interval, watermark check via `_analyzed_attachments_at` in `structured_requirements`. Lifetime failure aggregate is dominated by the pre-fix reap-burn window. Current rate post-fix: 368 done / 0 failed since deploy. (Adding a >50% daily-rate health alert is still a reasonable observability follow-up.)

- **`extract_keywords` + `classify_naics` 14-day backlog.** This IS real work (see queue-audit findings #2), but it's a workflow problem (priority starvation), not tech debt — fix via the dedicated drain lane proposal, not by deleting the queue.

- **`worker_jobs` table at 35MB with 44K pending rows.** Looks like scalability debt; actually a symptom of the above starvation. Adding archival is good practice but doesn't fix the root cause.

- **OpenClaw zombie WhatsApp container on the VPS.** Looks like debt to clean up; the user may still want this for future autonomous loops. Confirm intent before deleting.

- **`feedback_no_per_piece_confirmation` and other autonomous-deploy patterns in MEMORY.md.** These are explicit user preferences. Don't "clean up" by adding more confirmation prompts.

- **`SUPABASE_SERVICE_KEY` fallback in `opportunity-detail` and `academy/[slug]/page.tsx`.** Looks like debt; is a real security finding (medium severity). It's tagged elsewhere in the security report — not duplicated here.
