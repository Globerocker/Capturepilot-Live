import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isPdlConfigured, pdlPersonByCompany } from "@/lib/enrichment/pdl";
import { withCronTelemetry } from "@/lib/cron-telemetry";

export const maxDuration = 300;

/**
 * Apollo.io enrichment for contractors with federal award history.
 *
 * Two-step lookup per contractor:
 *   1) /api/v1/mixed_companies/search  →  org metadata (LinkedIn, employees,
 *      domain). Free-tier compatible.
 *   2) /api/v1/people/match           →  primary contact email + phone +
 *      title using the SAM POC name we already have. Requires a paid Apollo
 *      plan; we degrade gracefully on 402/403 and still keep the org match.
 *
 * Audience filter (Apr 2026): we only target contractors with
 * `federal_awards_count > 0`. Without award history the row isn't worth
 * spending an Apollo credit on, and our re-engagement campaigns don't use
 * non-awardees anyway.
 *
 * Schedule: every 2h via vercel.json. With BATCH_SIZE=200 + manual top-ups
 * during the paid-tier window we can clear the 2,262 award-having audience
 * in ~2 days; default schedule covers ~150/day at this batch.
 * Priority order: incumbents on active opps, then biggest award counts.
 *
 * 2026-05-27: bumped from 50 → 200 to maximize the paid Apollo window
 * (people/match endpoint accessible until 2026-06-02). The per-row work
 * is ~1.5s, so 200 fits the 300s maxDuration with headroom.
 *
 * Accepts ?batch=N override (capped at 400) for manual burst runs.
 */
const DEFAULT_BATCH_SIZE = 200;
const MAX_BATCH_SIZE = 400;

function admin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

interface ApolloCompany {
    id?: string;
    name?: string;
    website_url?: string;
    phone?: string;
    linkedin_url?: string;
    primary_domain?: string;
    industry?: string;
    estimated_num_employees?: number;
    city?: string;
    state?: string;
    organization_raw_address?: string;
}

interface ApolloPerson {
    id?: string;
    first_name?: string;
    last_name?: string;
    name?: string;
    title?: string;
    email?: string;
    phone_numbers?: Array<{ raw_number?: string; sanitized_number?: string }>;
    linkedin_url?: string;
    seniority?: string;
}

async function apolloCompany(domainOrName: string): Promise<ApolloCompany | null> {
    const key = process.env.APOLLO_API_KEY;
    if (!key) throw new Error("APOLLO_API_KEY not configured");

    const res = await fetch("https://api.apollo.io/api/v1/mixed_companies/search", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            "X-Api-Key": key,
        },
        body: JSON.stringify({
            q_organization_domains_list: domainOrName.includes(".") ? [domainOrName] : undefined,
            q_organization_keyword_tags: domainOrName.includes(".") ? undefined : [domainOrName],
            per_page: 3,
        }),
        signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const orgs = (data?.accounts || data?.organizations || []) as ApolloCompany[];
    return orgs[0] || null;
}

/**
 * Look up a specific person at a known org. Returns `{ person, blocked }`.
 * `blocked = true` means the API key is on a tier that doesn't expose the
 * endpoint (402/403); the caller should stop trying for the rest of the run.
 */
async function apolloPersonMatch(args: {
    firstName: string;
    lastName: string;
    domain?: string | null;
    orgName?: string | null;
}): Promise<{ person: ApolloPerson | null; blocked: boolean }> {
    const key = process.env.APOLLO_API_KEY!;
    const body: Record<string, unknown> = {
        first_name: args.firstName,
        last_name: args.lastName,
        reveal_personal_emails: true,
        reveal_phone_number: true,
    };
    if (args.domain) body.domain = args.domain;
    if (args.orgName) body.organization_name = args.orgName;

    const res = await fetch("https://api.apollo.io/api/v1/people/match", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            "X-Api-Key": key,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
    });

    // Endpoint not available on this Apollo plan — stop calling it for this run.
    if (res.status === 402 || res.status === 403) {
        return { person: null, blocked: true };
    }
    if (!res.ok) return { person: null, blocked: false };
    const data = await res.json();
    return { person: (data?.person || null) as ApolloPerson | null, blocked: false };
}

function splitName(full: string): { first: string; last: string } | null {
    const parts = full.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return null;
    if (parts.length === 1) return { first: parts[0], last: "" };
    return { first: parts[0], last: parts[parts.length - 1] };
}

async function GET_handler(req: NextRequest) {
    const auth = req.headers.get("authorization");
    const serviceKey = process.env.SUPABASE_SERVICE_KEY;
    const expectedCron = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
    const expectedSvc = serviceKey ? `Bearer ${serviceKey}` : null;
    if ((expectedCron || expectedSvc) && auth !== expectedCron && auth !== expectedSvc) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!process.env.APOLLO_API_KEY) {
        return NextResponse.json({ error: "APOLLO_API_KEY not configured — skipping" }, { status: 501 });
    }

    // Allow per-call batch override for manual burst runs.
    // ?batch=400 = max; defaults to DEFAULT_BATCH_SIZE if absent or invalid.
    const url = new URL(req.url);
    const batchParam = Number(url.searchParams.get("batch") || "");
    const BATCH_SIZE = Number.isFinite(batchParam) && batchParam > 0
        ? Math.min(MAX_BATCH_SIZE, Math.floor(batchParam))
        : DEFAULT_BATCH_SIZE;

    const db = admin();
    const startTime = Date.now();
    const stats = {
        company_matched: 0,
        person_matched: 0,
        pdl_matched: 0,
        not_found: 0,
        failed: 0,
        person_endpoint_blocked: false,
        pdl_endpoint_blocked: false,
    };
    let personEndpointBlocked = false;
    let pdlEndpointBlocked = false;

    // Priority 1: incumbents on active opportunities (we want their email yesterday).
    const { data: incumbentRows } = await db
        .from("opportunities")
        .select("incumbent_contractor_uei")
        .eq("is_archived", false)
        .not("incumbent_contractor_uei", "is", null)
        .limit(200);
    const priorityUeis = new Set<string>(
        (incumbentRows || []).map((o: { incumbent_contractor_uei: string }) => o.incumbent_contractor_uei)
    );

    // Audience: only contractors that have actually won federal work.
    // Skips the 70k+ inactive SAM rows where Apollo would just churn credits.
    const { data: candidates } = await db
        .from("contractors")
        .select("id, uei, company_name, business_url, website, city, state, federal_awards_count, primary_poc_name, primary_poc_email")
        .neq("apollo_enriched", true)
        .gt("federal_awards_count", 0)
        .or("business_url.not.is.null,website.not.is.null,company_name.not.is.null")
        .order("federal_awards_count", { ascending: false, nullsFirst: false })
        .limit(BATCH_SIZE * 3);

    const rows = (candidates || []) as Array<Record<string, unknown>>;
    const sorted = rows.sort((a, b) => {
        const aP = priorityUeis.has(a.uei as string) ? 1 : 0;
        const bP = priorityUeis.has(b.uei as string) ? 1 : 0;
        return bP - aP;
    });
    const targets = sorted.slice(0, BATCH_SIZE);

    if (targets.length === 0) {
        return NextResponse.json({ success: true, message: "Nothing to enrich", ...stats });
    }

    for (const c of targets) {
        if (Date.now() - startTime > 270_000) break;
        const website = ((c.business_url as string) || (c.website as string) || "").trim();
        const name = (c.company_name as string) || "";
        const domain = website ? website.replace(/^https?:\/\//, "").split("/")[0].toLowerCase() : "";
        const lookup = domain || name;
        if (!lookup) { stats.failed++; continue; }

        try {
            const company = await apolloCompany(lookup);
            if (!company) {
                await db
                    .from("contractors")
                    .update({
                        apollo_enriched: true,
                        last_enriched_at: new Date().toISOString(),
                        enrichment_source: "apollo_miss",
                    })
                    .eq("id", c.id);
                stats.not_found++;
                continue;
            }

            const update: Record<string, unknown> = {
                apollo_enriched: true,
                last_enriched_at: new Date().toISOString(),
                enrichment_source: "apollo_company",
            };
            const finalDomain = company.website_url || company.primary_domain || domain;
            if (finalDomain) update.website = finalDomain;
            if (company.phone) update.main_phone = company.phone;
            if (company.linkedin_url) update.company_linkedin = company.linkedin_url;
            if (company.estimated_num_employees) update.employee_count = company.estimated_num_employees;
            if (!c.city && company.city) update.city = company.city;
            if (!c.state && company.state) update.state = company.state;
            stats.company_matched++;

            // Step 2 — person enrichment if we have a SAM POC name and the
            // endpoint hasn't been blocked yet on this run.
            const pocName = (c.primary_poc_name as string | null) || "";
            if (pocName && !personEndpointBlocked && !c.primary_poc_email) {
                const split = splitName(pocName);
                if (split && split.first && split.last) {
                    const { person, blocked } = await apolloPersonMatch({
                        firstName: split.first,
                        lastName: split.last,
                        domain: finalDomain ? finalDomain.replace(/^https?:\/\//, "").split("/")[0] : null,
                        orgName: company.name || name,
                    });
                    if (blocked) {
                        personEndpointBlocked = true;
                        stats.person_endpoint_blocked = true;
                    } else if (person) {
                        if (person.email) update.primary_poc_email = person.email;
                        if (person.title) update.primary_poc_title = person.title;
                        if (person.linkedin_url) update.owner_linkedin = person.linkedin_url;
                        const phone = person.phone_numbers?.find(p => p.sanitized_number || p.raw_number);
                        if (phone) update.direct_phone = phone.sanitized_number || phone.raw_number;
                        if (person.email || person.title || person.linkedin_url) {
                            update.enrichment_source = "apollo";
                            stats.person_matched++;
                        }
                    }
                }

                // FALLBACK: PDL person enrichment when Apollo people/match is
                // blocked (the audit on 2026-05-27 confirmed Apollo returns
                // "insufficient credits" on our current plan even with paid
                // window). PDL has a 1000/mo free tier and same shape.
                if (
                    !update.primary_poc_email
                    && !pdlEndpointBlocked
                    && isPdlConfigured()
                ) {
                    try {
                        const { person: pdlP, blocked: pdlBlocked } = await pdlPersonByCompany({
                            companyName: company.name || name,
                            companyDomain: finalDomain || null,
                            firstName: split?.first || null,
                            lastName: split?.last || null,
                        });
                        if (pdlBlocked) {
                            pdlEndpointBlocked = true;
                            stats.pdl_endpoint_blocked = true;
                        } else if (pdlP) {
                            const pdlEmail = pdlP.work_email || pdlP.personal_emails[0] || null;
                            if (pdlEmail && !update.primary_poc_email) update.primary_poc_email = pdlEmail;
                            if (pdlP.job_title && !update.primary_poc_title) update.primary_poc_title = pdlP.job_title;
                            if (pdlP.linkedin_url && !update.owner_linkedin) update.owner_linkedin = pdlP.linkedin_url;
                            if (pdlP.mobile_phone && !update.direct_phone) update.direct_phone = pdlP.mobile_phone;
                            if (pdlEmail || pdlP.job_title || pdlP.linkedin_url) {
                                update.enrichment_source = "pdl";
                                stats.pdl_matched++;
                            }
                        }
                    } catch { /* swallow — leave row at apollo-only enrichment */ }
                }
            }

            await db.from("contractors").update(update).eq("id", c.id);
        } catch {
            stats.failed++;
        }
    }

    return NextResponse.json({
        success: true,
        ...stats,
        elapsed_ms: Date.now() - startTime,
        batch_attempted: targets.length,
    });
}

export const GET = withCronTelemetry("/api/cron/enrich_apollo_contractors", GET_handler);
