# API Integrations — Recommended Additions (May 2026)

Researched, verified-current list of free / low-cost APIs that meaningfully extend the CapturePilot stack. Existing integrations are NOT in this list — see CLAUDE.md "Recent major changes" + `src/lib/` for what's already wired.

## Top 5 — integrate first (highest ROI per hour of work)

| # | Service | What it unlocks | Cost | Lift |
|---|---|---|---|---|
| 1 | **Axiom** (logs) | Free 500GB/mo ingest, 30-day retention, Vercel-native integration. Solves the silent-cron-failure class of bugs that bit us in April (enrich + ai_win_strategy both ran empty for days before anyone noticed). | Free up to 500GB | Low (Vercel integration, ~30 min) |
| 2 | **Healthchecks.io** (cron heartbeat) | One curl-ping per cron handler. When a cron stops pinging, you get an email/Slack alert. Direct prevention of recurrence of the April enrichment outage. Free tier covers 20 checks; we have 35 crons → either self-host the OSS version OR pay $20/mo Business. | Free 20 / Self-host OSS / $20 paid | Low (1 line per cron) |
| 3 | **SBA Size Standards API** | Live NAICS → revenue/employee size-standard lookup. Replaces our hardcoded `naics_codes` validation with the authoritative source. | Free, no key | Low |
| 4 | **GSA CALC+ API** | Awarded labor rates by category — feeds directly into AI proposal price-to-win. Higher win rate without more headcount. | Free, no key | Low |
| 5 | **FPDS Atom Feed via SAM.gov** | Every federal award. Populates incumbent intel for every opportunity — our scoring already weights `incumbent_risk` but the data is sparse. | Free, no key | Medium (XML parser) |

## More opportunities

| Service | What it adds | Cost | Notes |
|---|---|---|---|
| **DIBBS (DLA bid board)** | DLA defense supply/parts solicitations not always in SAM.gov. | Free | HTML/CSV scraping, no JSON API. |
| **DoD SBIR/STTR open topics** | Army open topics SAM doesn't always carry. `https://www.dodsbirsttr.mil/topics-app/api/public` | Free, no key | Undocumented but stable JSON. |
| **GSA Auctions RSS** | Surplus auctions — useful for product-reseller users. | Free | RSS feed. |
| **SAM.gov Contract Awards Sub-API** | Post-Feb 2026 FPDS migration; same key as opportunities. | Free | Same SAM key — already rotating. |

## Enrichment

| Service | What it adds | Cost | Notes |
|---|---|---|---|
| **SAM.gov Entity Management** | Pull `coreData`, `assertions`, `repsAndCerts` for full UEI status, exclusions, set-aside cert verification. | Free, X-Api-Key, 1k calls/day | Extends existing client. |
| **SBA DSBS / certifications.sba.gov** | Authoritative 8(a), HUBZone, WOSB/EDWOSB, VOSB/SDVOSB verification. | Free | No public REST API; reverse-engineer the React app's JSON endpoints (1 day). |
| **USPTO PatentsView** | Verify technical credibility for SBIR pursuits. | Free, 45 req/min | No auth. |
| **OpenCorporates** | State incorporation, officers, status. | Free 500/mo, $99/mo paid | Authority on state-level entity data. |

## Contact intelligence

| Service | What it adds | Cost | Notes |
|---|---|---|---|
| **Hunter.io** | Verified domain emails — finding agency contacts. | Free 50 credits/mo, $49/mo paid | Best free-tier value for cold outreach lookup. |
| **FederalPay.org scraping** | Federal employee names/titles/salaries by agency. | Free | HTML scraping; high value for finding contracting officers. |
| **Apollo people/match** | Already in stack — extended for the lead-magnet pipeline in May 2026. | Existing free tier | Done. |

## Market intelligence

| Service | What it adds | Cost | Notes |
|---|---|---|---|
| **FRED (St. Louis Fed)** | Macro context (GDP, defense outlays, agency budget trends) for `agency_spend_forecast`. | Free, API key | No documented rate limit. |
| **Treasury Fiscal Data API** | Federal spending by agency / TAS. Cross-check forecasts. | Free, no key | https://fiscaldata.treasury.gov/api-documentation/ |
| **USAspending.gov** | Already in stack — push deeper into `/api/v2/search/spending_by_award/` and `/recipient/`. | Free, no key | Already wired. |

## Compliance / data hygiene

| Service | What it adds | Cost | Notes |
|---|---|---|---|
| **SAM.gov Exclusions API** | Returns debarment status as part of Entity Management. Flag at onboarding — a debarred user can't legally win contracts. | Free, X-Api-Key | Critical onboarding signal. |
| **SBA Size Standards Tool** | NAICS → revenue/employee threshold lookup. Replaces hardcoded `naics_codes` validation. | Free, no key | Already in Top 5 above. |
| **CAGE Code lookup (DLA)** | Validate CAGE codes on contractor records. | Free | No JSON API; HTML scrape. |
| **Have I Been Pwned** | Check user emails against breaches at signup. | $3.95/mo flat | Cheap insurance against compromised signups. |

## Communication / outreach

| Service | What it adds | Cost | Notes |
|---|---|---|---|
| **Twilio Programmable SMS** | "RFP due in 24h" SMS alerts to users on the pro tier. | $0.0083/msg US, pay-as-you-go | No free tier (trial credits only). |
| **Cal.com Cloud free** | Booking off HubSpot if you want to decouple. | Free 1 user, $15/mo Teams | Only consider if HubSpot becomes a cost concern. |
| **Mailgun email validation** | Free 100/mo verifier. | Free 100/mo | Drop-in if Hunter cost becomes a concern. |
| **Listmonk (self-host)** | Newsletter / market-watch digest sender. | Free OSS | High deploy lift, not worth it until volume justifies. |

## Observability / monitoring

| Service | What it adds | Cost | Notes |
|---|---|---|---|
| **Axiom** | Log aggregation — Vercel-native. | Free 500GB/mo | Top 5 — integrate first. |
| **Healthchecks.io** | Cron heartbeats. Self-host OSS or pay $20/mo for 35 crons. | Free 20 / Self-host / $20 | Top 5. |
| **Better Stack** | Free 10 monitors + 1GB logs + status page. Bundles uptime + logs + on-call for $24/mo. | Free 10 / $24 | Good Sentry complement. |
| **UptimeRobot** | Free 50 monitors at 5-min intervals. | Free 50 | Cheapest add-on for endpoint pings. |
| **Sentry** | Already in stack — keep. | Existing | Done. |

## Explicit "skip" list

- **SendGrid** — 60-day trial only now, no permanent free tier (since Feb 2026). Resend covers our needs.
- **RocketReach** — paid only ($53/mo entry). Apollo + Hunter cover the gap.
- **GovWin / Bloomberg Government** — enterprise pricing ($30k+/yr), no public API.
- **FedConnect** — no API, scraping only, low marginal value over SAM.gov.
- **Cronitor** — Healthchecks.io is cheaper and equivalent.

## Rotation cadence cheat-sheet

When integrating any of the above, register the connector in `api_connectors` table (migration 075) with the right rotation schedule:

| Service | Rotation |
|---|---|
| SAM.gov | **90 days** (existing — already tracked) |
| Hunter.io | None (manual revoke only) |
| Twilio | Auth tokens — **yearly** |
| FRED, USPTO, SBA, Treasury, USAspending | No key OR free key, no rotation |
| Axiom / Better Stack / Healthchecks | API tokens — **yearly** |
| OpenCorporates | Per-call key — **yearly** |
| Apollo | Free tier — no formal rotation but rotate **yearly** as hygiene |
| Resend | API key — rotate on team changes |
| Stripe | Restricted keys — rotate **yearly**, root key on compromise only |
| HubSpot | Private app tokens — **yearly**, on team changes |
| OpenAI | API keys — rotate **quarterly** if used for user-facing features |

## Where this list goes from here

When you decide to integrate one, the workflow is:
1. Add a row to `api_connectors` with `env_var_name`, `rotation_days`, `docs_url`, `rotate_url`.
2. Set the env var in Vercel.
3. Add a `probe` block to `lib/connectors.ts` so the hourly `health_monitor` cron pings it.
4. Wire the actual integration code where it belongs (`lib/` or `tools/`).
5. The admin Connectors page (`/admin/connectors`) automatically picks it up once the row exists.

Sources verified May 2026:
- [FPDS migration to SAM.gov Feb 24 2026](https://gormgroup.com/2026/02/20/fpds-contract-data-search-moves-to-sam-gov-february-24-2026/)
- [GSA Open Technology APIs](https://open.gsa.gov/api/)
- [GSA CALC+ Digital Experience API](https://open.gsa.gov/api/dx-calc-api/)
- [Hunter.io Pricing 2026](https://hunter.io/pricing)
- [Healthchecks.io Pricing](https://healthchecks.io/pricing/)
- [SBA Small Business Search](https://search.certifications.sba.gov/)
- [FRED API docs](https://fred.stlouisfed.org/docs/api/fred/)
- [Twilio Pricing](https://www.twilio.com/en-us/pricing)
- [Better Stack Uptime](https://betterstack.com/uptime)
