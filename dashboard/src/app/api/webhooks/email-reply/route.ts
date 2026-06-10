/**
 * Inbound reply ingestion (R3-M2.2).
 *
 * Accepts a normalized JSON payload from whatever forwarding layer sits in
 * front of CapturePilot — SendGrid Inbound Parse, Resend Inbound, Cloudmailin,
 * Postmark, etc. The shape is intentionally minimal so any source can fan
 * into a tiny adapter and post here without us pinning a vendor.
 *
 * Payload (POST JSON):
 *   {
 *     from: "alice@acme.com",             // required
 *     from_name?: "Alice Smith",
 *     subject?: "Re: quick question",
 *     body?: "thanks for reaching out…",  // plain text preferred
 *     body_html?: "...",
 *     in_reply_to?: "<resend-msg-id>",    // headers: In-Reply-To
 *     message_id?: "<inbound-msg-id>",    // headers: Message-ID
 *     references?: "<msg-id-1> <msg-id-2>",
 *   }
 *
 * Auth: shared bearer token EMAIL_REPLY_WEBHOOK_SECRET. The forwarding
 * service includes `Authorization: Bearer <secret>`. Fail-closed in
 * production, fail-open with a warning in dev (consistent with the Resend
 * webhook).
 *
 * Flow:
 *   1. Resolve the originating campaign_step_run by provider_message_id =
 *      in_reply_to (or by walking References when in_reply_to is missing).
 *   2. Look up the contact by lower(from_email).
 *   3. Insert into outreach_replies with sentiment='unsure'. The placeholder
 *      classify_reply_sentiment() Postgres helper catches obvious unsub /
 *      auto-reply keywords; the LLM classifier (handleClassifyOutreachReply
 *      in run_worker_jobs) refines it.
 *   4. Flip the step_run.status='replied' + replied_at, and (when the
 *      inbox settings say so) the campaign_contact.status='replied'.
 *   5. Enqueue a `classify_outreach_reply` worker job.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 10;

if (process.env.NODE_ENV === "production" && !process.env.EMAIL_REPLY_WEBHOOK_SECRET) {
    console.warn(
        `[email-reply] WARNING ${new Date().toISOString()} — EMAIL_REPLY_WEBHOOK_SECRET is NOT set in production. ` +
        `Configure your inbound-mail forwarder (Resend Inbound, SendGrid Parse, …) ` +
        `to POST to /api/webhooks/email-reply with Authorization: Bearer <secret>.`,
    );
}

type InboundPayload = {
    from?: string;
    from_name?: string | null;
    subject?: string | null;
    body?: string | null;
    body_html?: string | null;
    in_reply_to?: string | null;
    message_id?: string | null;
    references?: string | null;
};

// Pull a single message-id out of a header value. Many providers wrap message
// ids in angle brackets ("<abc@host>"); some don't. Resend's outbound id is
// the bare UUID stored in outreach_campaign_step_runs.provider_message_id,
// so we strip brackets + whitespace before matching.
function normalizeMessageId(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const trimmed = raw.trim().replace(/^<+/, "").replace(/>+$/, "");
    if (!trimmed) return null;
    // Strip "@host" suffix that some providers append.
    const at = trimmed.indexOf("@");
    return at > 0 ? trimmed.slice(0, at) : trimmed;
}

function extractAllIds(payload: InboundPayload): string[] {
    const ids: string[] = [];
    const direct = normalizeMessageId(payload.in_reply_to);
    if (direct) ids.push(direct);
    const refs = (payload.references || "").split(/\s+/).map(normalizeMessageId).filter(Boolean) as string[];
    for (const r of refs) if (!ids.includes(r)) ids.push(r);
    return ids;
}

export async function POST(req: NextRequest) {
    const secret = process.env.EMAIL_REPLY_WEBHOOK_SECRET;
    const isProd = process.env.NODE_ENV === "production";

    if (secret) {
        const auth = req.headers.get("authorization") || "";
        const presented = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
        if (presented !== secret) {
            return new NextResponse("Unauthorized", { status: 401 });
        }
    } else if (isProd) {
        console.error("[email-reply] EMAIL_REPLY_WEBHOOK_SECRET not set in production — refusing request");
        return new NextResponse("Server misconfigured", { status: 500 });
    } else {
        console.warn("[email-reply] EMAIL_REPLY_WEBHOOK_SECRET not set — accepting unauthenticated POST (dev only)");
    }

    let payload: InboundPayload;
    try {
        payload = await req.json() as InboundPayload;
    } catch {
        return new NextResponse("Bad JSON", { status: 400 });
    }

    const from = (payload.from || "").trim().toLowerCase();
    if (!from) {
        return NextResponse.json({ ok: false, error: "missing from" }, { status: 400 });
    }

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    const inReplyToIds = extractAllIds(payload);
    const inboundMessageId = normalizeMessageId(payload.message_id);

    // 1. Match to the outbound send. We try in_reply_to first, then walk
    //    References. The step_run row carries campaign_contact_id which lets
    //    us reach the campaign + contact in one extra select.
    let stepRunId: string | null = null;
    let campaignContactId: string | null = null;
    let campaignId: string | null = null;
    let contactId: string | null = null;

    if (inReplyToIds.length > 0) {
        const { data: stepRuns } = await sb.from("outreach_campaign_step_runs")
            .select("id, campaign_contact_id, provider_message_id")
            .in("provider_message_id", inReplyToIds)
            .order("created_at", { ascending: false })
            .limit(1) as { data: { id: string; campaign_contact_id: string; provider_message_id: string }[] | null };

        if (stepRuns && stepRuns.length > 0) {
            stepRunId = stepRuns[0].id;
            campaignContactId = stepRuns[0].campaign_contact_id;
        }
    }

    if (campaignContactId) {
        const { data: cc } = await sb.from("outreach_campaign_contacts")
            .select("campaign_id, contact_id")
            .eq("id", campaignContactId)
            .maybeSingle() as { data: { campaign_id: string; contact_id: string } | null };
        if (cc) {
            campaignId = cc.campaign_id;
            contactId = cc.contact_id;
        }
    }

    // 2. Resolve contact by email when we couldn't infer it from the send chain
    //    (e.g. reply forwarded from a different mailbox).
    if (!contactId) {
        const { data: contact } = await sb.from("outreach_contacts")
            .select("id")
            .ilike("email", from)
            .limit(1)
            .maybeSingle() as { data: { id: string } | null };
        if (contact) contactId = contact.id;
    }

    // 3. Persist the reply. classify_reply_sentiment() is an immutable
    //    Postgres helper — it catches obvious unsub / OOO keywords and falls
    //    back to 'unsure'. The LLM worker fills in the real sentiment.
    const body = payload.body || null;
    const subject = payload.subject || null;

    // Cheap fast-path sentiment so the row never lands NULL. Mirrors the
    // SQL helper in migration 149 so we don't need a round-trip just for
    // the placeholder.
    let initialSentiment: string = "unsure";
    if (body && /(unsubscribe|opt[- ]out|remove me|take me off)/i.test(body)) {
        initialSentiment = "unsubscribe";
    } else if (subject && /(out of office|auto[- ]?reply|automatic reply)/i.test(subject)) {
        initialSentiment = "auto_reply";
    }

    const { data: inserted, error: insErr } = await sb.from("outreach_replies")
        .insert({
            campaign_step_run_id: stepRunId,
            contact_id: contactId,
            from_email: from,
            from_name: payload.from_name || null,
            subject,
            body_text: body,
            body_html: payload.body_html || null,
            received_at: new Date().toISOString(),
            message_id: inboundMessageId,
            in_reply_to: inReplyToIds[0] || null,
            sentiment: initialSentiment,
        })
        .select("id")
        .maybeSingle() as { data: { id: string } | null; error: { message: string; code?: string } | null };

    if (insErr) {
        // Duplicate inbound message_id is fine — the forwarder probably
        // retried. Don't 500 in that case.
        if (insErr.code === "23505") {
            return NextResponse.json({ ok: true, deduped: true });
        }
        console.error("[email-reply] insert failed", { error: insErr.message });
        return new NextResponse("Insert failed", { status: 500 });
    }

    const replyId = inserted?.id;

    // 4. Flip the step_run + campaign_contact state. The auto-pause toggle
    //    lives on outreach_inbox_settings (id=1). When disabled we still
    //    mark the step_run as replied — only the contact-level pause is
    //    gated by the toggle.
    const now = new Date().toISOString();
    if (stepRunId) {
        await sb.from("outreach_campaign_step_runs")
            .update({ status: "replied", replied_at: now })
            .eq("id", stepRunId)
            .is("replied_at", null);
    }

    const { data: settings } = await sb.from("outreach_inbox_settings")
        .select("auto_pause_campaign_on_reply")
        .eq("id", 1)
        .maybeSingle() as { data: { auto_pause_campaign_on_reply: boolean } | null };

    if (campaignContactId && (settings?.auto_pause_campaign_on_reply ?? true)) {
        await sb.from("outreach_campaign_contacts")
            .update({ status: "replied", finished_at: now })
            .eq("id", campaignContactId);
    }

    if (contactId) {
        await sb.from("outreach_contacts")
            .update({ last_replied_at: now })
            .eq("id", contactId);
    }

    // 5. Enqueue the LLM classifier. dedup_key on worker_jobs is generated
    //    from task_type + payload, so duplicate inbound forwards collapse to
    //    a single job. Skip if the placeholder already nailed a hard signal
    //    (unsubscribe / auto_reply) and there's no body for the LLM to chew on.
    const shouldClassify = !!replyId
        && initialSentiment !== "unsubscribe"
        && (body?.length || 0) > 0;

    if (shouldClassify) {
        await sb.from("worker_jobs").insert({
            task_type: "classify_outreach_reply",
            payload: { reply_id: replyId },
            priority: 7,
        });
    }

    return NextResponse.json({
        ok: true,
        reply_id: replyId,
        step_run_id: stepRunId,
        campaign_id: campaignId,
        contact_id: contactId,
        sentiment: initialSentiment,
        queued_for_classification: shouldClassify,
    });
}
