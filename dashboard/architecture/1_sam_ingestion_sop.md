# SOP: SAM.gov Opportunity Ingestion (`tools/1_ingest_sam.py`)

## 1. Goal
Fetch, deduplicate, and store federal opportunities from SAM.gov based on a deterministic criteria prioritizing active solicitations and sources sought.

## 2. Invariants & Rules
*   **Source of Truth:** SAM.gov API v2.
*   **Data Destination:** `public.opportunities` in Supabase.
*   **AI Usage:** NONE during ingestion.
*   **Performance:** Must use batched inserts to Supabase.

## 3. Ingestion Logic
1.  **Timeframe Calculation:**
    *   **Backfill mode:** `postedFrom` = Today - 90 days.
    *   **Daily Sync mode:** `postedFrom` = Today - 2 days.
2.  **API Pagination:**
    *   Set `limit=1000`.
    *   Loop through offsets until no more records are returned.
3.  **Notice Type Prioritization (The `ptype` loop):**
    *   Execute API calls in the following order:
        1.  `r` (Sources Sought)
        2.  `p` (Presolicitation)
        3.  `o` (Solicitation)
4.  **Field Normalization:**
    *   Extract `noticeId` -> `notice_id`
    *   Extract `title` -> `title`
    *   Extract `department/subtier` -> `agency`
    *   Extract `naicsCode` -> `naics_code`
    *   Extract `typeOfSetAsideDescription` -> `set_aside_code`
    *   Store the entire original JSON payload in `raw_json`.
5.  **Database Upsert:**
    *   Upsert into `opportunities` using `notice_id` as the conflict target. Update existing columns if a match is found (to capture amendments).

## 4. Error Handling
*   If the SAM.gov API returns `429 Too Many Requests`, sleep for 10 seconds and retry.
*   Log all failures to `progress.md`.
*   DO NOT halt the entire script for a single malformed JSON record; skip and continue the batch.
