# Project Constitution

## Strategic Capture Intelligence Engine - Identity

* **Role**: System Pilot (deterministic, self-healing).
* **Primary Mission**:
  1. Detect early-stage federal opportunities
  2. Match strategically aligned contractors
  3. Score and prioritize deterministically
  4. Track performance outcomes
  5. Generate actionable intelligence
  6. Continuously evolve via controlled feedback (no random auto-updates to logic).
* **Guiding Principles**:
  * Reliability > AI.
  * Data > speculation.
  * Determinism > automation hype.
  * Evolution via memory, not randomness.

## Data Schemas (Source of Truth)

### `opportunities`

```json
{
  "id": "uuid",
  "notice_id": "string (unique)",
  "title": "string",
  "description": "text",
  "agency": "string",
  "department": "string",
  "naics_code": "string[]",
  "set_aside_code": "string",
  "set_aside_types": {
    "total_small_business": "boolean",
    "partial_small_business": "boolean",
    "8a": "boolean",
    "sdvosb": "boolean",
    "hubzone": "boolean",
    "full_and_open": "boolean"
  },
  "estimated_value": "numeric",
  "posted_date": "timestamp",
  "response_deadline": "timestamp",
  "place_of_performance": {
    "city": "string",
    "state": "string",
    "zip": "string",
    "country": "string"
  },
  "structured_requirements": {
    "min_workforce": "numeric",
    "equipment_req": "string",
    "bonding_req": "string (Yes|No|Not Specified)",
    "years_experience": "numeric",
    "certifications": "string",
    "performance_period": "string",
    "eval_criteria_summary": "string"
  },
  "strategic_scoring": {
    "est_competition_level": "string (Low|Medium|High)",
    "complexity_level": "string (Low|Medium|High)",
    "win_prob_tier": "string (High|Medium|Low)"
  },
  "ai_win_strategy": {
    "summary": "string",
    "key_risks": "string[]",
    "sales_angle": "string",
    "recommended_profile": "string"
  },
  "priority_flag": "boolean",
  "raw_json": "jsonb",
  "created_at": "timestamp"
}
```

### `contractors`

```json
{
  "id": "uuid",
  "company_name": "string",
  "website": "string",
  "email": "string",
  "main_phone": "string",
  "direct_phone": "string",
  "hq_address": "string",
  "city": "string",
  "state": "string",
  "years_in_business": "numeric",
  "employee_count": "numeric",
  "revenue": "numeric",
  "service_radius_miles": "numeric",
  "sam_registered": "string (Yes|No|Unknown)",
  "sam_registration_date": "timestamp",
  "total_federal_awards": "numeric",
  "total_award_volume": "numeric",
  "last_award_date": "timestamp",
  "federal_activity_status": "string (Active|Inactive 12+ Months|Never Awarded)",
  "capacity_signals": {
    "bonded": "string (Yes|No|Unknown)",
    "municipal_exp": "boolean",
    "fleet": "boolean",
    "equipment": "string",
    "certifications": "string",
    "usp_differentiator": "string"
  },
  "ownership": {
    "owner_name": "string",
    "owner_title": "string",
    "owner_linkedin": "string",
    "company_linkedin": "string"
  },
  "naics_codes": "string[]",
  "cage_code": "string",
  "uei": "string",
  "raw_json": "jsonb",
  "created_at": "timestamp"
}
```

### `matches` (Opportunity-Specific Context)

```json
{
  "id": "uuid",
  "opportunity_id": "uuid (fk)",
  "contractor_id": "uuid (fk)",
  "score": "numeric",
  "classification": "string (HOT | WARM | COLD)",
  "score_breakdown": {
    "naics_fit": "numeric (0-30)",
    "geo_fit": "numeric (0-15)",
    "capacity": "numeric (0-20)",
    "federal_inactivity": "numeric (0-20)",
    "competition_adjustment": "numeric (0-15)",
    "total_score": "numeric (0-100)"
  },
  "distance_miles": "numeric",
  "created_at": "timestamp"
}
```

### `capture_outcomes` (Sales Tracking)

```json
{
  "opportunity_id": "uuid (fk)",
  "contractor_id": "uuid (fk)",
  "submitted": "boolean",
  "won": "boolean",
  "loss_reason": "string",
  "bid_hours_spent": "numeric",
  "margin_estimate": "numeric",
  "call_status": "string (Not Contacted|Left Voicemail|SMS Sent|Interested|Not Interested|Call Back Later|Do Not Contact)",
  "follow_up_date": "timestamp",
  "sales_notes": "text",
  "internal_notes": "text",
  "closed_date": "timestamp"
}
```

## 100-Point Match Logic (The Algorithm)

* **Rule**: System MUST find exactly 50 candidates, score them, and display strictly **minimum 15 top contractors** (5 good, 5 backup, 5 hidden gems). If <15 are found, the system MUST automatically expand radius, check related NAICS, and prioritize inactive contractors until 15 are found.
  
1. **NAICS Fit (0-30)**
   * Exact Match = 30
   * Related = 20
   * Weak = 10
2. **Geographic Fit (0-15)**
   * < 50 miles = 15
   * 50 - 150 miles = 10
   * 150 - 300 miles = 5
3. **Capacity Score (0-20)**
   * Employees >= Required = 20
   * Unknown employees = 10
   * Below Required = 5
4. **Federal Inactivity Score (0-20)** *(Targets companies that need federal access help)*
   * Never Awarded = 20
   * No awards in 24 months = 15
   * Active bidder = 5
5. **Competition Adjustment (0-15)**
   * Low historical bidders = 15
   * Medium = 10
   * High = 5

* **TOTAL = 100** (Sorted descending). Auto-generated Structural Summary: *"Operates within X miles, Y employees, no federal awards in Z months, meets minimum workforce requirement, bonded."*

### `agency_intelligence_logs`

```json
{
  "week_start": "date",
  "top_naics": "jsonb",
  "top_agencies": "jsonb",
  "certification_performance": "jsonb",
  "win_rate_by_score_band": "jsonb",
  "competition_trends": "jsonb",
  "generated_at": "timestamp"
}
```

## Behavioral Rules & AI Constraints

* **AI Usage**: Strictly limited to summaries, email drafts, and intelligence narrative reports (e.g., Gemini Flash or Claude fallback).
* **AI Prohibition**: AI must NEVER modify business logic, scoring weights, classification thresholds, or automatically delete data.
* **Evolution**: The system identifies patterns and suggests changes. All evolution requires manual confirmation.
* **Performant Code Rules**:
  * Use batched inserts.
  * No blocking AI calls in main loops.
  * Use indexed queries (GIN indexes for arrays).
  * Pre-calculate scores; Cache NAICS mapping.

## Deliverable Payload (Portals)

1. **Internal Portal**: Dashboard (ops counts, HOT matches, backfill trigger, intelligence), Opportunity Details.
2. **Contractor Portal**: Matched ops, HOT/WARM labels, certification leverage, suggestion actions.
3. **Weekly Intelligence Report**: Win rates, agency behaviors, density shifts.

## Architectural Invariants (A.N.T.)

* **1. Architecture (`architecture/`)**: Technical SOPs. Update SOPs before updating code.
* **2. Navigation**: Logic routing between SOPs and Tools. No complex tasks directly, call atomic tools instead.
* **3. Tools (`tools/`)**: Deterministic Python scripts. Atomic and testable.
* **Environments**: Variables/tokens stored in `.env`. Use `.tmp/` for intermediates.
* **Self-Annealing**: Analyze stack trace -> Patch Tool -> Test -> Update Architecture.
* `gemini.md` is law. Planning files are memory.

## Trigger Pipeline (Execution Schedule)

* **Daily at 02:00 UTC:** Trigger `python tools/1_ingest_sam.py` (Fetches last 2 days of opportunities).
* **Daily at 03:00 UTC:** Trigger `python tools/2_score_matches.py` (Calculates deterministic scores).
* **Daily at 04:00 UTC:** Trigger `python tools/3_generate_email_drafts.py` (Drafts emails for newly generated HOT matches).
* **Weekly (Sunday at 00:00 UTC):** Trigger `python tools/4_log_outcome.py` and Intelligence workflows.

## Maintenance Log (Self-Annealing Record)

*When a Tool fails or an error occurs, the fix MUST be logged here before architecture is modified.*

| Date | Script Failed | Error Detected | Architecture SOP Updated | Fix Deployed |
| :-- | :--- | :--- | :--- | :--- |
| *YYYY-MM-DD* | *script.py* | *Short description* | *sop.md changed* | *Code fix summary* |
