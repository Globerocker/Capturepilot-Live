/**
 * PATCH  /api/admin/outreach/contacts/[id] — partial update
 * DELETE /api/admin/outreach/contacts/[id] — hard delete
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getServiceClient } from "@/lib/admin-auth";

const EDITABLE_FIELDS = new Set([
    "email", "phone", "first_name", "last_name", "company_name", "title",
    "naics_codes", "state", "tags", "custom_fields", "opted_out_at",
]);

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const { unauth } = await requireAdmin();
    if (unauth) return unauth;

    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const update: Record<string, any> = {};
    for (const [k, v] of Object.entries(body || {})) {
        if (EDITABLE_FIELDS.has(k)) update[k] = v;
    }
    if (Object.keys(update).length === 0) {
        return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }
    if (update.email) update.email = String(update.email).toLowerCase();

    const sb = getServiceClient();
    const { data, error } = await sb
        .from("outreach_contacts")
        .update(update)
        .eq("id", id)
        .select()
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ contact: data });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const { unauth } = await requireAdmin();
    if (unauth) return unauth;

    const { id } = await ctx.params;
    const sb = getServiceClient();
    const { error } = await sb.from("outreach_contacts").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ deleted: true });
}
