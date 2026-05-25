# Backlink-Outreach Email Template (DRAFT — DO NOT SEND YET)

Status: **Draft — awaiting user review before any send.** Stored at this path so we can iterate without burning impressions on real recipients.

The premise: every published contractor profile at `www.capturepilot.com/contractors/<slug>` is a real, ego-positive landing page about the company. Reach out to the person responsible (CEO / Business Development / Capture Manager) with a heads-up + soft ask for a backlink. Many will link from their "As Featured In" / "Press" / "Industry Recognition" pages — high-quality, contextually-relevant backlinks for our SEO.

## Pipeline (when activated)

1. **Trigger**: after a profile page has been LIVE for 7 days AND has a `claim_email` or scraped `company_website` we can derive a contact from (Apollo).
2. **Cap**: max 5 outreach sends per day. Hand-checked by an admin first until the template proves out.
3. **State machine**: `outreach_drafted_at` → admin approves → `outreach_sent_at` → optional reply → `outreach_replied_at`. Backlink earned → manual `backlink_url` entry.
4. **Suppression list**: a row in the `claim_email` field marks the contractor as "claimed" and triggers a different template (welcome onboard, not cold pitch).

## Template — V1

**Subject line A/B**:
- "Your federal contracting profile is live at CapturePilot"
- "{{first_name}}, we just published {{business_name}}'s federal contracting profile"
- "{{business_name}} is ranked #{{naics_rank}} in NAICS {{primary_naics}} — see your CapturePilot profile"

**From**: `Andre Schuler <andre@capturepilot.com>` (real person, our default)

**Reply-to**: `andre@capturepilot.com`

**Body** (plain text, no HTML in v1):

```
Hi {{first_name}},

I run CapturePilot — we maintain a directory of US federal contractors with verified award histories. I just published {{business_name}}'s profile because your firm came up as a strong performer in our NAICS-{{primary_naics}} rankings.

Your page is here: https://www.capturepilot.com/contractors/{{slug}}

A few highlights we surfaced:
  • Federal Contracting Score: {{federal_score}}/100
  • Lifetime federal awards: ${{total_awarded_millions}}M
  • Top agency: {{top_agency}}
  • {{badges_summary}}

No action needed from you — the profile is live and free. If anything is off, hit reply and I'll fix it.

If you'd like, you can also "claim" the profile to add your team, capability statement, and pipeline detail. That's free for verified contractors at https://www.capturepilot.com/contractors/{{slug}}#claim

One small ask: if the profile is useful to you, we'd be grateful if you mentioned us on your website — most contractors put a "featured in" or "press" page somewhere, and a link from {{company_website}} would help other small contractors discover the directory. Something like:

   <a href="https://www.capturepilot.com/contractors/{{slug}}">Featured on CapturePilot's Federal Contractor Directory</a>

Either way — thanks for what you do. Federal procurement runs on small contractors like yours.

— Andre Schuler
   CapturePilot
   https://www.capturepilot.com
```

## Personalization variables (auto-populated)

| Variable | Source |
|---|---|
| `{{first_name}}` | Apollo person enrichment (POC name's first token) |
| `{{business_name}}` | `contractor_profile_pages.business_name` |
| `{{primary_naics}}` | `.primary_naics` |
| `{{naics_rank}}` | `.naics_rank` |
| `{{slug}}` | `.slug` |
| `{{federal_score}}` | `.federal_score` |
| `{{total_awarded_millions}}` | `.total_awarded_amount / 1_000_000` formatted |
| `{{top_agency}}` | `.top_agency` |
| `{{badges_summary}}` | One-line natural-language summary of `.badges[]` |
| `{{company_website}}` | `.company_website` |

## Open questions for the user

1. **From name** — `Andre Schuler` (founder, personal touch) vs. `CapturePilot Editorial` (less personal but scales)?
2. **Outreach volume** — start with 5/day or 10/day? Higher = more potential noise.
3. **Subject line preference** — A, B, C, or rotate?
4. **Reply tracking** — should we use Resend tags to auto-mark `outreach_replied_at`, or rely on manual entry?
5. **Suppression triggers** — should an `unsubscribe` reply also nuke their contractor_profile_pages row? Or just mark them no-contact and keep the page indexed?

## Activation checklist (before first send)

- [ ] User reviews and approves template wording
- [ ] User picks subject line variant + outreach volume cap
- [ ] Resend domain `capturepilot.com` is SPF + DKIM verified (already verified for /api/leads)
- [ ] Outreach state-machine endpoint built: `/api/admin/contractor-profiles/outreach`
- [ ] Manual "send for this contractor" button in `/admin/contractor-profiles` UI
- [ ] First 5 outreach sends are admin-reviewed individually (not auto)
- [ ] Track CTR + reply rate for 30 days before scaling

## Risks

- **Spam complaints** — even with personalization, this is unsolicited outreach. Keep volume low and value-first. Use a real From address (mine). Always include the unsubscribe path (Resend handles this with the header).
- **Apollo accuracy** — Apollo's contact data is ~70-85% accurate. Email a contractor's general info@ address as fallback when no POC name is available.
- **Linking patterns** — Google doesn't reward link schemes. If 20 contractors all use the same anchor text linking to us, it flags. Vary the suggested link copy in the template across batches.
