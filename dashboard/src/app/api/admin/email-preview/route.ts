import { NextRequest, NextResponse } from "next/server";
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
} from "@/lib/email-template";

/**
 * GET /api/admin/email-preview?type=welcome
 * Returns rendered HTML for any email template with sample data.
 * Used by the admin email preview page.
 */
export async function GET(req: NextRequest) {
    const type = req.nextUrl.searchParams.get("type") || "welcome";

    const html = renderPreview(type);
    if (!html) {
        return NextResponse.json({ error: `Unknown template: ${type}` }, { status: 400 });
    }

    return new NextResponse(html, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
    });
}

function renderPreview(type: string): string | null {
    switch (type) {
        case "welcome":
            return emailTemplate({
                preheader: "We're already scanning 30,000+ federal opportunities for Acme Corp.",
                heading: "Welcome aboard, Acme Corp!",
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

        case "consulting_welcome":
            return emailTemplate({
                preheader: "Your CapturePilot consulting portal for SmartPipe is ready.",
                heading: "Hi Donny,",
                body: `
                    ${paragraph("Your CapturePilot consulting portal for <strong>SmartPipe</strong> is ready. Our team is actively working on your government contracting pipeline.")}
                    ${contentCard(`
                        ${sectionLabel("Your Login")}
                        <p style="color:${COLORS.stone700};font-size:14px;margin:4px 0;"><strong>Email:</strong> donny@smart-pipe.com</p>
                        <p style="color:${COLORS.stone700};font-size:14px;margin:4px 0;"><strong>Temporary Password:</strong> Sp1pe2026!</p>
                        <p style="color:${COLORS.stone700};font-size:14px;margin:8px 0 0;">You can also sign in with your Google account.</p>
                    `)}
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

        case "task_notification":
            return emailTemplate({
                preheader: "Action required: Upload Capability Statement",
                heading: "Hi Donny,",
                body: `
                    ${paragraph("You have a new task that needs your attention:")}
                    ${alertBox(`
                        <p style="font-size:16px;font-weight:700;color:${COLORS.black};margin:0;">Upload Capability Statement</p>
                        <p style="color:${COLORS.stone700};font-size:14px;margin:8px 0 0;line-height:1.5;">Please upload your company's capability statement so we can use it for upcoming proposals. This should include your core competencies, past performance, and key personnel.</p>
                        <p style="color:#dc2626;font-size:14px;font-weight:700;margin:8px 0 0;">Due: Friday, April 18</p>
                    `)}
                `,
                cta: { label: "View Task", url: `${APP_URL}/portal/tasks` },
                transactional: true,
            });

        case "opportunity_alert":
            return emailTemplate({
                preheader: "5 new federal opportunities match your profile.",
                heading: "Acme Corp, we found 5 new opportunities for you",
                body: `
                    <table role="presentation" style="width:100%;border-collapse:collapse;margin:20px 0;">
                        <thead><tr>
                            <th style="text-align:left;padding:8px 12px;font-size:11px;color:${COLORS.stone500};text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid ${COLORS.stone200};">Opportunity</th>
                            <th style="text-align:center;padding:8px 12px;font-size:11px;color:${COLORS.stone500};text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid ${COLORS.stone200};">Match</th>
                        </tr></thead>
                        <tbody>
                            <tr><td style="padding:10px 12px;border-bottom:1px solid ${COLORS.stone100};"><p style="font-size:14px;font-weight:600;color:${COLORS.black};margin:0;">Janitorial Services — Fort Bragg</p><p style="font-size:12px;color:${COLORS.stone500};margin:2px 0 0;">U.S. Army</p></td><td style="padding:10px 12px;border-bottom:1px solid ${COLORS.stone100};text-align:center;">${scoreBadge(87)}</td></tr>
                            <tr><td style="padding:10px 12px;border-bottom:1px solid ${COLORS.stone100};"><p style="font-size:14px;font-weight:600;color:${COLORS.black};margin:0;">Custodial Maintenance — GSA Building</p><p style="font-size:12px;color:${COLORS.stone500};margin:2px 0 0;">General Services Administration</p></td><td style="padding:10px 12px;border-bottom:1px solid ${COLORS.stone100};text-align:center;">${scoreBadge(72)}</td></tr>
                            <tr><td style="padding:10px 12px;border-bottom:1px solid ${COLORS.stone100};"><p style="font-size:14px;font-weight:600;color:${COLORS.black};margin:0;">Landscaping & Grounds Maintenance</p><p style="font-size:12px;color:${COLORS.stone500};margin:2px 0 0;">Department of Veterans Affairs</p></td><td style="padding:10px 12px;border-bottom:1px solid ${COLORS.stone100};text-align:center;">${scoreBadge(58)}</td></tr>
                            <tr><td style="padding:10px 12px;border-bottom:1px solid ${COLORS.stone100};"><p style="font-size:14px;font-weight:600;color:${COLORS.black};margin:0;">Facility Support Services — NOAA</p><p style="font-size:12px;color:${COLORS.stone500};margin:2px 0 0;">National Oceanic and Atmospheric Administration</p></td><td style="padding:10px 12px;border-bottom:1px solid ${COLORS.stone100};text-align:center;">${scoreBadge(51)}</td></tr>
                            <tr><td style="padding:10px 12px;border-bottom:1px solid ${COLORS.stone100};"><p style="font-size:14px;font-weight:600;color:${COLORS.black};margin:0;">Sources Sought: Custodial Services</p><p style="font-size:12px;color:${COLORS.stone500};margin:2px 0 0;">U.S. Air Force</p></td><td style="padding:10px 12px;border-bottom:1px solid ${COLORS.stone100};text-align:center;">${scoreBadge(45)}</td></tr>
                        </tbody>
                    </table>
                `,
                cta: { label: "View All Opportunities", url: `${APP_URL}/dashboard/opportunities` },
            });

        case "quick_checker": {
            const readinessScore = 62;
            const readinessColor = "#d97706";
            return emailTemplate({
                preheader: "Acme Janitorial scored 62/100 for federal readiness. 47 opportunities matched.",
                heading: "Your Federal Readiness Report",
                body: `
                    ${paragraph("Here are the Quick Checker results for <strong>Acme Janitorial</strong>.")}
                    <div style="text-align:center;margin:24px 0;">
                        <div style="display:inline-block;width:100px;height:100px;border-radius:50%;border:6px solid ${readinessColor};position:relative;line-height:88px;text-align:center;">
                            <span style="font-size:32px;font-weight:800;color:${readinessColor};">${readinessScore}</span>
                        </div>
                        <p style="font-size:14px;font-weight:700;color:${readinessColor};margin:8px 0 0;">Moderate Readiness</p>
                        <p style="font-size:12px;color:${COLORS.stone500};margin:4px 0 0;">out of 100</p>
                    </div>
                    ${sectionLabel("Your Top Matching Opportunities")}
                    <table role="presentation" style="width:100%;border-collapse:collapse;margin:12px 0 20px;">
                        <tbody>
                            <tr><td style="padding:10px 12px;border-bottom:1px solid ${COLORS.stone100};"><p style="font-size:14px;font-weight:600;color:${COLORS.black};margin:0;">Janitorial Services — Fort Bragg</p><p style="font-size:12px;color:${COLORS.stone500};margin:2px 0 0;">U.S. Army</p></td><td style="padding:10px 12px;border-bottom:1px solid ${COLORS.stone100};text-align:center;">${scoreBadge(87)}</td></tr>
                            <tr><td style="padding:10px 12px;border-bottom:1px solid ${COLORS.stone100};"><p style="font-size:14px;font-weight:600;color:${COLORS.black};margin:0;">Custodial Maintenance — GSA Building</p><p style="font-size:12px;color:${COLORS.stone500};margin:2px 0 0;">General Services Administration</p></td><td style="padding:10px 12px;border-bottom:1px solid ${COLORS.stone100};text-align:center;">${scoreBadge(72)}</td></tr>
                            <tr><td style="padding:10px 12px;border-bottom:1px solid ${COLORS.stone100};"><p style="font-size:14px;font-weight:600;color:${COLORS.black};margin:0;">Landscaping & Grounds Maintenance</p><p style="font-size:12px;color:${COLORS.stone500};margin:2px 0 0;">Department of Veterans Affairs</p></td><td style="padding:10px 12px;border-bottom:1px solid ${COLORS.stone100};text-align:center;">${scoreBadge(58)}</td></tr>
                        </tbody>
                    </table>
                    <p style="font-size:13px;color:${COLORS.stone500};text-align:center;margin:0 0 8px;">+ 44 more matching opportunities</p>
                `,
                cta: { label: "Create Free Account to See All Results", url: `${APP_URL}/signup?ref=quickcheck` },
                secondaryCta: { label: "View full report", url: `${APP_URL}/check/sample-analysis-id` },
            });
        }

        case "trial_expiring_3d":
            return emailTemplate({
                preheader: "Your CapturePilot trial expires in 3 days. Subscribe to keep your matches.",
                heading: "Your trial expires in 3 days",
                body: `
                    ${paragraph("Hi Sarah,")}
                    ${paragraph("Your free trial of CapturePilot expires in 3 days. Subscribe now to keep access to your matched federal opportunities and daily alerts.")}
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

        case "trial_expiring_1d":
            return emailTemplate({
                preheader: "Your CapturePilot trial expires today. Subscribe to keep your matches.",
                heading: "Your trial expires today",
                body: `
                    ${paragraph("Hi Sarah,")}
                    ${paragraph("This is your last day of CapturePilot access. After today, you'll lose access to your matched opportunities and alerts.")}
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

        case "payment_failed":
            return emailTemplate({
                preheader: "We couldn't process your payment. Update your card to keep access.",
                heading: "We couldn't process your payment",
                body: `
                    ${paragraph("Hi Sarah,")}
                    ${paragraph("Your most recent payment for CapturePilot failed. This can happen when a card expires or a bank declines the charge.")}
                    ${urgentBox(`
                        <p style="font-size:14px;font-weight:700;color:#991b1b;margin:0 0 4px;">Action needed</p>
                        <p style="font-size:14px;color:#991b1b;margin:0;line-height:1.5;">Please update your payment method to avoid losing access to your matched opportunities and alerts.</p>
                    `)}
                `,
                cta: { label: "Update Payment Method", url: `${APP_URL}/settings/billing` },
                transactional: true,
            });

        case "subscription_canceled":
            return emailTemplate({
                preheader: "Your CapturePilot subscription has been canceled.",
                heading: "Your subscription has been canceled",
                body: `
                    ${paragraph("Hi Sarah,")}
                    ${paragraph("Your CapturePilot subscription has been canceled. You'll retain access through the end of your current billing period.")}
                    ${paragraph("We'll keep your profile and match history on file. If you decide to come back, everything will be right where you left it.")}
                    ${contentCard(`
                        <p style="font-size:14px;color:${COLORS.stone700};margin:0;line-height:1.5;">Changed your mind? You can resubscribe at any time from your billing settings.</p>
                    `)}
                `,
                cta: { label: "Resubscribe", url: `${APP_URL}/settings/billing` },
                transactional: true,
            });

        case "beta_deadline_8d":
            return emailTemplate({
                preheader: "8 days left to lock in 25% off CapturePilot forever. Use code BETA25 before May 9.",
                heading: "8 days left to lock in your beta discount",
                body: `
                    ${paragraph("Hi there,")}
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
                `,
                cta: { label: "Subscribe Now with BETA25", url: `${APP_URL}/settings/billing?promo=BETA25` },
            });

        case "beta_deadline_1d":
            return emailTemplate({
                preheader: "Tomorrow is the last day to lock in 25% off CapturePilot forever. Use code BETA25 before May 9.",
                heading: "Tomorrow is the last day to lock in your beta discount",
                body: `
                    ${paragraph("Hi there,")}
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
                    ${urgentBox(`<p style="font-size:14px;font-weight:700;color:#991b1b;margin:0;">After May 9, free access ends and the BETA25 discount expires permanently.</p>`)}
                `,
                cta: { label: "Subscribe Now with BETA25", url: `${APP_URL}/settings/billing?promo=BETA25` },
            });

        default:
            return null;
    }
}
