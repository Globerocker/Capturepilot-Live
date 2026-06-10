/**
 * POST /api/admin/outreach/contacts/import-sam-poc
 *
 * Bulk-pulls rows from `contacts` (SAM.gov POCs) filtered by NAICS prefix,
 * agency, and/or state, then upserts them into outreach_contacts.
 *
 * Body:
 *   { naics?: string[], agencies?: string[], states?: string[],
 *     limit?: number, dry_run?: boolean, default_tags?: string[] }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getServiceClient } from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
    const { unauth } = await requireAdmin();
    if (unauth) return unauth;

    const body = await req.json().catch(() => ({} as any));
    const naics: string[] = Array.isArray(body.naics) ? body.naics : [];
    const agencies: string[] = Array.isArray(body.agencies) ? body.agencies : [];
    const states: string[] = Array.isArray(body.states) ? body.states : [];
    const cap = Math.min(Number(body.limit || 500), 5000);
    const dryRun = Boolean(body.dry_run);
    const defaultTags: string[] = Array.isArray(body.default_tags) ? body.default_tags : ["sam-poc"];

    const sb = getServiceClient();

    // The `contacts` table has POC rows linked to opportunities; the join below
    // is best-effort. We fall back to selecting from `contacts` directly when
    // no join filters are supplied.
    const hasJoinFilters = naics.length || agencies.length;
    let rows: any[] = [];

    if (hasJoinFilters) {
        let q = sb
            .from("contacts")
            .select("name, title, email, phone, agency, naics_code, state, opportunities!inner(naics_code, agency)")
            .not("email", "is", null)
            .limit(cap);

        if (naics.length) {
            const orClauses = naics.map(p => `naics_code.ilike.${p}%`).join(",");
            q = q.or(orClauses, { foreignTable: "opportunities" });
        }
        if (agencies.length) q = q.in("opportunities.agency", agencies);
        if (states.length) q = q.in("state", states);

        const { data, error } = await q;
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        rows = data || [];
    } else {
        let q = sb
            .from("contacts")
            .select("name, title, email, phone, agency, naics_code, state")
            .not("email", "is", null)
            .limit(cap);
        if (states.length) q = q.in("state", states);
        const { data, error } = await q;
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        rows = data || [];
    }

    const projected = rows
        .map(r => {
            const fullName = (r.name || "").trim();
            const [first, ...rest] = fullName.split(/\s+/);
            return {
                email: r.email ? String(r.email).toLowerCase() : null,
                phone: r.phone || null,
                first_name: first || null,
                last_name: rest.join(" ") || null,
                company_name: r.agency || null,
                title: r.title || null,
                state: r.state || null,
                naics_codes: r.naics_code ? [r.naics_code] : [],
                source: "sam_gov" as const,
                source_id: null,
                tags: defaultTags,
                custom_fields: {} as Record<string, string>,
            };
        })
        .filter(c => c.email);

    // Dedup within the batch by email.
    const byEmail = new Map<string, any>();
    for (const p of projected) byEmail.set(p.email!, p);
    const unique = Array.from(byEmail.values());

    if (dryRun) {
        return NextResponse.json({ preview: unique.slice(0, 50), total_available: unique.length });
    }

    let inserted = 0;
    let updated = 0;
    for (let i = 0; i < unique.length; i += 500) {
        const chunk = unique.slice(i, i + 500);
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

    return NextResponse.json({ inserted, updated, total_processed: unique.length });
}
