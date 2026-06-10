/**
 * cpars-past-performance-guide-pdf.build.mjs
 * FLK v1.5 — 11_Post_Award_Compliance
 *
 * Builds FLK_11_CPARS_Past_Performance_Guide.pdf using the pdf-builder pipeline.
 * Run: node assets/starter-pack/rebuilt/cpars-past-performance-guide-pdf.build.mjs
 */

import { renderPdf } from "../../../tools/pdf-builder/render.mjs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = resolve(__dirname, "../../../");

const DEPLOY = resolve(
  REPO_ROOT,
  "dashboard/public/starter-pack/11_Post_Award_Compliance/FLK_11_CPARS_Past_Performance_Guide.pdf"
);

const config = {
  id: "flk-cpars-past-performance-guide",
  title: "CPARS Past Performance Guide",
  slug: "flk-cpars-past-performance-guide",
  pages: 14,
  footerLabel: "CAPTUREPILOT · POST-AWARD COMPLIANCE",
  headerLabel: "CPARS GUIDE",

  parts: [
    // ─── COVER ──────────────────────────────────────────────────────────────────
    {
      type: "cover",
      eyebrow: "POST-AWARD COMPLIANCE",
      titleLines: [
        "CPARS:",
        "Your Past",
        "Performance",
        "Playbook."
      ],
      accentWord: "Playbook",
      badge: "CPARS GUIDE",
      pages: 14,
      toolStrip: [
        { num: 1, title: "5 Rating Areas",    desc: "Quality, Schedule, Cost, Management, SBS" },
        { num: 2, title: "Rating Scale",       desc: "Exceptional to Unsatisfactory — what each means" },
        { num: 3, title: "Your Rights",        desc: "How and when to use your comment period" },
        { num: 4, title: "Day-1 Setup",        desc: "Set yourself up for Exceptional from contract start" }
      ]
    },

    // ─── TOC ────────────────────────────────────────────────────────────────────
    {
      type: "toc",
      title: "Eight sections. One past performance strategy.",
      footerLabel: "CAPTUREPILOT · POST-AWARD COMPLIANCE",
      parts: [
        {
          label: "/ WHY CPARS MATTERS",
          items: [
            {
              code: "S01",
              title: "Why CPARS Matters More Than Your Win Rate",
              desc: "Past performance is the single factor that follows you from contract to contract. What CPARS is, where it lives, who can see it, and why a Marginal rating on a $200K contract can kill a $5M bid.",
              page: 3
            }
          ]
        },
        {
          label: "THE RATING SYSTEM",
          items: [
            {
              code: "S02",
              title: "The 5 Rating Areas",
              desc: "Quality, Schedule, Cost Control, Management, and Small Business Subcontracting — what each area actually tests and which one evaluators weight most heavily.",
              page: 4
            },
            {
              code: "S03",
              title: "The Rating Scale — What Each Rating Actually Means",
              desc: "Exceptional, Very Good, Satisfactory, Marginal, Unsatisfactory. Not just definitions — how future SSEBs interpret each one and what it does to your score.",
              page: 5
            }
          ]
        },
        {
          label: "YOUR RIGHTS + DEFENSES",
          items: [
            {
              code: "S04",
              title: "Your Right to Comment — and When to Use It",
              desc: "The 14-day comment window, what to write, when to push back hard, and when silence is the better play. Real language that works.",
              page: 7
            },
            {
              code: "S07",
              title: "The CPARS Appeal Process",
              desc: "Formal appeals to the ASBCA, agency IG complaints, and the SBA's role for small business disputes. When each path makes sense.",
              page: 11
            }
          ]
        },
        {
          label: "PROACTIVE PERFORMANCE",
          items: [
            {
              code: "S05",
              title: "How to Set Yourself Up for Exceptional from Day 1",
              desc: "The practices — kickoff documentation, interim rating reviews, CO relationship cadence — that separate contractors who consistently earn Exceptional from those who earn Satisfactory and wonder why.",
              page: 8
            },
            {
              code: "S06",
              title: "Common Reasons Contractors Get Marginal or Unsatisfactory",
              desc: "The top 8 causes, with the root pattern behind each one. Most are preventable if you start managing against them on day one.",
              page: 9
            },
            {
              code: "S08",
              title: "Building a CPARS Narrative Log from Day 1",
              desc: "A running contemporaneous log transforms your 14-day comment window from a scramble into a structured rebuttal. Templates and cadence included.",
              page: 12
            }
          ]
        }
      ]
    },

    // ─── SECTION 1: WHY CPARS MATTERS ────────────────────────────────────────────
    {
      type: "content",
      headerLabel: "S01 · WHY CPARS MATTERS",
      markdown: `<div class="eyebrow">SECTION 01 · WHY CPARS MATTERS MORE THAN YOUR WIN RATE</div>

# Past performance follows you. Win rate doesn't.

Your pipeline metrics look internal — opportunities pursued, proposals submitted, win percentage. CPARS is the metric that lives in a government database, accessible to every contracting officer in the federal government, for three years after each contract closes.

A Marginal rating on a $200K janitorial contract at DHS shows up when you're evaluated for a $4.5M USAF set-aside. The evaluator scoring your Past Performance factor pulls up PPIRS (the Past Performance Information Retrieval System, where CPARS feeds). They see it. They score you down. You probably don't even know it happened.

## What CPARS Is

CPARS (Contractor Performance Assessment Reporting System) is the DoD-originated, government-wide system for evaluating contractor performance on federal contracts. FAR 42.15 governs it. Every assessment goes into PPIRS, which feeds into SAM.gov's past performance module. Contracting officers across all agencies can see every rating.

**Coverage thresholds (current FAR 42.1502 requirements):**

<table>
  <thead>
    <tr><th>Contract Type</th><th>Dollar Threshold</th><th>Rating Frequency</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Systems / Services / Supply</strong></td>
      <td>&gt; $150,000</td>
      <td>Annually + at completion</td>
    </tr>
    <tr>
      <td><strong>Architect-Engineering</strong></td>
      <td>&gt; $35,000</td>
      <td>Annually + at completion</td>
    </tr>
    <tr>
      <td><strong>Construction</strong></td>
      <td>&gt; $700,000</td>
      <td>At completion (some interim)</td>
    </tr>
    <tr>
      <td><strong>IT / Professional Services</strong></td>
      <td>&gt; $150,000</td>
      <td>Annually + at completion</td>
    </tr>
  </tbody>
</table>

## How It Flows into Future Awards

When an agency issues an RFP with a Past Performance evaluation factor, the SSEB (Source Selection Evaluation Board) assigns each offeror a confidence rating — typically Substantial Confidence, Satisfactory Confidence, Limited Confidence, No Confidence, or Unknown (for new entrants). That confidence rating maps directly to your CPARS record.

On competitive contracts where Past Performance is weighted 20–30% of the total score, the difference between Exceptional and Satisfactory across three prior contracts is routinely the margin between win and loss.

<div class="callout callout--emerald">
  <div style="font-family:'IBM Plex Mono',monospace;font-size:8.5pt;font-weight:600;letter-spacing:0.16em;color:#047857;text-transform:uppercase;margin-bottom:2mm;">THE CORE INSIGHT</div>
  <strong>CPARS isn't a report card. It's a sales asset — or a liability.</strong> Every contract you perform is either building or eroding your competitive position on the next contract. Most small contractors treat it as administrative overhead. The ones who win consistently treat it as a second proposal process.
</div>
`
    },

    // ─── SECTION 2: THE 5 RATING AREAS ───────────────────────────────────────────
    {
      type: "content",
      headerLabel: "S02 · THE 5 RATING AREAS",
      markdown: `<div class="eyebrow">SECTION 02 · THE 5 RATING AREAS</div>

# Five factors. Each one scored independently. All of them visible.

CPARS doesn't give you one overall score. It gives you a separate rating in each of up to five areas, depending on contract type. Future evaluators see the full breakdown — not just an aggregate. A weak Cost Control score on a T&M contract tells them something specific about you, even if your Quality rating was Exceptional.

<table>
  <thead>
    <tr><th>Rating Area</th><th>What It Tests</th><th>Most Common to Contracts</th><th>Weight in Source Selections</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Quality of Product or Service</strong></td>
      <td>Did you deliver what the SOW said, at the quality standard specified? Does the work conform to contract requirements? Are there open deficiencies or acceptance rejections?</td>
      <td>All contract types</td>
      <td>Typically the highest-weighted area. Some solicitations assign it 40–50% of the past performance score.</td>
    </tr>
    <tr>
      <td><strong>Schedule</strong></td>
      <td>Did you meet delivery dates, project milestones, and reporting deadlines? Were delays caused by you or by government-caused issues? Did you proactively notify the CO when schedule risk materialized?</td>
      <td>All contract types</td>
      <td>High weight on construction, systems integration, and IT development. Moderate on services contracts.</td>
    </tr>
    <tr>
      <td><strong>Cost Control</strong></td>
      <td>Did you manage spending relative to budget? On cost-reimbursable and T&M contracts: did you use EACs (Estimates at Completion) accurately? Did you identify overruns early or did the CO find out late?</td>
      <td>Cost-type and T&M contracts. Not typically scored on fixed-price.</td>
      <td>High weight when scored. A pattern of cost overruns signals systemic estimating problems to evaluators.</td>
    </tr>
    <tr>
      <td><strong>Business Relations / Management</strong></td>
      <td>Did you proactively communicate? Were you responsive to CO direction? Did subcontract management problems become prime problems? Did you notify the government of problems before they escalated?</td>
      <td>All contract types; especially service and support contracts</td>
      <td>Often the deciding factor between Very Good and Exceptional. COs reward contractors who make their jobs easier.</td>
    </tr>
    <tr>
      <td><strong>Small Business Subcontracting</strong></td>
      <td>Did you meet the small business subcontracting plan goals you committed to? Did you file ISR/SSR reports on time in eSRS? Did you actually use the small businesses you listed in your plan?</td>
      <td>Contracts &gt; $750,000 awarded to large businesses with approved subcontracting plans</td>
      <td>Separate narrative. Contracting officers at agencies with aggressive SB goals weight this heavily. Missed goals can downgrade your entire Business Relations score.</td>
    </tr>
  </tbody>
</table>

<div class="callout">
  <div class="eyebrow" style="margin-bottom:2mm;">WHAT EVALUATORS ACTUALLY DO</div>
  <p style="margin:0;">When a source selection board reviews your CPARS record, they look at the narrative text, not just the rating symbol. A Satisfactory rating with a narrative that says "contractor experienced significant quality deficiencies in the first six months" is read very differently from one that says "contractor maintained consistent quality throughout, with no deficiencies." Write your comments accordingly — the narrative travels with the rating.</p>
</div>
`
    },

    // ─── SECTION 3: THE RATING SCALE ─────────────────────────────────────────────
    {
      type: "content",
      headerLabel: "S03 · THE RATING SCALE",
      markdown: `<div class="eyebrow">SECTION 03 · THE RATING SCALE — WHAT EACH RATING ACTUALLY MEANS TO FUTURE EVALUATORS</div>

# Five ratings. Two that win you contracts. Three that hurt you.

The CPARS rating definitions come from FAR 42.1503 and the CPARS Policy Guide. Every word in them is intentional. Here's what the ratings say on their face — and how source selection evaluators read them in practice.

<table>
  <thead>
    <tr><th>Rating</th><th>Official Definition (FAR 42.1503)</th><th>What Evaluators Actually Read</th><th>Source Selection Impact</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong style="color:#047857;">Exceptional (E)</strong></td>
      <td>Performance meets contractual requirements and exceeds many to the Government's benefit. The contractual performance of the element or sub-element being assessed was accomplished with few minor problems, for which corrective actions taken by the contractor were highly effective.</td>
      <td>"This contractor makes government work easier. They solved problems before we knew we had them. We'd sole-source them again if we could."</td>
      <td>Maps to Substantial Confidence in most source selections. On a weighted past performance factor, three Exceptional ratings across relevant contracts can be decisive.</td>
    </tr>
    <tr>
      <td><strong style="color:#059669;">Very Good (VG)</strong></td>
      <td>Performance meets contractual requirements and exceeds some to the Government's benefit. The contractual performance of the element or sub-element being assessed was accomplished with some minor problems, for which corrective actions taken by the contractor were effective.</td>
      <td>"Solid contractor. No major issues. Fixed problems when they came up. Would use again."</td>
      <td>Also maps to Substantial Confidence in many evaluations. In a field of strong offerors, the difference between Exceptional and Very Good across multiple contracts can affect score.</td>
    </tr>
    <tr>
      <td><strong style="color:#78716c;">Satisfactory (S)</strong></td>
      <td>Performance meets contractual requirements. The contractual performance of the element or sub-element contains some minor problems for which corrective actions taken by the contractor appear or were satisfactory.</td>
      <td>"They delivered. Nothing more, nothing less. We wouldn't call them back for the hard contracts."</td>
      <td>Maps to Satisfactory Confidence. Puts you in the middle of the pack. Fine for some contracts; a losing position against competitors with Very Good or Exceptional records on similar work.</td>
    </tr>
    <tr>
      <td><strong style="color:#d97706;">Marginal (M)</strong></td>
      <td>Performance does not meet some contractual requirements. The contractual performance of the element or sub-element being assessed reflects a significant event(s) which the contractor has not yet identified or has taken only marginally effective corrective actions.</td>
      <td>"This contractor had problems and either didn't recognize them or couldn't fix them. Use with caution."</td>
      <td>Maps to Limited Confidence. Effectively disqualifies you on Best Value source selections where past performance is a significant factor. Evaluators will use it to justify elimination.</td>
    </tr>
    <tr>
      <td><strong style="color:#dc2626;">Unsatisfactory (U)</strong></td>
      <td>Performance does not meet most contractual requirements and recovery is not likely in a timely manner. The contractual performance of the element or sub-element contains serious problem(s) for which the contractor's corrective actions appear or were ineffective.</td>
      <td>"This contractor failed the contract. We do not recommend using them."</td>
      <td>Maps to No Confidence. In most competitions, this is effectively disqualifying. A single Unsatisfactory can haunt a contractor for the full three-year retention window.</td>
    </tr>
  </tbody>
</table>

## The Three-Year Clock

CPARS ratings are retained in PPIRS for three years after contract completion. That means:

- A Marginal rating from 2023 shows up in evaluations through at least 2026.
- A contract completed in 2024 with an Exceptional rating remains visible and useful through at least 2027.
- You can't delete a rating you disagree with — but you can ensure your contractor comments travel with it.

<div class="callout callout--emerald">
  <div style="font-family:'IBM Plex Mono',monospace;font-size:8.5pt;font-weight:600;letter-spacing:0.16em;color:#047857;text-transform:uppercase;margin-bottom:2mm;">THE PRACTITIONER TARGET</div>
  <strong>Target Exceptional on Management and Very Good or above on every other area.</strong> On service contracts, Management is where you have the most control — it's a behavior score, not a deliverable score. Exceptional on Management consistently signals the kind of contractor officers want to work with again.
</div>
`
    },

    // ─── SECTION 4: YOUR RIGHT TO COMMENT ────────────────────────────────────────
    {
      type: "content",
      headerLabel: "S04 · YOUR RIGHT TO COMMENT",
      markdown: `<div class="eyebrow">SECTION 04 · YOUR RIGHT TO COMMENT — AND WHEN TO USE IT</div>

# You get 14 days. Use them strategically.

Under CPARS Policy Guide Section 4.4, once the Assessing Official (AO) submits a rating, you — the contractor — have 14 calendar days to review it and enter a contractor comment. This is a formal right. The comment becomes a permanent part of the record and travels with the rating wherever it goes.

Most contractors either don't know about this window or treat it as a place to vent. Neither is a winning strategy. Here's how to use it.

## When You Got the Rating You Earned

If the ratings are accurate — or even if one area came in at Satisfactory when you expected Very Good — sometimes the best move is a brief, professional acknowledgment that adds context without disputing.

**Example language for a Satisfactory on Schedule after a government-caused delay:**

> "Contractor acknowledges the Schedule rating of Satisfactory. The contractor notes for the record that the 23-day schedule delay in Phase 2 was primarily attributable to delayed Government Furnished Information (GFI) delivery, documented in contractor letter dated March 14, 2025 (Ref: CPARS-Comment-Attach-1). Contractor implemented a revised schedule within 5 business days of receiving the delayed GFI and recovered 19 of the 23 days without additional cost to the government."

This language doesn't fight the rating. It contextualizes it. An evaluator reading it two years later sees a contractor who managed a problem professionally.

## When the Rating Is Wrong

If you believe the AO's rating is factually incorrect or based on incomplete information, use the comment period to build a documented rebuttal — not to express frustration.

**Effective rebuttal structure:**
1. **Cite the specific rating area and the claimed basis** for the lower rating.
2. **Produce the contemporaneous documentation** that contradicts the basis (contract deliverables, acceptance letters, CO correspondence, CDRLs).
3. **Name the outcome** — did the government accept the deliverable? Did the CO approve the work? Did costs come in under budget?
4. **Request elevation** if the AO's supervisor (Reviewing Official) is available — note that you'll be requesting a review from the Reviewing Official.

- [ ] Review the assessment within 24 hours of receiving the CPARS notification email
- [ ] Pull your contemporaneous log (see Section 08) immediately
- [ ] Draft comment in plain, professional language — no emotional language, no accusations
- [ ] Attach supporting documents as CPARS comment attachments (the system accepts them)
- [ ] Have someone unfamiliar with the project review the comment before you submit
- [ ] Submit before Day 14 — the system closes the window automatically

## When Silence Is the Better Play

If the rating is accurate and there's no meaningful context to add, a long defensive comment can look worse than no comment. Evaluators read contractor comments. A four-paragraph rebuttal of a Satisfactory rating tells them you don't accept feedback well. A short, professional note or no comment at all on accurate ratings is fine.

<div class="callout">
  <div class="eyebrow" style="margin-bottom:2mm;">THE COMMENT IS PERMANENT</div>
  <p style="margin:0;">Your contractor comment becomes part of the CPARS record and is visible to every future evaluator. Write it as if it will be read by the source selection board on the most important contract you'll ever bid. Because it might be.</p>
</div>
`
    },

    // ─── SECTION 5: SET YOURSELF UP FOR EXCEPTIONAL ───────────────────────────────
    {
      type: "content",
      headerLabel: "S05 · SET UP FOR EXCEPTIONAL",
      markdown: `<div class="eyebrow">SECTION 05 · HOW TO SET YOURSELF UP FOR EXCEPTIONAL FROM DAY 1 OF PERFORMANCE</div>

# Exceptional ratings aren't earned at assessment time. They're built from the kickoff call forward.

Contractors who consistently earn Exceptional share a set of behaviors that aren't complicated. They document more than the contract requires. They communicate problems before the CO asks. They make the government's job easier at every step. The result is an AO who, when they sit down to write the annual assessment, thinks "this was the easiest contract I managed this year."

## The Kickoff: Set the Standard Early

- [ ] Within 5 business days of award, send a written kickoff summary: key personnel, communication protocols, escalation path, schedule for interim deliverables, and your understanding of the first 30-day priorities. Make the CO's job easier from day one.
- [ ] Ask the CO and COR directly: "What does Exceptional performance look like to you on this contract?" Write down the answer. Manage to it.
- [ ] Confirm reporting cadences in writing: monthly status reports, CDRLs, interim milestones. No ambiguity.

## Ongoing Performance Practices

<table>
  <thead>
    <tr><th>Practice</th><th>Why It Works</th><th>Cadence</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Proactive problem notification</strong></td>
      <td>COs hate surprises. An email on Monday saying "we identified a risk that could delay Milestone 3 and here's our mitigation plan" earns far more trust than a missed milestone with an explanation after the fact.</td>
      <td>Immediately when a risk materializes — never let the CO hear about a problem from someone else</td>
    </tr>
    <tr>
      <td><strong>Monthly written status reports (even when not required)</strong></td>
      <td>Creates a paper trail that shows proactive communication. When the annual assessment comes, the AO has 12 months of documented evidence of your performance — not just memory.</td>
      <td>Monthly, sent by the 5th of the following month</td>
    </tr>
    <tr>
      <td><strong>Deliverable acceptance tracking</strong></td>
      <td>Keep a log of every deliverable submitted, when it was submitted, and when the government accepted it (or didn't). This is your primary evidence if Schedule or Quality is rated below expectations.</td>
      <td>Updated within 24 hours of each submission and acceptance</td>
    </tr>
    <tr>
      <td><strong>Mid-year informal rating check-in</strong></td>
      <td>About six months in, ask the COR: "Is there anything we should be doing differently to improve our performance?" This signals engagement and gives you time to correct course before the annual rating is written.</td>
      <td>At the 6-month mark (or quarterly on long contracts)</td>
    </tr>
    <tr>
      <td><strong>Above-and-beyond documentation</strong></td>
      <td>When you do something that exceeds the contract requirements — solve a problem the SOW didn't anticipate, provide training not required, respond to an emergency call — document it and send a brief note to the CO. "We wanted to let you know we did X, which was outside scope, at no additional cost." That's Exceptional material.</td>
      <td>Each time it happens, same day</td>
    </tr>
  </tbody>
</table>

## The 30-Day Pre-Assessment Window

CPARS assessments are usually written within 30–60 days of the annual anniversary or contract completion. You often know when it's coming.

- [ ] 45 days out: review your contemporaneous log (Section 08) and compile a performance summary
- [ ] 30 days out: send the COR a brief performance highlights memo — key accomplishments, problems identified and resolved, upcoming milestones. This isn't asking for a good rating; it's giving the AO material to write one.
- [ ] If the AO is new (turnover is common), schedule a brief meeting to walk them through contract history before they write the assessment.

<div class="callout callout--emerald">
  <div style="font-family:'IBM Plex Mono',monospace;font-size:8.5pt;font-weight:600;letter-spacing:0.16em;color:#047857;text-transform:uppercase;margin-bottom:2mm;">THE RULE</div>
  <strong>The AO writes what they remember. Your job is to make their job easy and give them something worth remembering.</strong> An AO who is staring at a blank assessment form at 4:30pm on a Friday will write "Satisfactory" unless you've made it easy for them to write more.
</div>
`
    },

    // ─── SECTION 6: TOP 8 REASONS FOR MARGINAL/UNSATISFACTORY ────────────────────
    {
      type: "content",
      headerLabel: "S06 · COMMON FAILURE CAUSES",
      markdown: `<div class="eyebrow">SECTION 06 · COMMON REASONS CONTRACTORS GET MARGINAL OR UNSATISFACTORY</div>

# Eight causes. All preventable. Most start before the contract does.

The patterns below come from CPARS advisory reports, GAO contract performance studies, and practitioner experience across hundreds of federal service and construction contracts. None of these are exotic. Most trace back to one of two root causes: insufficient planning before award or insufficient communication during performance.

<table>
  <thead>
    <tr><th>#</th><th>Cause</th><th>Root Pattern</th><th>Prevention</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>1</strong></td>
      <td><strong>Key personnel turnover without CO notification</strong></td>
      <td>The Project Manager or named senior staff leave mid-contract. The contractor replaces them quietly. The CO finds out three months later when performance degrades. This violates FAR 52.237-10 (key personnel) and almost always triggers a downgrade.</td>
      <td>Treat key personnel changes as requiring CO advance approval — even if the clause only says "notify." Submit a written replacement justification and get written concurrence before the transition. Never make stealth substitutions.</td>
    </tr>
    <tr>
      <td><strong>2</strong></td>
      <td><strong>Missed deliverable deadlines with no early warning</strong></td>
      <td>Deadlines slip, but the contractor doesn't flag the risk until the deadline has passed. The AO documents multiple instances. Schedule rating drops to Marginal.</td>
      <td>Build schedule monitoring into your weekly project meeting. If you're at risk of missing a deliverable with 10 or more days to go, notify the COR in writing and propose an adjusted timeline for approval. Documentation of proactive management is Schedule rating protection.</td>
    </tr>
    <tr>
      <td><strong>3</strong></td>
      <td><strong>Subcontractor performance problems treated as the sub's problem</strong></td>
      <td>A subcontractor delivers late, misses quality standards, or causes a safety incident. The prime contractor treats it as the sub's problem and passes the excuse up. CPARS treats it as the prime's performance failure — because it is.</td>
      <td>Your subcontract management is part of your Management CPARS score. Conduct monthly performance reviews with critical subs. Pull them before they fail. Have a bench of qualified subs you can activate. You own every deliverable, regardless of who does the work.</td>
    </tr>
    <tr>
      <td><strong>4</strong></td>
      <td><strong>Cost overruns on T&amp;M/cost-reimbursable contracts without EAC updates</strong></td>
      <td>Actuals diverge from budget but the contractor doesn't update the Estimate at Completion (EAC). The CO's EVM data is stale. When the overrun surfaces, it looks like a management failure — because it was.</td>
      <td>Update EACs monthly on cost-type contracts. Flag any projected overrun immediately with root cause and corrective action. COs who see a coming problem documented in advance assess it as a management strength, not a weakness.</td>
    </tr>
    <tr>
      <td><strong>5</strong></td>
      <td><strong>Quality deficiencies that go unreported or are disputed</strong></td>
      <td>The government's Quality Assurance Surveillance Plan (QASP) identifies a deficiency. The contractor disputes the finding verbally and informally. The deficiency is never resolved in writing. The AO documents it as an unresolved quality issue and rates accordingly.</td>
      <td>Respond to every QASP deficiency in writing within 5 business days, even if you dispute it. Acknowledge receipt, state your position, and propose a resolution. An unacknowledged deficiency looks worse in CPARS than a disputed one with a documented corrective action plan.</td>
    </tr>
    <tr>
      <td><strong>6</strong></td>
      <td><strong>Failure to meet small business subcontracting plan goals</strong></td>
      <td>The contractor committed to 30% small business utilization in the approved plan. Actual spend came in at 12%. ISR reports were filed, but goals weren't met and the contractor didn't explain why or request a plan modification.</td>
      <td>Track SB utilization monthly. If you're falling short of goals, contact the Small Business Technical Advisor and the CO before the ISR due date. Request a plan modification if circumstances changed. Documented effort to meet goals — even imperfect effort — is rated more favorably than a bare miss.</td>
    </tr>
    <tr>
      <td><strong>7</strong></td>
      <td><strong>Inadequate record-keeping — can't reconstruct what happened</strong></td>
      <td>When the AO asks for documentation to support a contractor comment or a dispute, the contractor can't produce it. No meeting notes. No email trail. No contemporaneous record of decisions. The AO's memory becomes the record.</td>
      <td>See Section 08. A contemporaneous log maintained from contract day one is the single highest-leverage investment you can make in your CPARS outcomes. An hour a week during performance is worth far more than 40 hours of scrambling during the comment period.</td>
    </tr>
    <tr>
      <td><strong>8</strong></td>
      <td><strong>Adversarial relationship with the COR or CO</strong></td>
      <td>A dispute over scope, a payment disagreement, or a personality conflict escalates to the point where the COR and contractor stop communicating informally. Everything goes through formal channels. The AO describes the relationship as "strained" in the assessment narrative. That language is visible to future evaluators.</td>
      <td>Treat every COR relationship as a long-term customer relationship. If it's deteriorating, escalate to your account executive or PM — not the CO's supervisor, not the IG. Fix it at the working level. The assessment narrative is written by a human who remembers how you made them feel.</td>
    </tr>
  </tbody>
</table>
`
    },

    // ─── SECTION 7: THE CPARS APPEAL PROCESS ─────────────────────────────────────
    {
      type: "content",
      headerLabel: "S07 · THE APPEAL PROCESS",
      markdown: `<div class="eyebrow">SECTION 07 · THE CPARS APPEAL PROCESS</div>

# You have options after the 14-day window. Most of them are slow. Some work.

CPARS doesn't have a built-in formal "appeal" in the same way contract disputes work under the FAR's Disputes clause. But there are several paths — with different timelines and different levels of effectiveness. Know which path fits which situation before you commit resources to it.

## Path 1: Reviewing Official Elevation (Recommended First Step)

If you disagree with a rating and your contractor comment didn't resolve it, the CPARS system allows elevation to the Reviewing Official — typically the Assessing Official's supervisor. This is the least adversarial option and the fastest.

- [ ] In your contractor comment, include a sentence requesting Reviewing Official review: "Contractor respectfully requests that the Reviewing Official review the Quality and Schedule ratings in light of the documentation attached."
- [ ] Follow up with the CO's office in writing within 5 business days asking for the name and contact for the Reviewing Official.
- [ ] The Reviewing Official can modify ratings. Most do not — but those who do have clear documentation of contractor error often will.
- [ ] Timeline: typically 30–60 days.

## Path 2: Agency Ombudsman or Dispute Resolution

Some agencies have an ombudsman or alternative dispute resolution process for contractor performance disputes. This is less formal than a GAO protest or board appeal but more formal than the Reviewing Official path.

- [ ] Check the agency's website for a Contractor Performance Ombudsman. GSA, DoD, and DHS all have them.
- [ ] Submit a written dispute with supporting documentation. The ombudsman reviews and makes a recommendation to the CO.
- [ ] This path does not guarantee modification — it produces a recommendation.
- [ ] Timeline: 60–120 days typically.

## Path 3: Armed Services Board of Contract Appeals (ASBCA) or Civilian Board

If the inaccurate CPARS rating is tied to a contract dispute you're already pursuing — a CO's Final Decision on a claim, a termination for convenience settlement, a constructive change — you may have jurisdiction to challenge the rating's factual basis through the Boards of Contract Appeals.

<table>
  <thead>
    <tr><th>Board</th><th>Jurisdiction</th><th>Filing Deadline</th><th>Best For</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>ASBCA</strong></td>
      <td>DoD contracts</td>
      <td>90 days from CO's Final Decision</td>
      <td>Disputes where the CPARS rating directly reflects a contested contract claim outcome</td>
    </tr>
    <tr>
      <td><strong>Civilian Board (CBCA)</strong></td>
      <td>Civilian agency contracts (GSA, DHS, USDA, etc.)</td>
      <td>90 days from CO's Final Decision</td>
      <td>Same — civilian agency equivalent</td>
    </tr>
    <tr>
      <td><strong>Court of Federal Claims</strong></td>
      <td>All federal contracts</td>
      <td>12 months from CO's Final Decision</td>
      <td>Large-dollar disputes where board jurisdiction is uncertain or appeal from board is being considered</td>
    </tr>
  </tbody>
</table>

A CPARS rating by itself is generally not a "claim" under FAR 33.1 — so you can't just file a claim disputing a rating. But if the rating is tied to a performance termination or a constructive change you're disputing, the underlying dispute creates the hook.

## Path 4: Inspector General Complaint

If you have evidence that the CPARS rating was retaliatory, politically motivated, or the result of fraud, the agency's IG is the right channel. This is rare but real.

- [ ] Appropriate for: ratings issued after a contractor reported waste, fraud, or abuse (whistleblower retaliation); ratings that contradict documented acceptance letters; ratings by AOs who had a personal financial conflict.
- [ ] Not appropriate for: disagreements about how the AO interpreted performance that's genuinely contested.
- [ ] Timeline: IG investigations can take months to years. This path does not produce a fast fix.

<div class="callout callout--emerald">
  <div style="font-family:'IBM Plex Mono',monospace;font-size:8.5pt;font-weight:600;letter-spacing:0.16em;color:#047857;text-transform:uppercase;margin-bottom:2mm;">HONEST ASSESSMENT</div>
  <strong>Most CPARS disputes are won or lost in the 14-day comment window, not in board proceedings.</strong> Invest in your contemporaneous documentation and your contractor comment. Formal appeals are expensive, slow, and uncertain. They're worth it on a Marginal that will affect a $10M bid; they're not worth it on a Satisfactory where you were hoping for Very Good.
</div>
`
    },

    // ─── SECTION 8: BUILDING A CPARS NARRATIVE LOG ───────────────────────────────
    {
      type: "content",
      headerLabel: "S08 · NARRATIVE LOG FROM DAY 1",
      markdown: `<div class="eyebrow">SECTION 08 · BUILDING A CPARS NARRATIVE LOG FROM DAY 1</div>

# The log you build during performance is the rebuttal you need at assessment time.

When the CPARS notification arrives, you have 14 days. The contractors who use those days well have been building their case for 12 months. The ones who scramble are relying on memory and email searches. The log is the difference.

## What to Track (Minimum)

Maintain a running document — a shared Google Doc, a Notion page, or even a dated Word file. Format doesn't matter. Consistency does.

<table>
  <thead>
    <tr><th>Entry Type</th><th>What to Record</th><th>Why It Matters at Assessment Time</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Deliverable submissions and acceptances</strong></td>
      <td>Date submitted, deliverable name/CDRL number, date accepted by government, any exceptions noted by COR</td>
      <td>Your primary defense against an inaccurate Schedule or Quality rating. "The government accepted Deliverable D-07 on March 3, 2025 — five days ahead of the required delivery date."</td>
    </tr>
    <tr>
      <td><strong>COR/CO communications on performance</strong></td>
      <td>Summary of verbal discussions and any written emails where the CO/COR expressed satisfaction, concerns, or direction. Forward email confirmations to yourself with a standard subject line for easy search.</td>
      <td>Builds a pattern of documented positive feedback — or gives you evidence that concerns were never raised until the assessment.</td>
    </tr>
    <tr>
      <td><strong>Problems identified and corrective actions taken</strong></td>
      <td>Date the problem was identified (by you or the government), root cause, corrective action taken, date resolved, CO acknowledgment if any</td>
      <td>Shows the AO — and future evaluators — that you identify problems proactively and resolve them effectively. This is the definition of Exceptional in the Management area.</td>
    </tr>
    <tr>
      <td><strong>Above-scope contributions</strong></td>
      <td>Any work, assistance, or effort that exceeded the contract requirements — emergency support, training not required, problem-solving that benefited the agency beyond your contract scope</td>
      <td>The raw material for "exceeds contractual requirements" — the core language of an Exceptional rating.</td>
    </tr>
    <tr>
      <td><strong>Government-caused delays or changes</strong></td>
      <td>Date of government action (late GFI, access denied, direction changed), impact on your schedule or cost, how you responded, CO acknowledgment of the impact</td>
      <td>Critical context for any Schedule or Cost rating that reflects delays or overruns you didn't cause. Without documentation, the government's memory becomes the record.</td>
    </tr>
    <tr>
      <td><strong>Small business utilization</strong></td>
      <td>Monthly SB spending by sub, cumulative against plan goals, ISR/SSR submission dates</td>
      <td>Your evidence for the SBS rating area and a defense if the government claims goal shortfalls you dispute.</td>
    </tr>
  </tbody>
</table>

## Sample Weekly Log Entry Format

> **Week of April 7, 2025 — Contract #HQ-2024-C-0042 (DLA, IT Support Services)**
>
> - Submitted Monthly Status Report #9 on April 7 (due April 10). CO acknowledged receipt same day.
> - Deliverable D-14 (Quarterly Security Scan Report) submitted April 8; awaiting COR acceptance.
> - Identified latency issue on the classified network segment affecting 3 workstations. Notified COR by email April 9. Root cause isolated to a switch firmware version. Remediation completed April 10 — 2 days ahead of the 72-hour SLA.
> - Above scope: Assisted DLA IT staff with onboarding configuration for 4 new users during the site visit on April 11. No charge. COR thanked us verbally — sent brief recap email to COR afterward.
> - SB utilization this month: CloudTech (8a) — $18,500 (22% of labor); TotalTech (WOSB) — $9,200 (11%). Cumulative YTD: 34% SB vs. 30% plan goal.

## Using the Log During the Assessment Window

- [ ] When CPARS notification arrives, pull the log and read it cover-to-cover in the first 24 hours
- [ ] For each rating area, list the 3–5 strongest performance examples from the log
- [ ] Match those examples to the language of the Exceptional or Very Good definition in FAR 42.1503
- [ ] Draft your comment using specific dates, deliverable numbers, and outcomes — not general claims
- [ ] Attach key source documents (acceptance emails, CO correspondence) as CPARS comment attachments
- [ ] If any rating surprises you, check whether the log shows a performance issue you may have missed or whether the rating lacks a documented basis — that tells you whether to accept or dispute

<div class="callout callout--emerald">
  <div style="font-family:'IBM Plex Mono',monospace;font-size:8.5pt;font-weight:600;letter-spacing:0.16em;color:#047857;text-transform:uppercase;margin-bottom:2mm;">START NOW</div>
  <strong>If you're mid-contract and don't have a log — start one today.</strong> Reconstruct what you can from emails and project files for the prior months. A partial log is better than no log. The next assessment will be better for it.
</div>
`
    },

    // ─── BACK COVER ──────────────────────────────────────────────────────────────
    {
      type: "back-cover",
      eyebrow: "WHAT'S NEXT",
      headline: "Your past performance is your next proposal.",
      accentWord: "proposal",
      body: "CapturePilot helps federal contractors build the documentation habits, capture the evidence, and write the past performance references that turn contract history into competitive advantage. Free 14-day trial — no credit card required.",
      ctaText: "Start free trial →",
      ctaUrl: "https://capturepilot.com/signup",
      footerLabel: "CAPTUREPILOT · POST-AWARD COMPLIANCE"
    }
  ]
};

// ─── RENDER ──────────────────────────────────────────────────────────────────
async function main() {
  await mkdir(resolve(DEPLOY, ".."), { recursive: true });
  console.log("Rendering CPARS Past Performance Guide PDF…");
  await renderPdf({ config, outputPath: DEPLOY });
  const { stat } = await import("node:fs/promises");
  const { size } = await stat(DEPLOY);
  console.log(`✓ Written: ${DEPLOY}`);
  console.log(`  Size: ${(size / 1024).toFixed(1)} KB`);
}

main().catch((err) => { console.error(err); process.exit(1); });
