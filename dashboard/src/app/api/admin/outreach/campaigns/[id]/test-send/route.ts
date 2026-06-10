import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import { assertAdminWithUser } from "@/lib/auth-admin";
import { renderMergeFields, FAKE_CONTACT } from "@/lib/outreach-merge";

/**
 * POST /api/admin/outreach/campaigns/[id]/test-send
 * Body: { recipient_email: string, step_index?: number, variant_key?: string }
 *
 * Sends step `step_index` (default 0) of the campaign to the given recipient
 * with the standard fake contact merge fields. Does NOT count against campaign
 * stats. Subject is prefixed "[TEST]" so it's easy to spot in the inbox.
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const auth = await assertAdminWithUser();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await req.json().catch(() => ({})) as {
        recipient_email?: string;
        step_index?: number;
        variant_key?: string;
    };

    const recipient = (body.recipient_email || "").trim();
    if (!recipient || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient)) {
        return NextResponse.json({ error: "Valid recipient_email is required" }, { status: 400 });
    }

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    const { data: campaign, error: cErr } = await admin
        .from("outreach_campaigns")
        .select("id, name, sender_email, sender_name, unsubscribe_footer, physical_address")
        .eq("id", id)
        .maybeSingle();
    if (cErr || !campaign) {
        return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const stepIndex = Number(body.step_index ?? 0);
    const variantKey = body.variant_key ?? "A";

    const { data: step, error: sErr } = await admin
        .from("outreach_campaign_steps")
        .select("channel, subject, body, body_format")
        .eq("campaign_id", id)
        .eq("step_index", stepIndex)
        .eq("variant_key", variantKey)
        .maybeSingle();

    if (sErr || !step) {
        return NextResponse.json({ error: `Step ${stepIndex}/${variantKey} not found` }, { status: 404 });
    }

    if (step.channel !== "email") {
        return NextResponse.json({ error: `Test send only supports email steps (this step is ${step.channel})` }, { status: 400 });
    }

    if (!process.env.RESEND_API_KEY) {
        return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });
    }

    const r = new Resend(process.env.RESEND_API_KEY);
    const subject = `[TEST] ${renderMergeFields(step.subject || "(no subject)", FAKE_CONTACT)}`;
    const renderedBody = renderMergeFields(step.body || "", FAKE_CONTACT);

    const footer = renderMergeFields(
        campaign.unsubscribe_footer || "You received this test from CapturePilot.",
        { ...FAKE_CONTACT, unsubscribe_url: `${process.env.NEXT_PUBLIC_SITE_URL || "https://capturepilot.com"}/unsubscribe?token=test` },
    );

    const html = step.body_format === "html"
        ? `${renderedBody}<hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0"><p style="color:#737373;font-size:12px">${footer}</p>`
        : `<pre style="font-family:inherit;white-space:pre-wrap">${escapeHtml(renderedBody)}</pre><hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0"><p style="color:#737373;font-size:12px">${escapeHtml(footer)}</p>`;

    const senderName = campaign.sender_name?.trim() || "CapturePilot";
    const senderEmail = campaign.sender_email?.trim() || process.env.FROM_EMAIL || "noreply@capturepilot.com";
    const from = senderEmail.includes("<") ? senderEmail : `${senderName} <${senderEmail}>`;

    try {
        await r.emails.send({ from, to: recipient, subject, html });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, sent_to: recipient });
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;",
    }[c] || c));
}
