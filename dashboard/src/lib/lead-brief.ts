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
    call_script: string;          // multi-line, includes opener + 2-3 talk tracks + close
    // Legacy fields — older briefs persisted these. Kept optional so JSON
    // parsing of stored briefs doesn't break, but the new template doesn't
    // render them and the LLM no longer fills them in.
    biggest_strength?: string;
    biggest_risk?: string;
    suggested_strategy?: string;
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
        phone: string | null;
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
    website_summary: QuickSiteSummary | null;
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
    meta_leadgen_id?: string | null;
}

/**
 * Re-fetch a Facebook lead from Graph API to recover the phone number when
 * marketing_leads.phone is null. The webhook tries to capture phone_number
 * but some forms use custom field names — this re-reads the raw field_data
 * and looks across the standard variants. Returns null on any failure (logged,
 * never throws — phone is a nice-to-have, not a blocker).
 */
async function refetchMetaLeadPhone(leadgenId: string): Promise<string | null> {
    const token = process.env.META_SYSTEM_TOKEN;
    if (!token) return null;
    try {
        const res = await fetch(
            `https://graph.facebook.com/v21.0/${encodeURIComponent(leadgenId)}?fields=field_data`,
            { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) },
        );
        if (!res.ok) return null;
        const data = await res.json() as { field_data?: Array<{ name: string; values: string[] }> };
        const fields: Record<string, string> = {};
        for (const f of data.field_data || []) {
            fields[f.name.toLowerCase()] = f.values?.[0] || "";
        }
        // Try every reasonable variant — FB form builders use whichever name.
        return (
            fields.phone_number ||
            fields.phone ||
            fields.mobile_phone ||
            fields.mobile ||
            fields.cell_phone ||
            fields.work_phone ||
            null
        ) || null;
    } catch {
        return null;
    }
}

/**
 * Free-mail domain check. We do NOT treat these as the company website
 * because the address belongs to the personal mailbox provider, not the lead's
 * employer.
 */
const FREEMAIL_DOMAINS = new Set([
    "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "ymail.com",
    "outlook.com", "hotmail.com", "live.com", "msn.com",
    "aol.com", "icloud.com", "me.com", "mac.com",
    "protonmail.com", "proton.me", "pm.me",
    "gmx.com", "gmx.de", "gmx.net", "web.de", "t-online.de",
    "mail.com", "zoho.com", "yandex.com", "fastmail.com", "tutanota.com",
    "duck.com", "qq.com", "163.com", "126.com",
]);

function isFreeMailDomain(domain: string): boolean {
    return FREEMAIL_DOMAINS.has(domain.toLowerCase());
}

/**
 * Pull a company website from an email address when the domain is a real
 * company domain (not free mail). For "jane@acme.com" this returns
 * "https://acme.com". For "jane@gmail.com" this returns null.
 */
function websiteFromEmail(email: string): string | null {
    const parts = email.toLowerCase().split("@");
    if (parts.length !== 2) return null;
    const domain = parts[1].trim();
    if (!domain || isFreeMailDomain(domain)) return null;
    return `https://${domain}`;
}

/**
 * For free-mail leads we ask gpt-4o-mini to guess the most likely company
 * website domain given the company name (e.g. "Solid Ground Property Solutions"
 * → "solidgroundpropertysolutions.com"). Then we HEAD-check the URL and only
 * trust it if it returns 200/30x. Cheap fallback: better than nothing, but
 * never accepted without the live probe so we don't email the partner a
 * hallucinated URL.
 */
async function guessCompanyWebsite(companyName: string): Promise<string | null> {
    if (!companyName || companyName.length < 3) return null;
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) return null;

    let guessUrl: string | null = null;
    try {
        const client = new (await import("openai")).default({ apiKey: openaiKey });
        const completion = await client.chat.completions.create({
            model: "gpt-4o-mini",
            response_format: { type: "json_object" },
            temperature: 0,
            max_tokens: 80,
            messages: [
                {
                    role: "system",
                    content: `Given a US small-business name, return the single most likely website URL. Reply with strict JSON: {"url":"https://example.com"} or {"url":null} if uncertain. Prefer .com over other TLDs, avoid social-media URLs, no http://www. prefixes — just the bare domain. If the name is a sole proprietor or generic ("Test Co", "N/A"), return null.`,
                },
                { role: "user", content: companyName },
            ],
        });
        const raw = completion.choices[0]?.message?.content || "{}";
        const parsed = JSON.parse(raw) as { url?: string | null };
        if (parsed.url && typeof parsed.url === "string" && parsed.url.startsWith("http")) {
            guessUrl = parsed.url;
        }
    } catch {
        return null;
    }
    if (!guessUrl) return null;

    // HEAD probe so we don't trust an LLM hallucination. 200/30x = real site.
    try {
        const res = await fetch(guessUrl, {
            method: "HEAD",
            redirect: "follow",
            signal: AbortSignal.timeout(4000),
            headers: { "user-agent": "Mozilla/5.0 (capturepilot-lead-brief)" },
        });
        if (res.ok || (res.status >= 300 && res.status < 400)) return guessUrl;
        return null;
    } catch {
        // Some sites refuse HEAD. Try a GET with cheap timeout as a fallback —
        // if it loads at all, we'll trust the URL.
        try {
            const res2 = await fetch(guessUrl, { signal: AbortSignal.timeout(4000), headers: { "user-agent": "Mozilla/5.0 (capturepilot-lead-brief)" } });
            return res2.ok ? guessUrl : null;
        } catch {
            return null;
        }
    }
}

/**
 * Resolve a company website using everything we know, in priority order:
 *   1. Apollo's organization_website (when present)
 *   2. SAM.gov's registered URL (when present)
 *   3. The email domain — IFF it's not a free-mail provider
 *   4. An LLM-guessed domain from the company name, validated with a HEAD probe
 *
 * Returns null only when ALL four fail. The brief renders "(no website)" only
 * for truly orphaned free-mail leads with no company name.
 */
async function resolveCompanyWebsite(args: {
    apolloWebsite: string | null | undefined;
    samWebsite: string | null | undefined;
    email: string;
    companyName: string | null;
}): Promise<string | null> {
    const { apolloWebsite, samWebsite, email, companyName } = args;
    if (apolloWebsite && apolloWebsite.length > 3) return normalizeUrl(apolloWebsite);
    if (samWebsite && samWebsite.length > 3) return normalizeUrl(samWebsite);
    const fromEmail = websiteFromEmail(email);
    if (fromEmail) return fromEmail;
    if (companyName) {
        const guess = await guessCompanyWebsite(companyName);
        if (guess) return guess;
    }
    return null;
}

function normalizeUrl(u: string): string {
    return /^https?:\/\//.test(u) ? u : `https://${u}`;
}

/**
 * Quick website summary via OpenAI when Apollo is unavailable. Fetches the
 * homepage, strips it to plain text, asks gpt-4o-mini for a 3-line summary:
 * what they do, who they serve, federal-contracting signals. Caps at 6s end-to-end
 * so it can't blow the per-lead time budget. Returns null on any failure —
 * the brief just runs without the summary.
 */
interface QuickSiteSummary { what_they_do: string; who_they_serve: string; gov_signals: string }

async function quickWebsiteSummary(websiteOrEmail: string): Promise<QuickSiteSummary | null> {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) return null;
    let url = websiteOrEmail;
    if (url.includes("@")) {
        const domain = url.split("@")[1];
        if (!domain || /^(gmail|yahoo|outlook|hotmail|aol|icloud|protonmail)\./i.test(domain)) return null;
        url = `https://${domain}`;
    }
    if (!/^https?:\/\//.test(url)) url = `https://${url}`;
    let html = "";
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(4000), headers: { "user-agent": "Mozilla/5.0 (capturepilot-lead-brief)" } });
        if (!res.ok) return null;
        html = await res.text();
    } catch {
        return null;
    }
    // Crude text extraction — keep first 8k chars to leave headroom for the LLM call.
    const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 8000);
    if (text.length < 50) return null;

    try {
        const client = new (await import("openai")).default({ apiKey: openaiKey });
        const completion = await client.chat.completions.create({
            model: "gpt-4o-mini",
            response_format: { type: "json_object" },
            temperature: 0,
            max_tokens: 250,
            messages: [
                {
                    role: "system",
                    content: `You read a company homepage and return strict JSON describing the business for a federal-contracting BD call. Schema: {"what_they_do":"<one sentence>","who_they_serve":"<one sentence>","gov_signals":"<one sentence — mentions of SAM, NAICS, set-asides, federal/state/local clients, certifications; or 'none visible' if absent>"}.`,
                },
                { role: "user", content: text },
            ],
        });
        const raw = completion.choices[0]?.message?.content || "{}";
        const parsed = JSON.parse(raw);
        if (!parsed.what_they_do) return null;
        return parsed as QuickSiteSummary;
    } catch {
        return null;
    }
}

/**
 * Run the pipeline for one lead id. Returns the saved brief. Throws on
 * unrecoverable error so the worker retries.
 */
export async function generateLeadBrief(sb: SbAny, leadId: string): Promise<LeadBrief> {
    // 1. Pull the lead row + the Apollo enrichment that /api/leads already wrote.
    const { data: lead, error: leadErr } = await sb
        .from("marketing_leads")
        .select("id, email, company, first_name, last_name, phone, magnet_key, utm_source, utm_campaign, apollo_data, meta_leadgen_id")
        .eq("id", leadId)
        .maybeSingle() as { data: LeadRow | null; error: { message: string } | null };
    if (leadErr) throw new Error(`lead lookup: ${leadErr.message}`);
    if (!lead) throw new Error(`lead ${leadId} not found`);

    const apollo: ApolloOrg = lead.apollo_data || {};
    const companyName = apollo.organization_name || lead.company || null;

    // 1b. Phone recovery — Apollo's monthly cap is hit, so we lean on the
    //     raw FB Lead Ad payload. If we already have a phone on the lead
    //     row we trust it; otherwise re-fetch from Graph API which still
    //     has the original field_data for ~90 days.
    let phone = (lead.phone || apollo.phone || "").trim() || null;
    if (!phone && lead.meta_leadgen_id) {
        phone = await refetchMetaLeadPhone(lead.meta_leadgen_id);
        if (phone) {
            await sb.from("marketing_leads")
                .update({ phone })
                .eq("id", lead.id)
                .then(({ error }) => { if (error) console.warn("[lead-brief] phone backfill non-fatal:", error.message); });
        }
    }

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

    // 4b. Website resolution — walks the priority chain (Apollo → SAM →
    //     email domain → LLM-guess validated by HEAD probe) and returns the
    //     best URL we can establish. Then the LLM crawls + summarizes that
    //     URL. Timeboxed end-to-end so it can't blow the per-lead budget.
    const resolvedWebsite = await resolveCompanyWebsite({
        apolloWebsite: apollo.organization_website,
        samWebsite: sam?.website,
        email: lead.email,
        companyName,
    });
    const websiteSummary = resolvedWebsite ? await quickWebsiteSummary(resolvedWebsite) : null;

    // 5. The actual brief — LLM picks a fit score, writes the strategy, and
    //    drafts a call script Andre can read off the screen.
    const briefAi = await draftBriefAI({
        lead,
        apollo,
        sam,
        likelyNaics,
        topMatches,
        websiteSummary,
        phone,
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
            phone,
        },
        enrichment: {
            apollo_company: apollo.organization_name || null,
            apollo_website: resolvedWebsite || apollo.organization_website || sam?.website || null,
            apollo_industry: apollo.organization_industry || null,
            apollo_employees: apollo.employees ?? null,
            apollo_title: apollo.title || null,
            apollo_linkedin: apollo.linkedin_url || null,
        },
        sam,
        likely_naics: likelyNaics,
        top_matches: topMatches,
        website_summary: websiteSummary,
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

/**
 * Build the brief end-to-end and render its email forms WITHOUT persisting
 * or sending. Lets the admin preview the exact rendered output before we
 * fire a batch — useful when iterating on the template.
 */
export async function previewLeadBrief(sb: SbAny, leadId: string): Promise<{
    brief: LeadBrief;
    subject: string;
    text: string;
    html: string;
}> {
    // Wrap generateLeadBrief by temporarily routing the DB calls + email
    // calls through stubs. Simpler than maintaining two near-identical
    // pipelines side-by-side; the cost is one no-op insert path.
    //
    // We achieve this by reading the lead row + running the full pipeline
    // inline. This duplicates the structure of generateLeadBrief but skips
    // the persist + send steps. Worth the small duplication — keeps each
    // function readable and the test surface explicit.
    const { data: lead, error: leadErr } = await sb
        .from("marketing_leads")
        .select("id, email, company, first_name, last_name, phone, magnet_key, utm_source, utm_campaign, apollo_data, meta_leadgen_id")
        .eq("id", leadId)
        .maybeSingle() as { data: LeadRow | null; error: { message: string } | null };
    if (leadErr) throw new Error(`lead lookup: ${leadErr.message}`);
    if (!lead) throw new Error(`lead ${leadId} not found`);

    const apollo: ApolloOrg = lead.apollo_data || {};
    const companyName = apollo.organization_name || lead.company || null;

    let phone = (lead.phone || apollo.phone || "").trim() || null;
    if (!phone && lead.meta_leadgen_id) {
        phone = await refetchMetaLeadPhone(lead.meta_leadgen_id);
    }

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

    let likelyNaics: string[] = (apollo.organization_naics || [])
        .map(n => String(n).trim())
        .filter(n => /^[0-9]{4,6}$/.test(n))
        .slice(0, 3);

    if (likelyNaics.length === 0 && (companyName || apollo.organization_website || apollo.organization_industry)) {
        try {
            const naicsResp = await callLLMJson<{ naics: string[] }>([
                { role: "system", content: "You map US companies to their 1-3 most likely primary 6-digit NAICS codes. Reply with strict JSON only: {\"naics\":[\"541330\",\"541618\"]}. No prose." },
                { role: "user", content: `Company: ${companyName || "(unknown)"}\nWebsite: ${apollo.organization_website || "(none)"}\nIndustry: ${apollo.organization_industry || "(none)"}\nReturn up to 3 most-likely 6-digit NAICS codes for this company's federal-contracting work.` },
            ], { temperature: 0, max_tokens: 200 });
            likelyNaics = (naicsResp.naics || []).map(n => String(n).trim()).filter(n => /^[0-9]{6}$/.test(n)).slice(0, 3);
        } catch { /* preview can tolerate empty NAICS */ }
    }

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

    const resolvedWebsite = await resolveCompanyWebsite({
        apolloWebsite: apollo.organization_website,
        samWebsite: sam?.website,
        email: lead.email,
        companyName,
    });
    const websiteSummary = resolvedWebsite ? await quickWebsiteSummary(resolvedWebsite) : null;

    const briefAi = await draftBriefAI({ lead, apollo, sam, likelyNaics, topMatches, websiteSummary, phone });

    const brief: LeadBrief = {
        generated_at: new Date().toISOString(),
        lead: { email: lead.email, company: lead.company, first_name: lead.first_name, last_name: lead.last_name, magnet_key: lead.magnet_key, utm_source: lead.utm_source, phone },
        enrichment: {
            apollo_company: apollo.organization_name || null,
            apollo_website: resolvedWebsite || apollo.organization_website || sam?.website || null,
            apollo_industry: apollo.organization_industry || null,
            apollo_employees: apollo.employees ?? null,
            apollo_title: apollo.title || null,
            apollo_linkedin: apollo.linkedin_url || null,
        },
        sam,
        likely_naics: likelyNaics,
        top_matches: topMatches,
        website_summary: websiteSummary,
        ai: briefAi,
    };

    const subject = `New Facebook lead · ${brief.ai.fit_score}/10 · ${brief.enrichment.apollo_company || brief.lead.company || brief.lead.email}`;
    return {
        brief,
        subject,
        text: renderBriefText(brief),
        html: renderBriefHtml(brief),
    };
}

async function draftBriefAI(args: {
    lead: LeadRow;
    apollo: ApolloOrg;
    sam: SamSnapshot | null;
    likelyNaics: string[];
    topMatches: OpportunityMatch[];
    websiteSummary: QuickSiteSummary | null;
    phone: string | null;
}): Promise<LLMBriefOutput> {
    const { lead, apollo, sam, likelyNaics, topMatches, websiteSummary, phone } = args;
    const companyName = apollo.organization_name || lead.company || lead.email.split("@")[1];
    const personName = [lead.first_name || apollo.first_name, lead.last_name || apollo.last_name].filter(Boolean).join(" ");

    const dossier = [
        `LEAD INTAKE`,
        `Email: ${lead.email}`,
        `Phone: ${phone || "(none captured)"}`,
        `Name: ${personName || "(unknown)"}`,
        `Company: ${companyName}`,
        `Title at company: ${apollo.title || "(unknown)"}`,
        `Linkedin: ${apollo.linkedin_url || "(none found)"}`,
        `Magnet downloaded: ${lead.magnet_key}`,
        `UTM source: ${lead.utm_source || "(direct)"}`,
        ``,
        `COMPANY ENRICHMENT`,
        `Website: ${apollo.organization_website || sam?.website || "(unknown)"}`,
        `Industry: ${apollo.organization_industry || "(unknown)"}`,
        `Size: ${apollo.organization_size || "(unknown)"}`,
        `Employee count: ${apollo.employees ?? "(unknown)"}`,
        ``,
        websiteSummary
            ? `WEBSITE SUMMARY (live crawl)
What they do: ${websiteSummary.what_they_do}
Who they serve: ${websiteSummary.who_they_serve}
Gov-contracting signals: ${websiteSummary.gov_signals}
`
            : `WEBSITE SUMMARY: (could not pull homepage — likely free-mail lead or site blocked the crawler)`,
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

ROLE: You are briefing SERGIO — partner at Americurial — for a follow-up phone call to a new lead who just submitted a Facebook lead form to download one of our federal-contracting whitepapers. Sergio will be on the call within the hour. Give him exactly what he needs.

Output strict JSON, no prose outside the JSON. Schema:
{
  "fit_score": <integer 1-10, how good a consulting prospect this is>,
  "fit_rationale": "<one or two sentences justifying the score>",
  "call_script": "<multi-line script Sergio will speak from. Use \\n for paragraph breaks.>"
}

CRITICAL RULES for fit_score:
- 10 = SAM.gov registered + matching active opportunities + decision-maker title + 50+ employees
- 7-8 = SAM registered OR strong NAICS match OR decision-maker title (any two)
- 4-6 = enrichment landed but missing one of (SAM, NAICS match, contact title)
- 1-3 = free-mail lead OR no company info OR no NAICS overlap

CRITICAL RULES for call_script — read these carefully, the prior templates were too salesy:

- Caller is SERGIO, not Andre. End with "— Sergio".
- DO NOT open as a sales pitch. The legitimate reason for the call is to
  confirm the PDF was actually delivered to their inbox. The campaign was
  set up recently and we want to make sure the email automation works.
- Opening line MUST be a delivery-confirmation question. Template:
  "Hey [first_name], this is Sergio from Americurial. Quick one — did the
  PDF actually land in your inbox? We set up the email automation pretty
  recently and I'm calling new signups to make sure it's getting through."
- They will respond one of three ways. Write a SHORT (1-2 line) reply for each:
    a) "Yeah I got it" → "Perfect, thanks for confirming."
    b) "Haven't checked" → "No worries — would you mind taking a quick peek
       while we're on? It's from briefs@capturepilot.com. I want to make
       sure it didn't go to spam."
    c) "No I didn't get it" → "Got it, I'll resend right now while we're on
       — what's the best email?"
- AFTER the delivery check, pivot OPEN-ENDED — not a pitch. Template:
  "And while I have you — what got you interested in federal contracting?
  Have you bid on any government contracts before?"
- Then leave room for them to talk. The script should explicitly say
  "[listen]" or "[let them answer]" so Sergio doesn't barrel over them.
- IF top_matches contains good fits, suggest ONE — by name + agency, NOT
  by NAICS code. Frame it casually: "Funny enough, I saw something pop up
  the other day — [agency] is putting out a [opp title], looks like the
  kind of thing your shop could chase." Skip this if no matches or matches
  are clearly irrelevant.
- Close SOFT: "If you want, I can send over a one-pager of opps that match
  what you do — no commitment, just reply with a 'sure' or 'pass'."
- Use natural spoken English. Contractions, partial sentences, "and",
  "so", "well", "I mean" are all fine. Avoid corporate-speak ("synergies",
  "vertical", "go-to-market").
- Total script under 200 words.`;

    return await callLLMJson<LLMBriefOutput>([
        { role: "system", content: systemPrompt },
        { role: "user", content: dossier },
    ], { temperature: 0.3, max_tokens: 1200 });
}

async function sendBriefEmail(brief: LeadBrief): Promise<{ sent: boolean; error?: string; resendId?: string }> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return { sent: false, error: "RESEND_API_KEY not set" };
    const resend = new Resend(apiKey);

    const subject = `New Facebook lead · ${brief.ai.fit_score}/10 · ${brief.enrichment.apollo_company || brief.lead.company || brief.lead.email}`;

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

    // Quick-action row — the thing the partner came here for. Click-to-call
    // is the headline button when we have a phone (works on iOS Mail, Gmail
    // mobile, GSuite desktop with click-to-call extensions); the other buttons
    // open the company website / their LinkedIn / their SAM record in new tabs.
    const websiteHref = (() => {
        const w = b.enrichment.apollo_website;
        if (!w) return null;
        return /^https?:\/\//.test(w) ? w : `https://${w}`;
    })();
    const linkedinSearch = b.lead.first_name && b.lead.last_name && b.enrichment.apollo_company
        ? `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${b.lead.first_name} ${b.lead.last_name} ${b.enrichment.apollo_company}`)}`
        : b.enrichment.apollo_linkedin || null;
    const samHref = b.sam?.uei ? `https://sam.gov/entity/${b.sam.uei}/coreData` : null;
    const ctaBtn = (href: string, label: string, primary = false) =>
        `<a href="${escapeAttr(href)}" style="display:inline-block;padding:10px 16px;margin:0 6px 6px 0;font-size:13px;font-weight:700;text-decoration:none;border-radius:8px;${primary ? "background:#059669;color:#fff;" : "background:#fff;color:#111827;border:1px solid #d1d5db;"}">${escapeHtml(label)}</a>`;
    const ctaRowHtml = `<div style="padding:18px 24px;background:#ecfdf5;border-bottom:1px solid #e5e7eb;">
      <div style="font-size:11px;font-weight:700;color:#065f46;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:10px;">Quick actions</div>
      ${b.lead.phone ? ctaBtn(`tel:${b.lead.phone.replace(/[^0-9+]/g, "")}`, `📞 Call ${b.lead.phone}`, true) : ""}
      ${ctaBtn(`mailto:${b.lead.email}?subject=${encodeURIComponent("Re: your federal-contracting question")}`, `✉️ Reply`)}
      ${websiteHref ? ctaBtn(websiteHref, "🌐 Open website") : ""}
      ${linkedinSearch ? ctaBtn(linkedinSearch, "🔍 Find on LinkedIn") : ""}
      ${samHref ? ctaBtn(samHref, "🏛 SAM.gov record") : ""}
      ${!b.lead.phone ? `<div style="margin-top:8px;font-size:11px;color:#92400e;">No phone captured from the Lead Ad — reply via email above.</div>` : ""}
    </div>`;

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

    ${ctaRowHtml}

    ${b.website_summary ? `<div style="padding:20px 24px;border-bottom:1px solid #e5e7eb;background:#f9fafb;">
      <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;">What they do (from website)</div>
      <p style="margin:0 0 6px;font-size:13px;line-height:1.5;"><strong>Business:</strong> ${escapeHtml(b.website_summary.what_they_do)}</p>
      <p style="margin:0 0 6px;font-size:13px;line-height:1.5;"><strong>Customers:</strong> ${escapeHtml(b.website_summary.who_they_serve)}</p>
      <p style="margin:0;font-size:13px;line-height:1.5;"><strong>GovCon signals:</strong> ${escapeHtml(b.website_summary.gov_signals)}</p>
    </div>` : ""}

    <div style="padding:20px 24px;border-bottom:1px solid #e5e7eb;">
      <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;">Snapshot</div>
      <table cellpadding="0" cellspacing="0" style="font-size:13px;line-height:1.7;">
        <tr><td style="color:#6b7280;padding-right:16px;">Name</td><td><strong>${escapeHtml([b.lead.first_name, b.lead.last_name].filter(Boolean).join(" ") || "—")}</strong></td></tr>
        <tr><td style="color:#6b7280;padding-right:16px;">Phone</td><td>${b.lead.phone ? `<a href="tel:${escapeAttr(b.lead.phone.replace(/[^0-9+]/g, ""))}" style="color:#059669;font-weight:600;">${escapeHtml(b.lead.phone)}</a>` : "—"}</td></tr>
        <tr><td style="color:#6b7280;padding-right:16px;">Email</td><td><a href="mailto:${escapeAttr(b.lead.email)}">${escapeHtml(b.lead.email)}</a></td></tr>
        <tr><td style="color:#6b7280;padding-right:16px;">Website</td><td>${b.enrichment.apollo_website ? `<a href="${escapeAttr(/^https?:\/\//.test(b.enrichment.apollo_website) ? b.enrichment.apollo_website : `https://${b.enrichment.apollo_website}`)}" target="_blank" rel="noopener">${escapeHtml(b.enrichment.apollo_website)}</a>` : "—"}</td></tr>
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
    const fullName = [b.lead.first_name, b.lead.last_name].filter(Boolean).join(" ") || "(no name)";
    return [
        `NEW FACEBOOK LEAD · ${b.ai.fit_score}/10`,
        `${b.enrichment.apollo_company || b.lead.company || b.lead.email}`,
        `${fullName} · ${b.lead.email}`,
        b.lead.phone ? `📞 ${b.lead.phone}  (tap to call on mobile)` : `📞 (no phone captured)`,
        ``,
        `WHY ${b.ai.fit_score}/10: ${b.ai.fit_rationale}`,
        ``,
        b.website_summary ? `WEBSITE SUMMARY
- ${b.website_summary.what_they_do}
- Serves: ${b.website_summary.who_they_serve}
- GovCon signals: ${b.website_summary.gov_signals}
` : `WEBSITE SUMMARY: (could not pull)`,
        ``,
        `SNAPSHOT`,
        `- Name: ${fullName}`,
        `- Phone: ${b.lead.phone || "—"}`,
        `- Email: ${b.lead.email}`,
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
