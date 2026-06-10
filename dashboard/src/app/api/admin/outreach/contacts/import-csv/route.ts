/**
 * POST /api/admin/outreach/contacts/import-csv
 *
 * Body: { rows: Array<Record<string,string>>, column_map: Record<string,string>,
 *         overwrite?: boolean, default_source?: string, default_tags?: string[] }
 *
 * `column_map` maps CSV column headers → contact fields, e.g.
 *   { "Email Address": "email", "First": "first_name", "Co.": "company_name" }
 *
 * We do the CSV parse + preview client-side, then send rows + the map here.
 * Dedup by lower(email): rows whose email already exists are skipped unless
 * `overwrite` is true (then the existing row is updated in place).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getServiceClient } from "@/lib/admin-auth";

type Row = Record<string, string | undefined | null>;

const ALLOWED_FIELDS = new Set([
    "email", "phone", "first_name", "last_name", "company_name", "title",
    "state", "naics_codes", "tags", "source_id",
]);

export async function POST(req: NextRequest) {
    const { unauth } = await requireAdmin();
    if (unauth) return unauth;

    const body = await req.json().catch(() => ({} as any));
    const rows = Array.isArray(body.rows) ? (body.rows as Row[]) : [];
    const columnMap = (body.column_map || {}) as Record<string, string>;
    const overwrite = Boolean(body.overwrite);
    const defaultSource = body.default_source || "csv_import";
    const defaultTags: string[] = Array.isArray(body.default_tags) ? body.default_tags : [];

    if (!rows.length) {
        return NextResponse.json({ error: "rows[] required" }, { status: 400 });
    }
    if (rows.length > 10000) {
        return NextResponse.json({ error: "Max 10,000 rows per import" }, { status: 400 });
    }

    const sb = getServiceClient();

    // 1. Project each CSV row to a normalized contact shape using the map.
    const projected: Array<Record<string, any>> = [];
    for (const r of rows) {
        const out: Record<string, any> = {
            source: defaultSource,
            tags: [...defaultTags],
            naics_codes: [] as string[],
            custom_fields: {} as Record<string, string>,
        };
        for (const [csvCol, field] of Object.entries(columnMap)) {
            if (!field || !ALLOWED_FIELDS.has(field)) continue;
            const raw = (r[csvCol] ?? "").toString().trim();
            if (!raw) continue;
            if (field === "naics_codes") {
                out.naics_codes = raw.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
            } else if (field === "tags") {
                out.tags = Array.from(new Set([...out.tags, ...raw.split(/[,;]+/).map(s => s.trim()).filter(Boolean)]));
            } else if (field === "email") {
                out.email = raw.toLowerCase();
            } else {
                out[field] = raw;
            }
        }
        // Stash unmapped columns into custom_fields so nothing is lost.
        for (const k of Object.keys(r)) {
            if (columnMap[k]) continue;
            const v = (r[k] ?? "").toString().trim();
            if (v) out.custom_fields[k] = v;
        }
        if (!out.email && !out.phone) continue;
        projected.push(out);
    }

    if (!projected.length) {
        return NextResponse.json({ error: "No rows had an email or phone after mapping" }, { status: 400 });
    }

    // 2. Look up existing emails so we can split insert vs skip vs overwrite.
    const emails = projected.map(p => p.email).filter(Boolean) as string[];
    const { data: existing } = await sb
        .from("outreach_contacts")
        .select("id, email")
        .in("email", emails);
    const existingByEmail = new Map<string, string>(
        (existing || []).map(e => [e.email as string, e.id as string])
    );

    const toInsert: any[] = [];
    const toUpdate: Array<{ id: string; row: any }> = [];
    let skipped = 0;

    for (const p of projected) {
        const existingId = p.email ? existingByEmail.get(p.email) : null;
        if (existingId) {
            if (overwrite) toUpdate.push({ id: existingId, row: p });
            else skipped += 1;
        } else {
            toInsert.push(p);
        }
    }

    // 3. Batch insert (chunks of 500).
    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += 500) {
        const chunk = toInsert.slice(i, i + 500);
        const { data, error } = await sb
            .from("outreach_contacts")
            .insert(chunk)
            .select("id");
        if (error) {
            return NextResponse.json({ error: error.message, inserted, updated: 0, skipped }, { status: 500 });
        }
        inserted += data?.length || 0;
    }

    // 4. Update existing in overwrite mode.
    let updated = 0;
    for (const { id, row } of toUpdate) {
        const { error } = await sb
            .from("outreach_contacts")
            .update(row)
            .eq("id", id);
        if (!error) updated += 1;
    }

    return NextResponse.json({
        inserted,
        updated,
        skipped,
        total_processed: projected.length,
    });
}
