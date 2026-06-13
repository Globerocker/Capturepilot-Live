# Cron & Agent Reference

Every scheduled task in Caturepilot 2.0, what it does, where it writes, and how to debug it. Mirror of [`dashboard/vercel.json`](dashboard/vercel.json) + the orchestrator fan-out logic + the VPS systemd timers.

**Pro-plan limit: 40 crons. Current vercel.json count: 40.** No slots free. Heavy workloads that would push us over the ceiling now run on the Hostinger VPS — see [Externally-run crons](#externally-run-crons-not-in-verceljson) below.

All cron route handlers live in [`dashboard/src/app/api/cron/`](dashboard/src/app/api/cron/). Every handler enforces `guardCron(req)` from [`src/lib/cron-auth.ts`](dashboard/src/lib/cron-auth.ts) — **fail-closed in production**, dev-friendly locally. Every run is wrapped with `withCronTelemetry()` from [`src/lib/cron-telemetry.ts`](dashboard/src/lib/cron-telemetry.ts) which writes a row to `cron_runs` (status, duration_ms, error, stats payload) — drive the health dashboard from this table.

## Triggering a cron manually

```
curl -X GET "https://captiorpilot-v3.vercel.app/api/cron/<name>" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Orchestrators accept `?task=<name>` (enrichment) or `?agent=<name>` (backlinks) to force-run a single sub-task.

---

## 1 · Data Ingestion (8 crons)

| Cron | Schedule (UTC) | Source | Writes | Purpose |
|---|---|---|---|---|
| [`ingest_sam`](dashboard/src/app/api/cron/ingest_sam/route.ts) | `30 0 * * *` | api.sam.gov | `opportunities`, `naics_codes`, `psc_codes` | Pulls fresh federal solicitations (~500-2000/day). Heart of the platform. |
| [`ingest_grants`](dashboard/src/app/api/cron/ingest_grants/route.ts) | `30 2 * * *` | api.simpler.grants.gov | `opportunities`, `naics_codes` | Grants.gov opportunities mapped to approximate NAICS. |
| [`ingest_rss`](dashboard/src/app/api/cron/ingest_rss/route.ts) | `45 2 * * *` | RSS feeds | `opportunities`, `rss_sources` | State/local procurement portals via RSS. Staggered from `ingest_grants` to avoid collision. |
| [`ingest_highergov_sled`](dashboard/src/app/api/cron/ingest_highergov_sled/route.ts) | `45 1 * * *` | HigherGov SLED export | `opportunities`, `naics_codes`, `psc_codes` | State/local/education opportunity feed. |
| [`ingest_highergov_people`](dashboard/src/app/api/cron/ingest_highergov_people/route.ts) | `15 2 * * *` | HigherGov contacts export | `government_contacts` | Government POC database from HigherGov. |
| [`ingest_federal_hierarchy`](dashboard/src/app/api/cron/ingest_federal_hierarchy/route.ts) | `30 3 1 * *` (monthly) | api.sam.gov Federal Hierarchy | `federal_hierarchy` | Snapshot of agency org charts. |
| [`monthly_awards`](dashboard/src/app/api/cron/monthly_awards/route.ts) | `0 0 1 * *` (monthly) | api.sam.gov | `opportunities` | Award + Forecast notices (incumbent intel, retention protection). |
| [`download_attachments`](dashboard/src/app/api/cron/download_attachments/route.ts) | `0 11 * * *` | sam.gov | `opportunities` (attachment URLs) | Cache SAM solicitation attachments to Supabase Storage with 30-day TTL. |

## 2 · Scoring & Matching (3 crons)

| Cron | Schedule | Writes | Purpose |
|---|---|---|---|
| [`score_matches`](dashboard/src/app/api/cron/score_matches/route.ts) | `0 3 * * *` | `user_matches`, `opportunities` | Re-scores every user × opportunity pair. 140-point deterministic formula. |
| [`naics_stats_backfill`](dashboard/src/app/api/cron/naics_stats_backfill/route.ts) | `0 3 * * 0` | `naics_market_stats` | Recomputes per-NAICS market aggregates (used in Quick Checker results). |
| [`compute_past_performance_stats`](dashboard/src/app/api/cron/compute_past_performance_stats/route.ts) | `0 8 * * 1` | `past_performance_stats` | Agency × NAICS win-rate aggregates from USAspending. Drives strategic_scoring boost. |

## 3 · Enrichment Orchestrator (1 cron drives 8 sub-tasks)

| Cron | Schedule | Sub-tasks (internal schedules) |
|---|---|---|
| [`enrichment_orchestrator`](dashboard/src/app/api/cron/enrichment_orchestrator/route.ts) | `0,5,10,15,30,40 * * * *` | Dispatches to sub-tasks below when their cron-equivalent UTC minute matches. |

| Sub-task | Effective schedule | Writes |
|---|---|---|
| [`enrich`](dashboard/src/app/api/cron/enrich/route.ts) | daily 05:00 | `opportunities`, `contractors` (description fetch + incumbent UEI link) |
| [`backfill_requirements`](dashboard/src/app/api/cron/backfill_requirements/route.ts) | daily 06:00 | `opportunities` (structured_requirements), `contacts` |
| [`strategic_scoring`](dashboard/src/app/api/cron/strategic_scoring/route.ts) | daily 07:00 | `opportunities.strategic_scoring` (deterministic rules — competition, complexity, PWin tier) |
| [`ai_strategy`](dashboard/src/app/api/cron/ai_strategy/route.ts) | every 4h at :15 | `opportunities.ai_win_strategy` (gpt-4o-mini, 40 opps/run) |
| [`bulk_enrich_descriptions`](dashboard/src/app/api/cron/bulk_enrich_descriptions/route.ts) | 10/40 past every hour 01-23 | `opportunities`, `user_matches` |
| [`bulk_enrich_ai`](dashboard/src/app/api/cron/bulk_enrich_ai/route.ts) | every :00/:30 | `opportunities`, `user_matches` |
| [`deep_enrich`](dashboard/src/app/api/cron/deep_enrich/route.ts) | every 4h at :00 | `opportunities` (Mistral OCR pipeline for descriptions/attachments) |
| [`enrich_contractors_usaspending`](dashboard/src/app/api/cron/enrich_contractors_usaspending/route.ts) | daily 06:30 | `contractors` (federal_awards_count, agency_relationships, last_award_date) |

**Why one orchestrator instead of 8 separate crons?** Pro-plan ceiling is 40. Consolidating these freed 7 slots. The orchestrator checks UTC time and only fires the sub-tasks whose original cron expression matches "now", in parallel with `Promise.allSettled`.

## 4 · Backlinks / SEO Outreach Orchestrator (1 cron drives 5 sub-agents)

| Cron | Schedule | Sub-agents |
|---|---|---|
| [`backlinks_orchestrator`](dashboard/src/app/api/cron/backlinks_orchestrator/route.ts) | `0 6 * * *` | Dispatches to sub-agents by UTC day-of-week. |

| Day | Agents fired |
|---|---|
| Mon | `prospect_discovery`, `contact_enrichment`, `link_monitor`, `disavow_generator` |
| Tue–Fri | `contact_enrichment`, `outreach_drafter` |
| Sat/Sun | (none — lets reply rates normalize) |

| Sub-agent | Writes |
|---|---|
| [`backlink_prospect_discovery`](dashboard/src/app/api/cron/backlink_prospect_discovery/route.ts) | `backlink_prospects` |
| [`backlink_contact_enrichment`](dashboard/src/app/api/cron/backlink_contact_enrichment/route.ts) | `backlink_contacts`, `backlink_prospects` |
| [`backlink_outreach_drafter`](dashboard/src/app/api/cron/backlink_outreach_drafter/route.ts) | `backlink_contacts`, `backlink_outreach`, `backlink_prospects` |
| [`backlink_link_monitor`](dashboard/src/app/api/cron/backlink_link_monitor/route.ts) | `backlink_monitor` |
| [`backlink_disavow`](dashboard/src/app/api/cron/backlink_disavow/route.ts) | (read-only — generates disavow file artifacts) |

## 5 · Apollo & USASpending Contractor Enrichment (3 crons)

| Cron | Schedule | Writes |
|---|---|---|
| [`enrich_apollo_contractors`](dashboard/src/app/api/cron/enrich_apollo_contractors/route.ts) | `30 */2 * * *` (12×/day) | `contractors`, `opportunities` |
| [`enrich_apollo`](dashboard/src/app/api/cron/enrich_apollo/route.ts) | _Not in vercel.json — admin-triggered only._ Likely duplicate of above. | `contractors` |
| [`enrich_gov_contacts_apollo`](dashboard/src/app/api/cron/enrich_gov_contacts_apollo/route.ts) | `0 8 * * *` | `government_contacts` |

**Audit note:** `enrich_apollo` and `enrich_apollo_contractors` both write to `contractors` — review whether `enrich_apollo` can be deleted, or whether both serve distinct contractor pools.

## 6 · Email & User Notifications (5 crons)

| Cron | Schedule | Trigger condition | Email type |
|---|---|---|---|
| [`notify_matches`](dashboard/src/app/api/cron/notify_matches/route.ts) | `0 10 * * *` | New HOT/WARM matches since last digest | Opportunity-alert digest |
| [`trial_reminders`](dashboard/src/app/api/cron/trial_reminders/route.ts) | `0 13 * * *` | Trial ends within 3 days | Trial-expiring warning |
| [`process_scheduled_emails`](dashboard/src/app/api/cron/process_scheduled_emails/route.ts) | `0 14 * * *` | `scheduled_emails.scheduled_for <= now` | Any drip/follow-up sequence |
| [`market_watch_digest`](dashboard/src/app/api/cron/market_watch_digest/route.ts) | `0 9 * * 0` (weekly Sun) | Saved searches in `market_watch_searches` | Weekly market-watch digest |
| [`outreach_send`](dashboard/src/app/api/cron/outreach_send/route.ts) | `0 14 * * 1-5` (weekdays only) | Approved prospects in `outreach_prospects` | Outreach sequence (3-step drip) |

## 7 · Prospect Pipeline (2 crons)

| Cron | Schedule | Writes |
|---|---|---|
| [`discover_new_prospects`](dashboard/src/app/api/cron/discover_new_prospects/route.ts) | `30 5 * * *` | `outreach_prospects` (newly SAM-registered SMBs) |
| [`enrich_prospects`](dashboard/src/app/api/cron/enrich_prospects/route.ts) | `0 7 * * *` | `outreach_prospects` (website crawl → contact email + leadership) |

## 8 · Intelligence & Tracking (8 crons)

| Cron | Schedule | Writes | Purpose |
|---|---|---|---|
| [`ingest_fpds_awards`](dashboard/src/app/api/cron/ingest_fpds_awards/route.ts) | `0 4 * * 0` (weekly Sun) | `fpds_awards`, `contractors` | Federal Procurement Data System awards history. |
| [`ingest_subawards`](dashboard/src/app/api/cron/ingest_subawards/route.ts) | `0 6 * * 4` (weekly Thu) | `subaward_edges` | USASpending sub-awards (prime→sub teaming graph). |
| [`ingest_gsa_schedule`](dashboard/src/app/api/cron/ingest_gsa_schedule/route.ts) | `0 5 * * 0` (weekly Sun) | `gsa_schedule_holders` | GSA MAS contract holders by SIN. |
| [`ingest_gsa_elibrary`](dashboard/src/app/api/cron/ingest_gsa_elibrary/route.ts) | `0 10 * * 3` (weekly Wed) | `gsa_schedule_holders`, `contractors` | eLibrary scrape: which contractors hold GSA schedules. |
| [`ingest_calc`](dashboard/src/app/api/cron/ingest_calc/route.ts) | `30 4 * * 0` (weekly Sun) | `labor_rates` | GSA CALC labor-category ceiling rates. |
| [`ingest_dol_wage_determinations`](dashboard/src/app/api/cron/ingest_dol_wage_determinations/route.ts) | `0 9 * * 2` (weekly Tue) | `wage_determinations` | DoL SCA/DBA wage determinations from SAM.gov SGS API. |
| [`ingest_sec_filings_primes`](dashboard/src/app/api/cron/ingest_sec_filings_primes/route.ts) | `0 11 * * 4` (weekly Thu) | `sec_prime_filings` | SEC EDGAR 10-K/Q/8-K filings for tracked top-tier primes. |
| [`forecast_change_detection`](dashboard/src/app/api/cron/forecast_change_detection/route.ts) | `30 6 * * *` | `agency_forecast_changes`, `agency_forecast_sources` | Daily diff of agency procurement forecasts (VA/DoD/GSA/DOE/DHS). |

## 9 · Other (3 crons)

| Cron | Schedule | Purpose |
|---|---|---|
| [`db_cleanup`](dashboard/src/app/api/cron/db_cleanup/route.ts) | `0 4 * * 0` (weekly Sun) | Lifecycle management: archive expired opps, retention protection |
| [`competitor_monitor`](dashboard/src/app/api/cron/competitor_monitor/route.ts) | `0 7 * * 0` (weekly Sun) | Re-crawl client-tracked competitor websites for changes |
| [`recompete_scan`](dashboard/src/app/api/cron/recompete_scan/route.ts) | `0 5 * * 2` (weekly Tue) | Identify 3-18 month recompete candidates from USAspending |
| [`sync_govtribe_activity`](dashboard/src/app/api/cron/sync_govtribe_activity/route.ts) | `0 13 * * *` | Pre-warm GovTribe MCP cache for deadline-soon opps |
| [`publish_next_blog`](dashboard/src/app/api/cron/publish_next_blog/route.ts) | `0 14 * * 1` (weekly Mon) | **NEW.** Auto-publish next post from `website/blog-topics.json` via GitHub API (gpt-4o-mini drafts, commits layout.tsx + page.tsx with full JSON-LD). |

## Webhook-triggered handlers (not in vercel.json)

| Handler | Trigger |
|---|---|
| [`analyze_match_attachments`](dashboard/src/app/api/cron/analyze_match_attachments/route.ts) | Admin button on opportunity detail. 1 opp × 1 attachment per call (Mistral OCR). |
| [`voice_brief_process`](dashboard/src/app/api/cron/voice_brief_process/route.ts) | User uploads voice brief; triggered from capability-statement page. |
| [`beta_deadline`](dashboard/src/app/api/cron/beta_deadline/route.ts) | Hardcoded to May 1/5/8, 2026 — **DEPRECATED, those dates have passed.** Delete or repurpose. |

## Externally-run crons (NOT in vercel.json)

Cron entries that show up in the `cron_runs` table but **do not appear** in `dashboard/vercel.json`. They are triggered from the Hostinger VPS systemd timers (see [`reference_hostinger_vps.md`](reference_hostinger_vps.md) and [`reference_vps_cron_pattern.md`](reference_vps_cron_pattern.md)) hitting the HTTP route with `Authorization: Bearer $CRON_SECRET`. They will continue to land rows in `cron_runs` even though `vercel.json` doesn't reference them — that's expected.

**Why offload to the VPS?** Vercel Pro caps us at 40 cron entries and we are at 40. Anything heavy or low-frequency that doesn't justify a Vercel slot lives on the VPS instead.

| Cron route | Schedule (VPS timer) | Why it's on the VPS |
|---|---|---|
| [`compute_past_performance_stats`](dashboard/src/app/api/cron/compute_past_performance_stats/route.ts) | weekly Mon 08:00 UTC | Heavy USAspending aggregate that doesn't need to compete for a Vercel slot. |
| [`sync_govtribe_activity`](dashboard/src/app/api/cron/sync_govtribe_activity/route.ts) | daily 13:00 UTC | Pre-warm GovTribe MCP cache for deadline-soon opps. Low-frequency; not worth a Vercel slot. |

If you see `compute_past_performance_stats` or `sync_govtribe_activity` rows in `cron_runs` and they're _not_ in `vercel.json`, **that's not a bug — that's the VPS timer firing.** To find the systemd unit on the VPS:

```bash
ssh -i ~/.ssh/cp_vps root@srv1113360.hstgr.cloud
systemctl list-timers | grep -E 'past_performance|govtribe'
journalctl -u <unit>.service --since '24h ago'
```

## How to know if a cron is healthy

Hit the per-cron status dashboard at **[`/admin/health/crons`](dashboard/src/app/(admin)/admin/health/crons/page.tsx)**. Reads from `cron_runs` directly. Each row shows:

- **Last run** (UTC + relative)
- **Last status** (`success` / `error` / `running`)
- **Last error message** (truncated)
- **7-day success rate** and **avg duration**
- **Schedule source** (vercel.json / VPS / orchestrator sub-task / webhook)

A cron is considered **unhealthy** if any of these are true:

1. No successful run within `2 × expected interval` (e.g. a daily cron with no green run in 48h).
2. Three consecutive failures.
3. Last run had `status='running'` and started more than the route's `maxDuration` ago — likely a stuck/timed-out invocation that the reaper hasn't swept yet.

The reaper itself runs inside [`/api/cron/self_heal`](dashboard/src/app/api/cron/self_heal/route.ts) every :30 — it marks any `running` row older than 15 min as `error` so the dashboard reflects reality.

For the raw view, query the table directly:

```sql
select cron_name, status, started_at, duration_ms, error
from cron_runs
order by started_at desc
limit 100;
```

## Recent changes (2026-05-22)

- **All 30 scheduled handlers + both orchestrators migrated to `guardCron`** from [`src/lib/cron-auth.ts`](dashboard/src/lib/cron-auth.ts). Replaces the prior fail-open pattern (`if (!process.env.CRON_SECRET) return true`) that would silently expose every endpoint if the env var got unset in prod. New helper is **fail-closed in production, dev-friendly locally**.
- **Schedule collision fixed**: `ingest_rss` moved from 02:30 → 02:45 UTC (was colliding with `ingest_grants`).
- **`publish_next_blog` added**: weekly Mon 14:00 UTC. Auto-publishes the next unpublished topic from `website/blog-topics.json` via GitHub Contents API. Requires `GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME`, `GITHUB_TOKEN`, optionally `GITHUB_WEBSITE_PATH` (defaults to `website`) and `GITHUB_DEFAULT_BRANCH` (defaults to `main`).

## Open audit items (user decision needed)

1. **`beta_deadline`** hardcoded to past dates — delete or repurpose for evergreen trial-reminder emails.
2. **`enrichment_orchestrator` runs 6×/hour** (`0,5,10,15,30,40 * * * *`) — total invocations 144/day. Worth profiling to confirm Vercel function cost is justified.
3. **Decide whether more low-frequency Vercel crons should move to the VPS** to claw back slots because `vercel.json` is at the 40-cron ceiling. Candidates: weekly ingest jobs (`ingest_fpds_awards`, `ingest_subawards`, `ingest_calc`, `ingest_sec_filings_primes`).

### Resolved by the 2026-06 audit (no longer open)

- ~~`enrich_apollo` vs `enrich_apollo_contractors` duplicate~~ — Apollo path now wired through `enrich_apollo_contractors` only; standalone `enrich_apollo` route kept as admin-triggered manual fallback (not on a schedule).
- ~~Cron telemetry was patchy / inconsistent~~ — every scheduled handler is now wrapped with `withCronTelemetry()` from [`src/lib/cron-telemetry.ts`](dashboard/src/lib/cron-telemetry.ts), writing a row per invocation to `cron_runs`.
- ~~Stuck `running` rows never resolved~~ — `self_heal` cron sweeps `running` rows older than 15 min every :30 and flips them to `error` so the health dashboard reflects reality.
- ~~No per-cron health UI~~ — `/admin/health/crons` now reads `cron_runs` and surfaces last-run / last-status / 7-day success rate / avg duration per route.

## Cron route inventory vs vercel.json

There are **86 route files** under [`dashboard/src/app/api/cron/`](dashboard/src/app/api/cron/) but only **40 entries** in [`dashboard/vercel.json`](dashboard/vercel.json). The delta is intentional. Every route in the route directory falls into one of these buckets:

- **Vercel-scheduled** — listed in `vercel.json` (40 routes).
- **Orchestrator sub-task** — only invoked by `enrichment_orchestrator` or `backlinks_orchestrator` (e.g. `enrich`, `backfill_requirements`, `strategic_scoring`, `ai_strategy`, `deep_enrich`, `bulk_enrich_ai`, `bulk_enrich_descriptions`, `enrich_contractors_usaspending`, all `backlink_*` sub-agents).
- **Externally-run (VPS)** — see the section above (`compute_past_performance_stats`, `sync_govtribe_activity`).
- **Webhook / admin-triggered** — only fires from a UI button or background job (e.g. `analyze_match_attachments`, `voice_brief_process`, `enrich_apollo`, `enrich_la_ramp`, `enqueue_backfill`, `discover_bonfire_tenants`, `enrich_sled_descriptions`, `ingest_bonfire_json`, `ingest_opengov`, `ingest_tx_esbd`, `backfill_naics`, `backfill_extracted_contacts`, `backfill_structured_requirements`, `cleanup_contractor_pages`, `discover_contractor_backlink_prospects`, `publish_contractor_pages`, `refresh_contractor_pages`, `send_backlink_outreach`).
- **Deprecated** — `beta_deadline` (see above). Safe to delete after the next admin-panel review.

Before deleting a route that isn't in `vercel.json`, **grep the repo for the path** (`grep -r "/api/cron/<name>"`) and also check the VPS systemd timers — orchestrator dispatches do not import the sub-route file directly, they hit the HTTP path.

For a generated read-only inventory, run:

```bash
node tools/45_cron_inventory.mjs
node tools/45_cron_inventory.mjs --json
```
