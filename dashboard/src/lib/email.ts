/**
 * Email service using Resend.
 * Handles all transactional emails: welcome, task notifications, opportunity alerts.
 */
import { Resend } from "resend";

let _resend: Resend | null = null;
function getResend(): Resend | null {
    if (!process.env.RESEND_API_KEY) return null;
    if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
    return _resend;
}

const FROM_EMAIL = process.env.FROM_EMAIL || "CapturePilot <noreply@capturepilot.com>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.capturepilot.com";

// ─── Welcome Email ─────────────────────────────────────────────────
export async function sendWelcomeEmail(to: string, companyName: string) {
    try {
        const r = getResend();
        if (!r) { console.warn("RESEND_API_KEY not set, skipping email"); return false; }
        await r.emails.send({
            from: FROM_EMAIL,
            to,
            subject: `Welcome to CapturePilot, ${companyName}!`,
            html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
                <div style="text-align: center; margin-bottom: 32px;">
                    <h1 style="font-size: 24px; font-weight: 800; color: #000; margin: 0;">⚡ CapturePilot</h1>
                    <p style="color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 2px; margin-top: 4px;">Strategic Capture Intelligence</p>
                </div>

                <h2 style="font-size: 20px; color: #000; margin-bottom: 16px;">Welcome aboard, ${companyName}!</h2>

                <p style="color: #3f3f46; line-height: 1.6; font-size: 15px;">
                    Your account is set up and we're already matching you with federal contracting opportunities.
                </p>

                <div style="background: #f4f4f5; border-radius: 12px; padding: 20px; margin: 24px 0;">
                    <p style="font-size: 13px; color: #71717a; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">What happens next</p>
                    <ul style="color: #3f3f46; font-size: 14px; line-height: 1.8; padding-left: 20px; margin: 0;">
                        <li>We're scanning 30,000+ federal opportunities for your matches</li>
                        <li>Your dashboard will show HOT, WARM, and COLD leads</li>
                        <li>You'll receive alerts when new high-scoring opportunities appear</li>
                    </ul>
                </div>

                <div style="text-align: center; margin: 32px 0;">
                    <a href="${APP_URL}/dashboard" style="display: inline-block; background: #000; color: #fff; padding: 14px 32px; border-radius: 9999px; text-decoration: none; font-weight: 700; font-size: 14px;">
                        Go to Dashboard →
                    </a>
                </div>

                <p style="color: #a1a1aa; font-size: 12px; text-align: center; margin-top: 40px;">
                    CapturePilot — Strategic Capture Intelligence Engine<br>
                    <a href="${APP_URL}" style="color: #a1a1aa;">capturepilot.com</a>
                </p>
            </div>`,
        });
        return true;
    } catch (e) {
        console.error("Failed to send welcome email:", e);
        return false;
    }
}

// ─── Consulting Client Welcome ─────────────────────────────────────
export async function sendConsultingWelcomeEmail(
    to: string,
    companyName: string,
    contactName: string,
    tempPassword?: string,
) {
    try {
        const r = getResend();
        if (!r) { console.warn("RESEND_API_KEY not set, skipping email"); return false; }
        await r.emails.send({
            from: FROM_EMAIL,
            to,
            subject: `Your CapturePilot Portal is Ready — ${companyName}`,
            html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
                <div style="text-align: center; margin-bottom: 32px;">
                    <h1 style="font-size: 24px; font-weight: 800; color: #000; margin: 0;">⚡ CapturePilot</h1>
                    <p style="color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 2px; margin-top: 4px;">Strategic Capture Intelligence</p>
                </div>

                <h2 style="font-size: 20px; color: #000; margin-bottom: 16px;">Hi ${contactName},</h2>

                <p style="color: #3f3f46; line-height: 1.6; font-size: 15px;">
                    Your CapturePilot consulting portal for <strong>${companyName}</strong> is ready.
                    Our team is actively working on your government contracting pipeline.
                </p>

                <div style="background: #f4f4f5; border-radius: 12px; padding: 20px; margin: 24px 0;">
                    <p style="font-size: 13px; color: #71717a; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">Your Login</p>
                    <p style="color: #3f3f46; font-size: 14px; margin: 4px 0;"><strong>Email:</strong> ${to}</p>
                    ${tempPassword ? `<p style="color: #3f3f46; font-size: 14px; margin: 4px 0;"><strong>Temporary Password:</strong> ${tempPassword}</p>` : ""}
                    <p style="color: #3f3f46; font-size: 14px; margin: 8px 0 0;">
                        You can also sign in with your Google account.
                    </p>
                </div>

                <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px; padding: 20px; margin: 24px 0;">
                    <p style="font-size: 13px; color: #065f46; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">What you can do in your portal</p>
                    <ul style="color: #065f46; font-size: 14px; line-height: 1.8; padding-left: 20px; margin: 0;">
                        <li>See which opportunities we're pursuing for you</li>
                        <li>View and complete assigned tasks</li>
                        <li>Upload documents (capability statements, past performance, etc.)</li>
                        <li>Track competitor activity</li>
                        <li>See our progress in real-time</li>
                    </ul>
                </div>

                <div style="text-align: center; margin: 32px 0;">
                    <a href="${APP_URL}/login" style="display: inline-block; background: #000; color: #fff; padding: 14px 32px; border-radius: 9999px; text-decoration: none; font-weight: 700; font-size: 14px;">
                        Log In to Your Portal →
                    </a>
                </div>

                <p style="color: #a1a1aa; font-size: 12px; text-align: center; margin-top: 40px;">
                    CapturePilot — Strategic Capture Intelligence Engine<br>
                    Questions? Reply to this email.
                </p>
            </div>`,
        });
        return true;
    } catch (e) {
        console.error("Failed to send consulting welcome email:", e);
        return false;
    }
}

// ─── Task Notification ─────────────────────────────────────────────
export async function sendTaskNotification(
    to: string,
    contactName: string,
    taskTitle: string,
    taskDescription: string,
    dueDate?: string,
) {
    try {
        const dueLine = dueDate ? `<p style="color: #dc2626; font-size: 14px; font-weight: 700; margin: 8px 0 0;">Due: ${new Date(dueDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>` : "";

        const r = getResend();
        if (!r) { console.warn("RESEND_API_KEY not set, skipping email"); return false; }
        await r.emails.send({
            from: FROM_EMAIL,
            to,
            subject: `Action Required: ${taskTitle}`,
            html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
                <div style="text-align: center; margin-bottom: 32px;">
                    <h1 style="font-size: 24px; font-weight: 800; color: #000; margin: 0;">⚡ CapturePilot</h1>
                </div>

                <h2 style="font-size: 18px; color: #000; margin-bottom: 8px;">Hi ${contactName},</h2>
                <p style="color: #3f3f46; font-size: 15px;">You have a new task that needs your attention:</p>

                <div style="background: #fefce8; border: 1px solid #fde68a; border-radius: 12px; padding: 20px; margin: 20px 0;">
                    <p style="font-size: 16px; font-weight: 700; color: #000; margin: 0;">${taskTitle}</p>
                    <p style="color: #3f3f46; font-size: 14px; margin: 8px 0 0; line-height: 1.5;">${taskDescription}</p>
                    ${dueLine}
                </div>

                <div style="text-align: center; margin: 32px 0;">
                    <a href="${APP_URL}/portal/tasks" style="display: inline-block; background: #000; color: #fff; padding: 12px 28px; border-radius: 9999px; text-decoration: none; font-weight: 700; font-size: 14px;">
                        View Task →
                    </a>
                </div>

                <p style="color: #a1a1aa; font-size: 12px; text-align: center;">CapturePilot — Strategic Capture Intelligence</p>
            </div>`,
        });
        return true;
    } catch (e) {
        console.error("Failed to send task notification:", e);
        return false;
    }
}

// ─── Opportunity Alert ─────────────────────────────────────────────
export async function sendOpportunityAlert(
    to: string,
    contactName: string,
    opportunities: { title: string; agency: string; score: number; deadline?: string }[],
) {
    const oppRows = opportunities.map(o => `
        <tr>
            <td style="padding: 8px 12px; border-bottom: 1px solid #f4f4f5;">
                <p style="font-size: 14px; font-weight: 600; color: #000; margin: 0;">${o.title}</p>
                <p style="font-size: 12px; color: #71717a; margin: 2px 0 0;">${o.agency}</p>
            </td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #f4f4f5; text-align: center;">
                <span style="display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 12px; font-weight: 700; ${o.score >= 70 ? "background:#dcfce7;color:#166534;" : o.score >= 50 ? "background:#fef9c3;color:#854d0e;" : "background:#dbeafe;color:#1e40af;"}">${o.score}%</span>
            </td>
        </tr>`).join("");

    try {
        const r = getResend();
        if (!r) { console.warn("RESEND_API_KEY not set, skipping email"); return false; }
        await r.emails.send({
            from: FROM_EMAIL,
            to,
            subject: `${opportunities.length} New Matching Opportunities Found`,
            html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
                <div style="text-align: center; margin-bottom: 32px;">
                    <h1 style="font-size: 24px; font-weight: 800; color: #000; margin: 0;">⚡ CapturePilot</h1>
                </div>

                <h2 style="font-size: 18px; color: #000; margin-bottom: 16px;">Hi ${contactName}, we found ${opportunities.length} new opportunities for you:</h2>

                <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                    <thead><tr>
                        <th style="text-align: left; padding: 8px 12px; font-size: 11px; color: #71717a; text-transform: uppercase; border-bottom: 2px solid #e4e4e7;">Opportunity</th>
                        <th style="text-align: center; padding: 8px 12px; font-size: 11px; color: #71717a; text-transform: uppercase; border-bottom: 2px solid #e4e4e7;">Match</th>
                    </tr></thead>
                    <tbody>${oppRows}</tbody>
                </table>

                <div style="text-align: center; margin: 32px 0;">
                    <a href="${APP_URL}/portal/opportunities" style="display: inline-block; background: #000; color: #fff; padding: 12px 28px; border-radius: 9999px; text-decoration: none; font-weight: 700; font-size: 14px;">
                        View All Opportunities →
                    </a>
                </div>

                <p style="color: #a1a1aa; font-size: 12px; text-align: center;">CapturePilot — Strategic Capture Intelligence</p>
            </div>`,
        });
        return true;
    } catch (e) {
        console.error("Failed to send opportunity alert:", e);
        return false;
    }
}
