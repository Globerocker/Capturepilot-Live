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
    title?: string; // optional sender title (e.g. "Founder") — used in the auto-footer
}

const CAPTUREPILOT_URL = "https://www.capturepilot.com";

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
    // Optional resource attachments — [{ url, title? }]. We fetch + base64 each
    // (https only, size + count capped) and hand them to Resend.
    const attachReq: Array<{ url: string; title?: string }> = Array.isArray(raw.attachments)
        ? (raw.attachments as any[])
            .map((a) => ({ url: typeof a?.url === "string" ? a.url.trim() : "", title: typeof a?.title === "string" ? a.title : undefined }))
            .filter((a) => a.url)
        : [];

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
        fromTitle: (sender.title || "").trim(),
        replyTo,
        leadCompany: lead_company,
        physicalAddress: (sender.physical_address || "").trim(),
        footerHtml: (sender.footer_html || "").trim(),
        toEmail: to_email,
    });

    // ── Fetch + encode any resource attachments (best-effort, capped) ────────
    const { attachments, skipped } = await fetchAttachments(attachReq);
    if (skipped.length) {
        console.warn("[cockpit/send-email] skipped attachments:", skipped.join("; "));
    }

    const result = await sendCockpitEmail({ from, to: to_email, subject, html, replyTo, attachments });

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

// ── Attachment fetcher (https only, size + count capped) ─────────────────────

const MAX_ATTACHMENTS = 4;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024; // 8MB each — Resend's practical ceiling

/** Derive a safe, human filename from an explicit title or the URL path. */
function filenameFor(url: string, title?: string): string {
    let base = (title || "").trim();
    if (!base) {
        try {
            const p = new URL(url).pathname;
            base = decodeURIComponent(p.split("/").filter(Boolean).pop() || "resource");
        } catch {
            base = "resource";
        }
    }
    base = base.replace(/[^\w.\-() ]+/g, "_").slice(0, 80).trim() || "resource";
    // Ensure a .pdf extension when the URL looks like a PDF and the name lacks one.
    if (!/\.[a-z0-9]{2,5}$/i.test(base) && /\.pdf(\?|$)/i.test(url)) base += ".pdf";
    return base;
}

/**
 * Fetch each requested attachment URL and return Resend-shaped { filename,
 * content(base64) } entries. Enforces: https only, ≤MAX_ATTACHMENTS, ≤8MB each.
 * Failures are collected in `skipped` (never throw — a bad asset must not block
 * the whole send).
 */
async function fetchAttachments(
    reqs: Array<{ url: string; title?: string }>,
): Promise<{ attachments: Array<{ filename: string; content: string }>; skipped: string[] }> {
    const attachments: Array<{ filename: string; content: string }> = [];
    const skipped: string[] = [];
    const slice = reqs.slice(0, MAX_ATTACHMENTS);
    if (reqs.length > MAX_ATTACHMENTS) skipped.push(`>${MAX_ATTACHMENTS} attachments — extras dropped`);

    for (const r of slice) {
        if (!/^https:\/\//i.test(r.url)) {
            skipped.push(`${r.url} (not https)`);
            continue;
        }
        try {
            const res = await fetch(r.url, { signal: AbortSignal.timeout(15000), redirect: "follow" });
            if (!res.ok) {
                skipped.push(`${r.url} (HTTP ${res.status})`);
                continue;
            }
            const buf = Buffer.from(await res.arrayBuffer());
            if (buf.byteLength === 0) {
                skipped.push(`${r.url} (empty)`);
                continue;
            }
            if (buf.byteLength > MAX_ATTACHMENT_BYTES) {
                skipped.push(`${r.url} (${Math.round(buf.byteLength / 1e6)}MB > 8MB)`);
                continue;
            }
            attachments.push({ filename: filenameFor(r.url, r.title), content: buf.toString("base64") });
        } catch (e) {
            skipped.push(`${r.url} (${e instanceof Error ? e.message : "fetch failed"})`);
        }
    }
    return { attachments, skipped };
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
    fromTitle: string;
    replyTo: string;
    leadCompany: string;
    physicalAddress: string;
    footerHtml: string;
    toEmail: string;
}): string {
    const { body, fromName, fromTitle, replyTo, leadCompany, physicalAddress, footerHtml, toEmail } = args;

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

    const footer = footerHtml
        ? customFooter({ footerHtml, fromName, replyTo, leadCompany, physicalAddress })
        : autoFooter({ fromName, fromTitle, replyTo, leadCompany, physicalAddress });

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
          ${footer}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// The shared CAN-SPAM compliance lines (Sent via CapturePilot + unsubscribe).
function complianceLines(): string {
    return `<p style="color:${COLORS.stone500};font-size:11px;line-height:1.6;margin:8px 0 0;">
            Sent via <a href="${CAPTUREPILOT_URL}" style="color:${COLORS.stone500};text-decoration:underline;">CapturePilot</a>. You're receiving this because we think federal contracting could be a fit for your business.
            If you'd rather not hear from us, just reply with &ldquo;unsubscribe&rdquo; and we won't contact you again.
          </p>`;
}

// Operator supplied their own footer HTML — keep the existing behavior (their
// block + sender + reply-to + address + the CAN-SPAM lines).
function customFooter(args: {
    footerHtml: string;
    fromName: string;
    replyTo: string;
    leadCompany: string;
    physicalAddress: string;
}): string {
    const { footerHtml, fromName, replyTo, leadCompany, physicalAddress } = args;

    const companyLine = leadCompany
        ? `<p style="color:${COLORS.stone500};font-size:12px;margin:0 0 2px;">Sent to ${escapeHtml(leadCompany)}</p>`
        : "";
    const addressLine = physicalAddress
        ? `<p style="color:${COLORS.stone500};font-size:11px;line-height:1.6;margin:0 0 4px;">${escapeHtml(physicalAddress)}</p>`
        : "";

    return `${companyLine}
          <p style="color:${COLORS.black};font-size:13px;font-weight:600;margin:0 0 2px;">${escapeHtml(fromName)}</p>
          <p style="color:${COLORS.stone500};font-size:12px;margin:0 0 12px;">
            Reply to <a href="mailto:${escapeHtml(replyTo)}" style="color:${COLORS.emerald700};text-decoration:none;">${escapeHtml(replyTo)}</a>
          </p>
          <div style="color:${COLORS.stone500};font-size:12px;line-height:1.6;margin:0 0 12px;">${footerHtml}</div>
          ${addressLine}
          ${complianceLines()}`;
}

// No footer_html stored → GENERATE a clean professional footer from known facts
// so the operator never has to write one. Sources: sender from_name (+ optional
// title), the CapturePilot brand + URL, the physical address (CAN-SPAM), a
// reply-to line, and the CAN-SPAM unsubscribe line.
function autoFooter(args: {
    fromName: string;
    fromTitle: string;
    replyTo: string;
    leadCompany: string;
    physicalAddress: string;
}): string {
    const { fromName, fromTitle, replyTo, leadCompany, physicalAddress } = args;

    const companyLine = leadCompany
        ? `<p style="color:${COLORS.stone500};font-size:12px;margin:0 0 2px;">Sent to ${escapeHtml(leadCompany)}</p>`
        : "";

    // "Sergio · CapturePilot" → name line; title (if any) on its own muted line.
    const nameLine = `<p style="color:${COLORS.black};font-size:13px;font-weight:600;margin:0 0 1px;">${escapeHtml(fromName)}</p>`;
    const titleLine = fromTitle
        ? `<p style="color:${COLORS.stone500};font-size:12px;margin:0 0 2px;">${escapeHtml(fromTitle)}</p>`
        : "";

    const brandLine = `<p style="color:${COLORS.stone500};font-size:12px;margin:0 0 10px;">
            CapturePilot · <a href="${CAPTUREPILOT_URL}" style="color:${COLORS.emerald700};text-decoration:none;">www.capturepilot.com</a>
          </p>`;

    const replyLine = `<p style="color:${COLORS.stone500};font-size:12px;margin:0 0 12px;">
            Reply to <a href="mailto:${escapeHtml(replyTo)}" style="color:${COLORS.emerald700};text-decoration:none;">${escapeHtml(replyTo)}</a>
          </p>`;

    const addressLine = physicalAddress
        ? `<p style="color:${COLORS.stone500};font-size:11px;line-height:1.6;margin:0 0 4px;">${escapeHtml(physicalAddress)}</p>`
        : "";

    return `${companyLine}
          ${nameLine}
          ${titleLine}
          ${brandLine}
          ${replyLine}
          ${addressLine}
          ${complianceLines()}`;
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
