/**
 * dcaa-accounting-basics-pdf.build.mjs
 * FLK v1.5 — 11_Post_Award_Compliance
 *
 * Builds FLK_11_DCAA_Accounting_Basics.pdf using the pdf-builder pipeline.
 * Run: node assets/starter-pack/rebuilt/dcaa-accounting-basics-pdf.build.mjs
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = resolve(__dirname, "../../..");

const { renderPdf } = await import(resolve(REPO_ROOT, "tools/pdf-builder/render.mjs"));

const DEPLOY = resolve(
  REPO_ROOT,
  "dashboard/public/starter-pack/11_Post_Award_Compliance/FLK_11_DCAA_Accounting_Basics.pdf"
);

const config = {
  id: "flk-dcaa-accounting-basics",
  title: "DCAA Accounting Basics for Federal Contractors",
  slug: "flk-dcaa-accounting-basics",
  pages: 12,
  footerLabel: "CAPTUREPILOT · POST-AWARD COMPLIANCE",
  headerLabel: "DCAA ACCOUNTING BASICS",

  parts: [
    // ─── COVER ──────────────────────────────────────────────────────────────────
    {
      type: "cover",
      eyebrow: "FEDERAL LAUNCH KIT · POST-AWARD COMPLIANCE",
      titleLines: [
        "DCAA",
        "Accounting",
        "Basics."
      ],
      accentWord: "Accounting",
      badge: "DCAA ACCOUNTING",
      pages: 12,
      toolStrip: [
        { num: 1, title: "What DCAA Does",    desc: "When audits happen — and when they don't" },
        { num: 2, title: "SF 1408 Walkthrough", desc: "The 18-point adequacy test explained" },
        { num: 3, title: "Job-Cost Basics",   desc: "Direct vs. indirect — the line you can't cross" },
        { num: 4, title: "FAR Part 31",       desc: "Top 10 unallowables small contractors trip on" }
      ]
    },

    // ─── TOC ────────────────────────────────────────────────────────────────────
    {
      type: "toc",
      title: "Seven sections. One compliance path.",
      footerLabel: "CAPTUREPILOT · POST-AWARD COMPLIANCE",
      parts: [
        {
          label: "/ FOUNDATION",
          items: [
            {
              code: "S01",
              title: "What DCAA Is — and When They Audit",
              desc: "Most small contracts never trigger an audit. Cost-reimbursement contracts almost always do. Know the thresholds before you sign.",
              page: 3
            }
          ]
        },
        {
          label: "ACCOUNTING SYSTEM",
          items: [
            {
              code: "S02",
              title: "The SF 1408 Adequacy Walkthrough",
              desc: "The 18-point checklist DCAA uses to decide if your accounting system can support a cost-type contract. Walk it before they do.",
              page: 4
            },
            {
              code: "S03",
              title: "Job-Cost Accounting Basics",
              desc: "How to segregate direct from indirect costs — the single most important distinction in government cost accounting.",
              page: 5
            }
          ]
        },
        {
          label: "TIMEKEEPING + RATES",
          items: [
            {
              code: "S04",
              title: "Timekeeping Requirements",
              desc: "The daily-log rule, employee self-certification, and why a supervisor correcting a timecard is a finding waiting to happen.",
              page: 7
            },
            {
              code: "S05",
              title: "Indirect Rate Pools",
              desc: "Fringe, Overhead, and G&A — the three pools almost every small contractor needs, how to build them, and how to compute the rates.",
              page: 8
            }
          ]
        },
        {
          label: "COST ALLOWABILITY",
          items: [
            {
              code: "S06",
              title: "Allowability per FAR Part 31",
              desc: "Top 10 unallowable cost types that catch small contractors off guard: entertainment, lobbying, advertising, and seven more.",
              page: 10
            }
          ]
        },
        {
          label: "STAFFING",
          items: [
            {
              code: "S07",
              title: "When to Hire a DCAA-Experienced Bookkeeper",
              desc: "The three contract events that signal it's time to bring in specialist help — and what to look for when you do.",
              page: 11
            }
          ]
        }
      ]
    },

    // ─── SECTION 1: WHAT DCAA IS ─────────────────────────────────────────────────
    {
      type: "content",
      headerLabel: "S01 · WHAT DCAA IS",
      markdown: `<div class="eyebrow">SECTION 01 · WHAT DCAA IS AND WHEN THEY AUDIT</div>

# Most small contracts don't trigger an audit. Cost-plus ones do.

DCAA — the Defense Contract Audit Agency — is a DoD field agency with about 4,000 auditors. Its job is to examine contractor financial records and provide audit services to DoD contracting officers and, under inter-agency agreements, to civilian agencies like HHS, DOE, and NASA. They don't prosecute fraud (that's DoD IG and DOJ). They audit costs, accounting systems, and billing practices.

## When DCAA Gets Involved

<table>
  <thead>
    <tr><th>Contract Type</th><th>Audit Likelihood</th><th>What Triggers It</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Fixed-price (FFP)</strong></td>
      <td><span class="risk-pill risk-low">LOW</span></td>
      <td>DCAA rarely audits FFP contracts post-award. The government's risk is capped at the contract price. You might see a pre-award survey if you're new and the CO asks for one.</td>
    </tr>
    <tr>
      <td><strong>Fixed-price with economic price adjustment (FP-EPA)</strong></td>
      <td><span class="risk-pill risk-low">LOW</span></td>
      <td>Same as FFP. Occasional post-award review if the EPA mechanism involves labor rate audits.</td>
    </tr>
    <tr>
      <td><strong>Time-and-materials (T&amp;M) / Labor-hour (LH)</strong></td>
      <td><span class="risk-pill risk-medium">MEDIUM</span></td>
      <td>Labor rates are billed as agreed, but the government may audit hours worked and whether the correct rates were applied. Billing system audits happen on larger T&amp;M vehicles.</td>
    </tr>
    <tr>
      <td><strong>Cost-reimbursement (CPFF, CPAF, CPIF)</strong></td>
      <td><span class="risk-pill risk-critical">HIGH</span></td>
      <td>The government reimburses your actual costs. That means DCAA needs to verify those costs are allowable, allocable, and reasonable. Pre-award accounting system survey often required above $750,000. Annual incurred cost audit follows the ICS filing.</td>
    </tr>
    <tr>
      <td><strong>IDIQ / GWACs with cost-type task orders</strong></td>
      <td><span class="risk-pill risk-high">HIGH</span></td>
      <td>The IDIQ vehicle itself may not trigger audit, but each cost-type task order you execute can. Treat your accounting system as if DCAA is already on-site.</td>
    </tr>
  </tbody>
</table>

## The Threshold Numbers Worth Memorizing

- **$750,000**: typical threshold above which a CO may require a pre-award accounting system survey before awarding a cost-type contract.
- **$2 million**: the cumulative covered-contract threshold above which Cost Accounting Standards (CAS) begin to apply. Below this you're CAS-exempt — but you still need an adequate accounting system.
- **$15 million per year**: annual revenue threshold above which CAS full coverage kicks in (versus modified coverage).

## What DCAA Is Not

DCAA doesn't set rules. FAR Part 31 does. DCAA audits against those rules. If an auditor cites internal DCAA policy rather than a FAR, CAS, or GAAP citation, you have the right to ask for the authoritative reference. That distinction matters in a dispute.

<div class="callout callout--emerald">
  <div style="font-family:'IBM Plex Mono',monospace;font-size:8.5pt;font-weight:600;letter-spacing:0.16em;color:#047857;text-transform:uppercase;margin-bottom:2mm;">BOTTOM LINE</div>
  <strong>If you're pursuing your first cost-type contract, assume DCAA will visit.</strong> Build your accounting system to pass the SF 1408 adequacy test before you submit the proposal — not after the CO calls asking for an audit package.
</div>
`
    },

    // ─── SECTION 2: SF 1408 WALKTHROUGH ──────────────────────────────────────────
    {
      type: "content",
      headerLabel: "S02 · SF 1408 ADEQUACY TEST",
      markdown: `<div class="eyebrow">SECTION 02 · THE SF 1408 ADEQUACY WALKTHROUGH</div>

# The 18-point test that decides whether you can hold a cost-type contract.

Standard Form 1408 is DCAA's pre-award accounting system adequacy checklist. An "adequate" determination means your system can properly accumulate and report costs under a government cost-reimbursement contract. An "inadequate" determination means no cost-type award until you fix the deficiencies.

The form asks 18 yes/no questions organized around five capability areas. Every "No" is a potential finding. Walk through each one before you invite DCAA in.

<table>
  <thead>
    <tr><th>#</th><th>Requirement</th><th>What Passes</th><th>Common Failure</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>1</strong></td>
      <td>Proper segregation of direct costs from indirect costs</td>
      <td>Chart of accounts separates direct labor, direct materials, and direct ODCs from fringe, overhead, and G&amp;A pools.</td>
      <td>All labor coded to one account. No distinction between time on contract vs. time in overhead.</td>
    </tr>
    <tr>
      <td><strong>2</strong></td>
      <td>Identification and accumulation of direct costs by contract</td>
      <td>Every cost can be traced to a specific contract or job number in the general ledger.</td>
      <td>Time and expenses coded to a division or department code, not a contract code. No job-cost module active.</td>
    </tr>
    <tr>
      <td><strong>3</strong></td>
      <td>A logical and consistent method for the allocation of indirect costs</td>
      <td>Written indirect cost allocation methodology that is consistently applied year-over-year.</td>
      <td>Allocation changed between years without disclosure. Methodology not documented in writing.</td>
    </tr>
    <tr>
      <td><strong>4</strong></td>
      <td>Accumulation of costs under general ledger control</td>
      <td>Project/job ledgers tie directly to the trial balance. Subsidiary ledgers reconcile to the GL monthly.</td>
      <td>Job-cost reports exist in a spreadsheet that doesn't reconcile to QuickBooks or the GL.</td>
    </tr>
    <tr>
      <td><strong>5</strong></td>
      <td>A timekeeping system that identifies employees' labor by intermediate or final cost objective</td>
      <td>Employees record time to contract charge codes (not just departments). Electronic or paper — either works if it's consistent.</td>
      <td>Supervisors allocate labor after the fact based on estimates. No daily recording.</td>
    </tr>
    <tr>
      <td><strong>6</strong></td>
      <td>A labor distribution system that charges direct and indirect labor to appropriate cost objectives</td>
      <td>Payroll feeds into the job-cost system. Labor distribution report reconciles to both timesheets and payroll register.</td>
      <td>Payroll is processed in one system; job costs are tracked in another. They don't reconcile.</td>
    </tr>
    <tr>
      <td><strong>7</strong></td>
      <td>Interim (at least monthly) determination of costs charged to a contract</td>
      <td>Monthly job-cost reports by contract, tied to the GL, reviewed by management.</td>
      <td>Cost reports produced only at invoice time or year-end.</td>
    </tr>
    <tr>
      <td><strong>8–18</strong></td>
      <td>Exclusion of unallowable costs, billings based on actual costs, interim billings supported by records, written accounting policies, internal controls, and others</td>
      <td>Written accounting policies in place. Unallowable costs in segregated GL accounts. Billings match incurred costs with supporting documentation.</td>
      <td>Policies exist only as tribal knowledge. Entertainment and lobbying costs in overhead without exclusion. Invoices exceed billed costs.</td>
    </tr>
  </tbody>
</table>

## Self-Assessment Checklist (run this before the auditor does)

- [ ] Chart of accounts has separate accounts for direct labor, direct materials, direct ODCs, and each indirect pool
- [ ] Every employee records time daily against contract/job codes — not departments
- [ ] Job-cost subsidiary ledger reconciles to the trial balance monthly
- [ ] Written indirect cost allocation methodology exists and is dated
- [ ] Unallowable costs (entertainment, advertising, lobbying) have dedicated GL accounts excluded from pools
- [ ] Labor distribution report ties to both the payroll register and the timesheet system
- [ ] Accounting policies are documented, current, and reviewed annually

<div class="callout">
  <div class="eyebrow" style="margin-bottom:2mm;">RULE OF THUMB</div>
  <p style="margin:0;">QuickBooks, Unanet, Deltek Costpoint, and JAMIS can all support an adequate accounting system. The system itself isn't the issue. It's whether it's configured to capture costs by contract, whether employees use it daily, and whether management reviews it monthly. A $50/month bookkeeper who configures QuickBooks correctly beats a $50,000 enterprise system that nobody maintains.</p>
</div>
`
    },

    // ─── SECTION 3: JOB-COST ACCOUNTING ──────────────────────────────────────────
    {
      type: "content",
      headerLabel: "S03 · JOB-COST ACCOUNTING BASICS",
      markdown: `<div class="eyebrow">SECTION 03 · JOB-COST ACCOUNTING BASICS</div>

# The one distinction that runs through every DCAA finding: direct vs. indirect.

Government cost accounting isn't complicated. It's disciplined. Almost every audit finding — mischarging, inadequate timekeeping, unallowable costs in pools — traces back to someone blurring the line between direct and indirect costs.

## The Definitions

**Direct cost** (FAR 31.202): any cost that can be identified specifically with a particular final cost objective — a contract, a task order, a project. Direct costs must be charged to that contract, not pooled.

**Indirect cost** (FAR 31.203): any cost not directly identified with a single contract. These are accumulated into pools and then allocated across contracts using an equitable allocation base.

The rule is simple: **if you can tie a cost to a specific contract, it goes direct. If you can't, it goes indirect.** The government hates costs moved from direct to indirect or vice versa after the fact.

## The Three Cost Categories You'll Use Every Day

<table>
  <thead>
    <tr><th>Category</th><th>Examples</th><th>Coded Where</th><th>What to Watch</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Direct Labor</strong></td>
      <td>Time spent by an employee working on a specific contract — drafting deliverables, attending contract meetings, performing the scope of work.</td>
      <td>To the contract/job number in the GL. Employee records this on their timesheet.</td>
      <td>Even two hours on a contract goes direct. "It wasn't worth coding" is not a valid reason to charge it indirect.</td>
    </tr>
    <tr>
      <td><strong>Direct Other Direct Costs (ODCs)</strong></td>
      <td>Travel to a contract site, subcontractor costs on a specific contract, materials purchased specifically for contract performance, equipment rentals tied to a task.</td>
      <td>To the contract/job number. Supported by receipts, purchase orders, or subcontract agreements referencing the contract.</td>
      <td>ODCs above a threshold need CO pre-approval in many contracts. Check your clauses before incurring large direct ODCs.</td>
    </tr>
    <tr>
      <td><strong>Indirect Costs</strong></td>
      <td>Office rent, utilities, accounting staff, HR, IT infrastructure, executive salaries, professional memberships, training not tied to a specific contract.</td>
      <td>To indirect pool accounts (fringe, overhead, G&amp;A). Allocated to contracts via the indirect rate calculation.</td>
      <td>Costs that benefit multiple contracts (or the whole business) go here. Never cherry-pick which contracts absorb more overhead.</td>
    </tr>
  </tbody>
</table>

## How Job-Cost Works in Practice

1. An employee works 6 hours on Contract A, 2 hours on overhead activities on a given day. She records 6h to "Contract A — Charge Code 001" and 2h to "Indirect — Overhead." Her timesheet is the source document.
2. At payroll, labor distribution runs: 6/8 of her daily cost goes to Contract A direct labor; 2/8 goes to the overhead pool.
3. The overhead pool accumulates all such indirect labor plus rent, utilities, and other indirect costs for the month.
4. At billing time, Contract A is invoiced for its direct labor, direct ODCs, and its share of the overhead pool computed using the provisional overhead rate.

## The Most Common Mischarging Patterns

- **Direct costs coded indirect**: An employee works on a contract but charges overhead because "it was easier." This understates the true cost of that contract and inflates overhead allocation on other contracts.
- **Indirect costs coded direct**: A rent payment or a company-wide software license gets charged to a specific contract's ODC line. This overstates that contract's costs and reduces overhead absorbed by other contracts — which can mean billing the government for costs they shouldn't pay.
- **Bid-and-proposal (B&P) costs coded as direct labor**: Time spent writing proposals is generally indirect (B&P). It belongs in G&A unless a specific contract explicitly funds proposal preparation.

<div class="callout callout--emerald">
  <div style="font-family:'IBM Plex Mono',monospace;font-size:8.5pt;font-weight:600;letter-spacing:0.16em;color:#047857;text-transform:uppercase;margin-bottom:2mm;">PRACTICAL RULE</div>
  <strong>When in doubt, charge it direct.</strong> It's much easier to defend a direct charge that later gets moved to overhead (with documentation) than to explain why an indirect charge should have gone direct when the auditor finds the contract work order six months later.
</div>
`
    },

    // ─── SECTION 4: TIMEKEEPING ───────────────────────────────────────────────────
    {
      type: "content",
      headerLabel: "S04 · TIMEKEEPING REQUIREMENTS",
      markdown: `<div class="eyebrow">SECTION 04 · TIMEKEEPING REQUIREMENTS</div>

# Daily recording. Employee certification. No exceptions.

Timekeeping is DCAA's entry point into your accounting system. In every pre-award accounting system survey, the auditor will test timekeeping first. If it fails, the entire cost pool is suspect — because if you can't show that labor costs went to the right job, you can't prove any cost is properly allocated.

## The Daily-Log Rule

DCAA's position, formalized in the Contract Audit Manual (CAM) and reinforced across hundreds of audit reports, is that employees on cost-type contracts must record their time **daily** — specifically, at the end of each workday or at the beginning of the following day.

Weekly timesheets reconstructed on Friday afternoon (or Monday morning) don't meet this standard. Neither do timesheets populated from a calendar or a to-do list. The test is: **can an employee explain, from memory or contemporaneous notes, how they spent their time on a given day?**

## What an Adequate Timekeeping System Requires

<table>
  <thead>
    <tr><th>Requirement</th><th>Acceptable</th><th>Not Acceptable</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Frequency</strong></td>
      <td>Daily recording — end of each workday or start of next</td>
      <td>Weekly, bi-weekly, or retroactive recording. "I always do it on Fridays" is a finding.</td>
    </tr>
    <tr>
      <td><strong>Who records</strong></td>
      <td>The employee who performed the work</td>
      <td>Supervisors recording on behalf of employees. Payroll staff allocating time from a project budget. Anyone other than the actual worker.</td>
    </tr>
    <tr>
      <td><strong>Who certifies</strong></td>
      <td>The employee who performed the work certifies their own timesheet</td>
      <td>Supervisors certifying employee timesheets. Anyone signing off on time they didn't personally record.</td>
    </tr>
    <tr>
      <td><strong>Corrections</strong></td>
      <td>Corrections made by the original employee, original entry visible (not deleted), reason for change documented, supervisor countersigns the correction</td>
      <td>Original entry overwritten. Supervisor making corrections without the employee's signature. No audit trail on the change.</td>
    </tr>
    <tr>
      <td><strong>Charge codes</strong></td>
      <td>Employee records time to a specific contract/job number and a specific labor category or task code</td>
      <td>Time charged to a department, a project manager's name, or "general work." Charge codes that don't map to a contract or overhead pool.</td>
    </tr>
    <tr>
      <td><strong>Floor check readiness</strong></td>
      <td>If an auditor walks up to an employee and asks "what are you working on right now and what job number are you charging?" the employee can answer immediately and correctly</td>
      <td>Employees who don't know their charge codes, who route the question to their supervisor, or who give a different answer than what's on their timesheet</td>
    </tr>
  </tbody>
</table>

## Timekeeping Policy Checklist

- [ ] Written timekeeping policy exists, is dated, and every employee has signed it
- [ ] Policy states employees must record time by end of workday
- [ ] Policy prohibits supervisors from recording or certifying employee time
- [ ] Correction procedure is documented (original visible, reason stated, supervisor countersign)
- [ ] Employees can identify their current charge codes without coaching
- [ ] Quarterly internal floor checks are conducted and results documented
- [ ] Time-recording system (whether software or paper) is described in writing
- [ ] Labor distribution report from payroll reconciles to timesheet system monthly

<div class="callout">
  <div class="eyebrow" style="margin-bottom:2mm;">REAL-WORLD NOTE</div>
  <p style="margin:0;">The most common timekeeping finding at small contractors isn't fraud — it's convenience. Employees fill out timesheets on Friday from memory, supervisors approve without reviewing charge codes, and nobody has touched the written policy since the company was founded. None of that is intentional. All of it creates audit exposure. A 30-minute all-hands once a year reviewing charge codes and why daily recording matters is cheap insurance.</p>
</div>
`
    },

    // ─── SECTION 5: INDIRECT RATE POOLS ──────────────────────────────────────────
    {
      type: "content",
      headerLabel: "S05 · INDIRECT RATE POOLS",
      markdown: `<div class="eyebrow">SECTION 05 · INDIRECT RATE POOLS</div>

# Fringe, Overhead, and G&A — the three pools almost every small contractor uses.

An indirect rate is how you spread overhead costs across contracts. You accumulate indirect costs into pools, choose an allocation base, and divide. The result is a rate (usually expressed as a percentage) that you apply to direct costs when you invoice.

## The Three Core Pools

<table>
  <thead>
    <tr><th>Pool</th><th>What Goes In</th><th>Common Allocation Base</th><th>Typical Rate Range</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Fringe Benefits</strong></td>
      <td>Payroll taxes (FICA, FUTA, SUTA), health insurance, dental, vision, life insurance, 401(k) employer match, paid leave (vacation, sick, holiday), workers' comp premiums.</td>
      <td>Total labor dollars (direct + indirect) — because fringe applies to all employees regardless of what they work on.</td>
      <td>25–40% of labor dollars. A company with rich health benefits and a 401(k) match can hit 45%.</td>
    </tr>
    <tr>
      <td><strong>Overhead</strong></td>
      <td>Costs that support direct performance but can't be tied to a specific contract: facilities costs allocated to project space, project management tools, project-level training, indirect labor supporting projects.</td>
      <td>Direct labor dollars or direct labor hours. Sometimes total direct costs if the overhead pool includes both labor and material support costs.</td>
      <td>15–80% of direct labor. Wide range because overhead structure varies dramatically by industry (services firms run lean; manufacturing firms run heavy).</td>
    </tr>
    <tr>
      <td><strong>G&amp;A (General and Administrative)</strong></td>
      <td>Business-sustaining costs not in fringe or overhead: executive salaries (to the extent allowable), accounting, finance, HR, IT infrastructure, legal, rent for admin office space, B&amp;P costs, proposal writing.</td>
      <td>Total cost input (TCI) — the sum of all direct costs plus fringe plus overhead. This spreads G&amp;A across the full cost of doing business, not just labor.</td>
      <td>10–25% of TCI for professional services firms. Can run higher for companies with heavy executive overhead.</td>
    </tr>
  </tbody>
</table>

## How to Compute a Rate

Rate formula: **Pool Total ÷ Allocation Base = Rate**

**Example**: A small IT services firm has:
- Fringe pool: $180,000
- Direct labor base: $600,000 (direct) + $200,000 (indirect labor) = $800,000
- **Fringe rate: $180,000 ÷ $800,000 = 22.5%**

Then overhead:
- Overhead pool: $90,000
- Direct labor base: $600,000
- **Overhead rate: $90,000 ÷ $600,000 = 15.0%**

Then G&A:
- G&A pool: $120,000
- Total cost input: $600,000 (direct labor) + $135,000 (fringe on direct labor at 22.5%) + $90,000 (overhead) + direct ODCs = ~$900,000 (simplified)
- **G&A rate: $120,000 ÷ $900,000 = 13.3%**

## Rate Pool Checklist

- [ ] Written pool definitions exist and list every cost type included and excluded
- [ ] Each pool has its own GL account series (e.g., 5000s for fringe, 6000s for overhead, 7000s for G&amp;A)
- [ ] Unallowable costs have their own accounts within each pool and are excluded before rate computation
- [ ] Allocation bases are documented and applied consistently year-over-year
- [ ] Monthly rate actuals are compared to provisional billing rates — flag if drift exceeds 5 percentage points
- [ ] Rates are included in the annual Incurred Cost Submission (ICS) Schedule H

<div class="callout callout--emerald">
  <div style="font-family:'IBM Plex Mono',monospace;font-size:8.5pt;font-weight:600;letter-spacing:0.16em;color:#047857;text-transform:uppercase;margin-bottom:2mm;">WATCH FOR THIS</div>
  <strong>Small contractors often underestimate their fringe rate.</strong> They budget health insurance and FICA, then forget paid leave. On a 40-hour work week with 10 federal holidays, 10 vacation days, and 5 sick days — that's 25 days of paid non-work, or roughly 10% of your total labor cost before you add a single benefit premium. When your fringe rate runs 8 points above what you bid, margin disappears fast.
</div>
`
    },

    // ─── SECTION 6: FAR PART 31 UNALLOWABLES ─────────────────────────────────────
    {
      type: "content",
      headerLabel: "S06 · FAR PART 31 UNALLOWABLES",
      markdown: `<div class="eyebrow">SECTION 06 · ALLOWABILITY PER FAR PART 31</div>

# The 10 unallowable costs that catch small contractors first.

FAR Part 31 defines what costs the government will reimburse on a cost-type contract. A cost is allowable only if it's reasonable, allocable, compliant with applicable accounting standards, and not specifically excluded by FAR 31.205. The list below is not comprehensive — FAR 31.205 has 52 subsections — but these are the ones that show up most often in DCAA audit findings against small contractors.

<table>
  <thead>
    <tr><th>#</th><th>FAR Citation</th><th>Cost Type</th><th>What's Unallowable</th><th>What's Often Allowed</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>1</strong></td>
      <td><strong>31.205-1</strong></td>
      <td>Advertising &amp; PR</td>
      <td>Ads designed to build general company image, brand advertising, press releases promoting the company. Sponsorships of community events with company logo placement.</td>
      <td>Recruitment advertising (job postings), trade show booth costs when directly tied to a specific program bid, required public notices under a contract.</td>
    </tr>
    <tr>
      <td><strong>2</strong></td>
      <td><strong>31.205-14</strong></td>
      <td>Entertainment</td>
      <td>Client dinners, holiday parties, sporting event tickets, golf outings, team celebrations. This is the most common unallowable found in small-contractor overhead pools — and the hardest to defend because "it was a business meal" doesn't work under FAR.</td>
      <td>Employee morale under 31.205-13 covers some company events narrowly — see the employee morale exception, which is limited and requires documentation.</td>
    </tr>
    <tr>
      <td><strong>3</strong></td>
      <td><strong>31.205-22</strong></td>
      <td>Lobbying</td>
      <td>Time or money spent influencing legislation, regulatory rulemaking, or federal contract awards through non-procurement channels. Includes membership fees to trade associations that primarily lobby, when attributable to lobbying activities.</td>
      <td>Responding to a Congressional inquiry under a contract. Trade association dues when the lobbying portion is tracked and excluded.</td>
    </tr>
    <tr>
      <td><strong>4</strong></td>
      <td><strong>31.205-8</strong></td>
      <td>Donations &amp; contributions</td>
      <td>Charitable contributions, donations to nonprofits, sponsorships of causes. Zero allowable regardless of the cause or business rationale.</td>
      <td>Nothing in this category is allowable under cost-type contracts. Keep a dedicated GL account so DCAA doesn't have to go looking for them.</td>
    </tr>
    <tr>
      <td><strong>5</strong></td>
      <td><strong>31.205-6(p)</strong></td>
      <td>Executive compensation above benchmark</td>
      <td>Compensation paid to an officer, director, or key employee above the OPM benchmark published annually. The FY2024 benchmark is $680,000. Any amount above this is unallowable on contracts subject to 31.205-6(p) — primarily DoD, NASA, and Coast Guard.</td>
      <td>Compensation up to the benchmark. Compensation on civilian agency contracts not subject to the cap (though still must be reasonable under 31.201-3).</td>
    </tr>
    <tr>
      <td><strong>6</strong></td>
      <td><strong>31.205-47</strong></td>
      <td>Legal fees — fraud/criminal defense</td>
      <td>Attorney fees incurred defending charges of fraud, false claims, antitrust violations, or criminal conduct against the government. Even if you're acquitted, these costs are unallowable.</td>
      <td>Legal fees for normal contract disputes, patent advice, employment law, and other routine legal matters.</td>
    </tr>
    <tr>
      <td><strong>7</strong></td>
      <td><strong>31.205-27</strong></td>
      <td>Organization costs</td>
      <td>Costs associated with forming, reorganizing, or restructuring the company: incorporation fees, stock issuance costs, corporate restructuring legal fees.</td>
      <td>Routine legal retainer costs for ongoing business counsel (as long as they're reasonable and allocated correctly).</td>
    </tr>
    <tr>
      <td><strong>8</strong></td>
      <td><strong>31.205-3</strong></td>
      <td>Bad debts</td>
      <td>Write-offs of uncollectible receivables and associated collection costs. This includes reserves for doubtful accounts — even if they never become bad debts, the reserve itself is unallowable until the debt is actually written off, and then the write-off itself is unallowable.</td>
      <td>None in this category. Separate these accounts from allowable costs entirely.</td>
    </tr>
    <tr>
      <td><strong>9</strong></td>
      <td><strong>31.205-20</strong></td>
      <td>Interest and financial costs</td>
      <td>Interest on borrowings, bank fees on lines of credit, finance charges on leases treated as capital leases. This catches small contractors who finance equipment purchases and include the interest in overhead.</td>
      <td>Bank charges for routine checking account services. Costs of letters of credit specifically required by a contract. FCCM (facility capital cost of money) computed per CAS 414 — not interest, but a cost of capital that is separately allowable.</td>
    </tr>
    <tr>
      <td><strong>10</strong></td>
      <td><strong>31.205-51</strong></td>
      <td>Costs of whistleblower proceedings</td>
      <td>Legal fees and settlement costs related to contractor retaliation against a whistleblower under the National Defense Authorization Act or FAR 3.903. Added in 2013 and still catches companies by surprise.</td>
      <td>Proactive legal compliance costs (training, ethics hotline, policies) are generally allowable under 31.205-27 or as G&amp;A overhead.</td>
    </tr>
  </tbody>
</table>

## How to Protect Your Pools

- [ ] Dedicated GL accounts for each unallowable category (entertainment: 6901, lobbying: 6902, donations: 6903, etc.)
- [ ] Annual review of GL accounts by the controller to confirm unallowable accounts are excluded from pool calculations
- [ ] ICS Schedule N lists every unallowable account with dollar amounts
- [ ] Employees know they cannot code entertainment to overhead — training is documented

<div class="callout callout--emerald">
  <div style="font-family:'IBM Plex Mono',monospace;font-size:8.5pt;font-weight:600;letter-spacing:0.16em;color:#047857;text-transform:uppercase;margin-bottom:2mm;">THE $50 LUNCH RULE</div>
  <strong>There is no such thing as an allowable client dinner under FAR 31.205-14.</strong> "It was a working lunch" doesn't change the classification. Many small contractors run $15,000–$40,000 a year in entertainment costs through overhead without realizing it. On a cost-type contract with a 15% G&amp;A rate, that's a significant questioned cost when DCAA pulls the credit card statements.
</div>
`
    },

    // ─── SECTION 7: WHEN TO HIRE ──────────────────────────────────────────────────
    {
      type: "content",
      headerLabel: "S07 · WHEN TO HIRE A SPECIALIST",
      markdown: `<div class="eyebrow">SECTION 07 · WHEN TO HIRE A DCAA-EXPERIENCED BOOKKEEPER</div>

# Three signals that mean it's time to bring in specialist help.

Most small contractors do fine with a general bookkeeper through their first fixed-price and T&M contracts. The accounting requirements are similar to commercial work — track income, track expenses, reconcile the bank accounts. But cost-type government contracts require a different discipline. The moment you cross into cost-reimbursement territory, your accounting function needs to know government cost accounting, not just GAAP.

Here are the three contract events that reliably signal it's time to upgrade.

## Signal 1: You're Pursuing a Cost-Reimbursement Contract Above $750,000

At this threshold, a CO is likely to request a pre-award accounting system survey before award. That means DCAA will contact your accounting team directly, ask for your policies and procedures, walk through the SF 1408 checklist, and potentially conduct a floor check.

If your current bookkeeper has never heard of SF 1408, doesn't know what a fringe pool is, or can't explain how your labor distribution works — you will fail that survey. Award will be delayed or denied until you remediate the findings.

**What to do**: Hire or contract with a government accounting consultant (not just a CPA — find one with government contractor experience) before the CO requests the survey. Give them 60–90 days to review your system, document your policies, and make the necessary chart-of-accounts changes.

## Signal 2: You're Filing Your First Incurred Cost Submission

The Incurred Cost Submission (ICS) is required under FAR 52.215-2 on cost-type contracts. It's due six months after your fiscal year-end. It covers multiple schedules (A through S) of the DCAA ICE Model and requires your indirect cost rates reconciled to your financial statements and general ledger.

A general bookkeeper who has never prepared an ICS will likely miss schedules, misclassify unallowable costs, or fail to reconcile the trial balance properly. The result is a qualified submission, a rejection, or a 12-month delay in final rate settlement.

**What to do**: Bring in a government-specific accounting firm or a CPA with ICS experience no later than Q3 of your first year of cost-type performance — while there's still time to run test reconciliations and fix issues before the filing deadline.

## Signal 3: DCAA Schedules an Entrance Conference

If DCAA sends you a written notification of an upcoming audit (billing system, accounting system, or incurred cost audit), you typically have 30–60 days before fieldwork begins. That window is not time to react — it's time to prepare.

**What to do**: Immediately engage a DCAA-experienced consultant or attorney. Have them review your ICS submission, your timekeeping records, and your GL against the specific audit type DCAA has announced. Findings that are identified internally and remediated before fieldwork are treated very differently than findings DCAA discovers on their own.

## What to Look for When Hiring

<table>
  <thead>
    <tr><th>Qualification</th><th>Why It Matters</th><th>How to Verify</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Government contractor experience (not just government experience)</strong></td>
      <td>A bookkeeper who worked at a federal agency knows procurement, not cost accounting. You need someone who has supported a federal contractor's DCAA audits.</td>
      <td>Ask: "Have you prepared an ICS? Have you supported a pre-award accounting system survey? What accounting software have you used for government contractor cost accounting?"</td>
    </tr>
    <tr>
      <td><strong>Familiarity with FAR 31.205 unallowable cost categories</strong></td>
      <td>If they can't name five unallowable cost types off the top of their head, they haven't done this work regularly.</td>
      <td>Ask them to walk you through the GL accounts they would set up for unallowable costs. If they're vague, keep looking.</td>
    </tr>
    <tr>
      <td><strong>Experience with Deltek, Unanet, or JAMIS</strong></td>
      <td>These are the three government-contractor accounting platforms that DCAA is familiar with and that support job-cost tracking, labor distribution, and ICS schedule generation natively.</td>
      <td>Verify platform certifications or references from other government contractor clients who used the same system.</td>
    </tr>
    <tr>
      <td><strong>References from other government contractors</strong></td>
      <td>A DCAA audit is not the time to discover your accountant learned government cost accounting from a book. Ask for references from clients who have passed accounting system surveys or incurred cost audits.</td>
      <td>Call two or three references and ask specifically: "Did DCAA audit this contractor while your firm was engaged? What was the outcome?"</td>
    </tr>
  </tbody>
</table>

## The Cost Reality

A DCAA-experienced bookkeeper or controller costs more than a commercial bookkeeper — typically $35–$65/hour for fractional support, or $90,000–$130,000 for a full-time government contractor controller. That sounds steep until you compare it to the alternative: a failed accounting system survey that delays a $2 million contract award by 90 days costs far more than the premium.

- [ ] Identified at least two government contractor accounting firms in your region (or virtual) before your first cost-type proposal
- [ ] Confirmed your current bookkeeper has prepared at least one ICS filing
- [ ] Scheduled a gap assessment of your accounting system before the first DCAA contact
- [ ] Budget line for accounting system remediation included in your first year's overhead pool

<div class="callout">
  <div class="eyebrow" style="margin-bottom:2mm;">THE BOTTOM LINE</div>
  <p style="margin:0;">A government-experienced accountant is not a luxury on cost-type contracts. It's a compliance requirement with a dollar value attached. You wouldn't bid a cybersecurity contract without a CISSP. Don't execute a cost-plus contract without someone on your team who knows what a provisional billing rate is and how to reconcile it to actual costs at year-end.</p>
</div>
`
    },

    // ─── BACK COVER ─────────────────────────────────────────────────────────────
    {
      type: "back-cover",
      eyebrow: "WHAT'S NEXT",
      headline: "Your first cost-type contract shouldn't be your last.",
      accentWord: "last",
      body: "CapturePilot flags cost-reimbursement opportunities, scores your readiness, and connects you to vetted government accounting consultants — before DCAA schedules the entrance conference. Free 14-day trial. No card.",
      ctaText: "Start free trial →",
      ctaUrl: "https://capturepilot.com/signup",
      footerLabel: "CAPTUREPILOT · POST-AWARD COMPLIANCE"
    }
  ]
};

// ─── RENDER ──────────────────────────────────────────────────────────────────
async function main() {
  await mkdir(resolve(DEPLOY, ".."), { recursive: true });
  console.log("Rendering DCAA Accounting Basics PDF…");
  await renderPdf({ config, outputPath: DEPLOY });
  const { stat } = await import("node:fs/promises");
  const { size } = await stat(DEPLOY);
  console.log(`✓ Written: ${DEPLOY}`);
  console.log(`  Size: ${(size / 1024).toFixed(1)} KB`);
}

main().catch((err) => { console.error(err); process.exit(1); });
