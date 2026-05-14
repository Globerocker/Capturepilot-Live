import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 30;

/**
 * One-shot SAM.gov diagnostic. Hits SAM with the production env key and
 * returns the full upstream response (status, headers, body sample) so we
 * can see whether the issue is auth, quota, or genuinely empty data.
 *
 * GET /api/admin/sam-debug                  → 7-day window, ptype=o
 * GET /api/admin/sam-debug?days=14&ptype=r  → custom
 *
 * Service-key bearer required. Never logs the SAM key.
 */
export async function GET(req: NextRequest) {
    const auth = req.headers.get("authorization");
    const expected = process.env.SUPABASE_SERVICE_KEY ? `Bearer ${process.env.SUPABASE_SERVICE_KEY}` : null;
    if (expected && auth !== expected) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const key = process.env.SAM_API_KEY;
    if (!key) return NextResponse.json({ error: "SAM_API_KEY missing on this deployment" }, { status: 500 });

    const days = Math.max(1, Math.min(60, parseInt(req.nextUrl.searchParams.get("days") || "7", 10)));
    const ptype = req.nextUrl.searchParams.get("ptype") || "o";

    const toDate = new Date();
    const fromDate = new Date(toDate.getTime() - days * 86400_000);
    const fromStr = `${String(fromDate.getMonth() + 1).padStart(2, "0")}/${String(fromDate.getDate()).padStart(2, "0")}/${fromDate.getFullYear()}`;
    const toStr   = `${String(toDate.getMonth() + 1).padStart(2, "0")}/${String(toDate.getDate()).padStart(2, "0")}/${toDate.getFullYear()}`;

    const url = `https://api.sam.gov/opportunities/v2/search?postedFrom=${fromStr}&postedTo=${toStr}&limit=5&offset=0&ptype=${ptype}`;
    const t0 = Date.now();

    const res = await fetch(url, {
        headers: { "X-Api-Key": key },
        signal: AbortSignal.timeout(20_000),
    });

    const elapsed_ms = Date.now() - t0;
    const headers: Record<string, string> = {};
    for (const [k, v] of res.headers.entries()) {
        const lk = k.toLowerCase();
        // Skip cookie / cdn noise; surface anything quota-related.
        if (lk.startsWith("x-ratelimit") || lk.startsWith("x-quota") || lk === "content-type" || lk === "retry-after") {
            headers[k] = v;
        }
    }
    const text = await res.text();
    let bodyParsed: unknown = null;
    try { bodyParsed = JSON.parse(text); } catch { /* not json */ }

    const summary: Record<string, unknown> = {
        url_called: url,
        sam_key_length: key.length,
        sam_key_prefix: key.slice(0, 6),
        from: fromStr,
        to: toStr,
        ptype,
        status: res.status,
        status_text: res.statusText,
        elapsed_ms,
        response_headers: headers,
        body_first_500: text.slice(0, 500),
    };
    if (bodyParsed && typeof bodyParsed === "object") {
        const b = bodyParsed as Record<string, unknown>;
        summary.totalRecords = b.totalRecords ?? null;
        summary.opportunitiesData_length = Array.isArray(b.opportunitiesData) ? b.opportunitiesData.length : null;
        summary.first_notice = Array.isArray(b.opportunitiesData) && b.opportunitiesData.length
            ? (b.opportunitiesData[0] as Record<string, unknown>).title
            : null;
    }

    // Persist the summary to internal_config so callers without direct
    // Vercel-log access can read it back via PostgREST.
    try {
        const sb = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_KEY!,
            { auth: { persistSession: false } },
        );
        await sb.from("internal_config").upsert(
            {
                key: "sam_debug_last_response",
                value: JSON.stringify({ ...summary, captured_at: new Date().toISOString() }),
                updated_at: new Date().toISOString(),
            },
            { onConflict: "key" },
        );
    } catch (e) {
        summary.persist_error = e instanceof Error ? e.message : "unknown";
    }

    return NextResponse.json(summary);
}
