import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";
import { extractContacts } from "@/lib/extract-contacts";

export const runtime = "nodejs";
// Bumped from 60s — the original timed out at the default cap with 2000-row
// batches because every UPDATE was a separate roundtrip. We now parallelize
// (Promise.all of 25 at a time) which keeps a 2k batch comfortably under
// 300s even on the slowest US-west pooled connection.
export const maxDuration = 300;

/**
 * POST /api/admin/backfill-extracted-contacts
 *
 * Body (optional JSON):
 *   { limit?: number = 500, only_null?: boolean = true }
 *
 * Walks `opportunities` and runs the regex extractor over `description` to
 * populate `extracted_emails`, `extracted_phones`, `extracted_urls`. With
 * `only_null=true` (default) it skips rows already extracted — safe to run
 * repeatedly until the punch-list returns 0.
 *
 * Designed for one-shot backfills after migration 076 ships. After that the
 * ingest_rss cron extracts at insert time so this endpoint should rarely
 * find work on new rows.
 */
export async function POST(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const limit = Math.min(Math.max(Number(body.limit) || 500, 1), 5000);
    const onlyNull = body.only_null !== false;

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    // Pull a batch. We deliberately don't .limit() the whole table because
    // even 5k rows × ~1KB descriptions is comfortable inside the 60s budget.
    let query = sb
        .from("opportunities")
        .select("id, description")
        .not("description", "is", null)
        .limit(limit);
    if (onlyNull) {
        query = query.is("extracted_at", null);
    }

    const { data: rows, error } = await query;
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    type Row = { id: string; description: string | null };
    const targets = (rows || []) as Row[];

    let updated = 0;
    let withEmail = 0;
    let withPhone = 0;
    let withUrl = 0;
    const now = new Date().toISOString();

    // Parallelize updates in chunks of 25 — keeps Supabase's pooled
    // connection happy while finishing a 2k-row batch in ~15s instead of
    // 80s. We still update one row at a time (`eq('id', row.id)`) so a
    // bad row only fails its own write.
    const CONCURRENCY = 25;
    for (let i = 0; i < targets.length; i += CONCURRENCY) {
        const slice = targets.slice(i, i + CONCURRENCY);
        await Promise.all(slice.map(async (r) => {
            const ex = extractContacts(r.description || "");
            const hasAny = ex.emails.length || ex.phones.length || ex.urls.length;
            if (ex.emails.length) withEmail++;
            if (ex.phones.length) withPhone++;
            if (ex.urls.length) withUrl++;
            const { error: upErr } = await sb
                .from("opportunities")
                .update({
                    extracted_emails: ex.emails.length ? ex.emails : null,
                    extracted_phones: ex.phones.length ? ex.phones : null,
                    extracted_urls: ex.urls.length ? ex.urls : null,
                    extracted_at: now,
                })
                .eq("id", r.id);
            if (upErr) {
                console.warn("[backfill-extracted] update failed", r.id, upErr.message);
                return;
            }
            if (hasAny) updated++;
        }));
    }

    return NextResponse.json({
        ok: true,
        scanned: targets.length,
        rows_with_extracted_contacts: updated,
        with_email: withEmail,
        with_phone: withPhone,
        with_url: withUrl,
        note: onlyNull ? "skipped already-extracted rows" : "re-extracted all matching rows",
    });
}
