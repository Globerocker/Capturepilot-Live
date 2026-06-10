/**
 * POST /api/admin/outreach/contacts/bulk-action
 *
 * Body: { action: 'add_to_campaign' | 'add_to_list' | 'add_tag' | 'remove_tag' | 'suppress' | 'delete',
 *         ids: string[], payload?: { campaign_id?: string, list_id?: string, tag?: string } }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getServiceClient } from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
    const { unauth } = await requireAdmin();
    if (unauth) return unauth;

    const body = await req.json().catch(() => ({} as any));
    const action = String(body.action || "");
    const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((x: any) => typeof x === "string") : [];
    const payload = body.payload || {};

    if (!ids.length) return NextResponse.json({ error: "ids[] required" }, { status: 400 });
    if (ids.length > 5000) return NextResponse.json({ error: "Max 5000 ids per call" }, { status: 400 });

    const sb = getServiceClient();

    switch (action) {
        case "add_to_campaign": {
            if (!payload.campaign_id) return NextResponse.json({ error: "campaign_id required" }, { status: 400 });
            const rows = ids.map(contact_id => ({
                campaign_id: payload.campaign_id,
                contact_id,
                status: "queued",
                current_step: 0,
            }));
            const { error } = await sb
                .from("outreach_campaign_contacts")
                .upsert(rows, { onConflict: "campaign_id,contact_id", ignoreDuplicates: true });
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            return NextResponse.json({ added: ids.length });
        }
        case "add_to_list": {
            if (!payload.list_id) return NextResponse.json({ error: "list_id required" }, { status: 400 });
            const rows = ids.map(contact_id => ({ list_id: payload.list_id, contact_id }));
            const { error } = await sb
                .from("outreach_list_members")
                .upsert(rows, { onConflict: "list_id,contact_id", ignoreDuplicates: true });
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            // Refresh denormalized counter so list views match reality.
            const { count } = await sb
                .from("outreach_list_members")
                .select("contact_id", { count: "exact", head: true })
                .eq("list_id", payload.list_id);
            await sb.from("outreach_lists").update({ contact_count: count ?? 0, updated_at: new Date().toISOString() }).eq("id", payload.list_id);
            return NextResponse.json({ added: ids.length });
        }
        case "add_tag": {
            if (!payload.tag) return NextResponse.json({ error: "tag required" }, { status: 400 });
            // Pull existing tags, merge, write back. PostgREST has no atomic
            // array-append; this is the safe path for arbitrary tags.
            const { data: existing } = await sb
                .from("outreach_contacts")
                .select("id, tags")
                .in("id", ids);
            for (const row of existing || []) {
                const tags = Array.from(new Set([...(row.tags || []), payload.tag]));
                await sb.from("outreach_contacts").update({ tags }).eq("id", row.id);
            }
            return NextResponse.json({ tagged: existing?.length || 0 });
        }
        case "remove_tag": {
            if (!payload.tag) return NextResponse.json({ error: "tag required" }, { status: 400 });
            const { data: existing } = await sb
                .from("outreach_contacts")
                .select("id, tags")
                .in("id", ids);
            for (const row of existing || []) {
                const tags = (row.tags || []).filter((t: string) => t !== payload.tag);
                await sb.from("outreach_contacts").update({ tags }).eq("id", row.id);
            }
            return NextResponse.json({ untagged: existing?.length || 0 });
        }
        case "suppress": {
            const { error } = await sb
                .from("outreach_contacts")
                .update({ opted_out_at: new Date().toISOString() })
                .in("id", ids);
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            return NextResponse.json({ suppressed: ids.length });
        }
        case "delete": {
            const { error } = await sb
                .from("outreach_contacts")
                .delete()
                .in("id", ids);
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            return NextResponse.json({ deleted: ids.length });
        }
        default:
            return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
}
