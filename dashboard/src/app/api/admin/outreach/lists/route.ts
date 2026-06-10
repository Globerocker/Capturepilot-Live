/**
 * GET  /api/admin/outreach/lists — all lists with counts
 * POST /api/admin/outreach/lists — create a new list
 *
 * POST body:
 *   { name: string, description?: string, filter?: object,
 *     contact_ids?: string[] }   // when supplied, attach as static members
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getServiceClient } from "@/lib/admin-auth";

export async function GET() {
    const { unauth } = await requireAdmin();
    if (unauth) return unauth;

    const sb = getServiceClient();
    const { data, error } = await sb
        .from("outreach_lists")
        .select("id, name, description, filter, contact_count, created_at, updated_at")
        .order("updated_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ lists: data || [] });
}

export async function POST(req: NextRequest) {
    const { unauth, userId } = await requireAdmin();
    if (unauth) return unauth;

    const body = await req.json().catch(() => ({} as any));
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

    const sb = getServiceClient();

    // Resolve the admin's user_profiles.id (the created_by FK target).
    let createdBy: string | null = null;
    if (userId) {
        const { data: profile } = await sb
            .from("user_profiles")
            .select("id")
            .eq("auth_user_id", userId)
            .maybeSingle();
        createdBy = profile?.id || null;
    }

    const { data: list, error } = await sb
        .from("outreach_lists")
        .insert({
            name,
            description: body.description || null,
            filter: body.filter || {},
            created_by: createdBy,
        })
        .select()
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Attach any static members supplied at creation time.
    const contactIds: string[] = Array.isArray(body.contact_ids) ? body.contact_ids : [];
    if (contactIds.length) {
        const rows = contactIds.map(contact_id => ({ list_id: list.id, contact_id }));
        await sb.from("outreach_list_members").upsert(rows, { onConflict: "list_id,contact_id", ignoreDuplicates: true });
        await sb.from("outreach_lists").update({ contact_count: contactIds.length }).eq("id", list.id);
        list.contact_count = contactIds.length;
    }

    return NextResponse.json({ list });
}
