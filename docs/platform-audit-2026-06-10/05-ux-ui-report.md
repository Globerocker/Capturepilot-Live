# UX/UI Improvement Report

## Header impressions

CapturePilot looks the part. The sidebar is clean, the dashboard cards have weight, and the product clearly knows what a federal contractor needs to see first: scored matches, pipeline value, deadline pressure. The Quick Checker landing page is the strongest UX moment in the whole app — it tells a non-customer in 30 seconds what the platform does and gives them something useful before asking for anything. That instinct (show value, then ask) is what good B2B software does.

The weakest moment is the seam between signup and the first real use. The signup card promises "completely free, no credit card." Sixty seconds later, the onboarding finish screen asks for a card. Then Settings asks for the same firmographics the Quick Checker already inferred. Then the Matches page shows zero results when a filter is applied because pagination runs before filtering. Then the dashboard's "Strong / Good / Possible" pills don't actually filter anything — they're decorative buttons. By the time a contractor reaches their first match, they've already been bait-and-switched, made to retype known data, and clicked three buttons that did nothing. The product is good. The first 10 minutes need a rewrite.

## Friction by flow

### Onboarding

1. **[HIGH] Bait-and-switch on the card promise.** Evidence: `dashboard/src/app/(public)/signup/page.tsx:210` says "It's completely free right now. No credit card required." Then `dashboard/src/app/(onboarding)/onboard/page.tsx:633-639` says "Card required to unlock full features." Fix: pick one truth. Either keep the beta free and drop the billing gate, or change signup to "Start your 14-day trial — card required at the end." Don't promise no card and ask for one a minute later.

2. **[HIGH] Step 3 retypes data the Quick Checker already extracted.** Evidence: `onboard/page.tsx:211-230` only prefills company_name, website, UEI, NAICS, certs, target_states from `analysis_id`. The Quick Checker already pulled employee count, founding year, services, federal agencies served, and revenue signals. Fix: extend the prefill block to map `crawl.employee_signals.estimate` → employee_count, `crawl.founding_year` → years_in_business, `crawl.federal_agencies_served.length > 0` → has_federal_experience. Mark each prefilled field with the existing SourceBadge so they can correct it.

3. **[HIGH] "Skip Step 3" is a lie.** Evidence: `onboard/page.tsx:1157-1166` button labeled "Skip Step 3," tooltip "Step 3 is optional." But `handleSave` at line 376-387 requires every Step 3 field and fires a native alert listing what's missing. Fix: either make Step 3 truly optional (allow nulls, scoring handles them) or remove the button.

4. **[HIGH] Revenue ranges don't match between onboarding and Settings — round-trip data loss.** Evidence: `onboard/page.tsx:41-47` uses `<1M / 1-5M / 5-25M / 25-100M / 100M+`. `settings/page.tsx:838-846` uses seven different buckets (`Under $100K / $100K-$500K / ... / $25M+`). A user who picks 1-5M (stored as 3,000,000 midpoint) opens Settings and sees nothing selected. Fix: unify the buckets in both places; store the canonical bucket string plus a single derived numeric.

5. **[MEDIUM] No inline validation — errors only surface on Save via native alert.** Evidence: `onboard/page.tsx:376-387` gathers missing fields and shows `alert("Required: ...")`. Step 3 has zero inline validation. Fix: validate on blur with inline red text; disable the "Complete Setup" button with a tooltip listing what's missing.

6. **[LOW] Skip-prefill is presented as an equal-weight option before the user knows what they'd be skipping.** Evidence: `onboard/page.tsx:812-820` puts "Prefill from website + SAM.gov" and "Skip prefill, fill manually" side by side, both enabled. Fix: make Prefill the only primary action; move the skip to a small grey "Or skip the auto-fill (takes longer)" link below.

### Daily-use (dashboard, matches, opportunities)

1. **[HIGH] Matches paginates before filtering, returning near-empty pages.** Evidence: `matches/page.tsx:227-289` runs `.range(from, to)` first (pageSize=25), then JS filters by search/notice type/state/NAICS/deadline. The total is set to filtered-page length at line 288. Sort buttons re-sort the current 25 rows, not the full set. Fix: push notice_type / set_aside / state / NAICS filters into the Supabase query as `.eq()`, search via `.or()` against opportunities, sort via `.order('opportunities(...)')`, then `.range()` last.

2. **[HIGH] Dashboard "Strong / Good / Possible" filter pills are decorative.** Evidence: `DashboardClient.tsx:332-337` renders four buttons with no onClick, no state, no filter logic — pure static elements styled as if active. Fix: wire up filtering or remove the pills. Decorative buttons that look interactive are worse than no buttons.

3. **[MEDIUM] Match terminology mixes HOT/WARM/COLD jargon with user-facing Strong/Good/Possible.** Evidence: `matches/page.tsx:538-540` says "Strong / Good / Possible" but line 647-648 dropdown says "50%+ (WARM) / 70%+ (HOT)" and line 852-853 empty state says "No COLD matches found." Fix: pick the user-facing labels everywhere. Keep HOT/WARM/COLD in the database column only.

4. **[MEDIUM] Four words for two concepts: Opportunity / Match / Pursuit / Deal.** Evidence: Sidebar has Matches, Opportunities, Pipeline. `PursueButton.tsx:206` says "Start Pursuing." `pipeline/page.tsx:675-686` says "Total deals." Database calls them `user_pursuits`. Fix: lock the vocabulary. Opportunity = the thing on SAM. Match = an opportunity scored for you. Pipeline = ones you're actively pursuing. Rename "Start Pursuing" → "Add to Pipeline."

5. **[MEDIUM] Empty states say "Not set" / "No data" instead of telling the user what to do.** Evidence: `DashboardClient.tsx:443` "Not set" for NAICS, :486 "No opportunities in pipeline," :504 "No pending action items." Fix: replace every "No X" with "Connect/Add/Pick Y to see X here," linking to the right page. Matches at line 855-887 already does this well — use it as the template.

6. **[MEDIUM] Sidebar has 14 top-level items with no grouping.** Evidence: `Sidebar.tsx:38-66` lists Dashboard, Matches, Opportunities, Pipeline, AI Drafter (3 children), Documents, Partners (4 children), Contract Winners, Competitors, Recompetes, Forecasts, Academy + Billing + Settings. Fix: group into FIND (Dashboard, Matches, Opportunities, Quick Check), PURSUE (Pipeline, AI Drafter, Documents), RESEARCH (Partners, Competitors, Contract Winners, Recompetes, Forecasts), LEARN (Academy). Light section headers reduce perceived complexity without losing anything.

### Power moves (Quick Checker, AI Proposal, Capability Statement, Pursuit)

1. **[MEDIUM] Quick Checker isn't in the sidebar.** Evidence: `Sidebar.tsx:38-66` has no Quick Check entry. Only access from inside the dashboard is the small green tile. Fix: add "Quick Check" to the sidebar with the Search icon, grouped at the top under FIND. It's the same tool that brought the user in — let them use it on competitors and teaming candidates too.

2. **[HIGH] Capability statement SSE silently delivers empty sections when OpenAI fails.** Evidence: `api/ai/capability-statement/route.ts:208-218` — `if (res.ok) { content = ... }` with no else branch. On 4xx/5xx, content stays empty, function sends `section_done` with content:'' and word_count 0. User watches progress bar tick through 6 sections, gets a PDF with several empty sections, no error surfaced. Fix: add `else { send('error', { section, message: 'OpenAI ${status}: ...' }); continue; }` so the client knows the section failed.

3. **[HIGH] Portal capability-statement is the lite version — consulting clients pay more, get less.** Evidence: dashboard version (704 lines) has TipTap editor, streaming progress, branded PDF, Drive save, bubble-menu AI editing. Portal version (322 lines) is a single textarea with one button. Fix: lift the dashboard implementation into a shared `CapabilityStatementBuilder` component and import from both surfaces.

4. **[MEDIUM] AI Drafter Email + Template tabs lose everything on refresh.** Evidence: `ai-drafter/page.tsx` EmailTab (138-281) and TemplateTab (283+) store state in useState only. No localStorage, no draft save. AI Proposals does persist active jobs. Fix: per-profile localStorage draft key (`drafter:email:${profileId}:draft:v1`), restore on mount, "Draft saved" indicator like onboarding.

5. **[MEDIUM] Pipeline weighted-value forecast reads only `award_amount`; shows $0 for every pre-award deal.** Evidence: `pipeline/page.tsx:131` selects `award_amount` but not `estimated_value`. The portal sibling already includes `estimated_value` — they've drifted. Fix: add `estimated_value` to the SELECT, change the sum to `(opp?.award_amount || opp?.estimated_value || estimateContractValue(opp))`.

6. **[LOW] Matches refresh button has no feedback, no cool-down, swallows errors.** Evidence: `matches/page.tsx:318-325` posts to `/api/matches/refresh`, refetches, has `catch { /* ignore */ }`. No "last refreshed at" timestamp, no debounce. Fix: show last-refresh timestamp on the button, disable for 60s post-click, surface API errors via global toast.

### Account + Billing

1. **[HIGH] Settings has no autosave despite CLAUDE.md saying it does.** Evidence: CLAUDE.md `/settings` section claims "Debounced autosave (1.2s) on profile edits with status indicator." Reality: `settings/page.tsx` has only a manual `handleSave()` at 362-422. `updateProfile` at 338 just mutates local state. Fix: ship the autosave or correct the docs. The autosave is the better fix — Settings is the longest scroll in the app.

2. **[HIGH] Settings uses native window.alert() for all error feedback.** Evidence: `settings/page.tsx:410, 479, 486, 489`; `onboard/page.tsx:387, 393, 462`; `ai-drafter/capability-statement/page.tsx:476` uses native `prompt()` for a transcript paste (single-line input for a multi-paragraph transcript). Fix: route through the existing GlobalToast component. Replace the prompt() with a textarea modal.

3. **[MEDIUM] Settings "Saved" state is a single boolean — multiple unsaved sections cause confusion.** Evidence: `settings/page.tsx:211` single `saved` state, two Save buttons (565, 787). User saves Profile, then edits NAICS — the top Save button is still green "Saved." Fix: track `isDirty` separately from `savedAt`; if dirty, both buttons show "Save Changes (unsaved)"; decay back to neutral on next field change.

4. **[MEDIUM] Settings sticky nav flickers — IntersectionObserver band is too narrow.** Evidence: `settings/page.tsx:221-239` uses `rootMargin: "-30% 0px -55% 0px"` (15% band). With six sections and sub-collapsibles, multiple sections land in the band and the active highlight jumps. Fix: widen to `"-15% 0px -70% 0px"`, debounce 100ms, lock 600ms on nav-click.

5. **[MEDIUM] Portal settings save silently fails — no error handling.** Evidence: `portal/settings/page.tsx:337-341` doesn't destructure the error from `supabase.from().update()`. Shows "Saved!" even when RLS blocks. Fix: destructure `const { error }` and reuse the existing red error chip pattern.

6. **[MEDIUM] Portal settings is missing primary_keywords / secondary_keywords fields.** Evidence: `portal/settings/page.tsx:219-242, 307-335` has no keyword fields. Dashboard Settings does. Keywords drive scoring per CLAUDE.md. Fix: add a KeywordPicker section to portal settings — the component already exists at `components/KeywordPicker.tsx`.

### Consulting portal (white-label)

1. **[MEDIUM] Portal layout polls unread count every 30s with 3 round-trips per tick.** Evidence: `portal/layout.tsx:95-115` fires `auth.getUser()` → `user_profiles select` → `client_messages count` every 30s, per tab. On a 100-client base with pinned tabs that's ~12K Supabase requests/hr for a counter that changes a few times per day. Fix: cache the auth user and profile id from initial mount; the polling tick only needs the count. Better: Supabase realtime subscription on `client_messages` filtered by `user_profile_id`.

2. **[LOW] Portal pages re-fetch auth + profile on every navigation.** Evidence: `portal/layout.tsx:44-91` runs auth check, then every child page (`portal/page.tsx:46-55`, `portal/pipeline/page.tsx:121-128`, `portal/opportunities/page.tsx:113-122`) also runs `auth.getUser()` + `user_profiles select id`. 3-4 redundant Supabase round-trips per navigation. Fix: lift into a `PortalContext` provider in the layout.

3. **[MEDIUM] Portal "your portal is being set up" copy is passive.** Evidence: `portal/page.tsx:309` says "Your portal is being set up. We'll notify you when there are opportunities or tasks." Fix: tell them what's happening and when. "Your account manager is setting up your profile. Expect your first matched opportunities by [date]. In the meantime, here's what to review:" with one or two starter links.

4. **[MEDIUM] Portal lacks the white-glove feel its account tier suggests.** Consulting clients are the higher-tier; they get the lite capability-statement, the lite settings, and a passive empty state. Fix is across findings above — shared CapabilityStatementBuilder, keyword editor in settings, real welcome copy.

## Premium polish opportunities

- **Skeleton screens, not spinners, on internal navigation.** `loading.tsx` files at `portal/loading.tsx` and `matches/loading.tsx` use skeletons correctly. But the page client components then run a second-pass useEffect fetch that shows a centered Loader2 spinner — `portal/page.tsx:130-134`, `portal/messages/page.tsx:293-295`, `settings/page.tsx:531`. Result: skeleton flash, then spinner, then content. Render the same skeleton inside the page's loading branch.

- **Animated confirmation on pipeline stage moves.** `pipeline/page.tsx:150-189` does optimistic update with no toast. The GlobalToast component is already wired in. Publish to its event bus on stage change: "Moved to Submitted."

- **Saved-changes chip should fade.** Settings shows a static "Saved" green chip for unbounded duration. Switch to "Saved 3s ago" that decays back to neutral when the user touches another field.

- **Pipeline Kanban on mobile needs a swipe affordance.** `KanbanBoard.tsx:210` uses horizontal scroll with `snap-mandatory`. On a 375px phone, users see column 1 + half of column 2 and think the pipeline has two stages. Add a right-edge gradient mask + chevron-right hint, or collapse to list view as default on mobile (the toggle already exists at `pipeline/page.tsx:103`).

- **Dashboard progressive render.** `DashboardClient.tsx:105-120` hangs the whole page on one fetch to `/api/dashboard/kpis`, then card components fire their own fetches on mount. Render skeleton numbers (animated bars) instead of "0" so zeros don't briefly display, and stream cheap counts separately from expensive aggregates.

- **Opportunity detail panels below the fold should lazy-load.** `opportunities/[id]/page.tsx:688-828` renders ~15 panels (CapabilityMatrix, ComplianceMatrix, PastAwards, GovTribe*, HistoricalWinners, SuggestedPartners, MarketIntelligence, RelatedContractors, EmailDraft), each fetching independently on mount. Wrap below-the-fold panels in Suspense + lazy() with intersection-observer triggers.

- **Layout floats shouldn't re-mount on navigation.** `(dashboard)/layout.tsx:18-47` renders FeedbackWidget, GlobalToast, SupportChat, GlobalJobsIndicator, ConsultingCTA, HubSpotChat as children of the layout. Every nav re-mounts them — HubSpot chat resets unread count, SupportChat polling restarts, mounting animations replay. Wrap in `React.memo` or move to Next.js parallel routes.

## Copy + voice audit

The HUMANIZER.md rule is "people can spot LLM copy in three seconds." A handful of high-traffic pages violate it directly.

- **Quick Checker landing (`check/page.tsx:43`):** "AI-classified NAICS — 87% accuracy." Banned "AI-" prefix and a fake hard stat. Rewrite: "Picks your NAICS codes from your website. Usually gets it right first time — you can correct it if not."

- **Quick Checker (`check/page.tsx:67`):** "Which set-asides would unlock the most additional revenue." "Unlock" is the canonical buzzword. Rewrite: "Which set-asides would open up the most contracts for you."

- **Quick Checker (`check/page.tsx:112`):** mentions "playbooks." Banned. Rewrite to whatever they actually are — checklists, scripts, examples.

- **Signup page (`signup/page.tsx:332`):** "AI-powered email drafts & win strategies." Rewrite: "Email drafts and win strategies, tailored to each opportunity."

- **Layout banner (`(dashboard)/layout.tsx:26`):** "New: Light $39/mo · Pro $89/mo · 14-day free trial. See plans →" is fine but should live in a copy registry.

- **Portal empty state (`portal/page.tsx:309`):** "Your portal is being set up. We'll notify you when there are opportunities or tasks." Passive and unhelpful. Rewrite: "Your account manager is setting up your matches. First opportunities should appear within 48 hours. In the meantime, complete your capability statement so we can score harder against your profile."

- **Hardcoded copy lives in too many files.** `check/page.tsx:17-91` has 30+ STATS/STEPS/DELIVERABLES/TESTIMONIALS/FAQS arrays. `billing/page.tsx:45-100` has FREE_FEATURES/PRO_FEATURES/CONSULTING_FEATURES/FAQ_ITEMS. There's no central registry to run `/humanizer` over. Extract user-facing copy into `src/lib/copy/` (one file per surface) and run a periodic humanizer pass.

- **Several AI prompts bypass HUMAN_VOICE_RULES.** `capture-brief/route.ts:34-48`, `capability-matrix/route.ts:44-71`, `compliance-matrix/route.ts:46-75`, `competitor-suggest/route.ts:66`, `summarize-document/route.ts:117` — none prepend `HUMAN_VOICE_RULES`. The output (win_themes, pitch_angles, mitigations, executive_summary) is all user-facing. Single-line fix per route: `content: \`${HUMAN_VOICE_RULES}\n\n${SYSTEM_PROMPT}\``.

## Mobile responsiveness gaps

- **Pipeline Kanban on phones shows ~1.5 columns with no scroll affordance.** `components/pipeline/KanbanBoard.tsx:210`. Federal contractors check email on phones. They'll think their pipeline has two stages. Default to list view on mobile (toggle exists at `pipeline/page.tsx:103`), or add edge gradient + chevron hint.

- **Onboarding native alerts on validation failure are hostile on mobile.** `onboard/page.tsx:387, 393, 462`. System modals on mobile are hard to dismiss and look like malware popups. Replace with inline red text per field.

- **Cap statement uses native `prompt()` for transcript paste.** `ai-drafter/capability-statement/page.tsx:476`. Single-line native prompt for a multi-paragraph transcript is unusable on mobile. Replace with a styled textarea modal.

- **Settings on mobile is a single long scroll with sticky section nav that flickers.** `settings/page.tsx`. The IntersectionObserver band is 15% — too narrow for short sections, multiple sections fight for the active highlight. Widen the band and consider collapsing all sections except the active one on mobile.

- **Opportunity detail page renders ~15 fetches in series on mount.** `opportunities/[id]/page.tsx:688-828`. On a slow mobile connection users see the page chrome but blank panels for 5-10 seconds. Lazy-load anything below the fold with intersection observers.

- **Dashboard "Strong / Good / Possible" pills look tappable on mobile but do nothing.** `DashboardClient.tsx:332-337`. Worse on mobile where decorative buttons are even more confusing because hover states don't exist. Either wire up or remove.
