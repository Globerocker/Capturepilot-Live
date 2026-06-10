# CapturePilot Platform Audit — Executive Summary (2026-06-10)

## Platform health at a glance

The platform works, customers can use it, and the bones are solid — but there's a meaningful gap between what CLAUDE.md says is shipped and what's actually running in prod. Two weeks of enrichment jobs are starved in the queue, the Resend webhook hasn't recorded a single event so we're flying blind on email deliverability, four unauthenticated endpoints can drain Apollo + OpenAI + Resend budget on demand, and the warm_cf_cookie path that's supposed to defeat Bonfire is failing because FlareSolverr isn't reachable from the worker process. None of this is catastrophic in isolation. Stacked together, it's the difference between "ready to spend on acquisition" and "spend will expose the leaks faster than you can patch them."

## What's working well

- **The worker_jobs queue platform.** Migration 086 + the Vercel/VPS split is the right architecture. Job claiming, dedup keys, fan-out trigger, reaper, FlareSolverr defeat path — all sound. The recent split into a dedicated `analyze_attachments` lane (commit 9e929569) already fixed the reap-burn loop and the lane now runs 100% success in the last hour. That's the pattern to copy for the other starved lanes.
- **Admin hardening from May.** `assertAdmin()` + `guardCron()` + the smoke test in `tools/30_smoke_admin.mjs` killed 30 unauthenticated routes and a public password-reset endpoint. The pattern works; the gaps below are routes that didn't get migrated or were added after.
- **Migration 090 security hardening landed.** `trigger_cron_route`, `rls_auto_enable`, and `purge_old_activity_log` are revoked from anon — the advisor lint is stale on those three.
- **Phase 5/6 lead-brief unification.** Facebook leads and Quick Checker leads now run through the same `runDeepExtract` path. The HubSpot strategic-brief push is correctly wired at the code layer; the only reason it's not delivering is the queue starvation downstream.
- **The Hostinger VPS.** Real infra you own, FlareSolverr running, 3-year box. Just underused — only 7 of 35 documented crons migrated, lots of headroom to relieve the Vercel 40-cron ceiling.

## What needs attention this week (critical only)

1. **Resend webhook is recording zero events.** Email tracking is dark — opens, clicks, bounces, complaints, none of it lands in `email_events`. Confirm `RESEND_WEBHOOK_SECRET` is set in Vercel prod, register the webhook in the Resend dashboard, send a test event. (*Resend webhook deployed but receiving ZERO events*)

2. **Bounces never get suppressed.** When an address bounces or marks spam, we keep mailing it forever. The `send()` wrapper in `email.ts` doesn't check `outreach_optouts`, and the webhook handler doesn't write to it. Add the INSERT in the webhook + the SELECT check in `send()`. Without this, scaling Resend volume = scaling our way into a domain suspension. (*Bounce/complaint webhook updates backlink_outreach only* + *email.ts send() has NO suppression check*)

3. **42,000 enrichment jobs starved for 14 days.** `claim_jobs()` priority ordering means priority-8 federal struct_reqs always wins; `classify_naics` and `extract_keywords` have consumed zero in the last 24 hours. Every opp ingested in the last two weeks has missing keywords and missing NAICS classification — matching is degraded. Fastest fix: dedicated `run_worker_jobs_keywords` lane (1 cron slot), same pattern as the attachments split. (*CATASTROPHIC: 42,000+ enrichment jobs starved*)

4. **Unauthenticated routes that burn paid APIs.** `/api/engine/[action]` runs `exec("python")` with no auth. `/api/email/welcome` lets anyone spam Resend with welcome emails. `/api/leads` has no rate limit and per call hits Apollo + HubSpot + Resend + OpenAI. `/api/brand` is a full SSRF + cost-abuse vector. Delete the engine route, gate welcome, add `protectCrawl` to leads + brand. (*Multiple findings under /api/engine, /api/email/welcome, /api/leads, /api/brand*)

5. **Six anon-callable SECURITY DEFINER RPCs.** Migration 090 caught three; `compute_naics_market_stats`, `enqueue_marketing_lead_apollo`, `enqueue_marketing_leads_apollo_backfill` still callable as anon. One REVOKE migration closes it. (*Public can EXECUTE 6 SECURITY DEFINER RPCs*)

6. **Document downloads use `getPublicUrl()` — anyone with the link can read forever.** Capability statements, proposals, certifications, internal letters. Predictable paths. Make the bucket private, store path only, serve via `createSignedUrl(path, 300)`. (*Document/cap-statement uploads use getPublicUrl()*)

7. **warm_cf_cookie FlareSolverr env not reaching the worker process.** The 93/day "FLARESOLVERR_URL not configured" errors originate in the Railway/VPS `worker.js`, not Vercel. SSH the worker host, run `printenv | grep -i flare`, fix the env, restart the process. Without this, Bonfire scraping is dead. (*warm_cf_cookie bug: error originates in Railway/VPS worker*)

8. **`/api/admin/impersonate` HMAC falls back to literal string "dev-secret".** Anyone who knows the source can forge an impersonation cookie for any user. Plus the impl uses SHA-256 instead of HMAC (length-extension vulnerable) and truncates to 128 bits. One-file fix. (*impersonate HMAC fallback*)

## What needs attention this month (high priority)

1. **Pipeline forecast reads `award_amount` only, ignores `estimated_value`.** Every pre-award deal shows $0. One-line SELECT change. (*Pipeline weighted-value forecast*)

2. **Matches page paginates DB rows BEFORE applying filters.** Users see 0-3 rows when filtering by NAICS or notice type. Move filters into the Supabase query. (*Matches page paginates DB rows BEFORE applying client-side filters*)

3. **ai_win_strategy missing on 81% of opportunities, opportunity_score is null on 100%, naics_code null on 7%.** The April 16 enrichment sweep never finished. Run backfill in batches of 5K until clear; add `/admin/health` KPI so it can't regress silently. (*ai_win_strategy missing on 81.3%* + *opportunity_score null on 100%*)

4. **40% of EXPIRING_SOON opportunities are already past deadline.** Users prepare bids on unbiddable opportunities. One hourly UPDATE statement. (*40.3% of EXPIRING_SOON opportunities past their deadline*)

5. **2,559 contacts have an email address in the `fullname` column.** This is the root cause of the "PSC code in email field" bug CLAUDE.md couldn't reproduce. Cap-statement personalization addresses people by their email. Fix the SAM POC parser + backfill. (*Field collision in contacts*)

6. **12 cron routes still missing `guardCron()`.** The Phase 2 hardening missed these. If `CRON_SECRET` is ever unset (preview branches, rotation), they fail open. (*12 cron routes missing guardCron*)

7. **Signup says "no credit card required" then onboarding demands a card.** Either keep beta free or change the signup copy. Don't promise no card and ask for one 60 seconds later. (*Signup says "No credit card required"*)

8. **Settings autosave is documented as shipped but doesn't exist.** Long form, manual save button, no beforeunload guard. Either ship the autosave CLAUDE.md promises or correct the doc. (*Settings page advertises debounced autosave*)

9. **Playwright worker leaking 230 zombie Chrome processes in 3.5 hours.** Add `init: true` to the Docker compose. Will hit kernel PID limit otherwise. (*playwright-worker leaking 230 zombie Chrome processes*)

10. **Watchtower only watching 1 of 11 containers.** Traefik (edge TLS terminator) 3 months stale. Either flip the label-enable flag or add labels to the other compose files. (*Watchtower only watching 1 of 11 containers*)

11. **IDOR on `/api/eligibility`, `/api/ai/write-proposal`, `/api/ai/draft-email`, `/api/ai/draft-template`, `/api/ai/generate-proposal`, `/api/ai/summarize-document`.** All accept `user_profile_id` from body without verifying caller owns it. Anyone who guesses a UUID can read company firmographics or burn OpenAI budget. Add `getUser()`, ignore body-supplied IDs. (*Six AI routes accept arbitrary user_profile_id*)

12. **Move 5-8 low-frequency crons from Vercel to VPS systemd.** You're at 40/40 cron slots. Weekly ingest jobs are the obvious candidates. Frees slots for the keyword/naics drainer lanes. (*40-cron Pro plan ceiling*)

## Strategic position

We can sell what we have today, but acquisition spend right now would expose three things faster than they can be fixed: bounce handling that will tank Resend reputation, AI features that show empty on most opportunities because enrichment is starved, and a handful of unauthenticated endpoints that scale paid-API costs faster than revenue. None of these are architectural — they're all 1-4 hour fixes that have piled up.

The #1 blocker isn't a missing feature. It's that the gap between "documented as shipped" and "actually working in prod" has grown wide enough that a founder reading CLAUDE.md can't trust what's live. Close the eight critical-this-week items and you can spend with confidence. Three to four focused days of work.
