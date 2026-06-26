#!/usr/bin/env node
/*
 * Per-email QA + personalization agent for the "Match-Drop" cold campaign.
 *
 * For each active campaign contact it runs a cheap DeepSeek pass that:
 *   - normalizes the SAM all-caps name to a natural brand + greeting
 *     (ANDERSON BONELESS BEEF HOLDINGS LLC / MACK -> Anderson Custom Meats / "Hi Mack,")
 *   - judges whether the 3 matched contracts actually fit the company
 *   - flags anything awkward or wrong
 *   - emits a verdict (pass | warn | block) + issues + one learning line
 * It writes the result to outreach_qa_log and stores the normalized
 * display_first / display_company / display_greeting back on the contact's
 * custom_fields so the templates render human. Nothing is sent.
 *
 *   node tools/50_outreach_qa_agent.mjs --limit 12           # dry run, prints
 *   node tools/50_outreach_qa_agent.mjs --limit 25 --apply   # writes qa_log + names
 *
 * Reads SUPABASE_SERVICE_KEY + DEEPSEEK_API_KEY from dashboard/.env.local.
 */
import fs from "fs";

const SUPA_URL = "https://ryxgjzehoijjvczqkhwr.supabase.co";
const CAMPAIGN_NAME = "Match-Drop · 3 live matches + a site gap";
const APPLY = process.argv.includes("--apply");
const LIMIT = Number((process.argv.find((a) => a.startsWith("--limit=")) || "").split("=")[1])
  || Number(process.argv[process.argv.indexOf("--limit") + 1]) || 12;

function env(key) {
  if (process.env[key]) return process.env[key];
  const txt = fs.readFileSync("/Users/andreschuler/Caturepilot 2.0/dashboard/.env.local", "utf8");
  const m = txt.match(new RegExp(`^${key}\\s*=\\s*"?([^"\\n]+)"?`, "m"));
  if (!m) throw new Error(`${key} not found in dashboard/.env.local`);
  return m[1].trim();
}
const SVC = env("SUPABASE_SERVICE_KEY");
const GEMINI = env("GEMINI_API_KEY");
const MODEL = "gemini-2.5-flash";

const H = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" };
async function rest(path, opts = {}) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, { ...opts, headers: { ...H, ...(opts.headers || {}) } });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}

const SYS = `You are a sharp BD assistant cleaning up cold emails for a veteran-owned federal-contracting agency before a human sends them. You care about one thing: that each email reads like a real person wrote it to one specific company, not a mail merge.

Rules for your output:
- Names from SAM.gov arrive in ALL CAPS and as legal names. Convert to natural case and the real brand. Prefer the brand implied by the email domain over the legal name. Drop LLC / INC / CO / HOLDINGS when they make the name clunky. Example: company "ANDERSON BONELESS BEEF HOLDINGS LLC" + domain andersoncustommeats.com -> "Anderson Custom Meats".
- first_name in ALL CAPS like "MACK" -> "Mack". If first_name is missing, looks like a company, or is junk, set display_first to null and greeting to "Hi there,".
- Judge match_fit: do the matched federal contracts plausibly fit what this company sells (use company name, NAICS, domain)? "good" = clearly relevant, "partial" = loosely related, "mismatch" = wrong industry.
- Vet EACH of the matched contracts SEPARATELY against what this company actually does, and be strict. A plumbing-supply company matched to "Data Center Network Infrastructure", or a dance company matched to "Transportation Services", is wrong and must be dropped. Build "matches_clean" = ONLY the contract lines that a buyer would agree genuinely fit, copied VERBATIM (keep the exact wording, the agency, the percentage, everything, one per line). Move the ones you drop into "matches_dropped" with a one-line reason. Also drop any line that says the solicitation is suspended, closed, expired, or cancelled. ALSO read the "(~NN% fit)" number and keep ONLY matches of 66% or higher; drop anything 65% or lower. (66, 70, 74 are kept; 65, 63, 62 are dropped.) If, after all of this, no contract both genuinely fits AND is above 65%, set matches_clean to "" and verdict to "block" — we do not email this company.
- Do NOT flag "no federal experience / no certifications / no past performance visible on the website" as issues. That is normal for a cold prospect and the recipient never sees it. Only flag issues that make the EMAIL itself wrong or embarrassing to send: a garbled or clearly wrong name, a contract that does not fit the company (mismatch), a broken or nonsensical gap_line, or awkward/robotic phrasing. If there is nothing wrong with the email, return an empty issues array and verdict "pass".
- verdict "block" only when match_fit is "mismatch" or a data error makes the email embarrassing; "warn" for a partial fit or a minor fixable nit; otherwise "pass".
- Write the "icebreaker": the FIRST line of the email, one or two sentences, that sounds like a real person who actually looked at THIS company, texting a peer. It must name a CONCRETE, checkable thing about them: an actual product or service they sell, the city/state they operate in, a specific niche, how long they've been around. Pull it from findings_summary first; if findings_summary is "(none)", infer the concrete product category from the company name + NAICS + domain (e.g. "custom-cut beef", "janitorial and packaging supply", "CAD drafting"), never a vague label. Then land the opening in plain words: they're not bidding on government work, or have no federal footprint yet, or are leaving that money on the table.
  Hard bans (this is the whole point): never start with "Hey", "Quick one", "Hope this finds you", "I came across", "I noticed". NEVER use the words leverage, expertise, specializes in, strong fit, solutions, passionate, robust, or any flattery like "I love what you do". Do not use the stock phrases "leaving money on the table", "missed opportunity", or "money on the table" (overused across the batch); vary how you point at the gap. No restating their NAICS code. Two sentences max, no em-dashes. Write it the way a sharp BD person types a real first line, not the way marketing writes one.
- No em-dashes, no marketing fluff, no buzzwords. Plain and specific.
Return ONLY JSON.`;

function buildUser(c) {
  const cf = c.custom_fields || {};
  return `Company (raw SAM name): ${c.company_name}
First name (raw): ${c.first_name || "(none)"}
Email: ${c.email}
Domain: ${(c.email || "").split("@")[1] || ""}
State: ${c.state || ""}
NAICS: ${(c.naics_codes || []).join(", ")}
findings_summary: ${cf.findings_summary || "(none)"}
gap_line: ${cf.gap_line || "(none)"}
The 3 matched contracts (matches_block):
${cf.matches_block || "(none)"}

Return JSON with exactly these keys:
{
  "display_company": string,
  "display_first": string|null,
  "greeting": string,                // e.g. "Hi Mack," or "Hi there,"
  "icebreaker": string,              // the specific "I know you" first line (see rules) — 1-2 sentences, no generic opener
  "match_fit": "good"|"partial"|"mismatch",
  "match_fit_reason": string,        // one short sentence
  "matches_clean": string,           // ONLY the contract lines that genuinely fit, verbatim, newline-separated ("" if none fit)
  "matches_dropped": [{"line": string, "reason": string}],
  "issues": [{"type": string, "severity": "warn"|"error", "reason": string}],
  "verdict": "pass"|"warn"|"block",  // block if a mismatch or a real data error makes this email embarrassing to send
  "learnings": string                // one short sentence on any systemic data problem worth tracking, or "" if none
}`;
}

async function callModel(c) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYS }] },
        contents: [{ role: "user", parts: [{ text: buildUser(c) }] }],
        generationConfig: { temperature: 0.45, responseMimeType: "application/json" },
      }),
    }
  );
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const text = j?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("gemini: empty response");
  return JSON.parse(text);
}

(async () => {
  const campaign = (await rest(`outreach_campaigns?select=id,name&name=eq.${encodeURIComponent(CAMPAIGN_NAME)}`))[0];
  if (!campaign) throw new Error("campaign not found");

  const done = new Set((await rest(`outreach_qa_log?select=campaign_contact_id`)).map((r) => r.campaign_contact_id));
  const rows = await rest(
    `outreach_campaign_contacts?campaign_id=eq.${campaign.id}&status=eq.active` +
    `&select=id,contact_id,outreach_contacts!inner(id,company_name,first_name,email,naics_codes,state,custom_fields)` +
    `&order=added_at.asc&limit=${LIMIT * 3}`
  );
  const todo = rows.filter((r) => !done.has(r.id)).slice(0, LIMIT);
  console.log(`Campaign ${campaign.id} — ${todo.length} contacts to QA (apply=${APPLY})\n`);

  const learnings = [];
  let pass = 0, warn = 0, block = 0;
  for (const r of todo) {
    const c = r.outreach_contacts;
    let v;
    try { v = await callModel(c); }
    catch (e) { console.log(`  ! ${c.company_name}: ${e.message}`); continue; }
    v.verdict === "pass" ? pass++ : v.verdict === "warn" ? warn++ : block++;
    if (v.learnings) learnings.push(`- ${v.display_company}: ${v.learnings}`);

    const tag = v.verdict === "pass" ? "PASS " : v.verdict === "warn" ? "WARN " : "BLOCK";
    console.log(`[${tag}] ${c.company_name}  ->  ${v.display_company}`);
    console.log(`        ice: ${v.icebreaker}`);
    console.log(`        greeting: "${v.greeting}"   match_fit: ${v.match_fit} (${v.match_fit_reason})`);
    if (v.issues?.length) v.issues.forEach((i) => console.log(`        ! ${i.severity}: ${i.type} — ${i.reason}`));
    if (v.matches_dropped?.length) v.matches_dropped.forEach((d) => console.log(`        dropped: ${String(d.line).slice(0, 64)} (${d.reason})`));

    if (APPLY) {
      await rest(`outreach_qa_log`, {
        method: "POST", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          campaign_contact_id: r.id, contact_id: c.id, step_order: 1, model: MODEL,
          verdict: v.verdict, issues: v.issues || [],
          name_before: c.first_name, name_after: v.display_first,
          company_before: c.company_name, company_after: v.display_company,
          greeting: v.greeting, match_fit: v.match_fit, learnings: v.learnings || null,
        }),
      });
      const cf = { ...(c.custom_fields || {}), display_company: v.display_company, display_first: v.display_first || "", display_greeting: v.greeting, icebreaker: v.icebreaker || "", matches_clean: v.matches_clean || "", qa_match_fit: v.match_fit, qa_verdict: v.verdict };
      await rest(`outreach_contacts?id=eq.${c.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ custom_fields: cf }) });
    }
  }

  console.log(`\n=== batch ${todo.length}: ${pass} pass · ${warn} warn · ${block} block ===`);
  if (learnings.length) { console.log("\n=== what we learned (protocol) ==="); console.log(learnings.join("\n")); }
  if (!APPLY) console.log("\n(dry run — re-run with --apply to write qa_log + normalized names)");
})().catch((e) => { console.error(e); process.exit(1); });
