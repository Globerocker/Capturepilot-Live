# CapturePilot 2.0 - Master Handoff Document

## 1. Project Overview & Core Idea 🎯

CapturePilot 2.0 is a deterministic, AI-assisted **Sales Intelligence Engine** for federal contracting.
The primary goal is to shift from a "dumb data aggregator" to a proactive capture system that:

1. Detects federal opportunities via SAM.gov based on strict filtering criteria.
2. Matches these opportunities against a vetted pool of federal contractors.
3. Scores matches using a rigorous **100-Point Deterministic Algorithm**.
4. Generates tactical, ready-to-send B.L.A.S.T outreach drafts.
5. Surfaces all insights in a highly structured, premium "Sales Dossier" UI.

## 2. Technical Stack 🛠

- **Frontend/Backend**: Next.js 14 (App Router) with TypeScript, TailwindCSS, Lucide React.
- **Database**: Supabase (PostgreSQL).
- **Automation/Ingestion**: Python 3 scripts (`/tools` directory).
- **Core Architecture Model**: A.N.T (Architecture -> Navigation -> Tools). Changes to logic happen in Python atomic scripts first and are governed by `gemini.md`.

## 3. Database Schema & Core Tables 📊

We rely on JSONB columns for future-proof, deep data storage.

- `opportunities`: Core federal contracts. JSONB fields: `structured_requirements`, `strategic_scoring`, `ai_win_strategy`.
- `contractors`: Vetted matching candidates. JSONB fields: `capacity_signals`, `ownership`.
- `matches`: The intersection of Op + Contractor. JSONB fields: `score_breakdown` (NAICS, Geo, Capacity, Inactivity, Competition).
- `capture_outcomes`: Pipeline tracking for sales success/losses.

## 4. The 100-Point Match Algorithm 💯

Located in `tools/2_score_matches.py`. It guarantees a minimum of 15 matches per opportunity.

1. **NAICS Fit (0-30)**: Exact Match (30), Related (20), Weak (10).
2. **Geographic Fit (0-15)**: Calculated via Haversine distance (Lat/Lon) or State matching.
3. **Capacity Score (0-20)**: Checks if contractor size meets requirements.
4. **Federal Inactivity Score (0-20)**: Prioritizes active but under-awarded contractors.
5. **Competition Adjustment (0-15)**: Adjusts based on historical market saturation.

## 5. Quick Filters & SAM Ingestion 📥

Located in `tools/1_ingest_sam.py`. Ingests via the SAM.gov API using hardcoded strict filters:

- **NAICS**: `561720, 561730, 238210, 238220, 236220`
- **Notice Types**: `p` (Presolicitation/Combined Synopsis), `o` (Solicitation)

## 6. Frontend Sales Dossier Pages 💻

- **`opportunities/[id]/page.tsx`**: Renders Opportunity details, requirements, and strategic scoring.
- **`contractors/[id]/page.tsx`**: Renders Contractor profile, capacity, and federal awards history.
- **`matches/[id]/page.tsx`**: Shows the exact math breakdown of the 100-point score and offers AI-generated B.L.A.S.T email drafts.

## 7. Outstanding Tasks & Next Steps 🚀

1. **Deployment & Environment Variables**: Ensure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, and `SAM_API_KEY` are all set in the production environment (Vercel).
2. **Cron Jobs / Automation**: The Python ingestion and scoring scripts currently run manually via `python3 tools/1_ingest_sam.py` and `python3 tools/2_score_matches.py`. These need to be attached to daily GitHub Actions or Vercel Cron.
3. **Capture CRM Extension**: Further build out the UI for managing `capture_outcomes` to track actual sales calls, follow-ups, and pipeline conversion rates.
4. **Performance Optimization**: Ensure that the Haversine math algorithm remains fast as the DB scales past 10,000 contractors. Add database indexes where needed.

> **Note to Claude Code**: All foundational logic is documented in `gemini.md`. Do not rely on LLM intuition to change the 100-point algorithm. Rely entirely on deterministic math.
