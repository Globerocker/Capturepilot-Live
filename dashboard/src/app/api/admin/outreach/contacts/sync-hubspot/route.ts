/**
 * POST /api/admin/outreach/contacts/sync-hubspot
 *
 * Pulls HubSpot contacts via the v3 CRM Search API, optionally filtered by
 * lifecyclestage, then upserts them into outreach_contacts. Free-tier safe:
 * caps at 1000 per call (10 pages of 100).
 *
 * Body:
 *   { lifecyclestage?: string, limit?: number, dry_run?: boolean,
 *     default_tags?: string[] }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getServiceClient } from "@/lib/admin-auth";

const HUBSPOT_TOKEN =
    process.env.HUBSPOT_API_KEY ||
    process.env.HUBSPOT_ACCESS_TOKEN ||
    process.env.HUBSPOT_PRIVATE_APP_TOKEN ||
    "";

interface HubSpotContact {
    id: string;
    properties: Record<string, string | null>;
}

export async function POST(req: NextRequest) {
    const { unauth } = await requireAdmin();
    if (unauth) return unauth;

    if (!HUBSPOT_TOKEN) {
        return NextResponse.json({ error: "HUBSPOT_API_KEY not configured" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({} as any));
    const lifecyclestage = body.lifecyclestage as string | undefined;
    const cap = Math.min(Number(body.limit || 500), 1000);
    const dryRun = Boolean(body.dry_run);
    const defaultTags: string[] = Array.isArray(body.default_tags) ? body.default_tags : ["hubspot"];

    const filterGroups: any[] = [];
    if (lifecyclestage) {
        filterGroups.push({
            filters: [{ propertyName: "lifecyclestage", operator: "EQ", value: lifecyclestage }]
        });
    }

    const properties = [
        "email", "firstname", "lastname", "company", "phone", "jobtitle",
        "lifecyclestage", "state", "naics_codes",
    ];

    const fetched: HubSpotContact[] = [];
    let after: string | undefined;

    while (fetched.length < cap) {
        const limit = Math.min(100, cap - fetched.length);
        const res = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${HUBSPOT_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                filterGroups,
                properties,
                limit,
                after,
            }),
        });
        if (!res.ok) {
            const text = await res.text();
            return NextResponse.json({ error: `HubSpot ${res.status}: ${text.slice(0, 200)}` }, { status: 500 });
        }
        const data = await res.json();
        const results: HubSpotContact[] = data.results || [];
        fetched.push(...results);
        after = data.paging?.next?.after;
        if (!after || results.length === 0) break;
    }

    const projected = fetched
        .map(c => {
            const p = c.properties || {};
            return {
                email: p.email ? String(p.email).toLowerCase() : null,
                phone: p.phone || null,
                first_name: p.firstname || null,
                last_name: p.lastname || null,
                company_name: p.company || null,
                title: p.jobtitle || null,
                state: p.state || null,
                naics_codes: p.naics_codes ? String(p.naics_codes).split(/[,;\s]+/).filter(Boolean) : [],
                source: "hubspot_sync" as const,
                source_id: c.id,
                tags: defaultTags,
                custom_fields: { hubspot_lifecyclestage: p.lifecyclestage || "" },
            };
        })
        .filter(c => c.email);

    if (dryRun) {
        return NextResponse.json({ preview: projected.slice(0, 50), total_available: projected.length });
    }

    const sb = getServiceClient();
    let inserted = 0;
    let updated = 0;

    for (let i = 0; i < projected.length; i += 500) {
        const chunk = projected.slice(i, i + 500);
        const { data, error } = await sb
            .from("outreach_contacts")
            .upsert(chunk, { onConflict: "email" })
            .select("id, created_at, updated_at");
        if (error) {
            return NextResponse.json({ error: error.message, inserted, updated }, { status: 500 });
        }
        for (const r of data || []) {
            if (r.created_at === r.updated_at) inserted += 1;
            else updated += 1;
        }
    }

    return NextResponse.json({ inserted, updated, total_processed: projected.length });
}
