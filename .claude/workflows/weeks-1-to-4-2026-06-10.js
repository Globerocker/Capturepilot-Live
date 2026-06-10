export const meta = {
  name: 'weeks-1-to-4-2026-06-10',
  description: 'Execute weeks 1-4 of the post-audit roadmap. Phase A: cron + queue boost (drains 30k pending). Phase B: speed (signup/login/terms/privacy/edge/RLS/search_path). Phase C: dashboard parallelize + observability + HubSpot bidirectional. Phase D: VPS cron migration + AI learning loop + lead-magnet→trial conversion. Phase E: merge + verify + apply migrations + push.',
  whenToUse: 'Mass roadmap execution after the 2026-06-10 platform audit + initial fix sprint.',
  phases: [
    { title: 'A-CronBoost', detail: 'boost keywords lane + add temp manual drain' },
    { title: 'B-Week1', detail: '6 parallel: signup/login perf, terms/privacy static, edge runtime, RLS policies migration, search_path fix, company_analyses lockdown' },
    { title: 'C-Week2', detail: '3 parallel: dashboard parallelize, /admin/health observability tiles, HubSpot bidirectional' },
    { title: 'D-Week3-4', detail: '3 parallel: VPS cron systemd migration, AI learning-loop schema + capture, lead-magnet → trial conversion' },
    { title: 'E-MergeVerify', detail: 'merge all worktrees + tsc + summary' },
  ],
}

const ROOT = '/Users/andreschuler/Caturepilot 2.0'
const AUDIT_DIR = `${ROOT}/docs/platform-audit-2026-06-10`

const FIX_RESULT = {
  type: 'object',
  additionalProperties: false,
  required: ['stream', 'status', 'commit_sha', 'files_touched', 'notes'],
  properties: {
    stream: { type: 'string' },
    status: { enum: ['done', 'partial', 'blocked', 'skipped'] },
    commit_sha: { type: 'string' },
    files_touched: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
    follow_up: { type: 'array', items: { type: 'string' } },
    migrations_added: { type: 'array', items: { type: 'string' }, description: 'New migration filenames (orchestrator will apply via MCP)' },
    env_vars_needed: { type: 'array', items: { type: 'string' }, description: 'Env vars that need to be set in Vercel (user action)' },
  },
}

const SHARED = `You are executing roadmap work on CapturePilot 2.0 at ${ROOT}.

REPO STATE: clean main with the entire 2026-06-10 audit fix sprint already merged (migrations 132-137 applied, security hardening done, queue lanes split, async rescore live, admin user-mgmt restored).

CONSTRAINTS:
- Match existing code style (Next.js 16, React 19, TS strict, Tailwind, lucide-react only)
- "use client" required on interactive pages
- Use !inner on Supabase joins when filtering on joined tables
- Helpers: guardCron, assertAdmin, requireUser, createSupabaseServerClient, protectCrawl, sanitizeForOrSearch
- Don't refactor unrelated code; surgical patches
- New migration numbers start at 138 (current latest is 137). Pick the next free number for your migration; if multiple agents add migrations, the merge orchestrator will renumber collisions.
- HUMANIZER.md rules apply to any user-facing copy: contractions, specifics, no buzzwords (leverage/unlock/optimize/comprehensive/navigate/empower)
- Run \`cd dashboard && npx tsc --noEmit\` before committing — only commit if 0 errors
- Commit per stream with format: \`feat(WX): brief description\` where W is the week number (W1/W2/W3-4)
- Return via the structured schema`

// ============================================================================
// PHASE A — CRON BOOST (single agent, fast)
// ============================================================================
phase('A-CronBoost')

const cronBoost = await agent(
  `${SHARED}

WORK STREAM: BOOST THE KEYWORDS DRAIN LANE — Phase A

CONTEXT: After today's deploy, the new run_worker_jobs_keywords lane is live but only running every 5 min with batch_size=50. The queue has 17,870 extract_keywords + 13,203 classify_naics pending. At 50/run × 12 runs/hr = 14.4k/day, the 31k backlog clears in ~2 days — too slow.

CHANGES:
1. Read \`dashboard/src/app/api/cron/run_worker_jobs_keywords/route.ts\`.
2. Bump batch_size from 50 to 150. Each extract_keywords job runs ~1-2s, so 150 × 2s = 300s. The route uses a Vercel maxDuration; verify it's at least 300s. If the route lacks an explicit maxDuration export, add \`export const maxDuration = 300\` at the top.
3. Add a logging line at the start of each run: \`console.log('[keywords-drain] starting batch_size=' + batchSize)\`.
4. Add an emergency one-shot drain endpoint at \`dashboard/src/app/api/admin/drain_keywords_now/route.ts\` (POST) that requires assertAdmin, accepts \`{ batch_size?: number }\` (default 200), claims that many jobs, processes them inline (call the same handler code the cron uses), returns count done + count failed. Use it as a manual nuke when the queue grows again.

Commit. Return structured result.`,
  { label: 'cron-boost', phase: 'A-CronBoost', schema: FIX_RESULT, isolation: 'worktree' },
)

// ============================================================================
// PHASE B — WEEK 1: Speed + Security/Cleanup (6 parallel worktree agents)
// ============================================================================
phase('B-Week1')

const week1 = await parallel([
  () => agent(`${SHARED}

WORK STREAM W1.1: SIGNUP + LOGIN PERFORMANCE

Mobile RES on these pages is 44 (signup) and 64 (login) with LCP 5.84s. Goal: <2.5s LCP, RES 85+.

Read:
- \`dashboard/src/app/(public)/signup/page.tsx\`
- \`dashboard/src/app/(public)/login/page.tsx\`
- \`dashboard/src/app/(public)/layout.tsx\` if it exists, or whatever layout wraps them

Diagnose + fix:
1. Identify the LCP element on each. If a hero image, add \`priority\` to the next/image tag. If a hero text, preload the font via \`<link rel="preload" as="font">\` in the layout.
2. Find heavy imports. Anything imported at the top of these pages that's NOT used above the fold should be \`dynamic(() => import(...), { ssr: false })\`.
3. Look for Supabase client init at module level — should run lazily on form submit, not on mount.
4. Look for any \`useEffect\` that fetches data on mount when the user hasn't done anything yet — defer or remove.
5. Look for marketing copy importing the Humanizer or any large utility — these belong in non-funnel pages.
6. Drop any analytics/tracking SDK init outside the layout — load via next/script with \`strategy="afterInteractive"\`.
7. If the page has a logo/hero with multiple sizes, use \`next/image\` with proper sizes.

Goal output: under-200kB initial JS bundle on these routes. Commit message: \`feat(W1): slim signup + login for sub-2.5s LCP\`.`,
    { label: 'w1.1-signup-login', phase: 'B-Week1', schema: FIX_RESULT, isolation: 'worktree' }),

  () => agent(`${SHARED}

WORK STREAM W1.2: TERMS + PRIVACY → FORCE-STATIC

These pages should be 100/100 — they're legal text — but score 35-57. Almost certainly wrapped in a dashboard layout that imports providers.

Do:
1. Read \`dashboard/src/app/(public)/terms/page.tsx\` and \`dashboard/src/app/(public)/privacy/page.tsx\`.
2. Add \`export const dynamic = 'force-static'\` and \`export const revalidate = false\` at the top of each.
3. Check the wrapping layout. If it imports anything that requires runtime (Supabase, analytics, headers, cookies), move that to a child layout deeper than these routes, OR if they don't actually need the full layout, place them in their own route group like \`(legal)\` with a minimal layout.
4. Remove any client-only imports from these pages — the body should be pure JSX with prose styling.
5. Add proper metadata (title, description) for SEO.

Goal: 100/100 RES. Commit: \`feat(W1): force-static terms + privacy + minimal layout\`.`,
    { label: 'w1.2-terms-privacy', phase: 'B-Week1', schema: FIX_RESULT, isolation: 'worktree' }),

  () => agent(`${SHARED}

WORK STREAM W1.3: EDGE RUNTIME FOR STATIC + READ-ONLY ROUTES

Non-US users get RES 33-37 (vs US 44). Vercel function region is US-only — TLS handshake from EU/CA pays ~150ms before TTFB.

Do:
1. Identify routes safe for the Edge runtime — anything that doesn't use the Node-only Supabase admin client (auth.admin.*), doesn't do file IO, doesn't shell out, doesn't use ssrf-guard's dns lookups.
2. Candidates: \`/api/public/stats\` (anonymous cached counts), \`/api/sbir/search\` (read-only passthrough), \`/check\` page (already great but Edge would lift non-US scores), \`/startup-pack\` page.
3. For each candidate: add \`export const runtime = 'edge'\` at the top. Verify by reading the file end-to-end that no Node-only API is used.
4. Don't touch the database-write routes, the cron routes, or any route using assertAdmin / auth.admin.
5. Also: read \`dashboard/next.config.ts\` (or .js/.mjs). If image domains or other config is set, ensure they're Edge-compatible.

Goal: lift non-US RES into the 70s+. Commit: \`feat(W1): edge runtime for static + read-only public routes\`.`,
    { label: 'w1.3-edge-runtime', phase: 'B-Week1', schema: FIX_RESULT, isolation: 'worktree' }),

  () => agent(`${SHARED}

WORK STREAM W1.4: RLS POLICIES FOR THE 33 RLS-ENABLED-NO-POLICY TABLES

From \`${AUDIT_DIR}/06-data-quality-report.md\` and the security advisor: 33 tables have RLS enabled but no policies, meaning all access goes through service_role only. That's safe but it means a UI page that needs the data via the user-scoped client gets nothing.

Tables (from the latest advisor run today):
_backfill_targets_federal_2026_06_08, agencies, alert_autofixes, api_connectors, archive_types, attachment_analysis_jobs, backlink_agents, backlink_contacts, backlink_monitor, backlink_outreach, backlink_prospects, backlink_todos, beta_invites, cancellation_feedback, capture_outcomes, cron_runs, dod_contracts, email_events, gao_protests, government_contacts, health_alerts, internal_config, opportunity_types, past_performance_stats, pdf_extract_cache, reengage_sends, rss_sources, sec_prime_filings, socrata_sources, wage_determinations

Create migration 138_rls_policies_for_audit_tables.sql that groups these by intent:

- **Read-public reference data** (anyone authenticated can read): agencies, agency reference, archive_types, opportunity_types, government_contacts (POCs from SAM), dod_contracts (public award notices), gao_protests, sec_prime_filings, rss_sources, socrata_sources, wage_determinations, past_performance_stats
  → Single policy: \`FOR SELECT TO authenticated USING (true)\`
- **Server-only** (no policies, service role only via no policy + RLS enabled): _backfill_targets_*, alert_autofixes, api_connectors, attachment_analysis_jobs, backlink_*, cancellation_feedback, capture_outcomes, cron_runs, health_alerts, internal_config, pdf_extract_cache, reengage_sends, email_events, beta_invites
  → No new policies; document with COMMENT ON TABLE that they're service-role-only by design.

Each policy block wrapped in \`do $$ ... exception when undefined_table then ...\` so it's idempotent across environments.

DO NOT touch tables that already have policies (user_profiles, user_matches, opportunities, etc.).

Commit: \`feat(W1): RLS read policies + service-role docs for 33 audit-flagged tables\`. Return the migration filename in migrations_added so the orchestrator applies it.`,
    { label: 'w1.4-rls-policies', phase: 'B-Week1', schema: FIX_RESULT, isolation: 'worktree' }),

  () => agent(`${SHARED}

WORK STREAM W1.5: COMPANY_ANALYSES INSERT RATE LIMIT + LOCKDOWN

Audit advisor: \`public.company_analyses\` has \`INSERT WITH CHECK (true)\` for anon — anyone can spam analyses + harvest emails.

Do:
1. Find the public route that exposes company_analyses — likely \`/api/analyze-company/run\` or similar. If it uses createClient() with anon key + inserts to company_analyses, find it.
2. Add protectCrawl(req, { route: 'analyze-company', maxPerMin: 3 }) at the top.
3. Add input validation: reject obvious spam patterns (URL is not http/https, domain is too short, suspicious TLDs).
4. Create migration 139 (or next free): tighten the RLS policy to require a valid recaptcha token OR replace WITH CHECK (true) with a CHECK that validates the URL format + rate via a SECURITY DEFINER helper function that uses the existing rl_bump RPC.
5. Add a "honeypot" column requirement: client must POST with \`captcha_response: 'magic-string'\` (server-side computed). If absent → 400.

Commit: \`feat(W1): rate-limit + validate company_analyses public insert\`.`,
    { label: 'w1.5-company-analyses-lockdown', phase: 'B-Week1', schema: FIX_RESULT, isolation: 'worktree' }),

  () => agent(`${SHARED}

WORK STREAM W1.6: FUNCTION SEARCH_PATH FIX

Audit advisor: 15+ functions have role-mutable search_path. Risk: a SECURITY DEFINER function called via REST could resolve a function name to an attacker-shadowed schema.

Affected functions (from advisor): sync_is_archived_from_status, touch_proposal_jobs_updated_at, sync_status_from_archived, changelog_touch_updated_at, touch_background_jobs_updated_at, rl_bump, tg_government_contacts_updated_at, _touch_backlink_updated_at, tg_rss_sources_updated_at, trigger_cron_route, purge_old_activity_log, finish_job, get_sled_rows_needing_enrichment, claim_jobs, enqueue_opp_enrichment, reap_stale_jobs

Create migration 140 (or next free): for each function, run \`ALTER FUNCTION public.<name>(<args>) SET search_path = pg_catalog, public;\`. Wrap each in a do-block with exception handler so missing functions don't fail the migration.

Pull the actual signatures from pg_catalog if needed (the advisor's "metadata.arguments" field tells you the signature for each).

Commit: \`feat(W1): lock search_path on 16 SECURITY DEFINER + trigger functions\`.`,
    { label: 'w1.6-search-path-lock', phase: 'B-Week1', schema: FIX_RESULT, isolation: 'worktree' }),
])

log(`Phase B (Week 1) complete: ${week1.filter(Boolean).filter(r => r.status === 'done' || r.status === 'partial').length}/6 streams shipped`)

// ============================================================================
// PHASE C — WEEK 2: Dashboard + Observability + HubSpot (3 parallel)
// ============================================================================
phase('C-Week2')

const week2 = await parallel([
  () => agent(`${SHARED}

WORK STREAM W2.1: /dashboard PARALLELIZE QUERIES + SUSPENSE STREAMING

CLAUDE.md flags it as sluggish, audit corroborates with RES 75. Root cause is almost certainly waterfall Supabase queries.

Do:
1. Read \`dashboard/src/app/(dashboard)/page.tsx\` and any data-fetching helpers it uses.
2. Identify all SELECT calls. Wrap independent ones in Promise.all().
3. For heavy widgets (top matches card, market intel widget, recent activity), wrap them in <Suspense> boundaries with skeletons so the page shell renders fast.
4. If any computation can move server-side, convert that section to an async Server Component.
5. The shared route /api/dashboard/summary (or similar) — find it and batch its DB calls.
6. Look for redundant Supabase initialization — should be one client per request, not per query.

Goal: TTFB stable, LCP under 2.5s, RES 92+. Commit: \`feat(W2): parallelize dashboard queries + Suspense streaming\`.`,
    { label: 'w2.1-dashboard-perf', phase: 'C-Week2', schema: FIX_RESULT, isolation: 'worktree' }),

  () => agent(`${SHARED}

WORK STREAM W2.2: SURFACE OBSERVABILITY ON /admin/health

The /api/admin/env-health route returns data_quality + cron_summary as of today, but the /admin/health page doesn't display them. Wire it.

Do:
1. Read \`dashboard/src/app/(admin)/admin/health/page.tsx\` and \`dashboard/src/app/api/admin/env-health/route.ts\`.
2. Add UI tiles for the data_quality block (null_ai_win_strategy_pct, null_opportunity_score_pct) — each tile with a color band (green <5%, amber 5-30%, red >30%) and a "Run backfill" button that POSTs to /api/admin/backfill-enrichment with limit=5000.
3. Add a "Queue Depth" tile that queries worker_jobs grouped by task_type WHERE status='pending', showing the top 5 lanes with their pending counts + 24h drain rate. Color band: green <100, amber 100-1000, red >1000.
4. Wire a Sentry-style alert hint: if a queue lane has pending > 5000 AND no done in last hour, render a red banner at the top of /admin/health.
5. The existing cron_summary block (last_run / last_status per route) should already be rendered — verify it works; if not, fix.

Commit: \`feat(W2): /admin/health tiles for data quality + queue depth\`.`,
    { label: 'w2.2-admin-health-tiles', phase: 'C-Week2', schema: FIX_RESULT, isolation: 'worktree' }),

  () => agent(`${SHARED}

WORK STREAM W2.3: HUBSPOT BIDIRECTIONAL SYNC

Today's audit fixes mirror Resend bounces → HubSpot (outbound). But HubSpot → CapturePilot (inbound) is missing. When sales rep marks a HubSpot contact as unsubscribed, that doesn't propagate to outreach_optouts.

Do:
1. Read \`dashboard/src/app/api/hubspot/webhook/route.ts\` (today's fix made it fail-closed in prod).
2. Add handlers for these HubSpot event types:
   - \`contact.propertyChange\` with propertyName='hs_email_hard_bounced' → upsert outreach_optouts (email, 'hubspot:hard_bounce')
   - \`contact.propertyChange\` with propertyName='unsubscribed_from_all_email' → upsert outreach_optouts (email, 'hubspot:unsubscribed')
   - \`contact.propertyChange\` with propertyName='lifecyclestage' → update user_profiles.notes->>lifecycle_stage so we can scope per-lifecycle features
3. The webhook signature check should already be enforced — don't loosen it.
4. Look up the contact's email from HubSpot via the API call already in lib/hubspot.ts (use HUBSPOT_API_TOKEN env). If lookup fails, log and skip — don't 500.
5. Add a small admin page reflection: under /admin/email-tracking, add a section "Suppressed addresses" reading from outreach_optouts ordered by added desc, with source column shown.

Commit: \`feat(W2): HubSpot inbound contact.propertyChange → suppression sync\`. Note any env vars needed in env_vars_needed.`,
    { label: 'w2.3-hubspot-bidirectional', phase: 'C-Week2', schema: FIX_RESULT, isolation: 'worktree' }),
])

log(`Phase C (Week 2) complete: ${week2.filter(Boolean).filter(r => r.status === 'done' || r.status === 'partial').length}/3 streams shipped`)

// ============================================================================
// PHASE D — WEEK 3-4: VPS migration + Learning loop + Lead-magnet conversion (3 parallel)
// ============================================================================
phase('D-Week3-4')

const week34 = await parallel([
  () => agent(`${SHARED}

WORK STREAM W3-4.1: VPS CRON SYSTEMD MIGRATION

Vercel is at 40/40 cron ceiling. Move 5-8 low-frequency crons to the Hostinger VPS (srv1113360.hstgr.cloud, SSH via \`ssh -i ~/.ssh/cp_vps root@...\`) running them as systemd timers.

Candidates from the audit (low-frequency, write-light):
- ingest_gsa_elibrary (daily 10:00)
- ingest_fpds_awards (daily)
- monthly_awards
- ingest_grants (weekly)
- compute_public_stats (every 5 min — actually high freq, skip)
- send_daily_digest (daily 08:00)
- saved_search_alerts (daily 09:00)
- forecast_change_detection (daily 06:30)

Pick the 5-6 that are safest (no critical user-visible deadline + run < 5 min each + don't need Vercel-only secrets that aren't on VPS).

For each chosen cron:
1. Create a small Node script at \`tools/vps-crons/<cron_name>.mjs\` that hits the existing Vercel endpoint with CRON_SECRET (this preserves the handler logic, just moves the schedule). E.g.
   \`\`\`js
   const r = await fetch('https://app.capturepilot.com/api/cron/<route>', {
     method: 'POST',
     headers: { Authorization: \`Bearer \${process.env.CRON_SECRET}\` }
   })
   process.exit(r.ok ? 0 : 1)
   \`\`\`
2. Create a systemd unit at \`tools/vps-crons/<cron_name>.service\` and a corresponding timer at \`tools/vps-crons/<cron_name>.timer\` matching the original schedule.
3. Add a one-shot install script \`tools/vps-crons/install.sh\` that SCPs the scripts + units to /etc/systemd/system/, systemctl enables/starts each timer, and prints the active timer list.
4. Remove the chosen crons from \`dashboard/vercel.json\` (commit the JSON edit).
5. Document in \`tools/vps-crons/README.md\` how to install and how to monitor (\`journalctl -u <name>.service -f\`).

Don't actually SSH to the VPS — leave the install for the user to run once. But verify the JSON + scripts are syntactically valid.

Commit: \`feat(W3-4): 5+ low-frequency crons moved to VPS systemd timers\`. Add follow_up about running install.sh.`,
    { label: 'w34.1-vps-cron-migration', phase: 'D-Week3-4', schema: FIX_RESULT, isolation: 'worktree' }),

  () => agent(`${SHARED}

WORK STREAM W3-4.2: AI / ML LEARNING LOOP FOUNDATION

Per the market-leadership doc, we need to start capturing outcomes that become training data later.

Do:
1. Create migration 141 (or next free): three new tables —
   - \`pursuit_outcomes\` (id, user_pursuit_id FK, outcome enum [won, lost, no_bid, withdrawn], amount_awarded numeric, decision_date date, lessons_learned text, captured_at timestamptz)
   - \`proposal_edit_events\` (id, proposal_job_id FK, section_name text, original_text text, edited_text text, edit_distance int generated, captured_at timestamptz)
   - \`match_engagement_events\` (id, user_match_id FK, event enum [clicked, dismissed, pursued, saved, exported], session_id text, captured_at timestamptz). Add an index on (user_match_id, event).
   All RLS enabled, policies: \`FOR SELECT TO authenticated USING (auth_user_id resolves to user_profile_id matching the joined row)\`.
2. Capture endpoints:
   - POST /api/learning/pursuit-outcome — auth-gated, takes pursuit_id + outcome fields, inserts with caller's user_profile_id ownership check.
   - POST /api/learning/proposal-edit — auth-gated, takes proposal_job_id + section + before/after, inserts.
   - POST /api/learning/match-event — auth-gated, takes user_match_id + event, inserts.
3. Wire client-side capture (lightweight, async fire-and-forget):
   - In \`dashboard/src/app/(dashboard)/matches/page.tsx\`: on click of a match card, POST match-event { event: 'clicked' }.
   - On dismiss, POST { event: 'dismissed' }. On pursue, POST { event: 'pursued' }.
   - On proposal save (find the editor), capture before/after per section.
   - On pursuit detail page, add a "Mark outcome" button when status is 'submitted' or later.
4. Don't add new dependencies; use the existing fetch pattern.

Commit: \`feat(W3-4): learning loop — pursuit outcomes + proposal edits + match engagement capture\`. Return the migration filename.`,
    { label: 'w34.2-learning-loop', phase: 'D-Week3-4', schema: FIX_RESULT, isolation: 'worktree' }),

  () => agent(`${SHARED}

WORK STREAM W3-4.3: LEAD-MAGNET → TRIAL CONVERSION

The lead-magnet system (11 pages) captures email + delivers PDF. Add a 7-day nurture sequence + an in-product prompt that fires when a lead-magnet user signs up and engages with 3 features.

Do:
1. Look at \`dashboard/src/lib/lead-magnets.ts\` for the existing nurture sequence wiring (it exists per CLAUDE.md). If a 7-day drip isn't already configured, create the sequence template.
2. Add the nurture cadence (use existing scheduled_emails / drip pattern):
   - Day 1: "Here's how to use what you just downloaded" — link to relevant blog/resource
   - Day 3: "Most contractors waste 12 months learning this" — highlight Quick Checker (free)
   - Day 5: "Three real wins from our users" — case-study email
   - Day 7: "Ready for a trial?" — CTA to /signup with attribution param ?utm_source=lead_magnet&utm_campaign=<magnet_slug>
3. In-product conversion prompt: count features used (Quick Checker run, Capability Statement saved, Match viewed, Pursuit created). When count reaches 3, show a modal "You've explored 3 features. Want a 14-day trial?" with a CTA to Stripe checkout. Store dismissed/shown state in user_profiles.notes.trial_prompt_state.
4. The modal should be rendered in (dashboard) layout, hidden until count reaches 3, and not re-show after dismissed.
5. Make sure the email nurture respects outreach_optouts (it should via the send() wrapper — verify).

Commit: \`feat(W3-4): lead-magnet 7-day nurture + 3-feature trial prompt modal\`.`,
    { label: 'w34.3-lead-magnet-conversion', phase: 'D-Week3-4', schema: FIX_RESULT, isolation: 'worktree' }),
])

log(`Phase D (Week 3-4) complete: ${week34.filter(Boolean).filter(r => r.status === 'done' || r.status === 'partial').length}/3 streams shipped`)

// ============================================================================
// PHASE E — MERGE + VERIFY (one agent, sequential)
// ============================================================================
phase('E-MergeVerify')

const allStreams = [cronBoost, ...week1, ...week2, ...week34].filter(Boolean)

const mergeAndVerify = await agent(
  `You are the merge orchestrator + verifier for a 13-stream roadmap fix sprint.

Worktrees: each stream above worked in its own worktree branch with at least one commit. Your job is to merge them all into main, run tsc between each merge, roll back any merge that breaks the build, and report.

STREAMS:
${JSON.stringify(allStreams.map(r => ({ stream: r.stream, sha: r.commit_sha, status: r.status, files: r.files_touched, migrations: r.migrations_added || [] })), null, 2)}

DO:
1. cd ${ROOT}
2. \`git worktree list\` to enumerate worktree paths + branch names
3. Suggested merge order (least conflict risk first):
   - cron-boost
   - w1.6-search-path-lock (migration only)
   - w1.4-rls-policies (migration only)
   - w1.5-company-analyses-lockdown (small)
   - w1.2-terms-privacy (small)
   - w1.3-edge-runtime (config + route segment)
   - w1.1-signup-login (broader)
   - w2.2-admin-health-tiles (admin UI)
   - w2.1-dashboard-perf (broader UI)
   - w2.3-hubspot-bidirectional (webhook + lib)
   - w34.1-vps-cron-migration (vercel.json + new tools/ dir)
   - w34.3-lead-magnet-conversion (nurture + modal)
   - w34.2-learning-loop (migration + endpoints + UI hooks)
4. For each: \`git merge --no-ff <branch> -m "merge: <stream>"\` then \`cd dashboard && npx tsc --noEmit 2>&1 | head -40\`.
5. If type errors: \`git reset --hard HEAD~1\` and skip; record in the report.
6. After all merges, final \`tsc --noEmit\` should be clean.
7. Renumber any colliding migrations (138_X.sql + 138_Y.sql → 138/139). New range: 138-145 max.
8. Collect ALL new migration filenames in repo order — I'll apply them via Supabase MCP after this returns.
9. \`git worktree remove --force <path>\` for each.
10. DO NOT push — I do that after applying migrations + final verify.

Return: per-stream merge result (clean/conflict-resolved/skipped), final HEAD, final tsc status, complete list of new migration filenames in apply order, and any env vars / manual user actions required from any stream.`,
  { label: 'merge-verify', phase: 'E-MergeVerify' },
)

return {
  cron_boost: cronBoost,
  week1,
  week2,
  week34,
  merge_and_verify: mergeAndVerify,
  manual_actions_required: allStreams.flatMap(s => s.follow_up || []).filter((v, i, a) => a.indexOf(v) === i),
  env_vars_needed: allStreams.flatMap(s => s.env_vars_needed || []).filter((v, i, a) => a.indexOf(v) === i),
  migrations_in_order: allStreams.flatMap(s => s.migrations_added || []),
}
