import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { assertAdminWithUser } from "@/lib/auth-admin";

export const dynamic = "force-dynamic";

function admin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );
}

const FROM_EMAIL =
    process.env.OUTREACH_FROM_EMAIL ||
    process.env.FROM_EMAIL ||
    "CapturePilot <noreply@capturepilot.com>";

/**
 * POST /api/admin/outreach/replies/[id]/reply
 * Body: { body: string, subject?: string }
 *
 * Sends a manual reply through Resend with proper threading headers
 * (In-Reply-To + References) and logs the send to outreach_reply_sends.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const auth = await assertAdminWithUser();
    if (!("userId" in auth)) return auth;

    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const replyBody: string = typeof body.body === "string" ? body.body.trim() : "";

    if (!replyBody) {
        return NextResponse.json({ error: "body required" }, { status: 400 });
    }

    const db = admin();

    const { data: reply, error: readErr } = await db
        .from("outreach_replies")
        .select(
            "id, from_email, from_name, subject, message_id, in_reply_to, references_header, contact_id"
        )
        .eq("id", id)
        .maybeSingle();

    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
    if (!reply) return NextResponse.json({ error: "not found" }, { status: 404 });

    const subject =
        (typeof body.subject === "string" && body.subject.trim()) ||
        (reply.subject?.toLowerCase().startsWith("re:")
            ? reply.subject
            : `Re: ${reply.subject || ""}`.trim());

    // Build References: chain — append the message we're replying to.
    const referencesParts: string[] = [];
    if (reply.references_header) referencesParts.push(reply.references_header);
    if (reply.message_id) referencesParts.push(`<${reply.message_id.replace(/[<>]/g, "")}>`);
    const referencesHeader = referencesParts.join(" ").trim();
    const inReplyTo = reply.message_id
        ? `<${reply.message_id.replace(/[<>]/g, "")}>`
        : reply.in_reply_to || undefined;

    let providerMessageId: string | undefined;
    let sendError: string | undefined;

    if (!process.env.RESEND_API_KEY) {
        sendError = "RESEND_API_KEY not configured";
    } else {
        try {
            const resend = new Resend(process.env.RESEND_API_KEY);
            const headers: Record<string, string> = {};
            if (inReplyTo) headers["In-Reply-To"] = inReplyTo;
            if (referencesHeader) headers["References"] = referencesHeader;

            const result = await resend.emails.send({
                from: FROM_EMAIL,
                to: reply.from_email,
                subject,
                text: replyBody,
                headers,
            });
            providerMessageId =
                (result as { data?: { id?: string } })?.data?.id ||
                (result as { id?: string })?.id;
        } catch (e) {
            sendError = e instanceof Error ? e.message : "send failed";
        }
    }

    await db.from("outreach_reply_sends").insert({
        reply_id: id,
        sent_by: auth.userId,
        to_email: reply.from_email,
        subject,
        body: replyBody,
        provider_message_id: providerMessageId,
        error: sendError,
    });

    if (sendError) {
        return NextResponse.json({ error: sendError }, { status: 500 });
    }

    // Mark handled on a successful manual reply.
    await db
        .from("outreach_replies")
        .update({
            is_handled: true,
            handled_at: new Date().toISOString(),
            handled_by: auth.userId,
        })
        .eq("id", id);

    return NextResponse.json({ ok: true, provider_message_id: providerMessageId });
}
