/**
 * POST /api/admin/cockpit/send-email
 *
 * Sends a cold lead-in email FROM the configured cockpit sender (Sergio), with
 * a tasteful branded + CAN-SPAM-compliant footer appended. This is the "send"
 * half of the outreach cockpit — the operator reviews the AI-drafted
 * subject/body (from /api/admin/cockpit/message) and fires it from here.
 *
 * Body:
 *   contractor_id?  string   (one of contractor_id / analysis_id is optional —
 *   analysis_id?    string    used only for the send-log linkage)
 *   to_email        string   (required)
 *   subject         string   (required)
 *   body            string   (required, plain text; \n\n => paragraphs)
 *   lead_company?   string   (shown in the footer line + log)
 *
 * Refuses to send (400) until the cockpit sender's from_email is set and
 * non-placeholder — see /api/admin/cockpit/sender.
 *
 * Reuses sendCockpitEmail() from @/lib/email which centralizes the Resend
 * client + the outreach_optouts suppression check.
 *
 * Returns { ok: true, id } | { ok: false, error }.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdminWithUser } from "@/lib/auth-admin";
import { sendCockpitEmail } from "@/lib/email";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const runtime = "nodejs";
export const maxDuration = 30;

const SETTINGS_KEY = "cockpit_sender";

interface CockpitSender {
    from_email: string;
    from_name: string;
    reply_to: string;
    footer_html: string;
    physical_address: string;
}

const COLORS = {
    black: "#0c0a09",
    stone700: "#44403c",
    stone500: "#78716c",
    stone300: "#d6d3d1",
    stone200: "#e7e5e4",
    white: "#ffffff",
    emerald700: "#047857",
};

const FONT_STACK =
    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function db() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

export async function POST(req: NextRequest) {
    const gate = await assertAdminWithUser();
    if (!gate.ok) return gate.response;

    let raw: Record<string, unknown>;
    try {
        raw = (await req.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const contractor_id = typeof raw.contractor_id === "string" ? raw.contractor_id : null;
    const analysis_id = typeof raw.analysis_id === "string" ? raw.analysis_id : null;
    const to_email = (typeof raw.to_email === "string" ? raw.to_email : "").trim();
    const subject = (typeof raw.subject === "string" ? raw.subject : "").trim();
    const body = typeof raw.body === "string" ? raw.body : "";
    const lead_company = typeof raw.lead_company === "string" ? raw.lead_company.trim() : "";

    if (!to_email || !EMAIL_RE.test(to_email)) {
        return NextResponse.json({ ok: false, error: "A valid to_email is required." }, { status: 400 });
    }
    if (!subject) {
        return NextResponse.json({ ok: false, error: "Subject is required." }, { status: 400 });
    }
    if (!body.trim()) {
        return NextResponse.json({ ok: false, error: "Body is required." }, { status: 400 });
    }

    const sb = db();

    // ── Load the cockpit sender; refuse until from_email is real ──────────────
    const { data: senderRow, error: senderErr } = await sb
        .from("outreach_settings")
        .select("value")
        .eq("key", SETTINGS_KEY)
        .maybeSingle();

    if (senderErr) {
        console.error("[cockpit/send-email] sender load failed:", senderErr.message);
        return NextResponse.json({ ok: false, error: "Could not load the cockpit sender." }, { status: 500 });
    }

    const sender = (senderRow?.value || {}) as Partial<CockpitSender>;
    const fromEmail = (sender.from_email || "").trim();

    if (!fromEmail || fromEmail.includes("[") || !EMAIL_RE.test(fromEmail)) {
        return NextResponse.json(
            { ok: false, error: "Set the cockpit sender email first (Settings)." },
            { status: 400 },
        );
    }

    const fromName = (sender.from_name || "CapturePilot").trim();
    const replyTo = (sender.reply_to || "").trim() || fromEmail;
    const from = `${fromName} <${fromEmail}>`;

    // ── Build the HTML: plain body paragraphs + branded CAN-SPAM footer ──────
    const html = buildHtml({
        body,
        fromName,
        replyTo,
        leadCompany: lead_company,
        physicalAddress: (sender.physical_address || "").trim(),
        footerHtml: (sender.footer_html || "").trim(),
        toEmail: to_email,
    });

    const result = await sendCockpitEmail({ from, to: to_email, subject, html, replyTo });

    // ── Best-effort send log (never block the response on logging) ───────────
    void logSend(sb, {
        contractor_id,
        analysis_id,
        to_email,
        subject,
        from_email: fromEmail,
        lead_company,
        sent_by: gate.userId,
        result,
    });

    if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
    }
    return NextResponse.json({ ok: true, id: result.id });
}

// ── HTML builder ───────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function buildHtml(args: {
    body: string;
    fromName: string;
    replyTo: string;
    leadCompany: string;
    physicalAddress: string;
    footerHtml: string;
    toEmail: string;
}): string {
    const { body, fromName, replyTo, leadCompany, physicalAddress, footerHtml, toEmail } = args;

    // Plain body → paragraphs. Split on blank lines; single newlines become <br>.
    const paragraphs = body
        .replace(/\r\n/g, "\n")
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map(
            (p) =>
                `<p style="color:${COLORS.stone700};font-size:15px;line-height:1.7;margin:0 0 16px;">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`,
        )
        .join("\n");

    const companyLine = leadCompany
        ? `<p style="color:${COLORS.stone500};font-size:12px;margin:0 0 2px;">Sent to ${escapeHtml(leadCompany)}</p>`
        : "";

    // Tasteful branded footer: sender + reply-to + CAN-SPAM physical address +
    // a subtle "Sent via CapturePilot" line and an opt-out line.
    const extraFooter = footerHtml
        ? `<div style="color:${COLORS.stone500};font-size:12px;line-height:1.6;margin:0 0 12px;">${footerHtml}</div>`
        : "";

    const addressLine = physicalAddress
        ? `<p style="color:${COLORS.stone500};font-size:11px;line-height:1.6;margin:0 0 4px;">${escapeHtml(physicalAddress)}</p>`
        : "";

    return `<!doctype html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:${COLORS.white};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.white};">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:${FONT_STACK};">
        <tr><td style="padding:0 0 24px;">
          ${paragraphs}
        </td></tr>
        <tr><td style="border-top:1px solid ${COLORS.stone200};padding:18px 0 0;">
          ${companyLine}
          <p style="color:${COLORS.black};font-size:13px;font-weight:600;margin:0 0 2px;">${escapeHtml(fromName)}</p>
          <p style="color:${COLORS.stone500};font-size:12px;margin:0 0 12px;">
            Reply to <a href="mailto:${escapeHtml(replyTo)}" style="color:${COLORS.emerald700};text-decoration:none;">${escapeHtml(replyTo)}</a>
          </p>
          ${extraFooter}
          ${addressLine}
          <p style="color:${COLORS.stone500};font-size:11px;line-height:1.6;margin:8px 0 0;">
            Sent via CapturePilot. You're receiving this because we think federal contracting could be a fit for your business.
            If you'd rather not hear from us, just reply with &ldquo;unsubscribe&rdquo; and we won't contact you again.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Send log (best-effort, schema-tolerant) ─────────────────────────────────

async function logSend(
    sb: any,
    entry: {
        contractor_id: string | null;
        analysis_id: string | null;
        to_email: string;
        subject: string;
        from_email: string;
        lead_company: string;
        sent_by: string;
        result: { ok: true; id: string | null } | { ok: false; error: string };
    },
) {
    const row = {
        contractor_id: entry.contractor_id,
        analysis_id: entry.analysis_id,
        to_email: entry.to_email,
        from_email: entry.from_email,
        subject: entry.subject,
        lead_company: entry.lead_company || null,
        sent_by: entry.sent_by,
        status: entry.result.ok ? "sent" : "failed",
        provider_id: entry.result.ok ? entry.result.id : null,
        error: entry.result.ok ? null : entry.result.error,
        sent_at: new Date().toISOString(),
    };
    try {
        const { error } = await sb.from("cockpit_send_log").insert(row);
        if (error) {
            // Table may not exist yet — fall back to console so the send is
            // still auditable without a migration being a hard dependency.
            console.log("[cockpit/send-email] send-log (no table):", JSON.stringify(row));
        }
    } catch (e) {
        console.log("[cockpit/send-email] send-log (insert threw):", JSON.stringify(row), e);
    }
}
