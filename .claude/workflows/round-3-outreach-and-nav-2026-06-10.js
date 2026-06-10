export const meta = {
  name: 'round-3-outreach-and-nav-2026-06-10',
  description: 'Rebuild /admin/email-tracking + /admin/emails as a unified /admin/outreach hub: KPIs with custom date ranges + previous-period comparison + industry benchmarks, multi-step email + SMS cadence campaigns, contact lists, suppression. Plus admin sidebar + website nav audit to surface orphan pages.',
  whenToUse: 'When the admin email/outreach surface needs to become a real cold-outreach + transactional-email cockpit with multi-channel sequences.',
  phases: [
    { title: 'Y1-Schema', detail: 'New campaign/step/contact/run tables + supabase migration' },
    { title: 'Y2-Engine', detail: 'Campaign-step worker_jobs handler + cron + send/cadence logic' },
    { title: 'Y3-AdminUI', detail: 'Unified /admin/outreach hub with 6 sub-tabs (Overview, Campaigns, Contacts, Templates, Suppression, Settings)' },
    { title: 'Y4-NavAudit', detail: 'Admin sidebar + website nav audit + add db-health to admin nav + orphan list' },
    { title: 'Y5-MergeAndDeploy', detail: 'Merge worktrees, apply migration, push to remotes, update final report' },
  ],
}

const ROOT = '/Users/andreschuler/Caturepilot 2.0'

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

const SHARED = `You are executing on CapturePilot 2.0 at ${ROOT}.

REPO STATE: clean main with the entire 2026-06-10 audit + R1 + R2 sprint already merged. Latest migration applied is 147. Stripe Team tier prices are live (STRIPE_PRICE_TEAM_MONTHLY, STRIPE_PRICE_TEAM_YEARLY). Sentry helper at @/lib/sentry-alerts. Sign-doc helper at @/lib/signed-doc-url. rl_bump_windowed RPC live for rate limiting.

CONSTRAINTS:
- Match existing code style (Next.js 16, React 19, TS strict, Tailwind, lucide-react only)
- "use client" required on interactive pages
- Use !inner on Supabase joins when filtering on joined table
- Use existing helpers: assertAdmin (admin routes), guardCron (cron), requireUser
- Twilio env vars are already set: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET. Use these for SMS sends.
- Resend env vars: RESEND_API_KEY (warning flag — works but rotate), RESEND_WEBHOOK_SECRET. Use existing send() wrapper from @/lib/email when possible.
- HUMANIZER.md voice rules for any user-facing copy: contractions, direct, no buzzwords
- Run \`cd dashboard && npx tsc --noEmit\` before committing — only commit if 0 errors
- Commit format: \`feat(R3-Y): description\`
- Pick next free migration number (148+); merge orchestrator renumbers collisions
- Return structured result`

// ============================================================================
// PHASE Y1 — Schema (single agent, fast)
// ============================================================================
phase('Y1-Schema')

const schema = await agent(
  `${SHARED}

WORK STREAM Y1: OUTREACH CAMPAIGN SCHEMA

Create one migration (next free, likely 148) for the multi-step outreach campaign system. Tables:

1. \`outreach_campaigns\`:
   - id UUID PK
   - name TEXT NOT NULL
   - description TEXT
   - channels TEXT[] CHECK (channels <@ ARRAY['email','sms']) — multi-channel
   - status TEXT CHECK (status IN ('draft','active','paused','completed','archived')) DEFAULT 'draft'
   - created_by UUID REFERENCES user_profiles(id)
   - target_segment JSONB — { naics_codes: [], states: [], certifications: [], custom_filter: '...' } for filtering contacts
   - sender_email TEXT — defaults to the platform's outreach From address
   - sender_name TEXT
   - created_at, updated_at, started_at, completed_at TIMESTAMPTZ
   - stats JSONB DEFAULT '{}' (cached: total_contacts, sent, delivered, opened, clicked, replied, bounced)

2. \`outreach_campaign_steps\`:
   - id UUID PK
   - campaign_id UUID REFERENCES outreach_campaigns(id) ON DELETE CASCADE
   - step_order INT NOT NULL  (1, 2, 3...)
   - channel TEXT CHECK (channel IN ('email','sms','wait')) — 'wait' is a pure-delay step
   - delay_value INT NOT NULL DEFAULT 0 — value (0 = immediate, otherwise N units)
   - delay_unit TEXT CHECK (delay_unit IN ('minutes','hours','days')) DEFAULT 'days'
   - subject TEXT — email subject (nullable for SMS / wait)
   - body_template TEXT — email body OR SMS message with {{firstName}}/{{company}} merge tags
   - skip_if_replied BOOLEAN DEFAULT true — stop the cadence if prior step got a reply
   - skip_if_clicked BOOLEAN DEFAULT false
   - created_at TIMESTAMPTZ
   - UNIQUE(campaign_id, step_order)

3. \`outreach_contacts\`:
   - id UUID PK
   - email TEXT
   - phone TEXT
   - first_name TEXT
   - last_name TEXT
   - company_name TEXT
   - title TEXT
   - naics_codes TEXT[]
   - state TEXT
   - source TEXT — 'sam_gov' | 'apollo' | 'manual_import' | 'hubspot_sync'
   - source_id TEXT — external reference for dedup
   - tags TEXT[] DEFAULT ARRAY[]::TEXT[]
   - custom_fields JSONB DEFAULT '{}'
   - created_at, updated_at TIMESTAMPTZ
   - last_engagement_at TIMESTAMPTZ
   - UNIQUE(email) WHERE email IS NOT NULL — email-based dedup

4. \`outreach_campaign_contacts\` (M2M with state):
   - id UUID PK
   - campaign_id UUID REFERENCES outreach_campaigns(id) ON DELETE CASCADE
   - contact_id UUID REFERENCES outreach_contacts(id) ON DELETE CASCADE
   - status TEXT CHECK (status IN ('queued','active','paused','completed','replied','bounced','unsubscribed','failed')) DEFAULT 'queued'
   - current_step INT DEFAULT 0
   - next_send_at TIMESTAMPTZ
   - added_at TIMESTAMPTZ DEFAULT NOW()
   - finished_at TIMESTAMPTZ
   - UNIQUE(campaign_id, contact_id)
   - INDEX on (status, next_send_at) for the cadence engine cron lookup

5. \`outreach_campaign_step_runs\`:
   - id UUID PK
   - campaign_contact_id UUID REFERENCES outreach_campaign_contacts(id) ON DELETE CASCADE
   - step_id UUID REFERENCES outreach_campaign_steps(id)
   - channel TEXT
   - sent_at TIMESTAMPTZ
   - provider_message_id TEXT — Resend message ID or Twilio SID
   - status TEXT CHECK (status IN ('queued','sent','delivered','opened','clicked','replied','bounced','complained','failed')) DEFAULT 'queued'
   - delivered_at, opened_at, clicked_at, replied_at, bounced_at TIMESTAMPTZ
   - error_message TEXT
   - rendered_subject TEXT
   - rendered_body TEXT — what was actually sent (for audit)
   - INDEX on (provider_message_id) for webhook event lookups

RLS:
- All tables: admin-only via service_role + a read policy for authenticated admins (account_type='admin').

Helper functions:
- \`get_campaign_kpis(p_campaign_id UUID, p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)\` SECURITY DEFINER returns JSONB with sent/delivered/opened/clicked/replied/bounced/unsubscribed counts within the window
- \`get_outreach_dashboard_kpis(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)\` SECURITY DEFINER returns aggregate across all campaigns

Commit message: \`feat(R3-Y1): outreach campaign schema + RPC helpers\`. Return migration filename.`,
  { label: 'y1-schema', phase: 'Y1-Schema', schema: FIX_RESULT, isolation: 'worktree' },
)

// ============================================================================
// PHASE Y2 — Engine (single agent, depends on schema)
// ============================================================================
phase('Y2-Engine')

const engine = await agent(
  `${SHARED}

WORK STREAM Y2: CAMPAIGN ENGINE — Cadence runner + email/SMS send

The schema for outreach_campaigns + outreach_campaign_steps + outreach_campaign_contacts + outreach_campaign_step_runs is being created in parallel (migration ~148). Build the engine that drives it.

Do:
1. New cron route \`dashboard/src/app/api/cron/run_outreach_cadence/route.ts\`:
   - guardCron + withCronTelemetry
   - Every 5 min
   - Query outreach_campaign_contacts WHERE status='active' AND next_send_at <= NOW() AND (campaign.status = 'active')
   - For each: load the next step (status.current_step + 1) from outreach_campaign_steps WHERE campaign_id = X AND step_order = current_step + 1
   - If no next step: mark campaign_contact status='completed', set finished_at, continue
   - If step.channel = 'wait': just advance current_step + compute next_send_at = NOW() + delay, no send
   - If step.channel = 'email': render body_template with merge tags from outreach_contacts row, send via Resend (use existing @/lib/email send() wrapper if it fits; otherwise direct Resend SDK with FROM_EMAIL), insert outreach_campaign_step_runs row
   - If step.channel = 'sms': render body_template, send via Twilio (twilio SDK). Need to install: \`twilio\` package
   - **Suppression respect**: BEFORE sending, check outreach_optouts WHERE email = lower(contact.email). If found, mark campaign_contact status='unsubscribed' + finished_at + skip
   - **Skip-if-replied**: check the prior step_run for this contact. If status IN ('replied','clicked') AND step.skip_if_replied = true, skip + complete
   - After successful send: advance current_step, compute next_send_at from next step's delay (look ahead one step), update last_engagement_at NULL until response
   - max_runtime 270s budget

2. Sender utility lib \`dashboard/src/lib/outreach-sender.ts\`:
   - \`sendOutreachEmail({ to, from, subject, html, replyTo, campaignId, stepId, contactId })\` → returns { provider_message_id, status }
   - \`sendOutreachSMS({ to, from, body, campaignId, stepId, contactId })\` → returns { provider_message_id, status }
   - Both insert outreach_campaign_step_runs row + return identifiers

3. Merge tag renderer:
   - \`renderTemplate(template: string, contact: OutreachContact): string\` — supports {{firstName}}, {{lastName}}, {{company}}, {{title}}, {{state}}, plus {{customField:keyName}} for the custom_fields JSONB
   - Falls back gracefully for missing fields ("there" for firstName, "your company" for company)

4. Webhook event handlers — extend the existing Resend webhook (\`/api/webhooks/resend\`) AND add a new Twilio webhook (\`/api/webhooks/twilio-status\`) to update outreach_campaign_step_runs rows when delivery events come in:
   - Resend: match provider_message_id to step_run, update status + opened_at/clicked_at/etc.
   - Twilio: match MessageSid to step_run, update status + delivered_at

5. Reply detection (basic): a new endpoint \`/api/webhooks/email-reply\` for inbound replies (can be wired to a forwarding rule later) that just looks up the recipient in outreach_campaign_step_runs and marks the matched contact's campaign as status='replied'.

Commit: \`feat(R3-Y2): campaign cadence engine + email/SMS send + webhook receivers\`. List env vars + npm packages needed in follow_up.`,
  { label: 'y2-engine', phase: 'Y2-Engine', schema: FIX_RESULT, isolation: 'worktree' },
)

// ============================================================================
// PHASE Y3 — Admin UI (single big agent — UI is cohesive)
// ============================================================================
phase('Y3-AdminUI')

const adminUI = await agent(
  `${SHARED}

WORK STREAM Y3: REBUILD ADMIN OUTREACH HUB

Restructure the admin email surface into a unified \`/admin/outreach\` hub.

Do:
1. **Sidebar nav**: rename "Emails" + "Email Tracking" to a single "Outreach" entry (lucide \`Mail\` or \`Megaphone\` icon). Update \`dashboard/src/app/(admin)/layout.tsx\` (or wherever the sidebar nav lives).

2. **\`/admin/outreach\` page structure** — tabs at the top:
   - **Overview** (default)
   - **Campaigns**
   - **Contacts**
   - **Templates**
   - **Suppression**
   - **Settings**

3. **Overview tab**:
   - Date range picker (presets: Today, 7d, 30d, 90d, Quarter to date, Year to date, Custom)
   - KPI tiles in a grid (6 columns on desktop, 2 on mobile):
     - Sent / Delivered / Opened (with %) / Clicked (with %) / Replied (with %) / Unsubscribed (with %)
     - Each tile shows the absolute count + percentage + delta vs previous period (e.g. "↑ 12% from prev period")
   - Color band: green (above industry benchmark), amber (within 20%), red (below by >20%)
   - **Industry benchmarks** baseline (B2B cold outreach):
     - delivered_rate: 97%
     - open_rate: 35%
     - click_rate: 3%
     - reply_rate: 6%
     - bounce_rate: 2%
     - unsubscribe_rate: 1%
   - Time-series chart below (line chart, simple SVG or import recharts if already in package.json): sent/opened/replied per day in the selected range
   - "Top campaigns" table — top 5 by total sent in range with KPIs

4. **Campaigns tab**:
   - "Create campaign" button — opens a step-builder modal:
     - Name + description + channels (checkboxes: Email / SMS)
     - Sender details (from email + from name)
     - Step builder — add Email / SMS / Wait steps, set delay (e.g. "2 days after step 1"), subject + body with live merge tag preview
     - Target segment — NAICS multi-select, state, certifications, "custom filter" raw text
     - Save as Draft / Save + Activate
   - Active campaigns list — name, channels (badges), status, contacts count, sent / replied / unsubscribed, started_at
   - Per-campaign detail page \`/admin/outreach/campaigns/[id]\` — KPIs + step-by-step performance table + contact list with status

5. **Contacts tab**:
   - List with filters (source, tags, NAICS, state, engagement recency)
   - Bulk import CSV button (parses email, first_name, last_name, company, title columns)
   - Bulk add to campaign button
   - "Sync from HubSpot" button — pulls contacts via existing HubSpot CRM helpers
   - Per-contact mini drawer showing engagement history (which campaigns, which steps, status)

6. **Templates tab**: moved from /admin/emails. List of email/SMS templates with edit modal. Add a "Use in campaign" button.

7. **Suppression tab**: moved from R2-X1 changes to /admin/email-tracking. Shows outreach_optouts with filters (source: hubspot/resend/manual), search by email, manual "Add to suppression" button.

8. **Settings tab**:
   - Configure default sender email + name
   - Configure SMS opt-in language (required by law)
   - Configure send-time windows (e.g. only 9am-6pm in recipient's TZ)
   - Configure default skip-if-replied behavior
   - Test send button (sends 1 step to a chosen test address)

9. **API endpoints** under \`/api/admin/outreach/\`:
   - GET \`overview-kpis?from=...&to=...&compareToPrev=true\` → calls get_outreach_dashboard_kpis RPC for current + previous period
   - GET \`campaigns\` → list
   - POST \`campaigns\` → create draft
   - PATCH \`campaigns/[id]\` → update (rename, activate, pause, archive)
   - DELETE \`campaigns/[id]\` → archive only (no hard delete)
   - GET \`campaigns/[id]/contacts\` → list with status
   - POST \`campaigns/[id]/contacts/bulk-add\` → add list of contact_ids
   - GET \`contacts\` → list with filters
   - POST \`contacts\` → manual add
   - POST \`contacts/import-csv\` → multipart CSV upload
   - POST \`contacts/sync-hubspot\` → triggers a sync

10. **Old routes**: \`/admin/email-tracking\` and \`/admin/emails\` should become redirects to \`/admin/outreach\` (preserve any deep links by mapping common ones).

Use lucide icons throughout (Megaphone for the nav, MailIcon, MessageCircle for SMS, BarChart3 for KPIs, Users for contacts, ListChecks for templates).

Voice: HUMANIZER.md for any user-facing copy.

Commit: \`feat(R3-Y3): unified /admin/outreach hub with KPIs, campaigns, contacts, suppression\`.`,
  { label: 'y3-admin-ui', phase: 'Y3-AdminUI', schema: FIX_RESULT, isolation: 'worktree' },
)

// ============================================================================
// PHASE Y4 — Nav audit (2 parallel)
// ============================================================================
phase('Y4-NavAudit')

const navAudit = await parallel([
  () => agent(`${SHARED}

WORK STREAM Y4.1: ADMIN NAV AUDIT + DB-HEALTH IN SIDEBAR

Do:
1. **Enumerate all admin pages**: \`find dashboard/src/app/\\(admin\\)/admin -name 'page.tsx'\` to get every admin route.
2. **Read the current sidebar**: \`dashboard/src/app/(admin)/layout.tsx\` (or wherever the admin sidebar is defined).
3. **Cross-reference**: list every page that exists but isn't in the sidebar.
4. **Add db-health to the sidebar** with the Database icon under an "Operations" or "Health" group.
5. **Add any other missing-but-useful pages**:
   - /admin/jobs (created in R2-X5.2)
   - /admin/queue
   - /admin/health
   - /admin/changelog
   - /admin/academy
   - /admin/messages
   - any other page with substantial functionality

6. **Group the sidebar logically**:
   - **Overview** (overview, health, db-health)
   - **People** (clients/users, leads, prospects)
   - **Pipeline + Opps** (opportunities, push-opportunity, matches, pipeline)
   - **Outreach** (the new unified hub from Y3)
   - **Operations** (jobs, queue, crons, tools)
   - **Content** (academy, changelog)
   - **Settings** (connectors, settings)

7. **Add a "Hidden / Legacy" section at the bottom** in the admin sidebar showing redirect stubs (existing 3-line redirect pages) — collapsed by default — so the founder knows they exist but they don't clutter the main nav.

8. Use lucide icons consistently. Keep the existing visual style.

Commit: \`feat(R3-Y4.1): admin sidebar reorganization + db-health in nav\`.`,
    { label: 'y4.1-admin-nav', phase: 'Y4-NavAudit', schema: FIX_RESULT, isolation: 'worktree' }),

  () => agent(`${SHARED}

WORK STREAM Y4.2: WEBSITE NAV AUDIT

Audit the marketing website at \`${ROOT}/website\` (separate Next.js project).

Do:
1. \`find website/app -name 'page.tsx'\` to enumerate all routes.
2. Read the website nav component (probably \`website/app/components/Nav.tsx\` or in the root layout).
3. Cross-reference: list every page that exists but isn't in the top nav, footer nav, or sitemap.

4. **Categorize each orphan page**:
   - **Keep + add to nav**: pages with substantial content that users would expect to find (e.g. specific case studies, integration pages, comparison pages).
   - **Keep but unlisted**: lead-magnet landing pages (intentionally only accessible via paid ads / direct link).
   - **Remove**: dead or duplicate pages.

5. **Suggested groupings for the top nav**:
   - **Product** (overview, features, integrations, security)
   - **Pricing**
   - **Resources** (blog, guides, agency pain points, glossary)
   - **About** (story, team if exists)
   - **Login / Signup** (existing)

6. **Footer nav** should include legal (terms, privacy), socials, contact, and a "Tools" mini-section pointing to free tools (Quick Checker, etc.).

7. **Sitemap.ts** — ensure every public page (including unlisted lead-magnet pages) is in sitemap.xml so SEO catches them even when the nav doesn't.

Do NOT modify the dashboard's website navigation (the dashboard has its own internal nav). Only the marketing site at \`website/\`.

Commit (in website repo dir): \`feat(R3-Y4.2): nav audit — group pages + add orphans to footer + verify sitemap\`.

If the website is a git submodule (likely), the commit goes in that submodule and you'd also need to bump the pointer in the main repo. Read \`.gitmodules\` to confirm. If submodule, also \`git add website\` in the main repo so the pointer update gets committed in main.`,
    { label: 'y4.2-website-nav', phase: 'Y4-NavAudit', schema: FIX_RESULT, isolation: 'worktree' }),
])

// ============================================================================
// PHASE Y5 — Merge + Apply + Push
// ============================================================================
phase('Y5-MergeAndDeploy')

const allStreams = [schema, engine, adminUI, ...navAudit].filter(Boolean)

const finalMerge = await agent(
  `You are the merge orchestrator + post-deploy summarizer for Round 3.

STREAMS:
${JSON.stringify(allStreams.map(r => ({ stream: r.stream, sha: r.commit_sha, status: r.status, files: r.files_touched, migrations: r.migrations_added || [], env_vars: r.env_vars_needed || [] })), null, 2)}

PART 1 — MERGE
1. cd ${ROOT}
2. \`git worktree list\` to enumerate
3. Order: y1-schema → y2-engine → y4.1-admin-nav → y4.2-website-nav → y3-admin-ui
4. For each: \`git merge --no-ff <branch> -m "merge: <stream>"\` then \`cd dashboard && npx tsc --noEmit 2>&1 | head -30\`
5. If errors: \`git reset --hard HEAD~1\` and record
6. Final tsc clean
7. Collect migration filenames
8. Remove worktrees

PART 2 — UPDATE WALK-RETURN-REPORT
Read existing \`${ROOT}/docs/WALK-RETURN-REPORT.md\` and append a "## Round 3 — Outreach + Nav (2026-06-10 evening)" section listing:
- All streams that shipped
- New migration numbers
- New env vars needed (especially Twilio webhook URL config + outreach FROM email)
- The outreach hub at /admin/outreach + what's there
- Nav changes (admin sidebar reorganization, db-health visible)
- Any manual setup the user needs (e.g. configure Resend reply-to + Twilio status webhook URL)

Don't truncate the existing content — append.

Return summary + path to migration files.`,
  { label: 'y5-merge', phase: 'Y5-MergeAndDeploy' },
)

return {
  schema,
  engine,
  adminUI,
  navAudit,
  final_merge: finalMerge,
  manual_actions_required: allStreams.flatMap(s => s.follow_up || []).filter((v, i, a) => a.indexOf(v) === i),
  env_vars_needed: allStreams.flatMap(s => s.env_vars_needed || []).filter((v, i, a) => a.indexOf(v) === i),
  migrations_in_order: allStreams.flatMap(s => s.migrations_added || []),
}
