export const meta = {
  name: 'weeks-1-to-4-round-2-2026-06-10',
  description: 'Round 2 of the post-audit roadmap — fires after the first weeks-1-to-4 workflow lands. Covers everything else: more UX polish, storage migrations + backfill, market-leadership 90-day plays (past-performance graph, auto-pursuit recommendations, Enterprise tier), observability + Sentry, ESLint v9 fix, CLAUDE.md update, memory updates, stale worktree cleanup. ~17 streams across 6 phases.',
  whenToUse: 'After weeks-1-to-4-2026-06-10 completes and its migrations are applied. The follow-up workflow that finishes the roadmap.',
  phases: [
    { title: 'X1-Hygiene', detail: '3 parallel: ESLint v9 fix, stale worktree cleanup, CLAUDE.md update' },
    { title: 'X2-MoreUX', detail: '5 parallel: pipeline UX polish, settings autosave verify, AI filter empty states, proposal AI HUMANIZER, mobile match cards' },
    { title: 'X3-Storage', detail: '3 parallel: capability-statement bucket policy, file_url → storage_path backfill, protectCrawl to RPC-backed rate limiter' },
    { title: 'X4-MarketPlays', detail: '3 parallel: past-performance graph, auto-pursuit recommendations, Enterprise pricing tier' },
    { title: 'X5-Observability', detail: '2 parallel: Sentry alerts wiring, jobs admin overview' },
    { title: 'X6-MergeAndDocs', detail: 'merge all + final tsc + write a comprehensive WALK-RETURN-REPORT.md' },
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
    migrations_added: { type: 'array', items: { type: 'string' } },
    env_vars_needed: { type: 'array', items: { type: 'string' } },
  },
}

const SHARED = `You are executing post-audit roadmap work on CapturePilot 2.0 at ${ROOT}.

REPO STATE: clean main with the entire 2026-06-10 audit fix sprint + the weeks-1-to-4 first round already merged. Latest migrations through ~141. The session has shipped: security RPCs locked, async rescore, admin user mgmt, settings tabs, /signup + /login perf, /terms + /privacy static, edge runtime, RLS read policies, search_path locks, /dashboard parallelization, /admin/health tiles, HubSpot bidirectional, VPS cron migration, learning loop schema + endpoints, lead-magnet → trial nurture, queue keywords boost.

CONSTRAINTS:
- Match existing code style (Next.js 16, React 19, TS strict, Tailwind, lucide-react only)
- "use client" required on interactive pages
- !inner on Supabase joins when filtering on joined table (CLAUDE.md rule)
- Helpers: guardCron, assertAdmin, requireUser, createSupabaseServerClient, protectCrawl, sanitizeForOrSearch, signedDocUrl, rescoreUserMatches, computeOpportunityScore
- Don't refactor unrelated code; surgical patches
- New migration numbers start at 142 (assume first-round took 138-141). Pick next free; merge orchestrator renumbers collisions.
- HUMANIZER.md rules for user-facing copy: contractions, specifics, no buzzwords
- Run \`cd dashboard && npx tsc --noEmit\` before committing — only commit if 0 errors
- Commit format: \`feat(R2-X): description\` where X is the section
- Return via the structured schema`

// ============================================================================
// PHASE X1 — Hygiene + Docs (3 parallel)
// ============================================================================
phase('X1-Hygiene')

const x1 = await parallel([
  () => agent(`${SHARED}

WORK STREAM X1.1: ESLint v9 MIGRATION

CLAUDE.md flags ESLint v9 as broken: \`npm run lint\` fails because v9 expects flat config \`eslint.config.js\` but the repo has legacy \`.eslintrc\`. Non-blocking for builds but blocks the audit smoke check.

Do:
1. Read the existing \`.eslintrc\` (or \`.eslintrc.json\`/\`.eslintrc.js\`) in \`dashboard/\`.
2. Create \`dashboard/eslint.config.js\` (or \`.mjs\`) in flat-config format. Use the official Next.js migration helper if needed. Key rules to preserve: any Next.js eslint defaults + any custom rules in the legacy file.
3. Don't delete the legacy file yet — leave both during transition for clarity, but rename to \`.eslintrc.deprecated\` to suppress its loading.
4. Verify: \`cd dashboard && npm run lint\` should now run (it can find issues, just shouldn't fail on config).
5. Don't fix every lint issue — that's a separate pass. Just get the config valid.

Commit: \`fix(R2-X1): ESLint v9 flat config + deprecate legacy .eslintrc\`.`,
    { label: 'x1.1-eslint-v9', phase: 'X1-Hygiene', schema: FIX_RESULT, isolation: 'worktree' }),

  () => agent(`${SHARED}

WORK STREAM X1.2: STALE WORKTREE BRANCH CLEANUP

12+ branches left over from prior workflows (worktree-wf_a39a0032-1f2-1 through -9, worktree-wf_30d788cf-48e-1 through -3, plus possibly fix-sync).

Do:
1. \`cd ${ROOT} && git worktree list\` to confirm none of them are active.
2. \`git branch | grep worktree-wf\` to list them.
3. For each, \`git branch -D <branch>\` (force-delete since they've been merged into main).
4. Also delete \`fix-sync\` if it's just an old experiment (check with \`git log fix-sync --not main\` — if empty, delete; if not, leave it).
5. Run \`git gc --prune=now --aggressive\` to reclaim disk.

Don't push anything — branch deletion is local only. Don't touch the active main branch.

Commit: nothing to commit (this is git-admin only). Set status: 'done' and notes describing what was cleaned up.`,
    { label: 'x1.2-worktree-cleanup', phase: 'X1-Hygiene', schema: FIX_RESULT, isolation: 'worktree' }),

  () => agent(`${SHARED}

WORK STREAM X1.3: UPDATE CLAUDE.md WITH 2026-06-10 SESSION

CLAUDE.md is the source of truth. Today's session shipped massive changes that need to be documented.

Do:
1. Read \`${ROOT}/CLAUDE.md\` end-to-end.
2. Add a new "Recent major changes" section dated 2026-06-10 covering:
   - Platform audit (137 verified findings, 8 deliverable docs in \`docs/platform-audit-2026-06-10/\`)
   - Security: 6 SECURITY DEFINER RPCs locked, 8 cron routes migrated to guardCron, HMAC impersonate fix, /api/brand SSRF + IDOR + rate limit, /api/engine + /api/enrich deleted, 6 AI routes auth-gated, /api/leads dedup + protectCrawl, /api/lead-magnet/deliver session check, /api/beta-invites auth, /api/admin/impersonate HMAC, HubSpot webhook fail-closed, search_path locks
   - Queue: dedicated run_worker_jobs_keywords lane + run_worker_jobs_rescore lane, zombie reaper migration, dedup_key now includes user_profile_id
   - Rescore: /api/matches/refresh is now async via worker_jobs, Postgres AFTER UPDATE trigger on user_profiles auto-enqueues
   - Email: Resend webhook verified live, bounce → outreach_optouts → HubSpot mirror, send() suppression check, sendRoleChangedEmail
   - Storage: client-docs bucket private + signed-url helper + per-profile RLS, signed-doc-url lib
   - Data: computeOpportunityScore lib + backfill cron, env-health KPIs (null_ai_win_strategy_pct, null_opportunity_score_pct)
   - UX: matches page filters in Supabase query, settings Advanced tabs (Capacity/Industry/Codes/Targeting), admin row-actions menu (role change w/ email, suspend, reset, delete)
   - Perf: /signup + /login slimmed, /terms + /privacy force-static, edge runtime on read-only routes, /dashboard parallelized + Suspense
   - Learning loop: pursuit_outcomes + proposal_edit_events + match_engagement_events tables + capture endpoints
   - VPS: 5+ low-frequency crons moved to systemd timers
3. Update the "Database (Supabase)" section: latest migration is now ~145+. List the new tables (pursuit_outcomes, proposal_edit_events, match_engagement_events, outreach_optouts.source column, client_documents.storage_path).
4. Update the "Cron Schedule" section: count is now lower if VPS migration removed entries; new lanes (keywords, rescore) added.
5. Update "Known Issues / Backlog": ESLint v9 may now be fixed (verify); add anything that was identified as deferred this session.
6. Update "Installed GitHub / NPM Libraries" table with anything new the audit-fix sprint added.

Match the existing writing style (terse, technical, source-of-truth tone). Don't add marketing fluff.

Commit: \`docs(R2-X1): update CLAUDE.md for 2026-06-10 session\`.`,
    { label: 'x1.3-claude-md-update', phase: 'X1-Hygiene', schema: FIX_RESULT, isolation: 'worktree' }),
])

// ============================================================================
// PHASE X2 — More UX Polish (5 parallel)
// ============================================================================
phase('X2-MoreUX')

const x2 = await parallel([
  () => agent(`${SHARED}

WORK STREAM X2.1: PIPELINE UX POLISH

\`dashboard/src/app/(dashboard)/pipeline/page.tsx\` and the Kanban board component.

Do:
1. Read the page + KanbanBoard component.
2. Fix the dismissMatch / pipeline weighted-value sum bug (audit #2 / weighted forecast reads award_amount only, ignores estimated_value). Use COALESCE(award_amount, estimated_value, 0) for forecast totals.
3. Add a List view toggle (Kanban / List) with localStorage persistence.
4. Add custom stage rename via inline edit on the column header (already-shipped per CLAUDE.md but verify it works).
5. On drag-drop optimistic update — if API fails, revert + toast "Stage update failed".
6. Mobile: Kanban columns horizontally scrollable with snap-x snap-mandatory, or auto-fall back to List on small screens.
7. Empty-state on each stage: "Drop a deal here" with a faint icon, not just blank space.

Commit: \`fix(R2-X2): pipeline weighted forecast + mobile Kanban + revert-on-fail\`.`,
    { label: 'x2.1-pipeline-polish', phase: 'X2-MoreUX', schema: FIX_RESULT, isolation: 'worktree' }),

  () => agent(`${SHARED}

WORK STREAM X2.2: SETTINGS AUTOSAVE VERIFY + INDICATOR

Audit found that CLAUDE.md says settings has debounced autosave, but the code doesn't. The first-round Week 1 settings-tabs work added tabs but may not have fixed autosave.

Do:
1. Read \`dashboard/src/app/(dashboard)/settings/page.tsx\`.
2. If autosave exists, add a small status indicator (top-right of the active tab): "Saved" with checkmark, "Saving..." with spinner, "Unsaved" with amber dot. Use existing GlobalToast for errors.
3. If autosave doesn't exist, implement it: debounce 1.2s, PATCH user_profiles with the dirty fields, fire on input blur for instant feel.
4. Add a beforeunload guard: if there are unsaved changes, prompt before navigation.
5. The fields to autosave: company_name, contact_name, contact_phone, naics_codes, primary_keywords, secondary_keywords, target_states, sba_certifications.

Commit: \`feat(R2-X2): settings autosave + status indicator + beforeunload guard\`.`,
    { label: 'x2.2-settings-autosave', phase: 'X2-MoreUX', schema: FIX_RESULT, isolation: 'worktree' }),

  () => agent(`${SHARED}

WORK STREAM X2.3: AI FILTER EMPTY STATES + UX

\`dashboard/src/app/api/matches/ai-filter\` + the filter bar component.

Do:
1. Find the AI filter UI component (probably AIFilterBar).
2. Improve empty states:
   - When AI returns no matches: "No matches for this filter. Try simpler keywords or remove a constraint."
   - When AI errors: "AI filter is having a moment. Try again or use the manual filters above."
3. Add quick-suggestion chips below the input: 3-5 example queries based on user's profile ("HOT janitorial matches in VA", "Sources sought 8(a)", "expiring this week"). Click a chip → populates input + auto-runs.
4. Add a "Clear" X button inside the input when there's text.
5. The filter should debounce 500ms after typing stops, not require Enter.

Commit: \`feat(R2-X2): AI match filter — better empty states + suggestion chips\`.`,
    { label: 'x2.3-ai-filter-ux', phase: 'X2-MoreUX', schema: FIX_RESULT, isolation: 'worktree' }),

  () => agent(`${SHARED}

WORK STREAM X2.4: PROPOSAL AI VOICE ENFORCEMENT (HUMANIZER)

Per CLAUDE.md: "Any AI-writing prompt for user-facing copy must prepend HUMAN_VOICE_RULES from @/lib/llm/humanizer."

Do:
1. Find every OpenAI call site that produces user-facing copy. Grep for \`openai.chat.completions.create\` or \`chat.completions\` across dashboard/src/.
2. For each, verify the system prompt includes HUMAN_VOICE_RULES. If not, prepend it.
3. Key files to check:
   - dashboard/src/app/api/ai/write-proposal/route.ts
   - dashboard/src/app/api/ai/draft-email/route.ts
   - dashboard/src/app/api/ai/draft-template/route.ts
   - dashboard/src/app/api/ai/generate-proposal/route.ts
   - dashboard/src/app/api/ai/summarize-document/route.ts
   - dashboard/src/app/api/ai/capability-statement/route.ts (if exists)
   - dashboard/src/lib/lead-brief.ts (lead brief generator)
   - dashboard/src/app/api/brand/route.ts (brand description extraction)
   - Any quick-checker prompts under dashboard/src/lib/quick-checker/

4. Also: the prompt should include explicit instructions about audience (federal contractors, time-poor operators) + format guidance (markdown OK, no excessive bullets, mixed sentence length).

Commit: \`feat(R2-X2): HUMAN_VOICE_RULES on all AI user-facing copy generators\`.`,
    { label: 'x2.4-proposal-ai-voice', phase: 'X2-MoreUX', schema: FIX_RESULT, isolation: 'worktree' }),

  () => agent(`${SHARED}

WORK STREAM X2.5: MOBILE MATCH CARDS + DASHBOARD WIDGETS

The matches grid + dashboard widgets need mobile-first polish.

Do:
1. \`dashboard/src/app/(dashboard)/matches/page.tsx\` — match cards. On mobile (< 768px):
   - Cards stack full-width
   - The action row (Pursue, Save, Dismiss, Export checkbox) becomes a swipeable mini-toolbar
   - Long agency names truncate with "+"
   - Tap card → expanded view, not requiring hover
2. \`dashboard/src/app/(dashboard)/page.tsx\` (dashboard root) — widgets:
   - Top Matches card: scrollable horizontal on mobile, not stacked
   - Hot/Warm count tiles: 2 columns on mobile, 4 on desktop
   - Market Watch widget: collapse to summary on mobile, expand on tap
   - Year-End Spend Radar: keep but compress (single column, smaller fonts)
3. Add a mobile-only sticky bottom nav bar with Dashboard / Matches / Pipeline / Settings as quick-jump icons.

Commit: \`feat(R2-X2): mobile-first match cards + dashboard widgets + sticky bottom nav\`.`,
    { label: 'x2.5-mobile-cards', phase: 'X2-MoreUX', schema: FIX_RESULT, isolation: 'worktree' }),
])

// ============================================================================
// PHASE X3 — Storage + Rate Limit Hardening (3 parallel)
// ============================================================================
phase('X3-Storage')

const x3 = await parallel([
  () => agent(`${SHARED}

WORK STREAM X3.1: CAPABILITY STATEMENT BUCKET POLICY

The audit migration made client-docs private with RLS. Capability statements also live under client-docs at \`capability-statements/{profile_id}/...\`. Verify the policy works for them + add explicit COMMENT documenting the path convention.

Do:
1. Read \`dashboard/src/app/(dashboard)/capability-statement/page.tsx\` — find the upload + download paths.
2. Verify uploads now use the user-scoped client (not service key), and downloads call createSignedUrl from the signed-doc-url helper.
3. If file_url is still stored, migrate to storage_path. Backfill any existing rows in user_profiles.notes.capability_statement_url if they point at public CDN URLs.
4. Create migration 142 (or next free) that adds an explicit policy comment on storage.objects for the capability-statements/ prefix.

Commit: \`feat(R2-X3): capability statement storage signed-URL migration\`.`,
    { label: 'x3.1-cap-statement-bucket', phase: 'X3-Storage', schema: FIX_RESULT, isolation: 'worktree' }),

  () => agent(`${SHARED}

WORK STREAM X3.2: client_documents.file_url BACKFILL

Audit follow-up: existing rows in \`client_documents\` have file_url pointing at the public CDN, and the new code reads storage_path. Backfill so download still works for legacy rows.

Do:
1. Create migration 143 (or next free): UPDATE client_documents SET storage_path = regexp_replace(file_url, '^https?://[^/]+/storage/v1/object/public/client-docs/', '') WHERE storage_path IS NULL AND file_url LIKE '%/storage/v1/object/public/client-docs/%';
2. After backfill, anything still NULL gets a defensive UPDATE setting storage_path = NULL (no change) — no-op but documented.
3. Add a CHECK constraint trigger or app-side validation: new inserts must have storage_path NOT NULL (file_url can still be set for legacy display, but storage_path becomes authoritative).

Commit: \`fix(R2-X3): backfill client_documents.storage_path from legacy file_url\`.`,
    { label: 'x3.2-storage-path-backfill', phase: 'X3-Storage', schema: FIX_RESULT, isolation: 'worktree' }),

  () => agent(`${SHARED}

WORK STREAM X3.3: PROTECTCRAWL → RPC-BACKED RATE LIMITER

Today's audit fixes added a protectCrawl helper that's in-memory per Vercel instance. Audit follow-up: "Move to rl_bump RPC or Upstash Redis when convenient."

Do:
1. Read \`dashboard/src/lib/protect-crawl.ts\` (or wherever it lives — grep for the export).
2. Check if rl_bump RPC exists in Supabase (it should per CLAUDE.md). If not, create migration 144 to add it: takes (key text, window_seconds int, max_count int) → returns boolean (true if under limit, false if rate-limited).
3. Refactor protectCrawl to use rl_bump RPC instead of the in-memory Map. Keep the same signature so callers don't change.
4. Add a sticky "last 60s" view in /admin/health for top rate-limited keys (count by route + IP).
5. Document the migration in a code comment: "Was in-memory per Vercel instance until 2026-06-10 R2".

Commit: \`feat(R2-X3): protectCrawl → rl_bump RPC for horizontal-scaled rate limit\`.`,
    { label: 'x3.3-rl-rpc', phase: 'X3-Storage', schema: FIX_RESULT, isolation: 'worktree' }),
])

// ============================================================================
// PHASE X4 — Market-Leadership 90-day Plays (3 parallel)
// ============================================================================
phase('X4-MarketPlays')

const x4 = await parallel([
  () => agent(`${SHARED}

WORK STREAM X4.1: PAST-PERFORMANCE GRAPH

Per market-leadership doc: incumbent flip prediction — a graph of who-beats-who in federal awards, used to predict recompete vulnerability.

Do:
1. Create migration 145 (or next free): table \`prime_relationships\` (id, winner_contractor_id, loser_contractor_id, agency, naics_code, contract_id, award_amount, decision_date, contract_type, created_at).
2. New cron \`/api/cron/build_pp_graph\` — runs nightly, scans contractors + opportunities awarded vs lost competitors (from award_notices table if it exists), upserts edges into prime_relationships. Use guardCron + withCronTelemetry.
3. New lib \`dashboard/src/lib/pp-graph.ts\` with helpers:
   - getFlipCandidates(contractor_id, agency) → list of contractors who beat this one repeatedly (incumbent flip targets)
   - getRecompeteRisk(contractor_id, opp_id) → 0-1 score based on past losses to overlapping contractors
4. Add a "Recompete Risk" card on the opportunity detail page using getRecompeteRisk.
5. Route the cron through enrichment_orchestrator (Vercel is at ceiling).

Commit: \`feat(R2-X4): past-performance graph + recompete risk scoring\`. Return migration name.`,
    { label: 'x4.1-pp-graph', phase: 'X4-MarketPlays', schema: FIX_RESULT, isolation: 'worktree' }),

  () => agent(`${SHARED}

WORK STREAM X4.2: AUTO-PURSUIT RECOMMENDATIONS

Combine cert + NAICS + agency history into auto-pursuit recommendations on the dashboard.

Do:
1. Create lib \`dashboard/src/lib/auto-pursuit-recommend.ts\` that takes a user_profile_id and returns a ranked list of opportunity_ids the user SHOULD be pursuing right now, with reasons.
2. Algorithm: for each ACTIVE HOT/WARM match:
   - +20 if user has matching SBA cert + opp has matching set_aside
   - +15 if user's preferred_agencies includes the opp agency
   - +10 if user's NAICS matches opp.naics_code (primary OR secondary)
   - +10 if deadline 14-45 days out (sweet spot)
   - +5 if user has past_performance with same agency (query user_profiles.notes.past_performance or a past_performance table)
3. New endpoint \`/api/recommendations/pursue\` — auth-gated, returns top 5 ranked with reasons.
4. New card on /dashboard root: "Should pursue this week" with the top 3, each with a one-click "Add to Pipeline" button.

Commit: \`feat(R2-X4): auto-pursuit recommendation lib + dashboard card\`.`,
    { label: 'x4.2-auto-pursuit', phase: 'X4-MarketPlays', schema: FIX_RESULT, isolation: 'worktree' }),

  () => agent(`${SHARED}

WORK STREAM X4.3: TEAM PRICING TIER

Per market-leadership doc: current Pro might be underpriced; add a tier above. Customers with multiple users, white-label, or higher-volume Quick Checker.

STRIPE PRICES ALREADY CREATED LIVE (don't create new ones):
- Product: prod_UgFKvfAMgIEdAC (CapturePilot Team)
- Monthly: STRIPE_PRICE_TEAM_MONTHLY=price_1TgsprE3XmFFFGWvqIXD4SsF ($299/mo)
- Yearly: STRIPE_PRICE_TEAM_YEARLY=price_1TgsprE3XmFFFGWv0fjOwbvF ($2870.40/yr, 20% off)
- Both env vars ALREADY SET in Vercel Production + Development. Wire them through without re-creating in Stripe.

Do:
1. Update lib/stripe.ts (or wherever prices are referenced) to include TEAM_MONTHLY + TEAM_YEARLY price IDs from env.
2. Update \`dashboard/src/app/(public)/billing/page.tsx\` (or wherever pricing lives) with a third tier card:
   - Name: "Team" (not Enterprise — more honest for current state)
   - Price: $299/mo (placeholder, document as TODO)
   - Features:
     - Everything in Pro
     - Up to 5 users per account
     - White-label option (custom logo + colors)
     - Priority support (24h response)
     - Custom Quick Checker volume (500/mo vs 50/mo)
3. Add feature gating in lib: \`isTeamTier(profile) → boolean\`. Don't actually gate features yet — just put the helpers in place for future use.
4. Update /signup flow so users can see the Team tier on the public pricing page.
5. Add migration 146 (or next free): add \`tier\` column to user_profiles (default 'pro'), allow 'team', 'enterprise'. Migration must NOT break existing self_service/consulting/admin account_type column.

Commit: \`feat(R2-X4): Team pricing tier scaffolding\`. Document env vars in env_vars_needed: STRIPE_PRICE_TEAM_MONTHLY, STRIPE_PRICE_TEAM_YEARLY.`,
    { label: 'x4.3-team-tier', phase: 'X4-MarketPlays', schema: FIX_RESULT, isolation: 'worktree' }),
])

// ============================================================================
// PHASE X5 — Observability (2 parallel)
// ============================================================================
phase('X5-Observability')

const x5 = await parallel([
  () => agent(`${SHARED}

WORK STREAM X5.1: SENTRY ALERT WIRING

CapturePilot uses @sentry/nextjs per CLAUDE.md but alerts aren't surfaced consistently.

Do:
1. Find the Sentry init file (probably \`dashboard/sentry.client.config.ts\` + \`sentry.server.config.ts\`).
2. Add explicit alerting rules / breadcrumbs on these high-leverage events:
   - Cron failure (any cron returning non-2xx) — Sentry.captureMessage('cron_failed', { extra: { route, status } })
   - Worker queue lane pending > 5000 + no done in last hour — log via health_monitor
   - Webhook signature mismatch (Stripe, Resend, HubSpot) — Sentry.captureMessage('webhook_signature_invalid', ...)
   - OpenAI failure with cost — Sentry.captureMessage('openai_failure', { extra: { route, cost_tokens } })
3. Wire alert recipes in health_monitor if they're not already (audit said "Alert recipes patched" so verify cron_failed and worker_spike work).
4. Make sure Sentry tags include the deployment URL + git sha for filtering.

Commit: \`feat(R2-X5): Sentry breadcrumbs + alert recipes for cron/queue/webhook/AI failures\`.`,
    { label: 'x5.1-sentry-alerts', phase: 'X5-Observability', schema: FIX_RESULT, isolation: 'worktree' }),

  () => agent(`${SHARED}

WORK STREAM X5.2: ADMIN JOB OVERVIEW

A unified admin page that shows all background jobs across the system: cron runs, worker_jobs, scheduled_emails, attachment_analysis_jobs, etc. Currently each is at a separate admin URL.

Do:
1. Create \`dashboard/src/app/(admin)/admin/jobs/page.tsx\` — unified job overview.
2. Tabs: Crons / Worker Queue / Email Queue / Attachment Jobs / Rescore Queue.
3. Per tab: live-refresh every 10s (use the existing /admin/queue pattern), per-row "Re-run" button (admin auth required, calls the existing cron-trigger endpoint).
4. Each tab shows: last run / status / counts / throughput.
5. Add to admin sidebar nav.

Commit: \`feat(R2-X5): unified /admin/jobs overview\`.`,
    { label: 'x5.2-jobs-admin', phase: 'X5-Observability', schema: FIX_RESULT, isolation: 'worktree' }),
])

// ============================================================================
// PHASE X6 — Merge + Verify + Final Report
// ============================================================================
phase('X6-MergeAndDocs')

const allStreams = [...x1, ...x2, ...x3, ...x4, ...x5].filter(Boolean)

const mergeAndReport = await agent(
  `You are the merge orchestrator + report writer for ROUND 2 of the post-audit roadmap (16 streams).

STREAMS:
${JSON.stringify(allStreams.map(r => ({ stream: r.stream, sha: r.commit_sha, status: r.status, files: r.files_touched, migrations: r.migrations_added || [], env_vars: r.env_vars_needed || [], follow_up: r.follow_up || [] })), null, 2)}

PART 1 — MERGE
1. cd ${ROOT}
2. \`git worktree list\` to enumerate paths + branches.
3. Merge in this order (least-conflict first):
   - x1.1-eslint-v9, x1.2-worktree-cleanup, x1.3-claude-md-update
   - x3.2-storage-path-backfill (migration only), x3.1-cap-statement-bucket, x3.3-rl-rpc
   - x5.1-sentry-alerts, x5.2-jobs-admin
   - x2.2-settings-autosave, x2.3-ai-filter-ux, x2.4-proposal-ai-voice (touches AI prompts)
   - x2.1-pipeline-polish, x2.5-mobile-cards
   - x4.1-pp-graph, x4.2-auto-pursuit, x4.3-team-tier
4. For each: \`git merge --no-ff <branch> -m "merge: <stream>"\` then \`cd dashboard && npx tsc --noEmit 2>&1 | head -30\`.
5. If errors: \`git reset --hard HEAD~1\` and record skip.
6. Final \`tsc --noEmit\` clean.
7. Collect all new migration filenames in apply order.
8. \`git worktree remove --force\` each.

PART 2 — WRITE WALK-RETURN-REPORT.md
After all merges, write a comprehensive markdown report to \`${ROOT}/docs/WALK-RETURN-REPORT.md\` covering EVERYTHING from this entire session (today, 2026-06-10):

# CapturePilot — Session report for return from walk

## TL;DR
- Total commits: <count>
- Total migrations: <list 132-<latest>>
- Streams shipped: <count> across <count> workflows
- Mobile RES expected: 67 → 88+ (after deploy verification)
- Queue backlog: 30K pending → draining at <rate> jobs/hr

## What's live in prod right now
(comprehensive list grouped by area: security, queue/reliability, data quality, email, UX, perf, admin tooling, learning loop, market plays)

## What's pending Vercel deploy
(list deploy URLs + expected ETA)

## Migrations applied today
(numbered list with one-line description each)

## New env vars in Vercel (set during session)
(list)

## Env vars STILL needed from user
(deduped list from all streams' env_vars_needed)

## Manual actions still needed
(deduped list from all streams' follow_up — what the user needs to do)

## Next session priorities (sequenced)
(top 5 items still on the backlog after this session)

## Files of interest
- Audit deliverables: docs/platform-audit-2026-06-10/
- Workflow scripts: .claude/workflows/
- Updated docs: CLAUDE.md, this report

Voice: HUMANIZER.md — direct, specifics, no buzzwords. Write so a tired founder can scan in 60 seconds and find next-action items.

Return the merge summary + path to the report file.`,
  { label: 'x6-merge-and-report', phase: 'X6-MergeAndDocs' },
)

return {
  x1, x2, x3, x4, x5,
  merge_and_report: mergeAndReport,
  manual_actions_required: allStreams.flatMap(s => s.follow_up || []).filter((v, i, a) => a.indexOf(v) === i),
  env_vars_needed: allStreams.flatMap(s => s.env_vars_needed || []).filter((v, i, a) => a.indexOf(v) === i),
  migrations_in_order: allStreams.flatMap(s => s.migrations_added || []),
}
