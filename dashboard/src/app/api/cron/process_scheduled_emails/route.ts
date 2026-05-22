import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { dispatchScheduledEmail } from "@/lib/email";

export const maxDuration = 120;

function getDb() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );
}

/**
 * Hourly cron — processes scheduled_emails rows that are due.
 * Picks up to 50 due rows, dispatches via dispatchScheduledEmail, marks sent_at.
 * Respects email-settings toggles (the send() wrapper checks isEmailEnabled).
 */
export async function GET(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET) {
        const expectedCron = `Bearer ${process.env.CRON_SECRET}`;
        const expectedSvc = process.env.SUPABASE_SERVICE_KEY ? `Bearer ${process.env.SUPABASE_SERVICE_KEY}` : null;
        if (authHeader !== expectedCron && authHeader !== expectedSvc) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
    }

    const db = getDb();
    let sent = 0;
    let failed = 0;

    try {
        const { data: due } = await db
            .from("scheduled_emails")
            .select("id, email_address, contact_name, template_key, sequence_key")
            .eq("status", "pending")
            .is("sent_at", null)
            .lte("scheduled_for", new Date().toISOString())
            .order("scheduled_for", { ascending: true })
            .limit(50);

        if (!due || due.length === 0) {
            return NextResponse.json({ success: true, sent: 0, message: "No due emails" });
        }

        for (const row of due) {
            const success = await dispatchScheduledEmail({
                templateKey: row.template_key,
                email: row.email_address,
                contactName: row.contact_name || "there",
            });

            if (success) {
                sent++;
                await db
                    .from("scheduled_emails")
                    .update({ sent_at: new Date().toISOString(), status: "sent" })
                    .eq("id", row.id);
            } else {
                failed++;
                // Mark failed but don't retry automatically — admin can re-queue
                await db
                    .from("scheduled_emails")
                    .update({
                        status: "failed",
                        failure_reason: "Dispatch returned false (template disabled or send error)",
                    })
                    .eq("id", row.id);
            }
        }

        return NextResponse.json({ success: true, processed: due.length, sent, failed });
    } catch (e) {
        console.error("process_scheduled_emails error:", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
