/**
 * GET /api/admin/db/tables
 *
 * Returns one row per public table:
 *   - row_count (live estimate via pg_class.reltuples)
 *   - size_bytes / size_pretty
 *   - last_inserted / last_updated (best-effort: from common timestamp columns)
 *   - primary_key (column list)
 *   - sensitive flag (so the UI can require a confirmation before
 *     dumping sample rows from users / contracts / etc.)
 *
 * Catalog numbers come from pg_class via the `exec_sql` RPC when available;
 * the timestamp recency lookups go through PostgREST one table at a time.
 * Fan-out is capped at 80 tables to keep the request comfortably under 2s.
 */
import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";
import { SENSITIVE_TABLES } from "@/lib/admin-db-sample";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SbAny = SupabaseClient<any, any, any>;

interface TableRow {
    table: string;
    row_count: number;
    size_bytes: number;
    size_pretty: string;
    primary_key: string[];
    last_inserted: string | null;
    last_updated: string | null;
    sensitive: boolean;
}

interface CatalogRow {
    table_name: string;
    est_rows: number;
    size_bytes: number;
    size_pretty: string;
    pk_cols: string[];
    has_created_at: boolean;
    has_updated_at: boolean;
    has_inserted_at: boolean;
}

function svc(): SbAny {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

/**
 * Pull the latest value of one timestamp column without going through the
 * fully-typed Supabase chain — that chain's generic recursion blows the TS
 * inference budget when the table name is dynamic.
 */
async function latestTs(sb: SbAny, table: string, col: string): Promise<string | null> {
    try {
        const builder = sb.from(table).select(col).limit(1);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ordered = (builder as any).order(col, { ascending: false, nullsFirst: false });
        const { data } = await ordered;
        if (!data || !Array.isArray(data) || data.length === 0) return null;
        const v = (data[0] as Record<string, unknown>)[col];
        return typeof v === "string" ? v : null;
    } catch {
        return null;
    }
}

async function fetchCatalog(sb: SbAny): Promise<CatalogRow[]> {
    const catalogSql = `
        SELECT
            c.relname AS table_name,
            c.reltuples::bigint AS est_rows,
            pg_total_relation_size(c.oid) AS size_bytes,
            pg_size_pretty(pg_total_relation_size(c.oid)) AS size_pretty,
            COALESCE(
                (SELECT array_agg(a.attname ORDER BY array_position(con.conkey, a.attnum))
                 FROM pg_constraint con
                 JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
                 WHERE con.conrelid = c.oid AND con.contype = 'p'),
                ARRAY[]::text[]
            ) AS pk_cols,
            EXISTS (SELECT 1 FROM information_schema.columns ic
                    WHERE ic.table_schema='public' AND ic.table_name=c.relname AND ic.column_name='created_at') AS has_created_at,
            EXISTS (SELECT 1 FROM information_schema.columns ic
                    WHERE ic.table_schema='public' AND ic.table_name=c.relname AND ic.column_name='updated_at') AS has_updated_at,
            EXISTS (SELECT 1 FROM information_schema.columns ic
                    WHERE ic.table_schema='public' AND ic.table_name=c.relname AND ic.column_name='inserted_at') AS has_inserted_at
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
        ORDER BY c.relname;
    `;

    type RawCatalogRow = {
        table_name: string;
        est_rows: string | number;
        size_bytes: string | number;
        size_pretty: string;
        pk_cols: string[] | null;
        has_created_at: boolean;
        has_updated_at: boolean;
        has_inserted_at: boolean;
    };

    // Most Supabase projects expose an `exec_sql(sql text)` admin RPC; if
    // ours doesn't, fall back to a bare information_schema scan (no sizes).
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (sb as any).rpc("exec_sql", { sql: catalogSql });
        if (error) throw error;
        if (Array.isArray(data)) {
            return (data as RawCatalogRow[]).map((r) => ({
                table_name: r.table_name,
                est_rows: Number(r.est_rows) || 0,
                size_bytes: Number(r.size_bytes) || 0,
                size_pretty: r.size_pretty || "—",
                pk_cols: r.pk_cols || [],
                has_created_at: !!r.has_created_at,
                has_updated_at: !!r.has_updated_at,
                has_inserted_at: !!r.has_inserted_at,
            }));
        }
    } catch {
        /* fall through */
    }

    // Fallback: information_schema (no sizes / row estimates).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tables } = await (sb as any)
        .from("information_schema.tables")
        .select("table_name")
        .eq("table_schema", "public");

    const arr = (tables as Array<{ table_name: string }> | null) || [];
    return arr.map((t) => ({
        table_name: t.table_name,
        est_rows: 0,
        size_bytes: 0,
        size_pretty: "—",
        pk_cols: [],
        has_created_at: false,
        has_updated_at: false,
        has_inserted_at: false,
    }));
}

export async function GET() {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    const sb = svc();
    const catalog = await fetchCatalog(sb);

    const rows: TableRow[] = await Promise.all(
        catalog.slice(0, 80).map(async (t) => {
            const insertCol = t.has_inserted_at ? "inserted_at" : (t.has_created_at ? "created_at" : null);
            const lastInserted = insertCol ? await latestTs(sb, t.table_name, insertCol) : null;
            const lastUpdated = t.has_updated_at ? await latestTs(sb, t.table_name, "updated_at") : null;
            return {
                table: t.table_name,
                row_count: t.est_rows,
                size_bytes: t.size_bytes,
                size_pretty: t.size_pretty,
                primary_key: t.pk_cols,
                last_inserted: lastInserted,
                last_updated: lastUpdated,
                sensitive: SENSITIVE_TABLES.has(t.table_name),
            };
        }),
    );

    return NextResponse.json({
        generated_at: new Date().toISOString(),
        tables: rows,
    });
}
