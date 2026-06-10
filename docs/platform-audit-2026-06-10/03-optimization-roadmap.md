# Optimization Roadmap

Twelve weeks, sequenced by what's actively bleeding versus what can wait. Each item points back to the finding title so you can pull the full evidence and recommendation from the audit.

---

## Week 1 — Critical: stop the bleeding

### Security (cannot wait)
- **Revoke EXECUTE on the 6 public SECURITY DEFINER RPCs** — *Public can EXECUTE 6 SECURITY DEFINER RPCs including trigger_cron_route and purge_old_activity_log* — <1h — **kills anonymous "fire any cron" + audit-log wipe**
- **Delete `/api/engine/[action]` and `/api/enrich/[opportunityId]`** — *Unauthenticated /api/engine/[action] runs child_process.exec on arbitrary action keys* + *Dead enrich/[opportunityId] route — same exec(python) antipattern* — <1h — **removes RCE-shaped dead routes**
- **Lock down `/api/brand`** — auth + protectCrawl + SSRF allowlist + drop SERVICE_KEY write — *no auth, no rate-limit, no hostname allowlist* — 1-4h — **closes SSRF + IDOR write on user_profiles.notes.brand_kit**
- **Gate the 12 unguarded cron routes with `guardCron(req)`** — *12 cron routes missing guardCron / isAuthorizedCron* + *8 cron routes silently lose auth when env vars unset* — 1-4h — **stops anyone hitting ingest_sam / db_cleanup / score_matches anonymously**
- **Auth the 7 IDOR-prone AI routes** (write-proposal, draft-email, generate-proposal, draft-template, summarize-document, eligibility) — *no auth, accept arbitrary user_profile_id* — 0.5-2d — **stops OpenAI cost-abuse + paying-customer firmographic leak**
- **Fix `/api/admin/impersonate` HMAC** — switch to crypto.createHmac, drop the `"dev-secret"` fallback — <1h — **closes account-takeover-via-cookie-forging**
- **Add session check to `/api/lead-magnet/deliver` and `/api/beta-invites/[token]`** — both trust client-supplied identity — <1h each — **stops impersonation + beta-invite hijacking**
- **HubSpot webhook: fail closed when secret unset; add length-guard before `timingSafeEqual`** — two findings — <1h — **closes dev-backdoor + stops 500-then-retry storm**
- **Lock `/api/email/welcome`** — anonymous welcome-email spam — <1h — **protects Resend sender reputation**

### Worker queue (broken now, blocks half the product)
- **Drain the priority-8 federal logjam: split run_worker_jobs into lanes OR rebalance priority** — *42,000+ enrichment jobs starved for 14 days* — 1-4h — **restores ai_keywords + NAICS classification on every new opp; revives Quick Checker → HubSpot lead path**
- **Fix FlareSolverr env on the VPS** — the failing path lives in worker.js, not Vercel — *warm_cf_cookie bug: error message originates in Railway/VPS worker* — <1h — **stops 93 burned attempts/day on Bonfire**
- **Bulk-mark the 5,937 reaped analyze_attachments jobs failed; verify the recent overlap-fix held** — *analyze_attachments 82% failure rate over 7d* (refuted as already fixed in commit 9e929569 — verify and close) — <1h — **prevents reap-burn from coming back**
- **One-shot: mark the 3 zombie `running` worker_jobs failed** (12-day-old rows blocking dedup) — *Three stale running worker_jobs since 2026-05-29* — <1h — **unblocks future re-enqueue of those opp_ids**

### Data integrity (silent corruption today)
- **Resend webhook: confirm `RESEND_WEBHOOK_SECRET` is set, register the webhook, verify events land** — *Resend webhook deployed but receiving ZERO events* — <1h — **restores all engagement + bounce visibility**
- **Bounce/complaint → outreach_optouts insert; suppression check inside `email.ts:send()`** — three linked findings — 1-4h — **stops re-emailing dead addresses; avoids CAN-SPAM exposure**
- **HubSpot bounce mirror in the Resend webhook** — addresses the user-reported "bounces don't update HubSpot" — 1-4h — **sales stops calling dead inboxes**
- **Status transition: flip past-deadline ACTIVE/EXPIRING_SOON → EXPIRED** — *40.3% of EXPIRING_SOON rows are past deadline* — <1h — **users stop preparing bids on closed solicitations**

### Bait-and-switch + lying UI
- **Pick a truth on signup: free or trial** — *"No credit card required" then onboarding demands a card* — <1h — **+12% expected on signup→activation**
- **Wire the dashboard "Strong / Good / Possible" filter pills (or remove them)** — *Dashboard top-opportunity card filter pills are decorative* — <1h — **stops "is the app broken?" moment on first login**
- **Fix `dismissMatch` / pipeline weighted-value sum** — both add `estimated_value`, both fix optimistic-update silent-drop — <1h each — **pipeline KPI stops under-reporting six-figure deals**

**Quick wins this weekend (<2h each, listed at bottom too).**

---

## Weeks 2-3 — High: close gaps before scale

### Queue + cron platform
- **Move 5-8 weekly/low-frequency crons to VPS systemd** (the 5 weekly `ingest_*`, `compute_public_stats`, `ingest_federal_hierarchy`) — *40-cron Pro plan ceiling reached* — 3-5d — **frees 5-8 Vercel slots; unblocks new lanes**
- **Add dedicated `run_worker_jobs_keywords` + `run_worker_jobs_naics` lanes** in the freed slots — completes the federal-starvation fix — 1-4h
- **Throttle `enqueue_backfill`** — skip the INSERT batch when pending count for that task_type > 5,000 — <1h — **prevents queue from growing while consumer is stuck**
- **Add reaper telemetry + Sentry alert** when `running > 10min` count > 5 — <1h — **catches the next zombie-row regression**
- **Wrap `scrapePortalDetail` and `warmCfCookie` in 90s `Promise.race` timeout** — kills 159s outliers — <1h
- **`compute_past_performance_stats`: add to enrichment_orchestrator** (weekly Sunday) — <1h — **past-performance signal stops drifting**
- **Audit the 39 unscheduled cron route files; delete the 10 true orphans** — *Dead crons or orchestrator-only* — 1-4h — **removes ~3K lines of confusion**

### Matches page rebuild (correctness)
- **Push notice_type / set_aside / state / NAICS / search into the Supabase query** — *Matches page paginates DB rows BEFORE applying client-side filters* — 0.5-2d — **fixes the "filter shows 0 of 3,000 matches" bug; sort by deadline finally works**
- **Sanitize `.or()` interpolation across all 9 call sites** + add `oppTitleDescSearch()` helper — two linked findings — 1-4h — **fixes the silent break on commas/parens and closes the filter-injection class**

### Storage + RLS
- **Make `client-docs` bucket private; serve via short-lived signed URLs** — *Document/cap-statement uploads use getPublicUrl()* — 0.5-2d — **closes permanent-link leak on capability statements / proposals**
- **Replace `SUPABASE_SERVICE_KEY` on opportunity detail + academy pages with the server client** — *bypasses RLS for opportunities / contacts / bid_protests* — 1-4h — **future paywall/blocklist policies actually apply**
- **Add policies to the 33 RLS-on-but-no-policy tables** (one migration, batched by intent: read-public reference / server-only / per-user) — *33 tables silently locked or open depending on role* — 0.5-2d — **stops the "service-only-or-public" coin flip**
- **Replace `company_analyses` `WITH CHECK (true)` INSERT policy** with rate-limit + Turnstile — *anonymous can spam analyses + harvest emails* — 1-4h — **closes cost-DOS + lead-funnel pollution**

### Email infrastructure
- **Add `List-Unsubscribe` + `List-Unsubscribe-Post` headers in `send()`** — <1h — **Gmail/Outlook stop spam-foldering us**
- **Disable open/click tracking on transactional categories** (welcome, beta_invite, password reset) — <1h — **stops magic-link pre-fetch breaking tokens**
- **Refactor `sendLeadMagnetEmail` + `sendBriefEmail` through shared `sendViaResend()`** — pulls them under suppression + isEmailEnabled — 1-4h
- **Persist SMS sends in `sms_jobs` + retry on 429 with `Retry-After`** — fixes Sergio's "inconsistent SMS" complaint — 0.5-2d
- **Resend webhook signature length-guard already in scope; add `env-health` probe for `RESEND_WEBHOOK_SECRET`** — <1h

### Lead funnel rate limits
- **Add `protectCrawl` + Turnstile to `/api/leads`, `/api/analyze-company`, `/api/lead-magnet/deliver`, `/api/analyze-company/upload-cap-statement`** — four linked findings — 1-4h each — **stops $$$ burn on Apollo + OpenAI + Resend + HubSpot**

### Stripe + integrations
- **Stripe webhook idempotency via `processed_stripe_events` table** — 1-4h — **stops duplicate startup-pack rows + duplicate Meta CAPI Purchase events**
- **HubSpot `contact.propertyChange` handler** for bidirectional sync (lifecyclestage, unsubscribed, hs_email_hard_bounced) — 0.5-2d
- **HubSpot sync via `worker_jobs` instead of fire-and-forget `.catch(console.error)`** — *failed CRM updates leave silent data drift* — 0.5-2d

### Onboarding / Settings repair
- **Wire actual debounced autosave in Settings** (CLAUDE.md says it ships, code says it doesn't) — 1-4h — **stops silent profile-edit dataloss**
- **Replace `alert()` / `prompt()` across 12 sites with the GlobalToast already in the layout** — 1-4h — **looks like a 2026 product, not a 1997 IE popup**
- **Prefill Step 3 from Quick Checker crawl (employee_signals, founding_year, federal_agencies_served, revenue_signal)** — 1-4h — **Step 3 becomes 30s review instead of 3min retype**
- **Either honor "Skip Step 3" or remove the button** — <1h — **stops the fake escape hatch**
- **Unify revenue/employee buckets between Onboarding and Settings** — 1-4h — **users stop seeing "empty" revenue field on return visits**

### Founder visibility
- **Wire `last_login_at` in auth callback / middleware** — *100% of user_profiles have null last_login_at* — <1h — **retention dashboard stops being blind**
- **Add `/admin/health` cards: Resend webhook last event, queue depth per task_type, analyze_attachments failure %, scheduled_email failures by reason** — 1-4h each — **outages stop being invisible**

---

## Month 2 — Medium: quality + speed wins

### Performance
- **Split `/api/dashboard/kpis` into cheap + expensive halves, stream progressively** — *Sluggish dashboard load* (refuted as mostly fixed in commit 296a8355 — verify the residual skeleton-vs-zero issue) — 0.5-2d — **cosmetic polish on already-fast dashboard**
- **Lazy-load 8 below-the-fold panels on opportunity detail with intersection observers** — 0.5-2d — **multi-second TTI on opp detail → sub-second above the fold**
- **Drop 3 redundant indexes on opportunities; `VACUUM FULL` the 14k dead tuples** — 1-4h — **reclaim ~50MB + cut INSERT write amplification**
- **Add GIN indexes on 8 high-traffic jsonb columns** (inferred_profile, structured_requirements, apollo_data, etc.) — 1-4h
- **Diagnose contractors 188M seq-tup-reads** via pg_stat_statements; fix `ILIKE` queries that bypass the existing GIN — 0.5-2d — **/partners + /competitors page-load 3s → <1s**
- **Lift portal layout's `auth.getUser()` + profile lookup into `PortalContext`** — 0.5-2d — **kill 3-4 redundant Supabase round-trips per portal nav**
- **Switch portal layout's 30s polling to Supabase realtime on `client_messages`** — 1-4h — **drop 12K supabase calls/hr per 100 portal tabs**
- **Cap Tika to 2 CPU / 2GB; cap Ollama to 5GB + add 4GB swap on VPS** — 1-4h — **stops Tika starving playwright + n8n; stops Ollama OOM-kill on second model load**
- **Add `init: true` (tini) to playwright-worker compose** — <1h — **kills 230 zombie Chrome processes / day**

### Data quality
- **Backfill `ai_win_strategy` (81% null) + `structured_requirements` (74% null) + `strategic_scoring` (47% null)** in repeat batches of 5000 — 0.5-2d — **AI Proposals + Win Strategy panel stop being empty on 8 of 10 opps**
- **Ship a deterministic 0-100 `opportunity_score` cron** (currently null on 100% of rows) — 1-4h
- **Dedupe 8,394 duplicate opportunities** (459 copies of one GSA MAS); add partial unique index on (sol_num, agency) WHERE status active — 0.5-2d
- **Fix SAM POC parser to reject emails-in-fullname; backfill 2,559 contaminated contact rows; add CHECK constraint** — 1-4h — **fixes the long-reported "email shown in name field" bug at the source**
- **Fix FPDS importer: stop writing FPDS award IDs into `contractors.uei`; backfill 2,955 malformed rows; add `LENGTH(uei)=12` CHECK** — 1-4h
- **Backfill `agency` (25% null) + `solicitation_number` (28% null) from raw_json on SAM rows** — 1-4h — **agency-filter UI stops returning empty for 1 in 4 rows**
- **Backfill `naics_code` (7% null) once classify_naics queue drains** — depends on Week 1 fix

### AI prompt cleanup
- **Add `response_format: { type: 'json_object' }` to ai_strategy, generate-proposal, summarize-document; drop fence-stripping hacks** — <1h each — **silent JSON.parse failures stop burning tokens on infinite retry**
- **Extract single `lib/ai-win-strategy.ts`; stop 3 writers fighting over the same column** — *Duplicate AI-strategy prompt logic across ai_strategy + bulk_enrich_ai + summarize-document* — 0.5-2d — **/opportunities/[id] consumers stop seeing `undefined` based on cron order**
- **Fix `summarize-document` schema collision** — write to a new column or namespace it — 1-4h
- **Prepend `HUMAN_VOICE_RULES` to capture-brief, capability-matrix, compliance-matrix, competitor-suggest, summarize-document** — <1h — **enforces the documented brand voice on 5 leaking surfaces**
- **Switch `competitor-suggest` from gpt-4o → gpt-4o-mini** — <1h — **16x cost cut on a /competitors action**
- **Add `max_tokens: 800` to draft-email; `max_tokens: 1200` to draft-template** — <1h — **caps the runaway-prompt cost ceiling**
- **`capability-statement` SSE: parallelize 6 sections via Promise.all** — 1-4h — **45s → 8s wall-clock**
- **`capability-statement` SSE: surface section failures instead of writing empty content** — <1h — **stops silent-empty-section PDFs**
- **`match-summary.ts` + `voice-brief.ts` + `quickWebsiteSummary`: replace silent fallbacks with logged-and-surfaced errors** — <1h each
- **Track `llm_provider` on `company_analyses` rows + admin alert when >5% use heuristic fallback in 24h** — 1-4h — **catches OpenAI+DeepSeek+Ollama triple-outage degradation**

### Code consolidation
- **Consolidate the 16 inline `fmtCurrency` + 12 `formatDate` + 7 `normalizeUrl` + 5 `escapeHtml` into `display-helpers.ts`** — 1-4h — **removes ~400 lines; one-place bug fixes**
- **Pick ONE `extractStructuredRequirements`** (kill regex version, keep AI; superset its output) — 0.5-2d — **stops two functions writing different shapes to the same column**
- **Unify `match-scoring.ts` HOT thresholds (0.65 vs 0.70)** + extract shared `computeRawScore()` — 1-4h — **same opp stops being HOT in Quick Checker and WARM in dashboard**
- **Delete dead lib files** (`veteran.ts`, `impersonate.ts`, `subscription.ts`, `api-contracts.ts`, 3 legacy-crawler files, Searxng client, orphan Toast + NaicsSelectionGate, `18_bulk_hubspot_sync.ts`) — <1h — **removes ~1,400 lines of misleading dead code**
- **`npm uninstall` 8 unused deps** (Crawlee, firecrawl-js, pdfme/*, docx, pdf-lib, react-grid-layout, tailwind-merge) — <1h — **~150MB off node_modules**

### UX repairs
- **Add "Quick Check" to sidebar** — <1h
- **Replace HOT/WARM/COLD jargon with Strong/Good/Possible everywhere** — <1h
- **Lock vocabulary: Opportunity / Match / Pipeline** (drop Pursuit, Deal from user-facing copy) — 1-4h
- **Group sidebar into Find / Pursue / Research / Learn** — 1-4h
- **Run `/humanizer` over Quick Checker landing copy** (banned "unlock", "AI-powered", fake 87% stat) — <1h
- **Inline validation on onboarding (blur-time red text instead of submit-time alert)** — 1-4h
- **Portal capability-statement: lift dashboard implementation into shared `CapabilityStatementBuilder`** — 0.5-2d — **consulting clients stop getting the lite version**
- **Portal settings: handle update errors + add KeywordPicker** — <1h + 1-4h
- **AI Drafter: persist Email + Template drafts to localStorage** — 1-4h

### Schema hygiene
- **Rename 4 duplicate migrations** OR formalize the README's accepted-conflict status (refuted item, decide) — 1-4h
- **Document `auth_user_id` vs `user_profile_id` rule in CLAUDE.md + CI lint** — 0.5-2d — **prevents next "cron-runs always 403" class of bug**
- **`SET search_path = public, pg_temp` on the 17 SECURITY DEFINER functions** — 1-4h — **closes search-path privesc**
- **Move `pg_net` out of `public` schema** — <1h
- **Enable Supabase Auth HaveIBeenPwned password check** — <1h (dashboard toggle)
- **Drop the `matches` orphan table; archive `_backfill_targets_federal_2026_06_08`; audit 11 zero-row tables** — <1h
- **Add `ON DELETE SET NULL / CASCADE` to the 15 FKs with NO ACTION** — 1-4h — **`auth.users` deletion stops erroring**

### Operational telemetry
- **Daily archive cron**: DELETE old cron_runs / alert_autofixes / scheduled_emails — 1-4h — **stops unbounded telemetry growth**
- **Worker_jobs cleanup: archive done/failed after 7 days** — 1-4h
- **Fix VPS health-check (probes `/api/admin/health` unauth, gets HTML, drops false-alarm task every 30min)** — 1-4h — **stops 377 false-alarm tasks in `tasks/failed/`**
- **Top up Anthropic credits + add balance probe to VPS tasks-runner** — <1h — **revives the self-healing loop**
- **OpenClaw WhatsApp: either re-scan QR + add Anthropic key, or `docker compose down`** — <1h — **frees 1.18 GiB RAM or makes it functional**
- **Fix Watchtower label scope (only watching 1 of 11 containers)** — <1h — **traefik / ollama / n8n stop running 3-month-old images**

---

## Quarter 2+ — Nice-to-have / strategic

- **Partition `opportunities` by status** (live vs historical 35% EXPIRED + 6% AWARDED) — 0.5-2d — **scoring + list queries stop scanning past 21k dead rows**
- **TS-friendly types for the 6 `@ts-nocheck` pages** (cap statement, partners, portal pages) — 0.5-2d
- **Move user-facing copy into `src/lib/copy/` registry + periodic `/humanizer` pass** — 0.5-2d — **brand voice stops drifting**
- **List-style pipeline view as mobile default** (Kanban is unscrollable on 375px) — 1-4h
- **Add `ai_keyword_cache` table keyed by hash(title+description)** — 1-4h — **dedupes ~20% of backfill LLM calls**
- **Auto-generate CRON.md from `vercel.json` + orchestrator dispatch maps** — 1-4h
- **Add `partner_sms_recipients` table + admin UI** (recipient list out of env) — 0.5-2d
- **Sentry-style throttling on the public stats endpoint CORS wildcard** — <1h
- **Set up `expires_at` + download counter on `startup_pack_purchases.access_token`** — 1-4h
- **Bring `/api/sam/attachment-download` to `redirect: 'manual'` + re-validate hostname** — <1h
- **Stripe webhook: lookup-by-email fallback when `stripe_customer_id` update affects zero rows** — 1-4h
- **Email tracking observability: `dispatchScheduledEmail` returns typed reason ('template_disabled', 'resend_error:...')** — 1-4h
- **Collapse the 4 `extract_structured_reqs_*` task types into one with `payload.jurisdiction`** — 1-4h
- **HubSpot env-var consolidation + expiry countdown in `/admin/health`** — 1-4h
- **Replace `react-pdf` worker CDN load with a self-hosted copy** (smaller bonus, unrelated to findings — flag if it ever surfaces)
- **Memoize dashboard floats (`HubSpotChat`, `SupportChat`, `GlobalJobsIndicator`) so nav doesn't reset them** — 1-4h
- **`/api/matches/ai-filter` per-user rate limit (30/day, 5/min)** — 1-4h
- **Dedicated `lib/ai-win-strategy.ts` consumed by both crons** (already in Month 2 if you want it earlier)
- **Pipeline weighted forecast: switch `award_amount` → `estimated_value || award_amount || estimateContractValue(opp)`** — <1h *(or do this in Week 1; it's a 1-line change with outsized impact)*
- **Bulk-delete `tasks/done` + `tasks/failed` older than 14/30 days via cron** — <1h
- **Settings: track `isDirty` separately from `savedAt` for the two Save buttons** — 1-4h
- **Onboarding Skip-prefill button: make Prefill the only primary action** — <1h
- **Customer Message + Next Steps modal: localStorage templates + char counter** — 1-4h
- **Empty states across portal pages: action-oriented copy + buttons** — 1-4h
- **Bid-link verifier cron** (94% of opportunities never link-checked) — 1-4h
- **Migrate remaining Vercel crons to VPS systemd as new cron needs emerge** — ongoing

---

## Quick wins this weekend (<2h each, disproportionate value)

1. **Revoke EXECUTE on the 6 public SECURITY DEFINER RPCs** — closes anonymous "fire any cron" + audit-log wipe
2. **Delete `/api/engine/[action]` + `/api/enrich/[opportunityId]`** — kills two RCE-shaped dead routes
3. **Add `estimated_value` to the pipeline weighted sum** — one line; pipeline KPI stops hiding 6-figure pre-award deals
4. **Wire the dashboard filter pills (or remove them)** — first-impression bug; users stop thinking the app is broken
5. **Pick one truth on signup: free or trial** — bait-and-switch is the biggest funnel leak
6. **`response_format: { type: 'json_object' }` on the 3 OpenAI routes still missing it** — stops infinite-retry token burn
7. **Wire `last_login_at` in the auth callback** — retention dashboard goes from blind to seeing
8. **Set `RESEND_WEBHOOK_SECRET`, register the webhook, send a test event** — restores all email engagement + bounce data
9. **Past-deadline ACTIVE/EXPIRING_SOON → EXPIRED status flip** — users stop preparing bids on closed solicitations
10. **Fix the VPS health-check (probes admin route unauth, fires 48 false alarms/day)** — silences task-runner noise
11. **`docker compose down` on OpenClaw** (or re-scan its WhatsApp QR) — frees 1.18 GiB RAM
12. **SSH the worker, verify `FLARESOLVERR_URL` actually reaches the process, restart** — closes 93 burned warm_cf_cookie attempts/day
13. **Add `List-Unsubscribe` header to `email.ts:send()`** — Gmail/Outlook stop spam-foldering
14. **Bulk-mark the 3 zombie `running` worker_jobs as failed** — unblocks dedup for those opps
15. **`npm uninstall` the 8 unused deps + delete the 4 dead lib files** — ~1,400 lines + ~150MB gone
16. **Add "Quick Check" to the sidebar** — re-surfaces the main discovery tool
