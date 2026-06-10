/**
 * GET /api/admin/outreach/contacts/[id]/timeline
 *
 * Returns the full event timeline for one contact:
 *  - engagement_events (opens/clicks/replies/bounces)
 *  - step_runs (sends with status + provider_message_id)
 *  - replies (inbound messages with sentiment + intent)
 *  - campaign memberships (current state across campaigns)
 *
 * All four arrays are sorted descending by their canonical timestamp so the UI
 * can merge them into one stream.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getServiceClient } from "@/lib/admin-auth";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const { unauth } = await requireAdmin();
    if (unauth) return unauth;

    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const sb = getServiceClient();

    const [contactRes, eventsRes, runsRes, repliesRes, membershipRes] = await Promise.all([
        sb.from("outreach_contacts").select("*").eq("id", id).maybeSingle(),
        sb.from("outreach_engagement_events")
            .select("id, event_type, captured_at, campaign_id, step_id, payload")
            .eq("contact_id", id)
            .order("captured_at", { ascending: false })
            .limit(200),
        sb.from("outreach_campaign_step_runs")
            .select("id, status, channel, sent_at, delivered_at, opened_at, first_click_at, replied_at, bounced_at, rendered_subject, campaign_contact_id, step_id, outreach_campaign_contacts!inner(contact_id, campaign_id)")
            .eq("outreach_campaign_contacts.contact_id", id)
            .order("sent_at", { ascending: false, nullsFirst: false })
            .limit(200),
        sb.from("outreach_replies")
            .select("id, from_email, subject, body_text, received_at, sentiment, intent, is_handled")
            .eq("contact_id", id)
            .order("received_at", { ascending: false })
            .limit(50),
        sb.from("outreach_campaign_contacts")
            .select("id, campaign_id, status, current_step, added_at, finished_at, next_send_at, outreach_campaigns(name, status)")
            .eq("contact_id", id)
            .order("added_at", { ascending: false }),
    ]);

    return NextResponse.json({
        contact: contactRes.data || null,
        events: eventsRes.data || [],
        sends: runsRes.data || [],
        replies: repliesRes.data || [],
        memberships: membershipRes.data || [],
    });
}
