# What You Need to Do — User Tasks

I shipped everything that can be done from code. This list is **only tasks that need you** — credentials, ad accounts, business decisions, or things I can't see from the file tree. Sorted by impact.

---

## P0 — Before any of the new code goes live

### 1. Apply the new Supabase migration
```bash
cd dashboard
supabase db push        # if you use Supabase CLI
# OR via Supabase MCP:
# tell Claude: "apply migration 070_marketing_leads.sql via Supabase MCP"
```
Adds the `marketing_leads` table used by `/api/leads` and `<LeadMagnetForm />`.

### 2. Set Vercel env vars (Website project — `capturepilot-v3` / `live`)

These are read at build time, so set them in Vercel **before** the next deploy. All are public (`NEXT_PUBLIC_*`).

| Variable | Where to get it | What it enables |
|---|---|---|
| `NEXT_PUBLIC_GA4_MEASUREMENT_ID` | analytics.google.com → Admin → Data streams → Measurement ID (`G-XXXXXXXXXX`) | Google Analytics 4 pageviews + events |
| `NEXT_PUBLIC_GTM_CONTAINER_ID` | tagmanager.google.com → container ID (`GTM-XXXXXXX`) | Tag Manager — alternative to inlining every pixel |
| `NEXT_PUBLIC_META_PIXEL_ID` | business.facebook.com → Events Manager → Pixel ID (16 digits) | Meta/Facebook/Instagram ads conversion tracking |
| `NEXT_PUBLIC_LINKEDIN_PARTNER_ID` | LinkedIn Campaign Manager → Account Assets → Insight Tag (7 digits) | LinkedIn Ads conversion tracking |
| `NEXT_PUBLIC_GOOGLE_ADS_ID` | ads.google.com → Tools → Conversions → Tag ID (`AW-1234567890`) | Google Ads conversion |

Optional, for advanced tracking (set later once you have campaigns running):

- `NEXT_PUBLIC_GADS_LABEL_SIGNUP`, `NEXT_PUBLIC_GADS_LABEL_TRIAL`, `NEXT_PUBLIC_GADS_LABEL_DEMO` — Google Ads conversion labels per event
- `NEXT_PUBLIC_LINKEDIN_CONV_SIGNUP`, `NEXT_PUBLIC_LINKEDIN_CONV_TRIAL`, `NEXT_PUBLIC_LINKEDIN_CONV_DEMO` — LinkedIn conversion IDs per event

**The site already works without these — pixels just don't fire.** Add them when you have the accounts created.

### 3. Set Vercel env vars (Dashboard project) for the blog auto-publisher cron

| Variable | What it does |
|---|---|
| `GITHUB_REPO_OWNER` | e.g. `Globerocker` |
| `GITHUB_REPO_NAME` | e.g. `capturepilot-v3` |
| `GITHUB_TOKEN` | GitHub PAT with `Contents:Write` scope (fine-grained, scoped to the website repo) |
| `GITHUB_DEFAULT_BRANCH` | default `main` |
| `GITHUB_WEBSITE_PATH` | default `website` |

Without these, the new `publish_next_blog` cron returns 500 on every run.

### 4. Confirm `CRON_SECRET` is set in Vercel (Dashboard project)
I migrated all 30 cron handlers to fail-closed authorization. If `CRON_SECRET` is missing in **production**, every cron will return 401 and **all data ingestion stops**. Check:
- Vercel → Project → Settings → Environment Variables → `CRON_SECRET`
- Value: any long random string (Vercel auto-generates one when you add a cron, but it must exist)

---

## P1 — Required to actually run ads

### 5. Create Google Ads conversion actions
In ads.google.com → Tools → Conversions, create:
- **"Signup Click"** (Category: Sign-up, value: $0, count: every)
- **"Trial Started"** (Category: Sign-up, value: $50, count: one)
- **"Demo Booked"** (Category: Lead, value: $200, count: one)

Copy the conversion label for each into `NEXT_PUBLIC_GADS_LABEL_*` env vars (P0 list above).

### 6. Create Meta Pixel events (Aggregated Event Measurement)
In Events Manager → your pixel → Test events. Standard events I'm already firing:
- `Lead` (signup_clicked, lead_magnet)
- `InitiateCheckout` (pricing_pro_click)
- `Contact` (pricing_consulting_click)
- `Schedule` (demo_clicked)
- `Search` (check_started)
- `StartTrial` (trial_started)

Then go to Brand Safety → Aggregated Event Measurement and rank them (highest-value events first — Lead and StartTrial should be in top 4).

### 7. Set up Meta CAPI (Conversion API) for iOS 14.5+ tracking
The browser pixel I shipped handles desktop fine, but ~30% of mobile-app traffic is invisible without server-side CAPI. Options:
- **Easiest**: Use Meta's [Conversion API Gateway](https://www.facebook.com/business/help/2998922641239204) (no code, paid service)
- **Code option**: Add a `/api/meta-capi` endpoint that mirrors browser events to Meta server-side. I left this as a follow-up — the conversion-event helper is ready to call it.

### 8. Create LinkedIn conversion actions
LinkedIn Campaign Manager → Account Assets → Conversions. Same three actions as Google Ads. Copy IDs into `NEXT_PUBLIC_LINKEDIN_CONV_*` env vars.

### 9. Launch the three test campaigns
- **Google Search Ads** → `/lp/sam-gov-alternative` — keywords: `sam.gov alternative`, `highergov vs`, `govwin alternative`, `federal contract search tool`
- **Meta Lookalike** → `/lp/sdvosb-contracts` — seed audience: paid signups (need ~100+ first), 1% LAL US
- **LinkedIn Sponsored** → `/lp/free-naics-check` — target Job Titles: "Capture Manager", "Business Development Federal", "VP Federal Sales", "Director Federal Contracts"

Start budget: **$50/day × 3 = $150/day**. Run 14 days minimum. Don't add a 4th campaign until you've optimized the first three.

---

## P2 — Content + social proof

### 10. Collect 3-5 real customer quotes for the homepage trust layer
The `aggregateRating` schema in [website/app/layout.tsx](website/app/layout.tsx#L113) currently says `ratingCount: "12"`. That's weak signal for Google. Get 3-5 first-name + title + company + 1-sentence quote and:
- Update `aggregateRating.ratingCount` to a real number
- Add a `<TestimonialBlock>` component to the homepage hero (I can build this when you give me the quotes)
- Add `Review` schema to layout.tsx for each quote

Without real testimonials, ads have a much harder time converting cold traffic.

### 11. Decide: extend beta or evergreen trial?
I switched all "Public Beta — Free Until May 9" copy to **"Free 30-Day Trial — No Credit Card"** (evergreen — doesn't need maintenance). If you want to keep a hard beta deadline + locked-in beta pricing, tell me a new date and I'll revert the language.

Also: the `beta_deadline` cron in [dashboard/src/app/api/cron/beta_deadline/route.ts](dashboard/src/app/api/cron/beta_deadline/route.ts) is hardcoded to May 1/5/8 2026 (already passed). Decide: delete it, or extend dates and re-add to vercel.json.

### 12. Resolve `enrich_apollo` vs `enrich_apollo_contractors` duplication
Both write to the `contractors` table. The first isn't in vercel.json (orphan), the second runs every 2h. Look at their code and decide whether to delete one or rename + repurpose.

---

## P3 — Polish + nice-to-have

### 13. Configure Resend audience for lead magnets
The `/api/leads` endpoint I shipped writes to Supabase. To actually email people:
- Create a Resend Audience called "Marketing Leads"
- Add an audience-sync step to `dashboard/src/app/api/leads/route.ts` (right after the `.upsert` call) that calls Resend Contacts API
- Set `RESEND_AUDIENCE_ID` env var

I left the `resend_synced` boolean column in the table for this purpose.

### 14. Apply the lead-magnet gate to existing resources
The `<LeadMagnetForm />` component is built but only used inside [/lp/* pages](website/app/lp/). Drop it into:
- [/resources/sdvosb-opportunity-map](website/app/resources/sdvosb-opportunity-map/page.tsx) — gate the PDF behind email
- [/resources/bid-checklist](website/app/resources/bid-checklist/page.tsx) — same
- [/resources/proposal-template](website/app/resources/proposal-template/page.tsx) — same

Each: import `LeadMagnetForm` and wrap the existing download button. Tell me which ones to do and I'll wire them.

### 15. Migrate the 67 `'use client'` marketing pages to Server Components
The hero animations need `use client` but the static content sections don't. Splitting into Server + Client islands cuts JS bundle 30-50% and improves Core Web Vitals (which directly impact Google Ads quality score). This is a bigger refactor — say the word and I'll pick the top 5 pages (homepage, pricing, check, /vs index, /features index) and convert them.

### 16. Submit updated sitemap to Google Search Console
Once deployed:
1. Go to Google Search Console → Sitemaps
2. Re-submit `https://www.capturepilot.com/sitemap.xml`
3. The new dynamic sitemap will list ~135 routes vs the prior ~50 — Google should start crawling new `/contracts/*` and `/lp/*` pages within a few days

### 17. Wire actual stats into /contracts/ pages
The programmatic SEO pages I built use template content right now. To make them stronger ranking signals:
- Build a public `/api/public/contracts-count?naics=X&state=Y` endpoint on the dashboard that returns `{ count: 47 }`
- Fetch it at build time in `app/contracts/[naics]/page.tsx` via `unstable_cache` with 24h TTL
- Show the real number in the hero: "47 active Janitorial contracts in Texas"

Tell me when the endpoint exists and I'll wire it.

---

## Summary of what I built this session

**Cron + auth hardening**
- ✅ 30 of 50 cron handlers migrated from fail-open to fail-closed `guardCron(req)`
- ✅ Both orchestrators (`enrichment_orchestrator`, `backlinks_orchestrator`) hardened
- ✅ New shared helper [dashboard/src/lib/cron-auth.ts](dashboard/src/lib/cron-auth.ts)
- ✅ Schedule collision fixed: `ingest_rss` moved 02:30 → 02:45
- ✅ New cron `publish_next_blog` scheduled weekly Mon 14:00 UTC
- ✅ Complete [CRON.md](CRON.md) reference + linked from [CLAUDE.md](CLAUDE.md)

**Marketing site conversion**
- ✅ Beta-banner copy fixed across SiteNav + homepage + pricing (evergreen)
- ✅ [components/TrackingScripts.tsx](website/components/TrackingScripts.tsx) — GA4 + GTM + Meta Pixel + LinkedIn Insight + Google Ads (env-var gated)
- ✅ [lib/analytics.ts](website/lib/analytics.ts) — `track(event, params)` helper firing to all 4 destinations
- ✅ CSP headers in [next.config.ts](website/next.config.ts) extended for all pixels
- ✅ Dynamic [sitemap.ts](website/app/sitemap.ts) — auto-scans `app/` tree (was manual list missing 70+ routes)
- ✅ [components/LeadMagnetForm.tsx](website/components/LeadMagnetForm.tsx) + [api/leads/route.ts](dashboard/src/app/api/leads/route.ts) + [migration 070](dashboard/supabase/migrations/070_marketing_leads.sql)

**Ad landing pages**
- ✅ [/lp/sdvosb-contracts](website/app/lp/sdvosb-contracts/page.tsx) — veteran-targeted
- ✅ [/lp/sam-gov-alternative](website/app/lp/sam-gov-alternative/page.tsx) — competitor-switcher
- ✅ [/lp/free-naics-check](website/app/lp/free-naics-check/page.tsx) — cold-traffic
- ✅ Reusable [LpHero](website/components/LpHero.tsx) component (hero + social proof + risk reversal + final CTA)

**SEO**
- ✅ [lib/schema.ts](website/lib/schema.ts) — shared JSON-LD builders
- ✅ 5 missing layout.tsx files added: `/features/recompete-radar`, `/features/forecast-radar`, `/features/tribal-partners`, `/resources/sdvosb-opportunity-map`, `/resources/vetcert-checklist`
- ✅ Programmatic SEO routes: [/contracts](website/app/contracts/page.tsx), [/contracts/[naics]](website/app/contracts/[naics]/page.tsx), [/contracts/[naics]/[state]](website/app/contracts/[naics]/[state]/page.tsx) — pre-renders top 60 × 6 states = 360 pages + on-demand ISR

**Content automation**
- ✅ [api/cron/publish_next_blog](dashboard/src/app/api/cron/publish_next_blog/route.ts) — weekly auto-publishes from `blog-topics.json` via GitHub API. 10 unpublished topics in queue → 10 weeks of content with zero manual work after env vars are set.
