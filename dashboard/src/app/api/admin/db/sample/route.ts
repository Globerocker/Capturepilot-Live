/**
 * GET /api/admin/db/sample?table=<name>&limit=50&confirm=1
 *
 * Returns up to N most-recent rows from one public table plus the column
 * list. Backs the SampleDrawer on /admin/health/database and the new
 * "db-sample" admin action.
 *
 * Safety:
 *   - assertAdmin() gates every call (returns 401/403 before any work).
 *   - Table name is validated against /^[a-z_][a-z0-9_]*$/ — no quoted
 *     identifiers, no schema-hop. This closes the injection vector for
 *     the dynamic .from(table) call below.
 *   - Sensitive tables (users, contracts, leads, …) require an extra
 *     ?confirm=1 (or confirm=true) so a casual click can't dump PII.
 *   - REDACTED_COLUMNS (passwords, api keys, stripe ids, …) are always
 *     replaced with "***" in the returned rows, regardless of whether
 *     the table itself was flagged sensitive.
 *
 * Response shape:
 *   { ok: true,  table, columns: [...], rows: [...], row_count, ordered_by, sensitive }
 *   { ok: false, error: "..." }
 *
 * Audit: every successful sample call writes one row to client_activity_log
 * keyed on the calling admin's user_profiles.id with action "db_sample_viewed".
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdminWithUser } from "@/lib/auth-admin";
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

interface ColumnInfo {
    name: string;
    type: string;
    nullable: boolean;
}

export async function GET(req: NextRequest) {
    // assertAdminWithUser doubles as the auth gate AND gives us the admin's
    // auth id, which we need to pin the audit log row to the right profile.
    const gate = await assertAdminWithUser();
    if (!gate.ok) return gate.response;

    const { searchParams } = req.nextUrl;
    const table = searchParams.get("table") || "";
    const limit = parseLimit(searchParams.get("limit"), 50, 200);
    const confirmRaw = (searchParams.get("confirm") || "").toLowerCase();
    const confirmed = confirmRaw === "1" || confirmRaw === "true" || confirmRaw === "yes";

    if (!isAllowedTableName(table)) {
        return NextResponse.json({ ok: false, error: "Invalid table name" }, { status: 400 });
    }

    if (SENSITIVE_TABLES.has(table) && !confirmed) {
        return NextResponse.json({
            ok: false,
            error: "CONFIRMATION_REQUIRED",
            message: `Table "${table}" is flagged sensitive. Re-call with ?confirm=1 to view sample rows.`,
            sensitive: true,
        }, { status: 409 });
    }

    const sb = svc();

    try {
        // Introspect once: column list (for the response + the ORDER BY pick).
        // information_schema is read-only and bypasses RLS — safe to query
        // by table name even though the table itself may not exist.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const colsRes = await (sb.from("information_schema.columns" as any) as any)
            .select("column_name, data_type, udt_name, is_nullable, ordinal_position")
            .eq("table_schema", "public")
            .eq("table_name", table)
            .order("ordinal_position", { ascending: true });

        if (colsRes.error) {
            console.error("[admin/db/sample] columns query failed:", colsRes.error);
            return NextResponse.json(
                { ok: false, error: colsRes.error.message },
                { status: 500 },
            );
        }

        type RawCol = {
            column_name: string;
            data_type: string;
            udt_name: string;
            is_nullable: string;
        };

        const rawCols = (colsRes.data as RawCol[] | null) || [];
        if (rawCols.length === 0) {
            return NextResponse.json(
                { ok: false, error: "Table not found in public schema" },
                { status: 404 },
            );
        }

        const columns: ColumnInfo[] = rawCols.map((c) => ({
            name: c.column_name,
            // udt_name gives us the friendly name ("uuid", "jsonb"); arrays
            // come through as data_type "ARRAY" with udt_name "_text" → "text[]".
            type: c.data_type === "ARRAY"
                ? `${c.udt_name.replace(/^_/, "")}[]`
                : (c.udt_name || c.data_type),
            nullable: c.is_nullable === "YES",
        }));

        const colNames = new Set(columns.map((c) => c.name));

        // Pick the best ORDER BY so "most recent" stays honest. Falls through
        // to no-order if none of these timestamp/id columns exist.
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
            console.error(`[admin/db/sample] select * from ${table} failed:`, error);
            return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        }

        const rows = ((data as Array<Record<string, unknown>> | null) || []).map(redactRow);

        // Audit log — pinned to the admin's own user_profiles row. We resolve
        // auth_user_id → profile id before insert because client_activity_log
        // FK's user_profile_id to user_profiles(id), not auth.users.
        try {
            const { data: prof } = await sb
                .from("user_profiles")
                .select("id")
                .eq("auth_user_id", gate.userId)
                .maybeSingle();
            const adminProfileId = (prof as { id: string } | null)?.id;
            if (adminProfileId) {
                await sb.from("client_activity_log").insert({
                    user_profile_id: adminProfileId,
                    actor_id: gate.userId,
                    action: "db_sample_viewed",
                    description: `Sampled ${rows.length} row(s) from "${table}"`,
                    metadata: {
                        table,
                        limit,
                        row_count: rows.length,
                        sensitive: SENSITIVE_TABLES.has(table),
                        confirmed,
                        ordered_by: orderCol,
                        admin_email: gate.email,
                    },
                });
            }
        } catch (auditErr) {
            // Audit failure must not block the read. Surface it in the server
            // log so we still know if the activity table starts erroring out.
            console.error("[admin/db/sample] audit log insert failed:", auditErr);
        }

        return NextResponse.json({
            ok: true,
            table,
            ordered_by: orderCol,
            sensitive: SENSITIVE_TABLES.has(table),
            row_count: rows.length,
            columns,
            rows,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("[admin/db/sample] unexpected failure:", err);
        return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
}
