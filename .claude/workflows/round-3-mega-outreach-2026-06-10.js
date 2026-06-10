export const meta = {
  name: 'round-3-mega-outreach-2026-06-10',
  description: 'MEGA Round 3: rebuild /admin/email-tracking + /admin/emails into a unified /admin/outreach hub with multi-channel cadences (email + SMS), reply detection, engagement scoring, domain reputation monitoring, AND audit the admin/website/dashboard/portal nav surfaces. 21 agents across 6 phases.',
  whenToUse: 'When the admin email/outreach surface needs to become a real multi-channel cold-outreach + transactional-email cockpit, and the navigation surfaces need a coherent audit.',
  phases: [
    { title: 'M1-Schema', detail: '4 parallel: campaigns, replies, engagement scoring, automation rules' },
    { title: 'M2-Engine', detail: '4 parallel: cadence runner, webhook handlers, deliverability, domain reputation' },
    { title: 'M3-AdminUI', detail: '6 parallel: overview, campaigns + step builder, campaign detail, contacts, templates+suppression+settings, inbox/replies' },
    { title: 'M4-Nav', detail: '4 parallel: admin sidebar, website nav, dashboard nav, portal nav' },
    { title: 'M5-Adjacent', detail: '3 parallel: engagement scoring lib, email warmup, sequence preset library' },
    { title: 'M6-Merge', detail: 'merge all + update WALK-RETURN-REPORT + memory' },
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

REPO STATE: clean main with the entire 2026-06-10 audit + R1 + R2 sprint merged. Latest migration ~147. Stripe Team tier prices live. Sentry helper at @/lib/sentry-alerts. Twilio env vars set: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET. Resend env vars: RESEND_API_KEY, RESEND_WEBHOOK_SECRET. HubSpot helpers at @/lib/hubspot. rl_bump_windowed RPC at 144.

CONSTRAINTS:
- Match existing code style (Next.js 16, React 19, TS strict, Tailwind, lucide-react only)
- "use client" required on interactive pages
- Use !inner on Supabase joins when filtering on joined table
- Use existing helpers: assertAdmin, guardCron, requireUser
- HUMANIZER.md voice rules — contractions, direct, no buzzwords
- Run \`cd dashboard && npx tsc --noEmit\` before committing
- Commit format: \`feat(R3-M{N}): description\`
- Pick next free migration number (148+); orchestrator renumbers collisions
- Return structured result`

// ============================================================================
// M1 — SCHEMA (4 parallel)
// ============================================================================
phase('M1-Schema')

const m1 = await parallel([
  () => agent(`${SHARED}

WORK STREAM M1.1: OUTREACH CAMPAIGN CORE SCHEMA (migration 148+)

Create the campaigns + steps + contacts + step_runs tables.

\`outreach_campaigns\`: id, name, description, channels TEXT[] (subset of email/sms), status (draft/active/paused/completed/archived), sender_email, sender_name, target_segment JSONB, created_by FK user_profiles, throttle JSONB (sends_per_hour, send_window_start, send_window_end, timezone), stats JSONB cache, created_at/updated_at/started_at/completed_at.

\`outreach_campaign_steps\`: id, campaign_id FK CASCADE, step_order INT, channel ('email'|'sms'|'wait'), delay_value INT, delay_unit ('minutes'|'hours'|'days'), subject TEXT, body_template TEXT, skip_if_replied BOOLEAN DEFAULT true, skip_if_clicked BOOLEAN, ab_variant_of UUID (self-FK), variant_weight INT DEFAULT 100, created_at. UNIQUE(campaign_id, step_order, ab_variant_of NULLS FIRST).

\`outreach_contacts\`: id, email, phone, first_name, last_name, company_name, title, naics_codes TEXT[], state, source ('sam_gov'|'apollo'|'manual_import'|'hubspot_sync'|'csv_import'), source_id, tags TEXT[], custom_fields JSONB, engagement_score INT DEFAULT 0, created_at, updated_at, last_engagement_at, last_replied_at, last_bounced_at, opted_out_at. UNIQUE(email) WHERE email NOT NULL.

\`outreach_campaign_contacts\`: id, campaign_id FK CASCADE, contact_id FK CASCADE, status ('queued'|'active'|'paused'|'completed'|'replied'|'bounced'|'unsubscribed'|'failed'), current_step INT DEFAULT 0, current_variant UUID NULL (which A/B variant got chosen for this contact), next_send_at, added_at, finished_at. UNIQUE(campaign_id, contact_id). INDEX (status, next_send_at), INDEX (campaign_id, status).

\`outreach_campaign_step_runs\`: id, campaign_contact_id FK CASCADE, step_id FK, channel, sent_at, provider_message_id, status ('queued'|'sent'|'delivered'|'opened'|'clicked'|'replied'|'bounced'|'complained'|'failed'), delivered_at, opened_at, first_click_at, last_click_at, replied_at, bounced_at, complained_at, error_message, rendered_subject, rendered_body, ab_variant_id. INDEX (provider_message_id).

\`outreach_lists\`: id, name, description, filter JSONB (NAICS, states, tags, custom SQL fragment), contact_count INT (cached), created_by, created_at.

\`outreach_list_members\`: list_id FK CASCADE, contact_id FK CASCADE. PK(list_id, contact_id).

RPC helpers (SECURITY DEFINER, search_path locked):
- get_campaign_kpis(p_campaign_id UUID, p_from TIMESTAMPTZ, p_to TIMESTAMPTZ) → JSONB with sent/delivered/opened/clicked/replied/bounced/unsubscribed counts + rates
- get_outreach_dashboard_kpis(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ) → aggregate across campaigns
- get_outreach_timeseries(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ, p_interval TEXT) → daily/weekly counts of sent/opened/replied

RLS: admin-only via service_role + read for authenticated admins (account_type='admin').

Commit: \`feat(R3-M1.1): outreach campaign core schema + KPI RPCs\`.`,
    { label: 'm1.1-campaigns-schema', phase: 'M1-Schema', schema: FIX_RESULT, isolation: 'worktree' }),

  () => agent(`${SHARED}

WORK STREAM M1.2: REPLY / INBOX / SENTIMENT SCHEMA (migration 149+)

\`outreach_replies\`: id, campaign_step_run_id FK (the original outbound message), from_email, from_name, subject, body_text, body_html, received_at, message_id, in_reply_to, sentiment ('positive'|'neutral'|'negative'|'unsure'|'auto_reply'|'unsubscribe'), intent ('interested'|'not_interested'|'meeting_request'|'reschedule'|'forwarded'|'oof'|'unknown'), parsed_meeting_url TEXT, classification_confidence NUMERIC, classified_at TIMESTAMPTZ, contact_id FK outreach_contacts NULL (resolved by from_email), is_handled BOOLEAN DEFAULT false, handled_at, handled_by FK user_profiles, notes TEXT, created_at. INDEX (received_at DESC), INDEX (sentiment, is_handled).

\`outreach_inbox_settings\`: singleton row id=1 with sentiment_classifier_enabled BOOLEAN, auto_pause_campaign_on_reply BOOLEAN, default_signature TEXT, default_reply_to TEXT.

Function classify_reply_sentiment(p_body TEXT, p_subject TEXT) RETURNS TEXT — placeholder that returns 'unsure'; the real LLM-based classifier runs from a Vercel route (OpenAI gpt-4o-mini JSON mode) and updates the row.

RLS: admin-only.

Commit: \`feat(R3-M1.2): outreach replies/inbox/sentiment schema\`.`,
    { label: 'm1.2-replies-schema', phase: 'M1-Schema', schema: FIX_RESULT, isolation: 'worktree' }),

  () => agent(`${SHARED}

WORK STREAM M1.3: ENGAGEMENT SCORING + LEAD-SCORE INTEGRATION (migration 150+)

The 0-100 score for outreach_contacts based on engagement history.

Function recompute_contact_engagement_score(p_contact_id UUID) returns INT:
- +5 per email_delivered, +10 per opened (max 50), +15 per clicked, +25 per replied (positive), -10 per replied (negative), -20 per bounced, -100 if opted out
- Stores in outreach_contacts.engagement_score + last computed in last_engagement_at

\`outreach_lead_scores\`: contact_id PK, score INT, fit_score INT (NAICS overlap with our ICP), intent_score INT (engagement_score), composite NUMERIC GENERATED ALWAYS AS ((fit_score + intent_score) / 2.0) STORED, updated_at.

\`outreach_engagement_events\` (granular events for analytics): id, contact_id FK, event_type, campaign_id FK, step_id FK, captured_at, payload JSONB. INDEX (contact_id, captured_at DESC), INDEX (campaign_id, event_type, captured_at).

Cron-friendly function rebuild_lead_scores() that walks all outreach_contacts with engagement in last 7 days and recomputes.

RLS: admin-only.

Commit: \`feat(R3-M1.3): engagement scoring + lead-score schema\`.`,
    { label: 'm1.3-engagement-schema', phase: 'M1-Schema', schema: FIX_RESULT, isolation: 'worktree' }),

  () => agent(`${SHARED}

WORK STREAM M1.4: WORKFLOW AUTOMATION RULES SCHEMA (migration 151+)

If-this-then-that rules for outreach events.

\`outreach_automations\`: id, name, trigger_event ('reply_received'|'replied_positive'|'replied_negative'|'opened'|'clicked'|'bounced'|'unsubscribed'|'campaign_completed'|'step_skipped'), trigger_filter JSONB (campaign_ids, sentiments, etc), actions JSONB[] (sequence of action objects: {type:'tag_contact', tag:'replied'}, {type:'add_to_campaign', campaign_id:X}, {type:'pause_campaign', campaign_id:X}, {type:'hubspot_lifecycle', stage:'sales-qualified-lead'}, {type:'send_slack', channel:'#sales'}, {type:'remove_from_campaign', campaign_id:X}, {type:'send_to_user', user_profile_id:X, subject:'...', body:'...'} ), is_active BOOLEAN DEFAULT true, created_by FK user_profiles, created_at, updated_at.

\`outreach_automation_runs\`: id, automation_id FK, triggered_by_event_id, triggered_at, actions_executed JSONB[], error TEXT NULL, completed_at. Soft audit trail.

Function execute_outreach_automation(p_automation_id UUID, p_context JSONB) — placeholder that just inserts to runs; real execution lives in a Vercel route.

RLS: admin-only.

Commit: \`feat(R3-M1.4): outreach automation rules schema\`.`,
    { label: 'm1.4-automation-schema', phase: 'M1-Schema', schema: FIX_RESULT, isolation: 'worktree' }),
])

// ============================================================================
// M2 — ENGINE (4 parallel)
// ============================================================================
phase('M2-Engine')

const m2 = await parallel([
  () => agent(`${SHARED}

WORK STREAM M2.1: CADENCE RUNNER + SENDER UTILITIES

Schema being built in parallel — assume outreach_campaigns + outreach_campaign_steps + outreach_campaign_contacts + outreach_campaign_step_runs + outreach_contacts exist.

Do:
1. \`dashboard/src/lib/outreach-sender.ts\`:
   - sendOutreachEmail({to, from, subject, html, replyTo, campaignId, stepId, contactId, runId}) using Resend SDK; respects outreach_optouts; renders merge tags; inserts/updates the step_run with provider_message_id + status
   - sendOutreachSMS({to, body, campaignId, stepId, contactId, runId}) using Twilio SDK; same shape; requires phone format E.164
   - renderTemplate(template, contact) supports {{firstName}} {{lastName}} {{company}} {{title}} {{state}} {{customField:key}}; falls back to "there" / "your company"

2. \`dashboard/src/app/api/cron/run_outreach_cadence/route.ts\`:
   - guardCron + withCronTelemetry
   - schedule via enrichment_orchestrator (Vercel is at ceiling) every 5 min
   - max_runtime 270s budget
   - Pick up to 100 ready contacts: SELECT cc.*, c.* FROM outreach_campaign_contacts cc JOIN outreach_contacts c ON cc.contact_id=c.id JOIN outreach_campaigns campaign ON cc.campaign_id=campaign.id WHERE cc.status='active' AND cc.next_send_at <= NOW() AND campaign.status='active' AND (campaign.throttle->'send_window_start' IS NULL OR EXTRACT(hour FROM NOW() AT TIME ZONE COALESCE(campaign.throttle->>'timezone','UTC')) BETWEEN ...) LIMIT 100
   - For each: load next step (step_order = current_step + 1)
   - Respect skip_if_replied / skip_if_clicked by looking at prior step_runs
   - Send via outreach-sender; on success: advance current_step, compute next_send_at from next step's delay
   - On failure (3 consecutive): mark contact status='failed'
   - When no more steps: status='completed', finished_at=NOW()
   - Update campaign.stats cache at the end of the run (atomic)

3. Install \`twilio\` npm package (add to package.json + npm install). Use the createClient pattern: \`new Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)\`.

Commit: \`feat(R3-M2.1): cadence runner + sender utilities (Resend + Twilio)\`. List the npm dep + env vars in follow_up.`,
    { label: 'm2.1-cadence-runner', phase: 'M2-Engine', schema: FIX_RESULT, isolation: 'worktree' }),

  () => agent(`${SHARED}

WORK STREAM M2.2: WEBHOOK HANDLERS + REPLY DETECTION

Inbound event plumbing.

Do:
1. Extend \`/api/webhooks/resend/route.ts\` to also map provider_message_id → outreach_campaign_step_runs and update its status (delivered/opened/clicked/bounced/complained). Currently the webhook handles email_events + outreach_optouts; add the step_run match.

2. New route \`/api/webhooks/twilio-status\`:
   - POST handler validates the Twilio signature (use Twilio SDK validator)
   - Maps MessageSid → outreach_campaign_step_runs.provider_message_id
   - Updates status (delivered/failed) + delivered_at
   - On 'failed' status with error code 30003 (unreachable) → mark contact as bounced

3. New route \`/api/webhooks/email-reply\`:
   - Accepts a configurable forwarding payload (most likely from a forwarding rule like SendGrid Parse OR Resend inbound). For now, accept POST { from, subject, body, in_reply_to, message_id }.
   - Looks up provider_message_id in outreach_campaign_step_runs to find the originating contact + campaign
   - Inserts a row into outreach_replies (sentiment='unsure' initially)
   - Updates the step_run.status='replied', replied_at
   - Updates outreach_campaign_contacts.status='replied' if campaign.auto_pause_on_reply (from outreach_inbox_settings) is true
   - Triggers async sentiment classification: enqueue a worker_jobs row \`classify_outreach_reply\` with payload {reply_id}

4. New worker_jobs task \`classify_outreach_reply\` handler in run_worker_jobs (HTTP-friendly):
   - Calls OpenAI gpt-4o-mini with JSON mode
   - Prompt: "Classify this email reply. Return {sentiment: positive|neutral|negative|unsure|auto_reply|unsubscribe, intent: interested|not_interested|meeting_request|reschedule|forwarded|oof|unknown, meeting_url: <url if present>, confidence: 0-1}"
   - Updates the outreach_replies row

5. New endpoint \`/api/admin/outreach/replies\` GET — list replies with filter (sentiment, campaign_id, is_handled), pagination

Commit: \`feat(R3-M2.2): outreach webhook handlers + reply ingestion + sentiment classification\`.`,
    { label: 'm2.2-webhooks', phase: 'M2-Engine', schema: FIX_RESULT, isolation: 'worktree' }),

  () => agent(`${SHARED}

WORK STREAM M2.3: DELIVERABILITY GUARDS — spam-check + send-time + throttle

Do:
1. \`dashboard/src/lib/outreach-deliverability.ts\` with:
   - spamScore(subject, body) → number 0-100 + reasons[]. Check for spam-trigger words (FREE, 100% OFF, ACT NOW, GUARANTEE, etc.), excessive caps, excessive exclamation, missing physical address (CAN-SPAM), missing unsubscribe link, suspicious link patterns
   - bestSendTime(contact, defaultTimezone) → next valid TIMESTAMPTZ honoring contact.timezone + campaign.throttle.send_window_start/end, weekday vs weekend, holidays (basic US list)
   - throttleCheck(campaign_id, sendsLastHour) → bool indicating whether to delay

2. Integrate into the cadence runner from M2.1: BEFORE send, check spam score (block + log if > 60), compute the actual send-time (might delay 1-12h if outside window), check throttle (pause + reschedule if at cap).

3. Admin route \`/api/admin/outreach/spam-check\` POST { subject, body } → returns score + reasons; used by the campaign builder for live preview.

4. Spam-trigger words list and rules in \`dashboard/src/lib/outreach-spam-words.ts\` (data file with ~150 entries + scoring rules).

Commit: \`feat(R3-M2.3): outreach deliverability — spam check + send window + throttle\`.`,
    { label: 'm2.3-deliverability', phase: 'M2-Engine', schema: FIX_RESULT, isolation: 'worktree' }),

  () => agent(`${SHARED}

WORK STREAM M2.4: DOMAIN REPUTATION MONITOR + DKIM/SPF/DMARC TOOL

Do:
1. New migration (152+) for \`domain_reputation_snapshots\`: id, domain, snapshot_at, spf_pass BOOLEAN, dkim_pass BOOLEAN, dmarc_pass BOOLEAN, bounce_rate NUMERIC, complaint_rate NUMERIC, gmail_inbox_rate NUMERIC (placeholder), source TEXT, raw JSONB.

2. \`dashboard/src/lib/dns-reputation.ts\` with checkDomainAuth(domain) that runs DNS lookups (via node:dns/promises) for SPF (TXT record on root), DKIM (TXT on default._domainkey or selector._domainkey), DMARC (TXT on _dmarc.). Returns {spf:{record, pass, reason}, dkim:{...}, dmarc:{...}}.

3. New cron \`/api/cron/check_domain_reputation\` runs daily, checks the FROM_EMAIL domain (e.g. capturepilot.com), inserts snapshot. Sentry alert if any of (spf, dkim, dmarc) flip to false. Schedule via enrichment_orchestrator.

4. Admin route \`/api/admin/outreach/domain-auth?domain=...\` GET → returns the current SPF/DKIM/DMARC status for the domain.

5. /admin/outreach Settings tab will display the latest snapshot + a "Re-check now" button that hits the route above.

6. Add Sentry breadcrumbs on bounce_rate > 2% or complaint_rate > 0.1% (industry red lines).

Commit: \`feat(R3-M2.4): domain reputation monitor + DKIM/SPF/DMARC check tool\`. Return migration filename.`,
    { label: 'm2.4-domain-rep', phase: 'M2-Engine', schema: FIX_RESULT, isolation: 'worktree' }),
])

// ============================================================================
// M3 — ADMIN UI (6 parallel)
// ============================================================================
phase('M3-AdminUI')

const m3 = await parallel([
  () => agent(`${SHARED}

WORK STREAM M3.1: /admin/outreach OVERVIEW TAB + LAYOUT SHELL

This is the entry point + the shell that hosts all tabs.

Do:
1. \`dashboard/src/app/(admin)/admin/outreach/page.tsx\` — top-level tabs nav (Overview | Campaigns | Contacts | Inbox | Templates | Suppression | Settings). URL-hash persistence (#overview by default).

2. Overview tab content:
   - **Date range picker** at the top (presets: Today, 7d, 30d, 90d, QTD, YTD, Custom). Stored in URL params (?from=&to=).
   - **Compare to previous period** toggle.
   - **6 KPI tiles** (sent / delivered / opened / clicked / replied / unsubscribed):
     - Big number + percentage (e.g. open_rate=37%)
     - Delta vs previous period (↑ 12%, color-coded)
     - Vs industry benchmark badge (green=above, amber=±20%, red=below)
   - Benchmarks (B2B cold outreach): delivered_rate 97%, open_rate 35%, click_rate 3%, reply_rate 6%, bounce_rate 2%, unsubscribe_rate 1%.
   - **Time-series chart**: simple SVG line chart (or use the existing chart lib if any), showing sent / opened / replied per day in the range.
   - **Top 5 campaigns** table — name + sent + reply rate + status — clickable into the campaign detail page.
   - **Domain reputation strip** at the bottom — last SPF/DKIM/DMARC check (from M2.4) + bounce/complaint rates with traffic-light status.

3. \`dashboard/src/app/api/admin/outreach/overview-kpis/route.ts\` GET → calls the schema's RPC twice (current + previous period) and returns { current: {...}, previous: {...}, deltas: {...} }.

4. Tab navigation should be sticky on scroll. Mobile-responsive (tabs collapse to a dropdown < 768px).

Use lucide icons (Megaphone for nav, BarChart3, Mail, MessageCircle, etc.).

Voice: HUMANIZER.md.

Commit: \`feat(R3-M3.1): /admin/outreach overview tab + tabbed layout\`.`,
    { label: 'm3.1-overview', phase: 'M3-AdminUI', schema: FIX_RESULT, isolation: 'worktree' }),

  () => agent(`${SHARED}

WORK STREAM M3.2: CAMPAIGNS TAB + STEP BUILDER

The campaigns tab + the "Create campaign" / "Edit campaign" flow.

Do:
1. Campaigns tab content (under \`(admin)/admin/outreach/page.tsx\` 'campaigns' branch):
   - Header: "Create campaign" button + filters (status: All / Draft / Active / Paused / Completed)
   - Table: name, channels (badges), status, contacts, sent, reply_rate, started_at, actions (Edit / Pause / Resume / Archive / View)

2. "Create campaign" modal (large) with steps:
   - **Step 1 — Basics**: name, description, channels (Email / SMS checkboxes), sender email + name
   - **Step 2 — Audience**: target_segment picker (NAICS multi-select, states, certifications, tags, custom_filter raw text). Or "Select from list" → opens outreach_lists picker.
   - **Step 3 — Cadence**: step builder. Each step is a card: channel (Email/SMS/Wait), delay ("send N hours/days after step X-1"), subject (if email), body with merge tags (live preview pane), skip_if_replied + skip_if_clicked toggles. "+ Add A/B variant" duplicates the step with variant_weight slider. "+ Add step" appends.
   - **Step 4 — Send settings**: throttle (max sends/hr), send window (start, end, timezone), CAN-SPAM footer (physical address, unsubscribe link auto-injected).
   - **Step 5 — Review + Save**: shows estimated reach + preview of email/SMS for the first contact.

3. Live spam-check on subject + body using /api/admin/outreach/spam-check (debounced 500ms). Shows score badge + reasons.

4. Live merge tag preview using a fake contact (firstName=Sarah, company=Acme Federal, etc.). Update preview as user types.

5. Save actions: "Save as Draft" (status=draft) and "Save + Activate" (status=active, set started_at, enqueue first send for all contacts in segment).

6. API endpoints:
   - GET /api/admin/outreach/campaigns?status=...
   - POST /api/admin/outreach/campaigns (create)
   - GET /api/admin/outreach/campaigns/[id]
   - PATCH /api/admin/outreach/campaigns/[id] (rename, activate, pause, archive)
   - DELETE /api/admin/outreach/campaigns/[id] (archive only)
   - POST /api/admin/outreach/campaigns/[id]/test-send { recipient_email } — sends step 1 to a test recipient

Voice: HUMANIZER.md.

Commit: \`feat(R3-M3.2): campaigns list + step-builder modal + live spam check\`.`,
    { label: 'm3.2-campaigns', phase: 'M3-AdminUI', schema: FIX_RESULT, isolation: 'worktree' }),

  () => agent(`${SHARED}

WORK STREAM M3.3: CAMPAIGN DETAIL PAGE

\`dashboard/src/app/(admin)/admin/outreach/campaigns/[id]/page.tsx\` — per-campaign analytics + drilldown.

Do:
1. Header: campaign name, status badge (with quick toggle), Created by, channels, started_at.
2. KPI strip — sent / delivered / opened / clicked / replied / unsubscribed / bounced for THIS campaign in a configurable date range (default: all time).
3. **Step performance table**:
   - Per step: step #, channel, subject (truncated), sent, delivered_rate, open_rate, click_rate, reply_rate, A/B variant breakdown
   - Color-code each rate (above/below benchmark)
4. **Contacts table**:
   - Filter by status (active/replied/bounced/unsubscribed)
   - Show: email, name, company, current_step, status, last activity, time_since_added
   - Click row → contact drawer with full engagement timeline
5. **Replies block** (top 3 recent replies inline with sentiment badges); link to "View all in Inbox".
6. **Edit campaign** button → opens the step builder pre-filled (same modal as M3.2 create).
7. Bulk actions on contacts: "Pause selected", "Resume selected", "Remove from campaign".

API endpoints:
- GET /api/admin/outreach/campaigns/[id]/contacts?status=...
- GET /api/admin/outreach/campaigns/[id]/step-performance
- POST /api/admin/outreach/campaigns/[id]/contacts/bulk-action { action, contact_ids }

Commit: \`feat(R3-M3.3): /admin/outreach/campaigns/[id] detail + step performance\`.`,
    { label: 'm3.3-campaign-detail', phase: 'M3-AdminUI', schema: FIX_RESULT, isolation: 'worktree' }),

  () => agent(`${SHARED}

WORK STREAM M3.4: CONTACTS TAB + IMPORTS + SEGMENTATION

Do:
1. Contacts tab with:
   - Filter sidebar: source, tags (multi-select), NAICS prefix, state, engagement (last 7d / 30d / never), status (subscribed / unsubscribed / bounced)
   - Search bar (email, name, company)
   - Table: email, name, company, title, NAICS, state, source, engagement_score, last_engagement_at, tags, actions (View / Add to campaign / Edit / Suppress)
   - Bulk select + bulk add to campaign / bulk tag / bulk add to list

2. "Import contacts" button → modal:
   - Tab 1: **CSV upload** — drag-drop CSV, auto-detect columns, map to email/first_name/last_name/company/title/phone/etc., preview first 10 rows, dedup by email (skip rows where email already in outreach_contacts unless --overwrite), import + report count.
   - Tab 2: **HubSpot sync** — pulls contacts from HubSpot via the existing HubSpot lib. Filters: properties.lifecyclestage=sales-qualified-lead, etc. Preview + import.
   - Tab 3: **SAM.gov POCs** — pulls from existing contacts table (where source='sam_gov') with filter (NAICS, agency, state). Bulk-add to outreach_contacts.
   - Tab 4: **Apollo search** — uses existing apollo wrapper to search by NAICS + state + title; preview + add. Counts against monthly Apollo quota.

3. "Lists" sub-section (outreach_lists table from M1.1): create/edit list, add contacts via filter or manual selection. Lists are reusable across campaigns.

4. Per-contact drawer (slide-in from right):
   - Profile (name, email, phone, company, title, source, tags)
   - Engagement timeline (all events from outreach_engagement_events ordered by captured_at desc) — opened email X, clicked link Y, replied to Z, etc.
   - Campaigns history (which campaigns contact has been in + status)
   - Replies history (all outreach_replies for this contact)
   - Manual notes (CRUD)
   - "Add to campaign" + "Suppress" actions

5. API endpoints:
   - GET /api/admin/outreach/contacts?filters...
   - POST /api/admin/outreach/contacts (create one)
   - POST /api/admin/outreach/contacts/import-csv (multipart)
   - POST /api/admin/outreach/contacts/sync-hubspot
   - POST /api/admin/outreach/contacts/import-sam-poc
   - POST /api/admin/outreach/contacts/search-apollo { naics, state, title }
   - POST /api/admin/outreach/contacts/bulk-action { action, ids, payload? }
   - GET /api/admin/outreach/contacts/[id]/timeline
   - GET /api/admin/outreach/lists
   - POST /api/admin/outreach/lists

Commit: \`feat(R3-M3.4): contacts tab + CSV/HubSpot/SAM/Apollo imports + lists\`.`,
    { label: 'm3.4-contacts', phase: 'M3-AdminUI', schema: FIX_RESULT, isolation: 'worktree' }),

  () => agent(`${SHARED}

WORK STREAM M3.5: TEMPLATES + SUPPRESSION + SETTINGS TABS

These are smaller, ship together.

**Templates tab**:
- List of email/SMS templates (use existing email_templates table if it exists; otherwise add a small outreach_templates table)
- Each template: name, channel (email/sms), subject (email), body, merge_tags, category, created_by, updated_at
- Edit modal with live preview + spam-check
- "Use in campaign" → opens campaign builder with template prepopulated

**Suppression tab** (replaces /admin/email-tracking suppression):
- List outreach_optouts grouped by source (resend_webhook, hubspot_webhook, unsubscribe_link, manual)
- Search by email
- Bulk import (CSV of emails)
- Manual add (single email + reason)
- Unsuppress (admin override with confirmation)

**Settings tab**:
- Default sender email + name (UI editor + saved to outreach_inbox_settings or internal_config)
- Default reply-to address
- Default email signature (rich text)
- SMS opt-in language (text)
- Default skip-if-replied behavior
- Default throttle (sends/hr globally across campaigns)
- Send-window defaults (hours + timezone)
- Domain reputation panel (from M2.4) — current SPF/DKIM/DMARC status + last check time + "Re-check now" button + Sentry incident count last 7d
- "Test send" button (sends a one-shot email to a chosen address using the current settings) — confirms delivery + opens

Commit: \`feat(R3-M3.5): templates + suppression + settings tabs\`.`,
    { label: 'm3.5-templates-suppression-settings', phase: 'M3-AdminUI', schema: FIX_RESULT, isolation: 'worktree' }),

  () => agent(`${SHARED}

WORK STREAM M3.6: INBOX (REPLIES) TAB + SENTIMENT TRIAGE

The unified inbox for tracking + responding to outreach replies.

Do:
1. Inbox tab content:
   - **Sentiment column filters** (chips): All / Positive / Neutral / Negative / Auto-Reply / Unsubscribe / Unclassified
   - **Status filter**: Handled / Unhandled (default: Unhandled)
   - **Campaign filter**: dropdown
   - **Search**: subject or body
   - **List view** (left 40%, right 60%):
     - Left: scrollable list of replies. Each row shows: from, subject (truncated), snippet, sentiment badge, campaign name, received_at, is_handled checkmark.
     - Right: selected reply detail. Shows full body, sentiment + intent + confidence, parsed meeting_url if present, related contact (with link to contact drawer), originating campaign + step.
   - Actions on the selected reply:
     - "Mark handled"
     - "Add to campaign" (move contact to a follow-up campaign)
     - "Tag contact" (apply tag)
     - "Reply" (opens a small composer; sends via SMTP / Resend; logs as a manual reply)
     - "Forward" (proxy through standard mail)
     - "Re-classify" (re-runs the LLM sentiment classifier)
     - "Mark sentiment manually" (admin override)

2. Sentiment badge styling: positive=emerald, neutral=stone, negative=red, auto_reply=violet, unsubscribe=amber, unsure=stone outline.

3. Live refresh every 30s (poll /api/admin/outreach/replies?unhandled=true).

4. API endpoints:
   - GET /api/admin/outreach/replies?sentiment=&handled=&campaign_id=&q=
   - PATCH /api/admin/outreach/replies/[id] (mark handled, set sentiment manually, add notes)
   - POST /api/admin/outreach/replies/[id]/reply { body } — sends a reply via Resend with proper threading headers
   - POST /api/admin/outreach/replies/[id]/reclassify — re-enqueues the classifier worker job

5. Add a small notification badge to the Outreach nav item showing unhandled-replies count (poll-cached).

Commit: \`feat(R3-M3.6): inbox tab + reply triage + sentiment filters + reply composer\`.`,
    { label: 'm3.6-inbox', phase: 'M3-AdminUI', schema: FIX_RESULT, isolation: 'worktree' }),
])

// ============================================================================
// M4 — NAV AUDIT (4 parallel)
// ============================================================================
phase('M4-Nav')

const m4 = await parallel([
  () => agent(`${SHARED}

WORK STREAM M4.1: ADMIN SIDEBAR REORGANIZATION + DB-HEALTH IN NAV

Do:
1. Enumerate all admin pages: \`find dashboard/src/app/\\(admin\\)/admin -name 'page.tsx'\`.
2. Read current admin sidebar (\`dashboard/src/app/(admin)/layout.tsx\` or component).
3. Reorganize into logical groups:
   - **Overview**: /admin/overview, /admin/health, /admin/db-health (CURRENTLY MISSING from nav — add it), /admin/changelog
   - **People**: /admin/clients (was /admin/users), /admin/leads, /admin/prospects
   - **Opportunities**: /admin/opportunities, /admin/matches, /admin/push-opportunity
   - **Pipeline**: /admin/pipeline, /admin/tasks (if exists)
   - **Outreach** (new from M3): /admin/outreach (with sub-route /admin/outreach/campaigns/[id])
   - **Operations**: /admin/jobs (R2-X5.2), /admin/queue, /admin/crons, /admin/tools
   - **Content**: /admin/academy, /admin/messages
   - **Settings**: /admin/connectors, /admin/settings
   - **Legacy/Hidden** (collapsed by default): redirect stubs

4. Each group is collapsible with a chevron. Active state on the route.
5. Use existing lucide icons; consistent stone color palette.
6. **Crucial**: don't break existing functionality — preserve existing routes, just regroup them visually.

Commit: \`feat(R3-M4.1): admin sidebar reorg + db-health in nav + collapsible groups\`.`,
    { label: 'm4.1-admin-nav', phase: 'M4-Nav', schema: FIX_RESULT, isolation: 'worktree' }),

  () => agent(`${SHARED}

WORK STREAM M4.2: WEBSITE NAV AUDIT

Marketing site at \`${ROOT}/website\` (separate Next.js project, likely a git submodule per CLAUDE.md).

Do:
1. \`cd website && find app -name 'page.tsx' | sort\` to enumerate all routes
2. Read website nav component (search for "Nav" or check root layout)
3. Cross-reference: list every page that exists but isn't in nav or footer
4. Categorize:
   - **Add to top nav**: substantial features pages, integrations pages
   - **Add to footer**: legal, contact, smaller resources
   - **Keep unlisted but in sitemap**: lead-magnet pages (paid-ads-only)
   - **Remove if duplicate or dead**

5. Suggested top nav grouping:
   - **Product** (dropdown: Overview, Features, Integrations, Security, Roadmap)
   - **Pricing** (single link)
   - **Resources** (dropdown: Blog, Guides, Agency Pain Points, Federal Calendar, Glossary, Tools)
   - **About** (single link or dropdown)
   - **Login / Sign up** (existing buttons)

6. Footer:
   - **Product**: Features, Pricing, Integrations
   - **Resources**: Blog, Guides, Free Tools
   - **Legal**: Privacy, Terms, Cookies
   - **Company**: About, Contact, Careers (if exists)
   - **Social**: links

7. Update \`website/app/sitemap.ts\` to ensure every public page is listed (including lead-magnet pages — they should be indexed for SEO).

8. If \`website/\` is a submodule: commit in the submodule, then in the main repo \`git add website\` to bump the pointer, and \`git commit\` in main referencing the bump.

Commit (in website): \`feat(nav): grouped nav + footer + sitemap audit\`. In main: \`chore(submodules): bump website pointer for nav audit\`.`,
    { label: 'm4.2-website-nav', phase: 'M4-Nav', schema: FIX_RESULT, isolation: 'worktree' }),

  () => agent(`${SHARED}

WORK STREAM M4.3: DASHBOARD (USER-FACING) NAV AUDIT

The SaaS dashboard nav for end users (NOT the admin nav, that's M4.1).

Do:
1. \`find dashboard/src/app/\\(dashboard\\) -name 'page.tsx' | sort\` to enumerate
2. Read the dashboard sidebar nav (\`dashboard/src/app/(dashboard)/layout.tsx\` or component)
3. Cross-reference: list pages that exist but aren't in the nav
4. Decide for each orphan:
   - **Add to nav**: anything users would expect to find (e.g. /matches, /opportunities, /pipeline, /capability-statement, /partners, /competitors, /settings, /billing, /proposals)
   - **Keep accessible via deep link only**: secondary pages reached from another page (e.g. /opportunities/[id] is reached from /opportunities list, doesn't need a nav entry)
   - **Remove if duplicate/dead**: any leftover stubs

5. Logical groups:
   - **Daily** (Dashboard, Matches, Pipeline)
   - **Sourcing** (Opportunities, Partners, Competitors)
   - **Build** (Capability Statement, Proposals)
   - **Account** (Settings, Billing)

6. Add a "Quick Actions" bar at the top of the sidebar with: Run Quick Checker, Refresh Matches, Write Proposal — bypassing nested clicks for the most-used flows.

7. Mobile: collapse to a bottom nav bar with 4 most-used items.

Commit: \`feat(R3-M4.3): dashboard sidebar reorg + Quick Actions + mobile bottom nav\`.`,
    { label: 'm4.3-dashboard-nav', phase: 'M4-Nav', schema: FIX_RESULT, isolation: 'worktree' }),

  () => agent(`${SHARED}

WORK STREAM M4.4: PORTAL (CONSULTING) NAV AUDIT

The consulting-client portal at \`(portal)/portal/*\`.

Do:
1. \`find dashboard/src/app/\\(portal\\)/portal -name 'page.tsx' | sort\` to enumerate
2. Read the portal nav (\`(portal)/portal/layout.tsx\` or component)
3. Cross-reference: list orphans
4. Decide:
   - **Add to nav**: substantial pages a client would use (Tasks, Documents, Messages, Opportunities, Competitors)
   - **Keep accessible**: detail pages reached from a list
   - **Remove**: dead stubs

5. Mobile-first since consulting clients are more likely to check on phone:
   - Top app bar with company branding (white-label if configured)
   - Bottom nav: Home / Tasks / Docs / Messages / More
   - "More" expands to a sheet with Opportunities, Competitors, Settings

6. Add an "unread tasks" + "unread messages" badge count system (poll every 60s).

Commit: \`feat(R3-M4.4): portal mobile-first nav + badge counts\`.`,
    { label: 'm4.4-portal-nav', phase: 'M4-Nav', schema: FIX_RESULT, isolation: 'worktree' }),
])

// ============================================================================
// M5 — ADJACENT (3 parallel)
// ============================================================================
phase('M5-Adjacent')

const m5 = await parallel([
  () => agent(`${SHARED}

WORK STREAM M5.1: ENGAGEMENT SCORING LIB + LEAD-SCORE INTEGRATION

Schema from M1.3 has outreach_lead_scores and recompute_contact_engagement_score(). Build the runtime.

Do:
1. \`dashboard/src/lib/outreach-engagement-scoring.ts\`:
   - calculateEngagementScore(contact, recentEvents): number 0-100 mirroring the SQL function
   - calculateFitScore(contact, icp): number 0-100 (ICP = NAICS overlap + revenue tier + state preferences from a config)
   - getCompositeLeadScore(contact): { engagement, fit, composite }

2. New cron \`/api/cron/recompute_lead_scores\` runs hourly:
   - Recomputes scores for contacts with events in the last hour
   - Updates outreach_lead_scores + outreach_contacts.engagement_score
   - Route via enrichment_orchestrator

3. Integration with user_matches: when a user_match is created or updated, also check if the contact for that opp's POC exists in outreach_contacts. If yes, link via a new \`opportunity_contact_id\` column on user_matches (if it doesn't exist, add migration 153+).

4. Surface composite_lead_score on the contact drawer in /admin/outreach/contacts UI (M3.4).

5. Sentry alert when a contact's engagement_score crosses 80 (high-intent signal — sales team should follow up).

Commit: \`feat(R3-M5.1): engagement scoring lib + lead-score cron + matches integration\`.`,
    { label: 'm5.1-engagement-scoring', phase: 'M5-Adjacent', schema: FIX_RESULT, isolation: 'worktree' }),

  () => agent(`${SHARED}

WORK STREAM M5.2: EMAIL WARMUP + DELIVERABILITY HELPERS

Email warmup = gradual ramp-up of sending volume from a new IP/domain to build reputation.

Do:
1. New migration (154+): \`email_warmup_schedule\` table with date, target_volume, actual_volume, mailbox_address. Pre-populate the next 30 days with a graduated curve (50, 75, 100, 125, ... up to 1000).

2. New table \`email_warmup_replies\`: id, sent_to TEXT (the warmup peer address), received_from TEXT, received_at, body_excerpt. Logs replies from warmup peers (a known list of friendly inboxes that participate in warmup).

3. \`dashboard/src/lib/email-warmup.ts\`:
   - getTodaysWarmupTarget() returns the target_volume for today
   - getRemainingWarmupCapacity() = target - actual sent today
   - shouldSendWarmupBatch() = true if we're under 80% of target
   - Pre-built warmup email template (innocuous business-talk content)

4. New cron \`/api/cron/email_warmup_send\` runs every 30 min during business hours:
   - Reads the day's target
   - If under capacity, sends a small batch of warmup emails to a configured peer list (env var WARMUP_PEER_ADDRESSES, comma-separated)
   - Each warmup email is a small variant of the template (randomized subject + body) to avoid identical fingerprints
   - Logs sent count to email_warmup_schedule.actual_volume

5. Admin UI: extend /admin/outreach Settings tab with a "Warmup status" block showing today's target + actual + a 30-day chart of the ramp.

6. The Settings UI also has a "Pause warmup" toggle for when we don't want to ramp (testing).

Commit: \`feat(R3-M5.2): email warmup schedule + cron + admin UI status\`. Document the WARMUP_PEER_ADDRESSES env var requirement.`,
    { label: 'm5.2-email-warmup', phase: 'M5-Adjacent', schema: FIX_RESULT, isolation: 'worktree' }),

  () => agent(`${SHARED}

WORK STREAM M5.3: SEQUENCE PRESET LIBRARY (cold-outreach templates)

5 ready-to-use cold-outreach sequence templates that an admin can clone into a new campaign and customize.

Do:
1. \`dashboard/src/lib/outreach-sequence-presets.ts\` exports an array of presets. Each preset has:
   - id, name, description, channel ('email'|'sms'|'mixed'), use_case (e.g. "Cold outreach to federal contracting officers"), industry, days_duration, steps array (each step has order, channel, delay, subject, body_template).

2. The 5 presets:
   - **"Federal contracting officer intro (5-step, 15-day, email-only)"** — soft intro, value prop, case study, ask, breakup. Tailored for COs at agencies.
   - **"Prime contractor partner outreach (4-step, 10-day, email + SMS)"** — to primes about teaming on a specific opp. Step 1 email intro, step 2 SMS follow-up, step 3 email with prior-perf doc, step 4 closing.
   - **"SMB recompete alert (3-step, 7-day, email)"** — to incumbents whose contract is expiring soon, asking about their recompete strategy + offering a partnership.
   - **"Re-engage cold leads (4-step, 14-day, email)"** — to leads that haven't engaged in 90+ days. Friendly check-in, value-add resource, case study, soft CTA.
   - **"Demo-request follow-up (3-step, 5-day, email + SMS)"** — for inbound demo requests that ghosted; reminder, value bump, breakup.

3. Each preset's body_template uses merge tags + follows HUMANIZER.md voice (federal-contractor-fluent, contractions, no buzzwords, specific).

4. Admin UI: in the M3.2 step builder, add a "Start from a preset" button at the top of the modal. Lists the 5 presets with a preview pane. Click → clones the preset's steps into the new campaign.

5. Each preset should be loaded as a "Suggested next step" hint after the user creates 1 campaign of any kind — small unobtrusive footer banner.

Commit: \`feat(R3-M5.3): 5 cold-outreach sequence preset templates\`.`,
    { label: 'm5.3-sequence-presets', phase: 'M5-Adjacent', schema: FIX_RESULT, isolation: 'worktree' }),
])

// ============================================================================
// M6 — MERGE + REPORT + MEMORY
// ============================================================================
phase('M6-Merge')

const allStreams = [...m1, ...m2, ...m3, ...m4, ...m5].filter(Boolean)

const finalMerge = await agent(
  `You are the merge orchestrator + final-report writer for MEGA Round 3.

STREAMS (${allStreams.length}):
${JSON.stringify(allStreams.map(r => ({ stream: r.stream, sha: r.commit_sha, status: r.status, files: r.files_touched, migrations: r.migrations_added || [], env_vars: r.env_vars_needed || [] })), null, 2)}

PART 1 — MERGE
1. cd ${ROOT}
2. \`git worktree list\` to enumerate worktrees + branches
3. Suggested order (least-conflict first):
   - All M1 schema streams (m1.1, m1.2, m1.3, m1.4) — pure SQL
   - All M5 adjacent (m5.1, m5.2, m5.3) — mostly libs + crons
   - All M2 engine (m2.1, m2.2, m2.3, m2.4) — backend
   - M4 nav (m4.1, m4.2, m4.3, m4.4) — sidebar layouts (may conflict if multiple touch the same layout)
   - All M3 UI (m3.1, m3.2, m3.3, m3.4, m3.5, m3.6) — UI surface (m3.1 ships the page shell first; others build on it)
4. For each: \`git merge --no-ff <branch>\` then \`cd dashboard && npx tsc --noEmit 2>&1 | head -30\`
5. On error: \`git reset --hard HEAD~1\` and continue. Document skip.
6. Final tsc clean.
7. Collect all migration filenames in apply order.
8. Remove worktrees.

PART 2 — APPEND TO WALK-RETURN-REPORT.md
Append to \`${ROOT}/docs/WALK-RETURN-REPORT.md\` (DO NOT truncate existing content):

# Round 3 — Outreach hub + nav audit (2026-06-10 evening)

## TL;DR
- The /admin/email-tracking + /admin/emails surfaces are gone
- Replaced by unified /admin/outreach hub with 7 tabs: Overview, Campaigns, Contacts, Inbox, Templates, Suppression, Settings
- Multi-step email + SMS cadences (Twilio integrated)
- Sentiment-classified reply inbox + manual triage
- Engagement + fit lead scoring
- Email warmup automation
- 5 cold-outreach preset templates
- Domain reputation monitoring (SPF/DKIM/DMARC)
- Nav audit shipped: admin sidebar regrouped, db-health visible, website nav reorganized, dashboard nav grouped, portal mobile-first

## What's live
(per stream)

## New migrations (apply order)
(list)

## New env vars
(list — especially WARMUP_PEER_ADDRESSES if used)

## Manual setup
- Configure Resend webhook URL: ALREADY DONE (in session)
- Configure Twilio status callback URL: https://app.capturepilot.com/api/webhooks/twilio-status (set in Twilio dashboard)
- Configure email reply forwarding: forward replies to ... → /api/webhooks/email-reply
- Configure WARMUP_PEER_ADDRESSES env var with comma-separated peer inboxes (or disable warmup in Settings)

## Voice: HUMANIZER.md throughout.

PART 3 — DON'T PUSH. I do that next.

Return summary + migration list.`,
  { label: 'm6-merge', phase: 'M6-Merge' },
)

return {
  m1, m2, m3, m4, m5,
  final_merge: finalMerge,
  manual_actions_required: allStreams.flatMap(s => s.follow_up || []).filter((v, i, a) => a.indexOf(v) === i),
  env_vars_needed: allStreams.flatMap(s => s.env_vars_needed || []).filter((v, i, a) => a.indexOf(v) === i),
  migrations_in_order: allStreams.flatMap(s => s.migrations_added || []),
}
