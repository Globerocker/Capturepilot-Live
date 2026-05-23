/**
 * Admin endpoint backing the /admin/crons dashboard.
 *
 * Returns:
 *   - recent: last 200 cron_runs rows
 *   - summary: per-route aggregate (last 7d) with success rate, avg/median ms,
 *     last_status, last_run, total_rows_out
 *
 * Admin-only (uses the same auth pattern as other /api/admin routes).
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

function getServiceClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

async function assertAdmin(): Promise<NextResponse | null> {
    const cookieStore = await cookies();
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() { return cookieStore.getAll(); },
                setAll() { /* read-only */ },
            },
        },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { data: profile } = await supabase
        .from("user_profiles")
        .select("account_type")
        .eq("user_id", user.id)
        .maybeSingle();
    if (profile?.account_type !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return null;
}

interface CronRunRow {
    id: string;
    route: string;
    started_at: string;
    finished_at: string | null;
    status: string | null;
    rows_in: number | null;
    rows_out: number | null;
    error_message: string | null;
    elapsed_ms: number | null;
}

interface RouteSummary {
    route: string;
    runs_7d: number;
    ok: number;
    error: number;
    partial: number;
    running: number;
    avg_ms: number | null;
    p50_ms: number | null;
    p95_ms: number | null;
    last_run: string | null;
    last_status: string | null;
    last_rows_out: number | null;
    total_rows_out_7d: number;
    last_error: string | null;
}

function pct(arr: number[], p: number): number | null {
    if (arr.length === 0) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.floor((sorted.length - 1) * p);
    return sorted[idx]!;
}

export async function GET() {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    const db = getServiceClient();
    const since = new Date(Date.now() - 7 * 86400_000).toISOString();

    // Recent 200 rows for the timeline view
    const { data: recent, error: recentErr } = await db
        .from("cron_runs")
        .select("id, route, started_at, finished_at, status, rows_in, rows_out, error_message, elapsed_ms")
        .order("started_at", { ascending: false })
        .limit(200);
    if (recentErr) return NextResponse.json({ error: recentErr.message }, { status: 500 });

    // Last 7d for per-route aggregates
    const { data: window7d, error: winErr } = await db
        .from("cron_runs")
        .select("route, status, rows_out, elapsed_ms, started_at, error_message")
        .gte("started_at", since)
        .limit(10000);
    if (winErr) return NextResponse.json({ error: winErr.message }, { status: 500 });

    // Per-route aggregate
    const perRoute = new Map<string, { rows: typeof window7d; latestRow: typeof window7d[number] | null }>();
    for (const r of window7d || []) {
        const entry = perRoute.get(r.route) || { rows: [], latestRow: null };
        entry.rows.push(r);
        if (!entry.latestRow || r.started_at > entry.latestRow.started_at) {
            entry.latestRow = r;
        }
        perRoute.set(r.route, entry);
    }

    const summary: RouteSummary[] = [];
    for (const [route, { rows, latestRow }] of perRoute) {
        const elapsed = rows.map(r => r.elapsed_ms).filter((v): v is number => typeof v === "number");
        const okCount = rows.filter(r => r.status === "ok").length;
        const errCount = rows.filter(r => r.status === "error").length;
        const partialCount = rows.filter(r => r.status === "partial").length;
        const runningCount = rows.filter(r => r.status === "running").length;
        const totalRowsOut = rows.reduce((acc, r) => acc + (r.rows_out || 0), 0);
        const lastError = rows.find(r => r.error_message)?.error_message || null;
        summary.push({
            route,
            runs_7d: rows.length,
            ok: okCount,
            error: errCount,
            partial: partialCount,
            running: runningCount,
            avg_ms: elapsed.length ? Math.round(elapsed.reduce((a, b) => a + b, 0) / elapsed.length) : null,
            p50_ms: pct(elapsed, 0.5),
            p95_ms: pct(elapsed, 0.95),
            last_run: latestRow?.started_at || null,
            last_status: latestRow?.status || null,
            last_rows_out: latestRow?.rows_out ?? null,
            total_rows_out_7d: totalRowsOut,
            last_error: lastError,
        });
    }
    summary.sort((a, b) => (b.last_run || "").localeCompare(a.last_run || ""));

    return NextResponse.json({
        summary,
        recent: recent as CronRunRow[],
        window_days: 7,
        generated_at: new Date().toISOString(),
    });
}
