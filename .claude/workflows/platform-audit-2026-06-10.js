export const meta = {
  name: 'platform-audit-2026-06-10',
  description: 'End-to-end CapturePilot platform audit: 12 parallel domain readers → 6 synthesis tracks → adversarial verification on critical findings → 8 deliverables in docs/platform-audit-2026-06-10/',
  whenToUse: 'When the user asks for a comprehensive platform health check, market-readiness review, or pre-scale audit. Produces evidence-backed findings, not opinions.',
  phases: [
    { title: 'Discover', detail: '12 parallel domain readers map the codebase + infra + DB + integrations' },
    { title: 'Synthesize', detail: 'Compile findings into 6 cross-cutting reports (security, perf, data, integrations, UX, infra)' },
    { title: 'Verify', detail: 'Adversarial 2-of-3 skeptic vote on every critical/high-priority finding' },
    { title: 'Deliver', detail: 'Single writer agent produces the 8 deliverables as markdown in docs/platform-audit-2026-06-10/' },
  ],
}

const ROOT = '/Users/andreschuler/Caturepilot 2.0'
const OUT = `${ROOT}/docs/platform-audit-2026-06-10`

const FINDING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['domain', 'findings'],
  properties: {
    domain: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'severity', 'category', 'evidence', 'impact', 'recommendation'],
        properties: {
          title: { type: 'string', description: 'One-line finding title' },
          severity: { enum: ['critical', 'high', 'medium', 'low', 'nice-to-have'] },
          category: { enum: ['bug', 'broken-workflow', 'dead-code', 'duplicate-logic', 'security', 'performance', 'data-quality', 'ux-friction', 'tech-debt', 'unused-dep', 'scalability', 'observability', 'integration-gap', 'market-opportunity'] },
          evidence: { type: 'string', description: 'file_path:line + concrete observation. No vague claims.' },
          impact: { type: 'string', description: 'What breaks / what the user experiences / blast radius' },
          recommendation: { type: 'string', description: 'Specific fix or next step. No "consider refactoring" — name the change.' },
          effort: { enum: ['<1h', '1-4h', '0.5-2d', '3-5d', '>1wk'] },
        },
      },
    },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['real', 'reason', 'confidence'],
  properties: {
    real: { type: 'boolean', description: 'Is this finding real, or hallucinated / based on stale info?' },
    reason: { type: 'string', description: 'Refutation attempt — what would make this false?' },
    confidence: { enum: ['high', 'medium', 'low'] },
    severity_adjustment: { enum: ['keep', 'downgrade-one', 'upgrade-one'], description: 'After verifying, should severity change?' },
  },
}

// ============================================================================
// PHASE 1 — Discover
// ============================================================================
phase('Discover')

const READERS = [
  {
    label: 'frontend',
    prompt: `You are auditing the FRONTEND of CapturePilot 2.0, a B2G federal contracting SaaS.

Scope: Read \`${ROOT}/dashboard/src/app/(dashboard)/**\`, \`${ROOT}/dashboard/src/app/(public)/**\`, \`${ROOT}/dashboard/src/app/(portal)/**\`, \`${ROOT}/dashboard/src/components/**\`. Sample the most-used pages: dashboard root, matches, opportunities, pipeline, capability-statement, settings, billing, portal.

Look for:
- "use client" missing on interactive pages
- Supabase joins without \`!inner\` when filtering on joined table (CLAUDE.md flags this as a known footgun)
- Pages that fetch many things serially when they should parallelize
- Components that re-render entire trees on small state changes
- Icon imports outside lucide-react (rule violation)
- Pages with no loading state / no error state
- Forms with no validation / no submit-disable
- Hardcoded copy that should come from \`@/lib/llm/humanizer\` HUMAN_VOICE_RULES
- Pages that don't redirect unauthenticated users
- Dead pages (defined but not in any nav)

For each finding give: file_path:line, the actual code observed, why it's bad, specific fix.

Return JSON per the schema.`,
  },
  {
    label: 'backend-api',
    prompt: `You are auditing the BACKEND API of CapturePilot 2.0.

Scope: \`${ROOT}/dashboard/src/app/api/**\`. There are ~80+ routes across admin/, cron/, ai/, analyze/, email/, sam/, sbir/, partners/, brand/, public/, stripe/, hubspot/, lead-magnet/, startup-pack/, matches/, pursuits/, profile/, billing/, etc.

Look for:
- Admin routes missing \`assertAdmin()\` from \`@/lib/auth-admin\` (CLAUDE.md rule)
- Cron routes missing \`guardCron(req)\` from \`@/lib/cron-auth\` (CLAUDE.md rule — fail-closed in prod)
- Routes that proxy external services without hostname validation (SSRF risk)
- Routes that forward sensitive query params (api_key in URLs — CLAUDE.md flags this)
- SQL injection (raw string concat into SQL — Supabase RPC is safe, raw \`from\` builder strings are not)
- Auth bypass paths (route checks user but uses service-role client without re-scoping)
- Routes that return PII without auth
- Routes with no rate limiting that hit external paid APIs
- Routes that do heavy work synchronously (>10s on Vercel = timeout near 60s default)
- Duplicate routes that do the same thing
- Routes referenced in code/cron config but file doesn't exist (404 on real traffic)
- Empty try/catches that swallow errors silently

For each finding: file_path:line, observation, blast radius, specific fix.

Return JSON per the schema.`,
  },
  {
    label: 'database-schema',
    prompt: `You are auditing the DATABASE schema for CapturePilot 2.0.

Scope: \`${ROOT}/dashboard/supabase/migrations/**\` (~88 migrations, 001-088). Plus inspect via Supabase MCP the live tables in project \`ryxgjzehoijjvczqkhwr\` ("Capturepilot OS").

You have access to mcp__claude_ai_Supabase__list_tables and mcp__claude_ai_Supabase__execute_sql — USE THEM to inspect actual schema state, not just migration files.

Look for:
- Tables without RLS enabled (mcp__claude_ai_Supabase__get_advisors will surface these)
- Missing indexes on columns used in WHERE/JOIN (run EXPLAIN on the largest tables: opportunities, contractors, contacts, worker_jobs, user_matches)
- Foreign keys without ON DELETE policy
- jsonb columns with no GIN index that are queried with @>
- Tables with no \`updated_at\` trigger
- Columns named slightly differently in different tables (\`user_id\` vs \`auth_user_id\` vs \`profile_id\` — CLAUDE.md flagged this caused a security bug)
- Tables with millions of rows + no partitioning
- Orphaned tables (defined in migration, never read by app code)
- Duplicate or near-duplicate tables
- Migrations that ran out of order or have conflicting numbers
- Tables that grow unboundedly with no archive/cleanup (e.g. activity_log, scheduled_emails)

For each finding: migration_number + line OR table_name, observation, impact, fix.

Return JSON per the schema.`,
  },
  {
    label: 'cron-and-queue',
    prompt: `You are auditing the cron + worker_jobs queue system.

Scope:
- \`${ROOT}/dashboard/vercel.json\` (40 cron entries — at the Pro-plan ceiling per CLAUDE.md)
- \`${ROOT}/dashboard/src/app/api/cron/**\`
- \`${ROOT}/tools/playwright-worker/worker.js\`
- \`${ROOT}/dashboard/supabase/migrations/086_worker_jobs_platform.sql\`
- \`${ROOT}/CRON.md\` if it exists

Use mcp__claude_ai_Supabase__execute_sql against project \`ryxgjzehoijjvczqkhwr\` to query \`worker_jobs\` for:
- Failure rates per task_type in last 24h / 7d
- Tasks stuck in 'running' > 1 hour (zombie claims)
- Tasks with attempts > max_attempts but still pending
- Per-task p95 duration (started_at to finished_at)

ALSO investigate THIS SPECIFIC BUG: \`warm_cf_cookie\` jobs are failing with "strict CF tenant + FLARESOLVERR_URL not configured" even though the VPS Playwright worker has \`FLARESOLVERR_URL=http://flaresolverr:8191\` set. The VPS worker logs show only \`scrape_portal_detail\` being claimed, never \`warm_cf_cookie\`. Find which consumer is actually processing warm_cf_cookie jobs (probably the Vercel \`/api/cron/run_worker_jobs\` route) and confirm FLARESOLVERR_URL is missing from Vercel env.

Look for:
- Cron routes scheduled in vercel.json that don't exist as files
- Cron files that exist but aren't scheduled
- Crons with no \`guardCron\`
- Crons that overlap (two jobs every 5 min that take 8 min each = always overlapping)
- Crons with no timeout / maxDuration set near Vercel limits
- Tasks queued faster than consumed (work-rate imbalance)
- Crons that haven't run successfully in >24h
- The 40-cron ceiling — list every cron + recommend which to move to VPS systemd

For each finding: cron name OR task_type, evidence (with stats), impact, fix.

Return JSON per the schema.`,
  },
  {
    label: 'vps-infra',
    prompt: `You are auditing the VPS infrastructure at srv1113360.hstgr.cloud.

You have SSH access via \`ssh -i ~/.ssh/cp_vps root@srv1113360.hstgr.cloud\` (no prompts, no host-key checks needed).

Use Bash to inspect:
- \`docker ps\` — what's running, restart counts, healthy/unhealthy
- \`docker stats --no-stream\` — CPU/mem per container
- \`df -h\` / \`du -sh /var/lib/docker\` / \`du -sh /docker\` — disk pressure
- \`free -m\` / \`uptime\` — RAM, load
- \`systemctl list-units --failed\` + the capturepilot-cron@* units
- Recent docker logs for: playwright-worker-worker-1 (zombies + errors), flaresolverr, watchtower
- \`docker exec playwright-worker-worker-1 ps aux | wc -l\` — defunct-chrome count (zombie reaping issue spotted earlier today)
- \`crontab -l\` and \`ls /etc/cron.d/\` — host-level crons (git-pull, tasks-runner, health-check per memory)
- \`/root/projects/scripts/*.log\` if they exist — recent error patterns

Look for:
- Containers restarting frequently
- Zombie/defunct processes accumulating
- Disk usage > 70%
- Memory pressure / OOM kills
- Failing systemd units
- Stale containers using outdated images
- Watchtower not actually pulling (compare local image age vs remote registry)
- Crons that error silently
- Services that should be on the VPS but aren't (or vice versa)
- FlareSolverr not reachable from where it needs to be

For each finding: container_name OR file_path, observation, impact, fix.

Return JSON per the schema.`,
  },
  {
    label: 'ai-workflows',
    prompt: `You are auditing AI workflows for CapturePilot 2.0.

Scope:
- \`${ROOT}/dashboard/src/app/api/ai/**\`
- \`${ROOT}/dashboard/src/lib/llm/**\`
- \`${ROOT}/dashboard/src/lib/quick-checker/**\`
- \`${ROOT}/dashboard/src/lib/lead-brief.ts\`, \`${ROOT}/dashboard/src/lib/match-scoring.ts\`, \`${ROOT}/dashboard/src/lib/quick-checker-finish.ts\`
- Any other OpenAI call sites — grep for \`openai.chat.completions.create\` or \`gpt-4o\` or \`gpt-5\`

Look for:
- Prompts that don't prepend HUMAN_VOICE_RULES for user-facing copy (CLAUDE.md rule)
- Prompts with no \`response_format: { type: "json_object" }\` that try to parse JSON
- Empty try/catch around OpenAI that fall back to silent empty string (CLAUDE.md flagged this pattern as a past bug — "no more silent empty proposals")
- Token waste: prompts that include 50KB of context when 5KB would do
- Models used: are we on gpt-4o-mini for things that need gpt-4o, or vice versa?
- No retry logic on transient OpenAI failures
- No max_tokens cap (cost runaway risk)
- Streaming endpoints that don't actually stream
- Duplicate prompt logic (same instructions repeated in 3 files)
- Capability extraction / brand extraction prompts that are stale relative to schema
- Quick Checker pipeline: any step that fails silently and produces empty fields
- Deep-extract / lead-brief: confidence scoring missing on outputs

For each finding: file_path:line, prompt excerpt, what breaks, fix.

Return JSON per the schema.`,
  },
  {
    label: 'integrations',
    prompt: `You are auditing integrations for CapturePilot 2.0: HubSpot, Stripe, Resend, SAM.gov, Apollo, USASpending, SBIR, FlareSolverr, OpenAI, Twilio (if any).

Scope:
- \`${ROOT}/dashboard/src/app/api/hubspot/**\`, \`hubspot-brief.ts\`, any HubSpot client lib
- \`${ROOT}/dashboard/src/app/api/stripe/**\`, webhook handlers
- \`${ROOT}/dashboard/src/lib/email/**\`, Resend usage
- \`${ROOT}/dashboard/src/app/api/sam/**\`, SAM.gov clients
- \`${ROOT}/dashboard/src/app/api/sbir/**\`
- Apollo wrappers (grep for "apollo")
- \`${ROOT}/dashboard/src/lib/cron-auth.ts\`, \`auth-admin.ts\`

For each integration, verify:
- Hostname allowlist (no SSRF)
- API key passed via header not URL (SAM.gov rule)
- Webhook signature verification (Stripe especially — webhook_secret must match)
- Idempotency on retried webhooks
- Bidirectional sync where claimed (HubSpot contacts/companies/notes/activities)
- Error handling: bounce/suppression for email, retry-after for SMS
- Rate limit handling (Resend 2/sec free tier, Apollo bursting, SAM API throttling)
- Stale tokens / expired credentials (check expiry on stored OAuth tokens in DB)

ALSO investigate: User says SMS notifications are not consistently received and email bounces aren't auto-updating HubSpot contact properties. Find the actual code paths and identify why.

For each finding: integration_name, file_path:line, observation, fix.

Return JSON per the schema.`,
  },
  {
    label: 'email-sms-delivery',
    prompt: `You are auditing email + SMS delivery infrastructure.

Scope:
- All Resend send sites (grep \`resend.emails.send\` or \`new Resend\`)
- Bounce/complaint webhook handlers (look for \`resend/webhook\` or similar)
- Email suppression list table (if any — check migrations for "suppression" or "bounce")
- Open/click tracking — is it on? Is data captured anywhere?
- SMS provider (Twilio? other?) — find the send code
- Email templates — are there duplicates? Are HUMAN_VOICE_RULES applied to AI-generated emails?

Query Supabase project \`ryxgjzehoijjvczqkhwr\`:
- Tables matching 'email%', 'message%', 'sms%', 'notification%', 'bounce%'
- Recent sends (last 7d): success/failure/bounce counts
- Are there contacts marked bounced that we keep emailing?

Look for:
- No bounce handling → keep emailing dead addresses (deliverability tanks)
- No suppression check before send
- Webhook configured but route not exposed / unauthenticated
- HubSpot not updated when contact bounces
- SMS sends failing silently (no error logged)
- Magic-link / verification emails that go to spam due to no SPF/DKIM
- Templates with broken merge vars (\\{\\{firstName\\}\\} not replaced)

For each finding: file_path:line + table_name + send_rate stats, fix.

Return JSON per the schema.`,
  },
  {
    label: 'data-quality',
    prompt: `You are auditing DATA QUALITY in the live Supabase database.

Use mcp__claude_ai_Supabase__execute_sql against project \`ryxgjzehoijjvczqkhwr\` to run quality checks on the biggest tables.

Run queries to measure:
- \`opportunities\` (37k+ rows): % with null naics_code, % with null deadline, % with status outside known enum, % marked DISCOVERED that are >90d old, % duplicates by (sol_number, agency)
- \`contractors\` (~80k): % with null uei, % with malformed uei (not 12 chars), % with null naics_codes, oldest sam_last_updated_at
- \`contacts\` (~91k): % with null email, % with email failing simple regex, % marked bounced
- \`user_profiles\`: % null capability_statement, % null contact_email, count of admin accounts, last_login distribution
- \`user_matches\`: distribution of scores; any negative scores? scores >1?
- \`leads\` / \`marketing_leads\` (if exists): dedup rate, % synced to HubSpot
- \`worker_jobs\`: failure rate per task_type 24h/7d, oldest pending job, longest-running job

Look for:
- Orphan rows (user_matches pointing to deleted opportunities)
- Field collisions (PSC code mistakenly written into email field — CLAUDE.md flagged this as a reproduced-once bug)
- Stale data (opportunities marked ACTIVE but deadline > 90d ago)
- Confidence-scoring opportunities — missing on most pipelines per the requirements
- Enrichment gaps that the Apr 16 backfill was supposed to fix (strategic_scoring, ai_win_strategy, structured_requirements) — verify current null rates

For each finding: query that produced the stat, % broken, impact on users, fix (data backfill cron OR validation at write time).

Return JSON per the schema.`,
  },
  {
    label: 'security-rls',
    prompt: `You are auditing SECURITY for CapturePilot 2.0.

Run mcp__claude_ai_Supabase__get_advisors against project \`ryxgjzehoijjvczqkhwr\` for both \`type: security\` and \`type: performance\`. Capture every finding.

Also scope:
- All \`/api/admin/**\` routes — every exported GET/POST/PATCH/DELETE must call \`assertAdmin()\` (CLAUDE.md rule). Last hardening was 2026-05-22 phase 1. Verify nothing has regressed.
- All \`/api/cron/**\` routes — must call \`guardCron(req)\`. Last hardening 2026-05-22 phase 2. Verify.
- \`/api/sam/attachment-download\` — SSRF guard, host allowlist, strips api_key
- \`/api/brand\`, \`/api/partners/**\`, any other route that proxies a user-supplied URL — verify hostname validation
- Public lead-magnet routes — rate limiting? captcha? Validation on email field?
- Token-based access (\`/startup-pack/download/[token]/page.tsx\`) — token entropy + expiry + replay-after-download?
- Supabase RLS on tables that hold PII (user_profiles, contacts, leads)
- Any \`SUPABASE_SERVICE_KEY\` used in client-side code (would be catastrophic)
- Cookie security: SameSite, Secure, HttpOnly on auth cookies
- CORS config — are admin/api routes wildcard-CORS-open?
- Stripe webhook signature validation
- Secrets present in tree (.env files, hardcoded API keys, accidental commits) — search for "sk_live", "sk_test", "Bearer", "api_key="

For each finding: severity (critical = exposes data or allows account takeover, high = elevation of privilege, etc.), evidence, fix.

Return JSON per the schema. Use category="security" for all.`,
  },
  {
    label: 'ux-friction',
    prompt: `You are doing a UX/UI audit of CapturePilot 2.0 from a federal contractor's perspective. Audience = middle-aged ops people running 5-50 person firms, time-poor, allergic to marketing fluff. CLAUDE.md says the canonical voice rules are in HUMANIZER.md.

Scope:
- \`${ROOT}/dashboard/src/app/(dashboard)/**\` user flows
- \`${ROOT}/dashboard/src/app/(public)/**\` (login, signup, check, admin)
- \`${ROOT}/dashboard/src/app/(onboarding)/**\`
- \`${ROOT}/dashboard/src/app/(portal)/**\` (consulting clients)
- \`${ROOT}/website/app/**\` if accessible (marketing site)
- \`${ROOT}/dashboard/src/components/**\` reusable UI

Look at the FEATURE MAP section of CLAUDE.md for what each page is supposed to do, then read the page and find:
- Onboarding steps that ask for the same data twice
- Forms with no autosave / no draft persistence
- Pages with sluggish loads (CLAUDE.md: "Overall dashboard speed — page loads are sluggish")
- Mobile breakpoints absent on key pages
- Modal/CTA hierarchy confusion (multiple primary buttons)
- Empty states that say "No data" instead of "Connect X to see Y"
- Inconsistent terminology (Opportunity vs Match vs Pursuit vs Notice — these have meaning)
- White-label / consulting portal feature parity gaps
- Microcopy that violates HUMANIZER.md (buzzwords: leverage/unlock/optimize/comprehensive/navigate/empower)
- Required fields with no inline validation
- Multi-step wizards with no progress indicator
- Settings pages where a setting changes don't persist
- Friction in the moment-of-value flows: opportunity detail → pursue, capability statement creation, AI proposal generation, Quick Checker run

Tasteful-animation opportunities:
- Loading states that could use skeleton screens instead of spinners
- Action confirmations (saved/sent) with no visual feedback
- Toggle switches with abrupt state changes

For each finding: page_path or component, observation (be specific — quote the actual copy or describe the actual flow), severity from the user's perspective, fix.

Return JSON per the schema.`,
  },
  {
    label: 'dead-code-deps',
    prompt: `You are auditing DEAD CODE, duplicate logic, and unused dependencies.

Scope: entire \`${ROOT}/dashboard/\` tree.

Use Bash + grep + find aggressively. Look for:
- Files imported nowhere (unused modules)
- Functions exported but never imported (with the export still alive — easy to confirm via grep)
- Duplicate logic (same algorithm in two files — e.g. fmtCurrency was duplicated and CLAUDE.md flagged it)
- Dependencies in package.json never imported (run \`grep -r "from 'pkgname'" dashboard/src\` for each top dep, flag misses)
- Old commented-out blocks of code (>20 lines)
- \`TODO\` / \`FIXME\` / \`HACK\` comments older than 30 days (check git blame timing if possible)
- Orphaned migration files where the table doesn't exist anymore
- Old stub pages that just \`redirect()\` somewhere (some of these are intentional per the 2026-05-22 phase 2 cleanup — DON'T flag those; they were left for back-compat)
- Old feature flags that are always-on or always-off
- Multiple icon libraries (rule violation — should be only lucide-react)
- Multiple state-management libraries (only one of zustand/jotai/redux/context should be primary)
- Two date libraries (date-fns + dayjs both? pick one)
- Two HTTP clients (ky + axios + fetch all in use?)

For each finding: file_path or package_name, evidence (grep result count or commit age), recommendation (delete OR consolidate to X).

Return JSON per the schema. Use category="dead-code" or "duplicate-logic" or "unused-dep".`,
  },
]

const discoveries = await parallel(
  READERS.map(r => () =>
    agent(r.prompt, { label: r.label, phase: 'Discover', schema: FINDING_SCHEMA }),
  ),
)

const allFindings = discoveries.filter(Boolean).flatMap(d =>
  (d.findings || []).map(f => ({ ...f, domain: d.domain }))
)

log(`Discover phase complete: ${allFindings.length} raw findings across ${discoveries.filter(Boolean).length}/${READERS.length} domains`)

// ============================================================================
// PHASE 2 — Verify (adversarial) — only on critical + high findings
// ============================================================================
phase('Verify')

const criticalAndHigh = allFindings.filter(f =>
  f.severity === 'critical' || f.severity === 'high'
)

log(`Verifying ${criticalAndHigh.length} critical/high findings via 2-of-3 skeptic vote`)

const verifiedCriticalAndHigh = await pipeline(
  criticalAndHigh,
  // Stage 1: 3 parallel skeptics try to refute
  (finding, _, idx) =>
    parallel([0, 1, 2].map(voteIdx => () =>
      agent(
        `You are a skeptical senior engineer reviewing a platform-audit finding. Your job: try to REFUTE it. Default to refuted=true if you can't quickly find evidence the finding is real.

FINDING (from ${finding.domain} domain):
- Title: ${finding.title}
- Severity: ${finding.severity}
- Category: ${finding.category}
- Evidence: ${finding.evidence}
- Impact: ${finding.impact}
- Recommendation: ${finding.recommendation}

Verify by:
1. Read the cited file_path:line. Does the code actually do what's claimed?
2. Has it been changed since the finding was written? (check git log on that file)
3. Is the impact accurate or overstated?
4. Is the recommendation correct, or is there a better fix?

Return JSON per the verdict schema. If "real" is false, explain what's wrong with the finding. If real but severity is wrong, set severity_adjustment.

Skeptic vote ${voteIdx + 1} of 3. Be independent — don't try to agree.`,
        { label: `verify:${finding.domain}-${idx}.${voteIdx}`, phase: 'Verify', schema: VERDICT_SCHEMA },
      )
    ))
      .then(votes => {
        const valid = votes.filter(Boolean)
        const realVotes = valid.filter(v => v.real).length
        const survives = realVotes >= 2
        const downgrades = valid.filter(v => v.severity_adjustment === 'downgrade-one').length
        const upgrades = valid.filter(v => v.severity_adjustment === 'upgrade-one').length
        let finalSeverity = finding.severity
        if (downgrades >= 2 && finding.severity === 'critical') finalSeverity = 'high'
        else if (downgrades >= 2 && finding.severity === 'high') finalSeverity = 'medium'
        else if (upgrades >= 2 && finding.severity === 'high') finalSeverity = 'critical'
        return {
          ...finding,
          severity: finalSeverity,
          verified: survives,
          verification: {
            real_votes: realVotes,
            total_votes: valid.length,
            refutations: valid.filter(v => !v.real).map(v => v.reason).slice(0, 2),
          },
        }
      })
)

const survivedCriticalAndHigh = verifiedCriticalAndHigh.filter(Boolean).filter(f => f.verified)
const mediumAndBelow = allFindings.filter(f =>
  f.severity !== 'critical' && f.severity !== 'high'
)
const finalFindings = [...survivedCriticalAndHigh, ...mediumAndBelow]

log(`Verify phase complete: ${survivedCriticalAndHigh.length}/${criticalAndHigh.length} critical/high findings confirmed real`)

// ============================================================================
// PHASE 3 — Synthesize cross-cutting reports (6 parallel)
// ============================================================================
phase('Synthesize')

const findingsJson = JSON.stringify(finalFindings, null, 2)

const SYNTHESES = [
  {
    label: 'executive-summary',
    file: '01-executive-summary.md',
    prompt: `Write the EXECUTIVE SUMMARY for the CapturePilot platform audit. Audience: founder (solo, B2G SaaS, technically literate).

Below is the verified findings list. Write a tight 1-2 page summary in markdown:

# CapturePilot Platform Audit — Executive Summary (2026-06-10)

## Platform health at a glance
(One paragraph. Honest assessment. Don't sugarcoat, don't catastrophize.)

## What's working well
(Concrete things — specific systems / decisions that are paying off.)

## What needs attention this week (critical only)
(Numbered list. Each one: 1-line problem, 1-line consequence, 1-line fix. Reference finding titles so the founder can drill in.)

## What needs attention this month (high priority)
(Same shape, abbreviated.)

## Strategic position
(2-3 sentences on market readiness — are we ready to scale acquisition? What's the #1 blocker?)

VOICE RULES (strict): Read \`${ROOT}/HUMANIZER.md\` first. Write in that voice — federal-contractor-fluent, contractions, direct, no buzzwords (leverage/unlock/optimize/comprehensive/navigate/empower/transform/landscape). Real specifics, no marketing fluff. Mixed sentence length.

Save your output by RETURNING the full markdown content as your response. (The orchestrator will write it.)

FINDINGS:
${findingsJson}`,
  },
  {
    label: 'critical-issues',
    file: '02-critical-issues.md',
    prompt: `Compile the CRITICAL ISSUES REPORT. Every finding with severity=critical OR severity=high.

For EACH:
## [N]. [Title]
**Severity:** critical | high
**Category:** [category]
**Evidence:** [file_path:line + observation]
**Impact:** [user-facing consequence + blast radius]
**Recommended fix:** [specific change]
**Effort:** [<1h | 1-4h | 0.5-2d | 3-5d | >1wk]

Order: critical first (hardest first within critical), then high. Number them 1..N.

Open with a 2-paragraph executive intro: how many criticals, what's the common root cause pattern (if any), what 3 themes recur.

Voice: per \`${ROOT}/HUMANIZER.md\` — no buzzwords.

Return the full markdown.

FINDINGS:
${findingsJson}`,
  },
  {
    label: 'optimization-roadmap',
    file: '03-optimization-roadmap.md',
    prompt: `Build the OPTIMIZATION ROADMAP. Take ALL findings and sequence them into a 12-week plan organized by priority + dependency.

Format:
# Optimization Roadmap

## Week 1 (Critical — stop the bleeding)
- [Finding ref] — [1-line action] — [effort]
(Group by category if useful.)

## Weeks 2-3 (High — close gaps before scale)
...

## Month 2 (Medium — quality + speed wins)
...

## Quarter 2+ (Nice-to-have / strategic)
...

For each item: cite the finding title so the founder can drill in. Add a column or note for **estimated impact** ("kills 60/day failed jobs", "cuts dashboard load 3s → 0.8s", "removes 4k lines of dead code", "+12% conversion on signup flow").

End with a "Quick wins this weekend" sublist — anything <2h effort with disproportionate value.

Voice: HUMANIZER.md rules.

Return full markdown.

FINDINGS:
${findingsJson}`,
  },
  {
    label: 'tech-debt',
    file: '04-tech-debt-report.md',
    prompt: `Write the TECHNICAL DEBT REPORT — long-term improvements that don't fit the critical/high firefight.

Filter findings to: category in (dead-code, duplicate-logic, tech-debt, unused-dep, scalability, observability). Add anything medium/low severity that's a quality issue.

Format:
# Technical Debt Report

## Debt themes
(3-5 themes — e.g. "Duplicated formatting helpers", "Cron sprawl on Vercel", "Missing observability on AI calls". Each theme: 1 paragraph + cite 2-3 specific findings.)

## Specific items, by file/system
(One section per system. e.g. \`### dashboard/src/app/api/cron/**\`, then bullet list of debt items.)

## Refactor proposals
(Where a small consolidation eliminates a whole class of issues — name the consolidation and the files it replaces.)

## What NOT to clean up
(Things that LOOK like debt but are intentional. E.g. redirect-stub pages from the 2026-05-22 phase 2 cleanup. CLAUDE.md mentions some of these.)

Voice: HUMANIZER.md.

Return full markdown.

FINDINGS:
${findingsJson}`,
  },
  {
    label: 'ux-report',
    file: '05-ux-ui-report.md',
    prompt: `Write the UX/UI IMPROVEMENT REPORT.

Filter findings to: category in (ux-friction) PLUS anything from the frontend domain that's a UX concern. Add cross-cutting observations about the overall flow.

Format:
# UX/UI Improvement Report

## Header impressions
(2 paragraphs — what's the platform's overall feel? What's the strongest UX moment? Weakest?)

## Friction by flow
### Onboarding
### Daily-use (dashboard, matches, opportunities)
### Power moves (Quick Checker, AI Proposal, Capability Statement, Pursuit)
### Account + Billing
### Consulting portal (white-label)

Each subsection: 3-6 numbered findings with severity, evidence (page_path or component), specific fix.

## Premium polish opportunities
(Tasteful animations, micro-interactions, perceived speed wins. Cite specific places — don't say "add animations". Say "Skeleton screen for /matches load while cards stream in.")

## Copy + voice audit
(Where HUMANIZER.md rules are violated — quote the actual offending copy, propose the rewrite.)

## Mobile responsiveness gaps
(Specific pages.)

Voice: HUMANIZER.md.

Return full markdown.

FINDINGS:
${findingsJson}`,
  },
  {
    label: 'data-quality-report',
    file: '06-data-quality-report.md',
    prompt: `Write the DATA QUALITY REPORT.

Filter findings to: domain="data-quality" or "database-schema", plus anything else with category="data-quality".

Format:
# Data Quality Report

## Database health summary
(Numbers up top — row counts per major table, null-rate per critical field, dedup rate, freshness.)

## Per-table findings
### \`opportunities\` (37k rows)
### \`contractors\` (~80k)
### \`contacts\` (~91k)
### \`user_profiles\`
### \`user_matches\`
### \`worker_jobs\`
### (any others)

For each: actual null/duplicate/staleness rates, what's broken, what cron/validation fixes it.

## Cross-table relationship gaps
(Orphan rows, broken FKs, naming mismatches like user_id vs auth_user_id.)

## Confidence-scoring + data-health-scoring proposal
(How to add confidence-score columns to opportunities, contacts, enrichment outputs. Which fields, which scoring rule, where the scoring runs.)

## Duplicate prevention
(Specific dedup keys to add where missing — sol_number + agency for opportunities, uei for contractors, normalized email for contacts.)

## Automated validation proposal
(Where to add CHECK constraints / triggers / RLS to enforce invariants at write time.)

Voice: HUMANIZER.md. Concrete, no fluff.

Return full markdown.

FINDINGS:
${findingsJson}`,
  },
  {
    label: 'scalability',
    file: '07-scalability-assessment.md',
    prompt: `Write the SCALABILITY ASSESSMENT.

Filter findings: category=scalability, performance, observability. Plus anything cron-related or infra-related.

Format:
# Scalability Assessment

## Current load posture
- Vercel cron ceiling: 40/40 used (at the cap)
- Worker queue: [pull stats from findings]
- DB: [largest tables + index health]
- VPS: [memory/CPU/disk headroom]

## 10x assessment
(Can the platform handle 10x current usage? Walk through each system: where does it break first?)

## P95 latency hotspots
(Specific routes / queries / external API calls.)

## Cost watch
(Where spend will scale super-linearly — OpenAI calls without caps, Resend volume, Supabase row count, Vercel function-minutes.)

## Specific moves to make
1. Move N crons from Vercel to VPS systemd (specific list)
2. Add indexes on these columns (specific list)
3. Cache these queries (specific keys + TTLs)
4. Add rate limits to these public endpoints
5. Background-job-ify these synchronous calls
6. Add observability on these AI call sites

## Headroom by year-1 milestone
(If we hit 100 paying users, what breaks? 500? 2000?)

Voice: HUMANIZER.md.

Return full markdown.

FINDINGS:
${findingsJson}`,
  },
  {
    label: 'market-leadership',
    file: '08-market-leadership-opportunities.md',
    prompt: `Write the MARKET LEADERSHIP OPPORTUNITIES report.

This is the FORWARD-LOOKING document. Don't just list bugs — identify strategic moats CapturePilot could build to be category-leading B2G SaaS.

Pull from findings with category="market-opportunity" + your own analysis of what the codebase reveals about strategic positioning.

Format:
# Market Leadership Opportunities

## Where CapturePilot is already differentiated
(Honest assessment — what's actually unique vs SAM.gov / GovTribe / Bloomberg Government / FedDataPoint / Highergov.)

## Data advantages to deepen
(Specific datasets to invest in — past-performance graph, incumbent flip-prediction, agency-pain-points, NAICS-set-aside fit scoring.)

## Automation moats
(Workflows competitors can't easily copy because they require integrated data — e.g. SDVOSB-cert + NAICS + agency-history-driven auto-pursuit recommendations.)

## AI/learning foundation
(What learning loops to wire NOW so 6 months of usage produces a defensible model — win/loss outcome capture, proposal-edit telemetry, user-behavior tracking on which matches actually get pursued.)

## Pricing + packaging insights
(What the codebase + features suggest about ideal pricing/packaging. Are we underpriced for the value? Should there be a tier above current Pro?)

## 90-day market position plays
(3-5 concrete moves with high marketing leverage.)

## The honest weakness
(Where competitors are still ahead — name it, propose how to close.)

Voice: HUMANIZER.md — federal-contractor-fluent, no marketing fluff, real specifics.

Return full markdown.

FINDINGS:
${findingsJson}`,
  },
]

const deliverables = await parallel(
  SYNTHESES.map(s => () =>
    agent(s.prompt, { label: s.label, phase: 'Synthesize', model: 'opus' })
      .then(content => ({ file: s.file, content }))
  ),
)

// ============================================================================
// PHASE 4 — Deliver (write the 8 files + an index + raw findings JSON)
// ============================================================================
phase('Deliver')

// One small agent writes all deliverables to disk + builds an index. Sequential because filesystem.
const writeResult = await agent(
  `Write these audit deliverables to the filesystem. Each one is a markdown file.

OUT_DIR: ${OUT}

FILES TO WRITE:
${deliverables.filter(Boolean).map(d => `- ${d.file}`).join('\n')}

You will receive content via the conversation. For each file, use the Write tool to create it at ${OUT}/<filename>.

ALSO create:
- \`${OUT}/00-INDEX.md\` — table of contents linking to each of the 8 deliverables, with a 1-line description of each.
- \`${OUT}/99-raw-findings.json\` — the complete raw findings array (write the exact JSON).

After writing all files, return a confirmation listing every file path written + its line count.

DELIVERABLE CONTENT:
${JSON.stringify(deliverables.filter(Boolean), null, 2)}

RAW FINDINGS (for 99-raw-findings.json):
${findingsJson}`,
  { label: 'write-deliverables', phase: 'Deliver' },
)

return {
  out_dir: OUT,
  raw_findings_count: allFindings.length,
  verified_critical_high: survivedCriticalAndHigh.length,
  refuted_critical_high: criticalAndHigh.length - survivedCriticalAndHigh.length,
  deliverables_written: deliverables.filter(Boolean).length,
  write_confirmation: writeResult,
}
