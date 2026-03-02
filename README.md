# CapturePilot V3 - Strategic Intelligence Engine

CapturePilot V3 is a deterministic, AI-assisted **Sales Intelligence Platform** engineered specifically for federal contracting. The platform fundamentally shifts the paradigm from "passive raw data aggregation" to active, predictive capture matching.

## 🚀 Live Environment & Access

- **Production URL**: [https://captiorpilot-v3.vercel.app/](https://captiorpilot-v3.vercel.app/)
  - *Main Dashboard*: `/opportunities`
  - *Matches Matrix*: `/matches`
  - *Contractors DB*: `/contractors`
  - *Agency Intelligence*: `/agency-intelligence`

- **Database (Supabase)**: `https://ryxgjzehoijjvczqkhwr.supabase.co`
- **Environment Config**: See `.env` for keys (SAM API, Gemini, Supabase).

## 🛠 Core Features & Architecture

1. **Autonomous API Ingestion**: Integrates natively with the SAM.gov B2G API to fetch live Solicitation and Presolicitation data.
2. **100-Point Deterministic Match Algorithm**: Dynamically scores the intersection of Opportunities against a vetted pool of Contractors based on NAICS correlation, Geographic proximity, Structural Capacity, and Historical Inactivity.
3. **AI Document Extraction**: Utilizes Gemini and OpenAI pathways to scan live PDF attachments linked in SAM.gov opportunities to extract hard compliance requirements, executive summaries, and win strategies.
4. **Sales Dossiers & Outreach Generator**: Generates B.L.A.S.T ready, tactical multi-channel outreach payloads (Cold Call, SMS, Email).
5. **Real-Time Agency Intelligence**: A continuously running Node/Python analysis engine mapping structural metrics like Top Agencies, Top NAICS Codes, and Competitive Tier Density.

## 🗄 Project Structure & Cleanup

For clarity during the final handover, the project folder has been organized:

- **`/dashboard`**: The core Next.js 15 (App Router) frontend application.
- **`/dashboard/tools`**: Python and Next.js ingestion pipelines and intelligence logic processors.
- **`/archive`**: Stores initial planning documents (`frontend_design.md`, `CLAUDE.md`, etc) and temporary test scripts (`test-schema.js`, `test_sam_api.js`, etc) that were used during construction but are not actively deployed.
- **`gemini.md`**: The strict structural constitution dictating rules for the data schema and algorithms.

## ⚙️ Running Locally

1. `cd dashboard`
2. `npm install`
3. `npm run dev` (Runs locally on `localhost:3000`)
*(Note: Production Vercel branch builds continuously from `main`)*

---
*Built incrementally by Antigravity AI.*
