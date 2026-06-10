import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { guardCron } from "@/lib/cron-auth";
import { withCronTelemetry } from "@/lib/cron-telemetry";
import {
    buildWarmupEmail,
    getRemainingWarmupCapacity,
    getTodaysWarmupRow,
    getWarmupPeerList,
    incrementWarmupActual,
    shouldSendWarmupBatch,
} from "@/lib/email-warmup";

export const maxDuration = 60;

const FROM_EMAIL = process.env.WARMUP_FROM_EMAIL
    || process.env.FROM_EMAIL
    || "CapturePilot <noreply@capturepilot.com>";

// Per-tick batch ceiling. The cron runs every 30 min during business hours
// (12 ticks/day in our schedule); 60 emails/tick lets a 1000/day target
// finish comfortably with headroom for skipped ticks.
const TICK_BATCH_CAP = 60;

/**
 * Email warmup send cron (R3-M5.2).
 *
 * Schedule: every 30 min during business hours (12:00, 12:30, ..., 22:00 UTC,
 * 5 days/week — set in `vercel.json`).
 *
 * Flow per tick:
 *   1. Guard secret check.
 *   2. Read today's row from `email_warmup_schedule`. If missing / paused
 *      / no peer list / no Resend key → no-op.
 *   3. If we're already past 80 % of today's target → no-op (stops one
 *      tick from over-shooting).
 *   4. Compute batch size: min(remaining capacity, TICK_BATCH_CAP).
 *   5. Iterate the peer list round-robin, sending varied subject + body
 *      from `buildWarmupEmail(seed)`. Each send is a single-recipient call
 *      so Resend's delivery report stays clean.
 *   6. Bump `actual_volume` once at the end with the successful count.
 */
async function GET_handler(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;

    const row = await getTodaysWarmupRow();
    if (!row) {
        return NextResponse.json({ skipped: "no_schedule_row_for_today", sent: 0 });
    }
    if (row.paused) {
        return NextResponse.json({ skipped: "paused", sent: 0, target: row.target_volume, actual: row.actual_volume });
    }

    const should = await shouldSendWarmupBatch();
    if (!should) {
        return NextResponse.json({
            skipped: "already_at_or_above_80pct_of_target",
            sent: 0,
            target: row.target_volume,
            actual: row.actual_volume,
        });
    }

    const peers = getWarmupPeerList();
    if (peers.length === 0) {
        return NextResponse.json({
            skipped: "no_peer_addresses_configured",
            sent: 0,
            note: "Set WARMUP_PEER_ADDRESSES env var (comma-separated list).",
        });
    }

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
        return NextResponse.json({ skipped: "no_resend_key", sent: 0 });
    }

    const remaining = await getRemainingWarmupCapacity();
    const batchSize = Math.min(remaining, TICK_BATCH_CAP);
    if (batchSize <= 0) {
        return NextResponse.json({ skipped: "no_remaining_capacity", sent: 0 });
    }

    const resend = new Resend(resendKey);
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < batchSize; i++) {
        const peer = peers[i % peers.length];
        // Mix in the i index AND a timestamp slice so consecutive ticks get
        // different fingerprints even when the same peer slot is reused.
        const seed = (Date.now() + i * 37) & 0xffff;
        const { subject, html, text } = buildWarmupEmail(seed);
        try {
            await resend.emails.send({
                from: FROM_EMAIL,
                to: peer,
                subject,
                html,
                text,
            });
            sent++;
        } catch (e) {
            failed++;
            if (errors.length < 3) errors.push((e as Error).message);
        }
    }

    if (sent > 0) {
        await incrementWarmupActual(sent);
    }

    return NextResponse.json({
        sent,
        failed,
        batch_size: batchSize,
        target: row.target_volume,
        actual_before: row.actual_volume,
        actual_after: row.actual_volume + sent,
        peer_count: peers.length,
        errors: errors.length > 0 ? errors : undefined,
    });
}

export const GET = withCronTelemetry("/api/cron/email_warmup_send", GET_handler);
