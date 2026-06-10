/**
 * POST /api/admin/outreach/suppression/bulk-import
 * Body: { csv: string, reason?: string, source?: string }
 *
 * Parse a CSV of emails (one per line, header optional). Upserts every row
 * into outreach_optouts. Returns a per-row tally.
 *
 * The CSV can also be a plain newline-separated list — anything that doesn't
 * smell like an email address is skipped.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ImportBody {
    csv?: string;
    reason?: string;
    source?: string;
}

function db() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );
}

const EMAIL_RX = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

export async function POST(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    const body = (await req.json().catch(() => null)) as ImportBody | null;
    if (!body?.csv || typeof body.csv !== "string") {
        return NextResponse.json({ error: "csv body required" }, { status: 400 });
    }

    // Pull every email-looking substring out of the payload. This means a CSV
    // like "Acme, john@acme.com, x" still works without parsing column shapes.
    const matches = body.csv.match(EMAIL_RX) || [];
    const uniques = [...new Set(matches.map(e => e.toLowerCase().trim()))];
    if (uniques.length === 0) {
        return NextResponse.json({ inserted: 0, skipped: 0, total: 0, message: "No valid emails found" });
    }

    const reason = body.reason?.trim() || "Bulk import";
    const source = body.source?.trim() || "admin_bulk_import";

    const rows = uniques.map(email => ({
        email,
        reason,
        source,
    }));

    // Chunk into batches of 500 to keep payloads sane
    let inserted = 0;
    const errors: string[] = [];
    for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error, count } = await db()
            .from("outreach_optouts")
            .upsert(chunk, { onConflict: "email", count: "exact" });
        if (error) errors.push(error.message);
        else inserted += count || chunk.length;
    }

    return NextResponse.json({
        inserted,
        total: uniques.length,
        skipped: uniques.length - inserted,
        errors: errors.length > 0 ? errors : undefined,
    });
}
