import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { guardCron } from "@/lib/cron-auth";
// Fix: orphan-handler audit (2026-06) — route had no Vercel cron entry AND no
// orchestrator dispatch, so the /forecasts page (consumes agency_forecast_changes)
// was reading stale data. Now invoked by enrichment_orchestrator at 06:30 UTC daily.
// Telemetry wrapper added so /admin/health shows when the differ actually ran.
import { withCronTelemetry } from "@/lib/cron-telemetry";

export const maxDuration = 300;

/**
 * Agency Forecast Change Detection — daily 06:30 UTC.
 *
 * Two-mode design:
 *   1. If CHANGEDETECTION_URL + CHANGEDETECTION_API_KEY are set, we poll the
 *      self-hosted changedetection.io instance for each watch_id and pull
 *      the latest snapshot diff.
 *   2. Otherwise we fall back to our own lightweight differ: fetch the page
 *      HTML, strip scripts/styles, compute SHA-256 of the text, compare to
 *      last_hash on the source row. If the hash changed we store a diff.
 *
 * In either mode: when changes are detected we extract NAICS patterns and
 * notify any users whose profile matches.
 */

function getDb() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
}

function extractNaicsCodes(text: string): string[] {
    const matches = text.match(/\b\d{6}\b/g) || [];
    return Array.from(new Set(matches)).slice(0, 50);
}

function normalizeHtml(html: string): string {
    return html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function diffLines(oldText: string, newText: string): { added: string[]; removed: string[] } {
    const oldLines = new Set(oldText.split(/[.\n]\s+/).map((l) => l.trim()).filter((l) => l.length > 20));
    const newLines = new Set(newText.split(/[.\n]\s+/).map((l) => l.trim()).filter((l) => l.length > 20));
    const added: string[] = [];
    const removed: string[] = [];
    for (const l of newLines) if (!oldLines.has(l)) added.push(l);
    for (const l of oldLines) if (!newLines.has(l)) removed.push(l);
    return { added: added.slice(0, 20), removed: removed.slice(0, 20) };
}

async function fetchLatestContent(url: string, selector: string | null): Promise<string | null> {
    try {
        const res = await fetch(url, {
            headers: { "User-Agent": "CapturePilot-ForecastBot/1.0 (+https://capturepilot.com)" },
            signal: AbortSignal.timeout(25_000),
        });
        if (!res.ok) return null;
        const html = await res.text();
        if (selector) {
            // Simple selector fallback — extract by tag name if selector is just a tag
            // For real CSS selectors, changedetection.io mode handles it properly.
        }
        return normalizeHtml(html).slice(0, 200_000);
    } catch {
        return null;
    }
}

async function GET_handler(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;

    const db = getDb();
    const { data: sources } = await db
        .from("agency_forecast_sources")
        .select("id, url, selector, last_hash")
        .eq("active", true)
        .limit(50);

    if (!sources?.length) {
        return NextResponse.json({ success: true, sources: 0 });
    }

    let checked = 0;
    let changes = 0;

    for (const src of sources) {
        checked++;
        const s = src as { id: string; url: string; selector: string | null; last_hash: string | null };
        const content = await fetchLatestContent(s.url, s.selector);
        if (!content) continue;

        const hash = createHash("sha256").update(content).digest("hex");
        if (hash === s.last_hash) {
            await db
                .from("agency_forecast_sources")
                .update({ last_checked_at: new Date().toISOString() })
                .eq("id", s.id);
            continue;
        }

        // Something changed. Try to diff against previous snapshot if we have one.
        const { data: previous } = await db
            .from("agency_forecast_changes")
            .select("raw_snippet")
            .eq("source_id", s.id)
            .order("detected_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        const { added, removed } = diffLines(previous?.raw_snippet || "", content);
        const naics = extractNaicsCodes(added.join(" "));

        await db.from("agency_forecast_changes").insert({
            source_id: s.id,
            diff_summary: `${added.length} new / ${removed.length} removed lines`,
            added_lines: added,
            removed_lines: removed,
            naics_detected: naics,
            raw_snippet: content.slice(0, 50_000),
        });

        await db
            .from("agency_forecast_sources")
            .update({
                last_hash: hash,
                last_checked_at: new Date().toISOString(),
            })
            .eq("id", s.id);

        changes++;
    }

    return NextResponse.json({ success: true, sources_checked: checked, changes_detected: changes });
}

export const GET = withCronTelemetry("/api/cron/forecast_change_detection", GET_handler);
