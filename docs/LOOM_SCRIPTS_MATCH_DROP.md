# Loom scripts — Match-Drop outreach (Sergio)

Five short talking-head scripts, ordered by **how often we actually find each
gap** across our enriched contractor base. A "data gap" = something our checker
couldn't fill from the website = something a buyer can't verify either = a
near-universal hook. Each pairs with the **Match-Drop** email (matches + findings
go in writing; the Loom makes it personal).

## Priority — pick by frequency (measured over ~2,400 QC'd contractors)
| Gap | We see it on | Script |
|---|---|---|
| No NAICS codes on the site | ~95%+ (not auto-measured — verify by glance) | **#1** |
| No past performance shown | **89%** | #2 |
| Certifications not visible | **85%** | #3 |
| No federal-experience signal | **81%** | #4 |
| No "years in business" shown | **72%** | #5 |

NAICS is #1 because it's nearly universal and the sharpest procurement signal —
but our software doesn't *verify* it per-site (we don't store page text), so it's
a **manual** script: glance at the site for 10 seconds first. The other four are
auto-detected per contractor (see `findings_summary` + `gap_hook` on the record).

## How to use these
- **Pull the contractor record** in admin: `findings_summary` gives you a
  one-line briefing (matches + gaps), `top_matches` the 3 to read aloud, and
  `gap_hook` the exact phrasing to use. Only ever claim a gap the record shows.
- **60–90 seconds.** One problem, three matches, one ask. Drop-off is brutal past 90s.
- **Talk like a person.** Slightly informal, weary-expert. You're doing them a
  favor, not selling.
- **Send the Loom in the Match-Drop email**, under the 3 matches: "Made you a
  60-second video on what we found."

Placeholders: `{first_name}`, `{company}`, `{match_1/2/3}`, `{state}`.

---

## Script #1 — NAICS codes not on the website  *(manual — glance first)*

Hey {first_name}, Sergio here from Americurial — quick one, 60 seconds.

I ran {company}'s site through our own software, the same checker we use for
federal contractors. First thing it flagged: your NAICS codes aren't anywhere on
your site. Sounds small, but here's why it matters — when a contracting officer
or a prime is sizing you up, that's one of the first things they look for. No
codes on the site, and they can't quickly tell what you're cleared to do, so a
lot of them just move on.

That was one of four findings. The bigger thing: while it was running, it pulled
three live opportunities that actually fit {company} right now — those are in the
email under this video.

So my question is just: would you be open to getting back after government work,
especially if I told you there's basically no risk to it — we run the bids, you
only pay if you actually win one? If that's interesting, hit reply and I'll send
the full rundown. Either way, talk soon.

---

## Script #2 — No past performance / client list shown  *(89%)*

Hey {first_name}, it's Sergio at Americurial — real quick.

I ran {company} through our software and the thing that stood out: there's no past
performance anywhere on your site. No client list, no projects, nothing a buyer
can point to and go "okay, these folks have done this before." In federal work
that's the whole game — past performance is what they trust. If it's not visible,
you're starting every conversation from zero.

That's one of four findings I'd love to walk you through. And the reason I'm
reaching out at all: the scan found three open opportunities that fit you right
now. They're in the email under this video.

Quick question — would it be worth getting back into government contracting if it
cost you nothing up front? Because that's how we run it: we do the bidding, you
only pay on a win. Hit reply if you want the full picture.

---

## Script #3 — Certifications / set-asides not visible  *(85%)*

Hey {first_name}, Sergio here from Americurial — 60 seconds, promise.

I checked {company}'s site with our checker and noticed your certifications aren't
listed anywhere. Here's why that's a real miss: a huge chunk of federal work is
set aside specifically for certified small businesses — 8(a), HUBZone, veteran-
owned, women-owned. If a buyer can't see which lane you're in, they can't route
that easier work to you, and that's some of the least competitive money out there.

That was one of the findings. The other reason I'm reaching out — the scan pulled
three live opportunities that fit {company}. They're in the email below.

So, honest question: if there were no risk to it — we run the bids, you only pay
when you win — would you want back in on government work? Reply and I'll send you
everything we found.

---

## Script #4 — No federal-readiness signal on the site  *(81%)*

Hey {first_name}, Sergio from Americurial — give me 60 seconds.

I put {company}'s site through our checker, and the thing that jumped out: there's
nothing on there that signals you do federal work. No mention of agencies, no
contract experience, nothing a government buyer would recognize. I'm guessing you
*can* do the work — but a contracting officer doesn't know that from your site,
and that's the page they land on before they ever call you.

That was one of a few findings. The useful part: the same scan pulled three live
opportunities that line up with what you actually do — they're in the email right
below this.

I'd love to walk you through all of it. And the way we work is no-risk — we find
the bids, we prep them, you only pay if you win. Worth a quick chat to see if it's
worth getting back on the government track? Reply and I'll send everything over.

---

## Script #5 — No "years in business" / credibility signal  *(72%)*

Hey {first_name}, Sergio at Americurial — quick note.

I ran {company}'s site through our software and noticed there's nothing on it that
says how long you've been around — no "founded in," no track record up front. In
federal work that's a quiet credibility killer. A contracting officer is weighing
risk on every award, and "how long have these folks been doing this" is one of the
first gut-checks. If your site doesn't answer it, you're making them guess.

That's one of four findings. And while the scan was running, it found three live
opportunities that fit {company} right now — they're in the email under this video.

So here's my ask: if it were genuinely no-risk — we handle the bidding, you only
pay when you win — would you be open to another run at government work? Reply and
I'll send the whole breakdown.

---

## Closing-line variants (swap to keep them fresh)
- "…would you be open to getting back on the government track? No risk — you only pay if you win."
- "…is this even on your radar this year? If it is, there's no downside to a look — we only get paid when you do."
- "…worst case you walk away with three live opportunities and a punch-list for your site."
- "…if I'm wrong and this isn't a fit, just say so and I'll leave you alone. But I think it's worth a conversation."

## Why this works
We lead with **value we already produced** (3 real matches) and **a concrete,
verifiable problem** (the gap) — not a generic pitch. That puts us in the helping
seat before we've asked for anything, and the no-risk / commission close removes
the only real objection. The Loom makes it land as a person, not a blast.
