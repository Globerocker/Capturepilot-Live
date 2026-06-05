/**
 * Backfill: run Quick Checker on Facebook lead-ad submissions with a
 * business-email domain, then push the resulting brief to HubSpot.
 *
 * Why this exists
 * ---------------
 * The Meta lead-ad form gives us name/email/phone but no website. For the
 * 29 FB leads with a real business email domain (not gmail/yahoo/ISP), the
 * email's domain IS the website — so we can run the same /check pipeline
 * against it, then push the strategic brief + firmographics to HubSpot
 * with the lead's actual contact info.
 *
 * Pipeline per lead
 * -----------------
 *  1. Look up existing company_analyses by domain (ILIKE on website).
 *  2. If not found OR status !in ('complete','awaiting_confirmation'):
 *     a. POST /api/analyze-company { website, company_name } → analysis_id
 *     b. POST /api/analyze-company/run/[id]   (starts pipeline)
 *     c. Poll Supabase for status='awaiting_confirmation' (max 6 min)
 *  3. INJECT the FB lead's contact info into the analysis row directly:
 *     - lead_email, lead_phone
 *     - inferred_profile.contact_person = { first_name, last_name, name, email, phone }
 *  4. Call pushQuickCheckerBriefToHubSpot directly (same helper used by
 *     the live /api/lead-magnet/confirm flow + the existing analyses
 *     backfill). Honors Phase 22 — multi-select certs, firmographics on
 *     the company, standard fields where possible.
 *  5. Stamp marketing_leads.hubspot_contact_id + hubspot_synced_at.
 *
 * Safe to re-run — HubSpot upsert dedupes by email, Supabase steps no-op
 * when the analysis is already complete. Concurrency capped at 2 to stay
 * polite against Firecrawl + the LLM cascade.
 *
 * Usage:
 *   cd dashboard
 *   set -a; source .env.vercel.production; set +a
 *   npx tsx scripts/backfill-fb-leads-quickcheck.ts             # all
 *   npx tsx scripts/backfill-fb-leads-quickcheck.ts --limit 1   # smoke
 *   npx tsx scripts/backfill-fb-leads-quickcheck.ts --id <uuid> # one
 */

import { createClient } from "@supabase/supabase-js";
import { pushQuickCheckerBriefToHubSpot } from "../src/lib/hubspot-brief";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.capturepilot.com";
const CONCURRENCY = 2;
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 6 * 60_000;

const FREE_DOMAINS = new Set([
    "gmail.com","yahoo.com","hotmail.com","outlook.com","aol.com","icloud.com","me.com",
    "live.com","msn.com","protonmail.com","proton.me","gmx.com","gmx.de","gmx.net",
    "web.de","t-online.de","yandex.com","mail.com","ymail.com","rocketmail.com",
    "zoho.com","tutanota.com","fastmail.com","duck.com","googlemail.com","hotmail.co.uk",
    "verizon.net","comcast.net","sbcglobal.net","att.net","charter.net","cox.net",
    "earthlink.net","optimum.net","optonline.net","prodigy.net","frontier.com",
    "frontiernet.net","windstream.net","centurylink.net","suddenlink.net",
    "mediacombb.net","twc.com","rr.com","bellsouth.net","swbell.net","pacbell.net",
    "ameritech.net","snet.net","q.com","embarqmail.com",
]);

interface FbLead {
    id: string;
    email: string;
    company: string | null;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    hubspot_contact_id: string | null;
}

function domainOf(email: string): string {
    return email.split("@")[1]?.trim().toLowerCase() || "";
}

function isBusinessDomain(domain: string): boolean {
    if (!domain) return false;
    if (FREE_DOMAINS.has(domain)) return false;
    if (/\.(online|click|xyz|top|tk|ml|ga|cf|gq)$/i.test(domain)) return false;
    return true;
}

async function postJson<T = unknown>(path: string, body: Record<string, unknown>, timeoutMs = 30_000): Promise<T> {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
        const res = await fetch(`${APP_URL}${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: ac.signal,
        });
        const text = await res.text();
        if (!res.ok) throw new Error(`${path} → ${res.status}: ${text.slice(0, 300)}`);
        return text ? JSON.parse(text) : ({} as T);
    } finally {
        clearTimeout(t);
    }
}

interface AnalysisRow {
    id: string;
    status: string | null;
    website: string | null;
    company_name: string | null;
    lead_email: string | null;
    lead_phone: string | null;
    preview_matches: unknown[] | null;
    crawl_data: Record<string, unknown> | null;
    inferred_profile: Record<string, unknown> | null;
    reconciled_profile: unknown;
    firmographics: unknown;
    readiness_score: number | null;
}

async function ensureAnalysis(
    sb: ReturnType<typeof createClient>,
    domain: string,
    companyName: string,
): Promise<AnalysisRow> {
    // 1. Reuse existing analysis if we already crawled this domain.
    const { data: existing } = await sb
        .from("company_analyses")
        .select("*")
        .ilike("website", `%${domain}%`)
        .order("created_at", { ascending: false })
        .limit(1);
    if (existing && existing.length > 0) {
        const row = existing[0] as unknown as AnalysisRow;
        if (row.status === "complete" || row.status === "awaiting_confirmation") {
            return row;
        }
        // Pipeline was started but didn't land in a terminal state — wait.
        console.log(`    ↺ reusing analysis ${row.id} (status=${row.status}), polling…`);
        return await pollForReady(sb, row.id);
    }

    // 2. Fresh pipeline.
    console.log(`    ▸ POST /api/analyze-company  website=https://${domain}`);
    const start = await postJson<{ analysis_id: string; run_url?: string }>(
        "/api/analyze-company",
        { website: `https://${domain}`, company_name: companyName },
        20_000,
    );
    if (!start.analysis_id) throw new Error(`No analysis_id returned`);

    // 3. Kick the worker. The /run endpoint runs INLINE (maxDuration=300)
    //    so we wait for the HTTP response — it lands in awaiting_confirmation
    //    when the pipeline finishes its crawl + extract phase.
    console.log(`    ▸ POST /api/analyze-company/run/${start.analysis_id.slice(0,8)}…`);
    try {
        await postJson(`/api/analyze-company/run/${start.analysis_id}`, {}, POLL_TIMEOUT_MS);
    } catch (e) {
        // Even if /run times out at the HTTP layer, the work may have
        // completed — poll the row to find out.
        console.log(`    ⚠︎ /run returned: ${(e as Error).message.slice(0, 120)} — polling anyway`);
    }

    return await pollForReady(sb, start.analysis_id);
}

async function pollForReady(
    sb: ReturnType<typeof createClient>,
    analysisId: string,
): Promise<AnalysisRow> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
        const { data } = await sb
            .from("company_analyses")
            .select("*")
            .eq("id", analysisId)
            .single();
        const row = (data as unknown) as AnalysisRow | null;
        if (row?.status === "awaiting_confirmation" || row?.status === "complete") {
            return row;
        }
        if (row?.status === "error") {
            throw new Error(`analysis errored`);
        }
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
    throw new Error(`timeout waiting for analysis ${analysisId} to be ready`);
}

async function injectFbContact(
    sb: ReturnType<typeof createClient>,
    analysis: AnalysisRow,
    lead: FbLead,
): Promise<AnalysisRow> {
    const existingInferred = (analysis.inferred_profile as Record<string, unknown>) || {};
    const existingContact = (existingInferred.contact_person as Record<string, unknown>) || {};
    const first = lead.first_name?.trim() || "";
    const last = lead.last_name?.trim() || "";
    const fullName = [first, last].filter(Boolean).join(" ") || (existingContact.name as string) || null;

    const mergedContact: Record<string, unknown> = {
        ...existingContact,
        ...(first ? { first_name: first } : {}),
        ...(last ? { last_name: last } : {}),
        ...(fullName ? { name: fullName } : {}),
        email: lead.email,
        ...(lead.phone ? { phone: lead.phone, mobile_phone: lead.phone } : {}),
        source: "facebook_lead_ad",
    };

    const patch: Record<string, unknown> = {
        lead_email: lead.email,
        ...(lead.phone ? { lead_phone: lead.phone } : {}),
        inferred_profile: { ...existingInferred, contact_person: mergedContact },
    };

    const { error } = await sb
        .from("company_analyses")
        .update(patch)
        .eq("id", analysis.id);
    if (error) throw new Error(`Supabase update failed: ${error.message}`);

    return { ...analysis, lead_email: lead.email, lead_phone: lead.phone, inferred_profile: patch.inferred_profile as Record<string, unknown> };
}

async function pushToHubspot(analysis: AnalysisRow, lead: FbLead): Promise<string | null> {
    const crawl = (analysis.crawl_data || {}) as Record<string, unknown>;
    const inferred = (analysis.inferred_profile || {}) as Record<string, unknown>;
    const contactPerson = (inferred.contact_person || {}) as Record<string, unknown>;
    const fullName = (contactPerson.name as string) || [lead.first_name, lead.last_name].filter(Boolean).join(" ") || null;

    const top5 = (analysis.preview_matches || []).slice(0, 5).map((m: unknown) => {
        const x = m as Record<string, unknown>;
        return {
            title: (x.title as string) || null,
            agency: (x.agency as string) || null,
            set_aside_code: (x.set_aside_code as string) || null,
            score: x.score as number | undefined,
            eligibility: x.eligibility as "eligible" | "not_eligible_cert" | "not_eligible_size" | undefined,
            required_certifications: x.required_certifications as string[] | undefined,
            notice_id: (x.notice_id as string) || null,
        };
    });

    const res = await pushQuickCheckerBriefToHubSpot({
        email: lead.email,
        companyName: analysis.company_name || lead.company || lead.email.split("@")[1] || "Unknown",
        contactName: fullName,
        contactPhone: lead.phone || (contactPerson.phone as string | null) || null,
        contactJobTitle: (contactPerson.title as string | null) || (inferred.job_title as string | null) || null,
        website: analysis.website || null,
        quickCheckerUrl: `${APP_URL}/check/${analysis.id}`,
        readinessScore: analysis.readiness_score ?? null,
        topMatches: top5,
        strengths: (crawl.strengths as string[]) || [],
        weaknesses: (crawl.weaknesses as string[]) || [],
        pitchAngles: (crawl.pitch_angles as string[]) || [],
        nailDownKeywords: (crawl.nail_down_keywords as string[]) || [],
        revenueSignal: (crawl.revenue_signal as string | null) || null,
        federalAgenciesServed: (crawl.federal_agencies_served as string[]) || [],
        reconciled: analysis.reconciled_profile as Parameters<typeof pushQuickCheckerBriefToHubSpot>[0]["reconciled"],
        naicsCodes: (inferred.naics_codes as string[]) || [],
        firmographics: analysis.firmographics as Parameters<typeof pushQuickCheckerBriefToHubSpot>[0]["firmographics"],
    });

    if (res.skipped_reason) {
        throw new Error(`HubSpot skipped: ${res.skipped_reason}`);
    }
    return res.contact_id || null;
}

async function processLead(
    sb: ReturnType<typeof createClient>,
    lead: FbLead,
): Promise<{ ok: boolean; reason?: string }> {
    const domain = domainOf(lead.email);
    if (!isBusinessDomain(domain)) return { ok: false, reason: `skip:${domain}` };

    const companyName = lead.company?.trim() || domain;

    try {
        const analysis = await ensureAnalysis(sb, domain, companyName);
        const enriched = await injectFbContact(sb, analysis, lead);
        const contactId = await pushToHubspot(enriched, lead);

        if (contactId) {
            await sb.from("marketing_leads").update({
                hubspot_contact_id: contactId,
                hubspot_synced_at: new Date().toISOString(),
            }).eq("id", lead.id);
            return { ok: true };
        }
        return { ok: false, reason: "no contact id" };
    } catch (err) {
        return { ok: false, reason: (err as Error).message };
    }
}

async function main() {
    const args = process.argv.slice(2);
    const limitArg = args.indexOf("--limit");
    const limit = limitArg >= 0 ? parseInt(args[limitArg + 1] || "0", 10) || 0 : 0;
    const idArg = args.indexOf("--id");
    const singleId = idArg >= 0 ? args[idArg + 1] : null;

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    let q = sb
        .from("marketing_leads")
        .select("id, email, company, first_name, last_name, phone, hubspot_contact_id")
        .eq("source", "meta-lead-ad")
        .not("email", "is", null)
        .order("created_at", { ascending: false });
    if (singleId) q = q.eq("id", singleId);

    const { data, error } = await q;
    if (error) {
        console.error("query failed:", error);
        process.exit(1);
    }

    const allLeads = (data || []) as unknown as FbLead[];
    const targets = allLeads.filter(l => isBusinessDomain(domainOf(l.email)));
    const skipped = allLeads.length - targets.length;
    const queue = limit > 0 ? targets.slice(0, limit) : targets;

    console.log(`Found ${allLeads.length} FB leads — ${targets.length} have a business domain (${skipped} skipped as free/ISP/sketchy)`);
    console.log(`Processing ${queue.length} with concurrency=${CONCURRENCY}, per-lead timeout=${Math.round(POLL_TIMEOUT_MS/1000)}s`);
    console.log("");

    let done = 0, failed = 0;
    const workers: Promise<void>[] = [];
    let idx = 0;

    for (let w = 0; w < CONCURRENCY; w++) {
        workers.push((async () => {
            while (idx < queue.length) {
                const i = idx++;
                const lead = queue[i];
                const tag = `${(i + 1).toString().padStart(2)}/${queue.length}  ${lead.email}`;
                console.log(`▸ ${tag}`);
                const t0 = Date.now();
                const res = await processLead(sb, lead);
                const dt = Math.round((Date.now() - t0) / 1000);
                if (res.ok) {
                    done++;
                    console.log(`  ✓ ${tag}  (${dt}s)`);
                } else {
                    failed++;
                    console.log(`  ✗ ${tag}  — ${res.reason} (${dt}s)`);
                }
            }
        })());
    }
    await Promise.all(workers);

    console.log("");
    console.log(`Done — ${done} synced to HubSpot, ${failed} failed.`);
}

main().catch(e => { console.error(e); process.exit(1); });
