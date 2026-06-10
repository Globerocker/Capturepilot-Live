/**
 * POST /api/admin/outreach/test-send
 * Body: { to, subject?, html? }
 *
 * Sends a one-shot test email through Resend using the current
 * outreach_settings (sender_email, sender_name, reply_to, signature).
 * Confirms delivery + helps verify SPF/DKIM/DMARC pass on the receiver side.
 *
 * Always passes through `tags: [{ name: "test_send", value: "1" }]` so the
 * Resend webhook can filter these out of opt-out tracking — a test bounce
 * should NOT add the admin to the suppression list.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { assertAdminWithUser } from "@/lib/auth-admin";

export const runtime = "nodejs";
export const maxDuration = 30;

interface SendBody {
    to?: string;
    subject?: string;
    html?: string;
}

function db() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );
}

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function loadSettings(): Promise<Record<string, unknown>> {
    const { data } = await db().from("outreach_settings").select("key, value");
    const out: Record<string, unknown> = {};
    for (const row of data || []) {
        const r = row as { key: string; value: unknown };
        out[r.key] = r.value;
    }
    return out;
}

export async function POST(req: NextRequest) {
    const gate = await assertAdminWithUser();
    if (!gate.ok) return gate.response;
    const body = (await req.json().catch(() => null)) as SendBody | null;
    if (!body?.to || !EMAIL_RX.test(body.to)) {
        return NextResponse.json({ error: "Valid `to` address required" }, { status: 400 });
    }
    if (!process.env.RESEND_API_KEY) {
        return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });
    }

    const settings = await loadSettings();
    const senderEmail = String(settings.sender_email || "noreply@capturepilot.com");
    const senderName = String(settings.sender_name || "CapturePilot");
    const replyTo = String(settings.reply_to || senderEmail);
    const signature = String(settings.email_signature || "");

    const subject = body.subject?.trim() || `Test send from ${senderName}`;
    const html = `<div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #064e3b;">Test send</h2>
  <p>This is a one-shot test email from CapturePilot admin outreach settings.</p>
  <ul>
    <li><strong>From:</strong> ${senderName} &lt;${senderEmail}&gt;</li>
    <li><strong>Reply-to:</strong> ${replyTo}</li>
    <li><strong>Sent at:</strong> ${new Date().toISOString()}</li>
    <li><strong>By:</strong> ${gate.email || "admin"}</li>
  </ul>
  ${body.html || "<p>If you received this, sender domain auth is working.</p>"}
  ${signature ? `<hr style="border: none; border-top: 1px solid #d6d3d1; margin: 24px 0;" />${signature}` : ""}
</div>`;

    const resend = new Resend(process.env.RESEND_API_KEY);
    const result = await resend.emails.send({
        from: `${senderName} <${senderEmail}>`,
        to: body.to,
        replyTo: replyTo,
        subject,
        html,
        tags: [{ name: "test_send", value: "1" }],
    });

    if (result.error) {
        return NextResponse.json({ error: result.error.message }, { status: 502 });
    }
    return NextResponse.json({ ok: true, id: result.data?.id, sent_to: body.to });
}
