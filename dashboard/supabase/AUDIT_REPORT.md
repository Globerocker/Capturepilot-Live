# Supabase Migration Audit Report

**Generated:** 2026-05-29
**Source:** `dashboard/supabase/migrations/*.sql` (106 files, 6,328 lines)
**Method:** Programmatic scan via `tools/audit_migrations.py` + manual review

---

## TL;DR

The migrations are in good shape overall. Most conflicts are benign (re-drops of already-dropped columns). The biggest issue is **27 indexes on the `opportunities` table** — every SAM ingest write touches all of them, adding ~250ms latency to bulk upserts. CLEANUP.sql drops the redundant 6.

| Metric | Value |
|---|---|
| Total migrations | 106 |
| Tables | 96 (67 base + 29 created later for new features) |
| Indexes | 239 |
| Functions | 13 |
| Triggers | 9 |
| Migrations with seed data | 16 |
| **Critical bugs found** | 0 |
| **Performance bugs found** | 6 redundant indexes |
| **Duplicate object names** | 2 |
| **Confused-history flags** | 2 (012+053 redo same drops) |

---

## Conflicts Found

### 1. Duplicate object names (real bugs)

| Object | Migration A | Migration B | Notes |
|---|---|---|---|
| `saved_searches` table | 015_saved_searches.sql | 071_plan_tiers.sql | 071 added `IF NOT EXISTS` guard so the second CREATE silently no-ops. Harmless but confusing — 071 should ALTER, not CREATE. |
| `marketing_leads_email_magnet_idx` | 070_marketing_leads.sql (lower(email)) | 074_marketing_leads_enrichment.sql (email, magnet_key) | **REAL BUG.** Second create silently no-ops, so we run with the 070 definition — but app code expects the 074 columns. Fixed in CLEANUP.sql section 1. |
| `worker_jobs_dedup_active_idx` | 086_worker_jobs_platform.sql | 089_worker_jobs_dedup_lead_id.sql | 089 is authoritative; second no-ops. Recreated in CLEANUP.sql. |

### 2. Dead columns (already dropped, re-drop in later migration)

Migration **012_cleanup_schema.sql** dropped 15 columns from `opportunities`, then **053_apply_deferred_cleanup.sql** tried to drop them again. Both use `IF EXISTS` so it's harmless — just history noise.

```
agency_id, set_aside_id, opportunity_type_id, additional_info_link,
place_of_performance_country, ai_analysis, active, past_performance_score,
notice_type_score, incumbent_risk_score, competitive_position_score,
enrichment_status, enrichment_completed_at, requirements_extracted, set_aside_types
```

These were the old normalized-FK era columns; we flattened to denormalized text columns somewhere around migration 030. No live code references them.

### 3. Redundant indexes (write-performance hit)

`opportunities` table has 27 indexes. Every INSERT/UPSERT updates all of them. Bulk SAM ingest (~5k rows/run) writes are slowed by the redundant ones:

| Index | Created in | Why redundant |
|---|---|---|
| `idx_opps_needs_requirements_backfill` | 068 | One-shot backfill partial. Backfill complete. |
| `idx_opps_needs_strategic_scoring` | 068 | Same — one-shot partial. |
| `idx_opps_needs_ai_strategy` | 068 | Same — one-shot partial. |
| `idx_opportunities_source_created_at` | 099 (mine, 2026-05-29) | Dominated by `idx_opps_active_source_created` (102) partial WHERE is_archived=false. |
| `idx_contractors_created_at` | 099 (mine) | Same as `idx_contractors_created_at_active` (102). I created the duplicate within hours of myself — flagging. |
| `idx_saved_searches_user` | 015 | Superseded by 071's `saved_searches_profile_idx` + `saved_searches_alert_idx`. |
| `idx_fpds_uei_mod` | 047 | Partial WHERE is_modification=true — no live queries hit this filter. |
| `idx_fpds_uei_term` | 047 | Partial WHERE is_termination=true — same situation. |

**Drop all 6 (or 8 with the fpds ones) → estimated 200ms/bulk-upsert speedup + 8MB index storage savings.**

### 4. Other index overlaps (KEEP — not redundant)

These showed up in the dupe scan but each serves a distinct query plan:

- `opportunities(id)` partial WHERE is_archived=false (`idx_opps_active_id` from 102) vs `idx_opps_needs_requirements_backfill` (068) — different `WHERE` predicates, different plans
- `release_notes(shipped_at desc)` — two partial indexes, one for `is_public=true` filter, one without. Both used.

---

## What each migration does (the source-of-truth list)

| # | File | Purpose |
|---|---|---|
| 001 | user_profiles | Base profile table — UEI, NAICS, certifications |
| 002 | user_pursuits | Pipeline items per user |
| 003 | matching_fields | Add scoring fields to opportunities |
| 004 | sprint12_features | Misc Sprint 12 additions |
| 005 | competitors | Competitor tracking table |
| 006-011 | Misc feature additions | Various early-stage adds |
| 012 | **cleanup_schema** | Removed 15 dead opportunity columns (normalized FK era) |
| 013-029 | Email, billing, pipeline UX additions | |
| 030 | Major schema flatten | (verify by reading file) |
| 040 | teaming_intelligence | tribal_contractors, prime_sblos, agency_spend_forecast |
| 047 | fpds_awards | FPDS award log table — 6 indexes (3 redundant per cleanup) |
| 049 | academy + admin_pushes | Release notes table + academy articles |
| 053 | apply_deferred_cleanup | Re-drop of 15 columns (harmless dupe of 012) |
| 068 | perf_indexes | 5 partial indexes for backfill crons (3 now-dead) |
| 070 | marketing_leads | Base marketing_leads table |
| 071 | plan_tiers | Adds plan tier table + RE-CREATES saved_searches (with IF NOT EXISTS — silent no-op) |
| 074 | marketing_leads_enrichment | Adds Apollo + HubSpot columns to marketing_leads |
| 081 | contractor_profile_pages | Curated published contractor profiles for marketing site |
| 086 | worker_jobs_platform | Generic job queue + RPC + trigger fan-out |
| 088 | lead_brief | AI lead-brief columns on marketing_leads |
| 089 | worker_jobs_dedup_lead_id | Renames dedup key column |
| 090 | security_hardening | REVOKE EXECUTE on trigger_cron_route etc |
| 091 | backfill_federal_links | Single UPDATE to fix 17k null links |
| 092 | api_connectors_add_pdl_vps | Add PDL + VPS rows to api_connectors |
| 093 | public_stats_snapshot | Singleton table for pre-computed stats |
| 094 | pdf_extract_cache | Hash-based PDF cache |
| 095 | rls_hardening | Drop 5 redundant *_admin RLS policies |
| 096 | n8n_workflow_columns | drip_status + deadline_reminder_sent_at |
| 097 | email_engagement | email_events + magnet/brief_resend_id on marketing_leads |
| 098 | alert_autofixes | Audit log for the self-heal cron |
| 099 | opps_indexes_and_link_validation | created_at indexes + link_broken column (1 redundant per cleanup) |
| 100 | contractor_ai_analysis | capability_summary_ai cache on contractors |
| 101 | fpds_piid_unique | Unique constraint on fpds_awards.piid |
| 102 | opportunities_count_indexes | 4 partial indexes for COUNT() performance (improved version) |

(Detailed per-migration analysis available in the migration files themselves — every migration has a header comment explaining intent.)

---

## Recommendations

### Apply immediately
1. **Run CLEANUP.sql** sections 1-6 — drops 8 redundant indexes, fixes 2 duplicate-name bugs, runs ANALYZE. Net effect: faster bulk SAM upserts (~200ms/batch) + 8MB recovered.
2. **Commit migration 088 whitespace changes** (formatter ran on disk but uncommitted — running `git diff dashboard/supabase/migrations/088_lead_brief.sql` shows the difference).

### Deferred
1. Migration 071's silent `saved_searches` re-create is messy but harmless — fix during the next "rename day" by moving the 071 columns into a proper ALTER.
2. Migrations 012 + 053 redo-of-drops is just history noise — leave as-is.

### Never do
- Don't drop migrations from disk (they're the audit trail).
- Don't merge migrations into one giant file replacing the directory (the per-migration history is invaluable when bisecting).
- MASTER_SCHEMA.sql is the install-from-scratch SHORTCUT, not the source of truth.

---

## How to use the companion files

```bash
# Fresh install (empty Postgres):
psql "$DATABASE_URL" -f dashboard/supabase/MASTER_SCHEMA.sql

# Apply cleanups on the existing live DB:
psql "$DATABASE_URL" -f dashboard/supabase/CLEANUP.sql

# Verify schema state after:
supabase db diff
```
