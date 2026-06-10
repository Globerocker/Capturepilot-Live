/**
 * how-to-read-section-l-m-pdf.build.mjs
 * FLK v1.5 — 03_Solicitation_Playbooks/FLK_03_How_to_Read_Section_L_M.pdf
 *
 * Config-driven PDF using the canonical pdf-builder pipeline.
 */

import { renderPdf } from "../../../tools/pdf-builder/render.mjs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEPLOY = resolve(
  __dirname,
  "../../../dashboard/public/starter-pack/03_Solicitation_Playbooks/FLK_03_How_to_Read_Section_L_M.pdf"
);

const config = {
  id: "flk-section-l-m",
  title: "How to Read Section L and Section M",
  slug: "flk-section-l-m",
  pages: 14,
  footerLabel: "CAPTUREPILOT · SOLICITATION PLAYBOOKS",
  headerLabel: "SECTION L + M DECODER",
  parts: [
    {
      type: "cover",
      eyebrow: "FEDERAL LAUNCH KIT · SOLICITATION PLAYBOOKS",
      titleLines: ["How to Read", "Section L", "and Section M."],
      accentWord: "Section M.",
      pages: 14,
      toolStrip: [
        { num: 1, title: "Reading Order", desc: "Start at M, not L — here's why" },
        { num: 2, title: "Compliance Matrix", desc: "Build before writing a word" },
        { num: 3, title: "L Gotchas", desc: "Page limits, fonts, file naming" },
        { num: 4, title: "4 Factor Archetypes", desc: "MC, PP, Price, SB — decoded" }
      ]
    },

    {
      type: "toc",
      title: "Read M first. Win more.",
      footerLabel: "CAPTUREPILOT · SOLICITATION PLAYBOOKS",
      parts: [
        {
          label: "/ HOW TO USE THIS GUIDE",
          items: [
            {
              code: "G01",
              title: "What Section L and Section M Actually Are",
              desc: "The two sections that decide whether you're compliant and whether you win.",
              page: 3
            }
          ]
        },
        {
          label: "PART ONE · BEFORE YOU WRITE A WORD",
          items: [
            {
              code: "P01",
              title: "Reading Order — Start at M, Not L",
              desc: "Why the evaluation criteria should shape your outline before L tells you the format.",
              page: 5
            },
            {
              code: "P02",
              title: "The Compliance Matrix You Need to Build First",
              desc: "A two-column discipline that catches every L requirement before it bites you in review.",
              page: 6
            }
          ]
        },
        {
          label: "PART TWO · SECTION L TRAPS",
          items: [
            {
              code: "P03",
              title: "Common Section L Gotchas",
              desc: "Page limits, font sizes, file formats, naming conventions — the rules evaluators actually enforce.",
              page: 8
            }
          ]
        },
        {
          label: "PART THREE · SECTION M FACTORS",
          items: [
            {
              code: "P04",
              title: "The 4 Evaluation Factor Archetypes",
              desc: "Mission Capability, Past Performance, Price, Small Business — how each is scored and what matters most.",
              page: 10
            },
            {
              code: "P05",
              title: "Color-Coding Your Response to M",
              desc: "A markup discipline so every sentence in your proposal maps to an evaluation subfactor.",
              page: 12
            },
            {
              code: "P06",
              title: "Pre-Proposal Conference Questions That Signal Priorities",
              desc: "What agencies say vs. what they mean — and the questions that reveal weighting.",
              page: 13
            }
          ]
        }
      ]
    },

    {
      type: "founder",
      headline: "The solicitation tells you exactly how to win. Most teams skip that part.",
      accentWord: "exactly",
      paragraphs: [
        "I've reviewed more than 200 federal proposals in the last four years. The single most common failure — the one that kills technically sound teams — isn't weak past performance or thin pricing. It's a volume that answers the wrong question.",
        "Section M tells you what the evaluator is scoring. Section L tells you how to package it. If you write to L without reading M first, you're building a product nobody ordered.",
        "This guide walks you through the exact sequence: read M, build your compliance matrix, then let L shape your format. Fourteen pages. All mechanics. No fluff. By the end you'll know how to structure a response that a busy evaluator can score in 20 minutes.",
        "That's the win condition."
      ],
      ctaText: "Book a 30-min proposal mechanics call",
      ctaUrl: "https://meetings-na2.hubspot.com/americurial/intro-call",
      ctaButtonLabel: "Book the call →",
      ctaEyebrow: "30 MIN · NO PITCH",
      footerLabel: "CAPTUREPILOT · SOLICITATION PLAYBOOKS"
    },

    {
      type: "dark",
      partLabel: "PART ONE · BEFORE YOU WRITE A WORD",
      headline: "Most teams read L first. That's the wrong move.",
      accentWord: "wrong",
      paragraphs: [
        "Section L is instructions. Section M is the scorecard. If you build your outline from L, you're organizing around format. If you build it from M, you're organizing around what gets you points.",
        "The next two sections show you the reading order that actually works, and the compliance matrix that keeps you from getting disqualified on a technicality."
      ],
      footerLabel: "CAPTUREPILOT · SOLICITATION PLAYBOOKS",
      headerLabel: "PART ONE"
    },

    {
      type: "content",
      headerLabel: "WHAT SECTION L + M ARE",
      markdown: `<div class="eyebrow">SECTION ONE · WHAT SECTION L AND SECTION M ACTUALLY ARE</div>

# The two documents that decide whether you're compliant — and whether you win.

Every federal solicitation issued under FAR Part 15 (Contracting by Negotiation) includes two sections that matter more than everything else combined.

<table>
  <thead>
    <tr><th>Section</th><th>Official Name</th><th>What It Does</th><th>When to Read It</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Section L</strong></td>
      <td>Instructions, Conditions, and Notices to Offerors</td>
      <td>Tells you <em>how</em> to format and submit your proposal — page limits, font sizes, file names, volume structure, submission portal, deadline.</td>
      <td>After you've mapped M</td>
    </tr>
    <tr>
      <td><strong>Section M</strong></td>
      <td>Evaluation Factors for Award</td>
      <td>Tells you <em>what</em> the government scores — the factors, subfactors, relative importance, and the tradeoff methodology the Source Selection Authority uses to pick the winner.</td>
      <td>First. Always.</td>
    </tr>
  </tbody>
</table>

## Why this distinction is everything

Section L violations get you rejected before anyone reads your technical approach. Miss the 50-page limit by one page and your volume is excluded from evaluation. Wrong file format and the upload fails. Name the file wrong and a strict CO may declare it non-responsive.

Section M losses are subtler — and more expensive. You can be fully compliant with every L requirement and still score a "Marginal" on Mission Capability because your Technical Approach section answered the wrong question.

<div class="callout callout--emerald">
  <div style="font-family:'IBM Plex Mono', monospace; font-size:8.5pt; font-weight:600; letter-spacing:0.16em; color:#047857; text-transform:uppercase; margin-bottom:2mm;">KEY RULE</div>
  <strong>L defines the box. M defines what wins inside the box.</strong> You need both, but you read M first so you know what points you're chasing before L tells you how many pages you get.
</div>

## Where these sections live in a uniform contract format

Federal solicitations follow the Uniform Contract Format (UCF) defined in FAR 15.204-1. Sections are lettered A through M. In practice, agencies bundle them into volumes they call by different names — "Technical Volume," "Management Volume," "Past Performance Volume," "Price Volume." The UCF section letters still map inside those volumes. Section L lives in the solicitation document as the submission instructions. Section M lives right after it as the award criteria.

<div class="callout">
  <div class="eyebrow" style="margin-bottom:2mm;">WHAT ABOUT SIMPLIFIED ACQUISITIONS AND RFQS?</div>
  <p style="margin:0;">Below the Simplified Acquisition Threshold ($250,000 as of 2024), agencies often issue an RFQ instead of an RFP. RFQs may not use formal L and M language, but they still have format requirements (the L equivalent) and evaluation criteria (the M equivalent). The discipline is the same — find those two pieces first, even if they're not labeled.</p>
</div>
`
    },

    {
      type: "content",
      headerLabel: "READING ORDER + COMPLIANCE MATRIX",
      markdown: `<div class="eyebrow">SECTION TWO · READING ORDER — START AT M, NOT L</div>

# Read M like a rubric. Then build your outline.

Here's the reading sequence that high-performing proposal teams use:

<table>
  <thead>
    <tr><th>Step</th><th>Action</th><th>Output</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>1</strong></td>
      <td>Print or copy Section M in full. Read every factor and subfactor.</td>
      <td>Mental map of what gets scored</td>
    </tr>
    <tr>
      <td><strong>2</strong></td>
      <td>Note the relative importance language: "Factors A and B are approximately equal and together are significantly more important than Factor C." Underline the verbs — <em>evaluate, assess, determine, consider</em>. Each one points at something the evaluator needs to see.</td>
      <td>Factor weight ranking (even when numerical weights aren't disclosed)</td>
    </tr>
    <tr>
      <td><strong>3</strong></td>
      <td>Build a one-page outline of your proposal volumes using M's factor structure — not L's volume labels. Factor 1 = Volume I structure. Subfactors = headings inside it.</td>
      <td>Evaluation-aligned outline</td>
    </tr>
    <tr>
      <td><strong>4</strong></td>
      <td>THEN read Section L to apply the format constraints to your outline. Trim to fit the page limit. Set fonts. Note the naming convention.</td>
      <td>Formatted, compliant outline</td>
    </tr>
    <tr>
      <td><strong>5</strong></td>
      <td>Write to the outline. Every paragraph should be traceable to an M subfactor.</td>
      <td>Proposal that scores</td>
    </tr>
  </tbody>
</table>

<div class="callout callout--emerald">
  <div style="font-family:'IBM Plex Mono', monospace; font-size:8.5pt; font-weight:600; letter-spacing:0.16em; color:#047857; text-transform:uppercase; margin-bottom:2mm;">FIELD TIP</div>
  <strong>The most common mistake:</strong> teams write a capabilities narrative, then try to fit it into M retroactively. The evaluator notices. It reads like a brochure, not a response to the government's stated need.
</div>

<div class="eyebrow" style="margin-top:8mm;">SECTION THREE · THE COMPLIANCE MATRIX</div>

## Build this before you write a word.

A compliance matrix is a two-column (minimum) document that lists every L requirement in column one and your proposal's response in column two. It takes two hours to build. It saves you from an immediate rejection.

<table>
  <thead>
    <tr><th>Column 1: L Requirement</th><th>Column 2: Our Response / Location</th><th>Status</th></tr>
  </thead>
  <tbody>
    <tr>
      <td>Technical Volume ≤ 50 pages, single-spaced, 12pt Times New Roman, 1-inch margins</td>
      <td>Vol I, pp. 1–47 · Font confirmed in template · Margins locked</td>
      <td><span class="risk-pill risk-high" style="background:#dcfce7; color:#166534; border:none;">MET</span></td>
    </tr>
    <tr>
      <td>Past Performance: submit CPARs for last 5 years, 3 references minimum, 2 pages per reference</td>
      <td>Vol II, pp. 1–8 · 4 references included · All CPARs attached</td>
      <td><span class="risk-pill risk-high" style="background:#dcfce7; color:#166534; border:none;">MET</span></td>
    </tr>
    <tr>
      <td>File naming: [OFFEROR NAME]_[VOLUME]_[DATE].pdf</td>
      <td>Naming convention in submission checklist — review before upload</td>
      <td><span class="risk-pill risk-medium" style="background:#fef9c3; color:#854d0e; border:none;">PENDING</span></td>
    </tr>
    <tr>
      <td>Submission via SAM.gov Secure Package — due 4:00 PM ET Day 30</td>
      <td>System access confirmed · Reminder set 48h before deadline</td>
      <td><span class="risk-pill risk-medium" style="background:#fef9c3; color:#854d0e; border:none;">PENDING</span></td>
    </tr>
    <tr>
      <td>No corporate marketing materials, no color graphics in Technical Volume</td>
      <td>Template reviewed — no graphics in Vol I</td>
      <td><span class="risk-pill risk-high" style="background:#dcfce7; color:#166534; border:none;">MET</span></td>
    </tr>
  </tbody>
</table>

Add a third column for "Owner" if you're working with a team. Assign every open item to a person and a due date. The CO won't call to tell you your volume is disqualified — the compliance matrix is your insurance.
`
    },

    {
      type: "content",
      headerLabel: "SECTION L GOTCHAS",
      markdown: `<div class="eyebrow">SECTION FOUR · COMMON SECTION L GOTCHAS</div>

# The rules that get teams disqualified — and they're all in writing.

Section L is long. Most teams skim it. Here are the specific requirements that bite the hardest:

<table>
  <thead>
    <tr><th>L Requirement</th><th>What It Says</th><th>What Goes Wrong</th><th>Risk</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Page Limits</strong></td>
      <td>Often stated per volume: "Technical Approach shall not exceed 50 pages. Pages in excess of the page limit will not be evaluated."</td>
      <td>Teams exceed by counting pages wrong — L often excludes cover pages, tabs, and resumes from the count. Read the exclusion language carefully.</td>
      <td><span class="risk-pill risk-critical">CRITICAL</span></td>
    </tr>
    <tr>
      <td><strong>Font Requirements</strong></td>
      <td>"12-point Times New Roman or equivalent serif font. Tables and figures may use 10-point minimum."</td>
      <td>Teams use Arial or Calibri (sans-serif) without reading "equivalent serif." Some COs measure font size in submitted PDFs. A font violation is grounds for rejection.</td>
      <td><span class="risk-pill risk-critical">CRITICAL</span></td>
    </tr>
    <tr>
      <td><strong>Margin Requirements</strong></td>
      <td>"One-inch margins on all sides. Headers and footers within the margin area do not count against the page limit."</td>
      <td>Teams shrink margins to squeeze content. 0.75-inch margins to gain five lines on a 50-page volume can disqualify the entire volume.</td>
      <td><span class="risk-pill risk-critical">CRITICAL</span></td>
    </tr>
    <tr>
      <td><strong>File Format + Naming</strong></td>
      <td>"Submit all volumes as PDF. Name files as: [Company]_[Volume]_[DRFP Number]_[Date YYYYMMDD].pdf"</td>
      <td>DOCX uploaded instead of PDF. Date format wrong. Volume labeled "Technical" instead of "Vol1." Some portals auto-reject files that don't match the naming pattern exactly.</td>
      <td><span class="risk-pill risk-high">HIGH</span></td>
    </tr>
    <tr>
      <td><strong>Submission Portal + Deadline</strong></td>
      <td>"Proposals due via SAM.gov Secure Package by 4:00 PM Eastern Time on [date]. No exceptions."</td>
      <td>Teams upload 20 minutes before deadline and discover a file size limit. Late submission = no award consideration. Federal courts consistently uphold strict deadline enforcement.</td>
      <td><span class="risk-pill risk-critical">CRITICAL</span></td>
    </tr>
    <tr>
      <td><strong>Proprietary Markings</strong></td>
      <td>"Mark proprietary data on each page with 'Company Proprietary' per FAR 15.609."</td>
      <td>Teams forget to mark pages, then lose protection on pricing data. Or they mark everything including public information, which weakens the claim on genuinely proprietary content.</td>
      <td><span class="risk-pill risk-medium">MEDIUM</span></td>
    </tr>
    <tr>
      <td><strong>Oral Presentations</strong></td>
      <td>"Offerors may be invited to present. Presentation may not exceed 60 minutes. No new technical information may be introduced."</td>
      <td>Teams treat oral presentations as a second bite at the apple and introduce new technical approaches. This can be scored against them or disqualify the oral presentation entirely.</td>
      <td><span class="risk-pill risk-medium">MEDIUM</span></td>
    </tr>
  </tbody>
</table>

<div class="callout callout--emerald">
  <div style="font-family:'IBM Plex Mono', monospace; font-size:8.5pt; font-weight:600; letter-spacing:0.16em; color:#047857; text-transform:uppercase; margin-bottom:2mm;">SUBMISSION PROTOCOL</div>
  <strong>Upload 48 hours before the deadline.</strong> If the portal has an issue, you have time to call the CO and get a documented exception. At 3:58 PM on the due date, nobody can help you.
</div>
`
    },

    {
      type: "dark",
      partLabel: "PART TWO · SECTION M FACTORS",
      headline: "Four archetypes. Every evaluation factor fits one of them.",
      accentWord: "Four",
      paragraphs: [
        "Section M seems complex until you recognize that almost every federal evaluation factor is a variation on four archetypes: Mission Capability, Past Performance, Price, and Small Business Participation. Each archetype has a distinct scoring logic and demands a different kind of evidence.",
        "The next sections walk through each one — what evaluators are actually looking for, what evidence moves the needle, and how to structure your response so it scores on the first read."
      ],
      footerLabel: "CAPTUREPILOT · SOLICITATION PLAYBOOKS",
      headerLabel: "PART TWO"
    },

    {
      type: "content",
      headerLabel: "4 EVALUATION FACTOR ARCHETYPES",
      markdown: `<div class="eyebrow">SECTION FIVE · THE 4 EVALUATION FACTOR ARCHETYPES</div>

# Mission Capability, Past Performance, Price, Small Business. That's the whole game.

<table>
  <thead>
    <tr><th>Archetype</th><th>What Evaluators Score</th><th>Evidence That Moves the Needle</th><th>Common Trap</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Mission Capability</strong><br><span style="color:#78716c; font-size:9pt;">Also called Technical Approach, Management Approach, Technical/Management</span></td>
      <td>Whether your approach will actually work. Evaluators look for specificity — not that you understand the problem, but that your method solves it. They score subfactors like Technical Approach, Staffing, Management, and often Security.</td>
      <td>Process flows with named tools and checkpoints · Specific staffing plan with hours by role · Risk identification + mitigation paired to actual contract risks · Draft work breakdown structure or CONOPS tied to the PWS</td>
      <td>Capabilities narrative instead of method narrative. "Our team has extensive experience in…" scores lower than "We will deploy two senior network engineers in the first 30 days using a documented transition plan that maps to PWS 3.2.1."</td>
    </tr>
    <tr>
      <td><strong>Past Performance</strong><br><span style="color:#78716c; font-size:9pt;">FAR 15.305(a)(2) — recency, relevancy, quality</span></td>
      <td>Three things: recency (last 3–5 years), relevancy (similar scope, dollar value, complexity), and quality (CPARS ratings and what the client reference says). Most agencies evaluate these on a five-point adjectival scale: Exceptional / Very Good / Satisfactory / Marginal / Unsatisfactory.</td>
      <td>Contracts in the same NAICS with similar annual value · CPARs at Very Good or Exceptional · Reference who will pick up the phone · Brief narrative that maps the past project's scope to this PWS explicitly — don't make the evaluator guess at relevance</td>
      <td>Listing contracts without drawing the connection to this requirement. If your $2M IT services contract is relevant to a $3M IT services RFP, say exactly how — same clearance level, same agency type, same technology stack.</td>
    </tr>
    <tr>
      <td><strong>Price / Cost</strong><br><span style="color:#78716c; font-size:9pt;">FAR 15.404 — price analysis vs. cost analysis</span></td>
      <td>On fixed-price contracts, the government does price analysis — they compare your total price to independent government estimates (IGCE) and other offerors. On cost-plus contracts, they do cost analysis — evaluating your labor rates, indirect rates, and assumptions for realism.</td>
      <td>On FP: price within ±15% of the IGCE (if disclosed) · On CP: rates consistent with your GSA schedule or forward pricing rate agreements · A clear price narrative explaining any outliers · No unloaded rates that look suspiciously low</td>
      <td>On cost-plus RFPs, pricing in too low signals that you either don't understand the work or will buy in and change-order later. Both impressions hurt. On FP RFPs, pricing in too high when price matters more than quality loses on trade-off.</td>
    </tr>
    <tr>
      <td><strong>Small Business Participation</strong><br><span style="color:#78716c; font-size:9pt;">FAR 19.702 — required on contracts over $750K (large business prime)</span></td>
      <td>The percentage of contract value you'll subcontract to small businesses (and the breakdown by socioeconomic category: 8(a), SDVOSB, WOSB, HUBZone). Evaluated on plan specificity, achievability, and meaningful engagement — not just the percentage.</td>
      <td>Named subs with UEI numbers and certifications confirmed in SAM.gov · Specific work packages assigned to each SB sub · Realistic percentage goals backed by the task distribution · Letters of intent from your small business partners</td>
      <td>Generic plans with round-number goals ("20% to small businesses") and no named subs. Evaluators at DoD and DHS score specificity. A plan that says "We plan to partner with 8(a) firms for IT support" with no names is a Marginal.</td>
    </tr>
  </tbody>
</table>

<div class="callout callout--emerald">
  <div style="font-family:'IBM Plex Mono', monospace; font-size:8.5pt; font-weight:600; letter-spacing:0.16em; color:#047857; text-transform:uppercase; margin-bottom:2mm;">RELATIVE IMPORTANCE</div>
  <strong>Section M will tell you which factor is most important.</strong> The most common pattern at DoD: Mission Capability > Past Performance > Price > Small Business. But at GSA and civilian agencies you'll often see Price weighted equal to or above technical factors. Read M for the specific language — "significantly more important," "equal weight," "least important factor."
</div>
`
    },

    {
      type: "content",
      headerLabel: "COLOR-CODING + PRE-PROPOSAL QUESTIONS",
      markdown: `<div class="eyebrow">SECTION SIX · COLOR-CODING YOUR RESPONSE TO M</div>

# Every sentence in your proposal should map to a Section M subfactor.

This is a markup discipline used by professional proposal shops at CACI, Booz Allen, and Leidos. You can implement it in two hours with a highlighter.

**How it works:**

1. Print Section M. Assign a color to each evaluation factor. Example: Mission Capability = blue, Past Performance = green, Price = yellow, Small Business = orange.
2. Highlight each subfactor description in the corresponding color.
3. Now open your proposal draft. For every paragraph, ask: which M subfactor is this paragraph answering? Mark it with the matching color.
4. Any paragraph with no color is probably filler. Cut it or tie it to a specific subfactor.
5. Any subfactor with no corresponding paragraph in your proposal is a gap. Fill it before you submit.

**Why this matters for evaluators:**

Federal evaluators work from evaluation worksheets tied directly to Section M subfactors. If your Technical Approach section answers Subfactor 1a but buries the answer to Subfactor 1b in your Management section, the evaluator may miss it entirely and score Subfactor 1b as "not addressed." You can lose on a factor you actually addressed — because the evaluator couldn't find it.

<div class="callout callout--emerald">
  <div style="font-family:'IBM Plex Mono', monospace; font-size:8.5pt; font-weight:600; letter-spacing:0.16em; color:#047857; text-transform:uppercase; margin-bottom:2mm;">STRUCTURAL TIP</div>
  <strong>Mirror M's structure in your headings.</strong> If Section M has "Factor 1: Technical Approach — Subfactor 1a: System Architecture, Subfactor 1b: Cybersecurity," your Technical Volume headings should match: 1.1 System Architecture, 1.2 Cybersecurity. Evaluators can score it without a map.
</div>

<div class="eyebrow" style="margin-top:8mm;">SECTION SEVEN · PRE-PROPOSAL CONFERENCE QUESTIONS</div>

## What the agency says vs. what they mean.

Pre-proposal conferences (also called Industry Days or offeror conferences) are the government's opportunity to clarify the solicitation. They're also, if you read them right, a preview of evaluation priorities.

<table>
  <thead>
    <tr><th>Question / Signal</th><th>What It Reveals</th><th>What to Do With It</th></tr>
  </thead>
  <tbody>
    <tr>
      <td>"Can you clarify the relative importance of Subfactor 1b vs. 1c?"</td>
      <td>Another offeror is uncertain — meaning the M language is ambiguous there. The government's answer will clarify the real priority.</td>
      <td>Listen carefully. If the CO says "both are equally important," weight your response 50/50. If they say "1b addresses the core requirement," front-load your response with 1b evidence.</td>
    </tr>
    <tr>
      <td>"Does the page limit include appendices?"</td>
      <td>Common L ambiguity. The answer determines how much supporting data you can attach.</td>
      <td>Get the answer in writing via the official amendment. Do not rely on verbal answers at the conference.</td>
    </tr>
    <tr>
      <td>Agency spends 20 minutes on a specific PWS task area during the walkthrough</td>
      <td>That task is the hard part. It's where incumbents have struggled or where scope is unclear.</td>
      <td>Devote proportional page and narrative depth to that task area. Don't skim it because it's "just a sub-task."</td>
    </tr>
    <tr>
      <td>"We're looking for innovative approaches to [specific problem]"</td>
      <td>Mission Capability is probably more important than price on this award. They want to see method, not just cost.</td>
      <td>Lead your technical volume with your differentiated approach to that problem. Name your method, tools, and why they work better than the standard approach.</td>
    </tr>
    <tr>
      <td>CO emphasizes transition plan requirements multiple times</td>
      <td>There's an incumbent. The government is worried about transition risk.</td>
      <td>Your Management Volume's transition section is evaluated harder than M's words suggest. Write it as if transition is its own major factor.</td>
    </tr>
  </tbody>
</table>

<div class="callout">
  <div class="eyebrow" style="margin-bottom:2mm;">RULE OF THUMB</div>
  <p style="margin:0;">File a Question and Answer request even if you think you understand the solicitation. The Q&A process generates amendments — and those amendments become part of the contract. If another offeror asks a clarifying question that changes your understanding of the requirement, you need to know about it. Monitor every amendment through award.</p>
</div>
`
    },

    {
      type: "content",
      headerLabel: "ANNOTATED SECTION L+M EXAMPLE",
      markdown: `<div class="eyebrow">SECTION EIGHT · ANNOTATED SECTION L + M EXAMPLE</div>

# A real-world example of what to mark — and why.

Below is a condensed Section M excerpt similar to what you'd see on a DoD IT services RFP. The annotations show what a proposal manager marks on the first read.

<table>
  <thead>
    <tr><th>Section M Language (excerpted)</th><th>What to Mark</th><th>Why It Matters</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><em>"Factor 1 — Mission Capability: <strong>significantly more important</strong> than Factor 2, and together with Factor 2 <strong>more important than price</strong>."</em></td>
      <td>Underline "significantly more important" and "more important than price." Note that price is the lowest-weighted factor on this award.</td>
      <td>Tells you to invest pages in technical and management, not in pricing narrative. On a best-value tradeoff, a superior technical score will beat a lower price.</td>
    </tr>
    <tr>
      <td><em>"Subfactor 1a — Technical Approach: The Government will <strong>evaluate the offeror's understanding of the requirements</strong> and <strong>the soundness of the proposed technical approach</strong>, including identification of technical risks and mitigation strategies."</em></td>
      <td>Circle "understanding," "soundness," "technical risks," "mitigation strategies." These are the four things the evaluator is looking for in your Tech Approach section.</td>
      <td>Your response must explicitly address all four. A response that demonstrates understanding but doesn't identify risks is incomplete for this subfactor.</td>
    </tr>
    <tr>
      <td><em>"Factor 2 — Past Performance: The Government will evaluate the <strong>relevancy</strong> and <strong>quality</strong> of the offeror's recent (within the last <strong>5 years</strong>) performance on contracts of similar scope, complexity, and dollar value."</em></td>
      <td>Note "5 years" (not 3), "similar scope," "similar dollar value." Map each reference you plan to cite against these three criteria before writing.</td>
      <td>A contract that's 6 years old doesn't count. A contract that's the right age but 10% of this contract's value may score as "somewhat relevant" instead of "relevant."</td>
    </tr>
    <tr>
      <td><em>"Section L, Para 3.2: Technical Volume shall not exceed <strong>50 pages</strong>. Resumes are excluded from the page count and shall be submitted as a <strong>separate appendix</strong>. Tables may use <strong>10-point minimum font</strong>."</em></td>
      <td>Note 50-page limit, resume exclusion (but separate appendix required — don't bury them in the volume), and 10pt table exception.</td>
      <td>The resume exclusion is a gift — use it. A 50-page technical volume with 8 résumés appended separately keeps all 50 pages for actual technical content.</td>
    </tr>
    <tr>
      <td><em>"Section L, Para 5.1: File name format: [OFFEROR]_VOL[#]_[SOLICITATION NUMBER]_[YYYYMMDD]. Example: ACME_VOL1_FA8501-24-R-0012_20240915.pdf"</em></td>
      <td>Copy the example name exactly into your submission checklist template. Build the correct filename before you start writing — don't rename files at 3:45 PM on deadline day.</td>
      <td>A simple naming error can cause a portal upload to fail or be marked non-responsive. Build the filename into your proposal kickoff template.</td>
    </tr>
  </tbody>
</table>

## Quick-reference: what to highlight on first read

- **Section M:** Factor relative importance language · Evaluation verbs (evaluate, assess, determine, consider) · Rating scales (adjectival or numerical) · Any language about "unacceptable" automatically removing offerors from competition
- **Section L:** Every page limit · Font and margin specs · File format and naming convention · Submission deadline and portal · Any prohibition on marketing language or graphics · Questions and due dates for Q&A submission

<div class="callout callout--emerald">
  <div style="font-family:'IBM Plex Mono', monospace; font-size:8.5pt; font-weight:600; letter-spacing:0.16em; color:#047857; text-transform:uppercase; margin-bottom:2mm;">FINAL CHECK BEFORE SUBMISSION</div>
  <strong>Run your compliance matrix one more time 24 hours before the deadline.</strong> Check every L requirement against your submitted volumes. Then have someone who didn't write the proposal read Section M and score your response cold. Where they get confused is where the evaluator gets confused.
</div>
`
    },

    {
      type: "back-cover",
      eyebrow: "WHAT'S NEXT",
      headline: "You know how to read Section L and M. Now write a proposal that scores.",
      accentWord: "scores",
      body: "CapturePilot tracks federal solicitations, flags Section M evaluation factors as they're published, and helps you build compliance matrices before the deadline pressure hits. Free 14-day trial. No card required.",
      ctaText: "Start free trial →",
      ctaUrl: "https://capturepilot.com/signup",
      footerLabel: "CAPTUREPILOT · SOLICITATION PLAYBOOKS"
    }
  ]
};

await renderPdf({ config, outputPath: DEPLOY });
console.log("PDF written to:", DEPLOY);
