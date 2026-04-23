import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 300;

/**
 * Apollo.io contact enrichment for contractors we don't have detailed contact
 * data on. Apollo's mixed_companies/search works on free tier — we look up
 * by website OR company name and pull primary POC email, title, phone, LinkedIn.
 *
 * Runs every 2h via vercel.json. 25 contractors/run = ~300/day at current
 * rate limits.
 *
 * Priority:
 *   1) Contractors linked to opportunity_contractors rows (SAM POC flagged us)
 *   2) Contractors that are incumbent_contractor_uei on an active opp
 *   3) Rest: by federal_awards_count DESC (bigger players first)
 */
const BATCH_SIZE = 25;

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

async function apolloSearch(domainOrName: string): Promise<ApolloCompany | null> {
    const key = process.env.APOLLO_API_KEY;
    if (!key) throw new Error("APOLLO_API_KEY not configured");

    // Use free-tier-compatible endpoint mixed_companies/search
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
    if (!orgs.length) return null;
    return orgs[0];
}

export async function GET(req: NextRequest) {
    const auth = req.headers.get("authorization");
    if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!process.env.APOLLO_API_KEY) {
        return NextResponse.json({ error: "APOLLO_API_KEY not configured — skipping" }, { status: 501 });
    }

    const db = admin();
    const startTime = Date.now();
    const stats = { enriched: 0, not_found: 0, failed: 0 };

    // Priority 1: incumbents of active opps
    const { data: incumbentRows } = await db
        .from("opportunities")
        .select("incumbent_contractor_uei")
        .eq("is_archived", false)
        .not("incumbent_contractor_uei", "is", null)
        .limit(200);
    const priorityUeis = new Set<string>((incumbentRows || []).map((o: { incumbent_contractor_uei: string }) => o.incumbent_contractor_uei));

    // Candidates: have website OR company_name, not apollo_enriched yet
    const { data: candidates } = await db
        .from("contractors")
        .select("id, uei, company_name, business_url, website, city, state, federal_awards_count, apollo_enriched")
        .neq("apollo_enriched", true)
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
        const lookup = website ? website.replace(/^https?:\/\//, "").split("/")[0].toLowerCase() : name;
        if (!lookup) { stats.failed++; continue; }
        try {
            const match = await apolloSearch(lookup);
            if (!match) {
                await db
                    .from("contractors")
                    .update({ apollo_enriched: true, last_enriched_at: new Date().toISOString(), enrichment_source: "apollo_miss" })
                    .eq("id", c.id);
                stats.not_found++;
                continue;
            }
            const update: Record<string, unknown> = {
                apollo_enriched: true,
                last_enriched_at: new Date().toISOString(),
                enrichment_source: "apollo",
            };
            const domain = match.website_url || match.primary_domain || website;
            if (domain) update.website = domain;
            if (match.phone) update.phone = match.phone;
            if (match.linkedin_url) update.company_linkedin = match.linkedin_url;
            if (match.estimated_num_employees) update.employee_count = match.estimated_num_employees;
            if (!c.city && match.city) update.city = match.city;
            if (!c.state && match.state) update.state = match.state;
            await db.from("contractors").update(update).eq("id", c.id);
            stats.enriched++;
        } catch {
            stats.failed++;
        }
    }

    return NextResponse.json({ success: true, ...stats, elapsed_ms: Date.now() - startTime });
}
