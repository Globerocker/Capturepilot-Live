/**
 * Email service using Resend.
 * All emails use the shared branded template and respect email-settings toggles.
 */
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
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
import { getDripSequence } from "./drip-sequences";
import { loadCustomTemplate, renderMergeTags } from "./email-custom-template";
import { NURTURE_TEMPLATES } from "./email-nurture-templates";

let _resend: Resend | null = null;
function getResend(): Resend | null {
    if (!process.env.RESEND_API_KEY) return null;
    if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
    return _resend;
}

const FROM_EMAIL = process.env.FROM_EMAIL || "CapturePilot <noreply@capturepilot.com>";

function getDbAdmin() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
}

/**
 * Enroll a user in a drip sequence — inserts scheduled_emails rows for each step.
 * Called after signup/onboarding. Idempotent: if the user is already enrolled in
 * this sequence with pending rows, it's a no-op.
 */
export async function enqueueDripSequence(params: {
    sequenceKey: string;
    email: string;
    contactName?: string;
    userProfileId?: string;
}): Promise<boolean> {
    const { sequenceKey, email, contactName, userProfileId } = params;

    const sequence = getDripSequence(sequenceKey);
    if (!sequence) {
        console.warn(`[drip] unknown sequence: ${sequenceKey}`);
        return false;
    }

    const sb = getDbAdmin();
    if (!sb) {
        console.warn("[drip] DB not configured, skipping enrollment");
        return false;
    }

    // Idempotency: if user already has pending rows for this sequence, skip
    if (userProfileId) {
        const { count } = await sb
            .from("scheduled_emails")
            .select("id", { count: "exact", head: true })
            .eq("user_profile_id", userProfileId)
            .eq("sequence_key", sequenceKey)
            .eq("status", "pending");
        if ((count || 0) > 0) {
            console.log(`[drip] ${email} already enrolled in ${sequenceKey}, skipping`);
            return false;
        }
    }

    const now = Date.now();
    const rows = sequence.steps.map(step => ({
        user_profile_id: userProfileId ?? null,
        email_address: email,
        contact_name: contactName ?? null,
        template_key: step.templateKey,
        sequence_key: sequenceKey,
        scheduled_for: new Date(now + step.dayOffset * 86400000).toISOString(),
        status: "pending",
    }));

    const { error } = await sb.from("scheduled_emails").insert(rows);
    if (error) {
        console.error(`[drip] Failed to enqueue ${sequenceKey}:`, error);
        return false;
    }

    console.log(`[drip] Enrolled ${email} in ${sequenceKey} (${rows.length} emails)`);
    return true;
}

/**
 * Dispatch a single scheduled email — used by the process_scheduled_emails cron.
 * Maps template_key to the appropriate send function.
 * Returns true on success, false on failure (cron records the result).
 */
export async function dispatchScheduledEmail(params: {
    templateKey: string;
    email: string;
    contactName: string;
}): Promise<boolean> {
    const { templateKey, email, contactName } = params;
    // Any nurture_* template comes from NURTURE_TEMPLATES — generic dispatch
    // through sendNurtureSequenceEmail so adding a new nurture step doesn't
    // require touching this switch.
    if (templateKey.startsWith("nurture_")) {
        return sendNurtureSequenceEmail(templateKey, email, contactName);
    }
    switch (templateKey) {
        case "edu_contracting_101": return sendEduContracting101Email(email, contactName);
        case "edu_naics_codes": return sendEduNaicsCodesEmail(email, contactName);
        case "edu_set_asides": return sendEduSetAsidesEmail(email, contactName);
        case "edu_capability_statement": return sendEduCapabilityStatementEmail(email, contactName);
        default:
            console.warn(`[dispatch] no handler for template ${templateKey}`);
            return false;
    }
}

/**
 * Generic sender for the 12-email Facebook nurture sequence. Looks up the
 * pre-rendered HTML in NURTURE_TEMPLATES (lib/email-nurture-templates.ts)
 * and substitutes {{first_name}} from the lead's contactName before send.
 *
 * The HTML stays static — we don't run it through the Unlayer custom-template
 * layer because the nurture HTML is hand-crafted with inline SVG heroes
 * that the editor would mangle.
 */
export async function sendNurtureSequenceEmail(
    templateKey: string,
    to: string,
    contactName: string,
): Promise<boolean> {
    const tmpl = NURTURE_TEMPLATES[templateKey];
    if (!tmpl) {
        console.warn(`[nurture] no template found for key ${templateKey}`);
        return false;
    }
    const firstName = (contactName || "").trim().split(/\s+/)[0] || "there";
    const html = tmpl.html.replace(/\{\{\s*first_name\s*\}\}/g, firstName);
    const subject = tmpl.subject.replace(/\{\{\s*first_name\s*\}\}/g, firstName);
    return send(templateKey, to, subject, html);
}

/** Shared send wrapper — checks DB-backed settings toggle, logs, catches errors */
/**
 * If mergeVars is provided, checks for a published custom template first.
 * Custom templates use {{mergeTag}} syntax substituted at send time.
 * Falls back to the code-generated HTML when no published custom exists.
 */
async function send(
    key: string,
    to: string,
    subject: string,
    html: string,
    mergeVars?: Record<string, string | number | undefined | null>,
): Promise<boolean> {
    if (!(await isEmailEnabled(key))) {
        console.log(`[email] ${key} is disabled in settings, skipping send to ${to}`);
        return false;
    }

    let finalHtml = html;
    let finalSubject = subject;

    if (mergeVars) {
        const custom = await loadCustomTemplate(key);
        if (custom?.html) {
            finalHtml = renderMergeTags(custom.html, mergeVars);
            if (custom.subject) finalSubject = renderMergeTags(custom.subject, mergeVars);
            console.log(`[email] using custom published template for ${key}`);
        }
    }

    try {
        const r = getResend();
        if (!r) { console.warn("RESEND_API_KEY not set, skipping email"); return false; }
        await r.emails.send({ from: FROM_EMAIL, to, subject: finalSubject, html: finalHtml });
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
    return send("welcome", to, `Welcome to CapturePilot, ${companyName}`, html, {
        companyName,
        dashboardUrl: `${APP_URL}/dashboard`,
    });
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
    return send("consulting_welcome", to, `Your CapturePilot Portal is Ready — ${companyName}`, html, {
        contactName,
        companyName,
        email: to,
        tempPassword: tempPassword || "",
        loginUrl: `${APP_URL}/login`,
    });
}

// ─── Beta Invite (Manual from Admin) ───────────────────────

export interface BetaInviteOverrides {
    subject?: string;
    eyebrow?: string;
    heading?: string;
    ctaLabel?: string;
    introLine?: string;
}

export interface BetaInviteRenderParams {
    recipientName?: string;
    companyName?: string;
    personalNote?: string;
    token: string;
    overrides?: BetaInviteOverrides;
}

const BETA_INVITE_DEFAULTS = {
    subject: "You're invited to CapturePilot (beta access)",
    eyebrow: "Private Beta Invitation",
    headingFor: (firstName: string) => `Hi ${firstName}, you're invited`,
    ctaLabel: "Claim Your Beta Account",
    introLineFor: (companyName?: string) =>
        companyName
            ? `I'd like to invite <strong>${companyName}</strong> into CapturePilot's private beta.`
            : "I'd like to invite you into CapturePilot's private beta.",
};

/**
 * Build a beta invite email (subject + HTML) without sending.
 * Used by both the send endpoint and the admin preview endpoint.
 */
export function renderBetaInviteEmail(params: BetaInviteRenderParams): { subject: string; html: string } {
    const { recipientName, companyName, personalNote, token, overrides } = params;
    const firstName = (recipientName || "").split(" ")[0] || "there";
    const signupUrl = `${APP_URL}/signup?invite=${token}`;
    // Token-based unsubscribe — the invitee never needs to log in to opt out.
    // See /api/invite/unsubscribe for the handler (added Apr 20).
    const unsubscribeUrl = `${APP_URL}/api/invite/unsubscribe?token=${token}`;

    const subject = overrides?.subject?.trim() || BETA_INVITE_DEFAULTS.subject;
    const eyebrow = overrides?.eyebrow?.trim() || BETA_INVITE_DEFAULTS.eyebrow;
    const heading = overrides?.heading?.trim() || BETA_INVITE_DEFAULTS.headingFor(firstName);
    const ctaLabel = overrides?.ctaLabel?.trim() || BETA_INVITE_DEFAULTS.ctaLabel;
    const introLine = overrides?.introLine?.trim() || BETA_INVITE_DEFAULTS.introLineFor(companyName);

    const noteBlock = personalNote
        ? contentCard(`
            ${sectionLabel("A note from our team")}
            <p style="color:${COLORS.stone700};font-size:14px;margin:0;line-height:1.7;font-style:italic;">${personalNote.replace(/\n/g, "<br/>")}</p>
        `)
        : "";

    const html = emailTemplate({
        category: "marketing",
        preheader: `You're invited to join CapturePilot as a beta user — 25% off locked in forever.`,
        eyebrow,
        heading,
        body: `
            ${paragraph(introLine)}
            ${paragraph("CapturePilot scans new federal opportunities from SAM.gov every day and scores them against your company profile, so you only look at the ones worth pursuing.")}
            ${noteBlock}
            ${featureBox(`
                ${sectionLabel("What beta access includes")}
                <ul style="color:#065f46;font-size:14px;line-height:1.9;padding-left:20px;margin:0;">
                    <li>Free access during the beta period</li>
                    <li>25% off for life when paid plans launch</li>
                    <li>A direct line to our team for feedback</li>
                    <li>Your account is pre-approved — just set a password</li>
                </ul>
            `)}
        `,
        cta: { label: ctaLabel, url: signupUrl },
        footerNote: "This invitation is personal to you — please don't forward the link.",
        unsubscribeUrl,
    });

    return { subject, html };
}

export async function sendBetaInviteEmail(
    to: string,
    params: BetaInviteRenderParams,
) {
    const { recipientName, companyName } = params;
    const firstName = (recipientName || "").split(" ")[0] || "there";
    const signupUrl = `${APP_URL}/signup?invite=${params.token}`;
    const { subject, html } = renderBetaInviteEmail(params);

    return send("beta_invite", to, subject, html, {
        recipientName: recipientName || "",
        firstName,
        companyName: companyName || "",
        signupUrl,
    });
}

// ─── Team Invitation ───────────────────────────────────────
// Sent when an existing user invites a teammate to their company profile.
// `token` routes the recipient to the accept page; `inviterName` + `companyName`
// show up in the email body so the invite doesn't look spammy.
export async function sendTeamInviteEmail(
    to: string,
    params: {
        inviterName: string;
        companyName: string;
        role: string;
        token: string;
    },
) {
    const { inviterName, companyName, role, token } = params;
    const acceptUrl = `${APP_URL}/invite/accept?token=${token}`;

    const html = emailTemplate({
        category: "transactional",
        preheader: `${inviterName} invited you to join ${companyName} on CapturePilot.`,
        eyebrow: "Team Invitation",
        heading: `You're invited to ${companyName}`,
        body: `
            ${paragraph(`<strong>${inviterName}</strong> invited you to join <strong>${companyName}</strong> on CapturePilot as a <strong>${role}</strong>.`)}
            ${paragraph("CapturePilot is the federal contracting intelligence platform your team uses to find, track, and win government opportunities.")}
            ${featureBox(`
                ${sectionLabel("What happens next")}
                <ul style="color:#065f46;font-size:14px;line-height:1.9;padding-left:20px;margin:0;">
                    <li>Click the button below to accept the invitation</li>
                    <li>If you don't have an account yet, you'll be prompted to create one</li>
                    <li>Once accepted, you'll have ${role} access to ${companyName}'s dashboard</li>
                </ul>
            `)}
        `,
        cta: { label: "Accept Invitation", url: acceptUrl },
        footerNote: "This invitation expires in 14 days.",
    });

    return send("team_invite", to, `${inviterName} invited you to ${companyName} on CapturePilot`, html, {
        inviterName, companyName, role, acceptUrl,
    });
}

// ─── Cold Outreach (prospect drip) ──────────────────────────
// 3-step drip sent to newly-SAM-registered companies that an admin has
// approved. Every message carries a CAN-SPAM compliant footer with
// physical address + one-click unsubscribe. The list-unsubscribe header
// is set by the send wrapper below so mail clients show the native
// "Unsubscribe" button.

// Physical address required by CAN-SPAM. Configurable via env; a sensible
// default covers most deployments but admins should override.
const MAILING_ADDRESS = process.env.OUTREACH_MAILING_ADDRESS
    || "CapturePilot, 1209 Orange Street, Wilmington, DE 19801";

export interface OutreachStep {
    step: 0 | 1 | 2;
    subject: string;
    intro: string;
    body: string;
    ctaLabel: string;
    ctaUrl: string;
}

// Builds the CAN-SPAM footer (physical address + unsubscribe link).
// Kept at module scope so all three steps render an identical footer.
function outreachFooter(unsubscribeUrl: string): string {
    return `
        <p style="color:${COLORS.stone500};font-size:11px;line-height:1.6;margin:24px 0 8px;">
            You're receiving this email because you recently registered on SAM.gov as a federal contractor
            and we think CapturePilot could help you win government work. If that's not a fit, no hard feelings —
            <a href="${unsubscribeUrl}" style="color:${COLORS.stone500};text-decoration:underline;">unsubscribe with one click</a>
            and we won't contact you again.
        </p>
        <p style="color:${COLORS.stone500};font-size:11px;line-height:1.6;margin:0;">
            ${MAILING_ADDRESS}
        </p>
    `;
}

/**
 * Sends a single outreach step. The send() wrapper adds the list-unsubscribe
 * header automatically when we pass an unsubscribeUrl in mergeVars.
 */
export async function sendOutreachEmail(
    to: string,
    params: {
        recipientName?: string | null;
        companyName: string;
        step: 0 | 1 | 2;
        unsubscribeUrl: string;
        introLine?: string;        // optional override for step 0
    },
): Promise<boolean> {
    const { recipientName, companyName, step, unsubscribeUrl } = params;
    const firstName = (recipientName || "").split(" ")[0];
    const greeting = firstName ? `Hi ${firstName},` : `Hi there,`;

    let subject = "";
    let eyebrow = "";
    let heading = "";
    let body = "";
    let ctaLabel = "See matching opportunities";
    let ctaUrl = `${SITE_URL}/check?utm_source=outreach&utm_medium=email&utm_campaign=intro`;

    if (step === 0) {
        subject = `Quick question for ${companyName}`;
        eyebrow = "Federal Contracting Tip";
        heading = `${companyName}, congrats on your SAM registration`;
        body = `
            ${paragraph(greeting)}
            ${paragraph(params.introLine || `I noticed <strong>${companyName}</strong> just registered on SAM.gov — welcome to federal contracting. Most new registrants never win a contract because they have no visibility into which of the 30,000+ open opportunities actually match them.`)}
            ${paragraph(`CapturePilot scans every new opportunity daily and scores them against your NAICS, certifications, and past performance — so you only look at bids worth pursuing. Free to try, no credit card.`)}
            ${featureBox(`
                ${sectionLabel("What you get in the free check")}
                <ul style="color:#065f46;font-size:14px;line-height:1.9;padding-left:20px;margin:0;">
                    <li>List of open opportunities matching your NAICS + certs</li>
                    <li>"Easy wins" — set-asides your competition can't touch</li>
                    <li>Certification recommendations that unlock more contracts</li>
                </ul>
            `)}
        `;
        ctaLabel = "Run a free capability check";
    } else if (step === 1) {
        subject = `${companyName} — 2 opportunities matching your registration`;
        eyebrow = "Follow-up";
        heading = `A quick nudge on federal opportunities`;
        body = `
            ${paragraph(greeting)}
            ${paragraph(`I sent you a note a few days back about CapturePilot — figured it was worth following up because <strong>opportunities in your NAICS are moving now</strong>. Sources Sought notices typically land 6-18 months before an actual award, so the early read matters.`)}
            ${paragraph(`If you want a 30-second look at who's buying what you sell, the free capability check pulls live SAM.gov data for ${companyName}:`)}
        `;
        ctaLabel = "See my matches";
        ctaUrl = `${SITE_URL}/check?utm_source=outreach&utm_medium=email&utm_campaign=followup`;
    } else {
        subject = `One last note from CapturePilot`;
        eyebrow = "Last message";
        heading = `Closing the loop`;
        body = `
            ${paragraph(greeting)}
            ${paragraph(`This is the last email you'll get from me — I don't want to be that person.`)}
            ${paragraph(`If federal contracting isn't a priority right now, totally fair. If it ever is, CapturePilot is at <a href="${SITE_URL}" style="color:${COLORS.emerald700};">capturepilot.com</a> — free tier available anytime.`)}
            ${paragraph(`Either way, best of luck with ${companyName}.`)}
        `;
        ctaLabel = "Bookmark CapturePilot";
        ctaUrl = `${SITE_URL}?utm_source=outreach&utm_medium=email&utm_campaign=final`;
    }

    const html = emailTemplate({
        category: "marketing",
        preheader: subject,
        eyebrow,
        heading,
        body: body + outreachFooter(unsubscribeUrl),
        cta: { label: ctaLabel, url: ctaUrl },
        unsubscribeUrl,
    });

    return send("outreach_" + ["intro", "followup", "final"][step], to, subject, html, {
        firstName: firstName || "",
        companyName,
        unsubscribeUrl,
    });
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
    return send("task_notification", to, `Action Required: ${taskTitle}`, html, {
        contactName,
        taskTitle,
        taskDescription,
        dueDate: dueDate || "",
        tasksUrl: `${APP_URL}/portal/tasks`,
    });
}

// ─── Agency Pipeline Push — admin hand-picked opp for managed client ─
export async function sendAgencyPipelineNotification(params: {
    to: string;
    contactName: string;
    companyName: string;
    oppTitle: string;
    oppAgency: string;
    oppResponseDeadline?: string | null;
    oppNoticeId?: string | null;
    pushedByName: string;
    customerMessage?: string | null;
    nextSteps?: string[];
}) {
    const {
        to, contactName, oppTitle, oppAgency, oppResponseDeadline,
        oppNoticeId, pushedByName, customerMessage, nextSteps,
    } = params;

    const deadlineLine = oppResponseDeadline
        ? `<p style="color:${COLORS.stone700};font-size:13px;margin:4px 0 0;"><strong>Response deadline:</strong> ${new Date(oppResponseDeadline).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>`
        : "";

    const stepsHtml = (nextSteps && nextSteps.length > 0)
        ? `<p style="font-size:14px;font-weight:700;color:${COLORS.black};margin:16px 0 8px;">What's next:</p>
           <ul style="margin:0;padding-left:20px;color:${COLORS.stone700};font-size:14px;line-height:1.7;">
             ${nextSteps.map(s => `<li>${s}</li>`).join("")}
           </ul>`
        : "";

    const messageHtml = customerMessage
        ? `<p style="color:${COLORS.stone700};font-size:14px;line-height:1.7;margin:16px 0 0;font-style:italic;">&ldquo;${customerMessage}&rdquo;<br><span style="font-size:12px;color:${COLORS.stone500};">— ${pushedByName}</span></p>`
        : "";

    const portalUrl = oppNoticeId
        ? `${APP_URL}/portal/pipeline`
        : `${APP_URL}/portal/pipeline`;

    const html = emailTemplate({
        category: await getEmailCategory("agency_pipeline_push"),
        preheader: `${pushedByName} spotted a new opportunity and is actively pursuing it for you.`,
        eyebrow: "Pipeline Update",
        heading: `Hi ${contactName}, we've picked up a new opportunity for you`,
        body: `
            ${paragraph(`<strong>${pushedByName}</strong> just spotted a federal opportunity that looks like a strong fit — we've added it to your pipeline and are actively pursuing it.`)}
            ${alertBox(`
                <p style="font-size:16px;font-weight:700;color:${COLORS.black};margin:0;">${oppTitle}</p>
                <p style="color:${COLORS.stone700};font-size:13px;margin:6px 0 0;"><strong>Agency:</strong> ${oppAgency}</p>
                ${deadlineLine}
            `)}
            ${messageHtml}
            ${stepsHtml}
            ${paragraph("You'll see this in your pipeline in real time. Reply to this email or call us with any questions.")}
        `,
        cta: { label: "View in Your Pipeline", url: portalUrl },
    });

    return send("agency_pipeline_push", to, `New opportunity in your pipeline: ${oppTitle}`, html, {
        contactName,
        oppTitle,
        oppAgency,
        pushedByName,
    });
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

// ─── Saved-Search Daily Digest ─────────────────────────────
export async function sendSavedSearchDigest(args: {
    to: string;
    profileName: string;
    searches: Array<{
        id: string;
        name: string;
        matches: Array<{ notice_id: string; title: string | null; agency: string | null; response_deadline: string | null }>;
    }>;
}) {
    const totalMatches = args.searches.reduce((s, x) => s + x.matches.length, 0);
    const sections = args.searches.map(s => `
        <div style="margin:24px 0;">
            <p style="font-size:11px;font-weight:700;color:${COLORS.stone500};text-transform:uppercase;letter-spacing:0.1em;margin:0 0 8px;">${s.name} — ${s.matches.length} new</p>
            <table role="presentation" style="width:100%;border-collapse:collapse;background:${COLORS.white};border:1px solid ${COLORS.stone200};border-radius:12px;overflow:hidden;">
                <tbody>
                    ${s.matches.slice(0, 8).map(m => `
                        <tr>
                            <td style="padding:12px;border-bottom:1px solid ${COLORS.stone100};">
                                <p style="font-size:13px;font-weight:700;color:${COLORS.black};margin:0;">
                                    <a href="${APP_URL}/opportunities/${m.notice_id}" style="color:${COLORS.black};text-decoration:none;">${m.title || "(untitled)"}</a>
                                </p>
                                <p style="font-size:11px;color:${COLORS.stone500};margin:3px 0 0;">${m.agency || "—"}${m.response_deadline ? ` · due ${new Date(m.response_deadline).toLocaleDateString()}` : ""}</p>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `).join("");

    const html = emailTemplate({
        category: await getEmailCategory("opportunity_alert"),
        preheader: `${totalMatches} new opportunities across your saved searches.`,
        eyebrow: "Saved Searches",
        heading: `${args.profileName}, ${totalMatches} new opportunities`,
        body: `
            ${paragraph(`Your saved searches surfaced ${totalMatches} new opportunit${totalMatches === 1 ? "y" : "ies"} since the last alert.`)}
            ${sections}
        `,
        cta: { label: "Manage saved searches", url: `${APP_URL}/matches` },
    });
    return send("opportunity_alert", args.to, `${totalMatches} new matches in your saved searches`, html);
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
    return send(key, to, subject, html, {
        contactName,
        daysLeft,
        billingUrl: `${APP_URL}/settings/billing`,
    });
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
    return send("payment_failed", to, "Payment failed — update your card to keep CapturePilot access", html, {
        contactName,
        billingUrl: `${APP_URL}/settings/billing`,
    });
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
    return send("subscription_canceled", to, "Your CapturePilot subscription has been canceled", html, {
        contactName,
        billingUrl: `${APP_URL}/settings/billing`,
    });
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
    return send(key, to, subject, html, {
        contactName,
        daysUntilCutoff,
        checkoutUrl: `${APP_URL}/settings/billing?promo=BETA25`,
    });
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
    return send("edu_contracting_101", to, "Federal Contracting 101 — your quick-start guide", html, {
        contactName,
        blogUrl: `${SITE_URL}/blog/government-contracting-101`,
    });
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
    return send("edu_naics_codes", to, "NAICS codes, decoded — the contractor's cheat sheet", html, {
        contactName,
        blogUrl: `${SITE_URL}/blog/naics-codes-explained`,
    });
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
    return send("edu_set_asides", to, "Set-asides: the small business advantage in federal contracting", html, {
        contactName,
        blogUrl: `${SITE_URL}/blog/set-aside-programs`,
    });
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
    return send("edu_capability_statement", to, "Your capability statement, upgraded", html, {
        contactName,
        blogUrl: `${SITE_URL}/blog/capability-statement-guide`,
    });
}

// ─── Startup Pack Delivery (one-time purchase confirmation) ─────────────────
export async function sendStartupPackDeliveryEmail(
    to: string,
    data: {
        companyName: string;
        downloadUrl: string;
        amountPaidCents: number;
    },
) {
    const { companyName, downloadUrl, amountPaidCents } = data;
    const priceLabel = `$${(amountPaidCents / 100).toFixed(0)}`;

    const html = emailTemplate({
        category: await getEmailCategory("startup_pack_delivery"),
        preheader: `Your Federal Launch Kit is ready. Open your download library now.`,
        eyebrow: "Order Confirmed",
        heading: `Welcome to the Federal Launch Kit, ${companyName}`,
        body: `
            ${paragraph("Thank you for your purchase — your downloads are live and waiting for you.")}
            ${featureBox(`
                ${sectionLabel("What you get")}
                <ul style="color:#065f46;font-size:14px;line-height:1.9;padding-left:20px;margin:0;">
                    <li>Capability statement templates (DOCX, Canva, PDF walkthrough)</li>
                    <li>Sources Sought response playbook + fill-in-the-blank template</li>
                    <li>Bid / No-Bid decision matrix &amp; PWin calculator</li>
                    <li>8(a) / HUBZone / WOSB / SDVOSB eligibility worksheets</li>
                    <li>10 contracting-officer outreach email templates</li>
                    <li>Price-to-Win worksheet + FY2026 labor rate benchmarks</li>
                    <li><strong>Bonus:</strong> 30-min founder onboarding call (Calendly link inside)</li>
                </ul>
            `)}
            ${paragraph("Bookmark the link below — your access doesn't expire. Use it as your personal federal-contracting library.")}
            ${contentCard(`
                ${sectionLabel("Order details")}
                <table role="presentation" style="width:100%;border-collapse:collapse;font-size:13px;color:${COLORS.stone700};">
                    <tbody>
                        <tr><td style="padding:4px 0;">Amount paid</td><td style="padding:4px 0;text-align:right;font-weight:700;">${priceLabel} USD</td></tr>
                        <tr><td style="padding:4px 0;">Access</td><td style="padding:4px 0;text-align:right;font-weight:700;">Lifetime, instant</td></tr>
                        <tr><td style="padding:4px 0;">Refund policy</td><td style="padding:4px 0;text-align:right;font-weight:700;">7-day, no questions</td></tr>
                    </tbody>
                </table>
            `)}
        `,
        cta: { label: "Open My Downloads", url: downloadUrl },
        secondaryCta: { label: "Schedule onboarding call", url: "https://calendly.com/capturepilot/startup-pack-onboarding" },
        footerNote: "Need help or want a refund? Just reply to this email — we'll handle it within 24 hours.",
    });

    return send("startup_pack_delivery", to, `Your Federal Launch Kit is ready · ${companyName}`, html, {
        companyName,
        downloadUrl,
        priceLabel,
    });
}

