# SOP: Agency Intelligence Report Generation (`tools/3_generate_intelligence.py`)

## 1. Goal
Analyze weekly captured outcomes and match densities to produce a structured intelligence report logging agency behavior patterns and win rates by score bands.

## 2. Invariants & Rules
*   **Source of Truth:** Aggregated metrics from `public.capture_outcomes` and `public.matches`.
*   **Data Destination:** `public.agency_intelligence_logs`. Option to email via Gemini Flash Draft Engine.
*   **AI Usage:** Gemini Flash may be passed the calculated summary statistics to draft a narrative intelligence brief. AI **cannot** perform the statistical calculations or write to the primary tables.

## 3. Analysis Logic
1.  **Win Rate by Score Band:**
    SELECT count(won), classification FROM capture_outcomes JOIN matches ON... GROUP BY classification
2.  **Top Agencies:**
    Count highest volume of 'r' and 'p' notices per agency over the last 14 days.
3.  **Certification Performance:**
    Calculate which set-aside types yielded the highest margin_estimate.
4.  **Generative AI Summary Draft (Strategy 4)**
    Pass the JSON resulting from Steps 1-3 to Gemini to produce "Agency Intelligence Weekly Report" narrative.

## 4. Execution Requirement
Run weekly via cron/trigger.
