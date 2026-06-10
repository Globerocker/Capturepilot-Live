#!/usr/bin/env node
/**
 * flk-field-manual-master-playbook-pdf.build.mjs
 * Federal Contracting Field Manual — 0 → first win in 90 days
 * ~45-page comprehensive bible tying the entire FLK kit together.
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, copyFile, stat } from "node:fs/promises";
import { renderPdf } from "/Users/andreschuler/Caturepilot 2.0/tools/pdf-builder/render.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEPLOY = resolve(
  __dirname,
  "../../../dashboard/public/starter-pack/FLK_Field_Manual.pdf"
);

const config = {
  id: "flk-field-manual",
  title: "Federal Contracting Field Manual",
  slug: "flk-field-manual",
  pages: 46,
  footerLabel: "CAPTUREPILOT · FEDERAL CONTRACTING FIELD MANUAL",
  headerLabel: "FIELD MANUAL",
  parts: [

    /* ─── COVER ─────────────────────────────────────────────── */
    {
      type: "cover",
      eyebrow: "FEDERAL LAUNCH KIT · FIELD MANUAL",
      titleLines: [
        "Federal Contracting",
        "Field Manual."
      ],
      accentWord: "Field",
      subtitle: "0 → first win in 90 days",
      pages: 46,
      toolStrip: [
        { num: 1, title: "6-Stage Journey", desc: "Register → Position → Find → Bid → Win → Deliver" },
        { num: 2, title: "40+ Pages", desc: "The full playbook, cross-referenced to every FLK file" },
        { num: 3, title: "Real Numbers", desc: "Thresholds, timelines, FAR clauses — no fluff" },
        { num: 4, title: "Honest Odds", desc: "What actually works, what usually doesn't" }
      ]
    },

    /* ─── TOC ────────────────────────────────────────────────── */
    {
      type: "toc",
      title: "Six stages. One manual.",
      footerLabel: "CAPTUREPILOT · FEDERAL CONTRACTING FIELD MANUAL",
      parts: [
        {
          label: "/ HOW TO USE",
          items: [
            { code: "INT", title: "Introduction — What This Manual Is", desc: "How to use it alongside the FLK files. What the six stages actually mean.", page: 4 }
          ]
        },
        {
          label: "STAGE 1 · REGISTER",
          items: [
            { code: "S1A", title: "SAM.gov from Scratch", desc: "Entity registration walkthrough. UEI, CAGE, representations and certifications.", page: 7 },
            { code: "S1B", title: "NAICS Picking Strategy", desc: "Which codes to claim. How to add or remove them. Where it bites you if you get it wrong.", page: 9 },
            { code: "S1C", title: "SAM Renewal & Maintenance", desc: "The annual renewl trap. Who renews it, when, and what breaks if they miss it.", page: 11 }
          ]
        },
        {
          label: "STAGE 2 · POSITION",
          items: [
            { code: "S2A", title: "Capability Statement Deep-Dive", desc: "What goes in, what to cut, how to format for a federal audience.", page: 13 },
            { code: "S2B", title: "Certifications Strategy", desc: "8(a), HUBZone, SDVOSB, WOSB — which is right for your firm and timeline.", page: 16 },
            { code: "S2C", title: "Set-Aside Math", desc: "Which NAICS have real set-aside spend. How to find the data before you chase the work.", page: 19 }
          ]
        },
        {
          label: "STAGE 3 · FIND",
          items: [
            { code: "S3A", title: "SAM.gov Power-User Search", desc: "Saved searches, NAICS expansion, keyword tricks that surface work before the crowd.", page: 22 },
            { code: "S3B", title: "Agency Forecast Intelligence", desc: "Acquisition forecasts, HigherGov, USASpending.gov — reading the tea leaves.", page: 24 },
            { code: "S3C", title: "Bid / No-Bid Discipline", desc: "The 10-factor score. When to walk. The cost of chasing everything.", page: 26 }
          ]
        },
        {
          label: "STAGE 4 · BID",
          items: [
            { code: "S4A", title: "Reading Section L and M", desc: "Instructions and evaluation factors. The two sections that decide whether you win or lose.", page: 29 },
            { code: "S4B", title: "Compliance Matrix Discipline", desc: "The tool that prevents fatal deficiencies. How to build it in two hours.", page: 31 },
            { code: "S4C", title: "Win Themes & Past Performance", desc: "Ghost-writing your own strengths. Past performance that actually scores.", page: 33 },
            { code: "S4D", title: "Cost Proposal & Pricing Strategy", desc: "Price-to-win vs. price-to-cost. Indirect rates. The 30-day proposal calendar.", page: 36 }
          ]
        },
        {
          label: "STAGE 5 · WIN",
          items: [
            { code: "S5A", title: "Award, Negotiation & Kickoff", desc: "What happens after award. Pre-performance prep. Kickoff meeting structure.", page: 40 }
          ]
        },
        {
          label: "STAGE 6 · DELIVER",
          items: [
            { code: "S6A", title: "CPARS Strategy from Day 1", desc: "DCAA basics. Mods. QASP. The play that wins the second contract.", page: 43 }
          ]
        },
        {
          label: "APPENDICES",
          items: [
            { code: "APP", title: "Acronym Glossary · Fiscal Calendar · 8 Big Mistakes", desc: "The reference section you'll actually use.", page: 46 }
          ]
        }
      ]
    },

    /* ─── FOUNDER / INTRO ───────────────────────────────────── */
    {
      type: "founder",
      headline: "Nobody hands you a federal contract.",
      accentWord: "hands",
      paragraphs: [
        "The federal market is $700 billion a year. Small businesses get a third of that — by law. And yet most small businesses that try go years without winning anything. Not because the work isn't there. Because nobody showed them the process.",
        "This manual is the process. Start to finish. Stage by stage. We wrote it the way we wish someone had explained it to us — with real dollar thresholds, real FAR clauses, real agency names, and honest timelines. No participation trophies.",
        "Use it alongside the Federal Launch Kit files. Every section tells you exactly which FLK spreadsheet or checklist backs it up. Work the kit, run the process, and by 90 days you'll have either a win or a clear picture of why you haven't won yet — and what to do about it.",
        "Good luck. Do the work."
      ],
      ctaText: "Book a 30-min strategy call",
      ctaUrl: "https://meetings-na2.hubspot.com/americurial/intro-call",
      ctaButtonLabel: "Book the call →",
      ctaEyebrow: "30 MIN · NO PITCH",
      footerLabel: "CAPTUREPILOT · FEDERAL CONTRACTING FIELD MANUAL"
    },

    /* ─── INTRO CONTENT ─────────────────────────────────────── */
    {
      type: "content",
      headerLabel: "INTRODUCTION",
      markdown: `<div class="eyebrow">INTRODUCTION</div>

# What This Manual Is — and How to Use It

This is the reference document for the entire Federal Launch Kit. Everything else in the kit — the spreadsheets, checklists, playbooks, and templates — maps back to the six stages covered here. If you're confused about where to start, start here. If you're stuck on a specific step, find the stage and read the cross-references.

## The six-stage journey

Federal contracting isn't a single event. It's a pipeline. Most firms fail because they treat it like a one-time project — they register, upload a capability statement, and wait. Nothing happens because nothing was supposed to happen. You have to work each stage, in order.

<table>
  <thead>
    <tr><th>Stage</th><th>What you're doing</th><th>Typical timeline</th><th>FLK files</th></tr>
  </thead>
  <tbody>
    <tr><td><strong>1 · Register</strong></td><td>Get into SAM.gov, pick your NAICS codes, get your UEI and CAGE code</td><td>1–3 weeks</td><td>FLK_01 series</td></tr>
    <tr><td><strong>2 · Position</strong></td><td>Write your capability statement, pursue certifications, map your set-aside strategy</td><td>1–4 weeks</td><td>FLK_02, FLK_05</td></tr>
    <tr><td><strong>3 · Find</strong></td><td>Set up SAM.gov saved searches, track agency forecasts, build your opportunity pipeline</td><td>Ongoing</td><td>FLK_03, FLK_04</td></tr>
    <tr><td><strong>4 · Bid</strong></td><td>Respond to Sources Sought, write proposals, build compliance matrices, price to win</td><td>30–60 days per bid</td><td>FLK_03, FLK_06, FLK_08</td></tr>
    <tr><td><strong>5 · Win</strong></td><td>Negotiate, accept award, prep for kickoff</td><td>1–4 weeks post-award</td><td>FLK_06</td></tr>
    <tr><td><strong>6 · Deliver</strong></td><td>Perform, manage CPARS, handle mods, win the re-compete</td><td>Contract duration</td><td>FLK_11 series</td></tr>
  </tbody>
</table>

## How to use the FLK files alongside this manual

Each stage section ends with a **Cross-Reference** block listing the specific FLK files that support the work. The pattern is:

- **Read the stage section first.** Understand the strategy and the gotchas before you open a spreadsheet.
- **Then open the FLK file.** Use it as a working tool — fill it in, score it, track it.
- **Come back here when you're stuck.** The manual explains the *why*. The FLK files handle the *what*.

## Honest expectations

First federal contract: usually 6–18 months from SAM registration to award, depending on your industry and how aggressively you work the pipeline. That's not a reason to wait — every day you don't work it is a day you're behind the firms that do. But it means you need to build the pipeline now so the wins come later.

<div class="callout callout--emerald">
  <div style="font-family:'IBM Plex Mono', monospace; font-size:8.5pt; font-weight:600; letter-spacing:0.16em; color:#047857; text-transform:uppercase; margin-bottom:2mm;">THE 90-DAY PLAY</div>
  <strong>Days 1–30:</strong> Complete SAM registration, write capability statement, identify 10 target agencies. <strong>Days 31–60:</strong> Respond to at least 3 Sources Sought / RFIs. <strong>Days 61–90:</strong> Submit at least 1 full proposal. That's it. That's the plan.
</div>
`
    },

    /* ─── STAGE 1 DARK PANEL ────────────────────────────────── */
    {
      type: "dark",
      partLabel: "STAGE 1 · REGISTER",
      headline: "Nothing starts until SAM.gov says you exist.",
      accentWord: "exist",
      paragraphs: [
        "SAM.gov is the federal government's vendor registry. No registration, no award — full stop. The process takes 1–3 weeks. Most of that time is waiting for the federal government to verify your entity. You cannot shortcut the wait. You can screw it up badly if you rush the data entry.",
        "This stage covers the registration walkthrough, NAICS picking strategy, and the renewal discipline that keeps your registration active. Cross-reference: FLK_01 series."
      ],
      footerLabel: "CAPTUREPILOT · FEDERAL CONTRACTING FIELD MANUAL",
      headerLabel: "STAGE 1 · REGISTER"
    },

    /* ─── STAGE 1 CONTENT ───────────────────────────────────── */
    {
      type: "content",
      headerLabel: "STAGE 1 · REGISTER",
      markdown: `<div class="eyebrow">STAGE 1 · REGISTER</div>

# SAM.gov from Scratch

SAM.gov (System for Award Management) is the single federal portal for entity registration, exclusions, contract opportunities, and wage determinations. You cannot receive a federal contract — prime or sub — without an active registration. Here's how to get there without breaking it.

## Before you log in

You need three things before you touch SAM.gov:

1. **An EIN (Employer Identification Number)** from the IRS. If you're a sole proprietor using your SSN, get an EIN first — it keeps your personal tax ID out of federal systems.
2. **A DUNS replacement: your UEI.** SAM now assigns the Unique Entity Identifier directly. You'll get it during registration.
3. **Your legal business name and address exactly as they appear with your state registration.** Mismatches between SAM and your state filings trigger validation failures.

## The registration steps

<table>
  <thead>
    <tr><th>Step</th><th>What you do</th><th>Watch point</th></tr>
  </thead>
  <tbody>
    <tr><td>1</td><td>Create a Login.gov account with MFA — this is your SAM credential. Use a real email you check. Enable two-factor immediately.</td><td>Losing access to this email = losing access to your SAM record. Set up a shared company inbox, not a personal Gmail.</td></tr>
    <tr><td>2</td><td>Start a new entity registration. Enter your legal name, EIN, and physical address. SAM validates against IRS data — exact match required.</td><td>PO boxes are not accepted as physical addresses. Use your real office address.</td></tr>
    <tr><td>3</td><td>Select your NAICS codes. The primary NAICS determines your size standard. Secondary codes expand your footprint. See the NAICS section below.</td><td>Your primary NAICS must accurately describe your main line of work. Inflating it to a larger size standard is fraud.</td></tr>
    <tr><td>4</td><td>Complete Representations and Certifications (Reps and Certs). This is a multi-screen series of legal certifications. Read every item. A false certification = False Claims Act exposure.</td><td>The small business certification in particular: you certify you qualify at the time of each offer. If you grow past the size standard, you're required to self-report.</td></tr>
    <tr><td>5</td><td>Enter your banking information for EFT payment. Routing number + account number. This is where your payments go.</td><td>Federal payment fraud almost always involves a fraudster changing this field. Lock your SAM record with a dedicated entity administrator and Login.gov MFA.</td></tr>
    <tr><td>6</td><td>Submit and wait. Activation takes 1–3 business days after federal validation, sometimes up to 10 days for new entities.</td><td>Check your email for validation messages. Respond to any federal requests within 24 hours or the process restarts.</td></tr>
  </tbody>
</table>

## NAICS picking strategy

Your NAICS codes tell the government what you do. Pick wrong and you miss opportunities. Pick too many and you look unfocused. Here's the framework:

**Primary NAICS:** The single code that best describes your main service or product. This is the code used to determine your size standard eligibility (employee count or revenue cap). Get this right — it affects every set-aside you can pursue.

**Secondary NAICS:** You can list as many as you want. List every code that legitimately describes work you can perform. This is not the place to pad your profile — if you can't actually deliver IT services, don't list 541512 just because it has good spend.

<div class="callout callout--emerald">
  <div style="font-family:'IBM Plex Mono', monospace; font-size:8.5pt; font-weight:600; letter-spacing:0.16em; color:#047857; text-transform:uppercase; margin-bottom:2mm;">NAICS EXPANSION TRICK</div>
  Look at contracts you've delivered commercially. Pull the NAICS codes from similar SAM.gov awards using USASpending.gov. Then add the codes where your commercial work maps cleanly to federal work — even if you haven't done federal work in that area yet.
</div>

**Size standards by category (2024 thresholds):**

<table>
  <thead>
    <tr><th>Industry type</th><th>Typical threshold</th><th>Examples</th></tr>
  </thead>
  <tbody>
    <tr><td>Professional services</td><td>$19M–$25.5M revenue</td><td>541611 management consulting, 541512 IT</td></tr>
    <tr><td>Construction</td><td>$22M–$45M revenue</td><td>236220 commercial, 237310 highway</td></tr>
    <tr><td>Manufacturing</td><td>500–1,500 employees</td><td>332 fabricated metal, 334 electronics</td></tr>
    <tr><td>Janitorial / facilities</td><td>$22M revenue</td><td>561720 janitorial, 561210 facilities mgmt</td></tr>
    <tr><td>IT products / VAR</td><td>$47M–$150M revenue</td><td>334111 computers, 541519 other IT</td></tr>
  </tbody>
</table>

## SAM renewal cadence

Your SAM registration expires **exactly 365 days after activation**. There is no grace period. An expired registration means you cannot receive payments — not that you cannot submit a proposal. Many firms miss this distinction and find out at award that their registration lapsed.

**Who should own renewal:** Assign one named person with a calendar reminder 45 days out. That person should be an officer or the designated entity administrator. It's a 20-minute task. Missing it is a revenue risk.

**What to review at renewal:**
- Banking information: confirm routing and account numbers
- Physical address: update if you've moved
- Reps and Certs: re-certify any that have changed
- NAICS codes: add or remove based on your current capabilities

<div class="callout">
  <div class="eyebrow" style="margin-bottom:2mm;">CROSS-REFERENCE</div>
  <strong>FLK_01_SAM_Registration_Walkthrough.pdf</strong> — screenshot-by-screenshot walkthrough of every SAM screen. <strong>FLK_01_SAM_PreReg_Checklist.xlsx</strong> — everything you need to gather before you sit down. <strong>FLK_01_SAM_Renewal_Kit.pdf</strong> — annual renewal checklist and timeline.
</div>
`
    },

    /* ─── STAGE 2 DARK PANEL ────────────────────────────────── */
    {
      type: "dark",
      partLabel: "STAGE 2 · POSITION",
      headline: "The work that happens before you bid.",
      accentWord: "before",
      paragraphs: [
        "Every dollar you spend chasing contracts before you've positioned properly is money you're likely to waste. Positioning means: a capability statement that reads like a contract vehicle, not a marketing brochure. It means knowing which certifications are worth your time and money. And it means understanding which NAICS codes have actual set-aside spend in your target agencies.",
        "This stage is where most small businesses shortcut and pay for it later. Cross-reference: FLK_02 + FLK_05."
      ],
      footerLabel: "CAPTUREPILOT · FEDERAL CONTRACTING FIELD MANUAL",
      headerLabel: "STAGE 2 · POSITION"
    },

    /* ─── STAGE 2 CONTENT ───────────────────────────────────── */
    {
      type: "content",
      headerLabel: "STAGE 2 · POSITION",
      markdown: `<div class="eyebrow">STAGE 2 · POSITION</div>

# Capability Statement Deep-Dive

The capability statement is your federal business card. Contracting officers, prime contractors, and agency small business offices all ask for it. It's one page. It takes most firms three or four drafts to get right. Here's what goes in each section and — more importantly — what to cut.

## The five required sections

<table>
  <thead>
    <tr><th>Section</th><th>What goes here</th><th>Common mistake</th></tr>
  </thead>
  <tbody>
    <tr><td><strong>Core Competencies</strong></td><td>3–5 specific service/product capabilities. Use the language of the federal market: "program management," "systems integration," "O&M support." Not "we help clients succeed."</td><td>Too vague. "IT solutions" is not a capability. "Cloud migration on AWS GovCloud" is.</td></tr>
    <tr><td><strong>Past Performance</strong></td><td>3–5 contracts or engagements. Name, contract number if federal, dollar value, period, what you delivered. If you have no federal past performance, use commercial work in the same domain.</td><td>Using client logos without permission. Using old contracts with no relevance. Fake numbers.</td></tr>
    <tr><td><strong>Differentiators</strong></td><td>2–3 things that are genuinely true about your firm and not true of every competitor. Certifications count. Clearances count. Proprietary tools count. "Customer-focused" does not count.</td><td>Generic differentiators that every firm says. If you can't defend it in a conversation, cut it.</td></tr>
    <tr><td><strong>Company Data</strong></td><td>Legal name, address, UEI/CAGE, NAICS codes, size standards, certifications, contact name, phone, email.</td><td>Outdated CAGE code. Wrong primary NAICS. Missing certifications that you actually hold.</td></tr>
    <tr><td><strong>Branding</strong></td><td>Logo, readable fonts, clean layout. One page, printable in black and white, readable at 11pt.</td><td>Tiny fonts to cram in content. Dark backgrounds that don't print. Design that makes the data hard to find.</td></tr>
  </tbody>
</table>

## The "no federal past performance" problem

First-time federal contractors almost always ask: *how do I get past performance if nobody will give me a contract without past performance?* The answer has two parts:

**Part 1:** Commercial work counts. A $2M commercial IT project is legitimate past performance for a federal IT contract. Write it up the same way: client name, description, dollar value, period, outcome. The absence of a contract number is not disqualifying — it just means you reference the client, not the contract number.

**Part 2:** Start with Sources Sought responses and subcontracting. Responding to a Sources Sought costs nothing and gets your name in front of the CO. Subcontracting on a prime's federal contract gives you real federal past performance. Both are faster routes to federal credibility than trying to win a prime contract from zero.

# Certifications Strategy

Federal certifications are worth money — some directly (sole-source contracts, set-aside pools), some indirectly (teaming leverage, prime contractor appetites). Here's an honest look at the four major small business certifications:

<table>
  <thead>
    <tr><th>Certification</th><th>Key benefit</th><th>Requirements (summary)</th><th>Time to get</th><th>Worth it if…</th></tr>
  </thead>
  <tbody>
    <tr><td><strong>8(a)</strong></td><td>Sole-source awards up to $4.5M (services) / $7M (manufacturing). Access to the 8(a) set-aside pool.</td><td>Socially and economically disadvantaged owner, &gt;51% owned/controlled, must be a small business, personal net worth &lt;$850K at entry</td><td>3–6 months for SBA review</td><td>You qualify, you want 9 years of protected set-aside access, and you're willing to accept SBA oversight</td></tr>
    <tr><td><strong>HUBZone</strong></td><td>10% price evaluation preference in full-and-open. Set-aside pool. Price evaluation preference on unrestricted contracts.</td><td>35% of employees must live in a HUBZone. Principal office must be in a HUBZone.</td><td>60–90 days</td><td>You naturally hire from a HUBZone area — don't restructure your business to qualify</td></tr>
    <tr><td><strong>SDVOSB</strong></td><td>VA sole-source up to $5M (services). VA set-asides are large and real.</td><td>Veteran-owned (&gt;51%), service-disabled, veteran controls day-to-day management</td><td>30–60 days (SBA self-certification for non-VA; VA VIP registry for VA work)</td><td>You're a service-disabled veteran pursuing VA or DoD work</td></tr>
    <tr><td><strong>WOSB/EDWOSB</strong></td><td>Set-aside access in industries where women are underrepresented.</td><td>Woman-owned (&gt;51%), woman controls management, NAICS must be in the designated list</td><td>30–60 days (third-party certifier or SBA direct)</td><td>You're woman-owned AND your primary NAICS is on the SBA's underrepresentation list</td></tr>
  </tbody>
</table>

## Set-aside math: where the money actually is

Before you pursue a certification, pull the spend data. Here's how:

1. Go to USASpending.gov → Advanced Search → filter by NAICS + set-aside type (e.g., "Small Business Set-Aside," "8(a)") + fiscal year
2. Look at total obligated amount in your target NAICS by agency
3. If a NAICS has &lt;$50M in annual set-aside spend nationally, the certification may not be worth the overhead unless your target agencies are specifically heavy in that pool

**Highest set-aside spend NAICS (2024 data, small business set-asides):**
- 541512 Computer Systems Design: $8.2B set-aside, primarily DoD and DHS
- 561720 Janitorial Services: $2.7B set-aside, primarily GSA PBS and VA
- 541611 Management Consulting: $4.1B set-aside, civilian agencies heavy
- 236220 Commercial Construction: $3.8B set-aside, VA and Army Corps

<div class="callout">
  <div class="eyebrow" style="margin-bottom:2mm;">CROSS-REFERENCE</div>
  <strong>FLK_02_Capability_Statement_Template.docx</strong> — fill-in template with all five sections. <strong>FLK_02_How_to_Write_Capability_Statement.pdf</strong> — annotated examples of strong vs. weak cap statements. <strong>FLK_05_8a_Self_Assessment.xlsx</strong> — 8(a) eligibility self-score before you invest in the application.
</div>
`
    },

    /* ─── STAGE 3 DARK PANEL ────────────────────────────────── */
    {
      type: "dark",
      partLabel: "STAGE 3 · FIND",
      headline: "The work that's already in the pipeline is already spoken for.",
      accentWord: "already",
      paragraphs: [
        "By the time a solicitation hits SAM.gov, the smart competitors have been talking to the agency for six months. That doesn't mean you can't win a cold solicitation — you can. But it means your best odds are on the work you know is coming before it's posted.",
        "This stage covers SAM.gov search discipline, agency forecast intelligence, and the bid/no-bid scoring that keeps you from wasting proposals on work you can't win. Cross-reference: FLK_03 + FLK_04."
      ],
      footerLabel: "CAPTUREPILOT · FEDERAL CONTRACTING FIELD MANUAL",
      headerLabel: "STAGE 3 · FIND"
    },

    /* ─── STAGE 3 CONTENT ───────────────────────────────────── */
    {
      type: "content",
      headerLabel: "STAGE 3 · FIND",
      markdown: `<div class="eyebrow">STAGE 3 · FIND</div>

# SAM.gov Power-User Search

SAM.gov's search interface is not intuitive. Most users search by keyword, scroll through results, and miss 80% of the relevant opportunities. Here's how to actually use it.

## Saved search setup

Saved searches are how you build a passive pipeline. Set them up once and let SAM email you when new opportunities match. Here's the configuration that works:

<table>
  <thead>
    <tr><th>Filter</th><th>What to set</th><th>Why</th></tr>
  </thead>
  <tbody>
    <tr><td><strong>Notice Type</strong></td><td>Include Sources Sought, Presolicitation, and Solicitation</td><td>Sources Sought is your earliest signal — 6–18 months before award</td></tr>
    <tr><td><strong>NAICS Code</strong></td><td>Your primary + top 3 secondary codes</td><td>One saved search per code cluster works better than one giant search</td></tr>
    <tr><td><strong>Set-Aside</strong></td><td>Match to your certifications (Small Business, 8(a), etc.)</td><td>Filters out full-and-open work where you'll be outpriced</td></tr>
    <tr><td><strong>Agency</strong></td><td>Top 3–5 target agencies</td><td>Keeps results manageable and focused on agencies you know</td></tr>
    <tr><td><strong>Keywords</strong></td><td>2–3 core service terms from your capability statement</td><td>Catches opportunities that use different NAICS but describe your work</td></tr>
  </tbody>
</table>

## Notice type priority

Not all notices are equal. Here's how to prioritize your attention:

- **Sources Sought / RFI (5 stars):** 6–18 months before award. This is your window to shape the requirement and establish relationships. Respond to every one that touches your core capabilities.
- **Presolicitation (4 stars):** 30–90 days before RFP. The requirement is set but the CO is still listening. Request a meeting.
- **Solicitation (3 stars):** The RFP is out. 30 days to respond. Win rate on cold solicitations is low — submit only if you've had prior contact or your past performance is a near-perfect match.
- **Award Notice (2 stars):** Contract awarded. No bid opportunity — but research who won and why. This is intelligence for the re-compete.

## NAICS expansion

Your primary NAICS is not your ceiling. Here's how to legitimately expand your footprint:

1. Pick a contract you've already delivered commercially
2. Look up the NAICS codes on similar federal awards using USASpending.gov Advanced Search
3. If the federal NAICS maps to work you actually do, add it to your SAM profile
4. Update your capability statement to include a relevant bullet under Core Competencies

One small business we tracked went from 2 NAICS codes to 7 over 18 months — all legitimate expansions of existing commercial work. Their SAM search results tripled. Their win rate held steady.

# Agency Forecast Intelligence

The federal government publishes acquisition forecasts — planned buys for the next fiscal year. Not every agency updates these on schedule, but the ones that do are gold. Here's where to find them:

<table>
  <thead>
    <tr><th>Source</th><th>What it covers</th><th>How to use it</th></tr>
  </thead>
  <tbody>
    <tr><td><strong>Agency acquisition forecasts</strong></td><td>Planned contracts by agency, typically with NAICS, estimated value, and target small business set-aside</td><td>Google "[agency name] acquisition forecast FY2025" or go to the agency's small business office website</td></tr>
    <tr><td><strong>USASpending.gov</strong></td><td>Historical awards by agency, NAICS, vendor. Contract expiration dates.</td><td>Search your NAICS + target agency, sort by expiration date — contracts expiring in 12–18 months are re-compete targets</td></tr>
    <tr><td><strong>FPDS (Federal Procurement Data System)</strong></td><td>The authoritative contract award database. Every dollar obligated.</td><td>Access via USASpending.gov or directly at fpds.gov. Filter by NAICS + agency + fiscal year.</td></tr>
    <tr><td><strong>CapturePilot</strong></td><td>Automated match scoring, re-compete intelligence, agency spend forecasts — all in one dashboard</td><td>Set up your NAICS profile and let it surface the matches. The platform pulls SAM + USASpending daily.</td></tr>
  </tbody>
</table>

# Bid / No-Bid Discipline

The average cost of writing a federal proposal is $15,000–$75,000 in staff time. That's for a real, competitive proposal — not a rushed response. The firms that win consistently don't bid more. They bid smarter.

## The 10-factor bid/no-bid score

Score each factor 1–5. Total score below 30 = no-bid. Between 30–40 = bid only if you have slack capacity. Above 40 = full pursuit.

- **Customer relationship (12%):** Have you talked to this CO or program office before? Score 1 if cold, 5 if you've met at least twice and they know your name.
- **Technical fit (15%):** How closely do your core competencies match the Statement of Work? Score 1 for stretch, 5 for exact match.
- **Past performance match (12%):** Do you have 2+ relevant past performance examples you can cite by name and dollar value?
- **Competitive position (10%):** Do you know who the incumbent is? Do you know your main competitors? Do you have an advantage over at least one of them?
- **Price-to-win visibility (15%):** Can you estimate the government's budget within 20%? Do you know the incumbent's rate structure?
- **Key personnel (10%):** Do you have the right résumés for the required positions? Are they available?
- **Team strength (8%):** If you need a teammate, do you have one identified and ready?
- **Compliance readiness (10%):** Can you meet every requirement in Section L without a waiver or exception?
- **Capture maturity (8%):** Did you respond to the Sources Sought? Did you attend the industry day?
- **Operational readiness (10%):** Can you mobilize within the required start date?

<div class="callout">
  <div class="eyebrow" style="margin-bottom:2mm;">CROSS-REFERENCE</div>
  <strong>FLK_04_Bid_No_Bid_Decision_Matrix.xlsx</strong> — the 10-factor score sheet with weighted calculation. <strong>FLK_03_Market_Research_Playbook.pdf</strong> — how to build the competitive intelligence that feeds the score.
</div>
`
    },

    /* ─── STAGE 4 DARK PANEL ────────────────────────────────── */
    {
      type: "dark",
      partLabel: "STAGE 4 · BID",
      headline: "Section L tells you what to do. Section M tells you how to win.",
      accentWord: "win",
      paragraphs: [
        "The proposal is not a writing exercise. It's a structured argument for why you should win. Every word either supports the argument or wastes the evaluator's time. Most losing proposals fail in the first pass: they're non-compliant, they don't address the evaluation criteria, or they're so generic the evaluator can't tell what the offeror actually does.",
        "This stage covers the mechanics — Section L/M, compliance matrices, win themes, past performance, cost proposals, and pricing strategy. Cross-reference: FLK_03, FLK_06, FLK_08."
      ],
      footerLabel: "CAPTUREPILOT · FEDERAL CONTRACTING FIELD MANUAL",
      headerLabel: "STAGE 4 · BID"
    },

    /* ─── STAGE 4 CONTENT A ──────────────────────────────────── */
    {
      type: "content",
      headerLabel: "STAGE 4 · BID",
      markdown: `<div class="eyebrow">STAGE 4 · BID — PART ONE</div>

# Reading Section L and Section M

Every federal solicitation has an "L" and an "M." Section L is Instructions to Offerors — it tells you exactly what to submit, in what order, with what page limits and formatting requirements. Section M is Evaluation Factors — it tells you exactly how the government will score your proposal. Read both before you write a single word.

## Section L: What you're required to submit

Section L will typically specify:

- **Volume structure:** Volume I Technical, Volume II Management, Volume III Past Performance, Volume IV Price. Exactly this order. No deviations.
- **Page limits:** Often 25–50 pages for technical, strict. Some solicitations specify margins, fonts, and point sizes. Violate them and your proposal may be ruled non-compliant without evaluation.
- **Attachment requirements:** Résumés, past performance questionnaires (PPQs), teaming agreements, subcontracting plans. Each one has its own deadline and format.
- **Due date and submission method:** SAM.gov PIEE, beta.sam.gov, or email. Get this wrong and you have no proposal.

## Section M: How you'll be scored

Section M lists the evaluation factors in order of importance. The most common structures:

<table>
  <thead>
    <tr><th>Structure</th><th>What it means for your proposal</th></tr>
  </thead>
  <tbody>
    <tr><td><strong>Technical / Management / Past Performance / Price</strong> (most common)</td><td>Technical is usually most important. Write to the Technical factors first. Past performance comes next. Price is often "lowest price technically acceptable" (LPTA) for commoditized services.</td></tr>
    <tr><td><strong>Best Value Tradeoff</strong></td><td>The government can pay more for better technical. Your win themes need to show measurable value, not just compliance.</td></tr>
    <tr><td><strong>LPTA (Lowest Price Technically Acceptable)</strong></td><td>Technical only has to be "acceptable" — price wins. If you can't be cheapest, don't bid LPTA unless your technical differentiator is extraordinary.</td></tr>
  </tbody>
</table>

## The compliance matrix: your first tool, not your last

A compliance matrix maps every requirement in Section L to a location in your proposal. It sounds bureaucratic. It's the difference between passing the initial compliance check and being eliminated before evaluation.

**How to build one in two hours:**

1. Extract every "shall," "must," and "will" from Section L into a spreadsheet
2. Add columns: Volume, Section, Page/Paragraph, Status (draft / complete / N/A)
3. Assign an owner for each row
4. Review before submission — every row must be marked complete

The compliance matrix doesn't just protect you from fatal deficiencies. It also forces your proposal team to read the entire L before writing — which most of them won't do otherwise.

# Win Themes and Past Performance

Win themes are the 3–5 specific reasons why your firm should win this contract. Not why you're good at your job. Why you're the best choice for *this* work, for *this* agency, at *this* time.

## How to develop win themes

**Step 1:** Read Section M's evaluation factors and pull out the specific discriminators. If the solicitation weights "experience with DoD information systems" heavily — that's a theme anchor.

**Step 2:** Map your actual capabilities to those discriminators. Be specific. "We've managed 47 DoD information systems transitions at DLA and DISA" is a win theme. "We have strong DoD experience" is not.

**Step 3:** Check your themes against competitive intelligence. If your main competitor can make the same claim, it's not a discriminating theme — it's table stakes.

**The rule:** Every section of your technical volume should reinforce at least one win theme. If a paragraph doesn't support a win theme, cut it or reframe it.

## Past performance that scores

Past performance evaluators look for three things: relevance, recency, and quality.

- **Relevance:** Scope, complexity, and dollar value similar to what's being procured. A $500K past performance reference on a $10M solicitation is weak. Show you've worked at scale.
- **Recency:** Within 5 years, preferably within 3. Older references don't score as well.
- **Quality:** CPARS ratings, or if not available, a customer reference who will say you did excellent work.

**If you're a first-time federal bidder:** Commercial past performance works. Write it up with: client name, description of work, dollar value, period, outcome, point of contact. Three strong commercial references outperform three mediocre federal ones.

<div class="callout callout--emerald">
  <div style="font-family:'IBM Plex Mono', monospace; font-size:8.5pt; font-weight:600; letter-spacing:0.16em; color:#047857; text-transform:uppercase; margin-bottom:2mm;">THE CPARS SCORE THAT WASN'T FILED</div>
  Roughly 30% of federal contracts never get a CPARS rating filed. That's work you did with no record. Before you submit past performance references, check whether CPARS records exist. If not, ask your old COR to file one. Some will. It's worth asking.
</div>
`
    },

    /* ─── STAGE 4 CONTENT B ──────────────────────────────────── */
    {
      type: "content",
      headerLabel: "STAGE 4 · BID — COST PROPOSAL",
      markdown: `<div class="eyebrow">STAGE 4 · BID — PART TWO</div>

# Cost Proposal Structure and Pricing Strategy

The cost proposal is where most small businesses leave money on the table — or bid themselves out of competition. The fundamentals aren't complicated. Getting them wrong is.

## Cost proposal structure

A federal cost proposal typically has four components:

<table>
  <thead>
    <tr><th>Component</th><th>What it is</th><th>What trips people up</th></tr>
  </thead>
  <tbody>
    <tr><td><strong>Direct Labor</strong></td><td>Hours × loaded labor rates by labor category (LCAT). Your proposed team, their rates, their hours per period of performance.</td><td>Understaffing to look cheap. Offering a LCAT at a rate lower than you can actually hire for.</td></tr>
    <tr><td><strong>Other Direct Costs (ODCs)</strong></td><td>Travel, equipment, subcontractor costs, materials. Anything billed directly to the contract.</td><td>Forgetting travel costs. Not pricing subcontractor margins correctly.</td></tr>
    <tr><td><strong>Indirect Rates</strong></td><td>Fringe benefit rate, overhead rate, G&A rate. Applied as a percentage to direct labor or total direct costs.</td><td>Not knowing your rates. Using provisional rates without DCAA audit support. Rates that are out of market.</td></tr>
    <tr><td><strong>Fee / Profit</strong></td><td>Your margin. Typically 8–12% on cost-type contracts. Fixed-price profit is implicit in your price.</td><td>Low-balling fee to win LPTA when the real discriminator is technical. Taking no fee at all to win a contract you'll regret.</td></tr>
  </tbody>
</table>

## Indirect rates: what they are and why they matter

If you've never had a federal cost-type contract, you may not have established indirect rates. Here's the minimum you need:

- **Fringe rate:** Benefits cost as a percentage of direct labor. Typical range: 25–35% for small businesses.
- **Overhead rate:** Indirect costs of doing the work (supervisors, facilities, indirect labor). Varies widely by company type. Manufacturing overhead can be 60–120%. Professional services: 15–40%.
- **G&A rate:** General and administrative costs (accounting, legal, executive salaries, business development). Typically 10–20% of total cost input.

**If you don't know your rates:** Work with a cost accountant to establish them before you bid any cost-plus contract. DCAA will audit them eventually. Forward pricing rates you can't support are a liability.

## Price-to-win vs. price-to-cost

These are two different things:

**Price-to-cost:** What does it cost you to deliver the work, plus a reasonable fee? This is the floor. You should never price below this unless you have a strategic reason.

**Price-to-win (PTW):** What does the government expect to pay, and what will your competitors bid? PTW research involves analyzing prior contract awards for similar work, understanding the IGCE (Independent Government Cost Estimate) if disclosed, and using competitive intelligence to estimate competitor pricing.

The gap between PTW and your price-to-cost is where you make bid decisions. If PTW is $8M and your realistic cost is $9M, you either can't win or you need to scope down. If PTW is $12M and your cost is $8M, you have room to offer better value or take more fee.

## The 30-day proposal calendar

This is a realistic timeline for a 30-day proposal turnaround. Adjust for larger, more complex solicitations — 60 and 90-day calendars follow the same pattern, just with more review cycles.

<table>
  <thead>
    <tr><th>Day</th><th>Activity</th><th>Owner</th></tr>
  </thead>
  <tbody>
    <tr><td>1–2</td><td>Read entire solicitation. Annotate. Build compliance matrix. Call the CO with clarifying questions (before Q&A deadline).</td><td>Capture manager</td></tr>
    <tr><td>3–5</td><td>Bid/no-bid decision. If bidding: kickoff meeting, assign volume leads, confirm team availability, start key personnel résumé collection.</td><td>Principals + capture manager</td></tr>
    <tr><td>6–15</td><td>Draft technical volume, management approach, past performance. Begin cost proposal setup.</td><td>Volume leads</td></tr>
    <tr><td>16–20</td><td>Internal Pink Team review. Mark every compliance matrix item. Identify gaps. Rewrite weak sections.</td><td>Proposal manager + reviewer</td></tr>
    <tr><td>21–26</td><td>Revisions. Finalize past performance references (get PPQs submitted early — give clients 7 days). Cost proposal complete and reviewed.</td><td>All volume leads</td></tr>
    <tr><td>27–29</td><td>Red Team review if time allows. Final formatting check against Section L requirements. Assemble all volumes and attachments.</td><td>Proposal manager</td></tr>
    <tr><td>30</td><td>Submit via required method (PIEE / SAM / email) at least 4 hours before due time. Confirm receipt.</td><td>Proposal manager</td></tr>
  </tbody>
</table>

<div class="callout">
  <div class="eyebrow" style="margin-bottom:2mm;">CROSS-REFERENCE</div>
  <strong>FLK_03_RFP_Response_Playbook.pdf</strong> — annotated RFP walkthrough and proposal structure templates. <strong>FLK_06_Proposal_Templates/</strong> — cost proposal shell, compliance matrix template, past performance form. <strong>FLK_08_Price_to_Win_Worksheet.xlsx</strong> — PTW analysis tool with market comp and rate benchmarks.
</div>
`
    },

    /* ─── STAGE 5 DARK PANEL ────────────────────────────────── */
    {
      type: "dark",
      partLabel: "STAGE 5 · WIN",
      headline: "Getting the award is 20% of winning.",
      accentWord: "20%",
      paragraphs: [
        "The other 80% is what happens in the next 90 days. Award is a notice, not a contract. There's a debriefing window where protests happen. There's a negotiation phase on cost-type contracts. There's a kickoff meeting where you set the tone for the entire performance period.",
        "Get these right and you build a relationship that wins the re-compete. Get them wrong and you spend the next two years managing a difficult COR."
      ],
      footerLabel: "CAPTUREPILOT · FEDERAL CONTRACTING FIELD MANUAL",
      headerLabel: "STAGE 5 · WIN"
    },

    /* ─── STAGE 5 CONTENT ───────────────────────────────────── */
    {
      type: "content",
      headerLabel: "STAGE 5 · WIN",
      markdown: `<div class="eyebrow">STAGE 5 · WIN</div>

# Award Notice, Negotiation, and Kickoff

## The award notice and the protest window

When the government selects you for award, they issue an award notice. But before they can award, they must notify unsuccessful offerors and give them the opportunity to request a debriefing. After the debriefing, competitors have the right to file a protest with the Government Accountability Office (GAO) or the Court of Federal Claims.

**What this means for you:**
- Award is not final until the protest period passes (typically 10 days for express option, longer for standard GAO protest)
- Do not mobilize your workforce or incur costs until the contracting officer says the award is final
- If a protest is filed, the government must suspend performance pending resolution — usually 100 days at GAO

**Your job during the protest window:**
- Review the award notice for any anomalies
- If you were *not* selected, request a written debriefing within 3 business days. You have the right to it.
- Prepare for kickoff — but don't spend money yet

## Negotiation on cost-type contracts

Fixed-price contracts typically don't involve a formal negotiation — you submitted your price, they accepted or rejected. Cost-type contracts (CPFF, CPIF, T&M, labor-hour) often involve negotiating your indirect rates, labor categories, and fee.

The government uses a Pre-Negotiation Memorandum (PNM) and a business clearance process. Key points:

- **Bring documentation.** If you can't support your indirect rates with actual cost data, DCAA and the CO will push them down.
- **Know your walk-away point.** At what fee percentage does the contract become unprofitable? Do not negotiate below that point.
- **Negotiate scope before price.** If the CO wants to reduce price, the right response is usually to reduce scope, not just cut your margin.

## Kickoff meeting: the tone you set

The kickoff meeting is your first interaction as the contractor of record. The CO, COR, and program office will all be there. The tone you set in that meeting often determines how the entire performance period goes.

**Before kickoff:**
- Review the contract in full: all sections, all deliverables, all reporting requirements
- Identify every deliverable with a due date and assign an internal owner
- Prepare a brief one-page transition plan if there's an incumbent
- Confirm your key personnel are cleared, badged, and ready to mobilize

**At kickoff:**
- Introduce your team by name and role
- Walk through your kickoff presentation: your understanding of the scope, your team structure, your communication plan, your first 30 days
- Ask the COR directly: what does success look like at 90 days?
- Confirm the invoicing schedule and the preferred communication channel (email vs. PIEE vs. their ticketing system)

**Tools you need before performance starts:**
- PIEE account activated (for invoicing)
- System access requests submitted (most agencies require 30+ days for IT access)
- Wage determinations pulled and fringe rates calculated for any SCA-covered positions
- Subcontract agreements executed before the sub starts work
- E-Verify enrollment confirmed
`
    },

    /* ─── STAGE 6 DARK PANEL ────────────────────────────────── */
    {
      type: "dark",
      partLabel: "STAGE 6 · DELIVER",
      headline: "The contract you're performing is your best advertisement.",
      accentWord: "best",
      paragraphs: [
        "CPARS is the government's contractor report card. One 'Unsatisfactory' rating can follow you for three years and kill proposals you haven't even written yet. One 'Outstanding' rating — documented and well-written — is worth more than a marketing campaign.",
        "This stage covers how to perform in a way that builds your federal past performance record, survive DCAA basics, manage mods, and position yourself to win the re-compete. Cross-reference: FLK_11 series."
      ],
      footerLabel: "CAPTUREPILOT · FEDERAL CONTRACTING FIELD MANUAL",
      headerLabel: "STAGE 6 · DELIVER"
    },

    /* ─── STAGE 6 CONTENT ───────────────────────────────────── */
    {
      type: "content",
      headerLabel: "STAGE 6 · DELIVER",
      markdown: `<div class="eyebrow">STAGE 6 · DELIVER</div>

# CPARS Strategy from Day 1

CPARS (Contractor Performance Assessment Reporting System) is the federal government's performance rating system. COs and CORs file assessments at the end of each contract year and at contract closeout. Ratings are: Outstanding, Very Good, Satisfactory, Marginal, and Unsatisfactory.

These ratings are public within the federal community. Proposal evaluators see them. Program offices see them. They can make or break a re-compete.

## How CPARS works

- The assessing official (usually your COR) completes a draft CPARS rating
- You have 14 days to review and comment before it's finalized
- If you disagree, your comment becomes part of the permanent record — but the government's rating stands unless you successfully appeal to a higher level
- Ratings stay in the system for 3 years (services) or 6 years (construction/architect-engineering)

**The five CPARS factors:**
1. Technical (quality of the product or service)
2. Schedule (on-time delivery)
3. Cost control (under cost-type: did you manage costs responsibly?)
4. Management (responsiveness, personnel, problem-solving)
5. Small business subcontracting (if you have a subcontracting plan)

## CPARS strategy from day 1

Don't wait until the annual assessment to think about CPARS. Build the habits that produce good ratings from the first day of performance.

<table>
  <thead>
    <tr><th>Habit</th><th>Why it matters</th></tr>
  </thead>
  <tbody>
    <tr><td>Monthly written status reports, even when not required</td><td>Creates a paper trail of accomplishments. When the COR sits down to write the CPARS, they'll use your reports.</td></tr>
    <tr><td>Respond to every COR email within 4 hours during business hours</td><td>Responsiveness is a scored factor. Being hard to reach directly affects your Management rating.</td></tr>
    <tr><td>Flag schedule risks early — in writing</td><td>A late delivery with advance notice is a management problem. A late delivery with no notice is a performance problem. The CPARS score reflects the difference.</td></tr>
    <tr><td>Track every deliverable with a due date and an owner</td><td>Missed deliverables are the #1 reason for low technical scores. One missed CDR can drop an Outstanding to a Very Good.</td></tr>
    <tr><td>Document cost management decisions on cost-type contracts</td><td>If you come in under budget, document why. If you're trending over, report it with a recovery plan before the COR has to ask.</td></tr>
  </tbody>
</table>

# DCAA Basics

The Defense Contract Audit Agency (DCAA) audits contractors who work on cost-type contracts with DoD and some civilian agencies. If you're on a firm-fixed-price contract, DCAA isn't typically involved. If you're on a cost-plus or T&M, you should understand the basics.

**What DCAA audits:**
- Your accounting system (is it compliant with FAR Part 31 cost principles?)
- Your timekeeping system (can employees accurately record hours to the right contracts?)
- Your indirect rates (are they allocated correctly? Are unallowable costs excluded?)
- Specific vouchers or invoices on selected contracts

**What you need before your first cost-type contract:**
- A job-costing accounting system (QuickBooks can work at the small business level, but you'll outgrow it)
- A timekeeping system where employees code hours to contract CLINs
- A written accounting system description
- Documented policies for unallowable costs (entertainment, alcohol, lobbying, etc.)

**Unallowable costs to know (FAR Part 31.205):**
- Advertising and public relations (some — routine B2G marketing is allowable)
- Entertainment, fine dining, alcohol — never
- Executive compensation above SBA-established ceilings
- Interest on borrowings
- Contributions and donations
- Fines and penalties

## Contract modifications

Modifications ("mods") are changes to the contract after award. They're normal. They're also a source of disputes if you don't manage them carefully.

**Bilateral mods:** Both parties sign. Used for scope changes, price adjustments, key personnel changes.

**Unilateral mods:** Signed by CO only. Used for administrative changes, funding increments, exercise of options.

**Change order process:** If the government directs you to do something outside your contract scope, you have the right to seek an equitable adjustment (EA) in price or schedule. Do not absorb scope creep silently. Document every verbal direction with a written confirmation email: "Per our conversation on [date], you directed us to [specific action]. We're proceeding and will submit a Request for Equitable Adjustment within 30 days."

## The "win the second contract" play

The re-compete is where all your CPARS investment pays off. Here's the play:

1. **15 months before re-compete:** Request a meeting with the program office and CO to understand if requirements are changing. This is a standard market research discussion.
2. **12 months out:** Pull the contract spending data on USASpending.gov. Identify whether the scope is likely to grow or shrink.
3. **9 months out:** Identify whether competitors are pursuing the re-compete. LinkedIn, SAM.gov Sources Sought responses, industry days.
4. **6 months out:** Submit a formal capabilities briefing to the program office. Reference your performance record. Flag any value-adds you've delivered beyond the base requirement.
5. **At solicitation release:** You already know the requirement. Your compliance matrix is half-built. Your past performance references are current. You bid from strength.

<div class="callout">
  <div class="eyebrow" style="margin-bottom:2mm;">CROSS-REFERENCE</div>
  <strong>FLK_11_CPARS_Guide.pdf</strong> — CPARS factor-by-factor scoring breakdown and self-assessment. <strong>FLK_11_Contract_Closeout_Checklist.xlsx</strong> — what to verify at contract end before the government files the CPARS.
</div>
`
    },

    /* ─── APPENDICES DARK PANEL ─────────────────────────────── */
    {
      type: "dark",
      partLabel: "APPENDICES",
      headline: "The reference section you'll actually use.",
      accentWord: "actually",
      paragraphs: [
        "Acronym glossary so you stop Googling. The federal fiscal calendar so you know when agencies spend money. And eight mistakes we've seen new contractors make repeatedly — most of which are avoidable.",
        "Bookmark this section. It doesn't get less useful over time."
      ],
      footerLabel: "CAPTUREPILOT · FEDERAL CONTRACTING FIELD MANUAL",
      headerLabel: "APPENDICES"
    },

    /* ─── APPENDICES CONTENT ────────────────────────────────── */
    {
      type: "content",
      headerLabel: "APPENDICES",
      markdown: `<div class="eyebrow">APPENDIX A · ACRONYM GLOSSARY</div>

# The Federal Contracting Alphabet

<table>
  <thead>
    <tr><th>Acronym</th><th>Stands for</th><th>What it means in practice</th></tr>
  </thead>
  <tbody>
    <tr><td><strong>CAGE</strong></td><td>Commercial and Government Entity</td><td>5-character code assigned to you in SAM.gov. Required on every bid and every invoice.</td></tr>
    <tr><td><strong>CDRL</strong></td><td>Contract Data Requirements List</td><td>The list of deliverables in your contract. Each line is a DI-XXXX data item description. Miss one and you'll hear about it.</td></tr>
    <tr><td><strong>CO / KO</strong></td><td>Contracting Officer</td><td>The only person who can legally bind the government. If someone else tells you to do something, get it confirmed by the CO in writing.</td></tr>
    <tr><td><strong>COR</strong></td><td>Contracting Officer's Representative</td><td>Your day-to-day government point of contact. Technically can't modify the contract, but practically sets the tone for your CPARS rating.</td></tr>
    <tr><td><strong>CPARS</strong></td><td>Contractor Performance Assessment Reporting System</td><td>The federal report card. Ratings stay in the system 3–6 years.</td></tr>
    <tr><td><strong>CPFF</strong></td><td>Cost Plus Fixed Fee</td><td>You're reimbursed for allowable costs plus a fixed fee. Government takes the cost risk; you deliver the work.</td></tr>
    <tr><td><strong>DCAA</strong></td><td>Defense Contract Audit Agency</td><td>DoD's accounting watchdog. Audits your system and rates on cost-type contracts.</td></tr>
    <tr><td><strong>DFARS</strong></td><td>Defense Federal Acquisition Regulation Supplement</td><td>DoD's additions to the FAR. Applies to all DoD contracts.</td></tr>
    <tr><td><strong>FAR</strong></td><td>Federal Acquisition Regulation</td><td>The rulebook for all federal procurement. 53 parts. You don't read all of it, but you should know which parts apply to your work.</td></tr>
    <tr><td><strong>FFP</strong></td><td>Firm Fixed Price</td><td>You deliver the work for a fixed price. You take the cost risk. Most common contract type for commercial services.</td></tr>
    <tr><td><strong>FPDS</strong></td><td>Federal Procurement Data System</td><td>The authoritative database of every federal contract award. Accessible via USASpending.gov.</td></tr>
    <tr><td><strong>GWAC</strong></td><td>Government-Wide Acquisition Contract</td><td>A multi-agency contract vehicle. SEWP, Alliant 2, CIO-SP4. Getting on one gives you a faster path to task orders.</td></tr>
    <tr><td><strong>IDIQ</strong></td><td>Indefinite Delivery, Indefinite Quantity</td><td>A contract where the total quantity and schedule are variable. Task orders are issued under the IDIQ ceiling.</td></tr>
    <tr><td><strong>IGCE</strong></td><td>Independent Government Cost Estimate</td><td>The government's internal estimate of what the work should cost. Sometimes disclosed in the solicitation. Always worth trying to learn.</td></tr>
    <tr><td><strong>LCAT</strong></td><td>Labor Category</td><td>A defined role with specific education/experience requirements. Your cost proposal prices by LCAT × hours.</td></tr>
    <tr><td><strong>LPTA</strong></td><td>Lowest Price Technically Acceptable</td><td>Evaluation methodology where you win by being cheapest — as long as your technical proposal is "acceptable." Common on commoditized services.</td></tr>
    <tr><td><strong>NAICS</strong></td><td>North American Industry Classification System</td><td>The 6-digit code that classifies your business and determines your size standard.</td></tr>
    <tr><td><strong>ODC</strong></td><td>Other Direct Cost</td><td>Costs other than labor: travel, materials, subcontractors, equipment.</td></tr>
    <tr><td><strong>PIEE</strong></td><td>Procurement Integrated Enterprise Environment</td><td>DoD's invoicing and contract management portal. Where you submit invoices and receive payments on most DoD contracts.</td></tr>
    <tr><td><strong>PPQ</strong></td><td>Past Performance Questionnaire</td><td>The form you ask your former clients to fill out as part of a proposal's past performance volume.</td></tr>
    <tr><td><strong>PSC</strong></td><td>Product and Service Code</td><td>4-character code describing what was bought. Appears on every contract award record in FPDS.</td></tr>
    <tr><td><strong>SAM</strong></td><td>System for Award Management</td><td>The federal vendor registry. You must be active to receive payments.</td></tr>
    <tr><td><strong>SCA</strong></td><td>Service Contract Act</td><td>The labor law that sets wage and fringe requirements for service contract workers. Enforced by DoL Wage and Hour Division.</td></tr>
    <tr><td><strong>UEI</strong></td><td>Unique Entity Identifier</td><td>The 12-character code that replaced the DUNS number in April 2022. Your federal ID.</td></tr>
  </tbody>
</table>

<div class="eyebrow" style="margin-top:8mm;">APPENDIX B · FEDERAL FISCAL CALENDAR</div>

## When agencies spend money

The federal fiscal year runs October 1 – September 30. Budget cycles drive procurement timing in patterns you can predict:

<table>
  <thead>
    <tr><th>Period</th><th>What happens</th><th>Action for you</th></tr>
  </thead>
  <tbody>
    <tr><td><strong>Oct – Dec (Q1)</strong></td><td>New fiscal year. Agencies executing carryover and new appropriations. Contracting activity starts slow, accelerates mid-quarter.</td><td>Kickoffs for awards made in Q4. First full quarter of new contracts. Sources Sought for next FY work often released.</td></tr>
    <tr><td><strong>Jan – Mar (Q2)</strong></td><td>Peak proposal season. Many agencies release solicitations for mid-year awards. President's Budget request released in February.</td><td>Highest proposal volume. Staff up your proposal team. Track President's Budget for agency spending priorities.</td></tr>
    <tr><td><strong>Apr – Jun (Q3)</strong></td><td>Awards from Q2 RFPs. Agencies tracking spend against FY targets. Mid-year modifications on existing contracts.</td><td>Watch for sole-source awards and bridge contracts as agencies close expiring work. Good time for agency meetings and capability briefings.</td></tr>
    <tr><td><strong>Jul – Sep (Q4)</strong></td><td>Year-end spend surge. 30–40% of annual federal procurement happens in Q4. COs burning expiring funds before September 30.</td><td>Highest award activity. Submit proposals that were queued. Watch for quick-turn micro-purchases and simplified acquisitions. New Sources Sought for FY+1 start appearing in August.</td></tr>
  </tbody>
</table>

<div class="eyebrow" style="margin-top:8mm;">APPENDIX C · EIGHT MISTAKES NEW CONTRACTORS MAKE</div>

## The avoidable ones

These aren't hypotheticals. These are patterns we've seen repeatedly from firms working their first federal contracts.

**1. Letting SAM.gov lapse.** The registration expires every 365 days. No reminder email when it's close. One day your banking info stops routing. Set a calendar reminder 45 days out, every year.

**2. Claiming capabilities you don't have.** Adding NAICS codes to look bigger is tempting. It wastes your time on bids you can't win and damages your credibility when a CO checks your past performance. Claim what you can actually deliver.

**3. Skipping Sources Sought because "there's nothing to bid yet."** Sources Sought is where you build the relationship that makes you competitive when the solicitation drops. Respond to every one in your lane, even if the response is one page.

**4. Underbidding LPTA contracts to win volume.** A contract that's unprofitable doesn't get better with more of them. Know your cost floor before you price. If you can't win LPTA profitably, pursue best-value contracts where technical merit counts.

**5. Not reading Section M before writing Section L responses.** You'll spend hours writing beautifully structured content that doesn't address the evaluation factors. Read M first. Then write to it.

**6. Assuming the government can't terminate for convenience.** They can. For any reason. Without cause. Your protection is documentation of costs incurred and a clean termination settlement proposal. Keep daily cost records on every cost-type contract.

**7. Missing the CPARS comment window.** You have 14 days to comment on a draft CPARS rating. Most contractors don't know the rating was filed until it's final. Set up CPARS account alerts for every active contract.

**8. Not asking for a debrief when you lose.** You're entitled to a written debriefing after every competitive proposal loss. The feedback is usually specific and actionable. Firms that request debriefs consistently improve their win rate faster than firms that don't.

<div class="callout callout--emerald">
  <div style="font-family:'IBM Plex Mono', monospace; font-size:8.5pt; font-weight:600; letter-spacing:0.16em; color:#047857; text-transform:uppercase; margin-bottom:2mm;">START HERE ON CAPTUREPILOT</div>
  CapturePilot matches your NAICS profile against 37,000+ active federal opportunities, scores each one against your past performance and certifications, and surfaces the ones worth your time. Free 14-day trial. No card required. Set up takes 10 minutes. <strong>capturepilot.com/signup</strong>
</div>
`
    },

    /* ─── BACK COVER ────────────────────────────────────────── */
    {
      type: "back-cover",
      eyebrow: "YOUR NEXT MOVE",
      headline: "Stop reading. Start bidding.",
      accentWord: "bidding",
      body: "You've got the manual. Now use it. CapturePilot automates the find-and-score step so you spend your time on the work that actually wins — the calls, the proposals, the relationships. Free 14-day trial. No card.",
      ctaText: "Start free →",
      ctaUrl: "https://capturepilot.com/signup",
      footerLabel: "CAPTUREPILOT · FEDERAL CONTRACTING FIELD MANUAL"
    }

  ]
};

/* ─── Build + deploy ─────────────────────────────────────────────── */
const t0 = Date.now();
const tmpOut = resolve(__dirname, "FLK_Field_Manual.pdf");

await mkdir(resolve(__dirname, "../../../dashboard/public/starter-pack"), { recursive: true });

const result = await renderPdf({ config, outputPath: tmpOut });
console.log(`✓ Rendered ${result.pageCount} page(s) → ${result.path}  (${result.sizeKB} KB · ${Date.now() - t0} ms)`);

// Deploy to production path
await copyFile(tmpOut, DEPLOY);

// Verify
const s = await stat(DEPLOY);
console.log(`✓ Deployed → ${DEPLOY}  (${Math.round(s.size / 1024)} KB)`);
