# Scalability Assessment

## Current load posture

- **Vercel cron ceiling:** 40 of 40 used. Zero slots free. Any new scheduled task means deleting an old one.
- **Worker queue:** 44,049 pending jobs, oldest from 2026-05-26 (15 days). `extract_keywords` (17,638) and `classify_naics` (12,971) consumed exactly zero jobs in the last 24 hours — priority-8 federal jobs always beat priority-6/7 to the front of `claim_jobs()` and starve them. `analyze_attachments` failed 13,733 times against 1,807 successes (88% lifetime), though the most recent commit (`9e929569`, 2026-06-10) drove the 1-hour rate to 0% failed via watermarking + a 150s budget guard.
- **Database:** Heaviest table is `opportunities` at 857 MB (461 MB heap, ~400 MB indexes, 14,005 dead tuples). `user_matches` is 5,484 rows but logs 20.7M sequential tuple reads. `contractors` (83K rows) ran 3,781 sequential scans for 188M tuple reads despite a GIN index on `naics_codes` that has zero scans. Three redundant unique indexes on `opportunities.id`/`notice_id`. Eight high-traffic jsonb columns (`inferred_profile`, `apollo_data`, `strategic_scoring`, etc.) have no GIN.
- **VPS (Hostinger srv1113360):** Load average just hit 10.65 on 4 vCPUs during Tika OCR — six concurrent tesseract processes, no `cpus:` or `mem_limit:` on the container. Ollama OOM-killed six times in the last 7 days against 7.7 GiB RAM, no swap. Playwright worker is leaking 230 zombie Chrome processes (no `tini`). FlareSolverr works but is internal-only. 7 of 35 documented crons have been migrated to systemd; 28 still sit on Vercel.

## 10x assessment

What breaks first as load goes up 10x — roughly current 78K opportunities, 11 user profiles, 121 marketing leads, ~600 daily worker jobs going to ~780K opportunities, ~110 users, ~1,200 leads, ~6,000 daily worker jobs.

**Worker queue (breaks at 2-3x).** The starvation is already a production outage hidden behind the fact that nobody is loudly complaining. At 2x ingest the federal lane alone keeps `classify_naics` and `extract_keywords` permanently locked out. The dedup index makes it worse — when a job sits "pending" forever, new opps that hash to the same `dedup_key` get silently dropped on insert. This needs to be fixed before any growth, not as part of scaling work.

**Vercel cron slots (already broken).** Can't add a dedicated `run_worker_jobs_keywords` lane to fix the starvation above because there's no slot. Any new scheduled feature requires deleting an existing cron. Moving five-to-eight low-frequency crons to the VPS is unblocking work for everything else on this list.

**Matches page (breaks at ~3-5x users).** The page paginates Supabase results *before* applying client-side filters and sorts. At 11 users with sparse activity this looks fine. At 100 users actively filtering, "Sort by deadline" returns whatever happened to be on page 1. The fix is moving filters into the query, not throwing more rows at the client.

**Opportunity detail page (breaks at ~10x traffic).** Renders 15 panels in series, each with its own fetch on mount. Today the waterfall is invisible because nobody opens detail pages at scale. At 10x dashboard traffic this is the page that timeouts cluster around.

**Dashboard KPI route (already on the edge).** The route batches 12 Supabase counts via `Promise.all`, all using estimated counts so it stays at ~200ms — credit where due, this was fixed in May. At 10x users, `count: 'estimated'` per-tenant numbers start to drift further from reality (Postgres updates `reltuples` on `VACUUM`, not in real time). It survives 10x; it doesn't survive being asked to be exact.

**Email delivery (breaks at ~3x).** The `send()` wrapper has no rate-limit handling against Resend's 2/sec free-tier ceiling, no `Retry-After` parsing, no suppression check, and 6 of the 8 cron senders bypass the wrapper anyway. At 3x lead volume this just starts dropping mail silently. There are zero rows in `email_events` despite 34 sent emails today — the webhook either isn't registered or `RESEND_WEBHOOK_SECRET` is unset and the route is 500-ing.

**Opportunities table (breaks at ~5-10x rows).** Already 54% historical (EXPIRED/AWARDED/ARCHIVED/INTELLIGENCE). At 400K rows the redundant indexes and unvacuumed bloat start showing up on every full-table scan in `score_matches`. Partition or archive-table move is needed before the next ingest doubling.

**Hostinger VPS (breaks at ~2x worker volume).** Tika at 103% CPU sustained with load 10.65 on 4 cores means any concurrent OCR spike pushes everything else into the run queue. Ollama OOM is already happening — adding any model loads kills it. The box is overcommitted with playwright + n8n + ollama + claude-code + traefik + tika + flaresolverr + searxng + openclaw + 2 more containers all competing for 7.7 GiB.

**Stripe webhook (breaks at any duplicate).** No `event.id` idempotency tracking. Stripe re-delivers on transient 5xx. Today this means duplicate startup-pack purchases and double-fired Meta CAPI conversions. At scale it means inflated ROAS reporting that affects ad-spend decisions.

## P95 latency hotspots

**Worker jobs `analyze_attachments`** — p95 was 1,512s with 1,628s max before the 2026-06-10 fix. Now bounded to ~150s by `JOB_BUDGET_GUARD`, but the route is still doing PDF download + Mistral OCR + LLM JSON synchronously per attachment. Per-link `fetch` has no `AbortSignal.timeout` on the LLM call after the 30s break — one hung response and the whole batch tips over.

**`/api/analyze-company` (lead-magnet/confirm)** — pulls all 78K opportunities into Node memory in 1,000-row pages, then scores each in JS. P95 around 10-15s, close to the 30s Vercel cap. At 200K opps this will not fit in memory, period.

**`/api/ai/capability-statement`** — SSE streams 6 sections sequentially, ~30-45s wall-clock. Could be parallel for ~6-8s. The infrastructure is already there; it's just a `for` loop that should be `Promise.all`.

**Opportunity detail page** — 15 panel components, each one a fetch on mount, no `Suspense` or intersection-observer lazy load. Time-to-interactive depends on the slowest panel.

**Dashboard panel waterfall** — `DashboardMarketCard`, `SpendRadarCard`, `PipelineForecastCard`, `GovTribeActivityCard`, `LiveOpportunityCount` each mount in parallel (the audit reviewer was right that React mounts them concurrently), but several fetch from routes that fan out to the same Supabase tables — concurrent connection pressure rather than waterfall.

**Portal layout polling** — every 30s, every open portal tab does `auth.getUser()` + `user_profiles select` + `client_messages count`. Three round-trips per tick. At 100 portal clients with tabs open all day: ~12K Supabase requests per hour for a counter that changes a few times.

**`contractors` table scans** — 188M tuple reads in the recent window, indexes built but never hit. Partners page debounced search probably uses `ILIKE` instead of the GIN — every keystroke is a full table scan.

**`extract-ai-keywords`** — fires Gemini then OpenAI per opp with no result cache. Identical or near-identical (re-posted) opps generate fresh LLM calls.

## Cost watch

**OpenAI without per-user caps.** `/api/ai/write-proposal` (5K tokens/call), `/api/matches/ai-filter` (300 tokens but no daily cap), `/api/ai/competitor-suggest` using `gpt-4o` instead of `gpt-4o-mini` (16x markup for a 3-name suggestion). `/api/ai/draft-email` and `/api/ai/draft-template` have no `max_tokens` cap and fall back to the 4096 default. The unauthenticated `/api/brand` and `/api/analyze-company` POSTs let anyone burn OpenAI + Firecrawl + Apollo + SAM credits without rate-limit or captcha — a script can drain a monthly budget in minutes.

**Apollo.** `/api/leads` calls `people/match` per submission with no IP throttle, no captcha, no dedup window. Same email submitted 1,000 times = 1,000 paid lookups.

**Resend.** Bounce/complaint events are written to `email_events` (when the webhook actually works, which today it doesn't) but never added to a suppression list. The `send()` wrapper doesn't check anything before sending. Every drip-cron tick will re-mail addresses we already know are bouncing. The cost is sender reputation, not dollars — once Resend suspends the domain, every transactional email stops.

**Supabase row count.** `cron_runs`, `alert_autofixes`, `scheduled_emails`, `reengage_sends` grow unboundedly with no archive job. `worker_jobs` grows by 3-5 rows per opportunity insert via the fan-out trigger; no cleanup of `status IN ('done', 'failed') AND finished_at < now() - interval '7 days'`. At one year of operation `cron_runs` projects to ~700K rows and `worker_jobs` to several million.

**Vercel function-minutes.** `analyze_attachments` running for 1,500s × 13,733 failed jobs in the lifetime queue = roughly 5,700 function-hours burned on jobs that produced no output. Most fixed by the recent watermark commit, but the cost has already been paid.

## Specific moves to make

**1. Move these crons from Vercel to VPS systemd** (frees 8 slots):
- `ingest_calc` (weekly), `ingest_dol_wage_determinations` (weekly), `ingest_gsa_elibrary` (weekly), `ingest_sec_filings_primes` (weekly), `ingest_subawards` (weekly) — five weeklies that don't need Vercel
- `ingest_federal_hierarchy` (monthly)
- `compute_public_stats` (every 10 min) — 144 invocations/day for a stat rollup that doesn't change meaningfully on a 10-min window
- `publish_next_blog` (weekly)

Use the systemd-timer-with-curl-to-Vercel-route pattern documented in `reference_vps_cron_pattern.md`. Zero code change per route.

**2. Spend the freed slots on lane-split workers:**
- `/api/cron/run_worker_jobs_keywords` — claims only `extract_keywords` and `classify_naics`. Fixes the priority-starvation immediately without changing `claim_jobs()`.
- `/api/cron/run_worker_jobs_leads` — claims `enrich_lead_apollo` and `enrich_lead_brief`. Today 77% of marketing leads never reach HubSpot because these are starved behind federal struct_reqs.

**3. Add indexes:**
- `CREATE INDEX idx_contractors_unenriched ON contractors (last_enriched_at NULLS FIRST) WHERE apollo_enriched = false;` — kills the seq_scan on the Apollo enrichment cron.
- GIN on `company_analyses.inferred_profile`, `marketing_leads.apollo_data`, `opportunities.strategic_scoring`, `opportunities.structured_requirements`. Skip `worker_jobs.payload` (dedup_key already covers it).
- Drop the redundant `opportunities_notice_id_unique` (PK already covers) and `idx_opps_is_archived` (subsumed by `idx_opps_is_archived_posted_date`).
- `ANALYZE contractors` then `EXPLAIN ANALYZE` Partners search queries — if the planner still rejects the GIN, the app is using `naics_codes::text ILIKE` instead of the array overlap operator and that's the actual fix.

**4. Cache these queries:**
- `/api/matches/ai-filter` — key on `{prompt, profileNAICS}`, TTL 1 hour. Same translated filter for the same prompt against the same NAICS profile.
- `extract-ai-keywords` — table `ai_keyword_cache(hash text primary key, keywords text[], model text, created_at timestamptz)` keyed on `sha256(title + description.slice(0, 4000))`. 20% of opps are re-posted Sources Sought; that's 20% of LLM calls wasted.
- `/api/public/stats` — already cached 5 min. Leave it.
- `pricing` page — drop `dynamic = 'force-dynamic'`, keep `revalidate = 300`. Today every visit hits Supabase on the top-of-funnel public page.
- Apollo person-match results — TTL 7 days keyed on `email + company`. `/api/leads` re-enriches the same lead on every duplicate submission.

**5. Add rate limits to these public endpoints:**
- `/api/leads` — `protectCrawl(req, { route: 'leads', maxPerMin: 2 })` keyed on IP hash, plus Turnstile/hCaptcha. Today: email-bomb victim addresses + drain Apollo budget.
- `/api/analyze-company` — `maxPerMin: 3` plus captcha. Today: free competitor-intel oracle.
- `/api/brand` — `maxPerMin: 5` plus DNS resolution check rejecting RFC1918/loopback/link-local. SSRF + cost-abuse open today.
- `/api/email/welcome` — delete the route entirely, or require a signed webhook signature. Anyone can spam welcome emails today.
- `/api/sbir/search` — gate behind `auth.getUser()` like the SAM passthrough does.
- `/api/ai/*` family (write-proposal, draft-email, generate-proposal, draft-template, summarize-document, eligibility) — require auth, ignore body-supplied `user_profile_id`, resolve via session. Per-user daily cap (20 proposals/hour) backed by the existing `rl_bump` RPC.

**6. Background-job-ify these synchronous calls:**
- `/api/leads` Apollo + HubSpot + Resend + Meta CAPI fan-out — move all four to a `worker_jobs` task. Single submit can't burn paid calls before the throttle fires, and retries come for free.
- Stripe webhook → HubSpot sync — currently `.catch(console.error)` fire-and-forget. Enqueue a `hubspot_sync` job; the existing `attempts` + `dedup_key` give free retries.
- `/api/analyze-company/upload-cap-statement` 10MB anon upload — gate with a signed token issued by `/api/lead-magnet/confirm` bound to one analysis_id with 5-min TTL.
- Opportunity attachment OCR is already on `worker_jobs` — keep the recent budget-guard fix.
- `/api/ai/capability-statement` 6-section serial generation — `Promise.all` the sections, stream each as it resolves. ~6-8s instead of 30-45s.

**7. Add observability on these AI call sites:**
- `match-summary.ts` — silently swallows OpenAI failures into the fallback string. Log + increment `company_analyses.ai_match_summary_failures` so the UI can show "N of 10 didn't get a fit summary."
- `deep-extract.ts` LLM cascade — when all three providers fail and the code falls back to heuristic, persist `crawl_data.llm_provider = 'heuristic_fallback'`. Add a `/admin/health` card showing % of last 100 QCs that used fallback; page if >5% in 24h.
- `lead-brief.ts` `quickWebsiteSummary` — distinguish `llm_unavailable` from `no_website` in the partner-alert message so Sergio doesn't see "site blocked the crawler" during every OpenAI outage.
- `/api/ai/voice-brief` narration step — adds no `if (!r.ok)` check, returns literal "Unable to summarize the brief." to TTS. Wrap in proper error so the job fails instead of producing a misleading audio.
- `RESEND_WEBHOOK_SECRET` presence — add to `/api/admin/env-health` probe. The reason `email_events` has zero rows is either a missing secret or unregistered webhook, and we have no way to see it today.
- Add `/admin/health` card "Resend webhook: last event Xh ago" reading `max(occurred_at) FROM email_events`. Alert when >24h.
- Add a `worker_jobs_cleanup` cron: `DELETE FROM worker_jobs WHERE status = 'done' AND finished_at < now() - interval '7 days';` plus archive failed to `worker_jobs_archive`. Table is 35 MB and growing.

## Headroom by year-1 milestone

**100 paying users.** First thing that breaks is the Matches page — `.range()` before filtering means search-by-keyword and sort-by-deadline return nothing useful. Worker queue starvation continues blocking new opp enrichment, so HOT/WARM scoring runs on stale data. Portal polling adds ~12K Supabase requests/hour. Resend's free-tier 2/sec ceiling starts dropping welcome-email bursts. Dashboard KPI route holds up fine.

**500 paying users.** The opportunity detail page's 15-fetch waterfall becomes visible — TTI 5-10s on cellular. `contractors` full-table scans on Partners search push p95 latency past 3s. Hostinger VPS hits its ceiling on Tika OCR concurrency; load average sits in double digits, n8n + Ollama + Playwright start contending. `/api/leads` Apollo costs scale linearly with no dedup. `worker_jobs` table approaches 1M rows; the partial unique index on `dedup_key` starts having more conflicts on INSERT.

**2,000 paying users.** `opportunities` is past 200K rows (assuming continued ingest plus historical retention) and approaching 1.5 GB. Match scoring full-table scans through it on every user. `user_matches` grows to several hundred thousand rows; the 20M tuple-reads-per-5K-rows pattern projects to dashboard load times in the 8-15s range without index work. Vercel function-minutes for the AI routes alone become a budget line. Resend domain suspension is likely if bounce suppression still isn't wired up. The Hostinger VPS needs a second box or you're moving the heavy workers (Tika OCR, Playwright scraping) off it entirely. None of this is unrecoverable but it requires the indexing, archiving, queue lane-splits, and rate-limits above to land before you cross 1,000 users — not after.
