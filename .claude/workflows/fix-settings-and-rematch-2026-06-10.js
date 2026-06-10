export const meta = {
  name: 'fix-settings-and-rematch-2026-06-10',
  description: 'Fix 3 customer-reported UX bugs: (1) rematch button loads forever (synchronous 78k-opp scoring inside Vercel function timeout), (2) settings Advanced section defaults closed + monolithic, (3) no auto-rematch when profile changes. Converts rematch to worker_jobs queue + adds Postgres trigger for auto-enqueue + adds polling UI + tabs the settings advanced block.',
  whenToUse: 'When user reports the matches refresh button hangs or wants automatic rematch on profile change.',
  phases: [
    { title: 'Fix', detail: '3 parallel agents: backend queue conversion, matches UI polling, settings UX rework' },
    { title: 'Verify', detail: 'tsc clean + final commit' },
  ],
}

const ROOT = '/Users/andreschuler/Caturepilot 2.0'

const FIX_RESULT = {
  type: 'object',
  additionalProperties: false,
  required: ['stream', 'files_touched', 'commit_sha', 'status', 'notes'],
  properties: {
    stream: { type: 'string' },
    files_touched: { type: 'array', items: { type: 'string' } },
    commit_sha: { type: 'string' },
    status: { enum: ['done', 'partial', 'blocked', 'skipped'] },
    notes: { type: 'string' },
    follow_up: { type: 'array', items: { type: 'string' } },
  },
}

const SHARED = `You are fixing 3 customer-reported UX bugs in CapturePilot 2.0. Repo at ${ROOT}.

WORKING TREE STATE WHEN YOU START: clean main branch with all the 2026-06-10 audit fixes already merged. Latest commit is migration 136. There are no uncommitted edits except some untracked workflow files / submodule pointers — ignore those.

CONSTRAINTS:
- Match existing code style (Next.js 16, React 19, TypeScript, Tailwind, lucide-react icons only)
- Use !inner on Supabase joins when filtering on joined tables (CLAUDE.md rule)
- "use client" required on interactive pages
- Use the existing helpers: guardCron, assertAdmin, requireUser, createSupabaseServerClient
- Don't add unrelated cleanup or refactor
- Run \`cd dashboard && npx tsc --noEmit\` before committing — only commit if 0 errors
- Commit with a clear message in the format: \`fix(ui): brief description\` or \`feat(backend): brief description\`
- Return your work via the structured schema`

// ============================================================================
// PHASE 1 — three parallel agents
// ============================================================================
phase('Fix')

const STREAMS = [
  {
    label: 'backend-async-rematch',
    prompt: `${SHARED}

WORK STREAM: BACKEND — convert /api/matches/refresh to async worker_jobs + auto-enqueue on profile change

ROOT CAUSE: \`dashboard/src/app/api/matches/refresh/route.ts\` runs synchronously: loads all 78k opportunities into memory, scores each, deletes+reinserts the user_matches table. Often exceeds Vercel function timeout. UI never gets a response.

DESIGN:
- New \`worker_jobs\` task type: \`rescore_user_matches\` with payload \`{ user_profile_id, reason }\` (reason: 'manual' | 'profile_change' | 'cron')
- Convert /api/matches/refresh POST to: auth check → resolve profile → enqueue \`rescore_user_matches\` job → return 202 with \`{ job_id, queued: true }\` IMMEDIATELY (no scoring inline)
- New handler module \`dashboard/src/lib/rescore-user-matches.ts\` containing the actual scoring logic (extracted from the route). Exports an async function that takes \`{ user_profile_id }\` and does the same work the route used to do.
- New cron route \`dashboard/src/app/api/cron/run_worker_jobs_rescore/route.ts\` — claims \`rescore_user_matches\` jobs, batch_size=3 (each takes ~30s, fits in a 150s budget), invokes the lib function, finishes job. Same pattern as \`run_worker_jobs_keywords\` (see \`dashboard/src/app/api/cron/run_worker_jobs_keywords/route.ts\` for the canonical shape).
- New GET endpoint \`dashboard/src/app/api/matches/refresh/status/[jobId]/route.ts\` — returns \`{ status: 'pending'|'running'|'done'|'failed', result?, error? }\` by querying worker_jobs. Auth-required, must verify the job's payload.user_profile_id matches the caller's profile.
- Add to vercel.json crons: \`run_worker_jobs_rescore\` every \`*/3 * * * *\` (every 3 min). If at 40/40 ceiling, route it through enrichment_orchestrator instead (see how backfill_opportunity_score was wired).
- Postgres trigger for AUTO-RESCORE on profile change: new migration \`137_auto_rescore_on_profile_change.sql\` that creates an AFTER UPDATE trigger on \`user_profiles\`. The trigger fires when any scoring-relevant column changes (naics_codes, primary_keywords, secondary_keywords, sba_certifications, state, target_states, revenue, target_psc_codes, preferred_agencies, federal_awards_count, is_veteran_owned, veteran_cert_type, employee_count if it exists) and INSERTs a row into worker_jobs with task_type='rescore_user_matches', payload jsonb_build_object('user_profile_id', NEW.id, 'reason', 'profile_change'), priority 8. Use the existing dedup_key uniqueness so multiple rapid edits coalesce into one queued job.

IMPLEMENTATION NOTES:
- Read \`dashboard/src/app/api/cron/run_worker_jobs_keywords/route.ts\` first to copy the structure (guardCron, withCronTelemetry, claim_jobs RPC, finish_job RPC).
- Read \`dashboard/supabase/migrations/086_worker_jobs_platform.sql\` to understand claim_jobs + finish_job + dedup_key behavior.
- Read \`dashboard/src/app/api/matches/refresh/route.ts\` end-to-end to know what logic to extract.
- The dedup_key on worker_jobs is computed from task_type + payload. Including 'reason' in payload would defeat coalescing — store reason in result or as a separate non-dedup column instead, OR exclude reason from the dedup_key. Simplest: dedup_key for this task type should be derived from user_profile_id only (task_type + user_profile_id), so multiple rapid profile saves collapse to one rescore. Check 086 for how dedup_key is computed (generated column) and if needed add a small migration that changes the computation for this task type.
- Worker_jobs already has fan-out trigger on opportunities INSERT — don't touch that.
- The /api/matches/refresh route still uses protectCrawl — keep that.
- The webhook event "match.hot" should fire when the JOB FINISHES, not when it's queued. Move \`fireWebhookEvent\` from route.ts into the lib's scoring function so it fires after the rescore completes.

VERIFY:
- After implementing, manually trace through: profile UPDATE → trigger fires → row in worker_jobs → cron picks it up → scoring runs → rows in user_matches.
- Also: client POSTs /api/matches/refresh → 202 with job_id → polls /status/[jobId] → eventually sees status='done'.

Commit message: \`feat(matches): async rescore via worker_jobs + auto-rescore trigger on profile change\``,
  },
  {
    label: 'matches-ui-polling',
    prompt: `${SHARED}

WORK STREAM: MATCHES UI — poll instead of synchronously waiting for rescore

FILE: \`dashboard/src/app/(dashboard)/matches/page.tsx\`

CURRENT BEHAVIOR (broken):
- Line ~340: \`handleGenerateMatches\` calls \`await fetch("/api/matches/refresh", { method: "POST" })\` and then \`await fetchMatches()\`. The fetch hangs forever because the backend takes >60s. Empty try/catch swallows errors.

THE BACKEND CHANGES BEING MADE IN PARALLEL by another agent:
- POST /api/matches/refresh now returns 202 immediately with \`{ job_id, queued: true }\` (no waiting)
- New GET endpoint /api/matches/refresh/status/[jobId] returns \`{ status: 'pending'|'running'|'done'|'failed', error?, result?: { hot, warm, cold, total_scored } }\`

YOUR JOB:
1. Replace \`handleGenerateMatches\` with this flow:
   - Set a new state \`rescoreJob: { id: string, status: string } | null\`
   - POST to /api/matches/refresh — read job_id from response
   - Begin polling /api/matches/refresh/status/[jobId] every 3 seconds with a max of 30 polls (90s)
   - While polling, show a compact banner above the matches grid: "Rescoring matches… (this takes 30-60s)" with a small animated lucide \`<Loader2 className="animate-spin" />\` and the spin already in the design system
   - When status === 'done': clear the banner, show a brief success toast "X HOT, Y WARM, Z COLD matches found", call \`fetchMatches()\` to refresh the page data, page=1
   - When status === 'failed': show error toast with the error message, leave existing matches as-is
   - On poll timeout (90s): show "Rescore is still running. Refresh the page in a minute to see updates." and stop polling
   - The "Refresh matches" button should be disabled while rescoreJob is set (any active job)

2. Add a subtle "Auto-rescoring enabled" hint: small text under the rescore button "Updates automatically when you change your profile". This is honest now because the backend has the trigger.

3. Handle the case where another tab triggered a rescore — on mount, query worker_jobs for a pending/running \`rescore_user_matches\` job for this user_profile_id and resume polling if found. (Use a small server action or just call the status endpoint with a list mode — coordinate with backend agent if needed; if not yet supported, skip this and the button just shows ready.)

4. Don't refactor any other code in the file. Keep changes minimal.

CONSTRAINTS:
- Existing toast/notification component pattern — grep for existing toast usage in the matches page or anywhere else to match the style
- Use lucide-react icons only
- The matches page already uses \`fetchMatches()\` — preserve its current behavior
- Don't break the "Mark all dismissed" or "Export" buttons — they share state

Commit message: \`fix(matches): poll rescore status instead of hanging on synchronous request\``,
  },
  {
    label: 'settings-ux-tabs',
    prompt: `${SHARED}

WORK STREAM: SETTINGS UX — default Advanced Settings open + tabbed sub-navigation

FILE: \`dashboard/src/app/(dashboard)/settings/page.tsx\` (1797 lines)

USER REQUEST:
1. Advanced Settings should default to OPEN (currently \`useState(false)\` on line 212 → \`showAdvanced\`).
2. Once open, the advanced section should be tabbed by topic instead of a long vertical scroll. Switching tabs should be instant (no save needed in between).

CURRENT STRUCTURE:
- The page has top-level sections by id: \`#account\`, \`#profile\`, \`#subscription\`, \`#invoices\`, \`#password\`, \`#help\`, \`#privacy-data\`, \`#danger-zone\`
- Line 803-816: \`{/* ---- Advanced Settings Toggle ---- */}\` button toggles \`showAdvanced\` then renders \`{showAdvanced && (<>...</>)}\` — the inner block has multiple sections that are currently rendered vertically.

YOUR JOB:
1. **Change default**: \`const [showAdvanced, setShowAdvanced] = useState(true);\` so the section is open by default. Keep the toggle button so users can collapse it.

2. **Read the Advanced Settings inner block** (between line 816 and wherever \`)})\` closes the showAdvanced conditional). Identify the logical sub-sections inside. Typically these will be:
   - "Capability" (capability statement, keywords)
   - "Targeting" (NAICS, set-asides, states, agencies, PSC codes)
   - "Business" (revenue, employees, awards)
   - "Notifications" (email cadence, webhooks)
   - "Integrations" (API connectors)
   (Adjust based on what's actually there — read the file.)

3. **Add tabs inside the showAdvanced block**:
   - Use a simple \`activeAdvancedTab\` useState with the first tab as default
   - Render a horizontal tab bar at the top of the showAdvanced area using existing Tailwind / lucide icons — match the style of any existing tab pattern in the codebase (grep for "TabsTrigger" or similar — if no existing pattern, use a clean Tailwind row of buttons with active-state ring/border)
   - Render only the content for the active tab below the tab bar
   - The tab bar should be sticky-ish on scroll (use \`sticky top-20\` or similar) so users can switch without scrolling back up
   - **Persist tab selection in URL hash** for shareable links (e.g. \`/settings#targeting\`) — read from \`window.location.hash\` on mount

4. **State preservation across tabs**: Keep all form state (inputs, selections) in the parent component state, not inside each tab's component. Switching tabs MUST NOT lose unsaved changes. The user's report mentions "save the changes" still works — make sure clicking save persists the data from all tabs at once, not just the visible one.

5. **DO NOT** change the existing save/autosave logic. If the page uses a single save button, leave it where it is (probably at the top or bottom). If it uses autosave on blur, leave that. Just rearrange the layout.

6. Add a one-line hint above the tabs: small text "Changes auto-trigger a rematch when you save." since the backend agent is adding auto-rescore.

CONSTRAINTS:
- Read the file end-to-end before editing — 1797 lines, lots of state
- Keep all imports minimal; don't add new dependencies
- Match the existing Tailwind style: \`rounded-2xl border border-stone-200\` etc
- Use lucide-react icons (existing imports — don't add new ones unless really needed)

Commit message: \`fix(settings): default Advanced Settings open + add internal tabs for sub-sections\``,
  },
]

const fixResults = await parallel(
  STREAMS.map(s => () =>
    agent(s.prompt, {
      label: s.label,
      isolation: 'worktree',
      schema: FIX_RESULT,
    })
      .then(r => ({ ...r, _stream: s.label }))
  ),
)

log(`Fix phase complete: ${fixResults.filter(Boolean).filter(r => r.status === 'done' || r.status === 'partial').length}/${STREAMS.length} streams shipped`)

// ============================================================================
// PHASE 2 — Merge + verify
// ============================================================================
phase('Verify')

const mergeAndVerify = await agent(
  `You are the merge orchestrator + verifier.

There are ${fixResults.filter(Boolean).filter(r => r.commit_sha).length} worktree branches each with a commit:
${JSON.stringify(fixResults.filter(Boolean).map(r => ({ stream: r._stream, sha: r.commit_sha, files: r.files_touched })), null, 2)}

DO:
1. cd ${ROOT}
2. \`git worktree list\` to see paths + branch names
3. For each branch, sequentially:
   a. \`git merge --no-ff <branch> -m "merge: <stream>"\`
   b. \`cd dashboard && npx tsc --noEmit 2>&1 | head -30\` — if errors, \`git reset --hard HEAD~1\` and report which stream broke
4. After all merges, final \`npx tsc --noEmit 2>&1 | head -30\`
5. \`git log --oneline -10\` to capture
6. \`git worktree remove --force <path>\` for each
7. Do NOT push — that's my job after this returns

Return: which merged cleanly, which were rolled back, final HEAD, final tsc status, and a brief summary of what shipped (1 line per stream).`,
  { label: 'merge-and-verify', phase: 'Verify' },
)

return {
  streams: fixResults.filter(Boolean).map(r => ({
    stream: r._stream,
    status: r.status,
    commit_sha: r.commit_sha,
    files: r.files_touched,
    notes: r.notes,
    follow_up: r.follow_up || [],
  })),
  merge_and_verify: mergeAndVerify,
}
