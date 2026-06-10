# Data Quality Report

## Database health summary

**Row counts (live):**
- `opportunities` — 78,031 (SAM 72,695 / SLED 5,314)
- `contractors` — ~83,000
- `contacts` — 94,780
- `user_profiles` — 11
- `user_matches` — 5,484
- `worker_jobs` — 75,673 (pending 44,049 / done 17,585 / failed 14,036 / running 3)
- `company_analyses` — 460
- `marketing_leads` — 121

**Null rates on critical fields:**
- `opportunities.opportunity_score` — **100% null** (78,031/78,031). Column exists, nothing writes to it.
- `opportunities.ai_win_strategy` — **81.3% null** (63,455/78,007).
- `opportunities.structured_requirements` — **73.8% null** (57,583/78,007).
- `opportunities.strategic_scoring` — **46.6% null** (36,360/78,007).
- `opportunities.naics_code` — **7.2% null** (5,650/78,007). Matching engine can't score these.
- `opportunities.psc_code` — **50.8% null** (39,596/78,007).
- `opportunities.agency` — **25.8% null** (20,134/78,007). SAM ingest should always have this.
- `opportunities.solicitation_number` — **28.4% null** (22,117/78,007).
- `opportunities.link_last_checked_at` — **95% null** (74,148/78,031). The `link_broken` column is meaningless at this scale.
- `user_profiles.last_login_at` — **100% null** (11/11). Never wired up to auth.
- `marketing_leads.hubspot_contact_id` — **76.9% null** (93/121).
- `marketing_leads.apollo_enriched_at` — **100% null** (121/121).
- `marketing_leads.lead_brief` — **48.8% null** (59/121).
- `contractors.uei` — **3.5% malformed** (2,955/83,000 — all from `fpds_discovery` source, 38-char UUID instead of 12-char UEI).
- `contacts.fullname` — **2.7%** of rows (2,559/94,780) have an email address stored in the name field. 19 also have email-in-title. The "PSC code in email" bug CLAUDE.md couldn't repro lives here.

**Duplicate rate:**
- `opportunities` by (solicitation_number, agency) — **10.8%** (3,664 dup groups across 8,394 rows). Worst offender: GSA MAS `47QSMD20R0001` repeats 459 times.

**Staleness:**
- 40.3% of `EXPIRING_SOON` rows (2,621/6,500) are past `response_deadline`. Status transition cron not running.
- 69 `ACTIVE` rows past deadline.
- 62 `DISCOVERED` rows older than 90 days.
- 54% of `opportunities` are non-live (EXPIRED 35% / AWARDED 6% / ARCHIVED 7% / INTELLIGENCE 6%).
- `compute_past_performance_stats` last ran 2026-06-08 — not in vercel.json, not in orchestrator, depends on manual trigger.

---

## Per-table findings

### `opportunities` (78,031 rows — claimed 37k in CLAUDE.md, actual is more than 2x that)

**What's broken:**
- 100% null `opportunity_score` — column was added, no cron ever wrote to it.
- 81% null `ai_win_strategy`, 74% null `structured_requirements`, 47% null `strategic_scoring`. The April 16 "parallel agent sweep" was supposed to backfill — it never finished and new ingest outpaces it.
- 10.8% duplicate rate on (solicitation_number, agency). No partial unique index enforcing live-pipeline dedup.
- 40% of `EXPIRING_SOON` rows are past deadline. Lifecycle cron writes the first transition but never the second.
- Three columns share a name with two different writers: `summarize-document` overwrites `ai_win_strategy` with a totally different shape than `ai_strategy` cron writes. Whichever runs last wins.
- THREE unique constraints on the (id, notice_id) pair plus duplicate index on `is_archived` — ~200MB of wasted index space + write amplification.
- Four near-duplicate task types (`extract_structured_reqs_federal/state/city/county`) fragment the work queue.

**Cron/validation fix:**
- Decide whether `opportunity_score` is alive — if yes, write it at ingest in `1_ingest_sam.py` + at every status change. If no, drop the column.
- Run `/api/admin/backfill-enrichment` repeatedly until `ai_win_strategy` null rate hits zero. Surface null % as a `/admin/health` KPI so it can't silently regress.
- New cron pass: `UPDATE opportunities SET status='EXPIRED', status_changed_at=NOW() WHERE status IN ('ACTIVE','EXPIRING_SOON') AND response_deadline < NOW() AND NOT retention_protected`. Hourly.
- Partial unique index on (solicitation_number, agency) WHERE status IN ('ACTIVE','EXPIRING_SOON','MARKET_RESEARCH').
- Drop `opportunities_notice_id_unique` (PK covers it) and `idx_opps_is_archived` (composite index covers it). `VACUUM FULL` off-hours.
- Stop the `summarize-document` clobber — write to a new `ai_document_summary` column or namespace under `ai_win_strategy.document_summary`.
- Collapse `extract_structured_reqs_*` to one task type with `payload.jurisdiction`.

### `contractors` (~83,000)

**What's broken:**
- 188M sequential-tuple-reads in the recent window despite extensive index set — query patterns are bypassing the GIN indexes on `naics_codes`, `fts`, `certifications` (all show **0 idx_scan**). Most likely the Partners search is using `naics_codes::text ILIKE '%541511%'` instead of `naics_codes && ARRAY['541511']`.
- 2,955 rows with malformed UEI — 100% from `fpds_discovery` source. FPDS importer is writing FPDS award IDs into the `uei` column.

**Cron/validation fix:**
- `EXPLAIN ANALYZE` the actual Partners query to find why GIN isn't being used. Fix the query shape.
- Fix the FPDS ingest path: move FPDS award ID to a new `fpds_award_id` column, leave `uei` NULL unless SAM lookup resolves it. Backfill: `UPDATE contractors SET uei=NULL WHERE enrichment_source='fpds_discovery' AND LENGTH(uei)!=12`.
- Add CHECK constraint: `LENGTH(uei)=12 OR uei IS NULL`.
- Partial index for unenriched rows: `CREATE INDEX idx_contractors_unenriched ON contractors (last_enriched_at NULLS FIRST) WHERE apollo_enriched = false`.

### `contacts` (94,780)

**What's broken:**
- 2,559 rows (2.7%) have an email address stored in `fullname`. 19 rows have email-in-title. Some rows have completely mismatched email/title/fullname triples. This is the actual root cause of the CLAUDE.md "PSC/email display bug — cannot reproduce."

**Cron/validation fix:**
- Tighten the SAM POC parser in `tools/1_ingest_sam.py` — reject any `fullname`/`title` token matching email regex; route to `email` field if empty, else discard.
- Backfill: `UPDATE contacts SET fullname=NULL WHERE fullname ~* '@'`.
- Add CHECK: `fullname NOT LIKE '%@%'`.
- No dedup key on normalized email today — see the proposal section below.

### `user_profiles` (11)

**What's broken:**
- `last_login_at` is null on every row. No auth callback or middleware writes to it.
- Mixed identity columns across the schema — 36 tables use `user_profile_id`, 4 use `auth_user_id`, 2 use `profile_id`. CLAUDE.md flagged this caused the `cron-trigger`/`cron-runs` 403 bug (queried `user_profiles.user_id`, a column that doesn't exist).

**Cron/validation fix:**
- Add an upsert into `user_profiles.last_login_at = NOW()` in the Supabase Auth `onAuthStateChange` / middleware session-refresh path.
- Document the convention in CLAUDE.md: "`auth_user_id` = uuid REFERENCES auth.users(id) — used ONLY by user_profiles + team membership. `user_profile_id` = uuid REFERENCES user_profiles(id) — used by EVERYTHING ELSE."
- Add a CI lint that fails on new tables introducing `user_id` (no prefix) or `auth_user_id` outside membership tables.

### `user_matches` (5,484)

**What's broken:**
- 20.7M sequential-tuple-read over the recent window — averages 3,470 rows per scan on a 5,484-row table. Composite index `idx_user_matches_dashboard` exists but isn't being used by every query. Most likely culprit: unscoped `count(*)` queries for total stats.

**Cron/validation fix:**
- Run `pg_stat_statements` to identify the scanning query. Likely fix: add `WHERE user_profile_id = $1` to count queries.
- For per-status counts use `WHERE user_profile_id = $1 GROUP BY classification` so the composite index is honored.

### `worker_jobs` (75,673)

**What's broken:**
- Queue is catastrophically backed up: **44,049 pending**, oldest dating to 2026-05-26 (14+ days).
- `extract_keywords` (17,638 pending) and `classify_naics` (12,971 pending) **consumed 0 jobs in the last 24h**. Root cause: `claim_jobs()` orders by `priority DESC` and `extract_structured_reqs_federal` was bumped to priority 8 — it always has 11,630 available rows, so the consumer never reaches priority-7 NAICS or priority-6 keywords.
- `analyze_attachments` — 13,733 failed / 1,807 done lifetime (88% failure). Most are `reaped after stuck running > 00:10:00`. Recent fix (commit 9e929569) split into a dedicated lane with a 150s budget; current rate is 0 failures, but the 5,937 historic failures still sit in the table.
- 3 `running` jobs since 2026-05-29 (12 days). The reaper isn't catching them, and the partial unique index on `dedup_key WHERE status IN ('pending','running')` blocks any re-enqueue of those opps forever.
- No archive cron. Table is 35MB and growing every opportunity INSERT via fan-out trigger.

**Cron/validation fix:**
- One-shot: `UPDATE worker_jobs SET status='failed', error_message='reaped stale', finished_at=now() WHERE status='running' AND started_at < now() - interval '1 hour'`.
- Pick a starvation fix: weighted round-robin in `claim_jobs()`, OR dedicated `/api/cron/run_worker_jobs_keywords` lane, OR lower `extract_structured_reqs_federal` priority from 8 back to 6.
- Pause `enqueue_backfill` for ~3 days while the backlog drains. Permanently throttle: skip the INSERT batch if pending count for that task_type > 5,000.
- Add daily cron: `DELETE FROM worker_jobs WHERE status='done' AND finished_at < now() - interval '7 days'`. Archive failed to `worker_jobs_archive`.
- Add `/admin/queue` alert when oldest pending > 1 hour.

### `company_analyses` (460)

**What's broken:**
- RLS policy `Allow anonymous insert on company_analyses` has `WITH CHECK (true)` — any anon can spam analyses with arbitrary `lead_email`. Combined with `/auth/callback` resolving analysis ownership by email match, this is an account-takeover vector: attacker pre-creates an analysis with `lead_email=victim@x.com`, victim signs up and auto-claims the attacker-seeded row.

**Cron/validation fix:** see the validation proposal section below.

### `marketing_leads` (121)

**What's broken:**
- 77% never synced to HubSpot. 100% never Apollo-enriched. 49% missing lead_brief. Pending `enrich_lead_apollo` 121, pending `enrich_lead_brief` 37 — the backlog matches the gap exactly. Same root cause as the worker queue starvation.
- No `updated_at` column.

**Cron/validation fix:**
- Confirm `/api/cron/run_worker_jobs` claims `enrich_lead_apollo` + `enrich_lead_brief` task types. If not, add to its `HTTP_TASK_TYPES`.
- Add `updated_at timestamptz not null default now()` + `moddatetime` trigger.

### `portal_cookies` (0 rows)

**What's broken:**
- Table is empty. No `warm_cf_cookie` job has saved a cookie row that's still present. Combined with the FlareSolverr early-return path at `worker.js:354` (which never calls `savePortalCookies`), Bonfire scraping has no cookie pool to draw from.
- The cookie-refresh logic in `run_worker_jobs/route.ts:755-775` queries this table for expiring-soon rows — empty table means it never queues warms.

**Cron/validation fix:**
- Decide: if FlareSolverr handles everything, delete `warm_cf_cookie` task and the cookie-refresh block. If FlareSolverr will not be configured, seed `portal_cookies` with the 220+ Bonfire seed-list hosts so the expiry-refresh has rows to iterate.

### Other notable tables

- `scheduled_emails` (321) — 286 pending, only 4 past-due. Cron healthy, but failure reasons are too generic to debug (`Dispatch returned false (template disabled or send error)` covers 4 distinct failure modes).
- `email_events` (0 rows) — webhook deployed, receiving nothing. Either `RESEND_WEBHOOK_SECRET` is unset (handler returns 500) or webhook isn't registered in Resend dashboard. Bounce + complaint tracking is dark.
- `outreach_optouts` (0 rows) — bounce webhook updates `backlink_outreach.bounced_at` only, never adds the address to global suppression. `email.ts send()` doesn't check it either. CAN-SPAM exposure.
- `email_templates` (0 rows) — Unlayer custom-template feature is dead code; every send falls through to code-generated HTML.
- `matches` (0 rows) — replaced by `user_matches`, never dropped.
- `_backfill_targets_federal_2026_06_08` (100 rows) — orphan staging table from migration 091, still in the public schema.
- 8 mutable tables missing `updated_at`: `attachment_analysis_jobs`, `client_competitors`, `client_documents`, `health_alerts`, `marketing_leads`, `plan_tiers`, `user_action_items`, `user_pursuits`.
- `cron_runs` (1,939), `alert_autofixes` (2,539), `reengage_sends` (262), `scheduled_emails` (321) — all grow unbounded with no archive cron.

---

## Cross-table relationship gaps

**Orphan rows + broken FKs:**
- 15 foreign keys use default `NO ACTION` on delete. Deleting an `auth.users` row errors out — that's why `account_deletion_requests` has never been processed. Audit columns (`assigned_by`, `uploaded_by`, `actor_id`, `invited_by`, `updated_by`, `pushed_by_user_id`, `reviewed_by`, `added_by_user_id`) should be `ON DELETE SET NULL`. Ownership columns (`managed_by`, `user_profile_id`, `opportunity_id`) should be `CASCADE` if soft-delete is not used. Reference codes (`naics_code`, `psc_code`) should drop the FK entirely — you can never deprecate a NAICS without touching 78k rows.

**Naming mismatches:**
- 36 tables use `user_profile_id`, 4 use `auth_user_id`, 2 use `profile_id`. `slack_installations` has both `user_id text` and `user_profile_id uuid`. Every new RLS policy or admin handler has to remember which column applies — the CLAUDE.md-flagged `cron-trigger` 403 bug came from querying `user_profiles.user_id` which doesn't exist.
- The `matches` table (0 rows) shares conceptual space with `user_matches` (5,484 rows). Confusing for any new contributor.

**Identity drift:**
- 4 admin routes (`bulk-enrich`, `env-health`, `impersonate`, `outreach/prospects`) inline the admin check instead of calling `assertAdmin()`. They work today but the canonical helper exists specifically because inline drift caused the 30-route Phase-1 regression.

**Auth-claim bug:**
- `/auth/callback` auto-claims `company_analyses` rows where `lead_email = user.email` with no signed token. Combined with the open INSERT policy on `company_analyses`, an attacker can seed an analysis under a victim's email and the victim auto-claims it on signup.

**Webhook → CRM gap:**
- Resend bounce/complaint events update only `backlink_outreach`. HubSpot contact properties (`hs_email_hard_bounced`, `unsubscribed_from_all_email`) are never written. Sales keeps mailing dead addresses.

**Stripe → user_profile race:**
- Stripe webhook handlers update by `stripe_customer_id` without checking row existence. First-time customers whose row hasn't yet received `stripe_customer_id` silently no-op.

---

## Confidence-scoring + data-health-scoring proposal

Most enrichment outputs today are written as bare strings/arrays with no provenance, no rationale, and no confidence. Downstream consumers (HubSpot push, dashboard cards, AI prompts) can't tell a strong signal from a guess.

**Pattern: every AI-derived field gets a sibling `_confidence` (0-1) and a `_source` (string).**

### `opportunities`

| Field | Confidence rule | Where it runs |
|---|---|---|
| `opportunity_score` (int 0-100) | Deterministic — set at ingest from `set_aside`, `sources_sought_flag`, `deadline_days_out`, agency size. No confidence needed (it's a deterministic score). | `1_ingest_sam.py` + status-transition cron |
| `ai_win_strategy` | Add `ai_win_strategy.confidence` per section (summary, sales_angle, key_risks). Set 1.0 when the prompt was fed full description + attachments; 0.5 when only title; 0.0 when fallback heuristic. | `/api/cron/ai_strategy` + `bulk_enrich_ai` — must converge on the shared lib `lib/ai-win-strategy.ts`. |
| `structured_requirements` | Existing object with `min_workforce`, `years_experience` etc. — add `extraction_source: 'attachment' \| 'description' \| 'title'` and `confidence: 0..1`. | `extract_structured_reqs_*` worker tasks |
| `extracted_keywords` | Add `confidence_by_keyword: { kw: score }` already produced by Gemini/OpenAI but currently discarded. | `extract_ai_keywords.ts` |
| `strategic_scoring.match_confidence` | 1.0 when NAICS + PSC + state all known; degrade by 0.2 per missing field. | `/src/lib/strategic-scoring.ts` |

### `contacts`

| Field | Confidence rule |
|---|---|
| `email`, `fullname`, `title` | Add `field_source jsonb` — `{ email: 'sam_poc', fullname: 'sam_poc', title: 'inferred_from_email_handle' }`. Add `email_validation_state` (`unverified`/`syntax_valid`/`smtp_verified`/`bounced`). |
| Any field where the value contains `@` | Confidence = 0, route to email field. |

### `marketing_leads`

| Field | Confidence rule |
|---|---|
| `lead_brief.fit_score` (already 1-10) | Add `evidence_quotes: string[]` and `confidence: 0..1`. |
| `lead_brief.strengths`, `pitch_angles`, `weaknesses` | Promote from `string[]` to `{ text, evidence, confidence }[]`. Update the LLM schema hint to demand evidence quotes. HubSpot push and admin UI render only items with confidence >= 0.6. |

### `company_analyses.inferred_profile`

| Field | Confidence rule |
|---|---|
| `nail_down_keywords`, `strengths`, `weaknesses`, `pitch_angles`, `revenue_signal`, `federal_agencies_served` | Today: bare `string[]`. Only `certifications` has a `confidence`. Make all of them `{ text, evidence, confidence }`. Add `llm_provider: 'openai' \| 'deepseek' \| 'ollama' \| 'heuristic'` at the top level so heuristic-fallback runs are visible in `/admin/health`. |

### Data-health scoring

Add a per-table `data_health` view that returns a single 0-100 score:

```
opportunities health = 100
  - 20 if null_rate(ai_win_strategy) > 0.3
  - 20 if null_rate(naics_code) > 0.1
  - 20 if null_rate(agency) > 0.1
  - 20 if dup_rate(sol_num, agency) > 0.05
  - 20 if expired_but_active_count > 100
```

Surface on `/admin/health` as a single KPI per table. Alert when any table drops below 60.

---

## Duplicate prevention

Specific dedup keys to add where missing:

| Table | Key | Today | Recommended |
|---|---|---|---|
| `opportunities` | (`solicitation_number`, `agency`) | No enforcement — 10.8% dup rate | Partial unique index `WHERE status IN ('ACTIVE','EXPIRING_SOON','MARKET_RESEARCH')`. Backfill: keep newest `notice_id` per (sol_num, agency, title) group, soft-archive the rest with `status='ARCHIVED'`, `retention_reason='DEDUP_MERGE'`. |
| `contractors` | `uei` | Already unique but FPDS source pollutes with 38-char fake UEIs | Add `CHECK (LENGTH(uei) = 12 OR uei IS NULL)`. Move FPDS award IDs to a new `fpds_award_id` column. |
| `contacts` | normalized email (`lower(trim(email))`) | No constraint | Generated column `email_normalized = lower(trim(email))` + partial unique index `WHERE email IS NOT NULL`. Backfill duplicates by keeping the row with the most complete `fullname` + `title`. |
| `marketing_leads` | (`lower(email)`, `magnet`) | App-level `isDuplicate` check but no DB constraint | Unique index on (`lower(email)`, `magnet`). Stops the email-bomb attack path where the same submission burns Apollo + Resend + HubSpot fanout. |
| `worker_jobs` | `dedup_key WHERE status IN ('pending','running')` | Exists in migration 086 | Working as designed, but the 12-day-old `running` rows block re-enqueue of the same opp_id forever — paired with the reaper fix above. |
| `processed_stripe_events` | `event.id` | No idempotency tracking | New table `processed_stripe_events (id text primary key, processed_at timestamptz default now())`. Stripe webhook does `insert ... on conflict do nothing returning id`; if no row, return 200 without dispatching. |
| `email_events` | (`provider_event_id`) | No constraint | Resend webhook should de-dup on `event.id` — same pattern as Stripe. |
| `company_analyses` | (`lower(website)`, `lower(lead_email)`) within 24h | No constraint, open INSERT policy | Unique partial index on (`lower(website)`, `lower(lead_email)`) `WHERE created_at > now() - interval '24 hours'`. Also fixes the spam-analyses attack vector. |
| `outreach_optouts` | `lower(email)` | Table exists but never populated | Unique index. Resend webhook on `bounced`/`complained` inserts with `ON CONFLICT DO NOTHING`. |
| `client_competitors` | (`user_profile_id`, `lower(competitor_name)`) | No constraint | Stops the same admin adding the same competitor twice. |

---

## Automated validation proposal

Enforce invariants at write time so bugs can't silently corrupt data:

**CHECK constraints:**
```sql
ALTER TABLE contacts ADD CONSTRAINT contacts_fullname_no_email
  CHECK (fullname IS NULL OR fullname !~* '@');

ALTER TABLE contacts ADD CONSTRAINT contacts_title_no_email
  CHECK (title IS NULL OR title !~* '@');

ALTER TABLE contractors ADD CONSTRAINT contractors_uei_length
  CHECK (uei IS NULL OR LENGTH(uei) = 12);

ALTER TABLE opportunities ADD CONSTRAINT opps_score_range
  CHECK (opportunity_score IS NULL OR opportunity_score BETWEEN 0 AND 100);

ALTER TABLE user_matches ADD CONSTRAINT user_matches_score_range
  CHECK (score >= 0 AND score <= 1);

ALTER TABLE marketing_leads ADD CONSTRAINT marketing_leads_email_format
  CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
```

**Triggers:**
```sql
-- Auto-expire deadline-passed rows on every read of EXPIRING_SOON
CREATE TRIGGER opportunities_auto_expire
  BEFORE UPDATE ON opportunities
  FOR EACH ROW
  WHEN (NEW.status IN ('ACTIVE','EXPIRING_SOON') AND NEW.response_deadline < now())
  EXECUTE FUNCTION sync_status_from_deadline();

-- updated_at on the 8 missing tables
CREATE TRIGGER set_updated_at BEFORE UPDATE ON marketing_leads
  FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');
-- (repeat for the other 7 tables)
```

**RLS hardening:**
- Replace `company_analyses` open INSERT policy with `WITH CHECK (lead_email IS NULL AND status = 'pending' AND created_at > now() - interval '5 minutes')`. Funnel real inserts through `/api/analyze-company` using the service key with rate limiting.
- 32 tables have RLS enabled with zero policies — decide intent per table and add either `CREATE POLICY ... FOR SELECT USING (false)` (server-only, explicit), or proper per-role policies. Document a CLAUDE.md convention: every new RLS-enabled table ships with at least one policy in the same migration.
- Add `tools/30_smoke_admin.mjs` check that fails CI when Supabase advisor reports `rls_enabled_no_policy`.

**SECURITY DEFINER hardening:**
- `ALTER FUNCTION ... SET search_path = public, pg_temp` on the 17 mutable-search-path functions.
- `REVOKE EXECUTE ... FROM anon, authenticated` on the 6 publicly-callable SECURITY DEFINER RPCs that survived migration 090 (`enqueue_marketing_leads_apollo_backfill` is the residual one). The advisor still lists `trigger_cron_route`, `rls_auto_enable`, `purge_old_activity_log` — revoke either landed and got re-granted, or never landed. Re-verify with `get_advisors` after deploy.

**Pre-write validation in ingest scripts:**
- `1_ingest_sam.py` — reject rows with no NAICS (mark `opp_class='UNCLASSIFIED'` so they're not treated as normal candidates).
- SAM POC parser — reject any `fullname`/`title` token containing `@`; route to `email` if empty, else discard.
- FPDS importer — never write FPDS IDs into `uei`. Write to `fpds_award_id` only.

**Observability:**
- Daily query: count opps created in last 24h with no `worker_jobs` row for `extract_keywords`. Non-zero means the dedup index is silently dropping new INSERTs because old stuck-pending rows still hold the key.
- `/admin/health` cards: per-table data_health score, queue depth per task_type, oldest-pending age, daily failure rate per task_type, % of QCs using `heuristic` LLM fallback, Resend `email_events` count in last 24h.
- Alert when `analyze_attachments` daily failure rate > 50%, when oldest-pending in any lane > 1 hour, when any LLM fallback rate > 5% of last-100 runs.
