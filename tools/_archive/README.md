# Archived tools (2026-04-22)

These scripts have been superseded by TypeScript cron routes inside
`dashboard/src/app/api/cron/` and are kept only as a historical reference.
None of them are invoked by Vercel or any live process.

| Archived script | Replacement |
|---|---|
| `2_score_matches.py` | `dashboard/src/app/api/cron/score_matches/route.ts` (TS-native, uses `lib/match-scoring.ts`) |
| `3_generate_email_drafts.py` | `dashboard/src/app/api/cron/process_scheduled_emails/route.ts` |
| `4_log_outcome.py` | Not re-implemented — outcome logging lives on `user_pursuits` now |
| `5_award_intelligence.py` | `dashboard/src/app/api/cron/monthly_awards/route.ts` |
| `5_enrich_contractors.py` | `tools/23_enrich_contractors_usaspending.mjs` + `dashboard/src/app/api/cron/enrich_contractors_usaspending/route.ts` |
| `6_attachment_intelligence.py` | `dashboard/src/app/api/cron/deep_enrich/route.ts` |
| `7_discover_contractors.py` | Partial — `dashboard/src/app/api/cron/discover_new_prospects/route.ts` |
| `8_enrich_contacts.py` | `dashboard/src/app/api/cron/enrich_prospects/route.ts` |
| `10_enrich_descriptions.py` / `10_enrichment_orchestrator.py` / `10b_fast_enrich.py` | `dashboard/src/app/api/cron/enrich/route.ts` + `.../deep_enrich/route.ts` |
| `11_backfill_contractors.py` / `11_backfill_from_rawjson.py` | One-shot migrations — data already backfilled in prod |
| `12_usaspending_enrich.py` | `tools/23_enrich_contractors_usaspending.mjs` |
| `13_download_attachments.py` | `dashboard/src/app/api/cron/download_attachments/route.ts` + `deep_enrich` |
| `14_fix_indexes.sql` | Folded into `dashboard/supabase/migrations/052_performance_indexes.sql` |
| `15_ai_win_strategy.py` | `dashboard/src/app/api/cron/ai_strategy/route.ts` |
| `16_backfill_values.py` | `deep_enrich` extracts values from text now |
| `17_analyze_company.py` | Ported 1:1 to `dashboard/src/lib/crawler/` (extractors, config, sitemap, ssrf) |
| `20_backfill_all.py` | Orchestrator no longer needed — TS crons self-schedule |

Do not re-invoke anything in this folder. If the functionality here is needed,
update the TS route instead and let Vercel cron execute it.
