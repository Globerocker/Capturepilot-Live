# SOP: Deterministic Contractor Matching (`tools/2_score_matches.py`)

## 1. Goal
Apply strict matching criteria to connect federal opportunities with eligible contractors based on predefined variables, classifying the matches into action tiers (HOT/WARM/COLD).

## 2. Invariants & Rules
*   **Source of Truth:** Datasets residing in `public.opportunities` and `public.contractors`.
*   **Data Destination:** `public.matches` in Supabase.
*   **AI Usage:** NONE.
*   **Evolution Rule:** The scoring algorithm is hardcoded. Any changes must first be updated in this SOP manual, then the code, avoiding autonomous weight adjustments.

## 3. Scoring Variables (Binary / Fractional)
*   `naics_match`: 1 if Opportunity NAICS is in Contractor NAICS array, else 0.
*   `psc_match`: 1 if PSC aligns (Optional / Future), else 0.
*   `setaside_match`: 1 if Opportunity Set-Aside matches Contractor Certifications (e.g., 8A, SDVOSB), else 0.
*   `geo_match`: 1 if Place of Performance State matches Contractor State, else 0.
*   `contract_value_fit`: Fractional 0.0 to 1.0 (Size standard alignment).
*   `deadline_feasibility`: Fractional 0.0 to 1.0 based on days remaining until response deadline.

## 4. Matching Algorithm
Ensure the Python script adheres strictly to this formula:

`Score = (0.25 * naics_match) + (0.15 * psc_match) + (0.20 * setaside_match) + (0.15 * geo_match) + (0.15 * contract_value_fit) + (0.10 * deadline_feasibility)`

## 5. Classification Thresholds
*   `Score >= 0.70` => **HOT**
*   `Score >= 0.50 AND Score < 0.70` => **WARM**
*   `Score < 0.50` => **COLD**

## 6. Database Execution
*   For each new opportunity, calculate scripts across all contractors.
*   Sort descending by `Score`.
*   Take the Top 10 matches per Opportunity.
*   Insert into `public.matches` detailing the `score_breakdown` JSON payload.
