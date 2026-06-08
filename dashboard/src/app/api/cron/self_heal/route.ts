/**
 * Self-heal cron — walks unresolved health_alerts every 30min and applies
 * recipes from lib/health-autoheal.ts.
 *
 * Why a separate cron from health_monitor:
 *   - health_monitor runs hourly to probe connectors; self_heal runs at :30
 *     to react to whatever health_monitor wrote at :00
 *   - keeps probe latency low (don't want healing logic delaying probes)
 *   - lets us deploy autohealer changes without touching the probe path
 *
 * The cron has no side effects beyond the alert_autofixes audit log + setting
 * resolved_at on health_alerts. Email lives in the morning digest only.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";
import { autoHealAlert, type HealthAlertRow } from "@/lib/health-autoheal";
// Fix: cron_runs telemetry coverage — wrap handler so /admin/health stale-cron
// detector and daily digest can see this route. Previously only 5 of 35 crons
// were logging to cron_runs.
import { withCronTelemetry } from "@/lib/cron-telemetry";

export const runtime = "nodejs";
export const maxDuration = 60;

async function GET_handler(req: NextRequest): Promise<NextResponse> {
    const denied = guardCron(req);
    if (denied) return denied;

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    // Only look at recent unresolved alerts. Anything older than 7 days
    // without resolution is operator's problem — surfacing it daily is noise.
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { data, error } = await sb
        .from("health_alerts")
        .select("id, connector_slug, alert_type, severity, title, detail, payload, fired_at")
        .is("resolved_at", null)
        .gte("fired_at", since)
        .order("fired_at", { ascending: true })
        .limit(50);

    if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const alerts = (data || []) as HealthAlertRow[];
    const stats = { processed: 0, fixed: 0, escalated: 0, no_recipe: 0, error: 0 };
    const results: Array<{ alert_id: string; slug: string | null; status: string; action: string }> = [];

    for (const alert of alerts) {
        const result = await autoHealAlert(alert, sb);
        stats.processed += 1;
        stats[result.status as keyof typeof stats] = (stats[result.status as keyof typeof stats] || 0) + 1;
        results.push({
            alert_id: alert.id,
            slug: alert.connector_slug,
            status: result.status,
            action: result.action_taken,
        });
    }

    return NextResponse.json({ ok: true, stats, results });
}

export const GET = withCronTelemetry("/api/cron/self_heal", GET_handler);
