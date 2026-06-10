/**
 * POST /api/admin/outreach/contacts/search-apollo
 *
 * Wraps Apollo's `mixed_companies/search` (free-tier compatible) to find
 * companies matching a NAICS + state + title query. Preview shape mirrors the
 * other import endpoints so the modal can render a uniform "Preview / Add"
 * step.
 *
 * Body: { naics?: string[], states?: string[], titles?: string[],
 *         per_page?: number, dry_run?: boolean, default_tags?: string[] }
 *
 * Note: each call counts against the monthly Apollo quota. We cap per_page at
 * 25 and pages at 1 to keep credits sane.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getServiceClient } from "@/lib/admin-auth";

interface ApolloOrganization {
    id?: string;
    name?: string;
    website_url?: string;
    primary_domain?: string;
    naics_codes?: string[];
    industry?: string;
    state?: string;
    raw_address?: string;
    phone?: string;
}

export async function POST(req: NextRequest) {
    const { unauth } = await requireAdmin();
    if (unauth) return unauth;

    const apolloKey = process.env.APOLLO_API_KEY;
    if (!apolloKey) {
        return NextResponse.json({ error: "APOLLO_API_KEY not configured" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({} as any));
    const naics: string[] = Array.isArray(body.naics) ? body.naics : [];
    const states: string[] = Array.isArray(body.states) ? body.states : [];
    const perPage = Math.min(Number(body.per_page || 25), 25);
    const dryRun = Boolean(body.dry_run);
    const defaultTags: string[] = Array.isArray(body.default_tags) ? body.default_tags : ["apollo"];

    const payload: Record<string, any> = {
        per_page: perPage,
        page: 1,
    };
    if (naics.length) payload.q_organization_keyword_tags = naics; // approximated; NAICS may not map cleanly
    if (states.length) payload.organization_locations = states.map(s => `${s}, US`);

    const res = await fetch("https://api.apollo.io/api/v1/mixed_companies/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Api-Key": apolloKey },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
        const text = await res.text();
        return NextResponse.json({ error: `Apollo ${res.status}: ${text.slice(0, 200)}` }, { status: 500 });
    }
    const data = await res.json();
    const orgs: ApolloOrganization[] = data.organizations || data.accounts || [];

    const projected = orgs.map(o => ({
        email: null, // mixed_companies returns companies, not people; user enriches downstream
        phone: o.phone || null,
        first_name: null,
        last_name: null,
        company_name: o.name || null,
        title: null,
        state: o.state || null,
        naics_codes: o.naics_codes || [],
        source: "apollo" as const,
        source_id: o.id || null,
        tags: defaultTags,
        custom_fields: {
            website: o.website_url || o.primary_domain || "",
            industry: o.industry || "",
        },
    }));

    if (dryRun) {
        return NextResponse.json({
            preview: projected.slice(0, 25),
            total_available: projected.length,
            apollo_credits_consumed: 1,
        });
    }

    // Only insert rows that have *some* identifier (company_name + source_id)
    // — they can be enriched into people via /api/admin/leads/apollo later.
    const sb = getServiceClient();
    const insertable = projected.filter(p => p.company_name && p.source_id);
    let inserted = 0;
    let updated = 0;

    for (let i = 0; i < insertable.length; i += 500) {
        const chunk = insertable.slice(i, i + 500);
        const { data: out, error } = await sb
            .from("outreach_contacts")
            .upsert(chunk, { onConflict: "source_id", ignoreDuplicates: false })
            .select("id, created_at, updated_at");
        if (error) {
            return NextResponse.json({ error: error.message, inserted, updated }, { status: 500 });
        }
        for (const r of out || []) {
            if (r.created_at === r.updated_at) inserted += 1;
            else updated += 1;
        }
    }

    return NextResponse.json({ inserted, updated, total_processed: insertable.length });
}
