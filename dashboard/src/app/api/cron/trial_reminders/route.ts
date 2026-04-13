import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendTrialExpiringEmail } from "@/lib/email";

export const maxDuration = 60;

function getDb() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );
}

/**
 * Daily cron — sends trial expiring warnings.
 * Checks for users whose trial_ends_at is within the next 3 days.
 * Sends emails at 3-day and 1-day marks (deduplicated via client_activity_log).
 */
export async function GET(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();
    let sent = 0;
    const errors: string[] = [];

    try {
        const now = new Date();
        const threeDaysOut = new Date(now.getTime() + 3 * 86400000).toISOString();

        // Find users with trial ending within 3 days who are still active/trialing
        const { data: users } = await db
            .from("user_profiles")
            .select("id, email, contact_name, company_name, trial_ends_at")
            .not("trial_ends_at", "is", null)
            .lte("trial_ends_at", threeDaysOut)
            .gt("trial_ends_at", now.toISOString())
            .in("subscription_status", ["active", "trialing"])
            .in("account_type", ["self_service"]);

        if (!users || users.length === 0) {
            return NextResponse.json({ success: true, sent: 0, message: "No trials expiring soon" });
        }

        for (const user of users) {
            if (!user.email || !user.trial_ends_at) continue;

            const trialEnd = new Date(user.trial_ends_at);
            const daysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / 86400000);

            // Only send at 3-day and 1-day marks
            if (daysLeft !== 3 && daysLeft !== 1) continue;

            // Deduplicate: check if we already sent a trial reminder at this day mark
            const actionKey = `trial_reminder_${daysLeft}d`;
            const { count } = await db
                .from("client_activity_log")
                .select("id", { count: "exact", head: true })
                .eq("user_profile_id", user.id)
                .eq("action", actionKey);

            if ((count || 0) > 0) continue;

            const success = await sendTrialExpiringEmail(
                user.email,
                user.contact_name || user.company_name || "there",
                daysLeft,
            );

            if (success) {
                sent++;
                await db.from("client_activity_log").insert({
                    user_profile_id: user.id,
                    action: actionKey,
                    description: `Trial expiring reminder: ${daysLeft} day(s) left`,
                });
            }
        }

        return NextResponse.json({ success: true, sent, checked: users.length, errors });
    } catch (e) {
        console.error("Trial reminders cron error:", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
