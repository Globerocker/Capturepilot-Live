/**
 * Slack webhook notifications for admin events.
 * Set SLACK_WEBHOOK_URL in Vercel env vars to enable.
 * Get webhook URL from: Slack > App > Incoming Webhooks
 */

const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL;

export async function notifySlack(message: string, blocks?: Record<string, unknown>[]) {
    if (!SLACK_WEBHOOK) return;

    try {
        await fetch(SLACK_WEBHOOK, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                text: message,
                blocks: blocks || [
                    {
                        type: "section",
                        text: { type: "mrkdwn", text: message },
                    },
                ],
            }),
            signal: AbortSignal.timeout(5000),
        });
    } catch {
        // Slack notifications are best-effort
    }
}

// Pre-built notification templates
export async function notifyNewClient(companyName: string, email: string) {
    await notifySlack(
        `🆕 *New Client Created*\n*${companyName}*\n${email}\n<https://admin.capturepilot.com/admin/clients|View in Admin>`
    );
}

export async function notifyDocumentUploaded(companyName: string, filename: string) {
    await notifySlack(
        `📄 *Document Uploaded*\n*${companyName}* uploaded: ${filename}\n<https://admin.capturepilot.com/admin/clients|Review>`
    );
}

export async function notifyTaskCompleted(companyName: string, taskTitle: string) {
    await notifySlack(
        `✅ *Task Completed*\n*${companyName}* completed: ${taskTitle}`
    );
}

export async function notifyNewLead(companyName: string, website: string) {
    await notifySlack(
        `🎯 *New Lead (Quick Check)*\n*${companyName}*\n${website}\n<https://admin.capturepilot.com/admin/leads|View Leads>`
    );
}

export async function notifyHotMatch(companyName: string, oppTitle: string, score: number) {
    await notifySlack(
        `🔥 *HOT Match Found*\n*${companyName}* → ${oppTitle}\nScore: ${Math.round(score * 100)}%`
    );
}
