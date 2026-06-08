import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendOpportunityAlert } from "@/lib/email";
import { guardCron } from "@/lib/cron-auth";
import { withCronTelemetry } from "@/lib/cron-telemetry";

export const maxDuration = 120;

function getDb() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );
}

/**
 * Daily notification cron — sends email alerts for new high-scoring matches.
 * Checks which users have new WARM/HOT matches since last notification.
 * Only sends to users who haven't been notified in the last 24 hours.
 */
async function GET_handler(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;

    const db = getDb();
    let sent = 0;

    try {
        // Get all active users with email
        const { data: users } = await db
            .from("user_profiles")
            .select("id, email, contact_name, company_name")
            .in("account_type", ["consulting", "self_service"])
            .not("email", "is", null);

        if (!users || users.length === 0) {
            return NextResponse.json({ success: true, sent: 0, message: "No users" });
        }

        const oneDayAgo = new Date(Date.now() - 86400000).toISOString();

        for (const user of users) {
            if (!user.email) continue;

            // Check if already notified today
            const { count: recentNotifs } = await db
                .from("client_activity_log")
                .select("id", { count: "exact", head: true })
                .eq("user_profile_id", user.id)
                .eq("action", "email_sent")
                .gte("created_at", oneDayAgo);

            if ((recentNotifs || 0) > 0) continue;

            // Get their top new matches (created in last 24h or high score)
            const { data: matches } = await db
                .from("user_matches")
                .select(`
                    score, classification,
                    opportunity:opportunities!inner(title, agency, response_deadline)
                `)
                .eq("user_profile_id", user.id)
                .gte("score", 0.45)
                .order("score", { ascending: false })
                .limit(5);

            if (!matches || matches.length === 0) continue;

            const opps = matches.map((m: Record<string, unknown>) => {
                const opp = (Array.isArray(m.opportunity) ? m.opportunity[0] : m.opportunity) as Record<string, unknown>;
                return {
                    title: String(opp?.title || "Opportunity"),
                    agency: String(opp?.agency || "Federal Agency"),
                    score: Math.round(Number(m.score) * 100),
                    deadline: opp?.response_deadline ? String(opp.response_deadline) : undefined,
                };
            });

            // Send email
            const success = await sendOpportunityAlert(
                user.email,
                user.contact_name || user.company_name || "there",
                opps,
            );

            if (success) {
                sent++;
                await db.from("client_activity_log").insert({
                    user_profile_id: user.id,
                    action: "email_sent",
                    description: `Opportunity alert: ${opps.length} matches sent`,
                    metadata: { match_count: opps.length, top_score: opps[0]?.score },
                });
            }
        }

        return NextResponse.json({ success: true, sent, total_users: users.length });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}

export const GET = withCronTelemetry("/api/cron/notify_matches", GET_handler);
