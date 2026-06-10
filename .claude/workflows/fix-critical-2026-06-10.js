export const meta = {
  name: 'fix-critical-2026-06-10',
  description: 'Fix all 22 critical+high findings from the 2026-06-10 platform audit. 9 parallel worktree agents → sequential merge into main → build verification. Migration + deploy push happen outside the workflow.',
  whenToUse: 'After running platform-audit-2026-06-10 when the user wants to fix everything found.',
  phases: [
    { title: 'Fix', detail: '9 parallel worktree agents, one per work stream' },
    { title: 'Merge', detail: 'Sequential cherry-pick into main repo, build between each' },
    { title: 'Verify', detail: 'Final type check + lint + count changes' },
  ],
}

const ROOT = '/Users/andreschuler/Caturepilot 2.0'
const AUDIT_DIR = `${ROOT}/docs/platform-audit-2026-06-10`

const FIX_RESULT = {
  type: 'object',
  additionalProperties: false,
  required: ['stream', 'files_touched', 'commit_sha', 'commit_message', 'status', 'notes'],
  properties: {
    stream: { type: 'string' },
    files_touched: { type: 'array', items: { type: 'string' } },
    commit_sha: { type: 'string', description: 'SHA of the commit you made in your worktree, or empty if nothing to commit' },
    commit_message: { type: 'string' },
    status: { enum: ['done', 'partial', 'blocked', 'skipped'] },
    notes: { type: 'string', description: 'What you did, what you skipped + why, any manual follow-up needed' },
    follow_up: { type: 'array', items: { type: 'string' }, description: 'User-action items (e.g. set env var in Vercel, register webhook in dashboard)' },
  },
}

const SHARED_PREAMBLE = `You are fixing critical/high findings from the 2026-06-10 CapturePilot platform audit. The full report is in ${AUDIT_DIR}/02-critical-issues.md.

Your job:
1. Read the audit findings for YOUR work stream (numbers listed below)
2. Read the actual code in the files mentioned in the evidence
3. Implement the fix EXACTLY as recommended
4. Commit your work in this worktree with a descriptive message
5. Return a structured result

GROUND RULES:
- Edit existing files when possible. Don't create new ones unless instructed.
- Match the existing code style — TypeScript, server actions, Supabase client patterns
- DON'T run npm run build (we'll do that once after all merges)
- DON'T create planning docs or summary markdown unless asked
- DO commit with the format: \`fix(audit): #N1, #N2 — short description\`
- The CLAUDE.md project rules apply: lucide-react icons only, "use client" on interactive, !inner on Supabase joins when filtering on joined table
- Helpers you should USE rather than reimplement:
  - \`assertAdmin()\` from \`@/lib/auth-admin\` for admin routes
  - \`guardCron(req)\` from \`@/lib/cron-auth\` for cron routes
  - \`createSupabaseServerClient()\` for server routes that need user session
  - \`protectCrawl(req, { route, maxPerMin })\` for rate-limiting public POSTs (exists at \`@/lib/protect-crawl\` — verify path, may be elsewhere)
- If a finding is already fixed (code already matches the recommendation), set status: 'skipped' with notes explaining why

When you're done, return JSON per the schema.`

// ============================================================================
// PHASE 1 — Fix (9 parallel worktree agents)
// ============================================================================
phase('Fix')

const STREAMS = [
  {
    label: 'sec-migration',
    items: '#1',
    prompt: `${SHARED_PREAMBLE}

WORK STREAM: SECURITY MIGRATION — Item #1 (anon SECURITY DEFINER RPCs)

The audit identified that 6 SECURITY DEFINER RPCs are EXECUTABLE by anon role even though migration 090 was supposed to lock them down. Some are still callable.

YOUR JOB:
1. Create a new migration file at \`dashboard/supabase/migrations/132_revoke_security_definer_rpcs.sql\`
2. The migration should REVOKE EXECUTE from anon AND authenticated on these functions:
   - trigger_cron_route(text)
   - rls_auto_enable()
   - purge_old_activity_log()
   - compute_naics_market_stats(integer)
   - enqueue_marketing_lead_apollo()
   - enqueue_marketing_leads_apollo_backfill(integer)
3. Wrap each REVOKE in a DO block that skips if the function doesn't exist, so the migration is idempotent across environments.
4. Add a comment header explaining what this migration does and references audit #1.
5. Commit.

Do NOT apply the migration here — I'll apply it via the Supabase MCP after the merge.`,
  },
  {
    label: 'auth-public-routes',
    items: '#2, #3, #12, #14, #15, #16, #17, #18',
    prompt: `${SHARED_PREAMBLE}

WORK STREAM: AUTHENTICATE PUBLIC ROUTES — Items #2, #3, #12, #14, #15, #16, #17, #18

These are 8 separate routes that need auth gates added or files deleted. Read each finding in 02-critical-issues.md to get the exact evidence.

DO THE WORK FOR EACH:

#2 - dashboard/src/app/api/brand/route.ts:
- Add Supabase session check via createServerClient + getUser() at top of POST
- Resolve caller's own user_profile_id via .eq('auth_user_id', user.id), IGNORE body-supplied user_profile_id
- Wrap with protectCrawl (5/min). If the helper doesn't exist or path differs, grep for it.
- Before fetch(url), DNS-validate against private CIDR (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16, ::1, fc00::/7). Use \`dns.lookup\` from node:dns.
- Drop the SERVICE_KEY write — use the server client (RLS enforces)

#3 - dashboard/src/app/api/eligibility/route.ts AND dashboard/src/app/api/ai/write-proposal/route.ts AND dashboard/src/app/api/ai/draft-email/route.ts AND dashboard/src/app/api/ai/draft-template/route.ts AND dashboard/src/app/api/ai/generate-proposal/route.ts AND dashboard/src/app/api/ai/summarize-document/route.ts:
- Add: \`const sb = createServerClient(); const { data: { user } } = await sb.auth.getUser(); if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });\`
- Resolve caller's user_profile via \`.eq('auth_user_id', user.id).single()\`
- IGNORE any body-supplied user_profile_id — read profile from server
- Add per-user rate limit if rl_bump RPC exists (grep for it first)

#12 - DELETE these files:
- dashboard/src/app/api/engine/[action]/route.ts (whole file)
- dashboard/src/app/api/enrich/[opportunityId]/route.ts (whole file)
Use \`git rm\` so the deletion is committed.

#14 - dashboard/src/app/api/email/welcome/route.ts:
- DELETE the public route entirely (best fix — signup should call sendWelcomeEmail inline)
- BEFORE deleting: grep the dashboard for any caller of this route; if a client-side caller exists, inline the welcome-email logic into that caller's server action.

#15 - dashboard/src/app/api/lead-magnet/deliver/route.ts:
- At top of POST: read sb.auth.getUser(), enforce \`user.email === body.email\` AND \`user.app_metadata?.provider === 'linkedin_oidc'\`
- Reject with 401 otherwise

#16 - dashboard/src/app/api/analyze-company/upload-cap-statement/route.ts:
- Require auth (getUser) OR require a signed short-lived token (HMAC of analysis_id + 5-min TTL). Easier path: require auth.
- Add rate limit (max 3 uploads per IP per hour via protectCrawl)

#17 - dashboard/src/app/api/leads/route.ts:
- Add protectCrawl(req, { route: 'leads', maxPerMin: 5 }) at the top
- Add dedup: SELECT from marketing_leads where email = body.email and created_at > now() - interval '1 day'; if found, return existing instead of re-running Apollo/Resend/etc.

#18 - dashboard/src/app/api/beta-invites/[token]/route.ts:
- In POST, read sb.auth.getUser() and IGNORE body.auth_user_id — write user.id to claimed_by

COMMIT each route-group individually with a clear message, OR commit them all together. Either is fine — return whichever commit SHAs you produced.

IMPORTANT: If protectCrawl helper doesn't exist at @/lib/protect-crawl, grep for it (\`grep -r "protectCrawl" dashboard/src\`). If it genuinely doesn't exist, leave the rate-limit TODO with a comment and add inline IP-based throttle using \`rl_bump\` RPC if it exists, otherwise inline a simple in-memory map cache with TTL.`,
  },
  {
    label: 'cron-and-webhook-gates',
    items: '#13, #20',
    prompt: `${SHARED_PREAMBLE}

WORK STREAM: CRON + WEBHOOK AUTH GATES — Items #13 and #20

#13 — 8 cron routes still use the inline \`if ((expectedCron || expectedSvc) && auth !== ...)\` pattern that silently lets every request through when env vars are unset:
- dashboard/src/app/api/cron/ingest_sam/route.ts:76
- dashboard/src/app/api/cron/score_matches/route.ts:49
- dashboard/src/app/api/cron/bulk_enrich_ai/route.ts:36
- dashboard/src/app/api/cron/bulk_enrich_descriptions/route.ts:44
- dashboard/src/app/api/cron/enrich_apollo_contractors/route.ts:148
- dashboard/src/app/api/cron/ingest_fpds_awards/route.ts:166
- dashboard/src/app/api/cron/naics_stats_backfill/route.ts:37
- dashboard/src/app/api/cron/db_cleanup/route.ts:137

For EACH: replace the inline auth block with:
\`\`\`ts
import { guardCron } from '@/lib/cron-auth'
// inside the handler:
const denied = guardCron(req)
if (denied) return denied
\`\`\`

guardCron is fail-closed in production. The helper is in dashboard/src/lib/cron-auth.ts — read it first to confirm signature.

#20 — dashboard/src/app/api/hubspot/webhook/route.ts:
- The current verifyHubSpotSignature returns true if HUBSPOT_WEBHOOK_SECRET is unset.
- Fix: return \`process.env.NODE_ENV !== 'production'\` when secret is unset (dev-only bypass). In prod, hard-fail with 401.
- ALSO add length-guard before timingSafeEqual: ensure rawSig and expectedSig are same length, otherwise return false (currently a length mismatch throws).

Commit with a clear message referencing both audit items.`,
  },
  {
    label: 'hmac-impersonate',
    items: '#19',
    prompt: `${SHARED_PREAMBLE}

WORK STREAM: IMPERSONATION HMAC FIX — Item #19

File: dashboard/src/app/api/admin/impersonate/route.ts

Current bug: uses SHA-256 (not HMAC), truncates to 128 bits, falls back to literal "dev-secret" string when env vars unset.

FIX:
1. Replace the signing function with:
   \`\`\`ts
   import { createHmac, timingSafeEqual } from 'crypto'

   function getImpersonationSecret(): string {
     const secret = process.env.IMPERSONATION_SECRET || process.env.CRON_SECRET
     if (!secret) {
       if (process.env.NODE_ENV === 'production') {
         throw new Error('IMPERSONATION_SECRET or CRON_SECRET must be set in production')
       }
       return 'dev-only-fallback-do-not-use-in-prod'
     }
     return secret
   }

   function sign(payload: string): string {
     return createHmac('sha256', getImpersonationSecret()).update(payload).digest('hex')
   }

   function verify(payload: string, sig: string): boolean {
     const expected = Buffer.from(sign(payload), 'hex')
     const provided = Buffer.from(sig, 'hex')
     if (expected.length !== provided.length) return false
     return timingSafeEqual(expected, provided)
   }
   \`\`\`
2. Update all callers in the file to use the new sign/verify
3. Commit.

If the audit's recommended IMPERSONATION_SECRET env var isn't documented anywhere yet, add a brief note inline (one-line comment) so I remember to set it in Vercel later.`,
  },
  {
    label: 'queue-lane-split',
    items: '#4',
    prompt: `${SHARED_PREAMBLE}

WORK STREAM: QUEUE STARVATION — Item #4

42K enrichment jobs starved for 14 days because the priority-8 federal struct_reqs lane outranks priority-6 keywords + priority-7 classify_naics in claim_jobs(). The advisor in the audit suggests option B: dedicated lanes.

DO:
1. Read dashboard/src/app/api/cron/run_worker_jobs/route.ts to understand the current shape — task list, batch size, claim_jobs signature.
2. Create dashboard/src/app/api/cron/run_worker_jobs_keywords/route.ts — same pattern as run_worker_jobs, but its task_types array is ONLY \`['extract_keywords', 'classify_naics']\` and batch_size is 50 (so the backlog drains fast).
3. Read dashboard/vercel.json — it's at 40/40 cron slots. Pick ONE weekly low-frequency cron from the existing list to delete (good candidate: any \`ingest_*\` that runs weekly + has been logged successfully recently — verify with \`grep -A2 "\\"path\\".*ingest" vercel.json\`). Remove it from vercel.json. Add the new run_worker_jobs_keywords on schedule \`*/5 * * * *\`.
4. If you genuinely can't find a safe cron to drop, instead: lower the priority of \`extract_structured_reqs_federal\` jobs back to 6 (the SQL is in dashboard/supabase/migrations/ — find the migration that bumped it to 8 and create a new migration that reverses it). Create as \`dashboard/supabase/migrations/133_unbump_struct_reqs_priority.sql\`.

Pick the cleanest option. Document your choice in the commit message.

Also: while you're in the queue area, do a one-shot SQL migration that marks the existing zombie 'running' rows as failed:
- Create \`dashboard/supabase/migrations/134_clear_zombie_worker_jobs.sql\` (or next free number after yours):
  \`\`\`sql
  UPDATE worker_jobs
  SET status = 'failed',
      error_message = 'zombie reaped 2026-06-10 — claimed but never finished',
      finished_at = NOW()
  WHERE status = 'running'
    AND started_at < NOW() - INTERVAL '1 hour';
  \`\`\`

Commit.`,
  },
  {
    label: 'email-suppression-and-tracking',
    items: '#5, #6, #7, #21',
    prompt: `${SHARED_PREAMBLE}

WORK STREAM: EMAIL SUPPRESSION + RESEND TRACKING — Items #5, #6, #7, #21

Four related findings, one coherent fix.

DO:
1. **Read** dashboard/src/app/api/webhooks/resend/route.ts AND dashboard/src/lib/email.ts to ground yourself.

2. **#6 — bounce → suppression INSERT**: in the resend webhook handler, when eventType === 'bounced' OR 'complained', add (after the existing backlink_outreach update):
   \`\`\`ts
   await sb.from('outreach_optouts')
     .upsert({ email: recipient.toLowerCase(), reason: \`resend:\${eventType}\`, source: 'resend_webhook' }, { onConflict: 'email' })
   \`\`\`
   Verify outreach_optouts schema — if the table doesn't have those columns, create a migration to add them.

3. **#21 — HubSpot mirror**: in the same branch, also call:
   \`\`\`ts
   const { updateContactByEmail } = await import('@/lib/hubspot')
   if (eventType === 'bounced') {
     await updateContactByEmail(recipient, { hs_email_hard_bounced: 'true' }).catch(e => console.error('[resend-webhook] hubspot bounce mirror failed', e))
   } else if (eventType === 'complained') {
     await updateContactByEmail(recipient, { unsubscribed_from_all_email: 'true' }).catch(e => console.error('[resend-webhook] hubspot complaint mirror failed', e))
   }
   \`\`\`
   Verify updateContactByEmail exists in @/lib/hubspot — if not, grep for the actual function name (e.g. upsertHubSpotContact + update path).

4. **#7 — pre-send suppression check in email.ts send()**: at the top of \`send()\` in dashboard/src/lib/email.ts, after \`isEmailEnabled(key)\`:
   \`\`\`ts
   const sb = createServiceClient() // or whatever client this file already uses
   const { data: optout } = await sb.from('outreach_optouts')
     .select('email').eq('email', to.toLowerCase()).maybeSingle()
   if (optout) {
     console.log(\`[email] \${to} opted out (\${optout.reason}), skipping \${key}\`)
     return { sent: false, skipped: 'optout' }
   }
   \`\`\`
   IMPORTANT: keep backward compat — if the function returns a boolean now, return false (and log) instead of an object. Match the current return type.

5. **#5 — verify webhook handler is robust**: read dashboard/src/app/api/webhooks/resend/route.ts:87 — if it returns 500 when RESEND_WEBHOOK_SECRET is unset in prod (NODE_ENV==='production'), that's correct fail-closed behavior. If it just throws/500s in dev too, soften to "log warning + accept payload but skip signature check" in non-prod. Add a one-line console.log on every accepted event so we can confirm in Vercel logs whether webhooks are even reaching us.

6. **ALSO add a fallback observability check**: add a one-line warning at module-load time if RESEND_WEBHOOK_SECRET is unset in prod — make it loud (with the timestamp), so Vercel logs show it.

Commit with a clear message referencing all four audit items. List the env var requirements in your notes (RESEND_WEBHOOK_SECRET must be set in Vercel prod, webhook URL must be registered in Resend dashboard).`,
  },
  {
    label: 'matches-filter-fix',
    items: '#10',
    prompt: `${SHARED_PREAMBLE}

WORK STREAM: MATCHES PAGE FILTER BUG — Item #10

File: dashboard/src/app/(dashboard)/matches/page.tsx

Current bug: pagination (\`.range(from, to)\`) runs BEFORE client-side filters apply, so filtered views show 0-3 rows even when thousands match.

FIX:
1. Read the current file end-to-end (it's large).
2. Refactor the data-fetch effect to push filters into the Supabase query BEFORE \`.range()\`:
   - notice_type → \`.eq('opportunities.notice_type', filterNoticeType)\` (use !inner join — CLAUDE.md rule)
   - set_aside → \`.eq('opportunities.set_aside', filterSetAside)\`
   - state → \`.eq('opportunities.state', filterState)\`
   - NAICS prefix → \`.like('opportunities.naics_code', filterNaics + '%')\`
   - max_deadline_days → \`.lte('opportunities.deadline', new Date(Date.now() + filterMaxDeadlineDays*86400000).toISOString())\`
   - search → \`.or('title.ilike.%search%,description.ilike.%search%', { foreignTable: 'opportunities' })\` — sanitize search string before interpolation (strip commas, parens, single quotes — these break the .or() syntax)
3. Move sort into the query: \`.order(sortKey, { ascending: sortAsc, foreignTable: 'opportunities' })\` for opportunity columns.
4. Total row count: use \`{ count: 'exact' }\` on the initial query so pagination knows the real total.
5. Add a helper at the top of the file: \`function sanitizeForOrSearch(s: string): string { return s.replace(/[,()'\\\\]/g, ' ').trim() }\`

If you're unsure about the Supabase JS syntax for filtering on a joined table with !inner, here's the pattern:
\`\`\`ts
const { data, count } = await supabase
  .from('user_matches')
  .select('*, opportunities!inner(*)', { count: 'exact' })
  .eq('user_id', userId)
  .eq('opportunities.notice_type', filterNoticeType)  // filter on joined table
  .order('score', { ascending: false })
  .range(from, to)
\`\`\`

Keep the client-side filter state for UI responsiveness, but the actual fetch trigger should re-query when filters change. Use a debounce (250ms) for the search input to avoid query storm.

Commit.`,
  },
  {
    label: 'signed-urls-storage',
    items: '#11',
    prompt: `${SHARED_PREAMBLE}

WORK STREAM: SIGNED URLS FOR DOCUMENT DOWNLOADS — Item #11

Three read sites use \`getPublicUrl()\` on the \`client-docs\` bucket. Any link holder reads forever.

FILES TO CHANGE:
- dashboard/src/app/(dashboard)/documents/page.tsx:103
- dashboard/src/app/(portal)/portal/documents/page.tsx:99
- dashboard/src/app/(portal)/portal/messages/page.tsx:144

DO:
1. Create a tiny helper at \`dashboard/src/lib/signed-doc-url.ts\`:
   \`\`\`ts
   import { SupabaseClient } from '@supabase/supabase-js'

   export async function signedDocUrl(sb: SupabaseClient, path: string, ttlSec = 300): Promise<string | null> {
     if (!path) return null
     const { data, error } = await sb.storage.from('client-docs').createSignedUrl(path, ttlSec)
     if (error) {
       console.error('[signed-doc-url]', path, error.message)
       return null
     }
     return data.signedUrl
   }
   \`\`\`

2. In each of the 3 pages, replace the \`getPublicUrl(path).publicUrl\` pattern. Since these are interactive client pages, the simplest path is: change the page to fetch signed URLs server-side via a small Route Handler or on-demand inside an event handler when the user clicks "view".

3. **Operational note (don't do this in the worktree — flag for follow-up)**: the \`client-docs\` bucket needs to be flipped from public to private in Supabase. Add to follow_up: "Set \`client-docs\` bucket to private via Supabase MCP or dashboard after merge".

4. Create migration \`dashboard/supabase/migrations/<next-free-number>_client_docs_storage_policy.sql\` (pick after the queue agent — use 135 if available; if you don't know, use 200_client_docs_storage_policy.sql and I'll renumber):
   \`\`\`sql
   -- Make client-docs bucket private and add per-user RLS on storage.objects
   UPDATE storage.buckets SET public = false WHERE id = 'client-docs';

   -- Allow authenticated users to read their own folder
   DROP POLICY IF EXISTS "users can read own docs" ON storage.objects;
   CREATE POLICY "users can read own docs"
   ON storage.objects FOR SELECT TO authenticated
   USING (bucket_id = 'client-docs' AND (storage.foldername(name))[1] = auth.uid()::text);

   -- Allow service role full access (used by server-side enrichment + admin)
   -- (no policy needed — service_role bypasses RLS)
   \`\`\`

5. Don't break existing rows that have publicUrl stored. The migration of stored URLs is implicit: the new helper always re-signs from path, so as long as the path column exists, this works.

Commit with notes describing the operational follow-up (bucket flip).`,
  },
  {
    label: 'data-quality-backfill',
    items: '#8, #9',
    prompt: `${SHARED_PREAMBLE}

WORK STREAM: DATA QUALITY BACKFILL — Items #8 and #9

#8 — ai_win_strategy is missing on 81.3% of opportunities. The April 16 backfill never finished.

#9 — opportunity_score is NULL on 100% (78,007/78,007). Column exists but no cron writes to it.

CODE WORK:
1. **#9 decision**: opportunity_score should be written, not dropped. Add a deterministic scoring function:
   - Create \`dashboard/src/lib/opportunity-score.ts\`:
     \`\`\`ts
     export type ScoreInput = {
       set_aside?: string | null
       sources_sought_flag?: boolean | null
       notice_type?: string | null
       deadline?: string | null
       agency?: string | null
       estimated_value?: number | null
     }
     export function computeOpportunityScore(o: ScoreInput): number {
       let score = 50
       // sources-sought is highest value (6-18 months early per CLAUDE.md)
       if (o.sources_sought_flag) score += 20
       if (o.notice_type === 'Sources Sought' || o.notice_type === 'Special Notice') score += 15
       if (o.notice_type === 'Presolicitation') score += 10
       // small business prefs
       if (o.set_aside && /SBA|8\\(a\\)|HUBZone|WOSB|SDVOSB|VOSB|EDWOSB/i.test(o.set_aside)) score += 15
       // deadline window
       if (o.deadline) {
         const daysOut = (new Date(o.deadline).getTime() - Date.now()) / 86400000
         if (daysOut < 0) score -= 30
         else if (daysOut < 7) score -= 10
         else if (daysOut < 30) score += 0
         else if (daysOut < 90) score += 5
       }
       return Math.max(0, Math.min(100, Math.round(score)))
     }
     \`\`\`

2. Create a new cron: \`dashboard/src/app/api/cron/backfill_opportunity_score/route.ts\`:
   - Use guardCron(req) for auth
   - Claim up to 5000 rows where opportunity_score IS NULL
   - For each row, compute score via the new lib function
   - UPDATE in batch
   - Return count

3. Add the cron to vercel.json (or note in follow_up if you don't have a free slot — link to the queue stream's decision)

4. **#8 backfill is operational, NOT code**: add a one-liner Bash command to the notes/follow_up explaining how to run the backfill — \`curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://captiorpilot-v3.vercel.app/api/admin/backfill-enrichment -d '{"limit":5000,"only":"both"}'\` repeated ~13 times until nulls are 0.

5. Also add to /admin/health (file: dashboard/src/app/api/admin/env-health/route.ts or similar): two KPIs — null_ai_win_strategy_pct and null_opportunity_score_pct, queried live with cache. Find the existing health route and add.

Commit.`,
  },
]

const fixResults = await parallel(
  STREAMS.map(s => () =>
    agent(s.prompt, {
      label: s.label,
      isolation: 'worktree',
      schema: FIX_RESULT,
    })
      .then(r => ({ ...r, _stream: s.label, _items: s.items }))
  ),
)

log(`Fix phase complete: ${fixResults.filter(Boolean).filter(r => r.status === 'done' || r.status === 'partial').length}/${STREAMS.length} streams shipped`)

// ============================================================================
// PHASE 2 — Merge into main repo (sequential)
// ============================================================================
phase('Merge')

const successfulFixes = fixResults.filter(Boolean).filter(r => r.commit_sha && (r.status === 'done' || r.status === 'partial'))

const mergeReport = await agent(
  `You are the merge orchestrator. There are ${successfulFixes.length} fix branches in worktrees, each with a committed change.

Your job: merge each branch into main (in \`${ROOT}\`) one at a time, run \`cd dashboard && npx tsc --noEmit\` after each merge to catch type errors, and report.

THE WORKTREES + BRANCHES (each was a worktree clone of this repo with a commit):
${JSON.stringify(successfulFixes.map(f => ({ stream: f._stream, items: f._items, commit_sha: f.commit_sha, files: f.files_touched })), null, 2)}

PROCESS:
1. cd into ${ROOT} (the main repo)
2. Run \`git worktree list\` to see all worktrees + their branch names
3. For each of the successful fix streams above:
   a. Find its worktree path + branch name from the list
   b. Run \`git merge --no-ff <branch> -m "merge: <stream>"\` from the main repo
   c. Run \`cd dashboard && npx tsc --noEmit 2>&1 | head -40\` to check for type errors
   d. If type errors that look caused by this merge: \`git reset --hard HEAD~1\` AND log the issue, continue to next
   e. If clean: leave the merge in place
4. After all merges done, do a final \`git log --oneline -20\` and capture
5. Then remove the worktrees: for each, \`git worktree remove --force <path>\`

Return a brief summary: which merges succeeded, which failed + why, what the final HEAD is, what type errors remain (if any).

Do NOT push to remotes — I'll handle that.`,
  { label: 'merge-orchestrator', phase: 'Merge' },
)

// ============================================================================
// PHASE 3 — Verify
// ============================================================================
phase('Verify')

const verifyReport = await agent(
  `Final verification. You are in ${ROOT}.

1. Run \`cd dashboard && npx tsc --noEmit 2>&1 | tail -50\` and capture all errors
2. Run \`cd dashboard && npx next lint 2>&1 | tail -50\` and capture lint issues (eslint v9 may be broken per CLAUDE.md — that's OK, just report)
3. Count uncommitted files: \`git status --short | wc -l\`
4. List the last 15 commits: \`git log --oneline -15\`
5. List new migrations: \`ls dashboard/supabase/migrations/ | tail -10\`
6. List new route files: \`git diff main~20 --name-only --diff-filter=A | grep "api/.*route.ts" | head -10\`

Return a tight summary: type errors (yes/no, count), key new files, total commits added, unstaged changes if any.`,
  { label: 'verify-final', phase: 'Verify' },
)

return {
  streams: fixResults.filter(Boolean).map(r => ({
    stream: r._stream,
    items: r._items,
    status: r.status,
    commit_sha: r.commit_sha,
    files: r.files_touched,
    notes: r.notes,
    follow_up: r.follow_up || [],
  })),
  merge: mergeReport,
  verify: verifyReport,
}
