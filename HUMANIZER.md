# The Humanizer — Voice & Copy Rules

The canonical style guide for every piece of writing CapturePilot ships, whether a human or an AI wrote the first draft. Linked from [CLAUDE.md](CLAUDE.md) and imported at runtime from [`dashboard/src/lib/llm/humanizer.ts`](dashboard/src/lib/llm/humanizer.ts).

If you're an AI writing for CapturePilot — blog posts, landing pages, capability statements, emails, proposals — these rules override your defaults.

## Why this exists

People can spot LLM-written copy in three seconds. They don't trust it. They scroll past it. Federal contractors specifically — our audience — are middle-aged operators who hate marketing fluff and respond to plain, specific, slightly weary expertise. The voice we want sounds like a vet-owned IT firm CEO explaining something to his cousin over coffee, not a SaaS landing page.

## What gets cut

These are the markers people instinctively associate with AI marketing slop. Avoid them.

### Buzzword stack
Don't use these unless you genuinely need them:

> playbook, framework, ecosystem, leverage, unlock, optimize, streamline, empower, supercharge, ship, ship daily, build in the open, transform, revolutionize, game-changer, paradigm, deep-dive, holistic, robust, scalable, future-proof, mission-critical, best-in-class, world-class, cutting-edge, AI-powered, AI-driven

### Marketing parallelism
Skip the rhythmic "not X, but Y" / "X. Y. Z." patterns:

- ❌ "Not a database. An intelligence platform."
- ❌ "Practical. Practitioner-written. Real."
- ❌ "No fluff. No filler. Just signal."
- ✅ "It's basically a smarter SAM.gov search, and it cuts our weekly review from ten hours to about one."

### Hyped headlines
Skip the em-dash bridge plus alliterative accent:

- ❌ "SDVOSB Contracts Are Worth — $20B Per Year"
- ❌ "Stop Wasting Hours on — SAM.gov Search"
- ✅ "There's roughly $20 billion in federal work that nobody else can bid on"
- ✅ "You don't actually need to spend ten hours a week on SAM.gov"

### Fake stats
Don't invent specific percentages, growth rates, or "studies show" claims. Use ranges and qualifiers:

- ❌ "Increases win rates by 73%."
- ✅ "Most firms that use it tell us their hit rate roughly doubles."
- ❌ "Trusted by 10,000+ contractors."
- ✅ "We have a few hundred firms using it, mostly veteran-owned."

### Em-dash overuse
Em-dashes are a tell. Use them sparingly. Prefer periods, commas, or just rewriting the sentence.

- ❌ "We pull this from our internal release log — and it takes a few minutes to refresh after a deploy — try again in a bit."
- ✅ "We pull this from our internal release log, and it takes a few minutes to refresh after a deploy. Try again in a bit."

### Tag-stacking adjectives
Cut adjective clusters. Pick one or none.

- ❌ "A practical, practitioner-written, no-fluff guide."
- ✅ "Written by people who've done this work."

### "Imagine if" / "What if"
Never open with hypotheticals. Skip "Imagine being able to..." entirely.

### "Bottom line" / "TL;DR"
Don't summarize at the start or end with marketing tags. Just say the thing.

## What stays

### Contractions
Use them. *You'll, don't, we've, isn't, can't, it's.* Without contractions, sentences sound like a press release.

### Specific second-person
Talk to a real person, not a category:

- ❌ "Veteran-owned firms benefit from SDVOSB set-asides."
- ✅ "If you're SDVOSB-verified, agencies can hand you contracts up to $5M without anyone else bidding."

### Concrete examples and real names
Mention real agencies, real dollar thresholds, real timelines. Generic claims (`federal agencies set aside billions`) are forgettable; specific ones (`the VA alone spends about $4B with SDVOSBs a year`) stick.

### Honest uncertainty
Federal contracting is messy. Say so when it is.

- "Usually six to twelve months."
- "Depends on your size standard."
- "In our experience, that path stops working past about $2M."
- "We've seen it both ways."

### Mixed sentence length
Vary it. Two short sentences in a row, then a long compound one. The default LLM rhythm is uniform medium-length sentences; humans aren't uniform.

### First person where it fits
"I built this because I was tired of..." beats "Our platform was built to address..." every time. Use *we* for the company, *I* for the founder, when the sentence calls for it.

### Plain endings
End paragraphs without a CTA hook unless the section actually has one. Sentences can just end.

## How to test a draft

Read it out loud. If you hear yourself doing a podcast-host inflection, it's still too marketing. If it sounds like you're explaining something to a friend who asked a question, it's there.

A second test: take out every adjective and every adverb. Read what's left. If it's still informative and clear, the original was overdressed.

## Where this gets enforced

- **AI writing routes**: every prompt in `dashboard/src/app/api/ai/*` and `dashboard/src/app/api/cron/publish_next_blog`, `dashboard/src/app/api/cron/backlink_outreach_drafter` imports `HUMAN_VOICE_RULES` from `@/lib/llm/humanizer` and prepends it.
- **Manual writing**: anyone editing a page in `website/app/` should read this file first.
- **The `/humanizer` Claude Code skill**: invoke it in a session to have Claude review the current selection or recently changed files against these rules and propose rewrites.
