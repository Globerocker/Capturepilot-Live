import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendBetaDeadlineEmail } from "@/lib/email";
import { guardCron } from "@/lib/cron-auth";

export const maxDuration = 60;

function getDb() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );
}

// Beta cutoff: May 9, 2026 00:00 UTC
const BETA_CUTOFF = new Date("2026-05-09T00:00:00Z");

// Send dates: May 1, May 5, May 8
const SEND_DATES = ["2026-05-01", "2026-05-05", "2026-05-08"];

/**
 * Daily cron — sends beta deadline reminders on May 1, 5, and 8.
 * Targets free/trialing self-service users who haven't subscribed.
 * Uses promo code BETA25 for 25% off forever.
 */
// VPS systemd timers POST via _runner.mjs — alias POST so the lane isn't 405'd.
// (GET is a hoisted function declaration, so referencing it here is safe.)
export const POST = GET;

export async function GET(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;

    const db = getDb();
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD

    // Only run on designated send dates
    if (!SEND_DATES.includes(todayStr)) {
        return NextResponse.json({ success: true, sent: 0, message: `Not a send date (${todayStr})` });
    }

    const daysUntilCutoff = Math.ceil((BETA_CUTOFF.getTime() - now.getTime()) / 86400000);
    let sent = 0;

    try {
        // Get free/trialing self-service users who haven't paid
        const { data: users } = await db
            .from("user_profiles")
            .select("id, email, contact_name, company_name, subscription_status")
            .eq("account_type", "self_service")
            .in("subscription_status", ["trialing", "free", "inactive"])
            .not("email", "is", null);

        if (!users || users.length === 0) {
            return NextResponse.json({ success: true, sent: 0, message: "No free users to notify" });
        }

        const actionKey = `beta_deadline_${todayStr}`;

        for (const user of users) {
            if (!user.email) continue;

            // Deduplicate
            const { count } = await db
                .from("client_activity_log")
                .select("id", { count: "exact", head: true })
                .eq("user_profile_id", user.id)
                .eq("action", actionKey);

            if ((count || 0) > 0) continue;

            const success = await sendBetaDeadlineEmail(
                user.email,
                user.contact_name || user.company_name || "there",
                daysUntilCutoff,
            );

            if (success) {
                sent++;
                await db.from("client_activity_log").insert({
                    user_profile_id: user.id,
                    action: actionKey,
                    description: `Beta deadline reminder: ${daysUntilCutoff} days until cutoff`,
                });
            }
        }

        return NextResponse.json({ success: true, sent, total_users: users?.length || 0, days_until_cutoff: daysUntilCutoff });
    } catch (e) {
        console.error("Beta deadline cron error:", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
