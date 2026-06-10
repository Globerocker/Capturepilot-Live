/**
 * GET   /api/admin/outreach/settings — returns every key as a flat object.
 * PATCH /api/admin/outreach/settings — upsert one-or-more keys.
 *
 * Setting values are stored as jsonb so each key can carry its own shape
 * (string, number, boolean, array). The PATCH body is { key: value, ... } —
 * unknown keys are accepted and stored as-is.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdminWithUser } from "@/lib/auth-admin";

export const runtime = "nodejs";
export const maxDuration = 30;

function db() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );
}

export async function GET() {
    const gate = await assertAdminWithUser();
    if (!gate.ok) return gate.response;
    const { data, error } = await db()
        .from("outreach_settings")
        .select("key, value, updated_at");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const flat: Record<string, unknown> = {};
    const meta: Record<string, string> = {};
    for (const row of data || []) {
        const r = row as { key: string; value: unknown; updated_at: string };
        flat[r.key] = r.value;
        meta[r.key] = r.updated_at;
    }
    return NextResponse.json({ settings: flat, updated_at: meta });
}

export async function PATCH(req: NextRequest) {
    const gate = await assertAdminWithUser();
    if (!gate.ok) return gate.response;
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
        return NextResponse.json({ error: "Body required" }, { status: 400 });
    }
    const rows = Object.entries(body).map(([key, value]) => ({
        key,
        value,
        updated_by: gate.userId,
        updated_at: new Date().toISOString(),
    }));
    if (rows.length === 0) return NextResponse.json({ ok: true });
    const { error } = await db()
        .from("outreach_settings")
        .upsert(rows, { onConflict: "key" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, updated: rows.length });
}
