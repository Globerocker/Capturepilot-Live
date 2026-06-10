#!/usr/bin/env node
/**
 * Bulk smoke-test: run structured-requirements extraction on ~30 real opps
 * pulled live from Supabase:
 *   - 10 SAM (federal, diverse NAICS)
 *   - 10 SLED (5 state, 3 city, 2 county)
 *   - 5 grants (falls back to SAM if none exist)
 *   - 5 random (any source, any NAICS)
 *
 * Output: scripts/.bulk-out.json
 *
 * Run: node scripts/bulk-extract-structured-reqs.mjs
 */

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createClient } from "@supabase/supabase-js";

// ── Load .env.local ──────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const envFiles = [".env.local", ".env.vercel.local", ".env.vercel.production"];
for (const f of envFiles) {
  try {
    const envFile = readFileSync(join(ROOT, f), "utf-8");
    for (const line of envFile.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)="?([^"]*)"?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const LLM_KEY = DEEPSEEK_API_KEY || OPENAI_API_KEY;
const LLM_BASE = DEEPSEEK_API_KEY
  ? "https://api.deepseek.com/v1"
  : "https://api.openai.com/v1";
const LLM_MODEL = DEEPSEEK_API_KEY ? "deepseek-chat" : "gpt-4o-mini";

if (!LLM_KEY) throw new Error("Neither DEEPSEEK_API_KEY nor OPENAI_API_KEY found.");
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL not set.");
if (!process.env.SUPABASE_SERVICE_KEY) throw new Error("SUPABASE_SERVICE_KEY not set.");

console.log(`Using ${DEEPSEEK_API_KEY ? "DeepSeek" : "OpenAI"} (${LLM_MODEL})`);

// ── Supabase ─────────────────────────────────────────────────────────────────
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

// ── Fetch helpers ─────────────────────────────────────────────────────────────
const OPP_COLS = "id,title,description,agency,naics_code,set_aside_code,source,jurisdiction_level";

async function fetchSam(n) {
  // Use offset randomisation to get diverse NAICS coverage across the SAM range
  // SAM opps appear in pages of 1000 starting at range 0
  // We want a varied sample so we pick from different buckets
  const offsets = [0, 200, 400, 600, 800, 1200, 1800, 2400, 3000, 5000, 8000, 12000, 18000, 25000];
  const perBucket = Math.ceil(n / offsets.length);
  const rows = [];
  for (const offset of offsets) {
    if (rows.length >= n) break;
    const { data, error } = await sb
      .from("opportunities")
      .select(OPP_COLS)
      .eq("source", "sam")
      .not("description", "is", null)
      .neq("description", "")
      .range(offset, offset + perBucket - 1);
    if (error || !data) continue;
    // Only include rows with non-trivial descriptions (>200 chars)
    for (const r of data) {
      if (rows.length >= n) break;
      if ((r.description || "").length > 200) rows.push(r);
    }
  }
  return rows.slice(0, n);
}

async function fetchSled(jurisdictionLevel, n) {
  const { data, error } = await sb
    .from("opportunities")
    .select(OPP_COLS)
    .eq("source", "sled")
    .eq("jurisdiction_level", jurisdictionLevel)
    .not("description", "is", null)
    .neq("description", "")
    .limit(n * 3); // fetch extra to filter short ones
  if (error || !data) return [];
  return data.filter((r) => (r.description || "").length > 200).slice(0, n);
}

async function fetchGrants(n) {
  const { data, error } = await sb
    .from("opportunities")
    .select(OPP_COLS)
    .eq("source", "grants")
    .not("description", "is", null)
    .neq("description", "")
    .limit(n * 2);
  if (error || !data) return [];
  return data.filter((r) => (r.description || "").length > 200).slice(0, n);
}

async function fetchRandom(n, excludeIds) {
  // Pull from a high-offset to get a different cross-section
  const { data, error } = await sb
    .from("opportunities")
    .select(OPP_COLS)
    .not("description", "is", null)
    .neq("description", "")
    .range(15000, 15000 + n * 5);
  if (error || !data) return [];
  const excSet = new Set(excludeIds);
  return data
    .filter((r) => !excSet.has(r.id) && (r.description || "").length > 200)
    .slice(0, n);
}

// ── Prompts ───────────────────────────────────────────────────────────────────

// Shared anti-hallucination and anti-boilerplate rules injected into every prompt
const SHARED_ANTI_BOILERPLATE = `
EXTRACTION MANDATE — fill every field the description supports
Your #1 job is to extract ALL substantive information present in the description into the correct fields.
A low fill rate (few non-null/non-empty fields) is a FAILURE. Target at least 6 filled fields for federal, 5 for SLED.
MANDATORY SELF-CHECK: Before outputting, count your filled fields. If you have fewer than 5 (federal) or 4 (SLED), re-read the description — you have almost certainly missed contract_type, evaluation_factors, or period_of_performance.
Only return null/[] for fields that are genuinely absent from the text OR not inferable from strong contextual signals (see CONTEXTUAL DEFAULTS below).

CONTEXTUAL DEFAULTS — use these when the text is thin but context is clear
These are the ONLY exceptions to the "text-only" rule. Use them when the description doesn't explicitly state the value but the solicitation type makes it unambiguous:
1. evaluation_factors: If the notice type is IFB (Invitation for Bid) — look for "IFB", "Invitation for Bid", "sealed bid", "public bid opening" in the text or title — use "Lowest responsive responsible bidder" even if that exact phrase isn't present.
2. evaluation_factors: If the notice type is RFQ (Request for Quote) for a simple commodity or supply order — use "Lowest price, technically acceptable" when no evaluation criteria are stated.
3. contract_type: If the description mentions "firm-fixed-price", "FFP", "IDIQ", "BPA", "T&M", "term contract", "unit price", or "construction" — extract it. If none of those appear but the notice is clearly a one-time supply order (single NSN, single delivery), use "FFP".
4. period_of_performance: If the description mentions a delivery date, a contract start/end date, or number of days/months, always capture it. Do NOT return null when a delivery timeline is present.
IMPORTANT: These defaults apply ONLY to the four fields above. All other fields (certifications, bonds, diversity, pre-bid) must be text-grounded only.

ANTI-HALLUCINATION RULES (mandatory — violating these is worse than low fill rate)
- Every non-null field you return (except contextual defaults above) MUST be directly supported by verbatim language in the description.
- If a value is not stated in the text and no contextual default applies, return null (scalars) or [] (arrays). Do NOT infer, assume, or invent plausible defaults.
- Do NOT estimate bond percentages, evaluation weights, or dates that are not explicitly stated in the text.
- Do NOT fabricate pre-bid meeting dates, locations, or mandatory status unless stated word-for-word.
- NEVER write "(implied by ...)", "(inferred from ...)", "(likely ...)", or "(required for this type of work)" — if you would write those qualifiers, return null/[] instead.
- Certifications: only list certs that are NAMED VERBATIM in the description. "Lifeguard certification" is NOT a valid extraction unless the text says that exact phrase. "CMMC Level 2" IS valid if those words appear.
- Evaluation factor weights: only include percentage numbers that appear verbatim. Never distribute or estimate splits.

SCOPE_OF_WORK rules
- Each bullet must describe what the contractor DOES or DELIVERS — actual work tasks or deliverables.
- If there is ANY detail about the work, extract it even if brief. Only return [] if there is truly zero task/deliverable information (e.g., the description is pure portal navigation HTML or only an amendment-date notice with no scope).
- Do NOT write a bullet that is WORD-FOR-WORD identical to the title. But if the description adds any specifics — quantities, NSN, location, work type, system name — include them.
  - Acceptable for a supply item: "Procure 16 units VXRail software support/on-site service (7x24, Next Business Day)" → INCLUDE even if similar to the title
  - Bad: "VXRail Support" (exact title restatement with zero added detail) → EXCLUDE
- Do NOT list FAR/DFARS/MIL-STD clause-compliance items (Buy American Act, WAWF, item unique identification, Berry Amendment, royalty reporting, etc.). Those are contract terms, not scope.
- Do NOT list general capability statements ("must be capable of providing", "ability to perform") — those are qualifications, not scope tasks.
- Bad: "Comply with FAR 52.204-21 Basic Safeguarding" → EXCLUDE
- Bad: "Must be capable of providing certified lifeguard personnel" → this is a qualification, not scope
- Good: "Repair and modify 9 units of NSN 7H-4310-016886069 compressors to OEM spec" → INCLUDE
- Good for sources-sought: "Market research for [service] — government seeking capability statements and pricing information" → INCLUDE when that is clearly stated

QUALIFICATIONS rules (STRICT — tautologies are worse than empty arrays)
- SAM.gov registration is a universal baseline for every federal bidder — do NOT list it. Never write "Must be registered in SAM.gov", "Active SAM registration", or any equivalent.
- State/county/city vendor registration IS worth listing when a specific state registration portal (e.g., "Texas Comptroller HUB registration", "New York State Contract Reporter") is cited as a requirement.
- NEVER write a qualification that mirrors the title or description of the work itself:
  - Bad: "Must be capable of providing lifeguard services" → this is the entire contract scope, not a disqualifying requirement
  - Bad: "Must be capable of providing fixed income index technology" → tautology
  - Bad: "Must demonstrate ability to offer customization across credit risk factors" → tautology (paraphrases the scope)
  - Bad: "Firm must be qualified to provide bus transportation" → tautology
  - Bad: "Qualified vendors" → not a qualification
  - Bad: "Must be capable of performing the work" → not a qualification
- Only list qualifications that would DISQUALIFY a typical small business from bidding — things a capable, registered vendor might NOT have:
  - Security clearance level (e.g., "SECRET clearance required for key personnel")
  - Approved-source status (QPL/QML listing, sole-source)
  - Specific dollar-threshold past performance (e.g., "at least one project ≥$5M")
  - Required professional license not implicit in the trade (PE, CPA, attorney, CDL-B, asbestos cert)
  - 8(a)/HUBZone/SDVOSB restriction (set-aside gating)
  - Named pre-qualification status (e.g., NYCSCA pre-qualification required)
  - Specific years of experience IF explicitly stated (e.g., "minimum 5 years experience in fixed income benchmarking")
  - Insurance minimums (e.g., "$2M general liability") when explicitly stated
  - Bonding capacity when explicitly required
  - Access to a TDP (Technical Data Package) or NDA requirement
- Good: "Must hold SECRET clearance for key personnel" → INCLUDE
- Good: "Must be pre-qualified by NYCSCA at time of bid opening" → INCLUDE
- Good: "Minimum 5 years experience in fixed income index technology" → INCLUDE if stated verbatim
- Good: "Must hold valid Texas CDL-B license" → INCLUDE
- Good: "$2M commercial general liability insurance required" → INCLUDE if stated
- Good: "Must be Sole Source/Limited Source Manufacturer or have access to TDP via NDA" → INCLUDE

DELIVERABLES rules
- Deliverables are physical items, software, reports, or data the contractor hands over to the government/buyer.
- For supply/parts contracts: the physical items being purchased ARE the deliverables. Example: "9 repaired compressor units", "34 Cylinder Outrigger units", "1 cable assembly per MIL-DTL-####".
- For service contracts: look for reports, plans, data deliverables, software, completed installations.
- Do NOT list submission artifacts like "solicitation response", "capability statement", "documentation of qualifications" — those are proposal requirements, not contract deliverables.
- Do NOT list recordkeeping items like "inspection records", "maintenance logs" unless specified as a formal Contract Data Requirements List (CDRL) deliverable.
- Do NOT list change-control documents like "Engineering Change Proposals (if applicable)" — those are processes, not deliverables.
- For service opps with no explicit deliverables listed: the primary service output IS the deliverable (e.g., "Lifeguard services during pool operating hours", "Shuttle transportation between campuses").
- Bad: "Solicitation response submitted through BPRO" → EXCLUDE
- Good: "9 repaired compressor units delivered FOB Origin" → INCLUDE
- Good: "Monthly status reports (CDRL A001)" → INCLUDE
- Good: "Software application hosted on government cloud infrastructure" → INCLUDE
- Good: "Student shuttle service on defined routes between campuses" → INCLUDE (primary service deliverable)

EVALUATION_FACTORS rules
- Look carefully for source-selection criteria: Best Value vs. LPTA, technical approach weight, past performance weight, price/cost weight, management approach, small business subcontracting plan.
- Only list factors the CONTRACTING OFFICER uses to select the winner, not RFI response criteria.
- Do NOT include phrases like "Interest and capability to submit proposals" or "Capability to respond" — those are sources-sought RFI gates, not source-selection criteria.
- Include percentage weights only if explicitly stated in the text. Do not estimate or distribute weights.
- CONTEXTUAL DEFAULT: If the notice is an IFB (sealed competitive bid) and no criteria are stated, use "Lowest responsive responsible bidder" — this is the universal IFB standard and is not an inference.
- For RFPs: look for "Best Value", "LPTA", "technical and price", "past performance" language.
- For sole-source notices: "Sole source — no competition" or describe the justification cited (e.g., "FAR 6.302-1 only responsible source") is valid.
- Good: "Best Value — Technical (40%), Past Performance (30%), Price (30%)" (only if these numbers appear verbatim) → INCLUDE
- Good: "Lowest Price Technically Acceptable (LPTA)" → INCLUDE if stated
- Good: "Award to lowest responsive responsible bidder" → INCLUDE
- Good: "Technical approach, past performance, and price evaluated in descending order of importance" → INCLUDE
- Good: "Sole source justification — FAR 6.302-1, only one responsible source" → INCLUDE for sole-source notices

DIVERSITY_REQUIREMENTS rules
- Only include diversity goals with POSITIVE non-zero percentages (e.g., "MWBE 25%", "HUB 11%").
- A goal of 0.00% or "N/A" means no requirement — do NOT list it. A zero goal is the absence of a requirement.
- Do NOT duplicate set-aside type (SDVOSB, 8(a), etc.) here; those belong in the set-aside field, not as diversity items.
- Bad: "SDVOB Goal: 0.00%" → EXCLUDE
- Bad: "Total MWBE Goals: 0.00%" → EXCLUDE
- Good: "MWBE subcontracting goal: 25%" → INCLUDE

PRE_BID_MEETING rules
- Return null for the entire pre_bid_meeting field if no pre-bid/pre-proposal meeting is described.
- Do NOT return an object with all-null inner values like {"date": null, "mandatory": false, "location": null}.
- Only return the object when at least a date or location is explicitly stated in the text.
- For mandatory: set true only when the text uses words like "MANDATORY", "required to attend", "must attend".

PERIOD_OF_PERFORMANCE rules (look aggressively)
- Search the entire description for ALL of these patterns before returning null:
  * "base year" + option years (e.g., "1 base year + 4 one-year options" → "1 base + 4 option years (5 years total)")
  * NTP/Notice to Proceed + days (e.g., "within 365 calendar days of NTP" → "365 calendar days from NTP")
  * Date range (e.g., "07/01/2026 – 06/30/2031" → use that exact range)
  * "performance period of N months"
  * "contract term of N years with N renewals"
  * Delivery: "Required Delivery Date", "delivery within X days ARO", "X days after receipt of order", "within N days of award"
  * Lease/service term: "12-month base period", "initial term of 2 years"
  * Calendar days to complete: "completion within 180 calendar days", "90 days from NTP"
- If multiple periods exist, capture the full range including options.
- Return null ONLY if no time reference whatsoever appears in the description.
- CONTEXTUAL DEFAULT: If you see a delivery date (e.g., "Required Delivery Date: 2026-09-30") use that as the period_of_performance string.

REQUIRED_CERTIFICATIONS rules
- ONLY list certifications that are NAMED VERBATIM in the description text. No inferences.
- Named third-party certifications are valid: ISO 9001, ISO 27001, CMMC L1/L2/L3, SOC 2 Type II, FedRAMP, ITAR registration, OSHA-30, OSHA-10, AS9100, NIST 800-171 assessment, specific state professional licenses named explicitly.
- For construction: "Class A General Contractor License" or "asbestos abatement certification" only if stated.
- NEVER write: "(implied by...)", "(required for this type of work)", "(lifeguard certification implied)" — if you would write those qualifiers, use [] instead.
- "Lifeguard certification" must appear IN THE TEXT to be extracted — do not infer it from the fact that lifeguards are needed.
- Good example: description says "AHA CPR/AED certification required" → extract "AHA CPR/AED certification"
- Bad example: description says "provide certified lifeguards" → do NOT extract "Lifeguard certification (implied)"

CONTRACT_TYPE inference rule
- Check the description for these words (case-insensitive): "firm-fixed-price", "FFP", "IDIQ", "BPA", "T&M", "time-and-materials", "term contract", "unit price", "construction contract", "indefinite delivery", "blanket purchase".
- CONTEXTUAL DEFAULT: A single-item supply purchase order with a specified quantity and no "IDIQ" language → use "FFP".
- CONTEXTUAL DEFAULT: A simple service with a stated base term and renewal options → use "FFP" unless otherwise specified.
- Construction projects → use "Construction" as the type unless the text says otherwise.
- Return null ONLY if none of the above apply and the contract mechanism is genuinely unknown.`;

const FEDERAL_SYSTEM = `You are a US federal capture-management analyst. You read a SAM.gov solicitation
(synopsis description + attached documents) and produce a STRUCTURED requirements
breakdown that a small-business proposal team will use to draft a response.
${SHARED_ANTI_BOILERPLATE}

FIELD DEFINITIONS (federal)
- "scope_of_work": 3-8 discrete work tasks or deliverables. What the contractor actually DOES or DELIVERS. Not clause compliance. Not title restated. Add specifics: NSN, quantities, location, system name when stated.
  Example (supply): "Procure and deliver 9 EA NSN 7H-4310-016886069 compressor units repaired/modified to OEM spec, FOB Origin"
  Example (service): "Provide non-personal lifeguard services at Kirtland AFB 50-meter pool; minimum 2 guards on duty at all times"
  Example (construction): "Repair and restore HDDA Borrow Site, dispose of material in restoration areas per contract drawings"
- "qualifications": ONLY requirements that disqualify a typical small business. No SAM registration. No tautologies. See rules above.
- "required_certifications": Named certs verbatim only. Common federal ones to look for: CMMC L1/L2/L3, FedRAMP, ISO 9001/27001, SOC 2, ITAR registration, OSHA-30/10, AS9100, AHA CPR/AED, specific professional licenses (PE, architect, etc.).
- "deliverables": Physical items, reports, software, or data handed to the government. For supply orders the item IS the deliverable. For services, the primary service output (e.g., "Lifeguard services, min 2 guards on duty during pool hours") counts as a deliverable when no other deliverable is specified. No proposal artifacts.
- "period_of_performance": Scan for base+options, NTP+days, date range, delivery ARO days. Capture the full span including options. null only if truly absent.
- "contract_type": FFP | T&M | CPFF | CPIF | IDIQ | BPA | GSA Schedule | null. Look for "firm-fixed-price", "time-and-materials", "indefinite delivery", "multiple award".
- "evaluation_factors": CONTRACTING OFFICER selection criteria only. For IFBs: "Lowest responsive responsible bidder". For RFPs: Best Value / LPTA / technical-past performance-price with weights if stated verbatim. NOT RFI response gates.
- "bid_bond_pct": Integer % only if bid bond explicitly stated (FAR 52.228-1 or "bid bond required"). null otherwise — do NOT default to any percentage for construction.
- "performance_bond_pct": Integer % only if performance bond explicitly stated (FAR 52.228-15 or "performance bond required"). null otherwise.
- "pre_bid_meeting": {date, mandatory, location} only if meeting is explicitly described. null (not an all-null object) when absent.
- "local_preference": true only if text explicitly preferences local vendors.
- "diversity_requirements": Active subcontracting goals with non-zero percentages only. [] if open competition or goals are 0%.

MANDATORY CHECK BEFORE OUTPUTTING: Verify you have considered:
1. Is there a delivery date / base+options / NTP timeline / delivery ARO / required delivery date? → period_of_performance (capture it; don't return null if any date/timeline is present)
2. Is there "FFP", "IDIQ", "BPA", "T&M", "firm-fixed-price" language? OR is this clearly a one-time supply purchase? → contract_type (use "FFP" for simple supply orders; "Construction" for construction work)
3. Is there "Best Value", "LPTA", "lowest responsible", "sole source", or evaluation weight language? OR is the notice an IFB/sealed bid? → evaluation_factors (use "Lowest responsive responsible bidder" for IFBs; "Sole source — [FAR citation]" for sole-source notices)
4. Is there a named certification (ISO, CMMC, FedRAMP, OSHA, etc.)? → required_certifications
5. Are there specific items, quantities, or reports to hand over? → deliverables
6. Is there a specific license, clearance, experience threshold, or TDP/NDA access requirement? → qualifications
RULE: If evaluation_factors is [] AND contract_type is null AND period_of_performance is null after this check, you have almost certainly under-extracted — re-read before returning.

RESPONSE FORMAT: Return ONLY a JSON object with these exact keys. Use [] for empty
arrays. Use null for unknown optional scalars. Never add extra keys. Never wrap in markdown.`;

const SLED_STATE_SYSTEM = `You are a state-government procurement analyst. You read a state-level solicitation
and produce a STRUCTURED requirements breakdown for a vendor responding to the RFP/RFO/IFB.
${SHARED_ANTI_BOILERPLATE}

SLED STATE SPECIFIC — scan aggressively for these common state-procurement fields:
- bid_bond_pct / performance_bond_pct: present in IFBs and construction RFPs. Look for "bid security", "bid guarantee", "5% of bid", "100% performance bond", "payment and performance bond".
- local_preference: some states have explicit in-state vendor preference statutes — extract ONLY if the text names a preference statute or percentage advantage.
- evaluation_factors: State RFPs almost always state selection method. Look for "Best Value", "lowest responsible bidder", "technical score", "price/cost", "references", "MWBE plan". Extract the stated method and any weights.
- diversity_requirements: MBE/WBE/HUB/DBE/SDVBE with POSITIVE percentages only.
- period_of_performance: State contracts almost always state a base term + renewals. Look for "initial term", "base period of X years", "up to X one-year renewals", "effective date through MM/DD/YYYY".
- pre_bid_meeting: Look for "pre-bid conference", "pre-proposal meeting", "mandatory" or "optional" site visit, with date and address.
- contract_type: "Term contract", "Statewide contract", "IDIQ", "Fixed-price contract", "Time and materials" — extract if stated.
- qualifications: Insurance minimums ($1M GL, etc.), bonding capacity, specific state licenses, years of experience if stated, pre-qualification required, CDL or professional license.
- deliverables: For service contracts, the service itself is a deliverable (e.g., "Shuttle transportation on defined routes"). For IT contracts: software, reports, data files. For construction: completed facility.

MANDATORY CHECK BEFORE OUTPUTTING: A SLED state solicitation almost always has at minimum:
1. scope_of_work — if the description has ANY task detail, extract it (even a single sentence about what the vendor provides)
2. period_of_performance — look for contract term, initial period, renewal options, dates, or "N-year base + N renewals". State contracts almost always have this.
3. evaluation_factors — look for "Best Value", "LPTA", "lowest responsive", "scored criteria", or evaluation weights. If the notice is an IFB (sealed bid), use "Lowest responsive responsible bidder". This field should almost never be empty for state contracts.
4. deliverables — the primary service/product being procured IS a deliverable (e.g., shuttle service, grounds maintenance, rental equipment, ATM services). Do not return [].
5. contract_type — state contracts almost always specify FFP, IDIQ, Term Contract, or Unit Price. Look for these terms.
RULE: If evaluation_factors is [] AND contract_type is null AND period_of_performance is null, you have missed something — re-read before returning.

FIELD DEFINITIONS (state SLED)
- "scope_of_work": Discrete deliverables or services with specifics. Not title restatement, not general capability statements. Add quantities, locations, service frequency, routes, or system names when stated.
- "qualifications": Mandatory vendor requirements that distinguish this opp: state-specific licenses, bonding capacity, insurance minimums, years of experience if stated, pre-qualification status. NOT generic "qualified vendors."
- "required_certifications": Named certifications cited verbatim (e.g., "State of Texas HUB Certificate", "ISO 27001", "AHA CPR certification").
- "deliverables": Products, reports, services, or data artifacts the vendor provides to the state. The primary service output always counts. Not proposal submissions.
- "period_of_performance": Full term including options. Look for base term + renewals. State contracts almost always have this.
- "contract_type": FFP | T&M | IDIQ | BPA | Term Contract | null.
- "evaluation_factors": Selection criteria with weights if stated. LPTA vs. Best Value. Minimum: "Best Value" or "Lowest responsive responsible bidder" if stated.
- "pre_bid_meeting": Object {date, mandatory, location} only if a meeting is described. null (not all-null object) otherwise.
- "diversity_requirements": Non-zero percentage goals for MBE/WBE/HUB/DBE. Omit 0% goals entirely.

RESPONSE FORMAT: Return ONLY a JSON object with these exact keys. Use [] for empty
arrays. Use null for unknown optional scalars. Never add extra keys. Never wrap in markdown.`;

const SLED_COUNTY_SYSTEM = `You are a county/regional-government procurement analyst. You read a county-level
solicitation (RFP, IFB, RFQ, or bid notice) and produce a STRUCTURED requirements
breakdown for a vendor responding to the procurement.
${SHARED_ANTI_BOILERPLATE}

COUNTY SLED SPECIFIC — scan aggressively for these common county-procurement fields:
- bid_bond_pct: Very common in IFBs. Look for "bid security of X%", "bid guarantee", "5% of total bid price", "bid bond required". Extract only the stated percentage.
- performance_bond_pct: Common at 100% for construction. Look for "performance and payment bond", "100% performance bond".
- insurance minimums: Extract as qualifications: "$1M commercial general liability", "$500K auto liability", "$1M workers' comp". Only if dollar amounts are stated.
- prevailing wage: Add to qualifications if "Davis-Bacon Act", "state prevailing wage", "Living Wage Ordinance" is cited.
- Section 3 / MWBE / DBE goals: Extract only if goal > 0%.
- pre_bid_meeting: Mandatory or optional, with date and address — very common in county IFBs.
- evaluation_factors: County IFBs typically use "lowest responsible bidder". RFPs state weighted criteria. Extract what is stated.
- period_of_performance: Look for contract duration, base + renewals, start/end dates.

MANDATORY CHECK BEFORE OUTPUTTING: County procurements almost always have:
1. scope_of_work with at least 2-3 specifics (location, quantity, work type)
2. evaluation_factors — at minimum "Lowest responsive responsible bidder" for IFBs, or "Best Value" for RFPs. This field should almost never be empty for county procurements. Apply the IFB contextual default if applicable.
3. deliverables — the completed work or service IS a deliverable (the ATM service, the roadwork, the rental equipment). Do not return [].
4. qualifications — insurance minimums, license class, or bonding are nearly universal in county IFBs. Look for dollar amounts.
5. contract_type — county procurements often state "Unit Price", "FFP", "Term Contract", or "Construction". Look for these terms.
RULE: If evaluation_factors is [] AND contract_type is null AND period_of_performance is null, re-read before returning.

FIELD DEFINITIONS (county SLED)
- "scope_of_work": Discrete work tasks or deliverables with specifics (location, quantity, scope). Not clause compliance, not title restatement.
- "qualifications": Contractor license class, bonding capacity, insurance minimums (with dollar amounts), years experience if stated, prevailing wage compliance if stated. Not generic "qualified contractor."
- "required_certifications": Named certifications cited verbatim.
- "deliverables": Completed construction, installed systems, reports, or services delivered to the county. Primary service output counts. Not proposal submissions.
- "period_of_performance": Full term including renewals if stated.
- "contract_type": FFP | T&M | Unit Price | IDIQ | Construction | null.
- "evaluation_factors": Lowest responsible bidder, best value, or scored criteria with weights. Extract the stated method.
- "pre_bid_meeting": Object {date, mandatory, location} only if described. null (not all-null object) if not mentioned.
- "diversity_requirements": Non-zero percentage goals (DBE %, MWBE %, Section 3 %). Omit 0% goals.

RESPONSE FORMAT: Return ONLY a JSON object with these exact keys. Use [] for empty
arrays. Use null for unknown optional scalars. Never add extra keys. Never wrap in markdown.`;

const SLED_CITY_SYSTEM = `You are a city/municipal-government procurement analyst. You read a city-level
solicitation (RFP, IFB, CSB, RFQ, or bid notice) and produce a STRUCTURED requirements
breakdown for a vendor responding to the procurement.
${SHARED_ANTI_BOILERPLATE}

CITY SLED SPECIFIC — scan aggressively for these common city-procurement fields:
- bid_bond_pct / performance_bond_pct: Common in construction IFBs. Look for "bid security X%", "bid guarantee", "performance and payment bond 100%".
- MWBE / M/WBE / EBE / LBE / Section 3 goals: Extract ONLY if percentage > 0%. Omit 0% goals entirely.
- prevailing wage: Add to qualifications if "City Living Wage", "Davis-Bacon", "prevailing wage rates" is cited.
- pre_bid_meeting: Mandatory or optional, with date and address. Very common in city IFBs and construction bids.
- local_preference: Only if the solicitation explicitly cites a city ordinance or percentage advantage for local firms.
- evaluation_factors: City IFBs → "lowest responsive responsible bidder". City RFPs → scored criteria with weights. Extract what is stated.
- period_of_performance: Contract duration, base + options, or calendar-day completion deadline.
- qualifications: Business license type, pre-qualification status, insurance minimums (with dollar amounts), MWBE certification required, specific trade license (general contractor Class A, electrical, plumbing, etc.).

MANDATORY CHECK BEFORE OUTPUTTING: City procurements almost always have:
1. scope_of_work with specifics (facility name, address, work type, quantities or system name if stated)
2. evaluation_factors — at minimum "Lowest responsive responsible bidder" for IFBs. City IFBs almost always use this. Apply the IFB contextual default. This field should almost never be empty.
3. deliverables — the completed construction, installed system, or service IS a deliverable. For construction: "Completed [work type] at [location]". Do not return [].
4. period_of_performance — look for calendar days from NTP, bid opening date implies upcoming work, or base + renewal terms
5. contract_type — city IFBs are almost always "Construction" (for construction work) or "FFP" (for services). Look for these terms.
RULE: If evaluation_factors is [] AND contract_type is null after this check, you have under-extracted — re-read and apply contextual defaults before returning.

FIELD DEFINITIONS (city SLED)
- "scope_of_work": Discrete work tasks or deliverables with specifics (facility name, address, system, quantities). Not title restatement. Not general clause compliance.
  Example: "Repair parapets and replace roofing membrane at PS 11, Queens" → INCLUDE
  Example: "Install ATMs at 12 county library locations" → INCLUDE
  Example: "Comply with NYC Local Law 1" → EXCLUDE
- "qualifications": Mandatory distinguishing requirements: business license type, bonding capacity, pre-qualification status, specific trade licenses, insurance minimums (with dollar amounts), specific years experience.
  Example: "Must be pre-qualified by NYCSCA at time of bid opening" → INCLUDE
  Example: "Class A General Contractor License required" → INCLUDE
- "required_certifications": Named certifications verbatim (MWBE cert, SBE cert, OSHA-30, OSHA-10, etc.).
- "deliverables": Completed construction, installed equipment, reports, services delivered to the city. Primary service output counts. Not proposal artifacts.
- "period_of_performance": Contract term including options, or calendar-days-from-NTP if stated.
- "contract_type": FFP | T&M | Unit Price | IDIQ | Construction | null.
- "evaluation_factors": How the city picks the winner (lowest responsible bid, best value, scored criteria). Weights if stated.
- "pre_bid_meeting": Object {date, mandatory, location} only if meeting is explicitly described. null (not all-null object) otherwise.
- "diversity_requirements": Non-zero MWBE/M/WBE/Section 3/EBE/LBE goals with percentages. Omit 0%.

RESPONSE FORMAT: Return ONLY a JSON object with these exact keys. Use [] for empty
arrays. Use null for unknown optional scalars. Never add extra keys. Never wrap in markdown.`;

const SCHEMA_HINT = `{
  "scope_of_work": ["What the contractor DOES or DELIVERS — tasks and work specifics with quantities, locations, NSNs, system names where stated. No FAR clause compliance. No pure title restatement."],
  "qualifications": ["Only requirements that DISQUALIFY a typical small business — clearances, licenses, bonding, specific experience thresholds, TDP/NDA access, pre-qual status. NOT SAM registration. NOT tautologies like 'qualified vendors', 'capable of doing the work', or paraphrases of the scope."],
  "required_certifications": ["NAMED verbatim in the description only — e.g., 'CLIA certification', 'OSHA-30', 'ISO 9001'. NEVER inferred from the type of work."],
  "deliverables": ["Items/services/reports handed to the buyer. For service contracts, the primary service output IS a deliverable (e.g., 'Lifeguard services at Kirtland AFB pool', 'Shuttle transportation on defined routes', 'Grounds maintenance at Denison Travel Information Center'). For supply orders, the item IS the deliverable. This array should RARELY be empty."],
  "period_of_performance": "string or null — look for base+options, NTP+days, date range, delivery ARO days, base period of X years, required delivery date. Return null ONLY if no time reference whatsoever appears.",
  "contract_type": "FFP|T&M|CPFF|CPIF|IDIQ|BPA|GSA Schedule|Term Contract|Unit Price|Construction|null — CONTEXTUAL DEFAULT: use 'FFP' for one-time supply purchases, 'Construction' for construction projects, 'Term Contract' for multi-year services. Null only if genuinely unclassifiable.",
  "evaluation_factors": ["Source-selection criteria: Best Value, LPTA, 'Lowest responsive responsible bidder' (use this for any IFB/sealed bid notice), technical/past performance/price with weights if stated. Sole-source: 'Sole source — [FAR citation]'. NOT RFI response gates. This array should RARELY be empty for a real solicitation."],
  "bid_bond_pct": "integer or null — ONLY if explicitly stated. Do NOT default.",
  "performance_bond_pct": "integer or null — ONLY if explicitly stated. Do NOT default.",
  "pre_bid_meeting": "null OR {\"date\": \"ISO8601 or human date\", \"mandatory\": true/false, \"location\": \"address\"} — null when absent, NOT {date:null, mandatory:false, location:null}",
  "local_preference": "true only if text names a local/in-state vendor preference statute or percentage advantage. false otherwise.",
  "diversity_requirements": ["Active diversity goals with POSITIVE non-zero % only — e.g., 'MWBE 25%', 'DBE 10%'. Omit 0% goals entirely."]
}

CRITICAL: pre_bid_meeting must be null (not an all-null object) when no meeting is described.
CRITICAL: diversity_requirements must be [] when all goals are 0% or when there are no diversity requirements.
CRITICAL: qualifications must be [] when all you have are tautologies, scope paraphrases, or SAM registration — empty is better than noise.
CRITICAL: deliverables should RARELY be [] — for every service or supply contract, the thing being procured IS the deliverable.
CRITICAL: evaluation_factors should RARELY be [] for a real solicitation — use the IFB contextual default or extract stated criteria.
CRITICAL: contract_type should RARELY be null — use contextual defaults (FFP for supply, Construction for construction, Term Contract for multi-year services) when the text doesn't explicitly name the mechanism but the contract type is obvious.`;

// ── Pick system prompt ────────────────────────────────────────────────────────
function systemPromptFor(opp) {
  if (opp.source === "sam" || opp.source === "grants") return FEDERAL_SYSTEM;
  const jl = (opp.jurisdiction_level || "").toLowerCase();
  if (jl === "state") return SLED_STATE_SYSTEM;
  if (jl === "county") return SLED_COUNTY_SYSTEM;
  if (jl === "city") return SLED_CITY_SYSTEM;
  return SLED_STATE_SYSTEM;
}

function extractorVersionFor(opp) {
  if (opp.source === "sam") return "v2-federal-2026-06";
  if (opp.source === "grants") return "v2-grants-2026-06";
  const jl = (opp.jurisdiction_level || "").toLowerCase();
  if (jl === "state") return "v2-sled-state-2026-06";
  if (jl === "county") return "v2-sled-county-2026-06";
  if (jl === "city") return "v2-sled-city-2026-06";
  return "v2-sled-state-2026-06";
}

// ── HTML stripper ─────────────────────────────────────────────────────────────
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

// ── LLM call ──────────────────────────────────────────────────────────────────
async function callLLM(messages) {
  const res = await fetch(`${LLM_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LLM_KEY}`,
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      response_format: { type: "json_object" },
      temperature: 0.15,
      max_tokens: 1200,
      messages,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LLM ${res.status}: ${err.slice(0, 300)}`);
  }
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

// ── Null-placeholder cleaner ──────────────────────────────────────────────────
const NULL_PLACEHOLDER = /^(none|not specified|n\/a|null|tbd|unspecified|unknown)$/i;
function cleanArr(v) {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (x) => x != null && !NULL_PLACEHOLDER.test(String(x).trim()) && String(x).trim()
  );
}

// Count non-empty keys (scalar non-null OR array length > 0)
function countKeys(obj) {
  if (!obj || typeof obj !== "object") return 0;
  let n = 0;
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith("extracted")) continue;
    if (Array.isArray(v) && v.length > 0) n++;
    else if (
      !Array.isArray(v) &&
      v !== null &&
      v !== undefined &&
      v !== "" &&
      v !== false
    )
      n++;
  }
  return n;
}

// ── Process one opp ───────────────────────────────────────────────────────────
async function processOpp(opp) {
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

  const label = `[${opp.source}/${opp.jurisdiction_level || "federal"}] ${(opp.title || "").slice(0, 55)}`;
  console.log(`\nExtracting ${label}...`);

  let extraction_result = null;
  let error = null;

  try {
    const raw = await callLLM([
      { role: "system", content: systemPrompt },
      {
        role: "system",
        content: `JSON SCHEMA (exact keys, no extras):\n${SCHEMA_HINT}`,
      },
      { role: "user", content: userContent },
    ]);

    const sow = cleanArr(raw.scope_of_work);
    let deliverables = cleanArr(raw.deliverables);

    // Post-process: if deliverables is empty but scope has content, derive the primary
    // service deliverable from the first scope bullet (capped to 120 chars). This
    // handles service contracts where the model correctly fills scope_of_work but
    // leaves deliverables empty because "the work" isn't an explicit handed-over item.
    // We only do this for non-supply (no NSN/MIL-DTL in title) and when scope >= 1 entry.
    if (deliverables.length === 0 && sow.length > 0) {
      const titleLower = (opp.title || "").toLowerCase();
      const isSupplyOrder = /\b(nsn|mil-dtl|mil-prf|niin|part no|pn:|repai|repair\/mod|procure\s+\d)/i.test(
        (opp.description || "") + opp.title
      );
      if (!isSupplyOrder) {
        // Use the first scope bullet as the primary deliverable (trimmed)
        const primaryDeliverable = sow[0].slice(0, 160);
        deliverables = [primaryDeliverable];
      }
    }

    extraction_result = {
      scope_of_work: sow,
      qualifications: cleanArr(raw.qualifications),
      required_certifications: cleanArr(raw.required_certifications),
      deliverables,
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
      `  sow[${extraction_result.scope_of_work.length}]`,
      `qual[${extraction_result.qualifications.length}]`,
      `ctype=${extraction_result.contract_type}`,
      `pop=${extraction_result.period_of_performance}`,
      `keys=${countKeys(extraction_result)}`
    );
  } catch (e) {
    error = e.message;
    console.error(`  ERROR: ${e.message}`);
  }

  return {
    id: opp.id,
    title: opp.title,
    source: opp.source,
    jurisdiction_level: opp.jurisdiction_level || (opp.source === "sam" ? "federal" : null),
    extraction_result,
    keys_filled: extraction_result ? countKeys(extraction_result) : 0,
    error: error || undefined,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("Fetching opps from Supabase...");

  const [samOpps, sledStateOpps, sledCityOpps, sledCountyOpps, grantsOpps] =
    await Promise.all([
      fetchSam(10),
      fetchSled("state", 5),
      fetchSled("city", 3),
      fetchSled("county", 2),
      fetchGrants(5),
    ]);

  console.log(
    `Fetched: SAM=${samOpps.length} state=${sledStateOpps.length}`,
    `city=${sledCityOpps.length} county=${sledCountyOpps.length}`,
    `grants=${grantsOpps.length}`
  );

  // Build primary pool (25 opps)
  const primaryPool = [
    ...samOpps,
    ...sledStateOpps,
    ...sledCityOpps,
    ...sledCountyOpps,
    ...grantsOpps,
  ];

  // Deduplicate by id
  const seen = new Set(primaryPool.map((o) => o.id));

  // Fill remaining slots with random opps (target 30)
  const needed = Math.max(0, 30 - primaryPool.length);
  let randomOpps = [];
  if (needed > 0) {
    randomOpps = await fetchRandom(needed + 5, [...seen]);
    randomOpps = randomOpps.filter((o) => !seen.has(o.id)).slice(0, needed);
  }

  const allOpps = [...primaryPool, ...randomOpps];
  console.log(`\nTotal opps to process: ${allOpps.length}`);

  // Process sequentially (rate limit friendly)
  const results = [];
  for (const opp of allOpps) {
    const result = await processOpp(opp);
    results.push(result);
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const succeeded = results.filter((r) => !r.error);
  const failed = results.filter((r) => r.error);
  const avgKeys =
    succeeded.length > 0
      ? succeeded.reduce((s, r) => s + r.keys_filled, 0) / succeeded.length
      : 0;

  // Per-source breakdown
  const perSource = {};
  for (const r of results) {
    const key = `${r.source}/${r.jurisdiction_level || "null"}`;
    if (!perSource[key]) perSource[key] = { attempted: 0, succeeded: 0, failed: 0, keys_sum: 0 };
    perSource[key].attempted++;
    if (r.error) perSource[key].failed++;
    else { perSource[key].succeeded++; perSource[key].keys_sum += r.keys_filled; }
  }

  console.log("\n════ SUMMARY ════");
  console.log(`Attempted: ${results.length}`);
  console.log(`Succeeded: ${succeeded.length}`);
  console.log(`Failed:    ${failed.length}`);
  console.log(`Avg keys filled (succeeded): ${avgKeys.toFixed(2)}`);
  console.log("\nPer-source:");
  for (const [k, v] of Object.entries(perSource)) {
    const avg = v.succeeded > 0 ? (v.keys_sum / v.succeeded).toFixed(1) : "n/a";
    console.log(`  ${k}: ${v.succeeded}/${v.attempted} ok, avg_keys=${avg}`);
  }
  if (failed.length) {
    console.log(`\nFailed opps:`);
    for (const r of failed) {
      console.log(`  [${r.id}] ${r.title?.slice(0, 50)}: ${r.error}`);
    }
  }

  // ── Write output ──────────────────────────────────────────────────────────
  const output = {
    run_at: new Date().toISOString(),
    model: LLM_MODEL,
    attempted: results.length,
    succeeded: succeeded.length,
    failed: failed.length,
    avg_keys_filled: parseFloat(avgKeys.toFixed(2)),
    per_source: perSource,
    results,
  };

  const outPath = join(__dirname, ".bulk-out.json");
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nWrote ${results.length} results → ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
