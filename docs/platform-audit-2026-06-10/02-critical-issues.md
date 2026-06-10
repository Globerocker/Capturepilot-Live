# CapturePilot 2.0 — Critical Issues Report

Generated 2026-06-10 from a multi-track audit of the dashboard, backend, database, queue, integrations, VPS, AI, email/SMS, and security surfaces.

## Executive intro

This report covers **22 issues at severity=critical or high** (3 critical, 19 high), pulled from a verified set of 137 findings. The common root cause is **fail-open security and silent failure**: the most dangerous bugs aren't novel exploits, they're paths where authentication is optional, errors are swallowed, or expensive side effects fan out before any gate can fire. Migration 090 retired one class of these (the `if (CRON_SECRET && ...)` short-circuit), but the same pattern is back in webhooks, the HubSpot signature check, the impersonation HMAC, and a dozen public endpoints that accept arbitrary `email`, `user_profile_id`, `analysis_id`, or `auth_user_id` from the request body.

Three themes recur across the critical and high findings. **First, public endpoints that mint money** — `/api/leads`, `/api/analyze-company`, `/api/lead-magnet/deliver`, `/api/brand`, `/api/ai/*`, plus 6 SECURITY DEFINER RPCs callable by anon — fan out to Apollo, OpenAI, HubSpot, Resend, and SAM with no auth, no rate limit, and no captcha, exposing both a cost-burn vector and an IDOR surface. **Second, the email pipeline is dark and unsuppressed** — zero `email_events` rows have been recorded despite hundreds of sends, bounces never propagate to a suppression list, `send()` doesn't check opt-outs, and lead-magnet sends bypass the wrapper entirely; this is a sender-reputation collapse waiting to happen. **Third, the worker queue is dead in two ways** — `extract_keywords` and `classify_naics` have consumed zero jobs in 24h because a priority-8 federal lane starves the priority-6/7 lanes, leaving 42K+ jobs stuck for 14 days and silently degrading match scoring across every new opportunity.

---

## 1. Public can EXECUTE 6 SECURITY DEFINER RPCs without signing in — including `trigger_cron_route` and `purge_old_activity_log`

**Severity:** critical
**Category:** security
**Evidence:** Supabase advisor `anon_security_definer_function_executable` flags `compute_naics_market_stats(int)`, `enqueue_marketing_lead_apollo()`, `enqueue_marketing_leads_apollo_backfill(int)`, `purge_old_activity_log()`, `rls_auto_enable()`, `trigger_cron_route(text)` — all SECURITY DEFINER, all callable as anon via `/rest/v1/rpc/`. Migration 090 DID revoke EXECUTE from three of them but the advisor still lists them — either the revoke was rolled back or a later recreate restored the public grant. The marketing-lead enqueue functions were never covered.
**Impact:** An anonymous attacker can (a) trigger any cron route by POSTing `/rest/v1/rpc/trigger_cron_route` with `{"route_path":"/api/cron/whatever"}`, bypassing `CRON_SECRET` entirely; (b) wipe `client_activity_log` via `purge_old_activity_log` (post-incident audit destruction); (c) flood the marketing_leads Apollo queue at attacker-chosen rate, burning paid credits.
**Recommended fix:** New migration: `REVOKE EXECUTE ON FUNCTION public.trigger_cron_route(text), public.rls_auto_enable(), public.purge_old_activity_log(), public.compute_naics_market_stats(integer), public.enqueue_marketing_lead_apollo(), public.enqueue_marketing_leads_apollo_backfill(integer) FROM anon, authenticated;`. Switch to SECURITY INVOKER where possible. Verify by re-running `get_advisors` after deploy. Note: one reviewer pointed out that some functions are triggers (not RPC-callable) and migration 090 already covered three — confirm the live advisor output before assuming the worst case, but `enqueue_marketing_leads_apollo_backfill` (added post-090) is real residual exposure.
**Effort:** <1h

---

## 2. `/api/brand` POST: no auth, no rate limit, no hostname allowlist — SSRF + IDOR write + cost abuse

**Severity:** critical
**Category:** security
**Evidence:** `dashboard/src/app/api/brand/route.ts:236-330` — POST reads `website` from JSON body and pipes it directly into `fetch(url)` and `analyzeCompany("", url)`. No `getUser()`, no `protectCrawl`, no host validation. When `user_profile_id` is supplied in the body, the handler instantiates a SERVICE_KEY client and writes `notes.brand_kit` to that profile id with no ownership check.
**Impact:** Three problems in one route. (1) SSRF — attacker probes internal IPs, metadata endpoints, or private services via our egress IP. (2) Cost-abuse — each call fans out to Firecrawl + OpenAI + multiple HTTP requests with no throttle; a script can drain budgets in minutes. (3) IDOR write — any unauthenticated caller can overwrite any user's `notes.brand_kit` (logo, colors, description) by guessing the UUID, corrupting client data with no audit trail.
**Recommended fix:** Require an authenticated session via `createSupabaseServerClient` + `getUser()`, then resolve the caller's own profile id and ignore body-supplied `user_profile_id`. Wrap with `protectCrawl(req, { route: 'brand', maxPerMin: 5 })`. Before `fetch(url)`, DNS-lookup and reject RFC1918/loopback/link-local IPs and non-http(s) protocols. Drop the SERVICE_KEY write entirely.
**Effort:** 1-4h

---

## 3. `/api/eligibility` + 5 `/api/ai/*` routes — no auth, accept arbitrary `user_profile_id` (IDOR read + OpenAI cost abuse)

**Severity:** critical
**Category:** security
**Evidence:** `dashboard/src/app/api/eligibility/route.ts:17-35` accepts `user_profile_id` from body and returns the full profile row with no auth. Same pattern in `write-proposal/route.ts:22-69` (loads profile by id, runs up to 10-page OpenAI proposal), `draft-email/route.ts:23`, `generate-proposal/route.ts:27`, `draft-template/route.ts:22`, `summarize-document/route.ts:25`.
**Impact:** (1) IDOR read — anyone who guesses or learns a `user_profile` UUID can read company_name, naics_codes, sba_certifications, state, employee_count, revenue, federal_awards_count via `/api/eligibility` (the entire onboarding payload for every customer). (2) OpenAI cost-abuse — unauth loop against `/api/ai/write-proposal` mints ~5K tokens per call; a few thousand calls drain the monthly budget. (3) Outbound spam — `/api/ai/draft-email` returns finished outreach copy for any chosen POC.
**Recommended fix:** Add `const { data: { user } } = await createSupabaseServerClient().auth.getUser(); if (!user) return 401;`. Resolve the caller's profile via `eq('auth_user_id', user.id)` and ignore any body-supplied id. Combine with per-user rate limit (e.g. 20 proposal generations / hour) backed by the existing `rl_bump` RPC.
**Effort:** 0.5-2d

---

## 4. CATASTROPHIC: 42,000+ enrichment jobs starved for 14 days — `extract_keywords` + `classify_naics` consumed 0 in 24h

**Severity:** high
**Category:** broken-workflow
**Evidence:** Pending counts: `extract_keywords`=17,638 (oldest 14.6 days), `classify_naics`=12,971 (354h), `extract_structured_reqs_federal`=11,630 (291h). Last-24h consumed: keywords=0, classify_naics=0, federal=2,885. Root cause: `claim_jobs()` orders by `priority DESC, created_at ASC`. The federal-structreqs lane was bumped to priority 8 while keywords stayed at 6 and classify_naics at 7. With 11,630 always-available priority-8 jobs and ~120/hr drain, the consumer never reaches priority 7 or 6.
**Impact:** Every opportunity ingested in the last 2 weeks has missing AI keywords + NAICS classification. Match scoring depends on `ai_keywords` for HOT/WARM, so the matches list is degraded, NAICS-based partner search misses 30K+ recent opps, market-watch digest references unenriched rows. The starvation also kills the Quick Checker → HubSpot lead path: `enrich_lead_brief` (59 pending up to 220h old) and `enrich_lead_apollo` (121 pending up to 49h old) share the lane.
**Recommended fix:** Pick one of: (A) change `claim_jobs()` to weighted round-robin per task_type so no lane can starve another; (B) split `run_worker_jobs` into a dedicated `run_worker_jobs_keywords` route (claims only `extract_keywords` + `classify_naics`) on a `*/5` schedule — costs one cron slot; (C) hack: lower `extract_structured_reqs_federal` priority back to 6. Then drain the 42K backlog by temporarily setting `batch_size=50`.
**Effort:** 1-4h

---

## 5. Resend webhook deployed but receiving ZERO events — engagement + bounce tracking is dark

**Severity:** high (originally tagged critical)
**Category:** broken-workflow
**Evidence:** `email_events` table has 0 rows across all time, despite 34 sent `scheduled_emails` (last 2026-06-10 14:01) and 121 `marketing_leads` with `magnet_resend_id`/`brief_resend_id` populated. Handler at `dashboard/src/app/api/webhooks/resend/route.ts:87` requires `RESEND_WEBHOOK_SECRET` and returns 500 if unset — so either the env var is missing, the webhook is not registered in Resend, or the public route is unreachable.
**Impact:** No visibility into which emails land, open, click, bounce, or get spam-flagged. `/admin/email-tracking` renders empty for every lead. Bounce-driven suppression (next finding) is non-functional. Reputation will silently rot — first signal of trouble will be a Resend domain suspension.
**Recommended fix:** (1) Confirm `RESEND_WEBHOOK_SECRET` is set in Vercel prod env. (2) Register webhook URL `https://app.capturepilot.com/api/webhooks/resend` in Resend dashboard with events: sent, delivered, opened, clicked, bounced, complained, failed. (3) Fire a test event and confirm one row lands. (4) Add `/admin/health` check that flags "no email_events in 24h despite >0 sends".
**Effort:** <1h

---

## 6. Bounce/complaint webhook updates `backlink_outreach` only — never adds bounced address to suppression list

**Severity:** high (originally tagged critical)
**Category:** bug
**Evidence:** `dashboard/src/app/api/webhooks/resend/route.ts:184-188` — on bounced/complained, only updates `backlink_outreach.bounced_at` WHERE `resend_message_id` matches. No INSERT into `outreach_optouts`, no flag on `marketing_leads`, `user_profiles`, or `contacts`. SQL confirms `outreach_optouts` has 0 rows. The only caller that checks it is `outreach_send` — every other send path (`email.ts:163`, `lead-magnets.ts:228`, `lead-brief.ts:856`, digest cron, etc.) ignores the table.
**Impact:** When a lead-magnet email bounces, the next outreach campaign or daily digest re-emails the exact same dead address. Repeated sends to bounced addresses are the #1 cause of Resend domain suspensions and Gmail/Outlook spam-folder relegation.
**Recommended fix:** In the resend webhook, after `eventType === 'bounced' || 'complained'`, `INSERT INTO outreach_optouts (email, reason) VALUES (lower(recipient), 'resend:'||eventType) ON CONFLICT (email) DO NOTHING`. Then in `email.ts send()` add a pre-send check: `SELECT 1 FROM outreach_optouts WHERE email=lower(to)` — return false if found. Same check in `lead-magnets.ts:sendLeadMagnetEmail`, `send_daily_digest`, `notify_matches`.
**Effort:** 1-4h

---

## 7. `email.ts send()` wrapper has NO suppression check — every transactional/marketing path can email opted-out addresses

**Severity:** high (originally tagged critical)
**Category:** broken-workflow
**Evidence:** `dashboard/src/lib/email.ts:163-196` `send()` checks `isEmailEnabled(key)` then calls `r.emails.send()` directly. No SELECT against `outreach_optouts`, no check against `contacts.unsubscribed`. This wrapper gates 18+ user-facing emails: welcome, consulting_welcome, beta_invite, team_invite, outreach_intro/followup/final, task_notification, agency_pipeline_push, opportunity_alert, trial_expiring_*, payment_failed, subscription_canceled, beta_deadline_*, edu_*.
**Impact:** An admin who clicks "send beta invite" to a previously-opted-out address sends it. The drip queue (286 pending rows) will dispatch nurture emails to addresses that already opted out via the outreach footer. This is a CAN-SPAM violation at scale.
**Recommended fix:** Add at the start of `send()`: `const { data: optout } = await sb.from('outreach_optouts').select('email').eq('email', to.toLowerCase()).maybeSingle(); if (optout) { console.log('[email] ' + to + ' opted out, skipping ' + key); return false; }`. Same check inside `dispatchScheduledEmail` and `sendLeadMagnetEmail`.
**Effort:** 1-4h

---

## 8. `ai_win_strategy` missing on 81.3% of opportunities — Apr 16 backfill never finished

**Severity:** high (originally tagged critical)
**Category:** data-quality
**Evidence:** `SELECT COUNT(*) FILTER (WHERE ai_win_strategy IS NULL OR ai_win_strategy::text='{}')/COUNT(*) FROM opportunities` → 63,455/78,007 (81.3%). `structured_requirements` null 73.8%. `strategic_scoring` null 46.6%. The 2026-04-16 parallel agent sweep documented in CLAUDE.md was supposed to fix these — current rates show ingest has outpaced the cron, and `backfill_requirements` never ran against SLED rows (98%+ of city/state/county opps still null).
**Impact:** AI Proposals, win-strategy panel, Opportunity Detail intelligence cards, and match scoring all degrade silently. Users see empty sections on 8 of 10 opportunities. The product markets these AI features as core differentiators.
**Recommended fix:** Run `/api/admin/backfill-enrichment` in repeat batches of 5000 with `only=both` until 0 nulls. In parallel: change `/api/cron/ai_win_strategy` to claim oldest-null first and raise batch size. Add `/admin/health` KPI for `null_strategic_scoring` + `null_ai_win` pct so it can't regress silently.
**Effort:** 0.5-2d

---

## 9. `opportunity_score` is NULL on 100% of opportunities (78,007/78,007) — confidence-scoring pipeline never wrote a row

**Severity:** high
**Category:** broken-workflow
**Evidence:** `SELECT COUNT(*) FILTER (WHERE opportunity_score IS NULL OR opportunity_score=0) FROM opportunities GROUP BY source` → sam: 72,695/72,695 (100%); sled: 5,314/5,314 (100%). Column exists (integer) but no cron writes to it.
**Impact:** Any UI sort/filter by `opportunity_score` reads 0 and treats every opp as worst-case. Lost differentiation vs. raw SAM dump.
**Recommended fix:** Decide today: either drop the column and remove UI references, or ship a cron that computes a deterministic 0-100 score from `set_aside`, `sources_sought_flag`, `deadline_days_out`, and agency size. Write at ingest in `1_ingest_sam.py` and on status change.
**Effort:** 1-4h

---

## 10. Matches page paginates DB rows BEFORE applying client-side filters — incorrect counts, near-empty pages

**Severity:** high
**Category:** bug
**Evidence:** `dashboard/src/app/(dashboard)/matches/page.tsx:227-289` — `.range(from, to)` runs first (`pageSize=25`), then JS filters by `activeSearch`, `filterNoticeType`, `filterSetAside`, `filterState`, `filterNaics`, `filterMaxDeadlineDays`. Total is set to filtered-page length (line 288). Sort buttons only re-sort the 25-row current page.
**Impact:** When a user types a search term or picks a filter, the page often shows 0-3 rows even when thousands match. "Sort by deadline" will never surface the soonest deadline unless it lands on page 1.
**Recommended fix:** Push notice_type / set_aside / state / NAICS filters into Supabase via `.eq()` / `.like()` on the `!inner`-joined `opportunities.<col>`. Move search to an RPC or `.or()` against `opportunities.title.ilike`. Sort via `.order('opportunities(...)', ...)`. Then `.range()`.
**Effort:** 0.5-2d

---

## 11. Document/cap-statement uploads use `getPublicUrl()` — any URL holder can download forever

**Severity:** high
**Category:** security
**Evidence:** `dashboard/src/app/(dashboard)/documents/page.tsx:103` — `const { data: urlData } = supabase.storage.from("client-docs").getPublicUrl(path); … file_url: urlData.publicUrl`. Same in `portal/documents/page.tsx:99` and `portal/messages/page.tsx:144`. Path is predictable: `user-documents/{profileId}/{timestamp}-{filename}`.
**Impact:** Capability statements, proposals, certifications, internal reference letters are accessible to anyone with the URL. The URL sits in the DB, gets emailed, shows in logs, may be shared via support. UEI guessing + timestamp brute force is feasible. Violates the privacy-page promise.
**Recommended fix:** Make the `client-docs` bucket private. Store the `storage_path` only and serve via a signed-URL endpoint (`createSignedUrl(path, 300)`) on click. Migrate existing rows by stripping the public URL on read and re-signing.
**Effort:** 0.5-2d

---

## 12. Unauthenticated `/api/engine/[action]` runs `child_process.exec` on arbitrary action keys

**Severity:** high
**Category:** security
**Evidence:** `dashboard/src/app/api/engine/[action]/route.ts:8-44` — POST handler with NO auth, maps `action` param to a static script list and runs `execAsync(\`python3 "${scriptPath}"\`)`. Returns 500 with `error.message` (info leak). Same pattern in `dashboard/src/app/api/enrich/[opportunityId]/route.ts`.
**Impact:** Any anonymous caller can POST `/api/engine/score` to trigger heavy Python jobs. On Vercel `exec` won't fire, but the route still attempts shell exec, leaks repo paths via error messages, and is dead attack surface. If ever deployed somewhere with Python on PATH, it's RCE on the mapped scripts.
**Recommended fix:** Delete both files. CLAUDE.md already records that `cron/enrich` had the same antipattern ripped out for the same reason.
**Effort:** <1h

---

## 13. 8 cron routes silently lose auth when env vars unset (anti-pattern CLAUDE.md called out)

**Severity:** high
**Category:** security
**Evidence:** `ingest_sam/route.ts:76`, `score_matches/route.ts:49`, `bulk_enrich_ai/route.ts:36`, `bulk_enrich_descriptions/route.ts:44`, `enrich_apollo_contractors/route.ts:148`, `ingest_fpds_awards/route.ts:166`, `naics_stats_backfill/route.ts:37`, `db_cleanup/route.ts:137` — all use `if ((expectedCron || expectedSvc) && auth !== expectedCron && auth !== expectedSvc)`. When both env vars are missing, the guard short-circuits and accepts every request. CLAUDE.md explicitly calls this out as the Phase-2 anti-pattern.
**Impact:** Any deploy with `CRON_SECRET` and `SUPABASE_SERVICE_KEY` both absent (preview branches, migration windows, accidental rotation) exposes these crons to the internet — they hit SAM.gov with paid keys, mass-write to `opportunities`, run destructive `db_cleanup`, burn OpenAI tokens.
**Recommended fix:** Replace each handler's inline auth with `const denied = guardCron(req); if (denied) return denied;` from `@/lib/cron-auth`. That helper is fail-closed in prod.
**Effort:** 1-4h

---

## 14. POST `/api/email/welcome` lets anyone spam welcome emails to any address

**Severity:** high
**Category:** security
**Evidence:** `dashboard/src/app/api/email/welcome/route.ts:4-23` — accepts `{ email, company_name, user_profile_id }` from anonymous POST, calls `sendWelcomeEmail` + `enqueueDripSequence` with caller-supplied email. No auth, no rate-limit, no captcha.
**Impact:** Reputation attack — attacker triggers 10k welcome emails to victim addresses on the Resend domain; bounces/complaints poison sender reputation. Also enrolls victims into 90-day drip. Costs paid Resend sends.
**Recommended fix:** Delete the route (this should be called inline from signup, not as a public API). If kept as a callback, require a signed Stripe/Supabase webhook signature and look up the caller's actual email from session — never accept email from body.
**Effort:** <1h

---

## 15. POST `/api/lead-magnet/deliver` trusts client-supplied email + LinkedIn metadata with no session verification

**Severity:** high
**Category:** security
**Evidence:** `dashboard/src/app/api/lead-magnet/deliver/route.ts:105-185` — comment says "called by /auth/callback after a successful linkedin_oidc exchange" but the handler never calls `sb.auth.getUser()`. It trusts `body.email` and `body.user_metadata`, inserts to `marketing_leads`, pushes to HubSpot, enqueues lead-brief job, fires Meta CAPI.
**Impact:** Anyone can craft a POST that injects arbitrary email + arbitrary `linkedin_verified=true` payloads into the CRM and lead-brief pipeline. Skews scoring, poisons `lead_quality`, sends mail to victims, burns Apollo + OpenAI quota on bogus leads, lets attackers impersonate "verified" prospects to sales.
**Recommended fix:** At the top of POST, read the Supabase session via `createServerClient` + `sb.auth.getUser()`, then enforce `email === user.email` AND `user.app_metadata.provider === 'linkedin_oidc'`. Reject otherwise.
**Effort:** <1h

---

## 16. POST `/api/analyze-company/upload-cap-statement` — anonymous 10MB uploads to Supabase Storage

**Severity:** high
**Category:** security
**Evidence:** `dashboard/src/app/api/analyze-company/upload-cap-statement/route.ts:25-114` — handler accepts multipart/form-data with no auth. Only gate is `analysis_id` existing in `company_analyses`, which is publicly enumerable since IDs are exposed in `/check/[analysisId]` share URLs. Uploads up to 10MB per request.
**Impact:** Cost-spam — attacker grabs any `analysis_id` from a Quick Checker share link and fires unlimited 10MB uploads, each landing in `client-docs` with no cleanup policy. Also writes attacker-controlled content into `inferred_profile.cap_statement_text` which feeds downstream OpenAI prompts (prompt-injection risk).
**Recommended fix:** Require auth, OR require a short-lived signed token issued by `/api/lead-magnet/confirm` that binds upload rights to a single `analysis_id` + 5-min TTL. Rate-limit per `analysis_id` (max 1 cap statement). Add a Supabase Storage policy enforcing the same path prefix.
**Effort:** 1-4h

---

## 17. POST `/api/leads` has no rate limit; each call hits Apollo + HubSpot + Resend + OpenAI (paid)

**Severity:** high
**Category:** performance / security
**Evidence:** `dashboard/src/app/api/leads/route.ts:48-308` — public CORS-allowed endpoint. Per-request pipeline: insert row, Apollo `people/match` (line 158), HubSpot `upsertHubSpotContact` (192), Resend send (237), Meta CAPI (264), `enqueueLeadBrief` (293). No IP throttle, no captcha, no honeypot beyond `rejectFakeSubmission`.
**Impact:** $$ burn — 1000 spam POSTs = 1000 Apollo lookups, 1000 HubSpot contacts, 1000 Resend sends (deliverability damage), 1000 OpenAI lead-brief jobs. `marketing_leads` table grows unbounded.
**Recommended fix:** Add `protectCrawl` (already exists, used by `public/contractors`) with `maxPerMin: 5` keyed on IP. Rate-limit per email — same `email + magnet` should be a no-op after first hit. Cache the Apollo result for 7 days keyed on `email+company`.
**Effort:** 1-4h

---

## 18. POST `/api/beta-invites/[token]` accepts unverified `auth_user_id` from body

**Severity:** high
**Category:** security
**Evidence:** `dashboard/src/app/api/beta-invites/[token]/route.ts:50-72` — POST reads `auth_user_id` from JSON body, then writes it directly to `beta_invites.claimed_by`. Never verifies the caller's session matches `auth_user_id`.
**Impact:** Attacker who knows a beta token can spoof `claimed_by` to be any user UUID. Lets them frame another user as the claimer (audit-log tampering) or steal an invite by claiming it under their own ID while keeping the token visible to the legitimate recipient.
**Recommended fix:** Read `auth_user_id` from `sb.auth.getUser()` in this route — never trust the body. If the route must be callable pre-signup, only allow `claimed_by = null` and have a separate authenticated endpoint patch it later.
**Effort:** <1h

---

## 19. `/api/admin/impersonate` HMAC secret falls back to `SUPABASE_SERVICE_KEY` then to literal string `"dev-secret"`

**Severity:** high
**Category:** security
**Evidence:** `dashboard/src/app/api/admin/impersonate/route.ts:36-39` — `const secret = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_KEY || "dev-secret"; return createHash('sha256').update(secret+'|'+payload).digest('hex').slice(0,32);`. Three problems: (1) truncating to 128 bits is on the floor; (2) plain SHA-256 of `secret|payload` is not HMAC and is length-extension vulnerable; (3) the `dev-secret` fallback lets anyone in dev/staging who knows the source forge an impersonation cookie for any user.
**Impact:** If both env vars are unset (or in any preview deploy that uses `dev-secret`), an attacker can encode `{a:'<any-uuid>', t:'<target-profile-id>', i:<now>}` + the known signature, present it as the `cp_admin_impersonate` cookie, and take over any tenant. Even with the secret set, length-extension on SHA-256 makes forgery feasible given one known (payload, sig) pair.
**Recommended fix:** Switch to `crypto.createHmac('sha256', secret).update(payload).digest('hex')` and compare with `crypto.timingSafeEqual`. Drop the `dev-secret` fallback — fail-closed with `throw new Error('CRON_SECRET required')` in prod. Add a startup assertion.
**Effort:** <1h

---

## 20. HubSpot inbound webhook silently bypasses signature check when `HUBSPOT_WEBHOOK_SECRET` is unset

**Severity:** high
**Category:** security
**Evidence:** `dashboard/src/app/api/hubspot/webhook/route.ts:28-31` — `function verifyHubSpotSignature(req, rawBody): boolean { const secret = process.env.HUBSPOT_WEBHOOK_SECRET; if (!secret) return true; // Skip verification in dev if no secret configured }`. Same fail-open pattern the 2026-05-22 cron-auth hardening was supposed to retire. The `NODE_ENV === 'production'` wrap at line 57 means in preview environments, anyone can POST arbitrary `client_activity_log` inserts.
**Impact:** Attacker who knows the URL (it's discoverable) can forge `contact.creation`, `deal.propertyChange`, `meeting.created` events — pollute the CRM, fake deal-stage moves, plant fake meeting log entries the team relies on for follow-ups.
**Recommended fix:** Mirror `cron-auth.ts`: `if (!secret) return process.env.NODE_ENV !== 'production'`. In prod, hard-fail with 500 if missing, log loudly, return 401 to caller. Add `env-health` probe so missing secret surfaces in `/admin/health`.
**Effort:** <1h

---

## 21. Resend bounce/complaint events are never propagated to HubSpot — root cause of user-reported issue

**Severity:** high
**Category:** broken-workflow
**Evidence:** `dashboard/src/app/api/webhooks/resend/route.ts:151-192` inserts bounce/complaint events into `email_events` and updates `backlink_outreach.status='bounced'`, but never calls HubSpot. The HubSpot client at `dashboard/src/lib/hubspot.ts` exposes `updateContactByEmail()` and standard properties like `hs_email_hard_bounced`, `hs_email_invalid`, `unsubscribed_from_all_email`, but no code path writes them.
**Impact:** User-reported issue — bounced emails do not auto-update HubSpot contact properties. Sales reps keep mailing dead addresses because HubSpot still shows them as valid. Compounding deliverability damage with Gmail/Yahoo's new sender requirements.
**Recommended fix:** In the resend webhook, after persisting to `email_events`, call `updateContactByEmail(recipient, { hs_email_hard_bounced: 'true' })` for `bounced`, and `{ unsubscribed_from_all_email: 'true' }` for `complained`. Add a `bounced_emails` table (or index `email_events` on recipient+event_type) to short-circuit future `send()` calls.
**Effort:** 1-4h

---

## 22. `warm_cf_cookie` bug: error originates in Railway/VPS worker, NOT Vercel — premise of bug report is wrong

**Severity:** high
**Category:** bug
**Evidence:** The literal string `'strict CF tenant + FLARESOLVERR_URL not configured'` exists in exactly one file: `tools/playwright-worker/worker.js:358`. It does NOT appear in `dashboard/src/app/api/cron/run_worker_jobs/route.ts`. Database query of failed `warm_cf_cookie` jobs over last 24h shows 93 occurrences. Duration analysis: 68 of 165 failures completed in <1s (early-return path), 72 took >30s (Playwright path). `HTTP_TASK_TYPES` in `run_worker_jobs/route.ts:58-68` does not include `warm_cf_cookie` or `scrape_portal_detail` — Vercel never claims these jobs.
**Impact:** Any "fix" hunted for in Vercel env doesn't exist there. The real problem: the worker.js process (Railway or Hostinger VPS) DOES claim `warm_cf_cookie` jobs (the error string proves it), but its `FLARESOLVERR_URL` env var is empty at runtime even though set in config. Result: 93 burned attempts/day on Bonfire+OpenGov hosts that then mark themselves blocked for 6h, killing bid scraping.
**Recommended fix:** (1) SSH into the worker host and run `printenv | grep -i flare` to confirm `FLARESOLVERR_URL` is actually exported in the process env. (2) Check `logFlaresolverrConfig()` output in worker boot log (worker.js:534-561). (3) Restart the worker after any env change (Railway = redeploy; VPS = `systemctl restart`). (4) MEMORY.md mentions migration to Hostinger VPS — confirm which host runs worker.js today; CLAUDE.md still says Railway.
**Effort:** <1h

---

## Notes on excluded findings

Two findings tagged "high" in the input were **refuted by reviewers as stale/already-fixed** and are excluded from this report:

- **analyze_attachments 82% failure rate** — fixed in commit 9e929569 (2026-06-10); since the fix, 368 done / 0 failed; the 82% number is a lifetime aggregate dominated by the pre-fix reap-burn window.
- **analyze_attachments task 88% failure rate (lifetime aggregate)** — same root cause; commits f8cf0206, 9e929569, and migration 130 already addressed the priority inversion and overlap.

One critical was downgraded based on partial refutation: the "6 SECURITY DEFINER RPCs" finding (kept as #1) because migration 090 covered three of the six and one is a trigger function not RPC-callable — but residual exposure on `enqueue_marketing_leads_apollo_backfill` is real.
