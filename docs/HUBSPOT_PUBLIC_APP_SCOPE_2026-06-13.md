# CapturePilot HubSpot Public App — Scope (2026-06-13)

## 1. Objective & positioning

Ship a **public HubSpot Marketplace app** that turns a customer's HubSpot into their B2G
capture CRM. On install, the app provisions a government-capture data model (pipeline +
properties, plus custom objects on Enterprise) and then **continuously syncs CapturePilot
intelligence** — matched opportunities, agencies, and awards — into their portal.

- **Distribution:** free in the HubSpot Marketplace.
- **Gating:** live data sync requires an active **CapturePilot subscription**. Free install =
  funnel + retention lever; the app is worthless without CP data, so it pulls installs toward subs.
- **Dual use:** also runs against our own portal, but the customer is the target user.
- **Distinct from** the existing private-app token integration (that one is for *our* portal's
  marketing/sales funnel — see [[project_hubspot_integration]]). This is a separate, OAuth-based,
  multi-tenant product on a separate (HubSpot CLI project) codebase.
- **Adjacent track (flagged, not scoped here):** reselling HubSpot licenses to customers is the
  **HubSpot Solutions Partner Program**, separate from building this app. Worth pursuing in
  parallel for the "sell them HubSpot as their CRM" leverage, but it's a commercial/partner
  motion, not an engineering deliverable.

## 2. Platform constraints (HubSpot, 2026 — verified)

These shape the whole build and are non-negotiable:

- **Custom objects = Enterprise only.** Not available on Starter/Professional. Most CP customers
  (small gov contractors) are Starter/Pro → the app **cannot** be custom-object-centric. → drives
  the tier-adaptive model (§4).
- **Legacy CRM cards are deprecated** for new listings. Modern apps must use **UI Extensions
  (React, `@hubspot/ui-extensions`)** built on the **Projects platform + HubSpot CLI**. The old
  "create a public app" UI is being sunset → the app is a CLI/projects project from day one.
- **App Card Review Program**: marketplace UI cards are reviewed (App ID + Build ID + demo video)
  on security/privacy, performance/reliability, usability/accessibility, value/functionality.
- **Dev platform version** must be supported at review (v2025.2 or v2026.03).
- Testing credentials no longer required for listing — a **demo/walkthrough video** is.

Sources: [Certification requirements](https://developers.hubspot.com/docs/apps/developer-platform/list-apps/apply-for-certification/certification-requirements),
[Legacy public-app sunset](https://developers.hubspot.com/changelog/legacy-public-app-creation-sunset),
[Spring 2026 spotlight](https://developers.hubspot.com/changelog/spring-2026-spotlight),
[Custom objects tier](https://community.hubspot.com/t5/HubSpot-Ideas/Custom-Objects-for-Professional-plans/idi-p/513014).

## 3. Architecture overview

```
Customer HubSpot portal  ◄──OAuth 2.0──►  CapturePilot backend (Next.js / Supabase)
   │  (per-portal tokens)                    ├─ hubspot_connections (token vault, tier, CP link)
   │                                         ├─ Schema provisioner (install-time)
   │  UI Extensions (React)  ◄───────────────┤  └─ tier-adaptive: pipeline+props | +custom objects
   │   - CRM card (company/deal)             ├─ Sync engine (worker_jobs lane + cron)
   │   - App page (optional)                 │    push opps/agencies/awards; dedupe; rate-limit
   │                                         └─ Inbound webhooks (stage changes, uninstall)
   └─ Data: Government Capture pipeline + custom props (+ custom objects on Enterprise)

HubSpot CLI project (separate repo/dir):  OAuth app definition + UI extension cards + app pages
```

## 4. Data model (tier-adaptive)

### 4a. Universal layer — Starter / Pro / Enterprise (deals + properties)

**"Government Capture" deal pipeline** (mirrors `user_pursuits` stages):
`Discovered → Qualifying (Sources Sought/RFI) → Pursuing → Proposal Prep → Submitted →
Awarded → Lost → No-Bid`.

**Deal properties** (namespaced `cp_`): `cp_notice_id` (dedup key), `cp_solicitation_number`,
`cp_agency`, `cp_sub_agency`, `cp_naics`, `cp_psc`, `cp_set_aside`, `cp_notice_type`,
`cp_response_deadline`, `cp_posted_date`, `cp_estimated_value`, `cp_opportunity_score`,
`cp_place_of_performance`, `cp_sam_url`.

**Company properties:** `cp_uei`, `cp_cage_code`, `cp_naics_codes`, `cp_sam_registered`,
`cp_set_aside_certs`, `cp_readiness_score`, `cp_federal_revenue`.

**Contact properties:** reuse the set we already define internally (readiness, lead quality, etc.).

### 4b. Enterprise layer — first-class custom objects + associations

- **Government Opportunity** (`gov_opportunity`): notice_id (unique), title, agency, sub_agency,
  office, naics, psc, set_aside, notice_type, response_deadline, posted_date, estimated_value,
  opportunity_score, solicitation_number, sam_url, status, place_of_performance, description.
  → assoc: Company (pursuer), Deal (the pursuit), Gov Agency.
- **Government Agency/Office** (`gov_agency`): agency, sub_agency, office, agency_code,
  typical_naics[], total_spend, fiscal_forecast. → assoc: Gov Opportunity, Contract.
- **Contract / Award** (`gov_contract`): award_id (PIID), recipient_uei, recipient_name, agency,
  naics, award_amount, award_date, period_of_performance, is_incumbent, source (FPDS/USASpending).
  → assoc: Gov Agency, Company (incumbent), Gov Opportunity (recompete link).

These map 1:1 to existing CP tables (`opportunities`, `contractors`, `agency_spend_forecast`,
awards), so the provisioner + sync reuse known shapes.

**Provisioner rule:** detect portal tier on install (cached on `hubspot_connections.tier`).
Always create the universal layer; create custom objects **only** when tier supports them.
Idempotent + re-runnable (handles re-install, plan upgrades Pro→Enterprise).

## 5. Sync engine (full active sync)

- **Direction:** CapturePilot → customer portal (primary). Inbound webhooks reflect deal/object
  stage changes back into `user_pursuits`.
- **Mechanism:** new `worker_jobs` task type `hubspot_portal_sync` + dedicated cron lane
  (`run_worker_jobs_hubspot`). One job per connected portal per cycle.
- **What syncs:** for each linked CP user — matched opportunities (score ≥ threshold), their
  agencies, and relevant awards. Target = custom objects on Enterprise, deals on Pro/Starter.
- **Upsert/dedupe:** by `cp_notice_id` / `award_id` (HubSpot unique property) → idempotent.
- **Rate limits:** per-portal OAuth token; respect HubSpot burst (≈100–150/10s) + daily caps;
  use Batch APIs; backoff on 429. Log per-portal throughput (mirror `/admin/queue`).
- **Gating:** sync runs only if the linked CP account has an active subscription; on lapse,
  **pause sync** (keep schema, stop pushing) and surface a notice. Resume on reactivation.

## 6. Auth & multi-tenancy

- **OAuth 2.0 public app.** Install link → HubSpot consent → callback exchanges code for
  access+refresh tokens → link portal to a CP account (logged-in CP user, or email magic-link if
  installed from the Marketplace first).
- **New table `hubspot_connections`:** `portal_id` (unique), `capturepilot_account_id`,
  `access_token` (enc), `refresh_token` (enc), `expires_at`, `tier`, `scopes`, `installed_at`,
  `status` (active|paused|revoked). Token refresh on 401/expiry.
- **Uninstall webhook** → mark `revoked`, stop jobs, optional schema cleanup.
- **Minimal scopes**, each justified for certification (CRM objects read/write, schemas for
  custom objects on Enterprise, deals/pipelines, webhooks).

## 7. In-HubSpot UI (UI Extensions — React, projects platform)

- **CRM card on Company:** "CapturePilot Capture Intelligence" — readiness score, top matched
  opportunities w/ deadlines, set-aside fit, deep link to CapturePilot.
- **CRM card on Deal** (Government Capture pipeline): opportunity detail, requirements, AI win
  strategy, attachments link.
- **App page (optional, V1+):** embedded capture dashboard inside HubSpot.
- Submit cards through the App Card Review Program.

## 8. Marketplace listing + certification checklist

Single app ID + OAuth client; minimal justified scopes; install/uninstall handled; no hardcoded
secrets; demo/walkthrough video; privacy policy URL; support contact; UI-extension app-card review;
dev platform v2026.03; listing assets (logo, screenshots, copy — run through `/humanizer`).

## 9. Build phasing

- **Phase 0 — Foundations** *(blocked on human-only prereqs, §10)*: projects-based public app,
  OAuth flow, `hubspot_connections` token vault, account linking, install/uninstall webhooks,
  tier detection.
- **Phase 1 — Provisioner:** idempotent schema provisioner (universal layer always; custom
  objects on Enterprise).
- **Phase 2 — Sync engine:** `hubspot_portal_sync` worker lane + cron, opportunity/agency/award
  push, dedupe, rate limiting, sub-gating, inbound stage webhooks.
- **Phase 3 — UI extensions:** CRM card(s) via CLI/projects + app-card review submission.
- **Phase 4 — Listing + certification:** assets, demo video, privacy policy, submit for cert.

## 10. Human-only prerequisites (needed before Phase 0 coding)

1. **HubSpot Developer account** + create the projects-based public app (gives App ID, OAuth
   client ID/secret).
2. **HubSpot App Marketplace partner** eligibility (required to list/certify).
3. Decide + register **OAuth scopes**, redirect URLs.
4. **Privacy policy** + support contact URLs for the listing.
5. (Parallel) evaluate **HubSpot Solutions Partner Program** for the reselling motion.

## 11. Reuse from existing code

Property/pipeline definitions and sync patterns in `dashboard/src/lib/hubspot.ts` +
`hubspot-brief.ts`; the `worker_jobs` queue platform for per-portal sync; `/admin/queue`-style
telemetry; `HUMAN_VOICE_RULES` for listing copy.
