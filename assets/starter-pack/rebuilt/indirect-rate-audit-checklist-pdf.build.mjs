/**
 * indirect-rate-audit-checklist-pdf.build.mjs
 * FLK v1.5 — 08_Price_to_Win_Toolkit
 *
 * Builds FLK_08_Indirect_Rate_Audit_Checklist.pdf using the pdf-builder pipeline.
 * Run: node assets/starter-pack/rebuilt/indirect-rate-audit-checklist-pdf.build.mjs
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = resolve(__dirname, "../../..");

const { renderPdf } = await import(resolve(REPO_ROOT, "tools/pdf-builder/render.mjs"));

const DEPLOY = resolve(
  REPO_ROOT,
  "dashboard/public/starter-pack/08_Price_to_Win_Toolkit/FLK_08_Indirect_Rate_Audit_Checklist.pdf"
);

const config = {
  id: "flk-indirect-rate-audit",
  title: "Indirect Rate Audit Checklist",
  slug: "flk-indirect-rate-audit",
  pages: 10,
  footerLabel: "CAPTUREPILOT · PRICE-TO-WIN TOOLKIT",
  headerLabel: "INDIRECT RATE AUDIT",

  parts: [
    // ─── COVER ──────────────────────────────────────────────────────────────────
    {
      type: "cover",
      eyebrow: "FEDERAL LAUNCH KIT · PRICE-TO-WIN TOOLKIT",
      titleLines: [
        "Indirect Rate",
        "Audit",
        "Checklist."
      ],
      accentWord: "Audit",
      badge: "INDIRECT RATE AUDIT",
      pages: 10,
      toolStrip: [
        { num: 1, title: "Documentation",   desc: "What DCAA examiners request on day one" },
        { num: 2, title: "Top-7 Findings",  desc: "Common deficiencies + how to prevent them" },
        { num: 3, title: "Rate Types",      desc: "Provisional vs. final vs. FPRA" },
        { num: 4, title: "FAR 31 Rules",    desc: "Allowable, unallowable, and questionable costs" }
      ]
    },

    // ─── TOC ────────────────────────────────────────────────────────────────────
    {
      type: "toc",
      title: "Seven sections. One audit prep path.",
      footerLabel: "CAPTUREPILOT · PRICE-TO-WIN TOOLKIT",
      parts: [
        {
          label: "/ DOCUMENTATION",
          items: [
            {
              code: "S01",
              title: "Documentation Buyers Expect",
              desc: "Cost pool definitions, allocation bases, timekeeping records, and the indirect cost incurred cost submission.",
              page: 3
            }
          ]
        },
        {
          label: "AUDIT FINDINGS + DEFENSES",
          items: [
            {
              code: "S02",
              title: "Top 7 DCAA Findings — and How to Avoid Them",
              desc: "From inadequate timekeeping to unallowable exec comp — the findings that show up most often and what to do before the auditor arrives.",
              page: 4
            }
          ]
        },
        {
          label: "RATE MECHANICS",
          items: [
            {
              code: "S03",
              title: "Provisional vs. Final Billing Rates",
              desc: "How provisional rates work, how they reconcile to actual costs, and why the difference triggers a billing adjustment or credit.",
              page: 6
            },
            {
              code: "S04",
              title: "Forward Pricing Rate Agreements (FPRAs)",
              desc: "When pursuing an FPRA with your ACO saves more in bid labor than it costs to negotiate.",
              page: 7
            }
          ]
        },
        {
          label: "COST ALLOWABILITY",
          items: [
            {
              code: "S05",
              title: "Cost Allowability per FAR 31",
              desc: "The four-factor test for allowability, plus the short list of costs that are always unallowable under FAR 31.205.",
              page: 8
            }
          ]
        },
        {
          label: "EXIT + REFERENCE",
          items: [
            {
              code: "S06",
              title: "Exit Conference Questions",
              desc: "Sample questions to ask before you sign the exit conference statement — and what to push back on.",
              page: 9
            },
            {
              code: "S07",
              title: "DCAA Pamphlets Reference Table",
              desc: "The official pamphlets DCAA publishes, what each one covers, and where to download them.",
              page: 10
            }
          ]
        }
      ]
    },

    // ─── SECTION 1: DOCUMENTATION ───────────────────────────────────────────────
    {
      type: "content",
      headerLabel: "S01 · DOCUMENTATION",
      markdown: `<div class="eyebrow">SECTION 01 · DOCUMENTATION BUYERS EXPECT</div>

# What DCAA examiners ask for on day one.

Before the auditor schedules the entrance conference, you should already have a binder — physical or digital — organized around four categories. Most audits stall not because costs are wrong, but because documentation is scattered or missing. The list below is drawn from DCAA's standard pre-audit request packages.

## Cost Pool Definitions

A cost pool is a grouping of indirect costs accumulated for allocation to one or more cost objectives. You need a written definition for every pool your rate structure uses.

- [ ] Indirect cost pool definitions in writing (who approved them, when)
- [ ] Fringe benefits pool: list of all benefit types included and excluded
- [ ] Overhead pool: basis for separating from G&A — is it labor-hours, direct labor dollars, or another base?
- [ ] G&A pool: confirm it covers residual business costs not included in overhead
- [ ] If you have a facilities capital cost of money (FCCM) pool, document the net book value and the Treasury rate used (CFR 9904.414)
- [ ] Any unallowable cost accounts excluded from pool totals — show the account numbers and GL mapping

## Allocation Bases

The allocation base is what you divide the pool by to arrive at a rate. The base must be reasonable and consistent year-over-year. Switching bases mid-year or between years without disclosure is a finding.

- [ ] Fringe base: total direct + indirect labor dollars (or hours — document which)
- [ ] Overhead base: direct labor dollars, total cost input, or value-added — document the choice and why it's equitable
- [ ] G&A base: total cost input (most common) or value-added — document why
- [ ] Prior-year bases used (auditors check consistency back three years minimum)
- [ ] Signed management representation that bases haven't changed without disclosure

## Timekeeping Records

Timekeeping is DCAA's entry point. If the timekeeping system is inadequate, the entire cost pool is vulnerable.

- [ ] Written timekeeping policies (charging instructions, correction procedures, supervisor approval chain)
- [ ] Timekeeping system description — how employees record time, whether it's electronic or paper
- [ ] Evidence that employees certify their own time (not supervisors certifying on their behalf)
- [ ] Floor check readiness: employees should be able to explain their charge codes without coaching
- [ ] Labor distribution report tied to the payroll register for at least two pay periods
- [ ] Overtime approval records aligned with premium time charged to contracts

## Incurred Cost Submission (ICS)

The ICS is the annual filing required under FAR 52.215-2. Due six months after fiscal year-end. Late submission triggers audit exposure for all open years.

- [ ] Schedule H: indirect cost rate calculation — pool totals, base totals, computed rate
- [ ] Schedule I: contract indirect cost summary — each active contract, dollar amounts billed vs. actual
- [ ] Schedule J: subcontract listing with cost and fee
- [ ] Schedule N: unallowable costs identified and excluded
- [ ] Supporting trial balance tied to financial statements
- [ ] Prior-year ICS acceptance letters or audit status (auditors ask for open-year list)

<div class="callout callout--emerald">
  <div style="font-family:'IBM Plex Mono',monospace;font-size:8.5pt;font-weight:600;letter-spacing:0.16em;color:#047857;text-transform:uppercase;margin-bottom:2mm;">FIELD TIP</div>
  <strong>Start the ICS 90 days before year-end, not after.</strong> The most common reason for a qualified audit is a trial balance that won't reconcile to the general ledger. Run the tie-out in Q3 so you have time to fix it before the six-month filing deadline.
</div>
`
    },

    // ─── SECTION 2: TOP-7 FINDINGS ──────────────────────────────────────────────
    {
      type: "content",
      headerLabel: "S02 · TOP-7 FINDINGS",
      markdown: `<div class="eyebrow">SECTION 02 · TOP-7 DCAA AUDIT FINDINGS</div>

# The seven findings that show up most often — and how to prevent each one.

These are drawn from DCAA's public reports to Congress, audit result databases, and practitioner experience across hundreds of contractor audits. None of them are exotic. Every one is preventable.

<table>
  <thead>
    <tr><th>#</th><th>Finding</th><th>Why It Happens</th><th>Prevention</th><th>Risk</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>1</strong></td>
      <td><strong>Inadequate timekeeping system</strong></td>
      <td>Supervisors correct employee timecards after the fact; no floor-check readiness; employees can't explain their charge codes.</td>
      <td>Written timekeeping policy. Employees self-certify — never supervisors. Conduct quarterly internal floor checks and document them.</td>
      <td><span class="risk-pill risk-critical">CRITICAL</span></td>
    </tr>
    <tr>
      <td><strong>2</strong></td>
      <td><strong>Unallowable costs in indirect pools</strong></td>
      <td>Advertising, entertainment, and lobbying coded to overhead or G&A because the chart of accounts wasn't designed to segregate them.</td>
      <td>Create dedicated unallowable account codes (e.g., 6900-series) before year-end. Map every FAR 31.205 unallowable to its own GL line. Exclude from pools on Schedule N.</td>
      <td><span class="risk-pill risk-critical">CRITICAL</span></td>
    </tr>
    <tr>
      <td><strong>3</strong></td>
      <td><strong>Executive compensation above benchmark</strong></td>
      <td>CEO or executive salaries in excess of the OPM benchmark published annually under FAR 31.205-6(p). The benchmark for FY2024 is $680,000. Anything above is unallowable.</td>
      <td>Pull the current benchmark every October (when OPM publishes it). If exec pay approaches the cap, document the market analysis before year-end — not after the auditor asks.</td>
      <td><span class="risk-pill risk-high">HIGH</span></td>
    </tr>
    <tr>
      <td><strong>4</strong></td>
      <td><strong>Inconsistent allocation base</strong></td>
      <td>Company switched from direct labor dollars to total cost input mid-year (or between years) without disclosing the change in the ICS or getting ACO approval.</td>
      <td>Document your chosen base in the written accounting system description. Any change requires an advance agreement or disclosure. Keep a log of base history.</td>
      <td><span class="risk-pill risk-high">HIGH</span></td>
    </tr>
    <tr>
      <td><strong>5</strong></td>
      <td><strong>Mischarging — direct costs in indirect pools</strong></td>
      <td>Labor that was clearly direct (identifiable to a specific contract) was coded to overhead because the employee "only worked there a few hours."</td>
      <td>Train project managers on the direct vs. indirect distinction. If someone works on a contract, even for two hours, the time goes direct. No exceptions.</td>
      <td><span class="risk-pill risk-high">HIGH</span></td>
    </tr>
    <tr>
      <td><strong>6</strong></td>
      <td><strong>Late or incomplete ICS filing</strong></td>
      <td>ICS filed after the six-month deadline (FAR 52.215-2). Common at small companies where accounting staff turns over or the requirement isn't calendared.</td>
      <td>Calendar the ICS deadline at fiscal year-start. Assign a named responsible party. Start the draft in Q3. Late filing exposes all open years to audit simultaneously.</td>
      <td><span class="risk-pill risk-medium">MEDIUM</span></td>
    </tr>
    <tr>
      <td><strong>7</strong></td>
      <td><strong>B&P and IR&D over the negotiated ceiling</strong></td>
      <td>Bid and proposal costs or independent R&D costs exceeded the amount agreed with the ACO. The overage is unallowable unless there's a written advance agreement allowing it.</td>
      <td>Track B&P and IR&D spend in real time against your ceiling. If you're approaching the cap and have a genuine need to exceed it, negotiate an advance agreement before you spend — not after.</td>
      <td><span class="risk-pill risk-medium">MEDIUM</span></td>
    </tr>
  </tbody>
</table>

<div class="callout">
  <div class="eyebrow" style="margin-bottom:2mm;">THE PATTERN</div>
  <p style="margin:0;">Four of these seven findings come down to the same root cause: the accounting system wasn't designed for government cost accounting before the first contract hit. If your chart of accounts, timekeeping system, and pool definitions were built for commercial work, they need surgery before you go past the micro-purchase threshold. Do it now, not during the entrance conference.</p>
</div>
`
    },

    // ─── SECTION 3: PROVISIONAL VS FINAL ────────────────────────────────────────
    {
      type: "content",
      headerLabel: "S03 · PROVISIONAL VS FINAL RATES",
      markdown: `<div class="eyebrow">SECTION 03 · PROVISIONAL VS. FINAL BILLING RATES</div>

# How provisional rates work — and why the difference matters.

Most contractors on cost-reimbursement contracts bill at provisional (estimated) indirect rates throughout the year. At year-end, actual costs are tallied, actual rates are computed, and a reconciliation settles the difference. Get this wrong and you either over-billed the government (which triggers a refund demand) or under-billed (which means you've been financing the government for 12 months).

## The Rate Lifecycle

<table>
  <thead>
    <tr><th>Stage</th><th>What It Is</th><th>Who Sets It</th><th>When Used</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Provisional billing rate</strong></td>
      <td>An estimated indirect rate used for interim billing throughout the fiscal year. Not a final cost determination.</td>
      <td>Contractor proposes; ACO (Administrative Contracting Officer) approves or sets unilaterally.</td>
      <td>All interim invoices on flexibly priced contracts (cost-plus, T&amp;M, labor-hour).</td>
    </tr>
    <tr>
      <td><strong>Final indirect cost rate</strong></td>
      <td>The actual rate computed after year-end based on audited or settled indirect costs. Replaces provisional rates.</td>
      <td>DCAA audits the ICS; ACO negotiates and issues a final rate agreement (FRA).</td>
      <td>Closing invoices, contract closeout, retroactive billing adjustments.</td>
    </tr>
    <tr>
      <td><strong>Pre-established final rate</strong></td>
      <td>A rate agreed in advance that substitutes for both provisional billing and post-year settlement. Eliminates the audit loop.</td>
      <td>Contractor and ACO negotiate before year-start (part of FPRA process).</td>
      <td>Small businesses with stable cost structures who want to avoid annual audit cycles.</td>
    </tr>
  </tbody>
</table>

## Reconciliation: What Actually Happens at Year-End

When final rates are established and they differ from provisional rates, a billing adjustment is required:

- **Over-billed**: provisional rate was higher than actual. Contractor must issue a credit invoice or DCAA will recover via an offset on the next payment.
- **Under-billed**: provisional rate was lower than actual. Contractor submits a final invoice for the additional amount — but only after the final rate agreement is signed.

## Checklist: Provisional Rate Management

- [ ] Provisional rates are documented in a rate agreement letter signed by the ACO
- [ ] Invoices reference the provisional rate for each pool (fringe %, overhead %, G&A %)
- [ ] Actual-vs-provisional variance tracked monthly (flag if it drifts more than 5 percentage points)
- [ ] ICS filed within six months of fiscal year-end
- [ ] Billing adjustment invoices submitted promptly after final rate agreement
- [ ] Open-year rate agreements older than 24 months escalated to the ACO for closure

<div class="callout callout--emerald">
  <div style="font-family:'IBM Plex Mono',monospace;font-size:8.5pt;font-weight:600;letter-spacing:0.16em;color:#047857;text-transform:uppercase;margin-bottom:2mm;">PRACTITIONER NOTE</div>
  <strong>Watch the lag on final rate settlements.</strong> DCAA's average audit cycle for small business ICS is 18–36 months. That means you may be carrying open provisional rates for three contract years simultaneously. If your provisional rates have been running 8–10 points above actual, that's a significant credit the government will demand all at once when the final rates settle. Track the variance quarterly so it doesn't blindside your cash flow.
</div>
`
    },

    // ─── SECTION 4: FPRAs ───────────────────────────────────────────────────────
    {
      type: "content",
      headerLabel: "S04 · FORWARD PRICING RATE AGREEMENTS",
      markdown: `<div class="eyebrow">SECTION 04 · FORWARD PRICING RATE AGREEMENTS (FPRAs)</div>

# When an FPRA saves more than it costs to negotiate.

A Forward Pricing Rate Agreement (FPRA) is a written agreement between the contractor and an authorized government representative (ACO) that establishes indirect cost rates for use in pricing future contracts and modifications. FAR 42.1701 governs them. They're not mandatory — but for contractors submitting multiple proposals per year above $15 million in volume, they're worth pursuing.

## The Business Case

Without an FPRA, every large proposal triggers a separate audit of your forward pricing rates. The auditor reviews your rate buildup, interviews your accounting team, and issues a recommendation. That process takes weeks and can delay proposal submission or contract award.

With an FPRA, you hand the CO a pre-agreed rate set. The pricing is clean. The negotiation is shorter. And you don't reprice the same overhead structure for every bid.

<table>
  <thead>
    <tr><th>Factor</th><th>Without FPRA</th><th>With FPRA</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Proposal cost estimating</strong></td>
      <td>Full rate reconstruction for every significant proposal</td>
      <td>Apply agreed rates; focus time on technical and labor hours</td>
    </tr>
    <tr>
      <td><strong>Audit cycle</strong></td>
      <td>DCAA audit request per proposal above threshold ($2M cost-type)</td>
      <td>Annual FPRA renewal review; no per-proposal audit</td>
    </tr>
    <tr>
      <td><strong>Rate certainty for COs</strong></td>
      <td>CO must wait for DCAA recommendation before awarding</td>
      <td>CO uses agreed rates; award can proceed faster</td>
    </tr>
    <tr>
      <td><strong>Cash flow risk</strong></td>
      <td>Large provisional-vs-actual variances possible if cost structure shifts</td>
      <td>Negotiated rates reduce variance risk if cost structure is stable</td>
    </tr>
  </tbody>
</table>

## When to Pursue an FPRA

An FPRA makes sense when ALL of these are true:

- [ ] You submit five or more large proposals per year on cost-reimbursable or T&M contracts
- [ ] Your indirect cost structure is reasonably stable (G&A rate doesn't swing more than 5 points year-over-year)
- [ ] You have a written Cost Accounting Standards (CAS) disclosure statement (required above the CAS threshold: $2M covered contracts)
- [ ] Your ACO is willing to negotiate one — contact the DCMA office that administers your largest contract

## Checklist: FPRA Preparation

- [ ] Request FPRA initiation in writing to your ACO, citing FAR 42.1701
- [ ] Submit a rate proposal package: historical actuals (3 years), current-year forecast, methodology memo
- [ ] Prepare to discuss each pool's basis of allocation and why it's equitable
- [ ] Confirm whether you're subject to CAS (covered contracts cumulative total &gt; $2M); if yes, ensure CAS disclosure statement is current
- [ ] If budget authority is the rate base, document the budget process and approval chain
- [ ] Once agreed, update proposal templates to reference the FPRA number and effective period

<div class="callout">
  <div class="eyebrow" style="margin-bottom:2mm;">WHEN NOT TO PURSUE AN FPRA</div>
  <p style="margin:0;">If your indirect rates swing significantly year-over-year (rapid growth, heavy hiring, changing facility costs), an FPRA can lock you into rates that misrepresent actual costs — which creates the same billing adjustment problem you were trying to avoid. Stable companies benefit most. Fast-growing ones often do better staying on provisional rates and filing accurate ICS submissions annually.</p>
</div>
`
    },

    // ─── SECTION 5: FAR 31 ALLOWABILITY ─────────────────────────────────────────
    {
      type: "content",
      headerLabel: "S05 · COST ALLOWABILITY — FAR 31",
      markdown: `<div class="eyebrow">SECTION 05 · COST ALLOWABILITY PER FAR 31</div>

# Four factors. One test. A short list that's always unallowable.

FAR 31.201-2 says a cost is allowable only if it meets ALL four of these criteria simultaneously. A cost that fails even one is unallowable — regardless of how reasonable it seems.

## The Four-Factor Allowability Test

<table>
  <thead>
    <tr><th>Factor</th><th>What It Means</th><th>Common Failure Mode</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>1. Reasonableness</strong></td>
      <td>The cost does not exceed what a prudent businessperson would pay in a competitive market. FAR 31.201-3 defines this as what a prudent person "in the conduct of competitive business" would incur.</td>
      <td>Hotel rates above GSA per diem with no documentation of why a cheaper option wasn't available. First-class airfare without an authorized exception.</td>
    </tr>
    <tr>
      <td><strong>2. Allocability</strong></td>
      <td>The cost is assignable to the contract or cost objective based on relative benefits received or other equitable relationship. FAR 31.201-4.</td>
      <td>Headquarters rent allocated 100% to one contract when multiple contracts benefit from the facility.</td>
    </tr>
    <tr>
      <td><strong>3. CAS compliance / GAAP</strong></td>
      <td>The cost is accounted for in accordance with Generally Accepted Accounting Principles and, where applicable, Cost Accounting Standards. FAR 31.201-2(a)(3).</td>
      <td>Expensing capital equipment in the period of purchase instead of depreciating it; inconsistent treatment year-over-year.</td>
    </tr>
    <tr>
      <td><strong>4. Contract terms</strong></td>
      <td>The cost is not specifically excluded by the contract terms or cost principles at FAR 31.205.</td>
      <td>Travel costs that exceed the contract's stated per-diem ceiling. Subcontract costs that weren't properly competed under FAR Part 44.</td>
    </tr>
  </tbody>
</table>

## Always-Unallowable Costs (FAR 31.205 — Selected)

These costs are unallowable regardless of what contract they're charged to. Maintain dedicated GL accounts for each one to make Schedule N of your ICS clean.

<table>
  <thead>
    <tr><th>FAR Citation</th><th>Cost Type</th><th>Key Detail</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>FAR 31.205-1</strong></td>
      <td>Advertising and public relations</td>
      <td>Ads designed to promote the company's general image. Costs for approved public notices, recruitment ads, and "help wanted" are allowable.</td>
    </tr>
    <tr>
      <td><strong>FAR 31.205-3</strong></td>
      <td>Bad debts</td>
      <td>Bad debt write-offs and associated collection costs are unallowable.</td>
    </tr>
    <tr>
      <td><strong>FAR 31.205-8</strong></td>
      <td>Contributions and donations</td>
      <td>All charitable contributions, regardless of business purpose.</td>
    </tr>
    <tr>
      <td><strong>FAR 31.205-11</strong></td>
      <td>Depreciation above acquisition cost</td>
      <td>Depreciation cannot exceed actual acquisition cost of the asset.</td>
    </tr>
    <tr>
      <td><strong>FAR 31.205-14</strong></td>
      <td>Entertainment</td>
      <td>Costs of entertainment, amusement, and diversions. Business meals at restaurants are typically entertainment and unallowable unless they meet the FAR 31.205-43 employee morale exception narrowly.</td>
    </tr>
    <tr>
      <td><strong>FAR 31.205-22</strong></td>
      <td>Lobbying</td>
      <td>Costs of influencing legislation, regulatory rulemaking, or contract awards are unallowable. Includes time spent preparing lobbying materials.</td>
    </tr>
    <tr>
      <td><strong>FAR 31.205-26(e)</strong></td>
      <td>Interorganizational transfers above cost</td>
      <td>If a division or affiliate bills another at above-cost (i.e., with profit), the profit portion is unallowable.</td>
    </tr>
    <tr>
      <td><strong>FAR 31.205-47</strong></td>
      <td>Legal costs for fraud/criminal proceedings</td>
      <td>Legal fees to defend charges of fraud, false claims, or criminal conduct against the government are unallowable.</td>
    </tr>
  </tbody>
</table>

## Quick Allowability Check

Before coding any cost to a government contract pool, run through this list:

- [ ] Is the amount reasonable compared to what a competitive firm would pay?
- [ ] Does this cost benefit the contracts in the pool in proportion to how it's allocated?
- [ ] Is this cost type listed in FAR 31.205 as specifically unallowable?
- [ ] Does the contract have its own cost ceiling or exclusion that applies?
- [ ] Is there documentation to support the business purpose and amount?
`
    },

    // ─── SECTION 6: EXIT CONFERENCE ─────────────────────────────────────────────
    {
      type: "content",
      headerLabel: "S06 · EXIT CONFERENCE",
      markdown: `<div class="eyebrow">SECTION 06 · SAMPLE EXIT CONFERENCE QUESTIONS</div>

# Ask these before you sign the exit conference statement.

The exit conference is the auditor's formal presentation of findings before the final report is issued. It's not a formality. It's the last moment before findings become official. You can't un-sign an exit conference statement that you disagreed with but didn't challenge.

These questions are drawn from practitioner experience across DCAA floor checks, billing system audits, and incurred cost audits. Adapt them to your situation.

## On Scope and Methodology

- [ ] "Which specific cost pools did you test, and at what sampling level?"
- [ ] "For any statistical sampling you used — what was the confidence level and the projected error rate?"
- [ ] "Were all timekeeping judgments based on written policy, or are some based on auditor interpretation of what policy should say?"
- [ ] "For findings related to allocability — what standard are you applying to define 'equitable'?"

## On Individual Findings

For each finding presented at exit, ask:

- [ ] "What is the specific FAR or CAS citation supporting this finding?"
- [ ] "What dollar amount is questioned, and how was it calculated?"
- [ ] "Is this a material finding (significant enough to affect overall audit opinion) or an immaterial finding?"
- [ ] "If we produce additional documentation not provided during fieldwork, will you consider it before the draft report is issued?"
- [ ] "Is this a repeat finding from a prior year? If yes, was the prior-year finding formally resolved?"

## On Your Right to Respond

- [ ] "What is the formal response period for submitting a written rebuttal before the final report?"
- [ ] "Will the auditor's supervisor or branch manager be at this conference?"
- [ ] "If we disagree with a finding, who do we escalate to — the Supervisory Auditor, Branch Manager, or Resident Auditor?"
- [ ] "What is the process for requesting a re-audit or a supplemental review?"

## On Systemic Issues

- [ ] "Are these findings limited to this audit period, or are you indicating they represent ongoing systemic deficiencies?"
- [ ] "What corrective action plan format does DCAA prefer for responding to systemic findings?"
- [ ] "For any billing system deficiency — will this finding trigger a withheld payment pending correction, or is it informational only?"

<div class="callout callout--emerald">
  <div style="font-family:'IBM Plex Mono',monospace;font-size:8.5pt;font-weight:600;letter-spacing:0.16em;color:#047857;text-transform:uppercase;margin-bottom:2mm;">IMPORTANT</div>
  <strong>Do not sign the exit conference statement under time pressure.</strong> You typically have the right to request an additional 5–10 business days to review findings with your controller and counsel before signing. The auditor may push back, but it's a reasonable ask. A signed exit conference statement that acknowledges findings you dispute makes your formal rebuttal much harder.
</div>
`
    },

    // ─── SECTION 7: DCAA PAMPHLETS ──────────────────────────────────────────────
    {
      type: "content",
      headerLabel: "S07 · DCAA PAMPHLETS REFERENCE",
      markdown: `<div class="eyebrow">SECTION 07 · DCAA PAMPHLETS REFERENCE TABLE</div>

# The pamphlets DCAA publishes — and what each one actually covers.

DCAA maintains a library of guidance pamphlets at dcaa.mil/Resources/Guidance-Documents. These are the ones worth bookmarking. They're free, regularly updated, and reflect how DCAA auditors are actually trained.

<table>
  <thead>
    <tr><th>Pamphlet</th><th>Title</th><th>What It Covers</th><th>Best For</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>7641.90</strong></td>
      <td>Information for Contractors</td>
      <td>Overview of DCAA's role, types of audits, contractor rights and responsibilities, how to interact with auditors.</td>
      <td>New government contractors; onboarding your accounting team before the first audit.</td>
    </tr>
    <tr>
      <td><strong>7641.91</strong></td>
      <td>Frequently Asked Questions</td>
      <td>Answers to the 30 most common questions DCAA receives from contractors about incurred cost submissions, billing, and audit procedures.</td>
      <td>Quick lookup during ICS prep or when a new accounting hire asks "why do we do it this way?"</td>
    </tr>
    <tr>
      <td><strong>CAM (Contract Audit Manual)</strong></td>
      <td>DCAA Contract Audit Manual</td>
      <td>The full technical manual auditors follow. Covers every audit type, sampling methodology, evaluation criteria for accounting systems, timekeeping, and estimating.</td>
      <td>Controllers and government contractors preparing for a billing system or accounting system adequacy audit.</td>
    </tr>
    <tr>
      <td><strong>ICSD Checklist</strong></td>
      <td>Incurred Cost Electronically (ICE) Model</td>
      <td>The Excel-based ICS template DCAA recommends. Includes all required schedules (A through S), built-in formulas, and submission instructions.</td>
      <td>Anyone filing an ICS for the first time. Using the ICE model reduces rejection risk significantly.</td>
    </tr>
    <tr>
      <td><strong>Timekeeping Guide</strong></td>
      <td>DCAA Timekeeping Guidance</td>
      <td>What DCAA considers an adequate timekeeping system, floor check procedures, what auditors look for when testing labor charges.</td>
      <td>HR and accounting leads building or auditing an existing timekeeping policy.</td>
    </tr>
    <tr>
      <td><strong>Estimating Guide</strong></td>
      <td>Contractor Estimating Systems</td>
      <td>Criteria for an adequate estimating system under DFARS 252.215-7002. Covers how historical actuals flow into forward pricing, documentation requirements, and common deficiencies.</td>
      <td>Contracts and pricing managers who estimate on cost-type proposals above $100M DoD threshold.</td>
    </tr>
    <tr>
      <td><strong>Small Business Guide</strong></td>
      <td>Small Business Guidance</td>
      <td>Simplified guidance tailored to small contractors: what audits to expect, reduced documentation requirements, and the floor check process for small companies.</td>
      <td>Small businesses under $10M in annual government revenue who want a plain-English audit primer.</td>
    </tr>
  </tbody>
</table>

## Download Links

All DCAA publications are available at **dcaa.mil** under Resources → Guidance Documents. The ICE Model (ICS template) is under Resources → Incurred Cost Electronically. No login required — they're public.

## Quick Reference: Audit Types You're Most Likely to Face

<table>
  <thead>
    <tr><th>Audit Type</th><th>Trigger</th><th>Typical Duration</th><th>Output</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Pre-award accounting system survey</strong></td>
      <td>First cost-type contract above $750,000 (or CO request)</td>
      <td>1–3 weeks</td>
      <td>Adequate / Inadequate determination. Inadequate = no cost-type award until resolved.</td>
    </tr>
    <tr>
      <td><strong>Billing system audit</strong></td>
      <td>Cost-type contracts with active billings; risk-based selection</td>
      <td>2–6 weeks</td>
      <td>Significant deficiency findings; may result in withheld payments (up to 5% per FAR 52.242-3).</td>
    </tr>
    <tr>
      <td><strong>Incurred cost audit</strong></td>
      <td>ICS filing; risk-based; DCAA selects years based on dollar value</td>
      <td>3–18 months</td>
      <td>Final rate recommendation to ACO; questioned costs become potential refund demands.</td>
    </tr>
    <tr>
      <td><strong>Forward pricing audit</strong></td>
      <td>Cost-type proposal above $2M (DoD) or $10M (civilian, risk-based)</td>
      <td>2–8 weeks</td>
      <td>Audit report with rate recommendations used by CO in negotiations.</td>
    </tr>
  </tbody>
</table>

- [ ] Bookmarked dcaa.mil Resources page and verified ICE Model version is current
- [ ] Downloaded latest CAM chapters relevant to your active audit types
- [ ] Accounting team has read Pamphlet 7641.90 before the first entrance conference
- [ ] Small Business Guide distributed to accounting staff if you're under $10M gov revenue
`
    },

    // ─── BACK COVER ─────────────────────────────────────────────────────────────
    {
      type: "back-cover",
      eyebrow: "WHAT'S NEXT",
      headline: "Track your indirect rates. Win with confidence.",
      accentWord: "confidence",
      body: "CapturePilot's Price-to-Win Toolkit includes an Indirect Rate Calculator, a Labor Rate Benchmark, and this audit checklist — everything a small contractor needs to price competitively and survive DCAA scrutiny. Free 14-day trial.",
      ctaText: "Start free trial →",
      ctaUrl: "https://capturepilot.com/signup",
      footerLabel: "CAPTUREPILOT · PRICE-TO-WIN TOOLKIT"
    }
  ]
};

// ─── RENDER ──────────────────────────────────────────────────────────────────
async function main() {
  await mkdir(resolve(DEPLOY, ".."), { recursive: true });
  console.log("Rendering indirect rate audit checklist PDF…");
  await renderPdf({ config, outputPath: DEPLOY });
  const { stat } = await import("node:fs/promises");
  const { size } = await stat(DEPLOY);
  console.log(`✓ Written: ${DEPLOY}`);
  console.log(`  Size: ${(size / 1024).toFixed(1)} KB`);
}

main().catch((err) => { console.error(err); process.exit(1); });
