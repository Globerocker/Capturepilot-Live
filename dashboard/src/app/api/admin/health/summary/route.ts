/**
 * GET /api/admin/health/summary
 *
 * One JSON blob that powers the /admin/health HUB page. Aggregates the live
 * state of every health category into compact KPI tiles so the hub doesn't
 * have to fan out to five separate endpoints on every 30-second refresh:
 *
 *   - crons:        last-run rollup per route → ok / amber / red / stale counts
 *   - queue:        worker_jobs status totals + last-hour throughput
 *   - integrations: api_connectors rows → configured / failing / rotation-due
 *   - database:     row counts + 24h failure pct from worker_jobs
 *   - storage:      bucket count + (cheap) total bucket count (no per-bucket walk)
 *   - alerts:       open / critical health_alerts counts
 *
 * Admin-only. Everything inside a single Promise.all so the round-trip is
 * one Supabase request shape — sub-200 ms on prod.
 */

import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";
import { daysUntilExpiry, EXPIRY_WARN_DAYS } from "@/lib/connectors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SbAny = SupabaseClient<any, any, any>;

interface CategoryKpi {
    /** Coarse health: green = all good, amber = degraded, red = something broken, unknown = no signal */
    status: "green" | "amber" | "red" | "unknown";
    /** Up to 3 short KPI numbers to render under the card title */
    kpis: Array<{ label: string; value: number | string; tone?: "ok" | "warn" | "error" }>;
    /** Optional short subtitle ("17 of 38 crons", "queue stuck", etc) */
    detail?: string;
}

interface HealthSummary {
    generated_at: string;
    overall: {
        status: "green" | "amber" | "red";
        /** Headline line for the hero (eg "32 of 38 crons green, 4 failing, 2 stuck jobs") */
        headline: string;
        green_count: number;
        amber_count: number;
        red_count: number;
    };
    crons: CategoryKpi;
    queue: CategoryKpi;
    integrations: CategoryKpi;
    database: CategoryKpi;
    storage: CategoryKpi;
    alerts: CategoryKpi;
}

async function safeCount(sb: SbAny, table: string, filt: Record<string, string> = {}): Promise<number> {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = sb.from(table).select("id", { count: "estimated", head: true });
        for (const [k, v] of Object.entries(filt)) {
            const dot = v.indexOf(".");
            const op = dot === -1 ? v : v.slice(0, dot);
            const val = dot === -1 ? "" : v.slice(dot + 1);
            if (op === "eq") q = q.eq(k, val);
            else if (op === "gte") q = q.gte(k, val);
            else if (op === "is" && val === "null") q = q.is(k, null);
            else if (op === "not.is" && val === "null") q = q.not(k, "is", null);
        }
        const { count } = await q;
        return count || 0;
    } catch {
        return 0;
    }
}

export async function GET() {
    const denied = await assertAdmin();
    if (denied) return denied;

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    const now = Date.now();
    const day = new Date(now - 86_400_000).toISOString();
    const week = new Date(now - 7 * 86_400_000).toISOString();
    const hour = new Date(now - 3_600_000).toISOString();

    // Run all roll-up queries concurrently so the hub stays under ~200 ms.
    const [
        cronRuns,
        wjPending, wjRunning, wjFailed24h, wjDone24h, wjDone1h,
        connectorRows,
        alertsOpen, alertsCritical,
        bucketsRes,
        oppsTotal, oppsActive,
    ] = await Promise.all([
        sb.from("cron_runs")
            .select("route, started_at, status")
            .gte("started_at", week)
            .order("started_at", { ascending: false })
            .limit(500),
        safeCount(sb, "worker_jobs", { status: "eq.pending" }),
        safeCount(sb, "worker_jobs", { status: "eq.running" }),
        safeCount(sb, "worker_jobs", { status: "eq.failed", finished_at: `gte.${day}` }),
        safeCount(sb, "worker_jobs", { status: "eq.done", finished_at: `gte.${day}` }),
        safeCount(sb, "worker_jobs", { status: "eq.done", finished_at: `gte.${hour}` }),
        sb.from("api_connectors")
            .select("slug, env_var_name, last_status, expires_at, consecutive_fails, enabled")
            .order("slug", { ascending: true }),
        // health_alerts uses `resolved_at IS NULL` for "open" (no status column)
        safeCount(sb, "health_alerts", { resolved_at: "is.null" }),
        safeCount(sb, "health_alerts", { resolved_at: "is.null", severity: "eq.critical" }),
        sb.storage.listBuckets(),
        safeCount(sb, "opportunities"),
        safeCount(sb, "opportunities", { is_archived: "eq.false" }),
    ]);

    // ── Crons rollup ────────────────────────────────────────────────────────
    type CronStat = { route: string; last_run: string; last_status: string | null };
    const byRoute = new Map<string, CronStat>();
    for (const r of ((cronRuns.data || []) as Array<{ route: string; started_at: string; status: string | null }>)) {
        if (!byRoute.has(r.route)) {
            byRoute.set(r.route, { route: r.route, last_run: r.started_at, last_status: r.status });
        }
    }
    let cronGreen = 0, cronAmber = 0, cronRed = 0;
    for (const c of byRoute.values()) {
        const stale = c.last_run && (now - new Date(c.last_run).getTime() > 86_400_000 * 2);
        if (stale) { cronRed++; continue; }
        if (c.last_status === "error") { cronAmber++; continue; }
        if (c.last_status === "ok") { cronGreen++; continue; }
        cronAmber++;
    }
    const cronTotal = byRoute.size;
    const cronStatus: CategoryKpi["status"] =
        cronTotal === 0 ? "unknown"
        : cronRed > 0 ? "red"
        : cronAmber > 0 ? "amber"
        : "green";
    const crons: CategoryKpi = {
        status: cronStatus,
        kpis: [
            { label: "Green", value: cronGreen, tone: "ok" },
            { label: "Failing", value: cronAmber, tone: cronAmber > 0 ? "warn" : undefined },
            { label: "Stale", value: cronRed, tone: cronRed > 0 ? "error" : undefined },
        ],
        detail: `${cronTotal} routes tracked (7d)`,
    };

    // ── Queue rollup ────────────────────────────────────────────────────────
    const queueStatus: CategoryKpi["status"] =
        wjRunning + wjPending + wjDone24h === 0 ? "unknown"
        : wjFailed24h > 100 || wjPending > 5000 ? "red"
        : wjFailed24h > 10 || wjPending > 1000 ? "amber"
        : "green";
    const queue: CategoryKpi = {
        status: queueStatus,
        kpis: [
            { label: "Pending", value: wjPending, tone: wjPending > 1000 ? "warn" : undefined },
            { label: "Running", value: wjRunning },
            { label: "Failed 24h", value: wjFailed24h, tone: wjFailed24h > 10 ? "error" : undefined },
        ],
        detail: `${wjDone1h} done in last hour · ${wjDone24h} in 24h`,
    };

    // ── Integrations rollup ─────────────────────────────────────────────────
    type ConnRow = { slug: string; env_var_name: string | null; last_status: string | null; expires_at: string | null; consecutive_fails: number | null; enabled: boolean };
    const conns = ((connectorRows.data || []) as ConnRow[]).filter(c => c.enabled !== false);
    let connConfigured = 0, connFailing = 0, connRotationDue = 0;
    for (const c of conns) {
        const configured = c.env_var_name ? !!process.env[c.env_var_name] : false;
        if (configured) connConfigured++;
        if (c.last_status === "error" || (c.consecutive_fails ?? 0) >= 3) connFailing++;
        const days = daysUntilExpiry(c.expires_at);
        if (days !== null && days <= EXPIRY_WARN_DAYS) connRotationDue++;
    }
    const intStatus: CategoryKpi["status"] =
        conns.length === 0 ? "unknown"
        : connFailing > 0 ? "red"
        : connRotationDue > 0 ? "amber"
        : "green";
    const integrations: CategoryKpi = {
        status: intStatus,
        kpis: [
            { label: "Configured", value: `${connConfigured}/${conns.length}`, tone: connConfigured === conns.length ? "ok" : "warn" },
            { label: "Failing", value: connFailing, tone: connFailing > 0 ? "error" : undefined },
            { label: "Rotate soon", value: connRotationDue, tone: connRotationDue > 0 ? "warn" : undefined },
        ],
        detail: `${conns.length} connectors registered`,
    };

    // ── Database rollup ─────────────────────────────────────────────────────
    const totalJob24h = wjDone24h + wjFailed24h;
    const failurePct = totalJob24h > 0 ? Math.round((wjFailed24h / totalJob24h) * 1000) / 10 : 0;
    const dbStatus: CategoryKpi["status"] =
        oppsTotal === 0 ? "unknown"
        : failurePct > 10 ? "red"
        : failurePct > 3 ? "amber"
        : "green";
    const database: CategoryKpi = {
        status: dbStatus,
        kpis: [
            { label: "Opps", value: oppsTotal >= 1000 ? `${(oppsTotal / 1000).toFixed(1)}k` : String(oppsTotal) },
            { label: "Active", value: oppsActive >= 1000 ? `${(oppsActive / 1000).toFixed(1)}k` : String(oppsActive), tone: "ok" },
            { label: "Job fail 24h", value: `${failurePct}%`, tone: failurePct > 3 ? "warn" : undefined },
        ],
        detail: "Tables, fill rates, ingestion velocity",
    };

    // ── Storage rollup ──────────────────────────────────────────────────────
    const buckets = bucketsRes.data || [];
    const publicBuckets = buckets.filter(b => b.public).length;
    const storage: CategoryKpi = {
        status: bucketsRes.error ? "red" : buckets.length === 0 ? "unknown" : "green",
        kpis: [
            { label: "Buckets", value: buckets.length },
            { label: "Public", value: publicBuckets, tone: publicBuckets > 0 ? "warn" : undefined },
            { label: "Private", value: buckets.length - publicBuckets, tone: "ok" },
        ],
        detail: bucketsRes.error ? bucketsRes.error.message : `Supabase Storage`,
    };

    // ── Alerts rollup ───────────────────────────────────────────────────────
    const alerts: CategoryKpi = {
        status: alertsCritical > 0 ? "red" : alertsOpen > 0 ? "amber" : "green",
        kpis: [
            { label: "Open", value: alertsOpen, tone: alertsOpen > 0 ? "warn" : "ok" },
            { label: "Critical", value: alertsCritical, tone: alertsCritical > 0 ? "error" : undefined },
        ],
        detail: alertsOpen === 0 ? "All clear" : `${alertsOpen} unresolved`,
    };

    // ── Overall rollup ──────────────────────────────────────────────────────
    const cats = [crons, queue, integrations, database, storage, alerts];
    const greenCount = cats.filter(c => c.status === "green").length;
    const amberCount = cats.filter(c => c.status === "amber").length;
    const redCount = cats.filter(c => c.status === "red").length;
    const overallStatus: "green" | "amber" | "red" =
        redCount > 0 ? "red" : amberCount > 0 ? "amber" : "green";

    const headlineParts: string[] = [];
    headlineParts.push(`${cronGreen}/${cronTotal} crons green`);
    if (cronAmber + cronRed > 0) headlineParts.push(`${cronAmber + cronRed} failing`);
    if (wjPending > 0) headlineParts.push(`${wjPending} jobs pending`);
    if (wjFailed24h > 0) headlineParts.push(`${wjFailed24h} jobs failed (24h)`);
    if (alertsOpen > 0) headlineParts.push(`${alertsOpen} open alerts`);
    const headline = headlineParts.join(" · ");

    const resp: HealthSummary = {
        generated_at: new Date().toISOString(),
        overall: { status: overallStatus, headline, green_count: greenCount, amber_count: amberCount, red_count: redCount },
        crons,
        queue,
        integrations,
        database,
        storage,
        alerts,
    };

    return NextResponse.json(resp, {
        headers: { "Cache-Control": "private, max-age=15" },
    });
}
