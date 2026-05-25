/**
 * Email digest sender for the health_monitor cron. Batches every alert from
 * a single run into ONE email so info@fillcart.de doesn't get spammed when
 * multiple things break at once.
 */

import { Resend } from "resend";
import {
    emailTemplate,
    contentCard,
    alertBox,
    urgentBox,
    paragraph,
    sectionLabel,
    APP_URL,
    COLORS,
} from "@/lib/email-template";

type Alert = { slug: string; severity: string; title: string; detail?: string };

const SEVERITY_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };

function severitySort(a: Alert, b: Alert): number {
    return (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99);
}

function renderAlertRow(a: Alert): string {
    const color = a.severity === "critical" ? "#dc2626" : a.severity === "warning" ? "#d97706" : COLORS.stone600;
    const badge = a.severity.toUpperCase();
    return `
        <tr>
            <td style="padding:10px 0;border-bottom:1px solid ${COLORS.stone200};vertical-align:top;">
                <span style="display:inline-block;font-size:10px;font-weight:700;color:${color};border:1px solid ${color};border-radius:4px;padding:1px 6px;letter-spacing:0.5px;margin-right:8px;">${badge}</span>
                <span style="font-size:14px;font-weight:700;color:${COLORS.black};">${escape(a.title)}</span>
                <span style="display:block;font-size:12px;color:${COLORS.stone500};margin-top:3px;margin-left:0;">${a.slug}</span>
                ${a.detail ? `<span style="display:block;font-size:12px;color:${COLORS.stone600};margin-top:3px;">${escape(a.detail)}</span>` : ""}
            </td>
        </tr>
    `;
}

function escape(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export async function sendHealthDigest(args: { to: string; alerts: Alert[] }): Promise<{ sent: boolean; error?: string }> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return { sent: false, error: "missing_resend_key" };
    if (args.alerts.length === 0) return { sent: false, error: "no_alerts" };

    const sorted = [...args.alerts].sort(severitySort);
    const criticalCount = sorted.filter(a => a.severity === "critical").length;
    const warningCount = sorted.filter(a => a.severity === "warning").length;

    const subject = criticalCount > 0
        ? `[CRITICAL] ${criticalCount} CapturePilot health alert${criticalCount === 1 ? "" : "s"}`
        : warningCount > 0
            ? `[WARNING] ${warningCount} CapturePilot health alert${warningCount === 1 ? "" : "s"}`
            : `CapturePilot health update — ${sorted.length} change${sorted.length === 1 ? "" : "s"}`;

    const summaryBox = criticalCount > 0
        ? urgentBox(`<p style="margin:0;color:#991b1b;font-size:14px;line-height:1.6;"><strong>${criticalCount} critical</strong> ${criticalCount === 1 ? "issue needs" : "issues need"} attention. Investigate at <a href="${APP_URL}/admin/health" style="color:#991b1b;text-decoration:underline;">/admin/health</a>.</p>`)
        : alertBox(`<p style="margin:0;color:#854d0e;font-size:14px;line-height:1.6;">${warningCount} warning${warningCount === 1 ? "" : "s"} reported. Review at <a href="${APP_URL}/admin/health" style="color:#854d0e;text-decoration:underline;">/admin/health</a>.</p>`);

    const body = `
        ${paragraph("The health monitor flagged the following changes in the last hour:")}
        ${summaryBox}
        ${contentCard(`
            ${sectionLabel(`${sorted.length} alert${sorted.length === 1 ? "" : "s"}`)}
            <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:8px;">
                <tbody>
                    ${sorted.map(renderAlertRow).join("")}
                </tbody>
            </table>
        `)}
        <p style="margin:24px 0 0;font-size:13px;color:${COLORS.stone500};line-height:1.6;">
            The health_monitor cron runs hourly. Recovered alerts auto-resolve. Open
            <a href="${APP_URL}/admin/health" style="color:${COLORS.emerald600};">/admin/health</a>
            to silence individual alerts or update rotation dates at
            <a href="${APP_URL}/admin/connectors" style="color:${COLORS.emerald600};">/admin/connectors</a>.
        </p>
    `;

    const html = emailTemplate({
        category: "transactional",
        preheader: subject,
        eyebrow: criticalCount > 0 ? "Critical Alerts" : "Health Update",
        heading: subject,
        body,
        cta: { label: "Open /admin/health", url: `${APP_URL}/admin/health` },
    });

    const resend = new Resend(apiKey);
    const from = process.env.HEALTH_ALERT_FROM || "CapturePilot Health Monitor <alerts@capturepilot.com>";
    const { error } = await resend.emails.send({
        from,
        to: args.to,
        subject,
        html,
        replyTo: "andre@capturepilot.com",
    });

    if (error) return { sent: false, error: error.message || String(error) };
    return { sent: true };
}
