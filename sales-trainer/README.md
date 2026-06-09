# CapturePilot Sales Trainer

A closing-call practice simulator built as a Claude Project by André + Claude. You play the closer. The AI plays a realistic federal-contracting buyer — and stops mid-call to coach you when you fumble, lets you retry the same exchange, then picks up exactly where you left off. It is not a FAQ bot or a product tour. It is deliberate practice under pressure, scored and tracked until you are ready for real calls.

---

## Files in this simulator

| File | What it is |
|---|---|
| `00_simulator_system_prompt.md` | Master system prompt — the engine. Paste this into your AI platform's "system" or "project instructions" field. |
| `05_scoring_rubric.md` | The full 6-dimension scoring rubric with anchor descriptions, flagrant error list, and graduation logic. The simulator uses this internally. Read it at least once so you know what's being measured. |
| `personas/03_growth_stage_cfo.md` | Marcus Williams — growth-stage CFO with a board, 40-person IT firm, $4M → $12M mandate. High difficulty. |
| `personas/04_first_time_curious.md` | David Park — first-time curious, commercial cleaner, no SAM.gov registration, never bid federal. Tests your ability to downsell appropriately. |

Two additional personas (Robert Garcia and Patricia Chen) are fully described inside `00_simulator_system_prompt.md` and do not require separate files — the simulator has everything it needs to play them.

---

## How to install it

### Path A — Claude Project (recommended)

This is the fastest path and the one that gives you the best experience, including voice mode on your phone.

1. Go to [claude.ai](https://claude.ai) and sign in.
2. In the left sidebar, click **Projects**, then **New Project**.
3. Name it `CapturePilot Sales Trainer`.
4. Click **Add content** (or the equivalent "upload files" option in your Claude interface).
5. Upload each file in this folder: `00_simulator_system_prompt.md`, `05_scoring_rubric.md`, and the two persona files in `personas/`.
6. In the **Project Instructions** field, paste the full contents of `00_simulator_system_prompt.md`.
7. Save the project.

Every new conversation you start inside this project automatically has the simulator loaded. Open a conversation, type a message, and you are in.

### Path B — ChatGPT Custom GPT

1. Go to [openai.com](https://openai.com) and open **My GPTs → Create a GPT**.
2. In the **Instructions** field, paste the full contents of `00_simulator_system_prompt.md`.
3. Under **Knowledge**, upload `05_scoring_rubric.md` and the two persona files.
4. Name the GPT `CapturePilot Sales Trainer`, save it, and set visibility to **Only me**.
5. Open the GPT and start a session.

Note: ChatGPT voice mode works on mobile but the coaching interrupts and formatting may render slightly differently than in Claude. Both work; Claude is the native build.

### Path C — Standalone prompt (no account setup)

If you just want to try it without creating a project or custom GPT:

1. Open a new Claude conversation at [claude.ai](https://claude.ai).
2. Paste the full contents of `00_simulator_system_prompt.md` as your first message.
3. Attach `05_scoring_rubric.md` and the persona files you want to use.
4. Start practicing.

This works for a single session. The simulator won't retain context across conversations in this mode, and there's no graduation tracking across sessions — it resets each time.

---

## Day-to-day practice

### Daily routine (15–20 minutes per session)

One persona per session. Do not hop between personas in a single conversation — you will not get deep enough into any one arc to practice the late-stage objections and close attempts.

A good session looks like this:

1. Open the project, type a message to start.
2. Pick a persona or type `random`.
3. Choose **drill mode** (interrupts often, even on good exchanges) or **live mode** (interrupts only on real misses). If you are new or working on a specific weakness, use drill mode. If you are past the early reps and want to find your flow, use live mode.
4. The simulator sets the scene and waits. You speak first — always.
5. Run the call until it closes (win or loss) or until you type `END CALL`.
6. Read the end-of-call debrief and note your weakest dimension. That is your focus for the next session.

### Weekly rotation

Cycle through all four personas across the week so you are not just getting comfortable with one buyer type:

| Day | Persona | Why |
|---|---|---|
| Monday | Robert Garcia (SDVOSB IT owner, skeptical) | Starts the week hard. He asks ROI questions and calls out vague claims. |
| Wednesday | Patricia Chen (ex-Lockheed PM, analytical) | Low urgency buyer. Practices patience and the recompete/teaming close. |
| Thursday | Marcus Williams (growth-stage CFO) | Financially literate. Trains ROI framework construction and executive escalation. |
| Friday | David Park (first-time curious) | End the week on a different skill — downselling and building trust with a low-ticket, high-potential buyer. |

You do not have to follow this exactly. The important thing is that you are not avoiding any persona. The one you want to skip is the one you need the most.

### Voice mode

Open Claude on your phone. Start a session inside the CapturePilot Sales Trainer project. Tap the microphone icon and speak out loud, exactly as you would on a real call. This is the highest-value practice format because it removes the crutch of composing written responses and forces you to rely on actual tonality and pacing — the things that are hardest to fake in a live call.

The simulator works in voice mode. Coaching interrupts will still fire. Run at least two sessions per week in voice.

---

## How to read the after-call score

At the end of each session (when you type `END CALL` or the call closes), the simulator drops out of character and delivers a scorecard. Here is what each dimension means and what to look for.

| Dimension | What it measures | Common failure mode |
|---|---|---|
| **Discovery** | Did you reach the cost of the prospect's pain — a dollar figure, a named missed bid, a real number — or did you collect surface symptoms and pitch? | Asking one or two closed questions ("Are you on SAM.gov?") then pivoting to features. |
| **Pain Crystallization** | Did you reflect the pain back to the prospect in a way that made it vivid and owned by them — or did you just acknowledge it and move on? | Saying "sounds like you're losing time on SAM.gov" and immediately jumping to the product. |
| **Value Framing** | Did you tie features to the specific pains this prospect named — or did you list the product? | Mentioning the AI Proposal Writer to a prospect who said they love writing proposals. |
| **Objection Handling** | When a concern came up, did you acknowledge → reframe → redirect — or did you defend, cave, or skip it? | Offering the free tier as a concession the moment someone says the price is high. |
| **Close Attempts** | Did you move toward a close when a buying signal appeared? Did you stay silent after stating the price? | Ending the call with "just let me know" — no next step, no date, no commitment. |
| **Tonality** | Did you sound like a peer who knows something useful, or like a vendor who needs the sale? | Speeding up when challenged, adding "does that make sense?" as a verbal tic, apologizing for the product. |

Each dimension scores 0–10. The total is out of 60. A score of 42 or higher (averaging 7 per dimension) means you are performing at a level where the skills are transferable to a real call. Below 42 means there is a specific gap — use the "Weakest dimension" line in the debrief to direct your next session.

One rule the simulator enforces: a 9 on Close Attempts cannot compensate for a 5 on Discovery. Every dimension has to clear the threshold on its own.

---

## Graduation criteria

You are cleared for real calls when you score 7 or higher on all 6 dimensions across 3 consecutive calls on 3 different personas.

The three calls must cover meaningfully different buyer types — you cannot graduate on three Robert Garcia calls. One skeptic, one analytical-low-urgency, and one price-sensitive buyer (or similar spread) is the intent.

On the final qualifying call, there should be no coaching interrupts. Not fewer — none. Interrupts are the simulator's signal that something went wrong in the moment. A clean call means the fundamentals held under pressure.

After graduation, the simulator shifts to maintenance mode: one call per week at random persona, full scoring. If any dimension drops below 6 on two consecutive maintenance calls, return to focused practice on that dimension before running real calls that week.

---

## Keeping the skills sharp — drop in real call transcripts

Once you are running real calls, the simulator can work in reverse: paste a transcript or your written notes from a real call, then type:

> PAUSE — review this transcript from a real call I had today. Coach it the same way you would coach a practice session.

The simulator will apply the same 6-dimension rubric to your actual call, flag the moments that cost you, and tell you what to say instead. This is the fastest feedback loop available and is more valuable than any amount of abstract practice. Every real call becomes material for the next practice session.

---

## FAQ

**Do I need to read the persona files before practicing?**

No. The simulator has all four personas loaded in the system prompt and will play any of them without you reading the files first. The persona files are reference material — read them if you want to understand the psychology behind a persona, study their objections in advance, or debrief a bad call.

**Can I practice the same persona multiple times?**

Yes, and you should. Each call will play out differently depending on which direction you take the discovery. But do not use the same persona for all three graduation calls — you need to demonstrate range.

**What does "drill mode" vs. "live mode" mean in practice?**

Drill mode interrupts after any exchange you scored 4/5 or lower on any relevant dimension — including exchanges that were decent but not sharp. It is loud and relentless. Use it when you are building a skill from scratch or fixing a specific pattern. Live mode interrupts only on real misses (2/5 or below) and lets you run longer without breaking the flow. Use it when you are building fluency and want to feel what a clean full-length call feels like.

**What if I make a factual mistake about CapturePilot's pricing or features?**

The simulator will interrupt immediately — this is on the flagrant error list regardless of mode. Mis-stating pricing (for example, quoting a 30-day trial when the actual trial is 14 days) creates a credibility problem the moment the prospect reads the checkout page. The simulator treats these as hard stops because in a real call, there is no retry.

**Can I use this for team training?**

Yes. Each team member runs their own sessions independently. There is no shared state between conversations. If you want to compare scores across the team, have everyone run the same persona on the same day in live mode and share the end-of-call scorecards.

**What if I feel stuck on the same dimension across multiple sessions?**

Tell the simulator at the start of a session: `INTERRUPT MORE — focus on [dimension name]`. It will interrupt specifically on that dimension, even on exchanges that were otherwise clean. You can also ask the simulator during a PAUSE to give you one-line script examples for that specific moment, then practice delivering them until they feel natural.

**The simulator said I mis-sold David on Pro. What does that mean?**

David Park is pre-SAM registration, no certifications, and sub-$200K revenue. Closing him on Pro is selling him a tool he is not ready to use — he will cancel in 30 days and have a bad experience. The right close for David is the Federal Launch Kit ($70 one-time) plus the 14-day free trial. The skill this tests is reading the account and matching the offer to actual readiness, not closing at ceiling. A $70 win with David is a real win.

**How current is the pricing in the simulator?**

The authoritative pricing source is `dashboard/supabase/migrations/111`. The simulator's product knowledge reflects that migration. Note: the public marketing website may still show outdated pricing ($199/mo, 30-day trial) as of early June 2026 — the simulator always defers to the migration, not the website.

---

## Maintenance — keeping the simulator current

When product, pricing, or personas need updating, André makes the changes directly in `00_simulator_system_prompt.md`. The other files (`05_scoring_rubric.md`, persona files) change less frequently — the rubric dimensions and persona psychology are stable.

After any update to `00_simulator_system_prompt.md`, re-paste it into the Claude Project's **Project Instructions** field. Uploaded knowledge files update automatically when you re-upload them to the project.

If a persona needs a full refresh (for example, if the ICP shifts meaningfully or a new tier creates a different typical buyer), update the corresponding persona file and re-upload it to the project. The simulator will incorporate the new version in the next session.

---

*Built by André + Claude, June 2026. Last updated: 2026-06-09.*
