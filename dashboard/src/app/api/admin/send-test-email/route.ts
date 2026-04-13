import { NextRequest, NextResponse } from "next/server";
import {
    sendWelcomeEmail,
    sendConsultingWelcomeEmail,
    sendTaskNotification,
    sendOpportunityAlert,
    sendQuickCheckerResultsEmail,
    sendTrialExpiringEmail,
    sendPaymentFailedEmail,
    sendSubscriptionCanceledEmail,
    sendBetaDeadlineEmail,
} from "@/lib/email";

/**
 * POST /api/admin/send-test-email
 * Sends a test email of any template type to a specified address.
 */
export async function POST(req: NextRequest) {
    try {
        const { type, to } = await req.json();

        if (!to || !type) {
            return NextResponse.json({ error: "type and to are required" }, { status: 400 });
        }

        let success = false;

        switch (type) {
            case "welcome":
                success = await sendWelcomeEmail(to, "Acme Corp") ?? false;
                break;
            case "consulting_welcome":
                success = await sendConsultingWelcomeEmail(to, "SmartPipe", "Donny", "Test1234!") ?? false;
                break;
            case "task_notification":
                success = await sendTaskNotification(to, "Donny", "Upload Capability Statement", "Please upload your capability statement for upcoming proposals.", "2026-04-18") ?? false;
                break;
            case "opportunity_alert":
                success = await sendOpportunityAlert(to, "Acme Corp", [
                    { title: "Janitorial Services — Fort Bragg", agency: "U.S. Army", score: 87 },
                    { title: "Custodial Maintenance — GSA Building", agency: "General Services Administration", score: 72 },
                    { title: "Landscaping & Grounds Maintenance", agency: "Department of Veterans Affairs", score: 58 },
                ]) ?? false;
                break;
            case "quick_checker":
                success = await sendQuickCheckerResultsEmail(to, {
                    companyName: "Acme Janitorial",
                    analysisId: "test-preview",
                    readinessScore: 62,
                    topMatches: [
                        { title: "Janitorial Services — Fort Bragg", agency: "U.S. Army", score: 87 },
                        { title: "Custodial Maintenance — GSA Building", agency: "General Services Administration", score: 72 },
                        { title: "Landscaping & Grounds Maintenance", agency: "Department of Veterans Affairs", score: 58 },
                    ],
                    totalMatches: 47,
                }) ?? false;
                break;
            case "trial_expiring_3d":
                success = await sendTrialExpiringEmail(to, "Sarah", 3) ?? false;
                break;
            case "trial_expiring_1d":
                success = await sendTrialExpiringEmail(to, "Sarah", 1) ?? false;
                break;
            case "payment_failed":
                success = await sendPaymentFailedEmail(to, "Sarah") ?? false;
                break;
            case "subscription_canceled":
                success = await sendSubscriptionCanceledEmail(to, "Sarah") ?? false;
                break;
            case "beta_deadline_8d":
                success = await sendBetaDeadlineEmail(to, "there", 8) ?? false;
                break;
            case "beta_deadline_1d":
                success = await sendBetaDeadlineEmail(to, "there", 1) ?? false;
                break;
            default:
                return NextResponse.json({ error: `Unknown template: ${type}` }, { status: 400 });
        }

        return NextResponse.json({ success, sent_to: to, type });
    } catch (e) {
        console.error("Test email error:", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
