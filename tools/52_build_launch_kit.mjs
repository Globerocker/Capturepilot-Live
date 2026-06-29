#!/usr/bin/env node
/*
 * 52_build_launch_kit.mjs — Federal Launch Kit restructure + content engine.
 *
 * ONE source of truth for the kit's shape:
 *   00 Master Guide  →  6 phases (each = folders, each folder = a one-page
 *   guide PDF + the template/asset)  →  ZZ Master Template List.
 *
 * What it does:
 *   1. For every deliverable, drafts a ONE-PAGE "how to use this" guide in the
 *      CapturePilot voice (Gemini 2.5 Flash) and renders it to a branded PDF
 *      through the existing tools/pdf-builder pipeline.
 *   2. Renders the Master Guide (the whole SAM-to-award path) and the Master
 *      Template List (every file, no explanations).
 *   3. Generates a few NEW fillable Word templates the kit was missing.
 *   4. Writes guide PDFs + new DOCX into protected/starter-pack/<folder>/ and
 *      emits tools/launch-kit-structure.generated.json — the bridge that the
 *      manifest (src/lib/startup-pack-assets.ts) is rebuilt from.
 *
 * Physical files are NOT moved — existing localPaths stay stable so the
 * token-gated file route keeps working. The pretty phase/folder structure is
 * delivered logically (manifest metadata + the ZIP route's internal paths).
 *
 *   node tools/52_build_launch_kit.mjs --guides-only   # just (re)draft guides
 *   node tools/52_build_launch_kit.mjs --docx-only      # just the new Word docs
 *   node tools/52_build_launch_kit.mjs                  # everything
 *
 * Reads GEMINI_API_KEY from dashboard/.env.local.
 */
import fs from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderPdf } from "./pdf-builder/render.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");
const PACK = resolve(REPO, "dashboard/protected/starter-pack");
const NODE_MOD = resolve(REPO, "dashboard/node_modules");
const KIT_BASE = "https://app.capturepilot.com/kit"; // deep-link resolver base

const GUIDES_ONLY = process.argv.includes("--guides-only");
const DOCX_ONLY = process.argv.includes("--docx-only");
const MASTER_ONLY = process.argv.includes("--master-only");

function env(key) {
  if (process.env[key]) return process.env[key];
  const txt = fs.readFileSync(resolve(REPO, "dashboard/.env.local"), "utf8");
  const m = txt.match(new RegExp(`^${key}\\s*=\\s*"?([^"\\n]+)"?`, "m"));
  if (!m) throw new Error(`${key} not found in dashboard/.env.local`);
  return m[1].trim();
}
const GEMINI = env("GEMINI_API_KEY");
const MODEL = "gemini-2.5-flash";

// ── CapturePilot voice (condensed HUMANIZER.md — see /humanizer) ────────────
const VOICE = `You write for federal contractors: middle-aged operators running a 5-50 person firm, often veteran-owned, time-poor, allergic to marketing fluff. Sound like a vet-owned firm's capture lead explaining something to a peer over coffee.
HARD RULES:
- No em-dashes or en-dashes. Use periods, commas, or rewrite. This is non-negotiable.
- Banned words: leverage, unlock, optimize, streamline, empower, supercharge, playbook (as filler), framework, ecosystem, robust, scalable, mission-critical, best-in-class, seamless, holistic, game-changer, transform, revolutionize, AI-powered, synergy.
- No "Not X. But Y." parallelism. No "Imagine if". No "Bottom line:". No fake stats or invented percentages.
- Use contractions. Mixed sentence length. Specific second person ("if you're SDVOSB-verified..."). Real agency names, real dollar thresholds, real timelines. Honest uncertainty ("usually six to twelve months", "in our experience"). Plain endings.
- Read it like you're explaining it to a friend who asked.`;

// ── STRUCTURE — the single source of truth ──────────────────────────────────
// Each phase has items. Each item becomes a folder containing a one-page guide
// PDF (we generate it) + its template/asset files (existing, by path under PACK).
//   guideId      stable id for the generated guide asset
//   guideFile    output path (relative to PACK) for the guide PDF
//   folder       pretty ZIP folder name
//   templates[]  { src(relative to PACK), title } existing files paired in the folder
//   brief        what the AI should explain (the substance the guide teaches)
//   kind         template | worksheet | playbook | bundle | call
const PHASES = [
  {
    key: "P1", n: 1, slug: "get-registered",
    title: "Get Registered & Certified",
    blurb: "You can't win a dollar of federal work until SAM.gov says you're active and your set-aside status is locked in. Start here.",
    items: [
      {
        id: "sam-registration", guideId: "guide-sam-registration",
        folder: "Phase 1 - Get Registered & Certified/1.1 SAM.gov Registration",
        title: "SAM.gov Registration",
        guideFile: "01_SAM_Registration_Kit/FLK_01_GUIDE_SAM_Registration.pdf",
        templates: [
          { src: "01_SAM_Registration_Kit/FLK_01_SAM_Registration_Walkthrough.pdf", title: "SAM.gov Registration Walkthrough" },
          { src: "01_SAM_Registration_Kit/FLK_01_SAM_PreReg_Checklist.xlsx", title: "Pre-Registration Checklist" },
          { src: "01_SAM_Registration_Kit/FLK_01_NAICS_Code_Picker.pdf", title: "NAICS Code Picker" },
          { src: "01_SAM_Registration_Kit/FLK_01_SAM_Renewal_Kit.pdf", title: "Annual Renewal Kit" },
        ],
        kind: "bundle",
        brief: "Registering your entity in SAM.gov: get the UEI, pick primary + secondary NAICS codes (they decide ~80% of your matches), set your size status and any set-aside reps, and put the annual renewal on the calendar so registration never lapses (the #1 cause of a bid getting tossed). Point them at the walkthrough first, the pre-reg checklist to gather documents before they start, the NAICS picker to choose codes, the renewal kit to stay active.",
      },
      {
        id: "certifications", guideId: "guide-certifications",
        folder: "Phase 1 - Get Registered & Certified/1.2 Certification Eligibility",
        title: "Certification Eligibility",
        guideFile: "05_Certification_Eligibility_Worksheets/FLK_05_GUIDE_Certifications.pdf",
        templates: [
          { src: "05_Certification_Eligibility_Worksheets/FLK_05_8a_Certification_Self_Assessment.xlsx", title: "8(a) Self-Assessment" },
          { src: "05_Certification_Eligibility_Worksheets/FLK_05_HUBZone_Eligibility_Worksheet.xlsx", title: "HUBZone Worksheet" },
          { src: "05_Certification_Eligibility_Worksheets/FLK_05_WOSB_EDWOSB_Self_Cert.xlsx", title: "WOSB / EDWOSB Self-Cert" },
          { src: "05_Certification_Eligibility_Worksheets/FLK_05_SDB_Self_Assessment.xlsx", title: "Small Disadvantaged Business Self-Assessment" },
          { src: "05_Certification_Eligibility_Worksheets/FLK_05_VOSB_SDVOSB_CVE_Guide.pdf", title: "VOSB / SDVOSB Verification Guide" },
        ],
        kind: "worksheet",
        brief: "Which set-aside certifications you might qualify for and how to self-assess fast: 8(a), HUBZone, WOSB/EDWOSB, Small Disadvantaged Business, and VOSB/SDVOSB (now verified through the SBA, not the VA). Each worksheet is a 10-minute self-check on eligibility plus the documents to gather. Be honest that certification is worth real money in set-aside competition but you must actually qualify, and that SDVOSB verification is the authoritative source buyers check.",
      },
    ],
  },
  {
    key: "P2", n: 2, slug: "federal-identity",
    title: "Build Your Federal Identity",
    blurb: "Before you chase a single opportunity, you need the two documents every contracting officer asks for: a capability statement and past performance.",
    items: [
      {
        id: "capability-statement", guideId: "guide-capability-statement",
        folder: "Phase 2 - Build Your Federal Identity/2.1 Capability Statement",
        title: "Capability Statement",
        guideFile: "02_Capability_Statement_Kit/FLK_02_GUIDE_Capability_Statement.pdf",
        templates: [
          { src: "02_Capability_Statement_Kit/FLK_02_Capability_Statement_Template.docx", title: "Editable Capability Statement (Word)" },
          { src: "02_Capability_Statement_Kit/FLK_02_Capability_Statement_Canva_Kit.pdf", title: "Branded Design Variants" },
          { src: "02_Capability_Statement_Kit/FLK_02_How_to_Write_Capability_Statement.pdf", title: "How to Write One (full walkthrough)" },
        ],
        kind: "template",
        brief: "The one-page capability statement is the single most-used document in federal contracting. What goes in each block: core competencies (in the buyer's words, not yours), differentiators, past performance, and company data (UEI, CAGE, NAICS, certifications, contact). How to tailor it per agency. The Word template is the fast path; the Canva variants are for when they want it branded; the walkthrough explains each section.",
      },
      {
        id: "past-performance", guideId: "guide-past-performance",
        folder: "Phase 2 - Build Your Federal Identity/2.2 Past Performance",
        title: "Past Performance",
        guideFile: "06_Past_Performance_Reference_Templates/FLK_06_GUIDE_Past_Performance.pdf",
        templates: [
          { src: "06_Past_Performance_Reference_Templates/FLK_06_Past_Performance_Reference_Template.docx", title: "Past-Performance Reference (Word)" },
          { src: "06_Past_Performance_Reference_Templates/FLK_06_Past_Performance_Reference_Request_Letter.docx", title: "Reference Request Letter (Word)" },
          { src: "06_Past_Performance_Reference_Templates/FLK_06_Commercial_to_Federal_Past_Performance.pdf", title: "Turning Commercial Work into Federal Past Performance" },
          { src: "06_Past_Performance_Reference_Templates/FLK_06_Sample_Past_Performance_IT_Services.docx", title: "Sample: IT Services" },
          { src: "06_Past_Performance_Reference_Templates/FLK_06_Sample_Past_Performance_Janitorial.docx", title: "Sample: Janitorial" },
        ],
        kind: "template",
        brief: "Past performance is how a CO decides you can actually do the work. The 1-page reference format they expect (contract, role, scope, dollar value, period, outcome, reference contact). How to position commercial or subcontract work when you have no prime federal history yet, without overselling. Use the request letter to get a clean reference from a past client. Two filled samples show the bar.",
      },
    ],
  },
  {
    key: "P3", n: 3, slug: "find-qualify",
    title: "Find & Qualify the Right Work",
    blurb: "Most first-timers waste months bidding the wrong things. This phase is about finding real opportunities early and killing the bad ones fast.",
    items: [
      {
        id: "market-research", guideId: "guide-market-research",
        folder: "Phase 3 - Find & Qualify the Right Work/3.1 Market Research",
        title: "Market Research",
        guideFile: "03_Solicitation_Playbooks/FLK_03_GUIDE_Market_Research.pdf",
        templates: [{ src: "03_Solicitation_Playbooks/FLK_03_Market_Research_Playbook.pdf", title: "Federal Market Research Playbook" }],
        kind: "playbook",
        brief: "How to research an agency before you bid: find who buys what you sell, which contract vehicle they use, who the incumbent is, and who the real decision-makers are. Where to look (SAM.gov, USAspending, FPDS, agency forecasts). The point is to walk in already knowing the buyer.",
      },
      {
        id: "sources-sought", guideId: "guide-sources-sought",
        folder: "Phase 3 - Find & Qualify the Right Work/3.2 Sources Sought & RFI",
        title: "Sources Sought & RFI",
        guideFile: "03_Solicitation_Playbooks/FLK_03_GUIDE_Sources_Sought.pdf",
        templates: [
          { src: "03_Solicitation_Playbooks/FLK_03_Sources_Sought_RFI_Playbook.pdf", title: "Sources Sought / RFI Playbook" },
          { src: "NEW:sources-sought-response", title: "Sources Sought / RFI Response Template (Word)" },
        ],
        kind: "playbook",
        brief: "Sources Sought and RFIs are the highest-leverage notices in federal: they show up 6 to 18 months before the real solicitation, and a good response can shape the requirement and the set-aside in your favor. What to send, how to influence the NAICS and set-aside, and why responding even when you can't win yet still pays off. The response template gives them a fill-in-the-blanks starting point.",
      },
      {
        id: "pre-solicitation", guideId: "guide-pre-solicitation",
        folder: "Phase 3 - Find & Qualify the Right Work/3.3 Pre-Solicitation",
        title: "Pre-Solicitation Window",
        guideFile: "03_Solicitation_Playbooks/FLK_03_GUIDE_Pre_Solicitation.pdf",
        templates: [{ src: "03_Solicitation_Playbooks/FLK_03_Pre_Solicitation_Playbook.pdf", title: "Pre-Solicitation Playbook" }],
        kind: "playbook",
        brief: "The 30 to 60 day window between a pre-solicitation notice and the live RFP is where bids are won. What to do in it: attend the pre-bid conference, submit smart questions (the Q&A is public and shapes the final RFP), and finish your capture moves before the clock starts.",
      },
      {
        id: "bid-no-bid", guideId: "guide-bid-no-bid",
        folder: "Phase 3 - Find & Qualify the Right Work/3.4 Bid or No-Bid Decision",
        title: "Bid / No-Bid Decision",
        guideFile: "04_Bid_No_Bid_Decision_Toolkit/FLK_04_GUIDE_Bid_No_Bid.pdf",
        templates: [
          { src: "04_Bid_No_Bid_Decision_Toolkit/FLK_04_Bid_No_Bid_Decision_Matrix.xlsx", title: "Bid / No-Bid Decision Matrix" },
          { src: "04_Bid_No_Bid_Decision_Toolkit/FLK_04_PWin_Calculator.xlsx", title: "PWin Calculator" },
          { src: "04_Bid_No_Bid_Decision_Toolkit/FLK_04_Sample_Filled_PWin_Worked_Example.xlsx", title: "PWin Worked Example" },
          { src: "04_Bid_No_Bid_Decision_Toolkit/FLK_04_Competitive_Bid_Analysis.xlsx", title: "Competitive Bid Analysis" },
          { src: "04_Bid_No_Bid_Decision_Toolkit/FLK_04_Bid_Decision_Memo_Template.docx", title: "Bid Decision Memo (Word)" },
        ],
        kind: "worksheet",
        brief: "Proposals are expensive. The fastest way to lose money is to bid everything. Score an opportunity in 5 minutes with the decision matrix, then run the 10-factor PWin calculator (customer fit, past performance, price-to-win, capture maturity) for anything that passes. The worked example shows a realistic score. Map the incumbent and likely bidders before you commit, and write the one-page memo so the go/no-go is on record.",
      },
    ],
  },
  {
    key: "P4", n: 4, slug: "reach-out",
    title: "Reach Out & Position",
    blurb: "Federal buyers award to firms they already know. This phase is about getting on the contracting officer's radar before the RFP drops.",
    items: [
      {
        id: "co-outreach", guideId: "guide-co-outreach",
        folder: "Phase 4 - Reach Out & Position/4.1 Contracting Officer Outreach",
        title: "Contracting Officer Outreach",
        guideFile: "07_Contracting_Officer_Outreach_Library/FLK_07_GUIDE_CO_Outreach.pdf",
        templates: [
          { src: "07_Contracting_Officer_Outreach_Library/FLK_07_CO_Email_Templates.pdf", title: "Contracting Officer Email Templates" },
          { src: "07_Contracting_Officer_Outreach_Library/FLK_07_COR_PM_Conversation_Scripts.pdf", title: "COR / PM Conversation Scripts" },
          { src: "07_Contracting_Officer_Outreach_Library/FLK_07_LinkedIn_Outreach_Scripts.pdf", title: "LinkedIn Outreach Scripts" },
          { src: "07_Contracting_Officer_Outreach_Library/FLK_07_LinkedIn_Profile_Audit.pdf", title: "LinkedIn Profile Audit" },
          { src: "07_Contracting_Officer_Outreach_Library/FLK_07_Industry_Day_Playbook.pdf", title: "Industry Day Playbook" },
          { src: "07_Contracting_Officer_Outreach_Library/FLK_07_Federal_Events_Calendar_FY2026.pdf", title: "Federal Events Calendar FY2026" },
          { src: "NEW:co-outreach-pack", title: "Editable Email & Letter Pack (Word)" },
        ],
        kind: "bundle",
        brief: "Cold outreach to a contracting officer works when it's short, specific, and not salesy. When to email vs. message on LinkedIn vs. meet at an industry day. Who actually influences the award (often the COR or program manager, not just the KO). Fix the LinkedIn profile first, then work the calendar of industry days. The editable pack lets them adapt every script to their own firm.",
      },
    ],
  },
  {
    key: "P5", n: 5, slug: "price-bid-win",
    title: "Price, Bid & Win",
    blurb: "The proposal itself. Price it so you win and still make money, respond to exactly what Section L and M ask for, and review it like the evaluators will.",
    items: [
      {
        id: "price-to-win", guideId: "guide-price-to-win",
        folder: "Phase 5 - Price, Bid & Win/5.1 Price-to-Win",
        title: "Price-to-Win",
        guideFile: "08_Price_to_Win_Toolkit/FLK_08_GUIDE_Price_to_Win.pdf",
        templates: [
          { src: "08_Price_to_Win_Toolkit/FLK_08_Price_to_Win_Worksheet.xlsx", title: "Price-to-Win Worksheet" },
          { src: "08_Price_to_Win_Toolkit/FLK_08_Indirect_Rate_Calculator.xlsx", title: "Indirect Rate Calculator" },
          { src: "08_Price_to_Win_Toolkit/FLK_08_Indirect_Rate_Audit_Checklist.pdf", title: "Indirect Rate Audit Checklist" },
          { src: "08_Price_to_Win_Toolkit/FLK_08_Federal_Labor_Categories_Matrix.xlsx", title: "Federal Labor Categories Matrix" },
          { src: "08_Price_to_Win_Toolkit/FLK_08_Federal_Labor_Rate_Benchmarks_FY2026.pdf", title: "Federal Labor Rate Benchmarks FY2026" },
          { src: "08_Price_to_Win_Toolkit/FLK_08_Sample_Cost_Proposal.xlsx", title: "Sample Cost Proposal" },
        ],
        kind: "worksheet",
        brief: "How to build a federal price that wins without leaving 30% on the table or going so low you lose money. Wrap rates, G&A, fringe, and overhead in the indirect rate calculator; competitive price banding in the worksheet; benchmark labor rates against the FY2026 ranges. The sample cost proposal shows the format. Defensible beats cheap.",
      },
      {
        id: "rfp-response", guideId: "guide-rfp-response",
        folder: "Phase 5 - Price, Bid & Win/5.2 RFP / Solicitation Response",
        title: "RFP / Solicitation Response",
        guideFile: "03_Solicitation_Playbooks/FLK_03_GUIDE_RFP_Response.pdf",
        templates: [
          { src: "03_Solicitation_Playbooks/FLK_03_RFP_Response_Playbook.pdf", title: "RFP Response Playbook" },
          { src: "03_Solicitation_Playbooks/FLK_03_How_to_Read_Section_L_M.pdf", title: "How to Read Section L & M" },
          { src: "09_Internal_Best_Practice_Library/FLK_09_Compliance_Matrix_Template.xlsx", title: "Compliance Matrix" },
          { src: "03_Solicitation_Playbooks/FLK_03_Win_Themes_Workbook.xlsx", title: "Win Themes Workbook" },
          { src: "09_Internal_Best_Practice_Library/FLK_09_Color_Team_Review_Templates.pdf", title: "Color-Team Review Templates" },
          { src: "NEW:proposal-outline", title: "Proposal Outline & Compliance Shell (Word)" },
        ],
        kind: "playbook",
        brief: "Reading Section L (instructions) and Section M (evaluation) is the whole game: L tells you what to write, M tells you how they score it. Build a compliance matrix so you answer every requirement in order, write to the win themes, then run Pink/Red/Gold color-team reviews before you submit. The proposal outline gives them a compliant shell to start from.",
      },
      {
        id: "rfq", guideId: "guide-rfq",
        folder: "Phase 5 - Price, Bid & Win/5.3 RFQ (Quotes)",
        title: "RFQ Quoting",
        guideFile: "03_Solicitation_Playbooks/FLK_03_GUIDE_RFQ.pdf",
        templates: [{ src: "03_Solicitation_Playbooks/FLK_03_RFQ_Playbook.pdf", title: "RFQ Playbook" }],
        kind: "playbook",
        brief: "RFQs are the fast-turn quotes on micro-purchases and Simplified Acquisition buys (usually under $250K). These are the easiest first wins for a small firm. How to quote quickly, where price matters most, and why responsiveness and a clean quote beat a polished proposal here.",
      },
      {
        id: "idiq", guideId: "guide-idiq",
        folder: "Phase 5 - Price, Bid & Win/5.4 IDIQ & Task Orders",
        title: "IDIQ / GWAC Task Orders",
        guideFile: "03_Solicitation_Playbooks/FLK_03_GUIDE_IDIQ.pdf",
        templates: [{ src: "03_Solicitation_Playbooks/FLK_03_IDIQ_GWAC_Task_Order_Playbook.pdf", title: "IDIQ / GWAC Task-Order Playbook" }],
        kind: "playbook",
        brief: "An IDIQ or GWAC seat is a hunting license, not a contract. You win the vehicle, then compete for task orders against the other holders. How task-order competition works post-award, and why getting on the vehicle is only half the work.",
      },
      {
        id: "teaming", guideId: "guide-teaming",
        folder: "Phase 5 - Price, Bid & Win/5.5 Teaming & Subcontracting",
        title: "Teaming & Subcontracting",
        guideFile: "09_Internal_Best_Practice_Library/FLK_09_GUIDE_Teaming.pdf",
        templates: [
          { src: "09_Internal_Best_Practice_Library/FLK_09_Teaming_Agreement_Template.docx", title: "Teaming Agreement (Word)" },
          { src: "09_Internal_Best_Practice_Library/FLK_09_NDA_Template.docx", title: "Mutual NDA (Word)" },
        ],
        kind: "template",
        brief: "Teaming lets you bid work bigger than you can win alone, or get past-performance credit as a sub. When to prime vs. sub, what a fair teaming agreement looks like (workshare, exclusivity, what happens if you lose), and signing an NDA before you trade sensitive numbers. These are the actual agreements we use with our own subs.",
      },
      {
        id: "capture-maturity", guideId: "guide-capture-maturity",
        folder: "Phase 5 - Price, Bid & Win/5.6 Capture Maturity Self-Audit",
        title: "Capture Maturity Self-Audit",
        guideFile: "09_Internal_Best_Practice_Library/FLK_09_GUIDE_Capture_Maturity.pdf",
        templates: [{ src: "09_Internal_Best_Practice_Library/FLK_09_Capture_Maturity_Self_Audit.xlsx", title: "Capture Maturity Self-Audit" }],
        kind: "worksheet",
        brief: "Score your own firm on the 7 capability dimensions that predict win rate (customer relationships, competitive intel, technical fit, past performance, pricing discipline, proposal process, teaming). It tells you where you're losing before the evaluators do. This is our internal scorecard.",
      },
      {
        id: "far-decoder", guideId: "guide-far-decoder",
        folder: "Phase 5 - Price, Bid & Win/5.7 FAR Clause Decoder",
        title: "FAR Clause Decoder",
        guideFile: "09_Internal_Best_Practice_Library/FLK_09_GUIDE_FAR_Decoder.pdf",
        templates: [{ src: "09_Internal_Best_Practice_Library/FLK_09_FAR_Clause_Quick_Reference_Decoder.pdf", title: "FAR Clause Quick-Reference Decoder" }],
        kind: "playbook",
        brief: "Plain-English translations of the FAR clauses you'll actually see in a contract, sorted by what they cost you if you ignore them. Use it to skim a solicitation's clause list and flag the ones that change how you price or perform (small-business reps, labor standards, payment, termination).",
      },
    ],
  },
  {
    key: "P6", n: 6, slug: "after-win",
    title: "After You Win",
    blurb: "Winning is the start. Staying compliant and getting a strong CPARS rating is what gets you the next contract.",
    items: [
      {
        id: "post-award", guideId: "guide-post-award",
        folder: "Phase 6 - After You Win/6.1 Post-Award Compliance",
        title: "Post-Award Compliance",
        guideFile: "11_Post_Award_Compliance/FLK_11_GUIDE_Post_Award.pdf",
        templates: [
          { src: "11_Post_Award_Compliance/FLK_11_CPARS_Past_Performance_Guide.pdf", title: "CPARS & Past-Performance Guide" },
          { src: "11_Post_Award_Compliance/FLK_11_DCAA_Accounting_Basics.pdf", title: "DCAA Accounting Basics" },
          { src: "11_Post_Award_Compliance/FLK_11_Quality_Assurance_Plan_Template.docx", title: "Quality Assurance Plan (Word)" },
          { src: "11_Post_Award_Compliance/FLK_11_Subcontracting_Plan_Template.docx", title: "Subcontracting Plan (Word)" },
          { src: "11_Post_Award_Compliance/FLK_11_Contract_Mod_Request_Template.docx", title: "Contract Mod Request (Word)" },
        ],
        kind: "bundle",
        brief: "The first contract is also your audition for the next. Your CPARS rating becomes the past performance every future buyer reads, so deliver and document it. Keep your accounting DCAA-clean if you're doing cost-reimbursable work, run a quality assurance plan, file your subcontracting plan if required, and handle contract mods in writing.",
      },
    ],
  },
];

// Bonus item (rendered after the phases, before the master list)
const BONUS = {
  id: "founder-call", guideId: "guide-founder-call",
  folder: "Bonus - Founder Onboarding Call",
  title: "Founder Onboarding Call",
  guideFile: "10_Bonus_Founder_Onboarding_Call/FLK_10_GUIDE_Founder_Call.pdf",
  templates: [{ src: "10_Bonus_Founder_Onboarding_Call/FLK_10_Founder_Onboarding_Call.pdf", title: "Onboarding Call Prep Guide" }],
  kind: "call",
  brief: "A free 30-minute call with our capture lead, included with the kit. What to bring (a target opportunity, your capability statement), what we'll cover (we'll walk one real Sources Sought or RFP together), and how to book it. Tell them to do it after they've skimmed the Master Guide so the call is hands-on, not 101.",
};

// ── NEW fillable Word templates (generated with `docx`) ─────────────────────
const NEW_DOCX = {
  "sources-sought-response": {
    out: "03_Solicitation_Playbooks/FLK_03_Sources_Sought_RFI_Response_Template.docx",
    title: "Sources Sought / RFI Response Template",
    heading: "Sources Sought / RFI Response",
    intro: "Fill the bracketed fields. Keep it to two pages. The goal is to show capability and nudge the NAICS and set-aside in your favor, not to write a proposal.",
    sections: [
      ["1. Company Information", ["Company name: [ ]", "UEI / CAGE: [ ]", "Primary NAICS: [ ]    Size status under this NAICS: [small / other-than-small]", "Socioeconomic status: [8(a) / HUBZone / WOSB / SDVOSB / SDB / none]", "Point of contact, title, email, phone: [ ]"]],
      ["2. Statement of Capability", ["[Two or three short paragraphs: what you do, the specific capability this requirement needs, and proof you can perform it at this scale. Use the buyer's words from the notice.]"]],
      ["3. Relevant Experience", ["[Project 1: customer, scope, dollar value, period, outcome]", "[Project 2: customer, scope, dollar value, period, outcome]", "[Project 3: customer, scope, dollar value, period, outcome]"]],
      ["4. Recommended Acquisition Approach", ["Recommended NAICS code: [ ] because [reason]", "Recommended set-aside: [8(a) / HUBZone / WOSB / SDVOSB / total small business] because [reason]", "Any requirement language that would unfairly limit competition: [ ]"]],
      ["5. Capacity & Interest", ["We are [very / moderately] interested and able to perform as [prime / subcontractor].", "Bonding / clearance / certifications held: [ ]"]],
    ],
  },
  "co-outreach-pack": {
    out: "07_Contracting_Officer_Outreach_Library/FLK_07_Editable_Email_and_Letter_Pack.docx",
    title: "Editable Email & Letter Pack",
    heading: "Contracting Officer Outreach — Editable Pack",
    intro: "Swap the bracketed fields for your details. Keep every message short. Send from a real name, not info@.",
    sections: [
      ["Email 1 — Cold introduction (after a Sources Sought)", ["Subject: [Your firm] — [capability] for [program/office]", "Hi [Name],", "We're a [set-aside, e.g. SDVOSB] firm that does [specific capability]. I saw the Sources Sought for [requirement] and wanted to put us on your radar before the solicitation.", "We've done [one concrete, relevant project in one line]. Happy to send a capability statement or answer questions.", "Thanks for your time,", "[Name, title, firm, phone]"]],
      ["Email 2 — Pre-solicitation question", ["Subject: Question on [solicitation number]", "Hi [Name],", "One question on [solicitation number]: [specific, answerable question]. Wanted to ask before the Q&A cutoff on [date].", "Thanks,", "[Name]"]],
      ["Email 3 — Post-award debrief request", ["Subject: Debrief request — [solicitation number]", "Hi [Name],", "Thanks for the award notice on [solicitation number]. We'd like to request a debrief on our proposal at your convenience.", "Appreciate it,", "[Name]"]],
      ["LinkedIn connection note", ["Hi [Name], we're a [set-aside] firm working in [capability area] with [agency/office]. Following your office's work and would value staying connected."]],
    ],
  },
  "proposal-outline": {
    out: "03_Solicitation_Playbooks/FLK_03_Proposal_Outline_Compliance_Shell.docx",
    title: "Proposal Outline & Compliance Shell",
    heading: "Proposal Outline & Compliance Shell",
    intro: "Build your outline straight off Section L. Every L instruction becomes a heading here, in the order L lists them. Map each to the Section M factor it's scored against, then write to fill it.",
    sections: [
      ["Volume I — Technical / Management", ["[L.x] Technical Approach  →  scored under [M factor]", "[L.x] Management Approach  →  scored under [M factor]", "[L.x] Staffing & Key Personnel  →  scored under [M factor]", "[L.x] Transition / Phase-In  →  scored under [M factor]"]],
      ["Volume II — Past Performance", ["[L.x] Relevant contracts (most recent / most relevant first)", "[L.x] Reference contact information", "[L.x] Quality and any problems, with corrective action"]],
      ["Volume III — Price / Cost", ["[L.x] Pricing format exactly as L requires", "[L.x] Basis of estimate / assumptions", "[L.x] Any cost narrative required"]],
      ["Compliance check (do this before submission)", ["Every L requirement has a heading above: [yes / no]", "Page limits, font, and margins meet L: [yes / no]", "Format and file naming match L exactly: [yes / no]", "Submitted to the right place before the deadline: [yes / no]"]],
    ],
  },
};

// Recover the guide markdown from a Gemini response even when the JSON is
// slightly malformed (unescaped newlines/quotes inside the markdown field).
function parseGuideMarkdown(text) {
  let t = String(text).trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  try { const o = JSON.parse(t); if (o && o.markdown) return o.markdown; } catch { /* fall through */ }
  // Grab everything between "markdown": " ... " (greedy to the last quote before }) and unescape.
  const m = t.match(/"markdown"\s*:\s*"([\s\S]*)"\s*}?\s*$/);
  if (m) {
    return m[1]
      .replace(/\\n/g, "\n").replace(/\\t/g, "\t")
      .replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return null;
}

// ── Gemini one-page guide drafter ───────────────────────────────────────────
async function draftGuide(item, phase, nextLabel) {
  const sys = `${VOICE}

You are writing ONE PAGE: a "how to use this" guide that sits in front of a template inside a paid federal-contracting starter kit (the "Federal Launch Kit"). The reader just opened the folder. Your job is to make them understand what this thing is, when to use it, and how to use it, in under a page, then send them to download it.

Return ONLY JSON: { "markdown": "..." }.

The markdown MUST be tight enough to fit a single page (about 230 to 300 words total) and follow this exact shape:
# <short title>
<one-sentence plain framing of what this is and why it matters>

**What it is.** <2-3 sentences>

**When to use it.** <2-3 sentences, with a real timing/threshold if relevant>

**How to use it.**
- <step 1>
- <step 2>
- <step 3>
- <step 4 optional>

**Watch out for.** <one specific, concrete mistake first-timers make>

> Open it in your kit: ${KIT_BASE}/${item.id}
${nextLabel ? `> Next step: ${nextLabel}` : ""}

Rules specific to this page:
- Do not invent statistics. Ranges and "usually" are fine.
- If the folder holds several files, name them in "How to use it" so the reader knows which to open first.
- Keep the closing two blockquote lines EXACTLY as given (they are clickable links in the kit). Do not reword them.
- No em-dashes anywhere.`;

  const fileList = item.templates.map((t) => `- ${t.title}`).join("\n");
  const user = `Phase: ${phase.title}
Deliverable: ${item.title}
Files in this folder:
${fileList}

What the guide should teach (the substance):
${item.brief}`;

  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: sys }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { temperature: attempt === 0 ? 0.4 : 0.2, responseMimeType: "application/json" },
        }),
      }
    );
    if (!res.ok) { lastErr = new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 240)}`); continue; }
    const j = await res.json();
    const text = j?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) { lastErr = new Error("gemini: empty"); continue; }
    const md = parseGuideMarkdown(text);
    if (md) return md;
    lastErr = new Error("guide: could not parse markdown from response");
  }
  throw lastErr;
}

async function renderGuidePdf(item, markdown) {
  const out = resolve(PACK, item.guideFile);
  await mkdir(dirname(out), { recursive: true });
  const config = {
    id: item.guideId,
    title: item.title,
    footerLabel: "FEDERAL LAUNCH KIT · CAPTUREPILOT",
    headerLabel: item.title.toUpperCase(),
    parts: [{ type: "content", markdown }],
  };
  const r = await renderPdf({ config, outputPath: out });
  return r;
}

// ── Master Guide + Master Template List ─────────────────────────────────────
async function draftMasterGuide() {
  const phaseList = PHASES.map((p) => `Phase ${p.n} — ${p.title}: ${p.blurb}`).join("\n");
  const sys = `${VOICE}

You are writing the opening "Start Here" master guide for a paid federal-contracting starter kit (the "Federal Launch Kit"). This is the first thing the buyer reads. It explains the whole path from registering in SAM.gov to winning a first contract, and points them through the six phases of the kit. Make it feel like a real capture lead handing them a map.

Return ONLY JSON: { "intro_markdown": "...", "phase_notes": ["...","...","...","...","...","..."] }.

intro_markdown: 150-220 words. Open with what this kit is and the honest truth that federal contracting is slow but learnable. Tell them the three ways to use the kit: read this guide first, then go phase by phase (each template has a one-page guide in front of it), or skip to the Master Template List at the end and grab what they need. No em-dashes. No hype.

phase_notes: exactly 6 entries, one per phase, each 2-3 sentences, in order, telling them what they'll get done in that phase and roughly how long it tends to take. Plain and specific.`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sys }] },
        contents: [{ role: "user", parts: [{ text: `The six phases:\n${phaseList}` }] }],
        generationConfig: { temperature: 0.45, responseMimeType: "application/json" },
      }),
    }
  );
  if (!res.ok) throw new Error(`gemini master ${res.status}: ${(await res.text()).slice(0, 240)}`);
  const j = await res.json();
  const obj = JSON.parse(j.candidates[0].content.parts[0].text);

  let body = `# Start Here\n\n${obj.intro_markdown}\n\n`;
  body += `## The path, in six phases\n\n`;
  PHASES.forEach((p, i) => {
    body += `### Phase ${p.n} · ${p.title}\n\n${obj.phase_notes[i] || p.blurb}\n\n`;
    p.items.forEach((it) => {
      body += `- **${it.title}.** Open it in your kit: ${KIT_BASE}/${it.id}\n`;
    });
    body += `\n`;
  });
  body += `### Bonus · Founder Onboarding Call\n\nA free 30-minute call with our capture lead, included with the kit. Book it once you've picked a target: ${KIT_BASE}/${BONUS.id}\n\n`;
  body += `This kit comes out of three years of running federal capture at Americurial. The templates are the ones we actually use with clients. Work the phases in order the first time. After that, treat it as a reference and jump to whatever you need.\n`;
  return body;
}

async function buildMasterGuide() {
  const md = await draftMasterGuide();
  const out = resolve(PACK, "FLK_00_START_HERE_Master_Guide.pdf");
  const config = {
    id: "flk-master-guide",
    title: "Federal Launch Kit — Start Here",
    footerLabel: "FEDERAL LAUNCH KIT · CAPTUREPILOT",
    headerLabel: "START HERE",
    parts: [
      {
        type: "cover",
        eyebrow: "FEDERAL LAUNCH KIT",
        titleLines: ["Win Your First", "Federal", "Contract."],
        accentWord: "Federal",
        toolStrip: [
          { num: 1, title: "Get Registered", desc: "SAM.gov + certifications" },
          { num: 2, title: "Build Identity", desc: "Cap statement + past perf" },
          { num: 3, title: "Find & Bid", desc: "Sources sought to RFP" },
          { num: 4, title: "Win & Keep", desc: "Price, submit, stay compliant" },
        ],
      },
      { type: "content", markdown: md },
    ],
  };
  const r = await renderPdf({ config, outputPath: out });
  return { out, r };
}

function buildMasterListMarkdown(allItems) {
  let md = `# Master Template List\n\nEvery template and tool in the kit, in order, with nothing else. If you already know federal contracting and just want the files, this is your index. Each line links straight to the document in your kit.\n\n`;
  PHASES.forEach((p) => {
    md += `## Phase ${p.n} · ${p.title}\n\n`;
    p.items.forEach((it) => {
      md += `**${it.title}.** Open: ${KIT_BASE}/${it.id}\n\n`;
      it.templates.forEach((t) => { md += `- ${t.title}\n`; });
      md += `\n`;
    });
  });
  md += `## Bonus\n\n**${BONUS.title}.** Book: ${KIT_BASE}/${BONUS.id}\n\n`;
  return md;
}

async function buildMasterList() {
  const md = buildMasterListMarkdown();
  const out = resolve(PACK, "FLK_ZZ_Master_Template_List.pdf");
  const config = {
    id: "flk-master-list",
    title: "Master Template List",
    footerLabel: "FEDERAL LAUNCH KIT · CAPTUREPILOT",
    headerLabel: "TEMPLATE LIST",
    parts: [{ type: "content", markdown: md }],
  };
  const r = await renderPdf({ config, outputPath: out });
  return { out, r };
}

// ── DOCX generation ─────────────────────────────────────────────────────────
async function loadDocx() {
  // docx lives in dashboard/node_modules
  const mod = await import(resolve(NODE_MOD, "docx/dist/index.mjs"));
  return mod;
}

async function buildDocx(key) {
  const spec = NEW_DOCX[key];
  if (!spec) throw new Error(`no NEW_DOCX spec for ${key}`);
  const D = await loadDocx();
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = D;

  const children = [];
  children.push(new Paragraph({ text: spec.heading, heading: HeadingLevel.HEADING_1 }));
  children.push(new Paragraph({ children: [new TextRun({ text: spec.intro, italics: true, color: "555555" })], spacing: { after: 240 } }));
  for (const [secTitle, lines] of spec.sections) {
    children.push(new Paragraph({ text: secTitle, heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 80 } }));
    for (const line of lines) {
      children.push(new Paragraph({ children: [new TextRun({ text: line })], spacing: { after: 60 } }));
    }
  }
  children.push(new Paragraph({ children: [new TextRun({ text: "Federal Launch Kit · CapturePilot", color: "888888", size: 16 })], alignment: AlignmentType.CENTER, spacing: { before: 360 } }));

  const doc = new Document({ sections: [{ children }] });
  const buf = await Packer.toBuffer(doc);
  const out = resolve(PACK, spec.out);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, buf);
  return { out, key };
}

// ── main ─────────────────────────────────────────────────────────────────────
(async () => {
  const allItems = [...PHASES.flatMap((p) => p.items.map((it) => ({ ...it, phase: p }))), { ...BONUS, phase: { n: 7, title: "Bonus" } }];

  // 1. New DOCX first (so guides can reference them as existing files)
  if (!GUIDES_ONLY) {
    console.log("── New Word templates ──");
    for (const key of Object.keys(NEW_DOCX)) {
      const r = await buildDocx(key);
      console.log(`  ✓ ${NEW_DOCX[key].out}`);
    }
  }
  if (DOCX_ONLY) { console.log("\n(docx-only — done)"); return; }

  // 2. One-page guides
  console.log("\n── One-page guides ──");
  const results = [];
  for (const it of (MASTER_ONLY ? [] : allItems)) {
    // next-step label = next item's title (within or across phases)
    const idx = allItems.indexOf(it);
    const next = allItems[idx + 1];
    const nextLabel = next ? `${KIT_BASE}/${next.id} (${next.title})` : "";
    try {
      const md = await draftGuide(it, it.phase, nextLabel);
      const r = await renderGuidePdf(it, md);
      console.log(`  ✓ [P${it.phase.n}] ${it.title} → ${r.pageCount}p ${r.sizeKB}KB`);
      results.push({ id: it.id, guideId: it.guideId, ok: true, pages: r.pageCount });
    } catch (e) {
      console.log(`  ! ${it.title}: ${e.message}`);
      results.push({ id: it.id, ok: false, error: e.message });
    }
  }

  // 3. Master guide + master list
  console.log("\n── Master docs ──");
  try { const m = await buildMasterGuide(); console.log(`  ✓ Master Guide → ${m.r.pageCount}p ${m.r.sizeKB}KB`); }
  catch (e) { console.log(`  ! Master Guide: ${e.message}`); }
  try { const l = await buildMasterList(); console.log(`  ✓ Master Template List → ${l.r.pageCount}p ${l.r.sizeKB}KB`); }
  catch (e) { console.log(`  ! Master List: ${e.message}`); }

  // 4. Emit structure JSON for the manifest rebuild
  const structure = {
    masterGuide: { id: "flk-master-guide", localPath: "/starter-pack/FLK_00_START_HERE_Master_Guide.pdf" },
    masterList: { id: "flk-master-list", localPath: "/starter-pack/FLK_ZZ_Master_Template_List.pdf" },
    phases: PHASES.map((p) => ({
      key: p.key, n: p.n, slug: p.slug, title: p.title, blurb: p.blurb,
      items: p.items.map((it) => ({
        id: it.id, title: it.title, folder: it.folder, kind: it.kind,
        guideId: it.guideId, guideLocalPath: `/starter-pack/${it.guideFile}`,
        templates: it.templates.map((t) => ({
          title: t.title,
          localPath: t.src.startsWith("NEW:") ? `/starter-pack/${NEW_DOCX[t.src.slice(4)].out}` : `/starter-pack/${t.src}`,
        })),
      })),
    })),
    bonus: {
      id: BONUS.id, title: BONUS.title, folder: BONUS.folder, guideId: BONUS.guideId,
      guideLocalPath: `/starter-pack/${BONUS.guideFile}`,
      calendly: "https://calendly.com/capturepilot/launch-kit-onboarding",
      templates: BONUS.templates.map((t) => ({ title: t.title, localPath: `/starter-pack/${t.src}` })),
    },
  };
  const structOut = resolve(__dirname, "launch-kit-structure.generated.json");
  await writeFile(structOut, JSON.stringify(structure, null, 2));
  console.log(`\n✓ structure → ${structOut}`);

  const ok = results.filter((r) => r.ok).length;
  console.log(`\n=== ${ok}/${results.length} guides rendered ===`);
})().catch((e) => { console.error(e); process.exit(1); });
