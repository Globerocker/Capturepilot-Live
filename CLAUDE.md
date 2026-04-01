# Caturepilot 2.0 — Strategic Capture Intelligence Engine

## Stack
- **Frontend**: Next.js 16.1.6 (Turbopack), React, Tailwind CSS, TypeScript
- **Backend**: Supabase (Postgres), Vercel Serverless Functions
- **Python Tools**: SAM.gov ingestion, scoring, enrichment (in `/tools/`)
- **APIs**: SAM.gov, USASpending, Apollo.io, Resend, OpenAI

## Build & Run
```
cd dashboard && npm run dev          # Dev server (port 3000)
cd dashboard && npm run build        # Production build
cd dashboard && npm run lint         # Lint check
```

## Deploy
Push to `captiorpilot` and `live` remotes → Vercel auto-deploys from `dashboard/` subdirectory.
```
git push captiorpilot main && git push live main && git push globerocker main
```

## Key Rules
- Icons ONLY from `lucide-react` — never add icon libraries
- `"use client"` for all interactive pages
- Supabase joins return objects not arrays — cast with `as any[]` if needed
- SAM API key via `X-Api-Key` header (NOT URL params)
- Apollo: use `mixed_companies/search` (free tier), NOT `mixed_people/search`
- Never commit `.env`, `.env.local`, `.mcp.json`

## Architecture
- `/dashboard/src/app/(public)/` — Public pages (login, signup, check, admin)
- `/dashboard/src/app/(dashboard)/` — Authenticated SaaS dashboard
- `/dashboard/src/app/(portal)/` — Consulting client portal (light view)
- `/dashboard/src/app/(onboarding)/` — Onboarding flow
- `/dashboard/src/app/api/` — API routes (cron, admin, analyze, email)
- `/dashboard/src/lib/` — Shared libs (crawler, scoring, email, supabase)
- `/tools/` — Python pipeline scripts (numbered 1-20)
- `/dashboard/supabase/migrations/` — DB migrations (001-012)

## User Types
- `self_service` — SaaS users (full dashboard, self-onboarding)
- `consulting` — Managed clients (portal view, admin-onboarded, skip onboarding)
- `admin` — Internal team

## Cron Schedule (UTC)
- 02:00 daily: `ingest_sam` — fetch new SAM.gov opportunities
- 03:00 daily: `score_matches` — score opportunities for all users
- 04:00 weekly Sun: `db_cleanup` — lifecycle management
- 05:00 daily: `enrich` — contractor enrichment orchestrator
- 06:00 daily: `backfill_requirements` — extract requirements from raw_json
- 1st monthly: `monthly_awards` — fetch award + forecast notices

## Database (Supabase)
- `opportunities` — 37K+ federal opportunities with lifecycle status
- `user_profiles` — users with account_type (self_service/consulting/admin)
- `user_matches` — per-user opportunity scoring
- `client_tasks` — consulting client task management
- `client_documents` — document uploads (storage: `client-docs` bucket)
- `client_competitors` — competitor tracking per client
- `client_activity_log` — admin action audit trail
- `contractors` — 80K SAM.gov registered entities
- `contacts` — 91K SAM.gov opportunity contacts
