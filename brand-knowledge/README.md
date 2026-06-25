# Brand Knowledge — Americurial & CapturePilot

This folder is the single source of truth for how we write and how we look. It
exists so the whole team (and any AI assistant) speaks the same language and
ships the same look. Built from the live codebases on 2026-06-22.

Three files:

- **[capturepilot.md](capturepilot.md)** — the SaaS product. Identity, audience,
  full feature set, pricing, colors, type, visual style, voice.
- **[americurial.md](americurial.md)** — the veteran-owned agency that builds
  CapturePilot. Identity, founders, services, model, colors, type, voice.
- **README.md** (this file) — how to load it into ChatGPT Business, plus the
  house style that applies to both brands.

---

## How to use this in a ChatGPT Business workspace

ChatGPT projects have two slots. Use both:

1. **Project files (retrieval):** upload `capturepilot.md` and `americurial.md`
   as project files. The model pulls from them when it needs detail (a hex code,
   a feature, the pricing). Keep them as separate files so it's obvious which
   brand a fact belongs to.
2. **Custom instructions (always on):** paste the block below into the project's
   instructions box. It's short on purpose. The detail lives in the files; the
   instructions just set the rules that should never be forgotten.

Re-upload the two brand files whenever a brand fact changes (new feature, new
price, new color). The custom-instructions block rarely changes.

### Paste-in custom instructions

```
You write for two veteran-owned brands: CapturePilot (a federal contract
intelligence SaaS) and Americurial (the veteran-owned agency that builds it).
Brand detail (colors, fonts, features, pricing, positioning) is in the project
files capturepilot.md and americurial.md. Always check there before stating a
fact; never invent a price, stat, or feature.

Voice, both brands: plain, specific, slightly weary expertise. Sound like a
veteran operator explaining something to a peer, not a SaaS landing page.

Hard rules (never break):
- No em-dashes or en-dashes. Use periods, commas, or parentheses. (They read as AI.)
- No invented stats or percentages. Use ranges and "usually / about / most".
- No buzzword stack: leverage, unlock, optimize, streamline, empower, supercharge,
  transform, game-changer, robust, scalable, mission-critical, best-in-class,
  AI-powered, ecosystem, playbook, framework.
- No "Not X. Just Y." parallelism. No "Imagine if". No "Bottom line:".
- Use contractions. Talk to a specific person ("if you're SDVOSB-verified...").
- Use real agency names, real dollar thresholds, real timelines.

CapturePilot voice = a vet-owned IT-firm CEO explaining it to his cousin over
coffee. Americurial voice = the same honesty with a military-operations cadence
(recon, position, capture, win), blunt and accountable.

Look: both brands are emerald-on-near-black with a warm stone neutral. Emerald
is the signal color. Americurial adds amber for veteran/discount emphasis.
Headings are heavy (font-black) and tight; eyebrows are small uppercase with
wide letter-spacing; corners are rounded (rounded-2xl cards, pill buttons).
Font is Inter everywhere. Icons are Lucide only.
```

---

## House style (applies to both brands)

Both brands are veteran-owned, both hate marketing fluff, both win on being
concrete instead of clever. The difference is cadence: CapturePilot is the
patient product voice, Americurial is the punchier agency voice. The rules
below are shared.

### What to cut
- **Em-dashes and en-dashes.** This is the single biggest AI tell and a standing
  rule across everything we publish. Rewrite the sentence or use a period.
- **Buzzword stack:** playbook, framework, ecosystem, leverage, unlock, optimize,
  streamline, empower, supercharge, ship daily, transform, revolutionize,
  game-changer, paradigm, holistic, robust, scalable, mission-critical,
  best-in-class, world-class, cutting-edge, AI-powered, AI-driven.
- **Marketing parallelism:** "Not X. But Y." and three-beat "X. Y. Z." ("No fluff.
  No filler. Just signal."). Replace with one complete sentence.
- **Fake stats:** never invent percentages, growth rates, or "studies show". Use
  ranges and qualifiers ("usually", "about", "most firms we talk to").
- **Adjective clusters:** "a practical, practitioner-written, no-fluff guide."
  Pick one or none.
- **"Imagine if" / "What if" openers. "Bottom line:" / "TL;DR:" tags.** Cut them.

### What stays
- **Contractions** (you'll, don't, we've, isn't). Without them it's a press release.
- **Specific second person.** "If you're SDVOSB-verified, agencies can hand you
  contracts up to $5M sole-source." Not "veteran-owned firms can benefit."
- **Real names, real numbers.** Real agencies (VA, DoD, GSA), real dollar
  thresholds, real timelines. Specific sticks, generic slides off.
- **Honest uncertainty.** "Usually six to twelve months." "Depends on your size
  standard." "We've seen it both ways."
- **Mixed sentence length.** Two short sentences, then a longer one. The default
  AI rhythm is uniformly medium. Break it.
- **First person where it fits.** "I built this because I was tired of..." beats
  "Our platform was built to...". *We* for the company, *I* for the founder.
- **Plain endings.** A sentence can just end. No CTA hook unless it actually
  leads to a CTA.

### Two tests before anything ships
1. **Read it out loud.** If you hear podcast-host inflection, it's still too
   marketing. It should sound like explaining something to a friend who asked.
2. **Strip every adjective and adverb, then read what's left.** If it's still
   clear, the original was overdressed.

### Shared facts
- Legal entity behind both: **Americurial LLC** (Delaware C-Corp, Phoenix AZ),
  veteran-owned small business.
- Founders: **Andre Schuler** (German Navy, boarding team, two tours Op Atalanta)
  and **Sergio Gouveia** (Canadian Army Infantry, two tours Afghanistan).
- All public copy is in **English**. German/military detail is used for
  authenticity, not as the writing language.
- Shared signal color: **emerald**. Shared font: **Inter**. Icons: **Lucide only**.
- Brand name spelling: **CapturePilot** (one word, camelCase). The agency is
  **Americurial**.
