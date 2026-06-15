/**
 * GET    /api/admin/outreach/templates/[id] — fetch single template
 * PATCH  /api/admin/outreach/templates/[id] — update fields
 * DELETE /api/admin/outreach/templates/[id] — delete
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";

export const runtime = "nodejs";
export const maxDuration = 30;

interface PatchBody {
    name?: string;
    subject?: string | null;
    body?: string;
    merge_tags?: string[];
    category?: string | null;
}

function db() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    const { id } = await ctx.params;
    const { data, error } = await db()
        .from("outreach_templates")
        .select("*")
        .eq("id", id)
        .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ template: data });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => null)) as PatchBody | null;
    if (!body) return NextResponse.json({ error: "Body required" }, { status: 400 });

    const patch: Record<string, unknown> = {};
    if (typeof body.name === "string") patch.name = body.name.trim();
    if ("subject" in body) patch.subject = body.subject?.toString().trim() || null;
    if (typeof body.body === "string") patch.body = body.body;
    if (Array.isArray(body.merge_tags)) patch.merge_tags = body.merge_tags;
    if ("category" in body) patch.category = body.category?.toString().trim() || null;
    if ("description" in body) patch.description = (body as { description?: unknown }).description?.toString().trim() || null;
    if (typeof (body as { approved?: unknown }).approved === "boolean") {
        const approved = (body as { approved: boolean }).approved;
        patch.approved = approved;
        patch.approved_at = approved ? new Date().toISOString() : null;
    }

    if (Object.keys(patch).length === 0) {
        return NextResponse.json({ error: "No editable fields in body" }, { status: 400 });
    }

    const { data, error } = await db()
        .from("outreach_templates")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ template: data });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    const { id } = await ctx.params;
    const { error } = await db().from("outreach_templates").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
