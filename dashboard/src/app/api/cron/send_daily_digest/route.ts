/**
 * Cron: daily ops digest email (8 AM UTC).
 *
 * Sends a single email summarizing the last 24h of the platform so the
 * operator has a pulse-check without opening /admin/db-health every day.
 *
 * Sections (each one liner):
 *   - Ingestion: new opps, new contractors, new contractor pages
 *   - Enrichment: emails added, contractor pages enriched, attachments processed
 *   - Queue: done / failed in 24h + failure rate
 *   - Alerts: any health_alerts fired in 24h
 *   - Stale crons: any cron whose last run is > 2× its expected interval
 *
 * Idempotent: re-running the cron same day just re-sends the same digest.
 * Recipient: HEALTH_ALERT_EMAIL (defaults to info@fillcart.de) — same one
 * health_monitor uses; the daily digest piggy-backs that pipeline.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { guardCron } from "@/lib/cron-auth";
import { emailTemplate, contentCard, paragraph, sectionLabel, APP_URL, COLORS } from "@/lib/email-template";

export const runtime = "nodejs";
export const maxDuration = 60;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SbAny = SupabaseClient<any, any, any>;

async function n(sb: SbAny, table: string, filt: Record<string, string> = {}): Promise<number> {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = sb.from(table).select("id", { count: "estimated", head: true });
        for (const [k, v] of Object.entries(filt)) {
            const dot = v.indexOf(".");
            const op = dot === -1 ? v : v.slice(0, dot);
            const val = dot === -1 ? "" : v.slice(dot + 1);
            if (op === "eq") q = q.eq(k, val);
            else if (op === "gte") q = q.gte(k, val);
        }
        const { count } = await q;
        return count || 0;
    } catch { return 0; }
}

function row(label: string, value: string | number, tone: "ok" | "info" | "warn" = "info"): string {
    const valueColor = tone === "warn" ? "#dc2626" : tone === "ok" ? "#15803d" : COLORS.black;
    return `
        <tr>
            <td style="padding:8px 0;border-bottom:1px solid ${COLORS.stone200};">
                <span style="font-size:13px;color:${COLORS.stone600};">${label}</span>
                <span style="float:right;font-size:14px;font-weight:700;color:${valueColor};font-variant-numeric:tabular-nums;">${value}</span>
            </td>
        </tr>
    `;
}

export async function GET(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [
        oppsToday, contractorsToday, pagesToday, attachmentsToday,
        wjDone, wjFailed, alertsToday,
    ] = await Promise.all([
        n(sb, "opportunities", { created_at: `gte.${yesterday}` }),
        n(sb, "contractors", { created_at: `gte.${yesterday}` }),
        n(sb, "contractor_profile_pages", { published_at: `gte.${yesterday}` }),
        n(sb, "opportunity_attachments", { downloaded_at: `gte.${yesterday}` }),
        n(sb, "worker_jobs", { status: "eq.done", finished_at: `gte.${yesterday}` }),
        n(sb, "worker_jobs", { status: "eq.failed", finished_at: `gte.${yesterday}` }),
        n(sb, "health_alerts", { created_at: `gte.${yesterday}` }),
    ]);
    const wjTotal = wjDone + wjFailed;
    const failurePct = wjTotal > 0 ? Math.round((wjFailed / wjTotal) * 1000) / 10 : 0;

    // Stale crons — any cron whose last_run < (now - 2× expected interval)
    const { data: cronRows } = await sb
        .from("cron_runs")
        .select("route, started_at, status")
        .order("started_at", { ascending: false })
        .limit(200);
    const lastByRoute = new Map<string, Date>();
    for (const r of (cronRows || []) as Array<{ route: string; started_at: string }>) {
        if (!lastByRoute.has(r.route)) lastByRoute.set(r.route, new Date(r.started_at));
    }
    const staleCount = [...lastByRoute.entries()].filter(([, dt]) => {
        return Date.now() - dt.getTime() > 26 * 60 * 60 * 1000;
    }).length;

    const subject = `CapturePilot daily digest — +${oppsToday} opps, +${contractorsToday} contractors`;

    const body = `
        ${paragraph(`Last 24h on the platform. Open <a href="${APP_URL}/admin/db-health" style="color:${COLORS.emerald600};">/admin/db-health</a> for the full live view.`)}
        ${contentCard(`
            ${sectionLabel("Ingestion")}
            <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:6px;">
                <tbody>
                    ${row("New opportunities", oppsToday)}
                    ${row("New contractors", contractorsToday)}
                    ${row("New contractor pages", pagesToday)}
                    ${row("Attachments processed", attachmentsToday)}
                </tbody>
            </table>
        `)}
        ${contentCard(`
            ${sectionLabel("Worker queue (24h)")}
            <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:6px;">
                <tbody>
                    ${row("Done", wjDone, "ok")}
                    ${row("Failed", wjFailed, wjFailed > 0 ? "warn" : "info")}
                    ${row("Failure rate", `${failurePct}%`, failurePct > 20 ? "warn" : failurePct < 5 ? "ok" : "info")}
                </tbody>
            </table>
        `)}
        ${contentCard(`
            ${sectionLabel("Health")}
            <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:6px;">
                <tbody>
                    ${row("Alerts fired", alertsToday, alertsToday > 0 ? "warn" : "ok")}
                    ${row("Stale crons", staleCount, staleCount > 0 ? "warn" : "ok")}
                </tbody>
            </table>
        `)}
    `;

    const html = emailTemplate({
        category: "transactional",
        preheader: subject,
        eyebrow: "Daily Ops Digest",
        heading: subject,
        body,
        cta: { label: "Open /admin/db-health", url: `${APP_URL}/admin/db-health` },
    });

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return NextResponse.json({ ok: false, error: "RESEND_API_KEY missing" }, { status: 500 });
    // HEALTH_ALERT_EMAIL supports comma-separated list (set via Vercel env)
    // so additional recipients land without code changes.
    const recipientsRaw = process.env.HEALTH_ALERT_EMAIL || "info@fillcart.de,info@americurial.com";
    const to = recipientsRaw.split(",").map(s => s.trim()).filter(Boolean);
    const from = process.env.HEALTH_ALERT_FROM || "CapturePilot Ops <alerts@capturepilot.com>";

    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
        from, to, subject, html,
        replyTo: "andre@capturepilot.com",
    });
    if (error) return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });

    // Slack mirror — same payload as health-digest fires (sendSlackDigest)
    if (process.env.SLACK_WEBHOOK_URL) {
        const text = `:bar_chart: *CapturePilot daily digest*\n`
            + `• Opps +${oppsToday} · Contractors +${contractorsToday} · Pages +${pagesToday}\n`
            + `• Queue 24h: ${wjDone} done · ${wjFailed} failed (${failurePct}%)\n`
            + `• Alerts: ${alertsToday} · Stale crons: ${staleCount}\n`
            + `<${APP_URL}/admin/db-health|Open /admin/db-health>`;
        await fetch(process.env.SLACK_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
            signal: AbortSignal.timeout(5_000),
        }).catch(() => {});
    }

    return NextResponse.json({
        ok: true,
        sent_to: to,
        snapshot: { oppsToday, contractorsToday, pagesToday, attachmentsToday, wjDone, wjFailed, failurePct, alertsToday, staleCount },
    });
}
