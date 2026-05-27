/**
 * Lead Brief pipeline — runs async via the worker queue for every new
 * marketing_leads row.
 *
 * For each lead we:
 *   1. Snapshot what we already know (apollo_data is populated by /api/leads
 *      before this runs).
 *   2. SAM.gov lookup by company name → UEI → registration + certs.
 *   3. LLM infers the 1-3 most likely primary NAICS codes for the company.
 *   4. Query opportunities table for the top 5 active matches in those NAICS.
 *   5. LLM writes a fit score (1-10), strategy summary, and a phone call
 *      script Andre can read off the screen.
 *   6. Persist brief to marketing_leads.lead_brief and email it to
 *      americurial@gmail.com.
 *
 * The whole thing is intentionally read-only against the lead — we never
 * mutate apollo_data or hubspot fields here. Re-running on the same lead
 * just overwrites lead_brief.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { callLLMJson } from "@/lib/llm/deepseek";
import { HUMAN_VOICE_RULES } from "@/lib/llm/humanizer";
import { searchSamByName, lookupSamEntity } from "@/lib/quick-checker-helpers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SbAny = SupabaseClient<any, any, any>;

const BRIEF_RECIPIENT = "americurial@gmail.com";
// Use the same verified sender other transactional emails use. From the
// existing email.ts patterns: "CapturePilot <hello@capturepilot.com>".
const BRIEF_SENDER = "CapturePilot Briefs <briefs@capturepilot.com>";

interface ApolloOrg {
    organization_name?: string | null;
    organization_website?: string | null;
    organization_size?: string | null;
    organization_industry?: string | null;
    organization_naics?: string[] | null;
    employees?: number | null;
    title?: string | null;
    linkedin_url?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    phone?: string | null;
    [k: string]: unknown;
}

interface SamSnapshot {
    uei: string;
    cage_code: string;
    state: string;
    website: string;
    sba_certifications: string[];
}

interface OpportunityMatch {
    id: string;
    title: string;
    agency: string | null;
    naics_code: string | null;
    response_deadline: string | null;
    estimated_value: number | null;
    notice_type: string | null;
    place_of_performance_state: string | null;
}

interface LLMBriefOutput {
    fit_score: number;            // 1-10
    fit_rationale: string;        // 1-2 sentences
    biggest_strength: string;     // 1 sentence
    biggest_risk: string;         // 1 sentence
    suggested_strategy: string;   // 2-3 sentences — what consulting angle to pitch
    call_script: string;          // multi-line, includes opener + 2-3 talk tracks + close
}

interface LeadBrief {
    generated_at: string;
    lead: {
        email: string;
        company: string | null;
        first_name: string | null;
        last_name: string | null;
        magnet_key: string;
        utm_source: string | null;
    };
    enrichment: {
        apollo_company: string | null;
        apollo_website: string | null;
        apollo_industry: string | null;
        apollo_employees: number | null;
        apollo_title: string | null;
        apollo_linkedin: string | null;
    };
    sam: SamSnapshot | null;
    likely_naics: string[];
    top_matches: OpportunityMatch[];
    ai: LLMBriefOutput;
}

interface LeadRow {
    id: string;
    email: string;
    company: string | null;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    magnet_key: string;
    utm_source: string | null;
    utm_campaign: string | null;
    apollo_data: ApolloOrg | null;
}

/**
 * Run the pipeline for one lead id. Returns the saved brief. Throws on
 * unrecoverable error so the worker retries.
 */
export async function generateLeadBrief(sb: SbAny, leadId: string): Promise<LeadBrief> {
    // 1. Pull the lead row + the Apollo enrichment that /api/leads already wrote.
    const { data: lead, error: leadErr } = await sb
        .from("marketing_leads")
        .select("id, email, company, first_name, last_name, phone, magnet_key, utm_source, utm_campaign, apollo_data")
        .eq("id", leadId)
        .maybeSingle() as { data: LeadRow | null; error: { message: string } | null };
    if (leadErr) throw new Error(`lead lookup: ${leadErr.message}`);
    if (!lead) throw new Error(`lead ${leadId} not found`);

    const apollo: ApolloOrg = lead.apollo_data || {};
    const companyName = apollo.organization_name || lead.company || null;

    // 2. SAM.gov — name → UEI → full entity. Both calls return null on miss
    //    (free-mail leads, unregistered companies); we just carry that null
    //    forward and let the LLM speak to it in the brief.
    let sam: SamSnapshot | null = null;
    if (companyName) {
        const uei = await searchSamByName(companyName);
        if (uei) {
            const entity = await lookupSamEntity(uei);
            if (entity) {
                sam = {
                    uei: entity.uei,
                    cage_code: entity.cage_code,
                    state: entity.state,
                    website: entity.website,
                    sba_certifications: entity.sba_certifications,
                };
            }
        }
    }

    // 3. LLM infers likely primary NAICS so we can pull opportunity matches.
    //    Apollo sometimes returns NAICS directly — use those if present and
    //    skip the LLM call (faster + free).
    let likelyNaics: string[] = (apollo.organization_naics || [])
        .map(n => String(n).trim())
        .filter(n => /^[0-9]{4,6}$/.test(n))
        .slice(0, 3);

    if (likelyNaics.length === 0 && (companyName || apollo.organization_website || apollo.organization_industry)) {
        try {
            const naicsResp = await callLLMJson<{ naics: string[] }>([
                {
                    role: "system",
                    content: "You map US companies to their 1-3 most likely primary 6-digit NAICS codes. Reply with strict JSON only: {\"naics\":[\"541330\",\"541618\"]}. No prose, no commentary. Use 6-digit codes; if you only know the 4-digit parent (e.g. industries like \"professional services\"), pick the closest 6-digit child you can justify.",
                },
                {
                    role: "user",
                    content: `Company: ${companyName || "(unknown name)"}
Website: ${apollo.organization_website || "(none)"}
Industry: ${apollo.organization_industry || "(none)"}
SAM cert list: ${sam?.sba_certifications.join(", ") || "(none)"}
Return up to 3 most-likely 6-digit NAICS codes for this company's federal-contracting work.`,
                },
            ], { temperature: 0, max_tokens: 200 });
            likelyNaics = (naicsResp.naics || [])
                .map(n => String(n).trim())
                .filter(n => /^[0-9]{6}$/.test(n))
                .slice(0, 3);
        } catch (e) {
            console.warn("[lead-brief] NAICS LLM call failed:", (e as Error).message);
        }
    }

    // 4. Top 5 active opportunity matches in those NAICS.
    let topMatches: OpportunityMatch[] = [];
    if (likelyNaics.length > 0) {
        const { data: opps } = await sb
            .from("opportunities")
            .select("id, title, agency, naics_code, response_deadline, estimated_value, notice_type, place_of_performance_state")
            .in("naics_code", likelyNaics)
            .in("status", ["ACTIVE", "EXPIRING_SOON"])
            .order("response_deadline", { ascending: true, nullsFirst: false })
            .limit(5) as { data: OpportunityMatch[] | null };
        topMatches = opps || [];
    }

    // 5. The actual brief — LLM picks a fit score, writes the strategy, and
    //    drafts a call script Andre can read off the screen.
    const briefAi = await draftBriefAI({
        lead,
        apollo,
        sam,
        likelyNaics,
        topMatches,
    });

    const brief: LeadBrief = {
        generated_at: new Date().toISOString(),
        lead: {
            email: lead.email,
            company: lead.company,
            first_name: lead.first_name,
            last_name: lead.last_name,
            magnet_key: lead.magnet_key,
            utm_source: lead.utm_source,
        },
        enrichment: {
            apollo_company: apollo.organization_name || null,
            apollo_website: apollo.organization_website || null,
            apollo_industry: apollo.organization_industry || null,
            apollo_employees: apollo.employees ?? null,
            apollo_title: apollo.title || null,
            apollo_linkedin: apollo.linkedin_url || null,
        },
        sam,
        likely_naics: likelyNaics,
        top_matches: topMatches,
        ai: briefAi,
    };

    // 6. Persist + email. The persist runs first so we have the brief even
    //    if Resend is rate-limiting; the email failure isn't fatal because
    //    the worker would just re-run and re-send.
    const { error: saveErr } = await sb
        .from("marketing_leads")
        .update({
            lead_brief: brief as unknown as Record<string, unknown>,
            lead_brief_status: "done",
        })
        .eq("id", lead.id);
    if (saveErr) throw new Error(`save brief: ${saveErr.message}`);

    const emailRes = await sendBriefEmail(brief);
    if (emailRes.sent) {
        await sb
            .from("marketing_leads")
            .update({
                lead_brief_sent_at: new Date().toISOString(),
                ...(emailRes.resendId ? { brief_resend_id: emailRes.resendId } : {}),
            })
            .eq("id", lead.id);
    } else if (emailRes.error) {
        console.warn(`[lead-brief] email to ${BRIEF_RECIPIENT} failed:`, emailRes.error);
    }

    return brief;
}

async function draftBriefAI(args: {
    lead: LeadRow;
    apollo: ApolloOrg;
    sam: SamSnapshot | null;
    likelyNaics: string[];
    topMatches: OpportunityMatch[];
}): Promise<LLMBriefOutput> {
    const { lead, apollo, sam, likelyNaics, topMatches } = args;
    const companyName = apollo.organization_name || lead.company || lead.email.split("@")[1];
    const personName = [lead.first_name || apollo.first_name, lead.last_name || apollo.last_name].filter(Boolean).join(" ");

    const dossier = [
        `LEAD INTAKE`,
        `Email: ${lead.email}`,
        `Name: ${personName || "(unknown)"}`,
        `Company: ${companyName}`,
        `Title at company: ${apollo.title || "(unknown)"}`,
        `Linkedin: ${apollo.linkedin_url || "(none found)"}`,
        `Magnet downloaded: ${lead.magnet_key}`,
        `UTM source: ${lead.utm_source || "(direct)"}`,
        ``,
        `COMPANY ENRICHMENT (Apollo)`,
        `Website: ${apollo.organization_website || "(unknown)"}`,
        `Industry: ${apollo.organization_industry || "(unknown)"}`,
        `Size: ${apollo.organization_size || "(unknown)"}`,
        `Employee count: ${apollo.employees ?? "(unknown)"}`,
        ``,
        `SAM.GOV REGISTRATION`,
        sam
            ? `Registered as ${companyName}, UEI ${sam.uei}, CAGE ${sam.cage_code || "(none)"}, state ${sam.state}, certs: ${sam.sba_certifications.join(", ") || "(none)"}`
            : `NOT registered. This is a barrier — fixable in ~1 week.`,
        ``,
        `LIKELY NAICS`,
        likelyNaics.length > 0 ? likelyNaics.join(", ") : "(could not infer)",
        ``,
        `TOP 5 ACTIVE OPPORTUNITY MATCHES`,
        topMatches.length === 0
            ? "(no active matches in our database for these NAICS)"
            : topMatches.map((m, i) =>
                `${i + 1}. ${m.title} (${m.agency || "unknown agency"}) — NAICS ${m.naics_code || "?"}, deadline ${m.response_deadline?.slice(0, 10) || "rolling"}, type ${m.notice_type || "?"}, value ${m.estimated_value ? `$${m.estimated_value.toLocaleString()}` : "unspecified"}`,
            ).join("\n"),
    ].join("\n");

    const systemPrompt = `${HUMAN_VOICE_RULES}

ROLE: You are briefing Andre — the founder of Americurial — for a phone follow-up call to a new lead who just downloaded one of our federal-contracting whitepapers. He'll be on the call in the next hour. Give him exactly what he needs.

Output strict JSON, no prose outside the JSON. Schema:
{
  "fit_score": <integer 1-10, how good a consulting prospect this is>,
  "fit_rationale": "<one or two sentences justifying the score>",
  "biggest_strength": "<one sentence — the asset this lead already has>",
  "biggest_risk": "<one sentence — the thing that could kill the conversion>",
  "suggested_strategy": "<two or three sentences — what consulting angle to pitch>",
  "call_script": "<multi-line script. Open with confirming receipt of the whitepaper. Then a personalized observation from the enrichment. Then 2-3 talk-track options based on whether they have SAM.gov, the NAICS we found, and the top match. Close with a soft ask for a 20-min strategy call. Sign with — Andre at the end. Use \\n for line breaks.>"
}

CRITICAL RULES for fit_score:
- 10 = SAM.gov registered + matching active opportunities + decision-maker title + 50+ employees
- 7-8 = SAM registered OR strong NAICS match OR decision-maker title (any two)
- 4-6 = enrichment landed but missing one of (SAM, NAICS match, contact title)
- 1-3 = free-mail lead OR no company info OR no NAICS overlap

The call script is the most important thing — Andre will literally read parts of it on the call. Lead with the personalization (use the specific match + specific NAICS), not boilerplate.`;

    return await callLLMJson<LLMBriefOutput>([
        { role: "system", content: systemPrompt },
        { role: "user", content: dossier },
    ], { temperature: 0.3, max_tokens: 1200 });
}

async function sendBriefEmail(brief: LeadBrief): Promise<{ sent: boolean; error?: string; resendId?: string }> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return { sent: false, error: "RESEND_API_KEY not set" };
    const resend = new Resend(apiKey);

    const subject = `[Lead] ${brief.ai.fit_score}/10 — ${brief.enrichment.apollo_company || brief.lead.company || brief.lead.email} (${brief.lead.magnet_key})`;

    const html = renderBriefHtml(brief);
    const text = renderBriefText(brief);

    try {
        const res = await resend.emails.send({
            from: BRIEF_SENDER,
            to: BRIEF_RECIPIENT,
            subject,
            html,
            text,
        });
        if (res.error) return { sent: false, error: res.error.message };
        return { sent: true, resendId: res.data?.id };
    } catch (e) {
        return { sent: false, error: (e as Error).message };
    }
}

function fmtMoney(n: number | null): string {
    if (!n) return "—";
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toLocaleString()}`;
}

function fmtDate(d: string | null): string {
    if (!d) return "rolling";
    return d.slice(0, 10);
}

function renderBriefHtml(b: LeadBrief): string {
    const scoreColor = b.ai.fit_score >= 8 ? "#059669" : b.ai.fit_score >= 5 ? "#d97706" : "#6b7280";
    const matchesHtml = b.top_matches.length === 0
        ? `<p style="color:#6b7280;margin:0;">No active opportunities in the inferred NAICS — likely needs us to find adjacent industries.</p>`
        : `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13px;">
            ${b.top_matches.map(m => `
              <tr>
                <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;vertical-align:top;">
                  <div style="font-weight:600;color:#111827;">${escapeHtml(m.title)}</div>
                  <div style="color:#6b7280;font-size:12px;margin-top:2px;">
                    ${escapeHtml(m.agency || "Unknown agency")} · NAICS ${m.naics_code || "?"} · ${escapeHtml(m.notice_type || "?")} · ${fmtMoney(m.estimated_value)}
                  </div>
                  <div style="color:#dc2626;font-size:12px;margin-top:2px;">Due ${fmtDate(m.response_deadline)}</div>
                </td>
              </tr>
            `).join("")}
          </table>`;

    return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
    <div style="padding:20px 24px;border-bottom:1px solid #e5e7eb;background:#fafafa;">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;color:#6b7280;text-transform:uppercase;">New Lead Brief</div>
      <div style="font-size:20px;font-weight:700;margin-top:4px;">${escapeHtml(b.enrichment.apollo_company || b.lead.company || b.lead.email)}</div>
      <div style="color:#6b7280;font-size:13px;margin-top:4px;">${escapeHtml([b.lead.first_name, b.lead.last_name].filter(Boolean).join(" ") || "(no name)")} · ${escapeHtml(b.lead.email)} · downloaded <code style="background:#e5e7eb;padding:1px 6px;border-radius:4px;font-size:12px;">${escapeHtml(b.lead.magnet_key)}</code></div>
    </div>

    <div style="padding:20px 24px;display:flex;gap:16px;align-items:center;border-bottom:1px solid #e5e7eb;">
      <div style="flex:0 0 80px;text-align:center;background:${scoreColor};color:#fff;border-radius:8px;padding:12px;">
        <div style="font-size:30px;font-weight:800;line-height:1;">${b.ai.fit_score}</div>
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em;margin-top:4px;opacity:0.9;">Fit Score</div>
      </div>
      <div style="flex:1;font-size:14px;">${escapeHtml(b.ai.fit_rationale)}</div>
    </div>

    <div style="padding:20px 24px;border-bottom:1px solid #e5e7eb;">
      <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;">Snapshot</div>
      <table cellpadding="0" cellspacing="0" style="font-size:13px;line-height:1.7;">
        <tr><td style="color:#6b7280;padding-right:16px;">Website</td><td>${escapeHtml(b.enrichment.apollo_website || "—")}</td></tr>
        <tr><td style="color:#6b7280;padding-right:16px;">Industry</td><td>${escapeHtml(b.enrichment.apollo_industry || "—")}</td></tr>
        <tr><td style="color:#6b7280;padding-right:16px;">Employees</td><td>${b.enrichment.apollo_employees ?? "—"}</td></tr>
        <tr><td style="color:#6b7280;padding-right:16px;">Title</td><td>${escapeHtml(b.enrichment.apollo_title || "—")}</td></tr>
        <tr><td style="color:#6b7280;padding-right:16px;">LinkedIn</td><td>${b.enrichment.apollo_linkedin ? `<a href="${escapeAttr(b.enrichment.apollo_linkedin)}">profile</a>` : "—"}</td></tr>
        <tr><td style="color:#6b7280;padding-right:16px;">SAM.gov</td><td>${b.sam ? `✅ UEI <code>${escapeHtml(b.sam.uei)}</code> · state ${escapeHtml(b.sam.state)} · ${b.sam.sba_certifications.length ? escapeHtml(b.sam.sba_certifications.join(", ")) : "no certs on file"}` : "❌ Not registered"}</td></tr>
        <tr><td style="color:#6b7280;padding-right:16px;">Likely NAICS</td><td>${b.likely_naics.length ? escapeHtml(b.likely_naics.join(", ")) : "—"}</td></tr>
      </table>
    </div>

    <div style="padding:20px 24px;border-bottom:1px solid #e5e7eb;">
      <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:12px;">Top 5 Active Matches</div>
      ${matchesHtml}
    </div>

    <div style="padding:20px 24px;border-bottom:1px solid #e5e7eb;">
      <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;">Strategy</div>
      <p style="margin:0 0 10px;font-size:14px;line-height:1.5;"><strong>Strength:</strong> ${escapeHtml(b.ai.biggest_strength)}</p>
      <p style="margin:0 0 10px;font-size:14px;line-height:1.5;"><strong>Risk:</strong> ${escapeHtml(b.ai.biggest_risk)}</p>
      <p style="margin:0;font-size:14px;line-height:1.5;">${escapeHtml(b.ai.suggested_strategy)}</p>
    </div>

    <div style="padding:20px 24px;background:#fef3c7;">
      <div style="font-size:11px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:10px;">Call Script</div>
      <pre style="white-space:pre-wrap;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.6;margin:0;color:#451a03;">${escapeHtml(b.ai.call_script)}</pre>
    </div>

    <div style="padding:14px 24px;background:#f9fafb;font-size:11px;color:#6b7280;text-align:center;">
      Brief generated ${new Date(b.generated_at).toUTCString()}
    </div>
  </div>
</body></html>`;
}

function renderBriefText(b: LeadBrief): string {
    return [
        `NEW LEAD — ${b.ai.fit_score}/10 fit`,
        `${b.enrichment.apollo_company || b.lead.company || b.lead.email}`,
        `${[b.lead.first_name, b.lead.last_name].filter(Boolean).join(" ") || "(no name)"} · ${b.lead.email}`,
        `Downloaded: ${b.lead.magnet_key}`,
        ``,
        `WHY ${b.ai.fit_score}/10: ${b.ai.fit_rationale}`,
        ``,
        `SNAPSHOT`,
        `- Website: ${b.enrichment.apollo_website || "—"}`,
        `- Industry: ${b.enrichment.apollo_industry || "—"}`,
        `- Employees: ${b.enrichment.apollo_employees ?? "—"}`,
        `- Title: ${b.enrichment.apollo_title || "—"}`,
        `- SAM.gov: ${b.sam ? `✅ ${b.sam.uei} (${b.sam.state}) certs=${b.sam.sba_certifications.join(",") || "none"}` : "❌ Not registered"}`,
        `- Likely NAICS: ${b.likely_naics.join(", ") || "—"}`,
        ``,
        `TOP MATCHES`,
        b.top_matches.length === 0 ? "(no active matches in inferred NAICS)" : b.top_matches.map((m, i) =>
            `${i + 1}. ${m.title} — ${m.agency || "?"} · NAICS ${m.naics_code} · due ${fmtDate(m.response_deadline)} · ${fmtMoney(m.estimated_value)}`,
        ).join("\n"),
        ``,
        `STRATEGY`,
        `Strength: ${b.ai.biggest_strength}`,
        `Risk: ${b.ai.biggest_risk}`,
        `Pitch: ${b.ai.suggested_strategy}`,
        ``,
        `CALL SCRIPT`,
        b.ai.call_script,
    ].join("\n");
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]!);
}
function escapeAttr(s: string): string {
    return escapeHtml(s);
}

/**
 * Enqueue a brief-generation job. Called from /api/leads after the
 * Apollo+HubSpot+Resend pipeline finishes, and from the admin backfill
 * endpoint for existing leads.
 */
export async function enqueueLeadBrief(sb: SbAny, leadId: string): Promise<void> {
    await sb.from("worker_jobs").insert({
        task_type: "enrich_lead_brief",
        payload: { lead_id: leadId },
        priority: 6,
    });
    await sb
        .from("marketing_leads")
        .update({ lead_brief_status: "pending" })
        .eq("id", leadId);
}
