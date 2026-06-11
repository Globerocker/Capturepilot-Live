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
// Fix: cron_runs telemetry coverage — wrap handler so /admin/health stale-cron
// detector and daily digest can see this route. Previously only 5 of 35 crons
// were logging to cron_runs.
import { withCronTelemetry } from "@/lib/cron-telemetry";

export const runtime = "nodejs";
export const maxDuration = 60;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SbAny = SupabaseClient<any, any, any>;

/**
 * Count helper. Uses `count: "exact"` (was "estimated") because Postgres'
 * autovacuum stats can lag and `reltuples` returned 0 for the digest's
 * `created_at >= yesterday` filter — that's why the morning email said
 * "0 new opportunities" for 3 days straight. Exact counts are slow on
 * unindexed columns, so migration 099 adds the matching indexes.
 *
 * Errors now log to console.error instead of silently returning 0 — any
 * future "0 everything" digest is now a visible Vercel log line we can debug.
 */
async function n(sb: SbAny, table: string, filt: Record<string, string> = {}): Promise<number> {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = sb.from(table).select("id", { count: "exact", head: true });
        for (const [k, v] of Object.entries(filt)) {
            const dot = v.indexOf(".");
            const op = dot === -1 ? v : v.slice(0, dot);
            const val = dot === -1 ? "" : v.slice(dot + 1);
            if (op === "eq") q = q.eq(k, val);
            else if (op === "gte") q = q.gte(k, val);
        }
        const { count, error } = await q;
        if (error) {
            console.error(`[digest] count failed for ${table}`, { filt, error: error.message });
            return 0;
        }
        return count || 0;
    } catch (e) {
        console.error(`[digest] count threw for ${table}`, { filt, error: (e as Error).message });
        return 0;
    }
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
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

async function GET_handler(req: NextRequest): Promise<NextResponse> {
    const denied = guardCron(req);
    if (denied) return denied;

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [
        oppsToday, oppsFederal, oppsSled, oppsGrant,
        contractorsToday, pagesToday, attachmentsToday,
        wjDone, wjFailed, alertsToday,
        blSent, blOpened, blClicked, blBounced, blReplied,
    ] = await Promise.all([
        n(sb, "opportunities", { created_at: `gte.${yesterday}` }),
        n(sb, "opportunities", { source: "eq.sam", created_at: `gte.${yesterday}` }),
        n(sb, "opportunities", { source: "eq.sled", created_at: `gte.${yesterday}` }),
        n(sb, "opportunities", { source: "eq.grants", created_at: `gte.${yesterday}` }),
        n(sb, "contractors", { created_at: `gte.${yesterday}` }),
        n(sb, "contractor_profile_pages", { published_at: `gte.${yesterday}` }),
        n(sb, "opportunity_attachments", { downloaded_at: `gte.${yesterday}` }),
        n(sb, "worker_jobs", { status: "eq.done", finished_at: `gte.${yesterday}` }),
        n(sb, "worker_jobs", { status: "eq.failed", finished_at: `gte.${yesterday}` }),
        n(sb, "health_alerts", { created_at: `gte.${yesterday}` }),
        n(sb, "backlink_outreach", { sent_at: `gte.${yesterday}` }),
        n(sb, "backlink_outreach", { opened_at: `gte.${yesterday}` }),
        n(sb, "backlink_outreach", { clicked_at: `gte.${yesterday}` }),
        n(sb, "backlink_outreach", { bounced_at: `gte.${yesterday}` }),
        n(sb, "backlink_outreach", { replied_at: `gte.${yesterday}` }),
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

    // ─── Auto-healer activity (last 24h) ────────────────────────────────────
    // Pulled from alert_autofixes (migration 098). Two buckets:
    //   - "fixed"     → silently resolved, mention as count + 1-line summary
    //   - "escalated" → recipe couldn't fix → list each one as a TODO for the operator
    // dismissed_at IS NULL filter added 2026-06-11 (migration 162) — without it,
    // the digest repeats the same 23 orchestrator-auth stale alerts every morning
    // long after the root cause was fixed in commit 4321551e.
    const { data: autofixesRaw } = await sb
        .from("alert_autofixes")
        .select("status, recipe_slug, action_taken, connector_slug")
        .gte("created_at", yesterday)
        .is("dismissed_at", null)
        .order("created_at", { ascending: false })
        .limit(100);
    type AutofixRow = { status: string; recipe_slug: string; action_taken: string; connector_slug: string | null };
    const autofixes = (autofixesRaw || []) as AutofixRow[];
    const autoFixed = autofixes.filter(a => a.status === "fixed");
    const escalated = autofixes.filter(a => a.status === "escalated" || a.status === "no_recipe" || a.status === "error");

    // De-dupe escalations by recipe_slug+connector so we don't repeat the same
    // "Apollo expired" 12 times if it tripped every hour.
    const seen = new Set<string>();
    const uniqueEscalations = escalated.filter(a => {
        const k = `${a.recipe_slug}:${a.connector_slug || ""}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });

    // ─── Smart skip + quiet-day floor ──────────────────────────────────────
    // Fix: silent-platform blind spot — original smart-skip swallowed days where
    // ingestion was 0 but that IS the news (SAM down, all crons stalled, etc).
    // Three force-send overrides ensure we hear about quiet failures:
    //   1. staleCount > 5            → many crons haven't logged in 24h
    //   2. lastByRoute.size < HALF   → more than half of expected routes silent
    //   3. platformPulse === 0       → zero opportunities inserted in 24h
    // When any override fires, we still send (a "silent platform" digest) so
    // the operator sees the staleCount table inlined and knows to investigate.
    //
    // EXPECTED_ROUTES is the rough count of scheduled cron routes from
    // vercel.json (35 in CRON.md). Halved → 17. Using a hard number avoids
    // a second DB roundtrip; if we drift far from 35 the override still
    // catches the egregious case (e.g. only 5 routes logged in 24h).
    const EXPECTED_ROUTES = 35;
    const tooManyStale = staleCount > 5;
    const tooFewRoutesLogged = lastByRoute.size < Math.floor(EXPECTED_ROUTES / 2);
    // Platform pulse: opportunities-inserted-in-24h is the canonical
    // "is anything happening" signal (covers all ingestion sources).
    const platformPulse = oppsToday;
    const silentPlatform = platformPulse === 0;
    const forceSend = tooManyStale || tooFewRoutesLogged || silentPlatform;

    const isQuietDay =
        !forceSend &&
        oppsToday === 0 && contractorsToday === 0 && pagesToday === 0 &&
        wjDone === 0 && wjFailed === 0 &&
        uniqueEscalations.length === 0 && staleCount === 0 &&
        blSent === 0;
    if (isQuietDay) {
        return NextResponse.json({
            ok: true,
            skipped: "quiet_day",
            snapshot: { oppsToday, contractorsToday, pagesToday, wjDone, wjFailed, autoFixed: autoFixed.length, escalations: uniqueEscalations.length },
        });
    }

    // Build a stale-route detail block we inline when the silent-platform
    // overrides fire — gives the operator the names of the missing routes,
    // not just a count.
    const staleRoutes = [...lastByRoute.entries()]
        .filter(([, dt]) => Date.now() - dt.getTime() > 26 * 60 * 60 * 1000)
        .map(([route, dt]) => ({ route, hoursAgo: Math.round((Date.now() - dt.getTime()) / 3_600_000) }))
        .sort((a, b) => b.hoursAgo - a.hoursAgo)
        .slice(0, 20);

    // Subject prioritization: silent-platform alarm > escalations > normal.
    // The silent-platform subject is intentionally loud — a 0-opps day with
    // half the crons missing is the kind of thing that should jump the inbox.
    const subject = silentPlatform || tooManyStale || tooFewRoutesLogged
        ? `[Silent platform] CapturePilot digest — 0 opps in 24h${tooManyStale ? `, ${staleCount} stale crons` : ""}${tooFewRoutesLogged ? `, only ${lastByRoute.size}/${EXPECTED_ROUTES} routes logged` : ""}`
        : uniqueEscalations.length > 0
        ? `[Action needed] CapturePilot digest — ${uniqueEscalations.length} item${uniqueEscalations.length === 1 ? "" : "s"} for you · +${oppsToday} opps`
        : `CapturePilot daily digest — +${oppsToday} opps, +${contractorsToday} contractors`;

    const body = `
        ${paragraph(`Last 24h on the platform. Open <a href="${APP_URL}/admin/db-health" style="color:${COLORS.emerald600};">/admin/db-health</a> for the full live view.`)}
        ${!forceSend ? "" : contentCard(`
            ${sectionLabel("Silent-platform alarm")}
            <div style="margin-top:8px;padding:10px 12px;background:#fef2f2;border-left:3px solid #dc2626;border-radius:4px;font-size:13px;color:#7f1d1d;line-height:1.5;">
                ${silentPlatform ? "<div><strong>Zero opportunities</strong> inserted in the last 24h — ingestion is silent.</div>" : ""}
                ${tooManyStale ? `<div><strong>${staleCount} stale crons</strong> (no run in &gt;26h).</div>` : ""}
                ${tooFewRoutesLogged ? `<div>Only <strong>${lastByRoute.size}/${EXPECTED_ROUTES}</strong> cron routes logged a run in the last 24h.</div>` : ""}
            </div>
            ${staleRoutes.length === 0 ? "" : `
                <div style="margin-top:10px;font-size:12px;color:${COLORS.stone600};">Stalest routes:</div>
                <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:4px;">
                    <tbody>
                        ${staleRoutes.map(r => row(escapeHtml(r.route), `${r.hoursAgo}h ago`, "warn")).join("")}
                    </tbody>
                </table>
            `}
        `)}
        ${contentCard(`
            ${sectionLabel("Ingestion (last 24h)")}
            <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:6px;">
                <tbody>
                    ${row("New opportunities", oppsToday, oppsToday > 0 ? "ok" : "warn")}
                    ${row("&nbsp;&nbsp;— Federal (SAM)", oppsFederal)}
                    ${row("&nbsp;&nbsp;— State/Local (SLED)", oppsSled, oppsSled > 0 ? "ok" : "info")}
                    ${row("&nbsp;&nbsp;— Grants", oppsGrant)}
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
                    ${row("Auto-healed", autoFixed.length, autoFixed.length > 0 ? "ok" : "info")}
                    ${row("Stale crons", staleCount, staleCount > 0 ? "warn" : "ok")}
                </tbody>
            </table>
        `)}
        ${blSent === 0 ? "" : contentCard(`
            ${sectionLabel("Backlink outreach (24h)")}
            <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:6px;">
                <tbody>
                    ${row("Sent", blSent, "ok")}
                    ${row("Opened", `${blOpened} (${blSent > 0 ? Math.round(blOpened / blSent * 100) : 0}%)`, blOpened > 0 ? "ok" : "info")}
                    ${row("Clicked", `${blClicked} (${blSent > 0 ? Math.round(blClicked / blSent * 100) : 0}%)`, blClicked > 0 ? "ok" : "info")}
                    ${row("Replied", blReplied, blReplied > 0 ? "ok" : "info")}
                    ${row("Bounced", blBounced, blBounced > 0 ? "warn" : "info")}
                </tbody>
            </table>
        `)}
        ${uniqueEscalations.length === 0 ? "" : contentCard(`
            ${sectionLabel(`Needs your attention (${uniqueEscalations.length})`)}
            <div style="margin-top:8px;">
                ${uniqueEscalations.map(a => `
                    <div style="padding:10px 12px;margin-bottom:6px;background:#fef3c7;border-left:3px solid #d97706;border-radius:4px;">
                        <div style="font-size:13px;font-weight:600;color:#78350f;">${escapeHtml(a.connector_slug || a.recipe_slug)}</div>
                        <div style="font-size:12px;color:#78350f;margin-top:3px;line-height:1.5;">${escapeHtml(a.action_taken)}</div>
                    </div>
                `).join("")}
            </div>
        `)}
        ${autoFixed.length === 0 ? "" : contentCard(`
            ${sectionLabel(`Auto-healed (${autoFixed.length}) — no action needed`)}
            <div style="margin-top:8px;font-size:12px;color:${COLORS.stone600};line-height:1.6;">
                ${autoFixed.slice(0, 5).map(a => `· <strong>${escapeHtml(a.connector_slug || a.recipe_slug)}:</strong> ${escapeHtml(a.action_taken.slice(0, 140))}`).join("<br>")}
                ${autoFixed.length > 5 ? `<br><em>… and ${autoFixed.length - 5} more</em>` : ""}
            </div>
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

    // Slack mirror — same payload as health-digest fires (sendSlackDigest).
    // Prepends a :rotating_light: line when the silent-platform alarm fires
    // so Slack pings match the email subject's urgency.
    if (process.env.SLACK_WEBHOOK_URL) {
        const alarmLine = forceSend
            ? `:rotating_light: *Silent platform* — ${[silentPlatform ? "0 opps/24h" : null, tooManyStale ? `${staleCount} stale crons` : null, tooFewRoutesLogged ? `only ${lastByRoute.size}/${EXPECTED_ROUTES} routes logged` : null].filter(Boolean).join(" · ")}\n`
            : "";
        const text = `${alarmLine}:bar_chart: *CapturePilot daily digest*\n`
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
        force_send: forceSend,
        silent_platform: silentPlatform,
        too_many_stale: tooManyStale,
        too_few_routes_logged: tooFewRoutesLogged,
        routes_logged: lastByRoute.size,
        expected_routes: EXPECTED_ROUTES,
        snapshot: { oppsToday, contractorsToday, pagesToday, attachmentsToday, wjDone, wjFailed, failurePct, alertsToday, staleCount },
    });
}

export const GET = withCronTelemetry("/api/cron/send_daily_digest", GET_handler);
