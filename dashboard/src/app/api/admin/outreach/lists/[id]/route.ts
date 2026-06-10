/**
 * GET    /api/admin/outreach/lists/[id] — list metadata + member ids
 * PATCH  /api/admin/outreach/lists/[id] — rename / edit description / filter
 * DELETE /api/admin/outreach/lists/[id]
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getServiceClient } from "@/lib/admin-auth";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const { unauth } = await requireAdmin();
    if (unauth) return unauth;

    const { id } = await ctx.params;
    const sb = getServiceClient();

    const [listRes, memberRes] = await Promise.all([
        sb.from("outreach_lists").select("*").eq("id", id).maybeSingle(),
        sb.from("outreach_list_members").select("contact_id, added_at").eq("list_id", id).limit(5000),
    ]);
    if (!listRes.data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ list: listRes.data, members: memberRes.data || [] });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const { unauth } = await requireAdmin();
    if (unauth) return unauth;

    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const update: Record<string, any> = { updated_at: new Date().toISOString() };
    if (typeof body.name === "string") update.name = body.name;
    if (typeof body.description === "string") update.description = body.description;
    if (body.filter && typeof body.filter === "object") update.filter = body.filter;

    const sb = getServiceClient();
    const { data, error } = await sb.from("outreach_lists").update(update).eq("id", id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ list: data });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const { unauth } = await requireAdmin();
    if (unauth) return unauth;

    const { id } = await ctx.params;
    const sb = getServiceClient();
    const { error } = await sb.from("outreach_lists").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ deleted: true });
}
