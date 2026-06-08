/**
 * GET /api/admin/db/sample?table=<name>&limit=50&confirm=true
 *
 * Returns the N most-recent rows from one public table. Used by the
 * SampleDrawer on /admin/health/database.
 *
 * Safety:
 *   - assertAdmin() gates every call.
 *   - Table name is validated against /^[a-z_][a-z0-9_]*$/ (no quoted
 *     identifiers, no schema-hop).
 *   - Sensitive tables (users, contracts, contacts, …) require
 *     confirm=true so a casual click can't dump PII to the browser.
 *   - REDACTED_COLUMNS (passwords, api keys, stripe ids, …) are always
 *     replaced with "***" — belt-and-suspenders even on non-sensitive
 *     tables.
 *
 * Ordering: prefers `inserted_at` → `created_at` → first PK col → no order.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";
import {
    isAllowedTableName,
    parseLimit,
    redactRow,
    SENSITIVE_TABLES,
} from "@/lib/admin-db-sample";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function svc() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

export async function GET(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    const { searchParams } = req.nextUrl;
    const table = searchParams.get("table") || "";
    const limit = parseLimit(searchParams.get("limit"), 50, 200);
    const confirmed = searchParams.get("confirm") === "true";

    if (!isAllowedTableName(table)) {
        return NextResponse.json({ error: "Invalid table name" }, { status: 400 });
    }

    if (SENSITIVE_TABLES.has(table) && !confirmed) {
        return NextResponse.json({
            error: "CONFIRMATION_REQUIRED",
            message: `Table "${table}" is flagged sensitive. Re-call with ?confirm=true to view sample rows.`,
            sensitive: true,
        }, { status: 409 });
    }

    const sb = svc();

    // Figure out the best column to ORDER BY so the "most recent" promise is
    // honored. Cheaper to introspect once than to YOLO an ORDER BY that errors.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const colsRes = await (sb.from("information_schema.columns" as any) as any)
        .select("column_name")
        .eq("table_schema", "public")
        .eq("table_name", table);

    const colNames = new Set(
        ((colsRes.data as Array<{ column_name: string }> | null) || []).map(c => c.column_name),
    );

    if (colNames.size === 0) {
        return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    let orderCol: string | null = null;
    if (colNames.has("inserted_at")) orderCol = "inserted_at";
    else if (colNames.has("created_at")) orderCol = "created_at";
    else if (colNames.has("updated_at")) orderCol = "updated_at";
    else if (colNames.has("id")) orderCol = "id";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = sb.from(table as never).select("*").limit(limit);
    if (orderCol) q = q.order(orderCol, { ascending: false, nullsFirst: false });

    const { data, error } = await q;
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = ((data as Array<Record<string, unknown>> | null) || []).map(redactRow);

    return NextResponse.json({
        table,
        ordered_by: orderCol,
        sensitive: SENSITIVE_TABLES.has(table),
        row_count: rows.length,
        rows,
    });
}
