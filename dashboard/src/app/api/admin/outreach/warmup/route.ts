import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/auth-admin";
import {
    getTodaysWarmupRow,
    getWarmupHistory,
    getWarmupPeerList,
    isWarmupPaused,
    setWarmupPaused,
} from "@/lib/email-warmup";

/**
 * GET /api/admin/outreach/warmup
 *
 * Returns the warmup status block for the admin Outreach > Settings tab:
 *   - today's target + actual + paused flag
 *   - 30-day history (for the chart)
 *   - peer list size (so admins can see WARMUP_PEER_ADDRESSES is set)
 */
export async function GET(_req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    const [today, history] = await Promise.all([
        getTodaysWarmupRow(),
        getWarmupHistory(30),
    ]);
    const paused = await isWarmupPaused();
    const peerCount = getWarmupPeerList().length;

    return NextResponse.json({
        today: today
            ? {
                date: today.schedule_date,
                target: today.target_volume,
                actual: today.actual_volume,
                paused: today.paused,
            }
            : null,
        history: history.map(r => ({
            date: r.schedule_date,
            target: r.target_volume,
            actual: r.actual_volume,
            paused: r.paused,
        })),
        paused,
        peer_count: peerCount,
        peer_env_var: "WARMUP_PEER_ADDRESSES",
    });
}

/**
 * POST /api/admin/outreach/warmup
 * Body: { paused: boolean }
 *
 * Flips the pause flag for every future schedule row. Useful when running
 * deliverability tests or pausing during a domain rotation.
 */
export async function POST(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    const body = await req.json().catch(() => ({}));
    const paused = body?.paused === true;

    await setWarmupPaused(paused);

    return NextResponse.json({ ok: true, paused });
}
