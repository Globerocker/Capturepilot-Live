# SOP: Delivery Payload Schemas (Internal & Contractor Portals)

## 1. Goal
Provide a strict, standardized JSON contract for any external front-end (e.g. Next.js dashboard) connecting to the Supabase backend. The backend must structure the data into these exact schemas to decouple logic from presentation.

## 2. Internal Portal (Agency Dashboard) Payload
```json
{
  "summary": {
    "total_opportunities_ingested": 1542,
    "hot_matches_generated": 14,
    "recent_outcomes_logged": 3
  },
  "high_maturity_opportunities": [
    {
      "notice_id": "SAM-9901-A",
      "agency": "Department of Defense",
      "maturity_score": 0.85,
      "competition_index": 2.1,
      "deadline": "2026-03-10T00:00:00Z"
    }
  ],
  "intelligence_briefings": [
    {
      "week_start": "2026-02-23",
      "top_performing_naics": "541512",
      "win_rate": "23.4%"
    }
  ]
}
```

## 3. Contractor Portal Payload
```json
{
  "contractor": {
    "id": "uuid-1234",
    "name": "Acme Cyber LLC",
    "alerts_active": true
  },
  "dashboard": {
    "matched_opportunities": [
       {
         "notice_id": "SAM-9901-A",
         "title": "Cloud Infrastructure Modernization",
         "label": "HOT",
         "days_to_deadline": 14,
         "score": 0.8250,
         "why_matched": {
           "naics_match": 1,
           "setaside_match": 1,
           "geo_match": 0
         },
         "suggested_action": "Upload Capabilities Statement to match Sources Sought.",
         "email_drafts_available": 3
       }
    ]
  }
}
```

## 4. Constraint
No UI code is written in Python. Python scripts push data to `matches` and `agency_intelligence_logs`; the Next.js API layer will query Supabase and shape the responses directly into these structs.
