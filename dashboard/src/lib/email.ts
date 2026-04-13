/**
 * Email service using Resend.
 * All emails use the shared branded template from email-template.ts.
 */
import { Resend } from "resend";
import {
    emailTemplate,
    contentCard,
    featureBox,
    alertBox,
    urgentBox,
    paragraph,
    sectionLabel,
    scoreBadge,
    APP_URL,
    COLORS,
} from "./email-template";

let _resend: Resend | null = null;
function getResend(): Resend | null {
    if (!process.env.RESEND_API_KEY) return null;
    if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
    return _resend;
}

const FROM_EMAIL = process.env.FROM_EMAIL || "CapturePilot <noreply@capturepilot.com>";

// ─── Welcome Email (Self-Service) ─────────────────────────────────────
export async function sendWelcomeEmail(to: string, companyName: string) {
    try {
        const r = getResend();
        if (!r) { console.warn("RESEND_API_KEY not set, skipping email"); return false; }

        const html = emailTemplate({
            preheader: `We're already scanning 30,000+ federal opportunities for ${companyName}.`,
            heading: `Welcome aboard, ${companyName}!`,
            body: `
                ${paragraph("Your account is set up and we're already matching you with federal contracting opportunities.")}
                ${contentCard(`
                    ${sectionLabel("What happens next")}
                    <ul style="color:${COLORS.stone700};font-size:14px;line-height:1.8;padding-left:20px;margin:0;">
                        <li>We're scanning 30,000+ federal opportunities for your matches</li>
                        <li>Your dashboard will show HOT, WARM, and COLD leads</li>
                        <li>You'll receive alerts when new high-scoring opportunities appear</li>
                    </ul>
                `)}
            `,
            cta: { label: "Go to Dashboard", url: `${APP_URL}/dashboard` },
        });

        await r.emails.send({ from: FROM_EMAIL, to, subject: `Welcome to CapturePilot, ${companyName}!`, html });
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

        const loginInfo = `
            ${sectionLabel("Your Login")}
            <p style="color:${COLORS.stone700};font-size:14px;margin:4px 0;"><strong>Email:</strong> ${to}</p>
            ${tempPassword ? `<p style="color:${COLORS.stone700};font-size:14px;margin:4px 0;"><strong>Temporary Password:</strong> ${tempPassword}</p>` : ""}
            <p style="color:${COLORS.stone700};font-size:14px;margin:8px 0 0;">You can also sign in with your Google account.</p>
        `;

        const html = emailTemplate({
            preheader: `Your CapturePilot consulting portal for ${companyName} is ready.`,
            heading: `Hi ${contactName},`,
            body: `
                ${paragraph(`Your CapturePilot consulting portal for <strong>${companyName}</strong> is ready. Our team is actively working on your government contracting pipeline.`)}
                ${contentCard(loginInfo)}
                ${featureBox(`
                    ${sectionLabel("What you can do in your portal")}
                    <ul style="color:#065f46;font-size:14px;line-height:1.8;padding-left:20px;margin:0;">
                        <li>See which opportunities we're pursuing for you</li>
                        <li>View and complete assigned tasks</li>
                        <li>Upload documents (capability statements, past performance, etc.)</li>
                        <li>Track competitor activity</li>
                        <li>See our progress in real-time</li>
                    </ul>
                `)}
            `,
            cta: { label: "Log In to Your Portal", url: `${APP_URL}/login` },
            footerNote: "Questions? Reply to this email.",
        });

        await r.emails.send({ from: FROM_EMAIL, to, subject: `Your CapturePilot Portal is Ready — ${companyName}`, html });
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
        const r = getResend();
        if (!r) { console.warn("RESEND_API_KEY not set, skipping email"); return false; }

        const dueLine = dueDate
            ? `<p style="color:#dc2626;font-size:14px;font-weight:700;margin:8px 0 0;">Due: ${new Date(dueDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>`
            : "";

        const html = emailTemplate({
            preheader: `Action required: ${taskTitle}`,
            heading: `Hi ${contactName},`,
            body: `
                ${paragraph("You have a new task that needs your attention:")}
                ${alertBox(`
                    <p style="font-size:16px;font-weight:700;color:${COLORS.black};margin:0;">${taskTitle}</p>
                    <p style="color:${COLORS.stone700};font-size:14px;margin:8px 0 0;line-height:1.5;">${taskDescription}</p>
                    ${dueLine}
                `)}
            `,
            cta: { label: "View Task", url: `${APP_URL}/portal/tasks` },
            transactional: true,
        });

        await r.emails.send({ from: FROM_EMAIL, to, subject: `Action Required: ${taskTitle}`, html });
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
    try {
        const r = getResend();
        if (!r) { console.warn("RESEND_API_KEY not set, skipping email"); return false; }

        const oppRows = opportunities.map(o => `
            <tr>
                <td style="padding:10px 12px;border-bottom:1px solid ${COLORS.stone100};">
                    <p style="font-size:14px;font-weight:600;color:${COLORS.black};margin:0;">${o.title}</p>
                    <p style="font-size:12px;color:${COLORS.stone500};margin:2px 0 0;">${o.agency}</p>
                </td>
                <td style="padding:10px 12px;border-bottom:1px solid ${COLORS.stone100};text-align:center;white-space:nowrap;">
                    ${scoreBadge(o.score)}
                </td>
            </tr>`).join("");

        const html = emailTemplate({
            preheader: `${opportunities.length} new federal opportunities match your profile.`,
            heading: `${contactName}, we found ${opportunities.length} new opportunities for you`,
            body: `
                <table role="presentation" style="width:100%;border-collapse:collapse;margin:20px 0;">
                    <thead><tr>
                        <th style="text-align:left;padding:8px 12px;font-size:11px;color:${COLORS.stone500};text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid ${COLORS.stone200};">Opportunity</th>
                        <th style="text-align:center;padding:8px 12px;font-size:11px;color:${COLORS.stone500};text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid ${COLORS.stone200};">Match</th>
                    </tr></thead>
                    <tbody>${oppRows}</tbody>
                </table>
            `,
            cta: { label: "View All Opportunities", url: `${APP_URL}/dashboard/opportunities` },
        });

        await r.emails.send({ from: FROM_EMAIL, to, subject: `${opportunities.length} New Matching Opportunities Found`, html });
        return true;
    } catch (e) {
        console.error("Failed to send opportunity alert:", e);
        return false;
    }
}

// ─── Quick Checker Results Email ─────────────────────────────────────
export async function sendQuickCheckerResultsEmail(
    to: string,
    data: {
        companyName: string;
        analysisId: string;
        readinessScore: number;
        topMatches: { title: string; agency: string; score: number }[];
        totalMatches: number;
    },
) {
    try {
        const r = getResend();
        if (!r) { console.warn("RESEND_API_KEY not set, skipping email"); return false; }

        const { companyName, analysisId, readinessScore, topMatches, totalMatches } = data;

        // Readiness gauge color
        const readinessColor = readinessScore >= 70 ? "#059669" : readinessScore >= 40 ? "#d97706" : "#dc2626";
        const readinessLabel = readinessScore >= 70 ? "Strong" : readinessScore >= 40 ? "Moderate" : "Early Stage";

        const matchRows = topMatches.slice(0, 3).map(m => `
            <tr>
                <td style="padding:10px 12px;border-bottom:1px solid ${COLORS.stone100};">
                    <p style="font-size:14px;font-weight:600;color:${COLORS.black};margin:0;">${m.title}</p>
                    <p style="font-size:12px;color:${COLORS.stone500};margin:2px 0 0;">${m.agency}</p>
                </td>
                <td style="padding:10px 12px;border-bottom:1px solid ${COLORS.stone100};text-align:center;white-space:nowrap;">
                    ${scoreBadge(m.score)}
                </td>
            </tr>`).join("");

        const remainingCount = totalMatches - 3;

        const html = emailTemplate({
            preheader: `${companyName} scored ${readinessScore}/100 for federal readiness. ${totalMatches} opportunities matched.`,
            heading: `Your Federal Readiness Report`,
            body: `
                ${paragraph(`Here are the Quick Checker results for <strong>${companyName}</strong>.`)}

                <div style="text-align:center;margin:24px 0;">
                    <div style="display:inline-block;width:100px;height:100px;border-radius:50%;border:6px solid ${readinessColor};position:relative;line-height:88px;text-align:center;">
                        <span style="font-size:32px;font-weight:800;color:${readinessColor};">${readinessScore}</span>
                    </div>
                    <p style="font-size:14px;font-weight:700;color:${readinessColor};margin:8px 0 0;">${readinessLabel} Readiness</p>
                    <p style="font-size:12px;color:${COLORS.stone500};margin:4px 0 0;">out of 100</p>
                </div>

                ${topMatches.length > 0 ? `
                    ${sectionLabel("Your Top Matching Opportunities")}
                    <table role="presentation" style="width:100%;border-collapse:collapse;margin:12px 0 20px;">
                        <tbody>${matchRows}</tbody>
                    </table>
                    ${remainingCount > 0 ? `<p style="font-size:13px;color:${COLORS.stone500};text-align:center;margin:0 0 8px;">+ ${remainingCount} more matching opportunities</p>` : ""}
                ` : paragraph("We're still analyzing opportunities for your profile. Check back soon.")}
            `,
            cta: { label: "Create Free Account to See All Results", url: `${APP_URL}/signup?ref=quickcheck&aid=${analysisId}` },
            secondaryCta: { label: "View full report", url: `${APP_URL}/check/${analysisId}` },
        });

        await r.emails.send({
            from: FROM_EMAIL,
            to,
            subject: `${companyName} — Federal Readiness Score: ${readinessScore}/100`,
            html,
        });
        return true;
    } catch (e) {
        console.error("Failed to send quick checker results email:", e);
        return false;
    }
}

// ─── Trial Expiring Warning ────────────────────────────────────────
export async function sendTrialExpiringEmail(
    to: string,
    contactName: string,
    daysLeft: number,
) {
    try {
        const r = getResend();
        if (!r) { console.warn("RESEND_API_KEY not set, skipping email"); return false; }

        const urgency = daysLeft <= 1 ? "today" : `in ${daysLeft} days`;

        const html = emailTemplate({
            preheader: `Your CapturePilot trial expires ${urgency}. Subscribe to keep your matches.`,
            heading: `Your trial expires ${urgency}`,
            body: `
                ${paragraph(`Hi ${contactName},`)}
                ${daysLeft <= 1
                    ? paragraph("This is your last day of CapturePilot access. After today, you'll lose access to your matched opportunities and alerts.")
                    : paragraph(`Your free trial of CapturePilot expires ${urgency}. Subscribe now to keep access to your matched federal opportunities and daily alerts.`)
                }
                ${contentCard(`
                    ${sectionLabel("What you'll keep with a subscription")}
                    <ul style="color:${COLORS.stone700};font-size:14px;line-height:1.8;padding-left:20px;margin:0;">
                        <li>Daily opportunity matching across 30,000+ federal contracts</li>
                        <li>HOT/WARM/COLD scoring with competitive intelligence</li>
                        <li>Email alerts for high-scoring matches</li>
                        <li>Full readiness dashboard and pipeline tracking</li>
                    </ul>
                `)}
            `,
            cta: { label: "Subscribe Now", url: `${APP_URL}/settings/billing` },
            transactional: true,
        });

        await r.emails.send({
            from: FROM_EMAIL,
            to,
            subject: daysLeft <= 1
                ? "Your CapturePilot trial expires today"
                : `Your CapturePilot trial expires in ${daysLeft} days`,
            html,
        });
        return true;
    } catch (e) {
        console.error("Failed to send trial expiring email:", e);
        return false;
    }
}

// ─── Payment Failed ─────────────────────────────────────────────────
export async function sendPaymentFailedEmail(to: string, contactName: string) {
    try {
        const r = getResend();
        if (!r) { console.warn("RESEND_API_KEY not set, skipping email"); return false; }

        const html = emailTemplate({
            preheader: "We couldn't process your payment. Update your card to keep access.",
            heading: "We couldn't process your payment",
            body: `
                ${paragraph(`Hi ${contactName},`)}
                ${paragraph("Your most recent payment for CapturePilot failed. This can happen when a card expires or a bank declines the charge.")}
                ${urgentBox(`
                    <p style="font-size:14px;font-weight:700;color:#991b1b;margin:0 0 4px;">Action needed</p>
                    <p style="font-size:14px;color:#991b1b;margin:0;line-height:1.5;">Please update your payment method to avoid losing access to your matched opportunities and alerts.</p>
                `)}
            `,
            cta: { label: "Update Payment Method", url: `${APP_URL}/settings/billing` },
            transactional: true,
        });

        await r.emails.send({
            from: FROM_EMAIL,
            to,
            subject: "Payment failed — update your card to keep CapturePilot access",
            html,
        });
        return true;
    } catch (e) {
        console.error("Failed to send payment failed email:", e);
        return false;
    }
}

// ─── Subscription Canceled ──────────────────────────────────────────
export async function sendSubscriptionCanceledEmail(to: string, contactName: string) {
    try {
        const r = getResend();
        if (!r) { console.warn("RESEND_API_KEY not set, skipping email"); return false; }

        const html = emailTemplate({
            preheader: "Your CapturePilot subscription has been canceled.",
            heading: "Your subscription has been canceled",
            body: `
                ${paragraph(`Hi ${contactName},`)}
                ${paragraph("Your CapturePilot subscription has been canceled. You'll retain access through the end of your current billing period.")}
                ${paragraph("We'll keep your profile and match history on file. If you decide to come back, everything will be right where you left it.")}
                ${contentCard(`
                    <p style="font-size:14px;color:${COLORS.stone700};margin:0;line-height:1.5;">Changed your mind? You can resubscribe at any time from your billing settings.</p>
                `)}
            `,
            cta: { label: "Resubscribe", url: `${APP_URL}/settings/billing` },
            transactional: true,
        });

        await r.emails.send({
            from: FROM_EMAIL,
            to,
            subject: "Your CapturePilot subscription has been canceled",
            html,
        });
        return true;
    } catch (e) {
        console.error("Failed to send subscription canceled email:", e);
        return false;
    }
}

// ─── Beta Deadline Reminder ─────────────────────────────────────────
export async function sendBetaDeadlineEmail(
    to: string,
    contactName: string,
    daysUntilCutoff: number,
) {
    try {
        const r = getResend();
        if (!r) { console.warn("RESEND_API_KEY not set, skipping email"); return false; }

        const urgencyText = daysUntilCutoff <= 1
            ? "Tomorrow is the last day"
            : daysUntilCutoff <= 4
                ? `Only ${daysUntilCutoff} days left`
                : `${daysUntilCutoff} days left`;

        const html = emailTemplate({
            preheader: `${urgencyText} to lock in 25% off CapturePilot forever. Use code BETA25 before May 9.`,
            heading: `${urgencyText} to lock in your beta discount`,
            body: `
                ${paragraph(`Hi ${contactName},`)}
                ${paragraph("On <strong>May 9</strong>, CapturePilot exits beta and free access ends. Subscribe before the cutoff and you'll lock in <strong>25% off forever</strong>.")}
                ${featureBox(`
                    <p style="font-size:18px;font-weight:800;color:#065f46;margin:0 0 4px;text-align:center;">BETA25</p>
                    <p style="font-size:13px;color:#065f46;margin:0;text-align:center;">Use this code at checkout for 25% off — locked in for as long as you're subscribed.</p>
                `)}
                ${contentCard(`
                    ${sectionLabel("What you get")}
                    <ul style="color:${COLORS.stone700};font-size:14px;line-height:1.8;padding-left:20px;margin:0;">
                        <li>Daily matching across 30,000+ federal opportunities</li>
                        <li>Competitive intelligence and readiness scoring</li>
                        <li>Email alerts for high-scoring matches</li>
                        <li>25% off for the lifetime of your subscription</li>
                    </ul>
                `)}
                ${daysUntilCutoff <= 4 ? urgentBox(`<p style="font-size:14px;font-weight:700;color:#991b1b;margin:0;">After May 9, free access ends and the BETA25 discount expires permanently.</p>`) : ""}
            `,
            cta: { label: "Subscribe Now with BETA25", url: `${APP_URL}/settings/billing?promo=BETA25` },
        });

        const subject = daysUntilCutoff <= 1
            ? "Last chance: 25% off CapturePilot ends tomorrow"
            : daysUntilCutoff <= 4
                ? `${daysUntilCutoff} days left to lock in 25% off CapturePilot`
                : "Lock in 25% off CapturePilot before beta ends May 9";

        await r.emails.send({ from: FROM_EMAIL, to, subject, html });
        return true;
    } catch (e) {
        console.error("Failed to send beta deadline email:", e);
        return false;
    }
}
