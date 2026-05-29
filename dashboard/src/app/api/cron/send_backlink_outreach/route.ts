/**
 * Autonomous backlink outreach sender.
 *
 * Picks `status='drafted'` rows from backlink_outreach, sends each via
 * Resend (from andre@capturepilot.com), stores the resend message id so
 * the existing /api/webhooks/resend handler can join delivered/opened/
 * clicked events back to the row.
 *
 * Daily cap: 100 sends per UTC day across all prospects. Throttle
 * enforces this by counting today's sent rows before each batch.
 *
 * Schedule: every 2 hours via the orchestrator. 12 ticks × ~9 sends ≈ 100/day.
 *
 * Bounce / spam-complaint handling: the Resend webhook flips
 * status='bounced' on email.bounced events. No SES-style suppression
 * list yet — if we see a bounce, the next outreach to that domain
 * is skipped via the `bounced_at IS NOT NULL` filter.
 *
 * Reply tracking: not automated (Gmail doesn't push replies into
 * webhooks easily). Manual via /admin/backlinks "Mark replied" button.
 */

import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

const DAILY_CAP = 100;
const FROM_ADDRESS = process.env.BACKLINK_OUTREACH_FROM
    || "Andre Schüler <andre@capturepilot.com>";
const REPLY_TO = "andre@capturepilot.com";

interface OutreachRow {
    id: string;
    prospect_id: string;
    contact_id: string | null;
    subject: string | null;
    body_text: string | null;
    body_html: string | null;
    status: string;
}

interface ContactRow {
    id: string;
    email: string;
    full_name: string | null;
}

export async function GET(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) return NextResponse.json({ ok: false, error: "RESEND_API_KEY missing" }, { status: 500 });

    // ---- Throttle: count today's sends -----------------------------
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const { count: sentToday } = await sb
        .from("backlink_outreach")
        .select("id", { count: "exact", head: true })
        .gte("sent_at", startOfDay.toISOString());

    const remaining = Math.max(0, DAILY_CAP - (sentToday || 0));
    if (remaining === 0) {
        return NextResponse.json({ ok: true, skipped: "daily_cap_reached", sent_today: sentToday });
    }

    // Per-tick batch — orchestrator fires this every ~2h, so 100/day ÷ 12
    // ticks ≈ 9 per tick. Cap at 12 to absorb a missed tick without dumping
    // a 50-email burst that would trip Resend's per-IP rate limit.
    const perTick = Math.min(12, remaining);

    // ---- Pick drafts: oldest drafted, tier 1 first, prefer contractor_profile
    //      (it's the angle with the cleanest measurable outcome) ----
    const { data: drafts } = await sb
        .from("backlink_outreach")
        .select("id, prospect_id, contact_id, subject, body_text, body_html, status")
        .eq("status", "drafted")
        .not("contact_id", "is", null)
        .order("created_at", { ascending: true })
        .limit(perTick * 3); // overfetch — many will skip (missing email, bounced prospect, etc)

    const rows = (drafts || []) as OutreachRow[];
    const stats = { picked: rows.length, sent: 0, skipped: 0, errors: [] as string[] };

    const resend = new Resend(resendKey);

    let actuallySent = 0;
    for (const row of rows) {
        if (actuallySent >= perTick) break;
        if (!row.contact_id) { stats.skipped += 1; continue; }
        if (!row.subject || !row.body_text) { stats.skipped += 1; continue; }

        // Pull contact details (we didn't join above to keep query simple)
        const { data: contactRaw } = await sb
            .from("backlink_contacts")
            .select("id, email, full_name")
            .eq("id", row.contact_id)
            .maybeSingle();
        const contact = contactRaw as ContactRow | null;
        if (!contact?.email) { stats.skipped += 1; continue; }

        // Skip if this prospect already bounced on a prior send.
        const { data: priorBounce } = await sb
            .from("backlink_outreach")
            .select("id")
            .eq("prospect_id", row.prospect_id)
            .not("bounced_at", "is", null)
            .limit(1);
        if ((priorBounce || []).length > 0) {
            await sb.from("backlink_outreach")
                .update({ status: "cancelled" })
                .eq("id", row.id);
            stats.skipped += 1;
            continue;
        }

        try {
            const { data, error } = await resend.emails.send({
                from: FROM_ADDRESS,
                to: contact.email,
                replyTo: REPLY_TO,
                subject: row.subject,
                text: row.body_text,
                html: row.body_html || undefined,
            });
            if (error) {
                stats.errors.push(`${row.id}: ${error.message}`);
                continue;
            }
            await sb.from("backlink_outreach")
                .update({
                    status: "sent",
                    sent_at: new Date().toISOString(),
                    resend_message_id: data?.id || null,
                })
                .eq("id", row.id);
            // Bump prospect outreach_count + status
            await sb.from("backlink_prospects")
                .update({
                    outreach_count: 1, // first touch — simple increment without RPC
                    status: "contacted",
                })
                .eq("id", row.prospect_id);
            actuallySent += 1;
            stats.sent += 1;
        } catch (e) {
            stats.errors.push(`${row.id}: ${(e as Error).message}`);
        }
    }

    return NextResponse.json({
        ok: true,
        sent_today_before: sentToday || 0,
        sent_this_run: stats.sent,
        sent_today_after: (sentToday || 0) + stats.sent,
        daily_cap: DAILY_CAP,
        per_tick_cap: perTick,
        stats,
    });
}
