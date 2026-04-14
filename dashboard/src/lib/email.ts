/**
 * Email service using Resend.
 * All emails use the shared branded template and respect email-settings toggles.
 */
import { Resend } from "resend";
import {
    emailTemplate,
    contentCard,
    featureBox,
    alertBox,
    urgentBox,
    infoBox,
    paragraph,
    sectionLabel,
    scoreBadge,
    numberedSection,
    articleCta,
    APP_URL,
    SITE_URL,
    COLORS,
} from "./email-template";
import { isEmailEnabled, getEmailCategory } from "./email-settings";

let _resend: Resend | null = null;
function getResend(): Resend | null {
    if (!process.env.RESEND_API_KEY) return null;
    if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
    return _resend;
}

const FROM_EMAIL = process.env.FROM_EMAIL || "CapturePilot <noreply@capturepilot.com>";

/** Shared send wrapper — checks DB-backed settings toggle, logs, catches errors */
async function send(key: string, to: string, subject: string, html: string): Promise<boolean> {
    if (!(await isEmailEnabled(key))) {
        console.log(`[email] ${key} is disabled in settings, skipping send to ${to}`);
        return false;
    }
    try {
        const r = getResend();
        if (!r) { console.warn("RESEND_API_KEY not set, skipping email"); return false; }
        await r.emails.send({ from: FROM_EMAIL, to, subject, html });
        return true;
    } catch (e) {
        console.error(`Failed to send ${key} email:`, e);
        return false;
    }
}

// ─── Welcome (Self-Service) ─────────────────────────────────
export async function sendWelcomeEmail(to: string, companyName: string) {
    const html = emailTemplate({
        category: await getEmailCategory("welcome"),
        preheader: `We're already scanning 30,000+ federal opportunities for ${companyName}.`,
        eyebrow: "Welcome Aboard",
        heading: `Welcome to CapturePilot, ${companyName}`,
        body: `
            ${paragraph("Your account is set up and we're already matching you with federal contracting opportunities.")}
            ${contentCard(`
                ${sectionLabel("What happens next")}
                <ul style="color:${COLORS.stone700};font-size:14px;line-height:1.9;padding-left:20px;margin:0;">
                    <li>We're scanning 30,000+ federal opportunities for your matches</li>
                    <li>Your dashboard will show HOT, WARM, and COLD leads</li>
                    <li>You'll receive alerts when new high-scoring opportunities appear</li>
                </ul>
            `)}
        `,
        cta: { label: "Go to Dashboard", url: `${APP_URL}/dashboard` },
    });
    return send("welcome", to, `Welcome to CapturePilot, ${companyName}`, html);
}

// ─── Welcome (Consulting) ─────────────────────────────────
export async function sendConsultingWelcomeEmail(
    to: string,
    companyName: string,
    contactName: string,
    tempPassword?: string,
) {
    const loginInfo = `
        ${sectionLabel("Your Login")}
        <p style="color:${COLORS.stone700};font-size:14px;margin:4px 0;"><strong>Email:</strong> ${to}</p>
        ${tempPassword ? `<p style="color:${COLORS.stone700};font-size:14px;margin:4px 0;"><strong>Temporary Password:</strong> <code style="background:${COLORS.stone100};padding:2px 6px;border-radius:4px;font-family:monospace;">${tempPassword}</code></p>` : ""}
        <p style="color:${COLORS.stone500};font-size:13px;margin:10px 0 0;">You can also sign in with Google.</p>
    `;
    const html = emailTemplate({
        category: await getEmailCategory("consulting_welcome"),
        preheader: `Your CapturePilot consulting portal for ${companyName} is ready.`,
        eyebrow: "Your Portal Is Ready",
        heading: `Hi ${contactName},`,
        body: `
            ${paragraph(`Your CapturePilot consulting portal for <strong>${companyName}</strong> is ready. Our team is actively working on your government contracting pipeline.`)}
            ${contentCard(loginInfo)}
            ${featureBox(`
                ${sectionLabel("What you can do in your portal")}
                <ul style="color:#065f46;font-size:14px;line-height:1.9;padding-left:20px;margin:0;">
                    <li>See which opportunities we're pursuing for you</li>
                    <li>View and complete assigned tasks</li>
                    <li>Upload capability statements and past performance</li>
                    <li>Track competitor activity</li>
                    <li>See our progress in real-time</li>
                </ul>
            `)}
        `,
        cta: { label: "Log In to Your Portal", url: `${APP_URL}/login` },
        footerNote: "Questions? Just reply to this email — our team will get back to you.",
    });
    return send("consulting_welcome", to, `Your CapturePilot Portal is Ready — ${companyName}`, html);
}

// ─── Task Notification ─────────────────────────────────────
export async function sendTaskNotification(
    to: string,
    contactName: string,
    taskTitle: string,
    taskDescription: string,
    dueDate?: string,
) {
    const dueLine = dueDate
        ? `<p style="color:#dc2626;font-size:14px;font-weight:700;margin:10px 0 0;">Due: ${new Date(dueDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>`
        : "";
    const html = emailTemplate({
        category: await getEmailCategory("task_notification"),
        preheader: `Action required: ${taskTitle}`,
        eyebrow: "Task Assigned",
        heading: `Hi ${contactName},`,
        body: `
            ${paragraph("You have a new task that needs your attention:")}
            ${alertBox(`
                <p style="font-size:16px;font-weight:700;color:${COLORS.black};margin:0;">${taskTitle}</p>
                <p style="color:${COLORS.stone700};font-size:14px;margin:8px 0 0;line-height:1.6;">${taskDescription}</p>
                ${dueLine}
            `)}
        `,
        cta: { label: "View Task", url: `${APP_URL}/portal/tasks` },
    });
    return send("task_notification", to, `Action Required: ${taskTitle}`, html);
}

// ─── Opportunity Alert ─────────────────────────────────────
export async function sendOpportunityAlert(
    to: string,
    contactName: string,
    opportunities: { title: string; agency: string; score: number; deadline?: string }[],
) {
    const oppRows = opportunities.map(o => `
        <tr>
            <td style="padding:12px;border-bottom:1px solid ${COLORS.stone100};">
                <p style="font-size:14px;font-weight:700;color:${COLORS.black};margin:0;">${o.title}</p>
                <p style="font-size:12px;color:${COLORS.stone500};margin:3px 0 0;">${o.agency}</p>
            </td>
            <td style="padding:12px;border-bottom:1px solid ${COLORS.stone100};text-align:right;white-space:nowrap;">
                ${scoreBadge(o.score)}
            </td>
        </tr>`).join("");

    const html = emailTemplate({
        category: await getEmailCategory("opportunity_alert"),
        preheader: `${opportunities.length} new federal opportunities match your profile.`,
        eyebrow: "Daily Matches",
        heading: `${contactName}, ${opportunities.length} new opportunities`,
        body: `
            ${paragraph("Here are your top matches for today, ranked by fit score.")}
            <table role="presentation" style="width:100%;border-collapse:collapse;margin:16px 0 8px;background:${COLORS.white};border:1px solid ${COLORS.stone200};border-radius:12px;overflow:hidden;">
                <tbody>${oppRows}</tbody>
            </table>
        `,
        cta: { label: "View All Opportunities", url: `${APP_URL}/dashboard/opportunities` },
    });
    return send("opportunity_alert", to, `${opportunities.length} New Matching Opportunities`, html);
}

// ─── Quick Checker Results ─────────────────────────────────
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
    const { companyName, analysisId, readinessScore, topMatches, totalMatches } = data;
    const readinessColor = readinessScore >= 70 ? COLORS.emerald600 : readinessScore >= 40 ? "#d97706" : "#dc2626";
    const readinessLabel = readinessScore >= 70 ? "Strong" : readinessScore >= 40 ? "Moderate" : "Early Stage";

    const matchRows = topMatches.slice(0, 3).map(m => `
        <tr>
            <td style="padding:12px;border-bottom:1px solid ${COLORS.stone100};">
                <p style="font-size:14px;font-weight:700;color:${COLORS.black};margin:0;">${m.title}</p>
                <p style="font-size:12px;color:${COLORS.stone500};margin:3px 0 0;">${m.agency}</p>
            </td>
            <td style="padding:12px;border-bottom:1px solid ${COLORS.stone100};text-align:right;white-space:nowrap;">
                ${scoreBadge(m.score)}
            </td>
        </tr>`).join("");

    const remaining = totalMatches - 3;

    const html = emailTemplate({
        category: await getEmailCategory("quick_checker"),
        preheader: `${companyName} scored ${readinessScore}/100 for federal readiness. ${totalMatches} opportunities matched.`,
        eyebrow: "Federal Readiness Report",
        heading: "Your readiness score is in",
        body: `
            ${paragraph(`Here are the Quick Checker results for <strong>${companyName}</strong>.`)}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td align="center">
                <div style="display:inline-block;width:110px;height:110px;border-radius:50%;border:7px solid ${readinessColor};line-height:96px;text-align:center;background:${COLORS.white};">
                    <span style="font-size:36px;font-weight:800;color:${readinessColor};vertical-align:middle;">${readinessScore}</span>
                </div>
                <p style="font-size:14px;font-weight:700;color:${readinessColor};margin:10px 0 0;text-transform:uppercase;letter-spacing:1px;">${readinessLabel} Readiness</p>
                <p style="font-size:12px;color:${COLORS.stone500};margin:4px 0 0;">out of 100</p>
            </td></tr></table>
            ${topMatches.length > 0 ? `
                ${sectionLabel("Your top matching opportunities")}
                <table role="presentation" style="width:100%;border-collapse:collapse;margin:12px 0 12px;background:${COLORS.white};border:1px solid ${COLORS.stone200};border-radius:12px;overflow:hidden;">
                    <tbody>${matchRows}</tbody>
                </table>
                ${remaining > 0 ? `<p style="font-size:13px;color:${COLORS.stone500};text-align:center;margin:8px 0 0;">&plus; ${remaining} more matching opportunities</p>` : ""}
            ` : paragraph("We're still analyzing opportunities for your profile. Check back soon.")}
        `,
        cta: { label: "Create Free Account to See All Results", url: `${APP_URL}/signup?ref=quickcheck&aid=${analysisId}` },
        secondaryCta: { label: "View full report", url: `${SITE_URL}/check/${analysisId}` },
    });

    return send("quick_checker", to, `${companyName} — Federal Readiness Score: ${readinessScore}/100`, html);
}

// ─── Trial Expiring ─────────────────────────────────────────
export async function sendTrialExpiringEmail(to: string, contactName: string, daysLeft: number) {
    const urgency = daysLeft <= 1 ? "today" : `in ${daysLeft} days`;
    const key = daysLeft <= 1 ? "trial_expiring_1d" : "trial_expiring_3d";

    const html = emailTemplate({
        category: await getEmailCategory(key),
        preheader: `Your CapturePilot trial expires ${urgency}. Subscribe to keep your matches.`,
        eyebrow: daysLeft <= 1 ? "Final Day" : "Trial Ending Soon",
        heading: `Your trial expires ${urgency}`,
        body: `
            ${paragraph(`Hi ${contactName},`)}
            ${daysLeft <= 1
                ? paragraph("This is your last day of CapturePilot access. After today, you'll lose access to your matched opportunities and alerts.")
                : paragraph(`Your free trial of CapturePilot expires ${urgency}. Subscribe now to keep access to your matched federal opportunities and daily alerts.`)
            }
            ${contentCard(`
                ${sectionLabel("What you'll keep with a subscription")}
                <ul style="color:${COLORS.stone700};font-size:14px;line-height:1.9;padding-left:20px;margin:0;">
                    <li>Daily opportunity matching across 30,000+ federal contracts</li>
                    <li>HOT/WARM/COLD scoring with competitive intelligence</li>
                    <li>Email alerts for high-scoring matches</li>
                    <li>Full readiness dashboard and pipeline tracking</li>
                </ul>
            `)}
        `,
        cta: { label: "Subscribe Now", url: `${APP_URL}/settings/billing` },
    });

    const subject = daysLeft <= 1
        ? "Your CapturePilot trial expires today"
        : `Your CapturePilot trial expires in ${daysLeft} days`;
    return send(key, to, subject, html);
}

// ─── Payment Failed ─────────────────────────────────────────
export async function sendPaymentFailedEmail(to: string, contactName: string) {
    const html = emailTemplate({
        category: await getEmailCategory("payment_failed"),
        preheader: "We couldn't process your payment. Update your card to keep access.",
        eyebrow: "Payment Issue",
        heading: "We couldn't process your payment",
        body: `
            ${paragraph(`Hi ${contactName},`)}
            ${paragraph("Your most recent payment for CapturePilot failed. This can happen when a card expires or a bank declines the charge.")}
            ${urgentBox(`
                <p style="font-size:14px;font-weight:700;color:#991b1b;margin:0 0 6px;">Action needed</p>
                <p style="font-size:14px;color:#991b1b;margin:0;line-height:1.6;">Please update your payment method to avoid losing access to your matched opportunities and alerts.</p>
            `)}
        `,
        cta: { label: "Update Payment Method", url: `${APP_URL}/settings/billing` },
    });
    return send("payment_failed", to, "Payment failed — update your card to keep CapturePilot access", html);
}

// ─── Subscription Canceled ──────────────────────────────────
export async function sendSubscriptionCanceledEmail(to: string, contactName: string) {
    const html = emailTemplate({
        category: await getEmailCategory("subscription_canceled"),
        preheader: "Your CapturePilot subscription has been canceled.",
        eyebrow: "Subscription Update",
        heading: "Your subscription has been canceled",
        body: `
            ${paragraph(`Hi ${contactName},`)}
            ${paragraph("Your CapturePilot subscription has been canceled. You'll retain access through the end of your current billing period.")}
            ${paragraph("We'll keep your profile and match history on file. If you decide to come back, everything will be right where you left it.")}
            ${contentCard(`
                <p style="font-size:14px;color:${COLORS.stone700};margin:0;line-height:1.6;">Changed your mind? You can resubscribe at any time from your billing settings.</p>
            `)}
        `,
        cta: { label: "Resubscribe", url: `${APP_URL}/settings/billing` },
    });
    return send("subscription_canceled", to, "Your CapturePilot subscription has been canceled", html);
}

// ─── Beta Deadline Reminder ─────────────────────────────────
export async function sendBetaDeadlineEmail(to: string, contactName: string, daysUntilCutoff: number) {
    const urgencyText = daysUntilCutoff <= 1
        ? "Tomorrow is the last day"
        : daysUntilCutoff <= 4
            ? `Only ${daysUntilCutoff} days left`
            : `${daysUntilCutoff} days left`;
    const key = daysUntilCutoff <= 1 ? "beta_deadline_1d" : "beta_deadline_8d";

    const html = emailTemplate({
        category: await getEmailCategory(key),
        preheader: `${urgencyText} to lock in 25% off CapturePilot forever. Use code BETA25 before May 9.`,
        eyebrow: "Beta Ending May 9",
        heading: `${urgencyText} to lock in your beta discount`,
        body: `
            ${paragraph(`Hi ${contactName},`)}
            ${paragraph("On <strong>May 9</strong>, CapturePilot exits beta and free access ends. Subscribe before the cutoff and you'll lock in <strong>25% off forever</strong>.")}
            ${featureBox(`
                <p style="font-size:24px;font-weight:800;color:#065f46;margin:0 0 6px;text-align:center;letter-spacing:2px;font-family:monospace;">BETA25</p>
                <p style="font-size:13px;color:#065f46;margin:0;text-align:center;line-height:1.5;">25% off at checkout — locked in for as long as you're subscribed.</p>
            `)}
            ${contentCard(`
                ${sectionLabel("What you get")}
                <ul style="color:${COLORS.stone700};font-size:14px;line-height:1.9;padding-left:20px;margin:0;">
                    <li>Daily matching across 30,000+ federal opportunities</li>
                    <li>Competitive intelligence and readiness scoring</li>
                    <li>Email alerts for high-scoring matches</li>
                    <li>25% off for the lifetime of your subscription</li>
                </ul>
            `)}
            ${daysUntilCutoff <= 4 ? urgentBox(`<p style="font-size:14px;font-weight:700;color:#991b1b;margin:0;">After May 9, free access ends and the BETA25 discount expires permanently.</p>`) : ""}
        `,
        cta: { label: "Subscribe with BETA25", url: `${APP_URL}/settings/billing?promo=BETA25` },
    });

    const subject = daysUntilCutoff <= 1
        ? "Last chance: 25% off CapturePilot ends tomorrow"
        : daysUntilCutoff <= 4
            ? `${daysUntilCutoff} days left to lock in 25% off CapturePilot`
            : "Lock in 25% off CapturePilot before beta ends May 9";
    return send(key, to, subject, html);
}

// ─── Educational: Federal Contracting 101 ──────────────────
export async function sendEduContracting101Email(to: string, contactName: string) {
    const html = emailTemplate({
        category: await getEmailCategory("edu_contracting_101"),
        preheader: "The complete beginner's guide to federal government contracting.",
        eyebrow: "Learning Series",
        heading: "Federal Contracting 101",
        body: `
            ${paragraph(`Hi ${contactName},`)}
            ${paragraph("The federal government spends over $700 billion per year on contracts — and a growing share goes to small businesses. Here's what every new contractor needs to know to compete.")}
            ${numberedSection(1, "Understand NAICS codes", "Every federal opportunity is tagged with a NAICS code that identifies the industry. Picking the right codes is step one — they determine which contracts you can bid on.")}
            ${numberedSection(2, "Register on SAM.gov", "SAM.gov is the front door for federal contracting. Registration is free, takes 2-3 weeks, and you can't bid without it.")}
            ${numberedSection(3, "Identify your set-aside advantages", "Veteran-owned, women-owned, 8(a), HUBZone — set-aside programs reserve contracts for qualifying small businesses. Most contractors qualify for at least one.")}
            ${numberedSection(4, "Start with Sources Sought", "Sources Sought notices are 6-18 months ahead of the actual solicitation. Responding lets you influence the RFP and build agency relationships before competition heats up.")}
            ${articleCta("Government Contracting 101: The Complete Beginner's Guide", `${SITE_URL}/blog/government-contracting-101`, "15 min read")}
        `,
        cta: { label: "Read the Full Guide", url: `${SITE_URL}/blog/government-contracting-101` },
    });
    return send("edu_contracting_101", to, "Federal Contracting 101 — your quick-start guide", html);
}

// ─── Educational: NAICS Codes Explained ────────────────────
export async function sendEduNaicsCodesEmail(to: string, contactName: string) {
    const html = emailTemplate({
        category: await getEmailCategory("edu_naics_codes"),
        preheader: "NAICS codes determine which federal contracts you qualify for. Here's how to pick the right ones.",
        eyebrow: "Learning Series",
        heading: "NAICS codes, decoded",
        body: `
            ${paragraph(`Hi ${contactName},`)}
            ${paragraph("NAICS codes are the six-digit industry codes that federal agencies use to classify every contract opportunity. If your company's NAICS doesn't match, you can't bid — full stop.")}
            ${infoBox(`
                ${sectionLabel("Quick fact")}
                <p style="color:${COLORS.stone700};font-size:14px;margin:0;line-height:1.6;">Most contractors qualify for <strong>3-8 NAICS codes</strong>. Listing more codes means more matched opportunities, but each code has its own small business size standard — some based on revenue, some on headcount.</p>
            `)}
            ${numberedSection(1, "Start with your primary work", "What do you actually do most days? Your primary NAICS should be the one where you generate the most revenue.")}
            ${numberedSection(2, "Add adjacent codes", "Many contractors add related codes to capture broader opportunities. A janitorial company might add landscaping and facility support services.")}
            ${numberedSection(3, "Check size standards", "Each NAICS has a small business threshold. Exceeding it in one code doesn't disqualify you from the others — but it matters for set-asides.")}
            ${articleCta("NAICS Codes Explained: Find the Right Codes for Your Business", `${SITE_URL}/blog/naics-codes-explained`, "10 min read")}
        `,
        cta: { label: "Read the Full Guide", url: `${SITE_URL}/blog/naics-codes-explained` },
    });
    return send("edu_naics_codes", to, "NAICS codes, decoded — the contractor's cheat sheet", html);
}

// ─── Educational: Set-Aside Programs ───────────────────────
export async function sendEduSetAsidesEmail(to: string, contactName: string) {
    const html = emailTemplate({
        category: await getEmailCategory("edu_set_asides"),
        preheader: "Set-aside contracts reserve federal work for qualifying small businesses. Here's your unfair advantage.",
        eyebrow: "Learning Series",
        heading: "Set-aside programs: your unfair advantage",
        body: `
            ${paragraph(`Hi ${contactName},`)}
            ${paragraph("Federal set-aside programs reserve specific contracts for small businesses that meet certain criteria — veteran-owned, woman-owned, located in a HUBZone, and more. Qualifying means you compete against a much smaller pool.")}
            ${numberedSection(1, "8(a) Business Development", "A 9-year program for socially and economically disadvantaged small businesses. Includes sole-source contracts up to $4.5M and 6 years of protected competition.")}
            ${numberedSection(2, "SDVOSB / VOSB", "Service-Disabled Veteran-Owned and Veteran-Owned Small Business. The VA especially prioritizes these — 10%+ of VA contracts go to SDVOSBs.")}
            ${numberedSection(3, "WOSB / EDWOSB", "Women-Owned Small Business and Economically Disadvantaged WOSB. 5% of federal contract dollars are targeted to WOSBs.")}
            ${numberedSection(4, "HUBZone", "Historically Underutilized Business Zone. Location-based — your office must be in a HUBZone and 35%+ of employees must live there. 3% goal with 10% price preference on most bids.")}
            ${featureBox(`
                <p style="color:#065f46;font-size:14px;margin:0;line-height:1.6;"><strong>Most contractors qualify for at least one set-aside program.</strong> If you haven't checked, it's worth an afternoon — certification often takes weeks, not months.</p>
            `)}
            ${articleCta("Government Set-Aside Programs: Your Unfair Advantage", `${SITE_URL}/blog/set-aside-programs`, "12 min read")}
        `,
        cta: { label: "Read the Full Guide", url: `${SITE_URL}/blog/set-aside-programs` },
    });
    return send("edu_set_asides", to, "Set-asides: the small business advantage in federal contracting", html);
}

// ─── Educational: Capability Statement ─────────────────────
export async function sendEduCapabilityStatementEmail(to: string, contactName: string) {
    const html = emailTemplate({
        category: await getEmailCategory("edu_capability_statement"),
        preheader: "Your capability statement is your federal business card. Here's how to write one that wins.",
        eyebrow: "Learning Series",
        heading: "The capability statement that wins",
        body: `
            ${paragraph(`Hi ${contactName},`)}
            ${paragraph("A capability statement is a one-page document every federal contracting officer expects to see before awarding work. Done well, it's your ticket into conversations. Done poorly, it ends them.")}
            ${numberedSection(1, "Core Competencies", "3-5 bullet points on what you do best. Be specific — \"IT services\" is too broad. \"Cybersecurity assessments for DoD networks\" is specific.")}
            ${numberedSection(2, "Past Performance", "List 3-5 recent projects with agency, contract value, period of performance, and outcomes. Federal work counts most — but relevant commercial work counts too.")}
            ${numberedSection(3, "Differentiators", "Why pick you over the competition? Certifications, clearances, key personnel, proprietary methods, geographic coverage.")}
            ${numberedSection(4, "Company Data", "DUNS/UEI, CAGE code, NAICS codes, set-aside certifications, POC, and SAM.gov registration date. All the compliance essentials up front.")}
            ${numberedSection(5, "Logo and Branding", "Professional design signals professionalism. Use your own PDF, not a Word doc with clip art.")}
            ${numberedSection(6, "Keep it to one page", "Contracting officers scan, they don't read. Fit everything on one page or they won't finish it.")}
            ${articleCta("How to Write a Capability Statement That Wins Contracts", `${SITE_URL}/blog/capability-statement-guide`, "10 min read")}
        `,
        cta: { label: "Read the Full Guide", url: `${SITE_URL}/blog/capability-statement-guide` },
    });
    return send("edu_capability_statement", to, "Your capability statement, upgraded", html);
}
