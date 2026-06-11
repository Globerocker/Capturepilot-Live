import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdminWithUser } from "@/lib/auth-admin";
import { isSentiment, type Sentiment } from "@/lib/outreach/sentiment";

export const dynamic = "force-dynamic";

function admin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );
}

/**
 * PATCH /api/admin/outreach/replies/[id]
 * Body: { is_handled?, sentiment?, intent?, notes?, tag_contact?, add_to_campaign_id? }
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const auth = await assertAdminWithUser();
    if (!("userId" in auth)) return auth.response;

    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));

    const update: Record<string, unknown> = {};

    if (typeof body.is_handled === "boolean") {
        update.is_handled = body.is_handled;
        update.handled_at = body.is_handled ? new Date().toISOString() : null;
        update.handled_by = body.is_handled ? auth.userId : null;
    }

    if (body.sentiment !== undefined) {
        if (!isSentiment(body.sentiment)) {
            return NextResponse.json({ error: "invalid sentiment" }, { status: 400 });
        }
        update.sentiment = body.sentiment as Sentiment;
        update.sentiment_source = "manual";
    }

    if (typeof body.intent === "string") update.intent = body.intent;
    if (typeof body.notes === "string") update.notes = body.notes;

    const db = admin();

    // Optional side effects
    if (typeof body.tag_contact === "string" && body.tag_contact.trim()) {
        const tag = body.tag_contact.trim();
        const { data: reply } = await db
            .from("outreach_replies")
            .select("contact_id")
            .eq("id", id)
            .maybeSingle();

        if (reply?.contact_id) {
            const { data: contact } = await db
                .from("outreach_contacts")
                .select("tags")
                .eq("id", reply.contact_id)
                .maybeSingle();
            const tags = Array.isArray(contact?.tags) ? (contact?.tags as string[]) : [];
            if (!tags.includes(tag)) {
                await db
                    .from("outreach_contacts")
                    .update({ tags: [...tags, tag], updated_at: new Date().toISOString() })
                    .eq("id", reply.contact_id);
            }
        }
    }

    if (typeof body.add_to_campaign_id === "string" && body.add_to_campaign_id) {
        const { data: reply } = await db
            .from("outreach_replies")
            .select("contact_id")
            .eq("id", id)
            .maybeSingle();
        if (reply?.contact_id) {
            await db
                .from("outreach_contacts")
                .update({
                    campaign_id: body.add_to_campaign_id,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", reply.contact_id);
        }
    }

    if (Object.keys(update).length > 0) {
        const { error } = await db.from("outreach_replies").update(update).eq("id", id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: fresh, error: readErr } = await db
        .from("outreach_replies")
        .select(
            `id, from_email, from_name, to_email, subject, snippet, body_text,
             received_at, sentiment, sentiment_source, intent, confidence,
             meeting_url, is_handled, handled_at, notes,
             campaign_id, contact_id, step_id,
             outreach_campaigns ( id, name ),
             outreach_contacts ( id, email, name, company )`
        )
        .eq("id", id)
        .maybeSingle();

    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
    return NextResponse.json({ reply: fresh });
}
