#!/usr/bin/env node
/**
 * Smoke-test: run source-tuned structured-requirements extraction on 10 real opps.
 * Uses OpenAI directly (gpt-4o-mini, JSON mode) with prompts inlined from
 * src/lib/structured-requirements/{federal,state,county,city}.ts
 *
 * Run: node scripts/smoke-extract-structured-reqs.mjs
 * Output: scripts/.smoke-out.json
 */

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// ── Load .env.local ──────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env.local");
const envFile = readFileSync(envPath, "utf-8");
for (const line of envFile.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)="?([^"]*)"?$/);
  if (m) process.env[m[1]] = m[2];
}

// Use DeepSeek if available (OpenAI-compatible), fall back to OpenAI
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const LLM_KEY = DEEPSEEK_API_KEY || OPENAI_API_KEY;
const LLM_BASE = DEEPSEEK_API_KEY
  ? "https://api.deepseek.com/v1"
  : "https://api.openai.com/v1";
const LLM_MODEL = DEEPSEEK_API_KEY ? "deepseek-chat" : "gpt-4o-mini";
if (!LLM_KEY) throw new Error("Neither DEEPSEEK_API_KEY nor OPENAI_API_KEY found in .env.local");
console.log(`Using ${DEEPSEEK_API_KEY ? "DeepSeek" : "OpenAI"} (${LLM_MODEL}) via ${LLM_BASE}`);

// ── Hardcoded 10 opps (fetched via Supabase MCP) ────────────────────────────
// 4 SAM (federal), 3 SLED-state, 2 SLED-city, 1 SLED-city (Queens — short desc, included for completeness)
const OPPS = [
  {
    id: "23ae20c7-f947-498c-9b0b-4fc0e9456db5",
    title: "6515--CHEYENNE VAMC EMERGENCY DEPT - PATIENT LIFTS",
    source: "sam",
    jurisdiction_level: null,
    agency: "VETERANS AFFAIRS, DEPARTMENT OF",
    naics_code: "339113",
    set_aside_code: "",
    description: `Sources Sought Notice CHEYENNE VAMC EMERGENCY DEPT - PATIENT LIFTS DISCLAIMER This RFI is issued solely for information and planning purposes only and does not constitute a solicitation. All information received in response to this RFI that is marked as proprietary will be handled accordingly. In accordance with FAR 15.201(e), responses to this notice are not offers and cannot be accepted by the Government to form a binding contract. Responders are solely responsible for all expenses associated with responding to this RFI. Response Instructions: Do not provide more than 8 pages, including cover letter page. Submit your response via email to: barron.long@va.gov Submit your response NLT 12:00 (Local Mountain Time) on Thursday March 19th Mark your response as Proprietary Information if the information is considered business sensitive. VA has identified the appropriate North American Industry Classification System (NAICS) Code 339113 Surgical and Medical Instrument Manufacturing with a Small Business size of 800 employees. Please identify and explain any NAICS codes your company believes would better represent the predominated work included in the attached Statement of Work draft / Salient Characteristics List; Information Requested from Industry: In response to the Sources Sought, interested Contractors shall submit the following information and any Capabilities/Qualifications Statement to include but not limited to an overview of proposed solution(s) and a description of the product your company possesses in accordance with the Statement of Work draft / Salient Characteristics List. Vendor Name: SAM UEI #: Name of Manufacturer: Manufacturer Address: Manufacturing Country of Origin Estimated Delivery Time: SAC FSS contract number Vendor Point of Contract (POC) Name POC Phone Number: POC Email Address:`,
  },
  {
    id: "71b9aee3-7c19-4b94-a0a3-939d5879f3d9",
    title: "NOZZLE ASSEMBLY,FUE",
    source: "sam",
    jurisdiction_level: null,
    agency: "DEPT OF DEFENSE",
    naics_code: "336412",
    set_aside_code: null,
    description: `Synopsis FD2030-25-1302_01 1. Estimated issue date 11 SEP 2025 and estimated closing/response date 16 OCT 2025. 2. RFP #: SPRTA1-25-R-0431 3. Contracting Office Address: 3001 Staff Drive Tinker AFB, OK 73145 4. PR#: FD2030-25-1302_01 5. Nomenclature/Noun: NOZZLE ASSEMBLY,FUE 6. NSN: 2915-00-655-1933 OJ 7. PN: 75538 8. Application (Aircraft): T56 Turboprop engine 9. AMC: 3/B 10. History: Last 2 Buys- 1.Contract number- SPRTA123P0055 Award Date 24 May 2023 to COLLINS ENGINE NOZZLES, INC. 2. Contract number- SPRTA121C0032 Award Date 22 Jul 2021 to COLLINS ENGINE NOZZLES, INC 11. Description: Provides Fuel for combustion. 12. Dimensions: 6.0000 in. long X 2.2500 in. wide X 2.2500 in. high, weighing 1.0000 lbs. 13. Material: Source Controlled 14. A firm fixed price contract is contemplated. The item, estimated quantities and required deliveries are as follows: Quantity: 114 each LINE ITEM 0001 NOZZLE ASSEMBLY,FUE a) Destination: DSR004 b) Delivery 1: 24 EA ON OR BEFORE 12 AUG 2026. c) Required Quantity: 24 each LINE ITEM 0002 NOZZLE ASSEMBLY,FUE a) Destination: DSR004 b) Delivery 1: 24 EA ON OR BEFORE 12 AUG 2026. c) Required Quantity: 24 each LINE ITEM 0003 NOZZLE ASSEMBLY,FUE a) Destination: DEC005 b) Delivery 1: 4 EA ON OR BEFORE 12 AUG 2026. c) Required Quantity: 4 each LINE ITEM 0003AA NOZZLE ASSEMBLY,FUE a) Destination: DSR004 b) Delivery 1: 50 EA ON OR BEFORE 12 AUG 2026. c) Required Quantity: 50 each LINE ITEM 0003AB NOZZLE ASSEMBLY,FUE a) Destination: DSR004 b) Delivery 1: 12 EA ON OR BEFORE 12 AUG 2026. c) Required Quantity: 12 each 15. Qualified Sources: COLLINS ENGINE NOZZLES, INC. (Cage: 71895) 16. Set-aside: No Set-aside 17. Critical Safety Item (CSI) applicability: CSI criteria does APPLY to this item. 18. Mandatory Language: Electronic procedures will be used for this solicitation. Only written or faxed requests received directly from the requestors are acceptable. 19. Justification: Supplies (or Services) required are available from only one or a limited number of responsible sources(s) and no other type of supplies or services will satisfy agency requirements. 20. All responsible sources may submit a capability statement, proposal, or quotation which shall be considered by the agency. One or more of the items under this acquisition is subject to Free Trade Agreements. 21. Based upon market research, the Government IS using the policies contained in Far Part 12, Acquisition of Commercial Items, in its solicitation for the described supplies or services. 22. Item Unique Identification (IUID): Yes 23. Export Control DOES NOT apply. 24. Anticipated Award date: estimated 45 calendar days after solicitation closing date 25. The solicitation will be available for download on the release date from www.sam.gov.`,
  },
  {
    id: "3575d63e-356c-4646-aa2b-3b2a7212091e",
    title: "AMG Spares in Support of the Mast Group, Hydraulic-Pneumatic OA-9054(V)4/G",
    source: "sam",
    jurisdiction_level: null,
    agency: "DEPT OF DEFENSE",
    naics_code: "334220",
    set_aside_code: "Total Small Business Set-Aside (FAR 19.5)",
    description: `The Defense Logistics Agency-Aberdeen, on behalf of the Army Integrated Logistics Supply Center (ILSC) – Supply Chain Management Directorate (SCMD) – Strategic Sourcing Directorate (SSD), intends to acquire Parts to support the CECOM Mast Group, Hydraulic-Pneumatic OA-9054(V)4/G (AMG).This Request for Proposal (RFP) will be a small business set-aside and will result in a Firm Fixed Price (FFP) Indefinite Delivery/Indefinite Quantity (ID/IQ) contract, Long-Term Contract (LTC), consisting of one five-year base period with no option years. Note: This RFP is a total (100%) small business set aside. This acquisition is for the procurement of fourteen (14) spare parts to support the CECOM Mast Group, Hydraulic-Pneumatic OA-9054(V)4/G (AMG). The guaranteed minimum for the resultant contract will be $25,000. The maximum contract value for all award(s) single and combined is $13,000,000. This is a five-year base contract and no option period of performance contract. This procurement will require First Article Testing (FAT) by the contractor, unless waived by CECOM. FAR 52.209-3 "First Article Approval - Contractor Testing" has been incorporated into Section I to provide FAT instructions. This acquisition will be conducted in accordance with FAR Part 15 Contract by Negotiation. Evaluation of proposals will utilize the Tradeoff method. The technical data package (TDPs) for these NSN are subject to the International Traffic in Arms Regulations (ITAR). All technical documents include but not limited to, test plans, test reports, drawings and specifications contain information that is subject to the controls defined in the International Traffic in Arms Regulation (ITAR). This information shall not be provided to non-U.S. persons or transferred by any means to any location outside the United States Department of State. A company wishing to receive the TDPs must have an active status in the Defense Logistics Agency Joint Certification Program (JCP).`,
  },
  {
    id: "7714551d-00d2-4ce4-ae43-e1e6428a9e85",
    title: "IT Operational Support Services IDIQ",
    source: "sam",
    jurisdiction_level: null,
    agency: "LIBRARY OF CONGRESS",
    naics_code: "5182",
    set_aside_code: "No Set aside used",
    description: `Amendment 0001: The purpose of this amendment is to extend the submission deadline for Phase One to 01/05/2026 at 12:00 PM EST. Amendment 0002: The purpose of this amendment is to provide answers to questions received in response to the solicitation and update sections J, L, M. Amendment 0003: The purpose of this amendment is to update the submission date for Phase II questions and proposals, update the font size for Phase II proposals, and update Section J to provide a template to use for submitting questions. Amendment 0004: The purpose of this amendment is to update the tentative Phase II submission date and update Section L.2.6.B.1 and L.2.6.E.1. Advisory recommendation letters and Phase II Q&A are planned to be distributed by 03/06/2026. Amendment 0005: The purpose of this amendment is to update Sections J, L and M to add an initial task order for Operational Support, update Attachment J4 - Data Network Support and Attachment J5 - Initial Order Pricing Sheet, update the submission date for Phase II proposals, add a question due date for the Operational Support task order, and provide a response to Phase II questions. The Library of Congress (Library) requires contract support for the operation and maintenance of IT systems, keeping IT systems viable with supported vendor releases or off-the-shelf applications software upgrades. Operations and maintenance on IT systems will include all network, software and infrastructure associated with on-premises and cloud deployed systems and applications to include client/server, database, and web-based applications. Please review the attached solicitation (030ADV26R0008) for additional details on the requirements, how to submit a proposal, and what to include in your proposal. Please note the deadlines in Section L of the solicitation for submitting questions and proposals.`,
  },
  // SLED state (3)
  {
    id: "80625f9a-bf0e-4bb6-8350-0a3e5336907d",
    title: "City Park Parking Lot Expansion",
    source: "sled",
    jurisdiction_level: "state",
    agency: "M0098",
    naics_code: "236220",
    set_aside_code: null,
    description: `1. Purpose\n The City of Liberty Hill, herein after "City", seeks to enter into an agreement with a qualified Individual, Firm or Corporation, herein after "Respondent", to provide construction services for the delivery of the of the City Park parking lot expansion.\n 2. Background\n To furnish, install and provide all labor and materials required for the construction of approximately 103,900 SF concrete parking, 18,400 SF of concrete sidewalk, curb ramps, site lighting, earthwork, landscaping/irrigation, erosion control, and other items, as more fully described in the Construction Plans and Project Specifications.\n 3. Project Firm and Plans\n The design and construction management services for the Project are being provided by Kimley-Horn and Associates, Inc. 5301 Southwest Parkway Building 2, Suite 100 Austin, Texas 78746.`,
  },
  {
    id: "1dced0cf-8683-46cb-87a2-0e51644b8703",
    title: "Fairfax Software Maintenance and Related Services",
    source: "sled",
    jurisdiction_level: "state",
    agency: "Texas Comptroller of Public Accounts",
    naics_code: "541511",
    set_aside_code: null,
    description: `Solicitation ID: 304-27-1423PC Status: Addendum Posted Contact Name: Philip Chaimongkol Contact Email: Philip.Chaimongkol@cpa.texas.gov Response Due Date: 6/11/2026 Response Due Time: 2:00 PM Agency/Texas SmartBuy Member Number: 304 Solicitation Description: The Texas Comptroller of Public Accounts ("CPA"), an agency of the State of Texas, issues this Request for Offers ("RFO") to solicit Offers from qualified vendors for Fairfax Software Maintenance, Hardware and Related Services. CPA's objective is to obtain the Services that represent the best value for CPA and the State of Texas, according to the terms and conditions of this RFO. CPA anticipates making a contract award to one (1) Successful Respondent for the Services. CPA reserves the right not to award a Contract for the performance of all or part of the Services. This RFO is not exclusive and CPA reserves the right to issue additional solicitations regarding the Services or similar services at any time. All Respondents are encouraged to offer their best pricing at all times. All costs associated with the Services must be included in the Respondent's Offer. Offers that do not meet all of the requirements or contain all of the required documentation specified in this RFO may be rejected as non-responsive. CPA understands that the requested items in this RFO may be proprietary to one vendor under Section 2155.067 of the Texas Government Code; however, CPA strongly encourages Offers from all qualified Respondents that may be able to provide the Services. CPA Official Response to Vendor Questions posted 5/28/2026.`,
  },
  {
    id: "c558ab7c-b197-4e2f-9afe-a8cd5033fdff",
    title: "Electronic Postage Services",
    source: "sled",
    jurisdiction_level: "state",
    agency: "Texas A&M AgriLife",
    naics_code: "541990",
    set_aside_code: null,
    description: `REQUEST FOR PROPOSAL #AG-EXT-RFP-7083 ELECTRONIC POSTAGE SERVICES QUESTIONS DEADLINE: FRIDAY, MAY 15, 2026, AT 5:00 P.M. (CENTRAL TIME) HUB SUBCONTRACTING PREPROPOSAL WEBINAR: THURSDAY, MAY 14, 2026, AT 2:00 P.M. (CENTRAL TIME) CLOSING DATE/SUBMISSION DEADLINE: FRIDAY, MAY 29, 2026, AT 3:00 P.M. (CENTRAL TIME) All documentation for this Request for Proposal (RFP) is available on our AggieBid site. Vendors must register as a bidder within AggieBid to respond to this solicitation electronically. Vendors are highly encouraged to register as a bidder early to ensure any registration difficulties don't result in the inability to submit a response. IT IS THE RESPONSIBILITY OF INTERESTED VENDORS TO REGULARLY CHECK THE AGGIEBID SITE FOR ANY POSSIBLE ADDENDA(S) TO THIS RFP. This notification is the only documentation that will be posted to the Electronic State Business Daily (ESBD). Please refer to AggieBid for all documentation related to this RFP. The Texas A&M AgriLife Procurement Office appreciates your interest in this project.`,
  },
  // SLED city (3)
  {
    id: "94998192-41d2-41f1-8d51-d768ac0ea13c",
    title: "PV291-QM2 - Queens Museum Expansion Phase 2",
    source: "sled",
    jurisdiction_level: "city",
    agency: "Design and Construction",
    naics_code: null,
    set_aside_code: null,
    description: `Responses to this CSB must be submitted via PASSPort. To access the solicitation, vendors should visit the PASSPort Public Portal. Click on the Search Funding Opportunities in PASSPort blue box. This will take you to the Public Portal of all procurements in the PASSPort system. To quickly locate the CSB, insert the EPIN (85026B0080) into the Keywords search field. Please note, this link is only for NON-PQL projects. For PQL projects, only certified vendors will receive the solicitations.`,
  },
  {
    id: "dc1df686-41b2-4804-8201-84e13dce1739",
    title: "Correction: 05626Y0242-2030PV Pro UV-vis-NIR Microspectrophotometer",
    source: "sled",
    jurisdiction_level: "city",
    agency: "New York City Police Department",
    naics_code: null,
    set_aside_code: null,
    description: `Pursuant to Section 3-05 of the NYC Procurement Policy Board Rules, it is the intent of the New York City Police Department (NYPD) to enter into sole source negotiations with Craic Technologies, Inc. with the expectation that the vendor will be awarded a contract with the NYPD to provide a brand-specific 2030PV Pro UV-vis-NIR Microspectrophotometer (MSP). The contract will provide for the manufacture and delivery of one MSP to the Criminalistics Section of the Police Laboratory at 150-14 Jamaica Ave., Rm 322, Jamaica, NY 11432. This instrument will be utilized to compare fibers transferred between a victim and a suspect. Craic Technologies is the sole manufacturer of the MSP. This instrument is proprietary equipment and Craic Technologies owns the copyrights to its design specifications. The NYPD is of the belief that because the instrument is proprietary and copyrighted, Craic Technologies is the only vendor legally authorized to provide this specialized item. Any vendor besides Craic Technologies that believes that it can provide the MSP to the NYPD is invited to do so.`,
  },
  {
    id: "29f6f1d1-4fb8-4918-9722-b37e2142960f",
    title: "VERTICAL CLEARANCE IMPROVEMENTS / S. LOOMIS ST. -ELEANOR ST. TO ARCHER AVE.",
    source: "sled",
    jurisdiction_level: "city",
    agency: "CHICAGO DEPARTMENT OF TRANSPORTATION",
    naics_code: "237310",
    set_aside_code: null,
    description: `City of Chicago Contracts Administration. Contracts and modifications awarded by the City of Chicago since 1993. This data is currently maintained in the City's Financial Management and Purchasing System (FMPS). VERTICAL CLEARANCE IMPROVEMENTS / S. LOOMIS ST. - ELEANOR ST. TO ARCHER AVE. This is a construction contract for vertical clearance improvements on South Loomis Street between Eleanor Street and Archer Avenue in Chicago, Illinois. The contract involves roadway construction, infrastructure improvements, and related work required for the vertical clearance project. Standard contract terms apply including performance requirements, bonding requirements, and prevailing wage compliance under Illinois law. Contract Type: Standard construction contract. The contract award amount and vendor name are tracked in the City's Financial Management and Purchasing System.`,
  },
];

// ── HTML stripper ────────────────────────────────────────────────────────────
function stripHtml(s) {
  if (!s) return "";
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Prompts (inlined from federal.ts / state.ts / county.ts / city.ts) ──────

const FEDERAL_SYSTEM = `You are a US federal capture-management analyst. You read a SAM.gov solicitation
(synopsis description + attached documents) and produce a STRUCTURED requirements
breakdown that a small-business proposal team will use to draft a response.

CORE RULES
- Only extract facts SUPPORTED BY THE TEXT. Never invent. Never paraphrase a
  requirement into something it doesn't say.
- "scope_of_work": 3-8 short bullet phrases — the discrete work tasks being procured.
- "qualifications": prime-team qualifications the offeror MUST hold (clearances,
  past-performance thresholds, key personnel certs, registrations).
- "required_certifications": named technical/quality certifications cited verbatim
  (ISO 9001, CMMC L2, SOC 2, FedRAMP, ITAR, OSHA-30, etc.). Quote exact names.
- "deliverables": named artifacts/reports the contractor must produce.
- "period_of_performance": one short phrase or null.
- "contract_type": FFP | T&M | CPFF | CPIF | IDIQ | BPA | GSA Schedule | null.
- "evaluation_factors": ordered list of selection factors with any weightings.
- "bid_bond_pct" / "performance_bond_pct": integer % if bond required, else null.
- "pre_bid_meeting": {date, mandatory, location} or null.
- "local_preference": true only when text gives explicit preference to local vendors.
- "diversity_requirements": set-aside designations cited in body. [] if open competition.

RESPONSE FORMAT: Return ONLY a JSON object with these exact keys. Use [] for empty
arrays. Use null for unknown optional scalars. Never add extra keys. Never wrap in markdown.`;

const SLED_STATE_SYSTEM = `You are a state-government procurement analyst. You read a state-level solicitation
and produce a STRUCTURED requirements breakdown for a vendor responding to the RFP/RFO/IFB.

CORE RULES
- Only extract facts SUPPORTED BY THE TEXT.
- "scope_of_work": 3-8 short bullet phrases — the discrete deliverables or work tasks.
- "qualifications": mandatory vendor qualifications (licenses, certifications, years of experience,
  state-specific vendor registrations, HUB/DBE/MBE/WBE/SBE requirements).
- "required_certifications": named technical/quality certifications cited verbatim.
- "deliverables": named artifacts/reports the vendor must produce.
- "period_of_performance": one short phrase or null.
- "contract_type": FFP | T&M | IDIQ | BPA | Term Contract | null.
- "evaluation_factors": ordered list of selection factors (technical approach, pricing,
  HUB subcontracting, past performance). Include LPTA or Best Value hints if present.
- "bid_bond_pct" / "performance_bond_pct": integer % if bond required, else null.
- "pre_bid_meeting": {date, mandatory, location} or null.
- "local_preference": true only when text gives explicit in-state vendor preference.
- "diversity_requirements": state diversity program requirements cited (HUB, MBE, WBE, DBE,
  SBE, SDVBE, ACDBE, etc.). [] if none mentioned.

RESPONSE FORMAT: Return ONLY a JSON object with these exact keys. Use [] for empty
arrays. Use null for unknown optional scalars. Never add extra keys. Never wrap in markdown.`;

const SLED_COUNTY_SYSTEM = `You are a county/regional-government procurement analyst. You read a county-level
solicitation (RFP, IFB, RFQ, or bid notice) and produce a STRUCTURED requirements
breakdown for a vendor responding to the procurement.

CORE RULES
- Only extract facts SUPPORTED BY THE TEXT.
- "scope_of_work": 3-8 short bullet phrases — the discrete work tasks or deliverables.
- "qualifications": mandatory vendor qualifications (contractor license class, bonding,
  insurance minimums, DBE/MBE/WBE/SBE requirements, years experience).
- "required_certifications": named technical/quality certifications cited verbatim.
- "deliverables": named artifacts the vendor must produce or submit.
- "period_of_performance": one short phrase or null.
- "contract_type": FFP | T&M | Unit Price | IDIQ | null.
- "evaluation_factors": selection factors (lowest responsible bid, best value, past perf, etc.).
- "bid_bond_pct" / "performance_bond_pct": integer % if bond required (common: bid 5-10%,
  performance 100%). null if not required.
- "pre_bid_meeting": {date, mandatory, location} or null.
- "local_preference": true only when text gives explicit preference to local/county vendors.
- "diversity_requirements": county diversity program requirements (DBE, MBE, WBE, MWBE,
  SDBE, Section 3, etc.). [] if none mentioned.

RESPONSE FORMAT: Return ONLY a JSON object with these exact keys. Use [] for empty
arrays. Use null for unknown optional scalars. Never add extra keys. Never wrap in markdown.`;

const SLED_CITY_SYSTEM = `You are a city/municipal-government procurement analyst. You read a city-level
solicitation (RFP, IFB, CSB, RFQ, or bid notice) and produce a STRUCTURED requirements
breakdown for a vendor responding to the procurement.

CORE RULES
- Only extract facts SUPPORTED BY THE TEXT.
- "scope_of_work": 3-8 short bullet phrases — the discrete work tasks or deliverables.
- "qualifications": mandatory vendor qualifications (business license, bonding, insurance,
  MWBE/M/WBE certification requirements, prevailing wage compliance, Section 3).
- "required_certifications": named technical/quality certifications cited verbatim.
- "deliverables": named artifacts the vendor must produce or submit.
- "period_of_performance": one short phrase or null.
- "contract_type": FFP | T&M | Unit Price | IDIQ | Construction | null.
- "evaluation_factors": selection factors (lowest bid, best value, MWBE goals,
  experience, references, etc.).
- "bid_bond_pct" / "performance_bond_pct": integer % if bond required. null if not.
- "pre_bid_meeting": {date, mandatory, location} or null.
- "local_preference": true only when text gives explicit preference to local vendors.
- "diversity_requirements": city diversity requirements (MWBE, M/WBE, Section 3,
  SDVBE, EBE, LBE, etc.) with goal percentages if stated. [] if none mentioned.

RESPONSE FORMAT: Return ONLY a JSON object with these exact keys. Use [] for empty
arrays. Use null for unknown optional scalars. Never add extra keys. Never wrap in markdown.`;

const SCHEMA_HINT = `{
  "scope_of_work": ["string", "..."],
  "qualifications": ["string", "..."],
  "required_certifications": ["string", "..."],
  "deliverables": ["string", "..."],
  "period_of_performance": "string or null",
  "contract_type": "string or null",
  "evaluation_factors": ["string", "..."],
  "bid_bond_pct": null,
  "performance_bond_pct": null,
  "pre_bid_meeting": { "date": null, "mandatory": false, "location": null },
  "local_preference": false,
  "diversity_requirements": ["string", "..."]
}`;

// ── Pick system prompt by jurisdiction ──────────────────────────────────────
function systemPromptFor(opp) {
  if (opp.source === "sam") return FEDERAL_SYSTEM;
  const jl = (opp.jurisdiction_level || "").toLowerCase();
  if (jl === "state") return SLED_STATE_SYSTEM;
  if (jl === "county") return SLED_COUNTY_SYSTEM;
  if (jl === "city") return SLED_CITY_SYSTEM;
  return SLED_STATE_SYSTEM; // fallback for unknown SLED
}

function extractorVersionFor(opp) {
  if (opp.source === "sam") return "v1-federal-2026-06";
  const jl = (opp.jurisdiction_level || "").toLowerCase();
  if (jl === "state") return "v1-sled-state-2026-06";
  if (jl === "county") return "v1-sled-county-2026-06";
  if (jl === "city") return "v1-sled-city-2026-06";
  return "v1-sled-state-2026-06";
}

// ── OpenAI call ──────────────────────────────────────────────────────────────
async function callOpenAI(messages) {
  const res = await fetch(`${LLM_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LLM_KEY}`,
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 800,
      messages,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI ${res.status}: ${err}`);
  }
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

// ── Null-placeholder cleaner ─────────────────────────────────────────────────
const NULL_PLACEHOLDER = /^(none|not specified|n\/a|null|tbd|unspecified|unknown)$/i;
function cleanArr(v) {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => x != null && !NULL_PLACEHOLDER.test(String(x).trim()) && String(x).trim());
}
function countKeys(obj) {
  if (!obj || typeof obj !== "object") return 0;
  let n = 0;
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith("extracted")) continue;
    if (Array.isArray(v) && v.length > 0) n++;
    else if (v !== null && v !== undefined && v !== "" && !Array.isArray(v)) n++;
  }
  return n;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const results = [];

  for (const opp of OPPS) {
    const desc = stripHtml(opp.description || "").slice(0, 6000);
    const systemPrompt = systemPromptFor(opp);
    const version = extractorVersionFor(opp);

    const ctx = [];
    if (opp.agency) ctx.push(`AGENCY: ${opp.agency}`);
    if (opp.naics_code) ctx.push(`NAICS: ${opp.naics_code}`);
    if (opp.set_aside_code) ctx.push(`SET-ASIDE: ${opp.set_aside_code}`);

    const userContent = [
      ctx.join("\n"),
      `TITLE: ${opp.title}`,
      `DESCRIPTION:\n${desc}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    console.log(`\nExtracting [${version}]: ${opp.title.slice(0, 60)}...`);

    let extraction_result = null;
    let error = null;
    try {
      const raw = await callOpenAI([
        { role: "system", content: systemPrompt },
        { role: "system", content: `JSON SCHEMA (exact keys, no extras):\n${SCHEMA_HINT}` },
        { role: "user", content: userContent },
      ]);

      extraction_result = {
        scope_of_work: cleanArr(raw.scope_of_work),
        qualifications: cleanArr(raw.qualifications),
        required_certifications: cleanArr(raw.required_certifications),
        deliverables: cleanArr(raw.deliverables),
        period_of_performance: raw.period_of_performance || null,
        contract_type: raw.contract_type || null,
        evaluation_factors: cleanArr(raw.evaluation_factors),
        bid_bond_pct: raw.bid_bond_pct ?? null,
        performance_bond_pct: raw.performance_bond_pct ?? null,
        pre_bid_meeting: raw.pre_bid_meeting || null,
        local_preference: raw.local_preference ?? null,
        diversity_requirements: cleanArr(raw.diversity_requirements),
        extracted_from: "description",
        extracted_at: new Date().toISOString(),
        extractor_version: version,
      };

      console.log(
        `  scope_of_work[${extraction_result.scope_of_work.length}]`,
        `qualifications[${extraction_result.qualifications.length}]`,
        `contract_type=${extraction_result.contract_type}`,
        `keys_filled=${countKeys(extraction_result)}`
      );
    } catch (e) {
      error = e.message;
      console.error(`  ERROR: ${e.message}`);
    }

    results.push({
      id: opp.id,
      title: opp.title,
      source: opp.source,
      jurisdiction_level: opp.jurisdiction_level || "federal",
      description_preview: desc.slice(0, 500),
      extraction_result,
      keys_filled: extraction_result ? countKeys(extraction_result) : 0,
      error: error || undefined,
    });
  }

  const outPath = join(__dirname, ".smoke-out.json");
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nWrote ${results.length} results → ${outPath}`);

  const failed = results.filter((r) => r.error);
  if (failed.length) {
    console.log(`\nFailed (${failed.length}): ${failed.map((r) => r.title.slice(0, 40)).join(", ")}`);
  } else {
    console.log("\nAll 10 opps extracted successfully.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
