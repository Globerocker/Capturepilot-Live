// One-off: drain 100 SLED extract_structured_reqs_state jobs directly
// (bypasses Vercel orchestrator which seems to never claim our priority-10 jobs)
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const envText = fs.readFileSync("/tmp/cp-env.tmp", "utf8");
const env = Object.fromEntries(envText.split("\n").filter(l => l.includes("=")).map(l => {
  const i = l.indexOf("=");
  return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
}));
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_KEY;
const OPENAI_KEY = env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SERVICE_KEY || !OPENAI_KEY) {
  console.error("missing env"); process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const STATE_EXTRACTOR_VERSION = "v1-state-2026-06";

const SYSTEM_PROMPT = `You extract structured procurement requirements from US STATE / LOCAL (SLED) solicitation text. Return JSON ONLY — no prose.

Source: a state/county/city procurement portal listing (often Bonfire, BidExpress, IonWave, OpenGov) plus, when available, the attached Bid Documents PDF text.

CRITICAL RULES:
1. State procurement cites STATE code (e.g. "Texas Gov Code §2155", "CA PCC §22000"). NEVER invent FAR clauses — federal references almost never apply.
2. Diversity at the state level is MBE / WBE / DBE / SBE / HUB / state SB — NOT 8(a)/HUBZone/SDVOSB (those are federal-only). Capture diversity requirements verbatim into diversity_requirements[].
3. Certifications are state-issued — state contractor's license class, state DOT pre-qualification, state-specific MBE certification, asbestos/lead class, etc. Capture VERBATIM into required_certifications[].
4. Bonding: capture bid_bond_pct + performance_bond_pct as numbers in 0-100 when stated as percent. If only a dollar amount is given, include the raw phrase in scope_of_work and leave the *_pct fields out.
5. Pre-bid meeting: state RFPs frequently mandate attendance. Capture pre_bid_meeting.date (raw date string), pre_bid_meeting.mandatory (boolean), pre_bid_meeting.location (in-person address OR teleconference URL).
6. local_preference: true if the doc references local-vendor preference / in-state preference / residence preference; otherwise omit.
7. For each field, return ONLY the literal value found in the text — DO NOT INVENT. Use null or omit when not specified.

OUTPUT SHAPE (omit any key for which no value is in the text):
{
  "scope_of_work": [string, ...],
  "qualifications": [string, ...],
  "required_certifications": [string, ...],
  "deliverables": [string, ...],
  "period_of_performance": string|null,
  "contract_type": string|null,
  "evaluation_factors": [string, ...],
  "bid_bond_pct": number|null,
  "performance_bond_pct": number|null,
  "pre_bid_meeting": { "date": string|null, "mandatory": boolean|null, "location": string|null }|null,
  "local_preference": boolean|null,
  "diversity_requirements": [string, ...]
}`;

const FEW_SHOT_USER = `TITLE: RFP 24-085 — Janitorial Services for City Hall Complex
AGENCY: City of Austin, Purchasing Office
NAICS: 561720
RESPONSE DEADLINE: 2026-07-15

DESCRIPTION:
The City of Austin is soliciting proposals for daily janitorial services at the City Hall Complex (three buildings, 240,000 sq ft total) for a 24-month base period with two one-year renewal options. Pursuant to Texas Local Government Code §252, all responses must include a 5% bid bond. The successful proposer shall furnish a 100% performance and payment bond within 10 days of award.

A MANDATORY pre-proposal conference will be held on June 28, 2026 at 10:00 AM CDT at City Hall, 301 W 2nd St, Austin TX, Conference Room 1071. Attendance by an authorized representative of the proposer is required for a response to be considered.

Proposers must hold a current Texas Department of Licensing & Regulation (TDLR) Asbestos Class A license and shall demonstrate a minimum of five (5) years of comparable janitorial experience on government facilities of similar size. Texas HUB-certified businesses and City of Austin certified MBE/WBE firms shall be given preference points (10% of total score). Local-vendor preference applies pursuant to City Code Chapter 2-9.

Selection criteria: Technical Approach (35%), Past Performance (25%), Cost Proposal (25%), HUB/MBE Participation (15%).

Deliverables: monthly performance reports, quarterly inspection logs, annual sustainability report (LEED-compatible).`;

const FEW_SHOT_ASSISTANT = JSON.stringify({
  scope_of_work: ["Daily janitorial services for City Hall Complex (three buildings, 240,000 sq ft)", "Restroom sanitation, floor maintenance, waste removal"],
  qualifications: ["Minimum 5 years comparable janitorial experience on government facilities of similar size"],
  required_certifications: ["Texas Department of Licensing & Regulation (TDLR) Asbestos Class A license"],
  deliverables: ["Monthly performance reports", "Quarterly inspection logs", "Annual sustainability report (LEED-compatible)"],
  period_of_performance: "24-month base + two one-year renewal options",
  contract_type: null,
  evaluation_factors: ["Technical Approach (35%)", "Past Performance (25%)", "Cost Proposal (25%)", "HUB/MBE Participation (15%)"],
  bid_bond_pct: 5,
  performance_bond_pct: 100,
  pre_bid_meeting: { date: "June 28, 2026 at 10:00 AM CDT", mandatory: true, location: "City Hall, 301 W 2nd St, Austin TX, Conference Room 1071" },
  local_preference: true,
  diversity_requirements: ["Texas HUB-certified businesses given preference points (10% of total score)", "City of Austin certified MBE/WBE firms given preference points (10% of total score)"]
});

function stripHtml(s) {
  return s.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}

function cleanString(v, max = 200) {
  if (typeof v !== "string") return null;
  const s = v.trim().slice(0, max);
  return s.length ? s : null;
}
function cleanStringArray(v, max = 10) {
  if (!Array.isArray(v)) return [];
  return v.map(x => cleanString(x, 300)).filter(Boolean).slice(0, max);
}
function cleanPct(v) {
  const n = typeof v === "number" ? v : (typeof v === "string" ? parseFloat(v) : NaN);
  if (!isFinite(n) || n < 0 || n > 100) return undefined;
  return n;
}
function cleanBool(v) {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.toLowerCase().trim();
    if (s === "true" || s === "yes") return true;
    if (s === "false" || s === "no") return false;
  }
  return undefined;
}
function cleanPreBidMeeting(v) {
  if (!v || typeof v !== "object") return null;
  const out = {};
  const date = cleanString(v.date, 200); if (date) out.date = date;
  const loc = cleanString(v.location, 400); if (loc) out.location = loc;
  if (typeof v.mandatory === "boolean") out.mandatory = v.mandatory;
  return Object.keys(out).length ? out : null;
}

async function callOpenAI(messages, timeoutMs = 25000) {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 800,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`OpenAI ${res.status}: ${body.slice(0, 200)}`);
      return null;
    }
    const j = await res.json();
    return j.choices?.[0]?.message?.content || null;
  } catch (e) {
    console.warn("OpenAI call failed:", e.message);
    return null;
  }
}

function buildUserMessage(input) {
  const title = (input.title || "").trim();
  const descClean = stripHtml(input.description || "").slice(0, 4000);
  const attClean = stripHtml(input.attachments_text || "").slice(0, 10000);
  const usedAttachments = attClean.length > 200;
  const meta = [];
  if (title) meta.push(`TITLE: ${title}`);
  if (input.agency) meta.push(`AGENCY: ${input.agency}`);
  if (input.naics_code) meta.push(`NAICS: ${input.naics_code}`);
  if (input.set_aside_code) meta.push(`SET-ASIDE: ${input.set_aside_code}`);
  if (input.response_deadline) meta.push(`RESPONSE DEADLINE: ${input.response_deadline}`);
  const parts = [meta.join("\n"), "", "DESCRIPTION:", descClean || "(none)"];
  if (usedAttachments) parts.push("", "ATTACHMENTS TEXT (Bid Documents PDF, OCR):", attClean);
  return { text: parts.join("\n"), usedAttachments };
}

async function extractStateRequirements(opp) {
  const hasContent = (opp.title && opp.title.trim().length > 0) ||
    (opp.description && stripHtml(opp.description).length > 50) ||
    (opp.attachments_text && stripHtml(opp.attachments_text).length > 200);
  if (!hasContent) return null;

  const { text, usedAttachments } = buildUserMessage(opp);
  const hasDescription = (opp.description && stripHtml(opp.description).length > 50) || false;

  const content = await callOpenAI([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: FEW_SHOT_USER },
    { role: "assistant", content: FEW_SHOT_ASSISTANT },
    { role: "user", content: text },
  ]);
  if (!content) return null;
  let parsed;
  try { parsed = JSON.parse(content); } catch { return null; }

  const extractedFrom = usedAttachments ? (hasDescription ? "both" : "attachments") : "description";
  const out = {
    scope_of_work: cleanStringArray(parsed.scope_of_work, 10),
    qualifications: cleanStringArray(parsed.qualifications, 10),
    required_certifications: cleanStringArray(parsed.required_certifications, 10),
    deliverables: cleanStringArray(parsed.deliverables, 12),
    extracted_from: extractedFrom,
    extracted_at: new Date().toISOString(),
    extractor_version: STATE_EXTRACTOR_VERSION,
  };
  const period = cleanString(parsed.period_of_performance, 200); if (period) out.period_of_performance = period;
  const ctype = cleanString(parsed.contract_type, 60); if (ctype) out.contract_type = ctype;
  const evalFactors = cleanStringArray(parsed.evaluation_factors, 12); if (evalFactors.length) out.evaluation_factors = evalFactors;
  const bidBond = cleanPct(parsed.bid_bond_pct); if (bidBond !== undefined) out.bid_bond_pct = bidBond;
  const perfBond = cleanPct(parsed.performance_bond_pct); if (perfBond !== undefined) out.performance_bond_pct = perfBond;
  const meeting = cleanPreBidMeeting(parsed.pre_bid_meeting); if (meeting) out.pre_bid_meeting = meeting;
  const local = cleanBool(parsed.local_preference); if (local !== undefined) out.local_preference = local;
  const diversity = cleanStringArray(parsed.diversity_requirements, 8); if (diversity.length) out.diversity_requirements = diversity;

  const hasAnyData = out.scope_of_work.length > 0 || out.qualifications.length > 0 ||
    out.required_certifications.length > 0 || out.deliverables.length > 0 ||
    !!out.period_of_performance || !!out.contract_type ||
    (out.evaluation_factors?.length ?? 0) > 0 || out.bid_bond_pct !== undefined ||
    out.performance_bond_pct !== undefined || !!out.pre_bid_meeting ||
    out.local_preference !== undefined || (out.diversity_requirements?.length ?? 0) > 0;
  if (!hasAnyData) return null;
  return out;
}

// === MAIN ===
async function main() {
  // Get all 100 pending state jobs
  const { data: jobs, error: jerr } = await sb.from("worker_jobs")
    .select("id, payload, attempts, max_attempts")
    .eq("task_type", "extract_structured_reqs_state")
    .eq("status", "pending")
    .limit(100);
  if (jerr) { console.error("job fetch err:", jerr.message); return; }
  console.log(`Got ${jobs?.length || 0} pending state jobs`);

  let done = 0, failed = 0, skipped = 0;
  let i = 0;
  for (const job of jobs || []) {
    i++;
    const oppId = job.payload?.opp_id;
    if (!oppId) { skipped++; continue; }

    // Mark running
    await sb.from("worker_jobs").update({ status: "running", started_at: new Date().toISOString(), attempts: job.attempts + 1 }).eq("id", job.id);

    try {
      const { data: opp } = await sb.from("opportunities")
        .select("id, title, description, agency, naics_code, set_aside_code, response_deadline, structured_requirements")
        .eq("id", oppId).maybeSingle();
      if (!opp) {
        await sb.from("worker_jobs").update({ status: "failed", finished_at: new Date().toISOString(), error_message: "opp not found" }).eq("id", job.id);
        failed++; continue;
      }

      // Pull attachment text
      let attachmentsText = null;
      const { data: atts } = await sb.from("opportunity_attachments")
        .select("filename, extracted_text").eq("opportunity_id", oppId).limit(3);
      if (atts && atts.length > 0) {
        attachmentsText = atts.map(a => `--- ${a.filename || "doc"} ---\n${(a.extracted_text || "").slice(0, 8000)}`).join("\n\n").slice(0, 18000);
      }

      const result = await extractStateRequirements({
        id: opp.id, title: opp.title, description: opp.description, agency: opp.agency,
        naics_code: opp.naics_code, set_aside_code: opp.set_aside_code,
        response_deadline: opp.response_deadline, attachments_text: attachmentsText,
      });

      if (!result) {
        await sb.from("worker_jobs").update({ status: "done", finished_at: new Date().toISOString(), result: { no_extraction: true } }).eq("id", job.id);
        skipped++;
        if (i % 10 === 0) console.log(`[${i}/100] done=${done} failed=${failed} skipped=${skipped} — no_extraction for ${oppId.slice(0,8)}`);
        continue;
      }

      const existing = opp.structured_requirements || {};
      const merged = { ...existing, ...result };
      const { error: upErr } = await sb.from("opportunities").update({ structured_requirements: merged }).eq("id", oppId);
      if (upErr) {
        await sb.from("worker_jobs").update({ status: "failed", finished_at: new Date().toISOString(), error_message: upErr.message }).eq("id", job.id);
        failed++; continue;
      }
      await sb.from("worker_jobs").update({ status: "done", finished_at: new Date().toISOString(), result: { extracted: true, scope_items: result.scope_of_work.length, cert_items: result.required_certifications.length } }).eq("id", job.id);
      done++;
      if (i % 10 === 0) console.log(`[${i}/100] done=${done} failed=${failed} skipped=${skipped}`);
    } catch (e) {
      await sb.from("worker_jobs").update({ status: "failed", finished_at: new Date().toISOString(), error_message: String(e.message || e).slice(0, 200) }).eq("id", job.id);
      failed++;
    }
  }
  console.log(`FINAL: done=${done} failed=${failed} skipped=${skipped}`);
}

main().catch(e => { console.error("FATAL", e); process.exit(1); });
