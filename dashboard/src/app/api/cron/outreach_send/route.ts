import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendOutreachEmail } from "@/lib/email";
import { guardCron } from "@/lib/cron-auth";

export const maxDuration = 300;

/**
 * Cron: advance outreach sequences + send the next scheduled step.
 *
 * Schedule: daily 14:00 UTC (10am ET, sensible business hour).
 *
 * Flow per run:
 *   1. For approved prospects with primary_email and no sequence state yet,
 *      seed step 0 (intro) with scheduled_for = now.
 *   2. For prospects with step 0 sent_at and no step 1, schedule step 1
 *      for sent_at + 3 days.
 *   3. For prospects with step 1 sent_at and no step 2, schedule step 2
 *      for sent_at + 7 days after step 1.
 *   4. Send any scheduled rows whose scheduled_for <= now, capped at
 *      `daily_cap` per run (defaults to 50 to ramp sender reputation).
 *   5. Honor the opt-out list — if prospect's email is in outreach_optouts,
 *      flip the prospect status and cancel remaining steps.
 *   6. Skip send if the prospect already replied or bounced.
 */
export async function GET(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    const dailyCap = Math.min(200, parseInt(req.nextUrl.searchParams.get("cap") || "50", 10));

    // ---- 1) Seed step 0 for newly-approved-and-enriched prospects ---------
    const { data: toSeed } = await admin
        .from("outreach_prospects")
        .select("id, primary_email")
        .eq("status", "approved")
        .not("primary_email", "is", null)
        .limit(200);

    const seedIds = ((toSeed || []) as Array<{ id: string; primary_email: string }>).map(r => r.id);
    if (seedIds.length > 0) {
        // Find which already have a step 0 row.
        const { data: existingStep0 } = await admin
            .from("outreach_sequence_state")
            .select("prospect_id")
            .in("prospect_id", seedIds)
            .eq("step_index", 0);
        const hasSeed = new Set((existingStep0 || []).map((r: { prospect_id: string }) => r.prospect_id));
        const toInsert = seedIds.filter(id => !hasSeed.has(id)).map(id => ({
            prospect_id: id,
            step_index: 0,
            template_key: "outreach_intro",
            status: "scheduled" as const,
            scheduled_for: new Date().toISOString(),
        }));
        if (toInsert.length > 0) {
            await admin.from("outreach_sequence_state").insert(toInsert);
        }
    }

    // ---- 2 & 3) Schedule follow-ups for anyone who received the prior step
    for (const { fromStep, toStep, delayDays, templateKey } of [
        { fromStep: 0, toStep: 1, delayDays: 3, templateKey: "outreach_followup" },
        { fromStep: 1, toStep: 2, delayDays: 7, templateKey: "outreach_final" },
    ]) {
        const { data: sentRows } = await admin
            .from("outreach_sequence_state")
            .select("prospect_id, sent_at")
            .eq("step_index", fromStep)
            .eq("status", "sent")
            .limit(500);
        const sentList = (sentRows || []) as Array<{ prospect_id: string; sent_at: string }>;
        if (sentList.length === 0) continue;

        const { data: existingNext } = await admin
            .from("outreach_sequence_state")
            .select("prospect_id")
            .in("prospect_id", sentList.map(r => r.prospect_id))
            .eq("step_index", toStep);
        const hasNext = new Set((existingNext || []).map((r: { prospect_id: string }) => r.prospect_id));

        const nextInserts = sentList
            .filter(r => !hasNext.has(r.prospect_id))
            .map(r => ({
                prospect_id: r.prospect_id,
                step_index: toStep,
                template_key: templateKey,
                status: "scheduled" as const,
                scheduled_for: new Date(new Date(r.sent_at).getTime() + delayDays * 86400_000).toISOString(),
            }));
        if (nextInserts.length > 0) await admin.from("outreach_sequence_state").insert(nextInserts);
    }

    // ---- 4) Send any scheduled rows that are due, up to dailyCap ---------
    const { data: dueRows } = await admin
        .from("outreach_sequence_state")
        .select("id, prospect_id, step_index, template_key, scheduled_for")
        .eq("status", "scheduled")
        .lte("scheduled_for", new Date().toISOString())
        .order("scheduled_for", { ascending: true })
        .limit(dailyCap);

    const due = (dueRows || []) as Array<{ id: string; prospect_id: string; step_index: number; template_key: string; scheduled_for: string }>;
    if (due.length === 0) {
        return NextResponse.json({ seeded: seedIds.length, sent: 0, skipped: 0 });
    }

    // Load prospects + opt-out map in one shot.
    const prospectIds = [...new Set(due.map(r => r.prospect_id))];
    const { data: prospects } = await admin
        .from("outreach_prospects")
        .select("id, company_name, primary_email, primary_name, status, unsubscribe_token")
        .in("id", prospectIds);
    const prospectMap = new Map(
        ((prospects || []) as Array<{ id: string; company_name: string; primary_email: string | null; primary_name: string | null; status: string; unsubscribe_token: string }>)
            .map(p => [p.id, p] as const),
    );

    const allEmails = [...prospectMap.values()].map(p => (p.primary_email || "").toLowerCase()).filter(Boolean);
    const { data: optouts } = await admin.from("outreach_optouts").select("email").in("email", allEmails);
    const optoutSet = new Set(((optouts || []) as Array<{ email: string }>).map(r => r.email.toLowerCase()));

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.capturepilot.com";

    const stats = { seeded: seedIds.length, sent: 0, skipped: 0, errors: 0 };

    for (const row of due) {
        const p = prospectMap.get(row.prospect_id);
        if (!p) { stats.errors++; continue; }

        // Guardrails — never send if prospect is no longer approved, is on
        // the opt-out list, already replied, or lacks an email.
        const email = (p.primary_email || "").toLowerCase();
        if (!email) { await markStep(admin, row.id, "skipped", "no email"); stats.skipped++; continue; }
        if (p.status !== "approved" && p.status !== "sent") {
            await markStep(admin, row.id, "skipped", `prospect status ${p.status}`);
            stats.skipped++; continue;
        }
        if (optoutSet.has(email)) {
            await markStep(admin, row.id, "skipped", "opted out");
            await admin.from("outreach_prospects").update({ status: "opted_out" }).eq("id", p.id);
            stats.skipped++; continue;
        }

        const unsubscribeUrl = `${appUrl}/api/outreach/unsubscribe?token=${p.unsubscribe_token}`;
        try {
            const ok = await sendOutreachEmail(p.primary_email!, {
                companyName: p.company_name,
                recipientName: p.primary_name,
                step: row.step_index as 0 | 1 | 2,
                unsubscribeUrl,
            });
            if (ok) {
                await admin.from("outreach_sequence_state")
                    .update({ status: "sent", sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
                    .eq("id", row.id);
                // Mark prospect as 'sent' on the FIRST send so it shows up in the Sent tab.
                if (row.step_index === 0 && p.status === "approved") {
                    await admin.from("outreach_prospects").update({ status: "sent" }).eq("id", p.id);
                }
                stats.sent++;
            } else {
                await markStep(admin, row.id, "failed", "send returned false (template disabled?)");
                stats.errors++;
            }
        } catch (e) {
            await markStep(admin, row.id, "failed", (e as Error).message);
            stats.errors++;
        }
    }

    return NextResponse.json(stats);
}

// Intentionally typed as `any` for the supabase client — the generic types
// from @supabase/supabase-js vary by version and don't add safety here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function markStep(admin: any, id: string, status: "skipped" | "failed", msg: string): Promise<void> {
    await admin.from("outreach_sequence_state")
        .update({ status, error_msg: msg, updated_at: new Date().toISOString() })
        .eq("id", id);
}
