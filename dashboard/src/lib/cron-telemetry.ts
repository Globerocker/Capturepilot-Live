/**
 * Wraps every cron handler with a `cron_runs` audit row.
 *
 * Usage in a route:
 *   export const GET = withCronTelemetry("/api/cron/ingest_x", async (req) => {
 *       // ... cron body, return NextResponse.json({ ... rowsIn, rowsOut, ... })
 *   });
 *
 * The helper:
 *   1. Inserts a row at start of run (status=running)
 *   2. Wraps the handler in try/catch
 *   3. On success: pulls `rows_in` / `rows_out` from response body if present,
 *      writes status=ok, elapsed_ms, full payload
 *   4. On error: writes status=error + stack/message
 *   5. On timeout via maxDuration: not catchable here — but the started_at
 *      with no finished_at lets us detect orphans (status=running for >5min
 *      = effectively timed out).
 *
 * Authentication: still handled by the route — we just augment the response.
 * The helper itself uses SUPABASE_SERVICE_KEY for the telemetry insert so
 * it works even when the cron is hit unauthenticated (we still log the 401).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type CronHandler = (req: NextRequest) => Promise<NextResponse>;

function telemetryClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

function extractRowCounts(body: Record<string, unknown>): { in: number | null; out: number | null } {
    // Common field names crons emit. Picks the first present.
    const inKeys = ["processed", "fetched", "polled", "considered", "rowsIn", "rows_in"];
    const outKeys = [
        "inserted", "upserted", "written", "enriched", "updated",
        "rowsOut", "rows_out", "total_inserted", "total_upserted",
    ];
    const pick = (keys: string[]): number | null => {
        for (const k of keys) {
            const v = body[k];
            if (typeof v === "number" && Number.isFinite(v)) return v;
        }
        return null;
    };
    return { in: pick(inKeys), out: pick(outKeys) };
}

export function withCronTelemetry(route: string, handler: CronHandler): CronHandler {
    return async (req: NextRequest) => {
        const db = telemetryClient();
        const startedAt = new Date();
        const t0 = Date.now();

        // Best-effort insert — never block the cron if telemetry fails.
        let runId: string | null = null;
        try {
            const { data } = await db
                .from("cron_runs")
                .insert({
                    route,
                    started_at: startedAt.toISOString(),
                    status: "running",
                })
                .select("id")
                .single();
            runId = data?.id ?? null;
        } catch { /* swallow */ }

        let response: NextResponse;
        let errorMessage: string | null = null;
        let status: "ok" | "error" | "partial" = "ok";

        try {
            response = await handler(req);
        } catch (err) {
            const e = err instanceof Error ? err : new Error(String(err));
            errorMessage = `${e.name}: ${e.message}`;
            status = "error";
            response = NextResponse.json({ error: errorMessage }, { status: 500 });
        }

        // Best-effort parse of the response body (stays in memory, then we re-emit it).
        let parsed: Record<string, unknown> = {};
        try {
            const cloned = response.clone();
            parsed = await cloned.json();
        } catch { /* response wasn't JSON; that's fine */ }

        if (status === "ok") {
            if (response.status >= 500) status = "error";
            else if (response.status >= 400) status = "partial";
            else if (parsed.errors && Array.isArray(parsed.errors) && (parsed.errors as unknown[]).length > 0) {
                status = "partial";
            }
        }
        if (status !== "ok" && !errorMessage && parsed.error) {
            errorMessage = String(parsed.error).slice(0, 500);
        }

        const counts = extractRowCounts(parsed);
        const elapsed = Date.now() - t0;

        if (runId) {
            try {
                await db
                    .from("cron_runs")
                    .update({
                        finished_at: new Date().toISOString(),
                        status,
                        rows_in: counts.in,
                        rows_out: counts.out,
                        error_message: errorMessage,
                        payload: parsed,
                        elapsed_ms: elapsed,
                    })
                    .eq("id", runId);
            } catch { /* swallow */ }
        }

        // Slack alert when this run failed AND the previous run failed.
        // One isolated 500 is usually a transient upstream blip (SAM throttle,
        // GovTribe MCP disconnect). Two-in-a-row almost always means we need
        // human attention. Fire-and-forget so we never block the cron return.
        if (status === "error" && process.env.SLACK_CRON_ALERT_WEBHOOK) {
            void alertOnConsecutiveError(db, route, errorMessage, elapsed);
        }

        return response;
    };
}

async function alertOnConsecutiveError(
    db: ReturnType<typeof telemetryClient>,
    route: string,
    errorMessage: string | null,
    elapsedMs: number,
): Promise<void> {
    try {
        // Look at the prior run for this route (excluding the one we just wrote
        // — order by started_at DESC, skip the most recent which is ours).
        const { data } = await db
            .from("cron_runs")
            .select("status, started_at, error_message")
            .eq("route", route)
            .order("started_at", { ascending: false })
            .limit(2);
        const rows = (data || []) as Array<{ status: string; started_at: string; error_message: string | null }>;
        // rows[0] is the run we just logged, rows[1] is the previous one.
        const previous = rows[1];
        if (!previous || previous.status !== "error") return; // only two-in-a-row triggers
        const webhook = process.env.SLACK_CRON_ALERT_WEBHOOK!;
        const text =
            `:rotating_light: *Cron failing twice in a row* — \`${route}\`\n` +
            `Last error: ${(errorMessage || "no message").slice(0, 240)}\n` +
            `Previous error: ${(previous.error_message || "no message").slice(0, 240)}\n` +
            `Latest run elapsed: ${elapsedMs} ms · previous started ${previous.started_at}`;
        await fetch(webhook, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
            signal: AbortSignal.timeout(5000),
        });
    } catch {
        // swallow — alerting must never break the cron
    }
}
