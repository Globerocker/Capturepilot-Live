# CapturePilot Sales Simulator — Scoring Rubric

> **For the simulator engine.** This rubric governs BOTH real-time coaching interrupts (per-exchange micro-score) and end-of-call graduation tracking (aggregate 0-10). Read the dual-model section first, then apply the six dimensions.

---

## Dual Scoring Model

### Per-Exchange Micro-Score (1–5 stars)

After every rep turn, the simulator privately scores only the dimensions that turn actually touched. A turn that asked a discovery question only scores Discovery Depth and Tonality. A turn that handled an objection scores Objection Handling and Tonality. The simulator does not penalize a turn for dimensions it had no opportunity to address.

**Interrupt thresholds:**

- ≤ 3 stars on any scored dimension → simulator pauses the call, steps into coach voice, gives one pointed correction, then resumes from the same moment.
- ≥ 4 stars on every scored dimension → simulator continues as the prospect.
- A **flagrant error** (see list below) → simulator always interrupts, regardless of star count.

**Why 1–5 and not 0–10?** The micro-score needs to resolve quickly on a single turn. Five points is enough granularity. The aggregate score uses 0–10 because it captures trajectory and nuance across the full call.

### End-of-Call Aggregate (0–10 per dimension)

After the call ends — whether the rep closes, loses, or stops early — the simulator delivers a scorecard with one 0-10 score per dimension, a one-paragraph narrative per dimension, and a ranked next-focus-area recommendation. This is what feeds the graduation tracker.

---

## Flagrant Errors — Always Interrupt

These bypass the star threshold. The moment the simulator detects any of the following, it interrupts mid-call.

1. **Defending price instead of reframing.** Rep says "that's actually a fair price for what you get" or "other tools cost more." Correct move: redirect to cost-of-inaction.
2. **Giving an unprompted discount.** Rep offers to lower the price before the prospect even pushes back. Signals desperation.
3. **Mis-stating the pricing.** Rep quotes a wrong tier, wrong annual figure, or wrong trial length (e.g. says "30-day trial" instead of 14). This destroys credibility when the prospect reads the checkout page.
4. **Missing an obvious buying signal.** Prospect says "when can we start?" or "do you guys take credit cards?" or "how long does onboarding take?" — rep does not treat it as a close signal and instead keeps pitching.
5. **Accepting a brush-off without a follow-up pin.** Rep lets "let me think about it" or "send me some info" land without pinning a specific next step (date, time, callback, trial start). The call is now dead.
6. **Feature-dumping before confirming pain.** Rep lists three or more features before the prospect has articulated a real problem. Pitch mode, not sale mode.
7. **Talking through silence after the price.** Rep states the price then immediately keeps talking. The silence belongs to the prospect. Rep who fills it first loses.
8. **Apologizing for the product.** Any form of "I know it might seem like a lot," "it's not perfect but," or "some people do prefer to just use SAM.gov for free." Undermines the frame entirely.
9. **Ignoring a stated constraint and pitching the wrong tier.** Prospect says "we're a two-person shop, budget is tight" and rep pitches the $399/mo Agency tier. Shows the rep wasn't listening.
10. **Making a claim that can't be verified.** "We have the highest match accuracy in the market," "nobody else does what we do," "we guarantee you'll win contracts." Unverifiable claims in a B2G context trigger procurement-brain skepticism.
11. **Asking a closed question when a pain-funnel question is needed.** "Do you use SAM.gov?" instead of "Walk me through how you currently find new bids." Yes/no questions kill discovery momentum.
12. **Folding immediately on the first objection.** Prospect says "it's too expensive" once and rep immediately offers a workaround, a discount framing, or a lower tier without any reframe attempt.
13. **Not confirming mutual next step before hanging up.** Call ends without both parties agreeing on what happens next. Even a loss call should end with a defined follow-up.

---

## Dimension 1: Discovery Depth

*Did the rep drill down to cost-of-pain, or stop at surface symptoms?*

**Anchor descriptions:**

| Score | What it looks like |
|---|---|
| **0–2** | Rep asks one or two surface questions ("What's your NAICS code?" "Are you on SAM.gov?") then pivots to pitch. No layers. No silence. Never reaches a dollar figure, a lost bid, or a frustrated owner moment. Prospect feels interviewed, not heard. |
| **3–5** | Rep asks 3–5 questions, gets to the general problem ("we miss bids"), but doesn't press for specifics. How many bids last year? How much revenue did those represent? What did you have to do manually instead? These get skipped or only partially explored. Rep has enough to pitch but not enough to close. |
| **6–8** | Rep runs a real pain funnel. Opens broad, narrows deliberately. Gets to a specific missed bid or lost contract, extracts a dollar value or time cost, asks one more "and what happened because of that?" layer. Prospect has felt understood before the rep says a single feature. |
| **9–10** | Rep goes three layers deep on the most painful moment the prospect mentions. Doesn't rush. Uses "say more about that" and "what did that cost you?" with full comfort in the silence. When the rep eventually ties a feature to this pain, the prospect finishes the sentence for them. No feature was mentioned before the prospect had a chance to sell themselves. |

**Strong moves to reward:** "What's that been costing you in lost revenue?" / "How many hours a week does your BD lead spend just searching SAM.gov?" / Letting a 4-second silence breathe after a vulnerable answer.

**Weak patterns to flag:** Asking only closed questions / Pivoting to features after the first surface symptom / Skipping the "so what happened because of that?" follow-through.

---

## Dimension 2: Pain Crystallization

*Did the rep make the prospect FEEL the pain, or just collect facts?*

Discovery Depth measures whether the rep *asked the right questions.* Pain Crystallization measures whether the rep *reflected the answers back* in a way that made the pain vivid and owned by the prospect.

**Anchor descriptions:**

| Score | What it looks like |
|---|---|
| **0–2** | Rep collects information but never plays it back. Prospect states a pain and rep immediately moves to the next question or jumps to the feature. Pain stays abstract ("yeah we miss some bids sometimes"). |
| **3–5** | Rep summarizes the pain once before pitching ("so it sounds like you're spending a lot of time on SAM.gov manually"). Accurate but flat. No emotional amplification. Prospect nods and waits for the pitch. |
| **6–8** | Rep reflects the specific moment the prospect described ("so you found out about that $180K janitorial bid two days after it closed — and you'd been tracking that agency for six months"). Makes the prospect re-live it briefly. Prospect says "exactly" or "yeah, that's the thing." Rep pauses before moving on. |
| **9–10** | Rep crystallizes the pain into a vivid, owned sentence the prospect didn't have before. "So the real problem isn't that SAM.gov is hard to use. It's that every week there are five or six bids you qualified for, and you'll never know they existed." Prospect goes quiet, or says "that's it exactly." The pain now has a name and a shape. Rep doesn't rush past this moment. |

**Strong moves to reward:** Playing back a specific dollar figure or named bid the prospect mentioned / Labeling the pain before offering the solution / Saying "did I get that right?" after the reflection.

**Weak patterns to flag:** Moving to features the second a pain is stated / Generic reflections ("sounds frustrating") that don't reference specific details the prospect gave / Over-summarizing in a way that makes it sound like a sales script.

---

## Dimension 3: Value Framing

*Did the rep tie features to confirmed pains, or just list the product?*

**Anchor descriptions:**

| Score | What it looks like |
|---|---|
| **0–2** | Rep lists features in sequence — "we have AI proposal writing, we have SLED coverage, we have competitor profiles" — with no connection to anything the prospect said. Might as well be reading the pricing page out loud. Prospect is politely bored. |
| **3–5** | Rep ties one or two features to the pain but the connection is loose. "Since you mentioned missing bids, we score every opportunity HOT/WARM/COLD so you can prioritize." Technically connected, but no quantification, no before/after, no "what would that be worth to you?" |
| **6–8** | Rep frames 2–3 features directly against the specific pains discovered. Uses the prospect's own words. "You mentioned you missed that MATOC pre-solicitation because you weren't watching that agency — our recompete radar and agency alert system would have flagged that 60 days out. Based on what you said, that bid was worth $200K to you. What would catching two of those a year do for your revenue?" |
| **9–10** | Rep presents the product as the precise antidote to the exact pain crystallized in Dimension 2. Doesn't mention features the prospect didn't ask about. Every word earns its place. Uses the prospect's language back at them. Ends the value frame with a question that invites the prospect to calculate ROI out loud ("what would that be worth to you per year?"). Prospect is selling themselves. |

**Strong moves to reward:** Picking only 2–3 features instead of all of them / Using ROI language the prospect can verify / Ending the frame with a question, not a statement.

**Weak patterns to flag:** Mentioning AI proposals to a prospect who hasn't said anything about writing proposals / Quoting feature specs ("up to 9,999 matches per day") without connecting them to a human outcome / Pitching SLED to a federal-only prospect.

---

## Dimension 4: Objection Handling

*Did the rep reframe and redirect, or defend and concede?*

The most common objections in a CapturePilot call: "it's too expensive," "we already use SAM.gov," "I need to talk to my partner," "we're not ready yet," "we tried software before and it didn't work."

**Anchor descriptions:**

| Score | What it looks like |
|---|---|
| **0–2** | Rep immediately justifies, apologizes, or concedes. "I understand, yeah it's not cheap." "We do have a free tier if that helps." "I can ask about a discount." Objection lands and rep folds. Prospect has no reason to move forward. |
| **3–5** | Rep acknowledges the objection, tries a counter, but doesn't fully reframe. "That's fair — but consider that even one contract win pays for a full year." Closer than defending, but still feels like the rep is fighting the objection rather than redirecting through it. |
| **6–8** | Rep acknowledges, validates, isolates ("is it just the price, or is there something else making you hesitate?"), then reframes to cost-of-inaction. "If the price is the only thing in the way, let's do the math — you said you were targeting $500K in new federal revenue this year. At $89/mo, that's $1,068 for the year. If CapturePilot helps you win one $50K contract you would have missed, what's the ROI?" |
| **9–10** | Rep treats the objection as useful signal, not an attack. Curious, not defensive. Uses the objection to dig one more layer. "That's interesting — when you say you already use SAM.gov, are you finding the bids you need there, or is there a gap?" Often the objection contains the hidden pain. Rep never raises their voice or quickens their pace. Frame stays intact. |

**Strong moves to reward:** "Is it the price, or is there something else?" isolation / Reframing "too expensive" to cost-of-inaction before counter / Staying slower and calmer as the prospect pushes back.

**Weak patterns to flag:** Offering the free tier as a concession to a price objection / "I totally understand" as a verbal tic that precedes no real reframe / Speeding up when challenged (signals anxiety).

---

## Dimension 5: Close Attempts

*Did the rep ask for the close at least twice? Did they stay silent after the price?*

**Anchor descriptions:**

| Score | What it looks like |
|---|---|
| **0–2** | Rep never explicitly asks for the close. Call drifts to an inconclusive end. Rep says "so let me know if you want to move forward" or sends a follow-up email offer. No trial start pinned. No credit card moment. Prospect evaporates. |
| **3–5** | Rep asks for the close once, gets a soft objection or a hedge, and backs off. "If you're ready, we can get you started today." Prospect says "I'll think about it." Rep says "no problem, I'll follow up." No second close attempt. No follow-up pin. |
| **6–8** | Rep closes twice. First close at the natural peak of value framing — trial start or payment. Gets a hedge. Handles the hedge with a reframe (see Dimension 4), then closes again. Pins a specific follow-up if the second close doesn't land. "What day works to reconnect — Tuesday or Wednesday?" Prospect leaves with a commitment either way. |
| **9–10** | Rep closes with assumptive confidence. "Let's get you set up with the 14-day trial — you said you want to go after that DHS solicitation that closes in three weeks, so starting today gives you time to run the match feed before you write. I'll walk you through your first HOT match right after we confirm the account." Closes are embedded in the logical continuation of the conversation, not bolted on at the end. Stays completely silent after stating the close. Does not rescue the silence. If the prospect hedges, handles it and closes again. Never closes more than three times on the same call. |

**Strong moves to reward:** Staying silent for 5+ seconds after the close / Tying the trial start to a specific opportunity the prospect mentioned / Offering a second close after handling a hedge instead of retreating to "just think about it."

**Weak patterns to flag:** Ending the call with "just let me know" — this is an abdication / Closing before the prospect has confirmed their pain / Rescuing the silence with "unless you need more time" after a close.

---

## Dimension 6: Tonality and Confidence

*Did the rep sound like a peer, or like a vendor?*

This dimension scores vocal posture, pacing, and frame control — things that are read in the subtext of every exchange. A rep who has perfect words but shaky tonality loses anyway.

**Anchor descriptions:**

| Score | What it looks like |
|---|---|
| **0–2** | Rep sounds apologetic, eager, or nervous. Rushes when challenged. Adds filler phrases ("does that make sense?", "if that's okay with you," "I don't want to waste your time but..."). Volume and pace drift up when the prospect is skeptical. Rep sounds like they need the sale. |
| **3–5** | Rep is mostly steady but breaks frame at one or two moments — usually on price or when the prospect goes cold. Starts strong but loses energy in the back half of the call. Ends with a slightly tentative close. Sounds like a decent salesperson, not a peer. |
| **6–8** | Rep maintains a consistent, unhurried pace throughout. Comfortable with silence. Slows down when the prospect challenges instead of speeding up. Treats the prospect like a business owner who needs help making a smart decision, not a target who needs to be persuaded. Laughs when appropriate. Uses the prospect's first name naturally. |
| **9–10** | Rep radiates the frame: "I'm a peer who knows something that will help you. You should decide. I'm not attached to the outcome." Energy never spikes on objections. Silences are weapons, not gaps. The rep sounds more relaxed at the close attempt than at the opener. Prospect senses no desperation. They are being enrolled, not sold to. Rep sounds exactly the same on call five as on call one. |

**Strong moves to reward:** Slowing down specifically when challenged / Comfortable 4–5 second silences / Matching the prospect's energy level without mirroring their skepticism.

**Weak patterns to flag:** "Does that make sense?" as a verbal tic (signals uncertainty about the explanation) / Rushing through the pricing slide / Any sentence that starts with "I just wanted to..." (apologetic frame).

---

## Top 5 Mistakes the Simulator Calls Out Specifically

1. **The premature pitch.** Rep gets one surface-level pain ("we miss some bids"), confirms it ("right, that's exactly what we solve"), and launches into features before the prospect has articulated cost, frequency, or emotional weight. The prospect hasn't bought into the pain being real yet, so the feature doesn't land.

2. **Filling the post-price silence.** Rep quotes $89/mo, then in the same breath says "which, when you think about it, is less than $3 a day." The prospect never had a chance to react. The rep just told the prospect how to feel about the price instead of letting the price stand. Every time the rep talks through the silence, they negotiate against themselves.

3. **The feature that wasn't asked for.** Rep mentions the AI Proposal Writer to a prospect who said they love writing proposals and just need better lead flow. Rep is pitching the product instead of the prospect's problem. The misfit feature creates doubt about the other features.

4. **Accepting the first hedge as a final answer.** "Let me think about it" is not a no. It is a signal that the rep hasn't made the cost-of-inaction vivid enough, or that a hidden objection exists. Accepting it without asking "what specifically do you need to think through?" hands the deal to inertia.

5. **Closing before confirming pain.** Rep builds rapport, does a quick demo, then says "want to start the 14-day trial?" The prospect hasn't connected their specific problem to the product yet. They are being asked to commit to a solution for a pain they haven't confirmed out loud. The close lands in air.

---

## Top 5 Power Moves the Simulator Rewards Specifically

1. **The cost-of-inaction calculation done out loud with the prospect.** "You said you spend 8 hours a week searching SAM.gov manually. That's 400 hours a year. At your billing rate or your BD lead's salary, what does 400 hours cost you?" This makes the $89/mo price comparison trivial without the rep ever mentioning it.

2. **The crystallization moment.** Rep reflects the pain back in one sharp sentence the prospect hasn't heard before: "So the real issue isn't time — it's that every week you're competing blind and you don't even know what you missed." Prospect goes quiet. This is the moment the sale is made. Rep who stays quiet after this moment, rather than jumping to features, earns top marks.

3. **Connecting the trial to a live opportunity.** "You mentioned the FEMA facility services RFI closes in three weeks. If we start your trial today, the HOT match feed will surface every pre-solicitation in that NAICS cluster this week. You'd go into the submission knowing every competitor who's responded to similar notices in the last 18 months." The trial start becomes a tactical decision about a specific bid, not an abstract SaaS commitment.

4. **The curiosity objection handle.** When the prospect says "we already use SAM.gov," rep responds with genuine curiosity rather than a counter: "Good — what do you find yourself doing manually on top of that?" This almost always surfaces the real gap, and the prospect supplies the objection reframe themselves.

5. **The assumptive-collaborative close.** Rep says "let me pull up the account setup" as if the decision has already been made, then proceeds naturally. If the prospect says nothing to stop it, the close is in motion. If they object, the rep handles it. This is not pressure — it is leading. It only works when the preceding discovery and framing were done well, which is why the simulator rewards it exclusively in calls where D1 and D2 were both scored 6+.

---

## Next-Focus-Area Recommendation Logic

After each end-of-call scorecard, the simulator identifies the **single lowest-scoring dimension** and assigns the next call's practice focus. Tie-breaking rule: if two dimensions score equally low, prioritize the one that appears earlier in this list (Discovery Depth beats Close Attempts when tied, because the former is the root cause and the latter is the symptom).

| Weakest dimension | Next focus |
|---|---|
| Discovery Depth | Next persona is instructed to give minimal surface answers and require 3+ follow-up questions before revealing the real pain. Rep must reach a dollar figure or a named contract/bid. |
| Pain Crystallization | Rep must verbally summarize the pain in one sentence and get the prospect to confirm it before any feature is mentioned. Simulator interrupts if a feature appears before confirmation. |
| Value Framing | Rep is restricted to mentioning only two features per call. Forces prioritization and specificity. |
| Objection Handling | Persona is scripted to throw the prospect's two most likely objections (price + "already use SAM.gov") regardless of how the call goes. Simulator scores only those two exchanges. |
| Close Attempts | Rep is required to close at least twice and stay silent for a minimum of 5 seconds each time. Simulator counts closes and flags any silence under 3 seconds. |
| Tonality and Confidence | Rep must record or transcribe the call and self-annotate every "does that make sense?", speed-up, and apologetic opener before the next session. Simulator coaches only on pacing and frame. |

---

## Graduation Criterion

A partner is cleared for real calls when they score **7 or higher on all 6 dimensions** across **3 consecutive calls on 3 different personas**.

The three personas must represent meaningfully different buyer archetypes — for example, one skeptic, one qualified-but-distracted, and one price-sensitive first-timer. Repeating the same persona type three times does not qualify.

A score of 7+ means: no flagrant errors, no coaching interrupts on the final call, and end-of-call aggregate of 7+ on every dimension — not a rounded average. A 9 on Close Attempts cannot compensate for a 5 on Discovery Depth.

After graduation, the simulator shifts to maintenance mode: one call per week at random persona selection, with full scoring. If any dimension drops below 6 on two consecutive maintenance calls, the partner returns to focused practice on that dimension before running real calls that week.

---

## Quick Reference Card

```
INTERRUPT TRIGGER: ≤ 3 stars on any micro-dimension OR any flagrant error
RESUME: one pointed correction, replay from same moment
GRADUATE: 7+ on all 6 dims, 3 calls, 3 different personas, no coaching interrupts on final call

D1 Discovery Depth         — reach cost-of-pain, not just surface symptoms
D2 Pain Crystallization    — make the prospect feel it, not just confirm it
D3 Value Framing           — features tied to this prospect's stated pains only
D4 Objection Handling      — reframe → redirect, never defend → concede
D5 Close Attempts          — close twice, stay silent after price
D6 Tonality & Confidence   — peer frame, not vendor frame, from open to close
```
