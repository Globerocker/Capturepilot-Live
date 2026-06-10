/**
 * GET    /api/admin/outreach/suppression — list opt-outs, grouped + paginated.
 *        Query params: ?q=email-substring  &source=resend_webhook
 *                      &limit=100  &offset=0
 *        Response: { suppressed: SuppressedRow[], total, source_counts: { source: count } }
 *
 * POST   /api/admin/outreach/suppression — add a single manual opt-out.
 *        Body: { email, reason?, admin_notes? } — source forced to "admin_manual"
 *
 * DELETE /api/admin/outreach/suppression — remove an opt-out (admin override).
 *        Body: { email }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";

export const runtime = "nodejs";
export const maxDuration = 30;

function db() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );
}

interface SuppressedRow {
    id: string;
    email: string;
    reason: string | null;
    source: string | null;
    admin_notes: string | null;
    opted_out_at: string;
}

interface PostBody {
    email?: string;
    reason?: string;
    admin_notes?: string;
}

interface DeleteBody {
    email?: string;
}

export async function GET(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() || "";
    const source = req.nextUrl.searchParams.get("source")?.trim() || "";
    const limit = Math.min(500, parseInt(req.nextUrl.searchParams.get("limit") || "100", 10));
    const offset = Math.max(0, parseInt(req.nextUrl.searchParams.get("offset") || "0", 10));

    let listQ = db()
        .from("outreach_optouts")
        .select("id, email, reason, source, admin_notes, opted_out_at", { count: "exact" })
        .order("opted_out_at", { ascending: false });
    if (q) listQ = listQ.ilike("email", `%${q}%`);
    if (source) listQ = listQ.eq("source", source);
    const { data, count, error } = await listQ.range(offset, offset + limit - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Per-source counts so the UI can render source-grouped tabs
    const { data: countsData } = await db()
        .from("outreach_optouts")
        .select("source");
    const sourceCounts: Record<string, number> = {};
    for (const row of countsData || []) {
        const s = (row as { source: string | null }).source || "unknown";
        sourceCounts[s] = (sourceCounts[s] || 0) + 1;
    }

    return NextResponse.json({
        suppressed: (data || []) as SuppressedRow[],
        total: count || 0,
        source_counts: sourceCounts,
    });
}

function looksLikeEmail(s: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export async function POST(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    const body = (await req.json().catch(() => null)) as PostBody | null;
    if (!body?.email || !looksLikeEmail(body.email)) {
        return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }
    const { data, error } = await db()
        .from("outreach_optouts")
        .upsert(
            {
                email: body.email.toLowerCase().trim(),
                reason: body.reason?.trim() || "Added manually by admin",
                source: "admin_manual",
                admin_notes: body.admin_notes?.trim() || null,
            },
            { onConflict: "email" },
        )
        .select()
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ suppressed: data }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    const body = (await req.json().catch(() => null)) as DeleteBody | null;
    if (!body?.email || !looksLikeEmail(body.email)) {
        return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }
    const { error } = await db()
        .from("outreach_optouts")
        .delete()
        .eq("email", body.email.toLowerCase().trim());
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
