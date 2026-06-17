/**
 * Outreach auto-tune — the "learn on the fly" loop.
 *
 * Weekly (driven by the orchestrator), for each ACTIVE campaign it reads the
 * open rate by send-hour over the last 21 days and shifts the campaign's send
 * window toward the hours that actually get opened — so sending concentrates on
 * the best-performing times without anyone touching it. Conservative: only acts
 * with enough volume, never narrows the window below 4 hours, and records every
 * change in outreach_settings('autotune_log') so it's auditable.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";

export const runtime = "nodejs";
/* eslint-disable @typescript-eslint/no-explicit-any */

const MIN_SENDS_PER_HOUR = 8;   // need signal before trusting an hour
const MIN_TOTAL_SENDS = 60;     // need signal before touching anything
const MIN_WINDOW_HOURS = 4;

export async function GET(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, { auth: { persistSession: false } });

    const since = new Date(Date.now() - 21 * 86_400_000).toISOString();
    const { data: campaigns } = await db.from("outreach_campaigns").select("id, name, throttle, status").eq("status", "active");
    const changes: any[] = [];

    for (const c of (campaigns || []) as any[]) {
        const { data: runs } = await db.from("outreach_campaign_step_runs")
            .select("sent_at, opened_at, campaign_contact:outreach_campaign_contacts!inner(campaign_id)")
            .eq("campaign_contact.campaign_id", c.id).eq("status", "sent").gte("sent_at", since).limit(20000);
        const rows = (runs || []) as any[];
        if (rows.length < MIN_TOTAL_SENDS) { changes.push({ campaign: c.name, skipped: `only ${rows.length} sends` }); continue; }

        const byHour: Record<number, { sent: number; opens: number }> = {};
        for (const r of rows) {
            if (!r.sent_at) continue;
            const h = new Date(r.sent_at).getUTCHours();
            byHour[h] = byHour[h] || { sent: 0, opens: 0 };
            byHour[h].sent++; if (r.opened_at) byHour[h].opens++;
        }
        const hours = Object.entries(byHour)
            .filter(([, v]) => v.sent >= MIN_SENDS_PER_HOUR)
            .map(([h, v]) => ({ h: +h, rate: v.opens / v.sent }));
        if (hours.length < 2) { changes.push({ campaign: c.name, skipped: "not enough hourly signal" }); continue; }

        const avg = hours.reduce((s, x) => s + x.rate, 0) / hours.length;
        // Keep hours at/above average; span them into a window (min 4h wide).
        const good = hours.filter(x => x.rate >= avg).map(x => x.h).sort((a, b) => a - b);
        let lo = good[0], hi = good[good.length - 1] + 1;
        if (hi - lo < MIN_WINDOW_HOURS) { const mid = Math.floor((lo + hi) / 2); lo = Math.max(0, mid - 2); hi = Math.min(24, lo + MIN_WINDOW_HOURS); }
        lo = Math.max(0, lo); hi = Math.min(24, hi);

        const prev = c.throttle || {};
        if (prev.send_window_start === lo && prev.send_window_end === hi) { changes.push({ campaign: c.name, unchanged: `${lo}-${hi}` }); continue; }
        const throttle = { ...prev, send_window_start: lo, send_window_end: hi, timezone: prev.timezone || "America/New_York" };
        await db.from("outreach_campaigns").update({ throttle }).eq("id", c.id);
        changes.push({ campaign: c.name, from: `${prev.send_window_start ?? "?"}-${prev.send_window_end ?? "?"}`, to: `${lo}-${hi}`, best_hour: hours.sort((a, b) => b.rate - a.rate)[0].h, avg_open: Math.round(avg * 100) + "%" });
    }

    // Audit log (keep last 30 entries).
    try {
        const { data: logRow } = await db.from("outreach_settings").select("value").eq("key", "autotune_log").maybeSingle();
        const log = Array.isArray((logRow?.value as any)?.entries) ? (logRow!.value as any).entries : [];
        log.unshift({ at: new Date().toISOString(), changes });
        await db.from("outreach_settings").upsert({ key: "autotune_log", value: { entries: log.slice(0, 30) } }, { onConflict: "key" });
    } catch { /* non-fatal */ }

    return NextResponse.json({ ok: true, campaigns: (campaigns || []).length, changes });
}
