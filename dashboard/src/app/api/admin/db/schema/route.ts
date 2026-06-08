/**
 * GET /api/admin/db/schema?table=<name>
 *
 * Returns the column list (name, type, nullable, default, is_pk) for one
 * public table. Read-only, no row data leaves Postgres — safe to call on
 * sensitive tables without confirmation.
 *
 * Backs the "View schema" panel of /admin/health/database.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";
import { isAllowedTableName } from "@/lib/admin-db-sample";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function svc() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

interface ColumnInfo {
    name: string;
    type: string;
    nullable: boolean;
    default: string | null;
    is_pk: boolean;
}

export async function GET(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    const table = req.nextUrl.searchParams.get("table") || "";
    if (!isAllowedTableName(table)) {
        return NextResponse.json({ error: "Invalid table name" }, { status: 400 });
    }

    const sb = svc();

    // information_schema is the safe, RLS-bypass-free way to introspect.
    // We grab columns + the PK constraint in two small queries (parallel).
    const [colsRes, pkRes] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sb.from("information_schema.columns" as any) as any)
            .select("column_name, data_type, udt_name, is_nullable, column_default, ordinal_position")
            .eq("table_schema", "public")
            .eq("table_name", table)
            .order("ordinal_position", { ascending: true }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sb.from("information_schema.key_column_usage" as any) as any)
            .select("column_name, constraint_name")
            .eq("table_schema", "public")
            .eq("table_name", table),
    ]);

    type RawCol = { column_name: string; data_type: string; udt_name: string; is_nullable: string; column_default: string | null };
    type RawPk = { column_name: string; constraint_name: string };

    const cols = (colsRes.data as RawCol[] | null) || [];
    if (cols.length === 0) {
        return NextResponse.json({ error: "Table not found in public schema" }, { status: 404 });
    }

    // A column is part of the PK if it shows up in a constraint named "*_pkey".
    const pkSet = new Set(
        ((pkRes.data as RawPk[] | null) || [])
            .filter(r => r.constraint_name.endsWith("_pkey"))
            .map(r => r.column_name),
    );

    const columns: ColumnInfo[] = cols.map((c) => ({
        name: c.column_name,
        // Prefer udt_name for user-friendly type ("uuid", "jsonb", "text[]")
        // — data_type returns generic "USER-DEFINED" or "ARRAY" for those.
        type: c.data_type === "ARRAY" ? `${c.udt_name.replace(/^_/, "")}[]` : (c.udt_name || c.data_type),
        nullable: c.is_nullable === "YES",
        default: c.column_default,
        is_pk: pkSet.has(c.column_name),
    }));

    return NextResponse.json({
        table,
        column_count: columns.length,
        primary_key: columns.filter(c => c.is_pk).map(c => c.name),
        columns,
    });
}
