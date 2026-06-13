# CapturePilot Deep Audit, Cleanup, Optimization, and Product Maturation Report

Date: 2026-06-12

## 1. Executive Summary

CapturePilot has the shape of a serious B2G intelligence platform: a large Next.js dashboard, broad opportunity ingestion, enrichment and scoring systems, admin operations, CRM sync, workflow automation, and dedicated marketing/agency sites. The strongest assets are the depth of domain coverage, cron/worker automation, Supabase-backed product data, and the already-visible admin health tooling.

The main maturity risks are not lack of features. They are operational complexity, stale documentation, inconsistent test coverage, cron sprawl, scattered historical scripts, and uneven verification around integrations. The platform should now shift from feature velocity to reliability, observability, security hardening, product polish, and controlled cleanup.

## 2. Product Health Score

Overall score: 72/100

| Area | Score | Rationale |
| --- | ---: | --- |
| Product depth | 84 | Strong B2G workflows across opportunities, matches, pipeline, AI drafting, admin, portal, and marketing funnels. |
| Reliability | 70 | Cron telemetry and self-heal patterns exist, but only 51 of 86 cron route files reference `withCronTelemetry()` directly. |
| Security posture | 76 | Cron auth and RLS hardening are present; local secret files and integration breadth increase handling risk. |
| Maintainability | 63 | Multi-app repo, nested git directories, stale docs, historical one-off scripts, and many cron routes create cognitive load. |
| Test coverage | 52 | Playwright exists, but current visible e2e coverage is narrow: public smoke and signup/onboarding. |
| UX maturity | 68 | Product surfaces are broad, but a full visual consistency pass is still needed for enterprise SaaS polish. |
| Scalability | 74 | Orchestrators, VPS offload, queues, and indexes are present; cron ceiling pressure and worker observability need continued discipline. |

## 3. Current Architecture Review

- Primary product app: `dashboard/`, Next.js 16, React 19, TypeScript, Tailwind CSS 4, Supabase, Stripe, OpenAI/LLM services, Sentry, Playwright.
- Supporting sites: `website/` and `americurial/`, both Next.js 16/React 19 apps with their own nested `.git` metadata.
- Backend surface: `dashboard/src/app/api/` contains 349 route handlers, including 86 cron route handlers.
- Core domain logic: `dashboard/src/lib/` contains auth, Supabase clients, cron telemetry, crawling, enrichment, LLM extraction, scoring, outreach, HubSpot, Stripe, GovTribe, and USAspending integrations.
- Data layer: `dashboard/supabase/` contains schema files plus migrations through `162_alert_autofixes_dismissed.sql`.
- Operations: `dashboard/vercel.json` schedules 40 Vercel crons; additional jobs run through orchestrators, VPS timers, admin/webhook triggers, and worker routes.
- Automation: `n8n-workflows/`, `tools/zapier-app/`, and `tools/playwright-worker/` extend the platform beyond the web apps.

## 4. Critical Issues Report

1. Cron inventory drift: `CRON.md` described 78 route files and 39 Vercel entries, but the repo currently has 86 cron route files and 40 Vercel entries.
2. Documentation drift: the prior root `README.md` referred to Next.js 15 and `dashboard/tools`, which does not match the current repo.
3. Nested git metadata: `website/.git` and `americurial/.git` exist inside the root repository. This can confuse status, deployment, ownership, and cleanup.
4. Limited visible e2e coverage: only two Playwright specs were found under `dashboard/tests/e2e`.
5. Cron telemetry gap: 51 of 86 cron route files reference `withCronTelemetry()`. Some gaps may be intentional for admin/webhook routes, but the classification needs to be explicit.
6. Secrets handling risk: local env files exist across the repo. They should remain unprinted and uncommitted.

## 5. Technical Debt Report

- Historical repair scripts formerly at the repo root (`fix_*.py`, `rewrite_crawler.py`) have been archived under `archive/legacy-repair-scripts/` after reference checks found no active workflow usage.
- The March `dashboard/PLATFORM_AUDIT.md` is useful but narrow; it is monetization-focused and no longer sufficient as the primary maturity audit.
- Cron route categories should be generated or checked automatically against `dashboard/vercel.json`, orchestrator dispatches, VPS docs, and admin/webhook references.
- Root documentation should link to current operational references rather than duplicating rapidly changing cron and integration details.
- The repo lacks a single command that validates all apps and operational packages together.

## 6. UX/UI Review

Observed product breadth is high: dashboard, admin, portal, onboarding, public analysis/check routes, billing, matches, opportunities, pipeline, documents, competitors, partners, and AI drafting. The next UX pass should focus on consistency rather than new feature volume.

Priority improvements:

- Standardize dashboard/admin spacing, typography scale, tables, filters, empty states, loading states, and error states.
- Audit mobile layouts for all public and authenticated high-value journeys.
- Reduce generic AI-startup visual patterns such as decorative gradients, inconsistent color accents, excessive shadows, and mismatched card density.
- Make admin health and diagnostics more scannable for repeated operational use.
- Add screenshots to QA notes for before/after visual review on dashboard, admin health, QuickChecker, opportunities, matches, and onboarding.

## 7. Performance Review

Main risk areas:

- App build and route count are large enough that slow route compilation and cold starts should be tracked.
- Cron frequency is high: Vercel is at 40 scheduled entries, and `compute_public_stats`, worker routes, orchestrators, email warmup, and enrichment jobs can create recurring load.
- Crawler and AI pipelines depend on external services with variable latency.
- Database query performance should be reviewed against high-cardinality tables: opportunities, user matches, cron runs, contractors, contacts, outreach, worker jobs, and analysis tables.

Recommended measurement:

- Capture build timings for `dashboard`, `website`, and `americurial`.
- Add route-level timing around expensive API handlers if not already covered by Sentry or custom telemetry.
- Run the existing `tools/32_db_index_audit.mjs` with the correct Supabase env in a controlled environment.
- Review slow Supabase queries and index coverage before changing schema.

## 8. Infrastructure Review

- Vercel scheduled cron count is at 40, which leaves no room under common plan ceilings.
- `CRON.md` correctly describes the strategic split between Vercel crons, orchestrators, VPS timers, and admin/webhook routes, but its counts were stale.
- Hostinger VPS timers are part of the runtime architecture and must be checked before deleting any apparently unscheduled cron route.
- Health connector probes exist in `dashboard/src/lib/connectors.ts` for SAM.gov, Apollo, Resend, Stripe, OpenAI, DeepSeek, Mistral, Firecrawl, HubSpot, Supabase, Meta, Vercel, PDL, and VPS-hosted services.
- Cron health is surfaced through `cron_runs` and admin health pages; this should become the center of operational QA.

## 9. Security Review

Strengths:

- Cron auth helper exists and is described as fail-closed in production.
- Multiple Supabase security hardening migrations are present.
- Connector probes avoid crashing health monitoring on upstream failures.

Risks:

- Local env files are present and must not be surfaced in docs or command output.
- HubSpot currently centers on private-app token style auth. Marketplace readiness will require OAuth, tenant authorization, refresh-token lifecycle, per-tenant scopes, and install/uninstall handling.
- Cron route coverage should be classified so admin-triggered and webhook-triggered routes are intentionally guarded by the right auth model.
- Any crawler/URL ingestion change should keep SSRF guards and crawl protections intact.

## 10. Database Review

- Migration history is extensive and active through migration `162`, including RLS, indexes, health alerts, outreach, rate limiting, learning loop, storage policy, and worker-job changes.
- Schema appears split into core, application features, intelligence reference, admin integrations, and seed reference data.
- Priority next checks are index coverage, RLS policy consistency, storage policy access, growth of telemetry tables, and uniqueness constraints on ingestion identifiers.
- Do not add structural migrations until slow-query data or missing-index audit output justifies them.

## 11. HubSpot Marketplace Readiness Report

Current state appears private-app oriented:

- Token sources include `HUBSPOT_API_KEY`, `HUBSPOT_ACCESS_TOKEN`, and `HUBSPOT_PRIVATE_APP_TOKEN`.
- Contact/company/deal sync helpers exist, with fire-and-forget error behavior.
- Health probing exists through the connector registry.

Marketplace readiness gaps:

- OAuth install flow and callback routes.
- Per-tenant HubSpot account mapping.
- Token refresh and secure token storage.
- Scope minimization and marketplace submission documentation.
- Install, uninstall, reconnect, and permission-denied UX.
- Sync audit logs visible to admins and customers.
- Retry/dead-letter behavior for failed HubSpot writes.

## 12. AI and Automation Review

The platform uses AI across extraction, scoring support, drafting, summaries, OCR, proposal writing, outreach, and QuickChecker-style analysis. The maturity opportunity is governance:

- Track model, prompt version, input source, output schema version, latency, and failure mode for critical AI outputs.
- Prefer deterministic scoring for product-critical decisions and use AI as enrichment or explanation.
- Add regression fixtures for QuickChecker, NAICS classification, requirements extraction, and proposal/email generation.
- Document expected fallback behavior for missing API keys, rate limits, bad JSON, and low-confidence outputs.

## 13. Repository Cleanup Recommendations

Safe now:

- Keep the updated root README as the current repo map.
- Keep this report as the active deep-audit reference.
- Correct cron documentation counts and known drift.

Needs proof before removal:

- Any future deletion of `archive/legacy-repair-scripts/` contents.
- Unscheduled cron routes not listed in `vercel.json`.
- Any script in `tools/` without a dry-run mode.
- Nested `.git` directories in `website/` and `americurial`.
- Untracked `assets/dashboard/`.

## 14. Feature Gap Analysis

High-impact gaps:

- Broader e2e coverage for authenticated product flows.
- Customer-facing integration health and reconnect flows.
- HubSpot public app/OAuth readiness.
- Stronger admin diagnostics for queues, cron failures, and sync failures.
- Product analytics around activation, QuickChecker conversion, onboarding completion, and retained usage.
- Productized AI quality evaluation for QuickChecker and enrichment outcomes.

Avoid near-term feature bloat:

- Do not add more opportunity sources until ingestion health, dedupe, and scoring QA are tighter.
- Do not add more dashboards until existing admin/product surfaces have consistent information architecture.
- Do not add marketplace integrations before the connector lifecycle is robust.

## 15. Scalability Assessment

CapturePilot is close to the point where operational load, not feature count, becomes the limiting factor. Vercel cron capacity is fully used, the route surface is large, and several workflows depend on external APIs. The current architecture can scale if the team continues consolidating schedules, moving heavy/low-frequency work to workers or VPS timers, and improving queue observability.

Key scalability actions:

- Maintain a generated cron inventory.
- Move heavyweight or low-frequency jobs away from Vercel schedules when possible.
- Add queue depth, retry, and age dashboards for worker jobs.
- Build ingestion idempotency tests for all major data sources.
- Review telemetry table retention and aggregation.

## 16. 30-Day Improvement Roadmap

1. Finish documentation reconciliation: README, CRON, HubSpot, VPS, n8n, and deployment references.
2. Generate a cron inventory script that classifies Vercel, orchestrator, VPS, admin/webhook, and deprecated routes.
3. Expand Playwright smoke coverage for login, dashboard shell, admin health, QuickChecker start/status, opportunities, matches, and onboarding.
4. Review every cron route without direct `guardCron()` or `withCronTelemetry()` and document why the exception is safe.
5. Run DB index audit and create only justified index migrations.
6. Archive or remove historical root repair scripts after reference checks.
7. Standardize the most visible dashboard/admin UI inconsistencies.

## 17. 90-Day Improvement Roadmap

1. Build HubSpot OAuth/public-app foundation with tenant installs, token lifecycle, reconnect UX, and sync logs.
2. Create AI regression fixtures for QuickChecker, NAICS, requirements extraction, and outreach/proposal drafting.
3. Add operational dashboards for queue age, retry rate, external API health, cron SLA, and ingestion freshness.
4. Establish a release checklist that runs all app builds, lint, e2e smoke, Zapier validation where available, and DB index audit.
5. Reduce cron pressure by consolidating or moving additional jobs to worker/VPS infrastructure.
6. Implement a product analytics model for acquisition, activation, retention, and conversion.
7. Conduct a full authenticated UX polish pass using screenshots at desktop and mobile breakpoints.

## 18. Market Leadership Recommendations

- Position CapturePilot around reliable capture intelligence, not generic AI output.
- Make data provenance visible: show source, freshness, confidence, and why a recommendation was made.
- Turn QuickChecker into a measurable acquisition and qualification engine with quality regression tests.
- Build trust through operational transparency: sync health, ingestion freshness, and explainable scoring.
- Treat HubSpot Marketplace readiness as a distribution channel, but only after OAuth and tenant isolation are production-grade.
- Keep the product focused on fewer workflows done exceptionally well: discover, qualify, pursue, report, and sync.

## Verification Baseline

Collected repo facts:

- Tracked source inventory excluding `node_modules` and `.next`: 1,677 files.
- `dashboard/src/app/api/cron/`: 86 route files.
- `dashboard/vercel.json`: 40 scheduled cron entries.
- Cron route files with direct `guardCron()` references: 73.
- Cron route files with direct `withCronTelemetry()` references: 51.
- `dashboard/src/app/api/`: 349 route handlers.
- `dashboard/src/app`: 77 page files.
- `dashboard/tests/e2e`: 2 visible specs.

Verification run during this pass:

```bash
node tools/45_cron_inventory.mjs --json # passed
node tools/46_enrichment_backfill_ops.mjs # passed
cd dashboard && npm run build # passed
cd dashboard && npm run lint # passed with warnings
cd dashboard && PLAYWRIGHT_BASE_URL=http://localhost:3100 npm run e2e:smoke # passed, 12 tests
cd website && npm run build # passed
cd americurial && npm run lint # passed with warnings
cd americurial && npm run build # passed
```

Dashboard lint now exits successfully. The remaining warnings are tracked migration work, mostly React 19 lint signals around synchronous state updates in effects, impure `Date.now()` calls during render, and unused imports.

Operational updates from this pass:

- Added `tools/46_enrichment_backfill_ops.mjs` for read-only enrichment backlog reporting plus guarded cron triggering when `CRON_SECRET` and an explicit base URL are available.
- Hardened `tools/23_enrich_contractors_usaspending.mjs` with local env loading and `--dry-run`.
- Ran a controlled contractor enrichment batch: 100 contractors processed, 16 award hits, 84 clean misses, 0 errors.
- Current enrichment backlog after that batch: about 3,016 active opportunities missing NAICS, 0 active opportunities missing structured requirements, 0 active opportunities missing opportunity_score, 68,731 contractors missing federal_awards_count, 462 company analyses not completed.
- Hostinger WordPress MCP returned no visible WordPress installations for `ownership=all`; no WP deployment or repair action was taken.
