# CapturePilot Platform Audit Report

**Date:** March 15, 2026
**Auditor Role:** SaaS Monetization Strategist & GovCon Platform Architect

---

## EXECUTIVE SUMMARY

**Critical finding:** CapturePilot currently operates as a **fully open, zero-monetization MVP**. The `plan_tier` field exists in the database but is **cosmetic only** -- zero feature gating, zero upgrade CTAs, zero service triggers, zero payment infrastructure. Every user gets everything for free, including AI-enriched strategic insights that should be premium.

The platform has strong diagnostic value (match scoring, win probability, strategic scoring, AI win strategy) but **none of it converts to revenue**. The Software-to-Services conversion path does not exist.

---

## 1. FEATURE AUDIT TABLE

| Feature | Module | Exists | Tier Gated | Upgrade CTA | Service CTA | Monetized | Missing |
|---------|--------|--------|------------|-------------|-------------|-----------|---------|
| Opportunity Listing | Opportunities | YES | NO | NO | NO | NO | Tier limit on visible opps |
| NAICS Matching | Matches | YES | NO | NO | NO | NO | Gate match count by tier |
| Easy Win Filter | Matches | YES | NO | NO | NO | NO | Should be Explorer+ |
| AI Win Strategy | Opp Detail | YES | NO | NO | NO | NO | Should be Builder+ only |
| Strategic Scoring | Opp Detail | YES | NO | NO | NO | NO | Should be Explorer+ |
| Incumbent Intel | Opp Detail | YES | NO | NO | NO | NO | Should be Builder+ |
| Structured Requirements | Opp Detail | YES | NO | NO | NO | NO | Should be Explorer+ |
| Pipeline Kanban | Pipeline | YES | NO | NO | NO | NO | Limit stages on Free |
| Action Items | Actions | YES | NO | NO | NO | NO | Service triggers missing |
| Pursue Button | Opp Detail | YES | NO | NO | NO | NO | Limit pursuits on Free |
| CSV Export | Opportunities | YES | NO | NO | NO | NO | Should be Builder+ |
| SAM.gov Lookup | Onboarding | YES | NO | NO | NO | NO | Fine as free |
| Profile/Settings | Settings | YES | NO | NO | NO | NO | Completeness score missing |
| Capture Intelligence | -- | NO | -- | -- | -- | -- | Page doesn't exist |
| Proposal Center | -- | NO | -- | -- | -- | -- | Page doesn't exist |
| Partner Network | -- | NO | -- | -- | -- | -- | Page doesn't exist |
| Analytics | -- | NO | -- | -- | -- | -- | Page doesn't exist |
| Billing/Stripe | -- | NO | -- | -- | -- | -- | No payment infra |
| PWin Scoring | -- | PARTIAL | NO | NO | NO | NO | Exists as tier label only |
| Competitor Tracking | -- | NO | -- | -- | -- | -- | User requested |
| RGA (Readiness Assessment) | -- | NO | -- | -- | -- | -- | Not built |
| Capture Readiness Score | -- | NO | -- | -- | -- | -- | Not built |

---

## 2. MODULE-BY-MODULE AUDIT

### Dashboard (`/dashboard`)
| Check | Status |
|-------|--------|
| Feature present? | YES |
| Correctly placed? | YES |
| Monetized? | NO |
| Tier gated? | NO |
| Upgrade CTA? | NO |
| Service CTA? | NO |

**What exists:** KPI cards (matches, easy wins, active opps, urgent), profile summary, pipeline/action summary widgets, top 8 matching opportunities.

**What's missing:**
- No "Profile completeness" score driving upgrade pressure
- No locked widget previews for premium features (PWin trends, win rate, capture health)
- No service CTAs ("Book a strategy session", "Get proposal help")
- No tier badge or upgrade banner
- Pipeline/Action summaries don't trigger service suggestions

### Opportunities (`/opportunities`)
| Check | Status |
|-------|--------|
| Feature present? | YES |
| Correctly placed? | YES |
| Monetized? | NO |
| Tier gated? | NO |
| Upgrade CTA? | NO |
| Service CTA? | NO |

**What exists:** Full listing with search, filters, grid/list view, side panel, CSV export, 488+ opportunities.

**What's missing:**
- Free tier sees ALL 488+ opportunities with zero restriction
- CSV export should be gated (Explorer+)
- No "X more opportunities available on Explorer plan" upsell
- No service CTA on complex solicitations

### Opportunity Detail (`/opportunities/[id]`)
| Check | Status |
|-------|--------|
| Feature present? | YES |
| Correctly placed? | YES |
| Monetized? | NO |
| Tier gated? | NO |
| Upgrade CTA? | NO |
| Service CTA? | NO |

**CRITICAL MONETIZATION GAP:** This page gives away the most valuable intelligence for free:
- AI Win Strategy -- should be Builder+ or Winner
- Strategic Scoring -- Explorer+
- Incumbent Intelligence -- Builder+
- Structured Requirements extraction -- Explorer+

### My Matches (`/matches`)
| Check | Status |
|-------|--------|
| Feature present? | YES |
| Correctly placed? | YES |
| Monetized? | NO |
| Tier gated? | NO |
| Upgrade CTA? | NO |
| Service CTA? | NO |

**What's missing:**
- No match score displayed per opportunity
- Free tier should show top 5 matches, blur/lock the rest
- Easy Wins filter should be Explorer+

### Pipeline (`/pipeline`)
| Check | Status |
|-------|--------|
| Feature present? | YES |
| Correctly placed? | YES |
| Monetized? | NO |
| Tier gated? | NO |
| Upgrade CTA? | NO |
| Service CTA? | NO |

**What's missing:**
- No deal value tracking
- No win probability per pursuit
- No capture health/readiness score
- No deadline countdown urgency
- Free tier should limit to 3 active pursuits
- No service triggers at stage transitions

### Action Items (`/actions`)
| Check | Status |
|-------|--------|
| Feature present? | YES |
| Correctly placed? | YES |
| Monetized? | NO |
| Tier gated? | NO |
| Upgrade CTA? | NO |
| Service CTA? | NO |

**What's missing:**
- No service triggers on action categories
- No difficulty indicator per action item
- No "stuck on this?" help CTA

### Settings (`/settings`)
| Check | Status |
|-------|--------|
| Feature present? | YES |
| Correctly placed? | YES |
| Monetized? | NO |
| Tier gated? | NO |
| Upgrade CTA? | NO |
| Service CTA? | NO |

**What's missing:**
- No profile completeness score
- No "Past Performance" section
- No "Key Personnel" section
- No "Change Plan" or "Upgrade" button
- plan_tier exists but no action attached

### Capture Intelligence -- DOES NOT EXIST
### Proposal Center -- DOES NOT EXIST
### Partner Network -- DOES NOT EXIST
### Analytics -- DOES NOT EXIST
### Billing/Stripe -- DOES NOT EXIST

---

## 3. TIER STRUCTURE

### Current State
```
Free Beta -> (nothing else)
```
`plan_tier` field exists but zero logic references it anywhere.

### Recommended Structure
```
Free       -> See opportunities, basic matching, 3 pursuits
Explorer   -> Full matching, filters, structured requirements, strategic scoring
Builder    -> AI Win Strategy, Incumbent Intel, Unlimited pursuits, CSV export
Winner     -> Everything + bundled services (proposal review, strategy sessions)
```

### Free Tier Assessment
| Check | Status |
|-------|--------|
| Attracts users? | YES |
| Creates curiosity? | NO -- nothing is locked |
| Exposes locked value? | NO -- all value unlocked |
| Shows premium features visually? | NO |
| Creates upgrade pressure? | NO |
| Sells higher tiers? | NO |

---

## 4. MONETIZATION GAPS

### Features Given Away Free (Should Be Gated Later)
| Feature | Current | Should Be |
|---------|---------|-----------|
| AI Win Strategy | Free | Builder+ |
| Strategic Scoring | Free | Explorer+ |
| Incumbent Intelligence | Free | Builder+ |
| Structured Requirements | Free | Explorer+ |
| CSV Export | Free | Explorer+ |
| Easy Win Filter | Free | Explorer+ |
| Unlimited Matches | Free | Cap at 10 for Free |
| Unlimited Pursuits | Free | Cap at 3 for Free |

### Missing Service Triggers
| Trigger Condition | Service Offer | Status |
|-------------------|---------------|--------|
| Low win probability | Book strategy session | MISSING |
| Complex solicitation | Get proposal writing help | MISSING |
| No past performance | Past performance advisory | MISSING |
| Preparing stage | Professional proposal review | MISSING |
| Document action items stuck | Hire proposal writer | MISSING |
| Teaming action items | Partner matching service | MISSING |
| Compliance items | Compliance review service | MISSING |
| High-value opportunity (>$1M) | Capture management advisory | MISSING |
| Lost bid | Debrief coaching | MISSING |
| Low profile completeness | Profile optimization service | MISSING |

---

## 5. QUICK WINS

| Priority | Action | Revenue Impact |
|----------|--------|----------------|
| QW1 | Add service CTAs to Pipeline stages | HIGH |
| QW2 | Add service CTAs to Action Items | HIGH |
| QW3 | Profile completeness score on Dashboard | MEDIUM |
| QW4 | Add deal value + win probability to Pipeline | MEDIUM |
| QW5 | Add Capture Intelligence section to Opp Detail | MEDIUM |
| QW6 | Gate AI Win Strategy behind tier (later) | HIGH |
| QW7 | Limit Free pursuits to 3 (later) | MEDIUM |
| QW8 | Build Stripe billing (later) | FOUNDATION |

---

## 6. STRUCTURAL RISKS

1. No revenue path -- platform cannot generate revenue in current state
2. Value leakage -- AI-enriched intelligence (highest value) is fully free
3. No conversion funnel -- software doesn't lead to services
4. Missing entire modules -- Capture Intel, Proposal Center, Partner Network, Analytics, Billing
5. No competitive moat -- users extract all value without paying
6. Competitor tracking -- user-requested, not built, high-value for gating
