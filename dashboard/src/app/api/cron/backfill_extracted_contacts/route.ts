import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";
import { extractContacts } from "@/lib/extract-contacts";
import { extractRichFields } from "@/lib/extract-rich-fields";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Cron-auth twin of /api/admin/backfill-extracted-contacts.
 *
 * Same logic, but accepts CRON_SECRET bearer auth so it can be triggered
 * from the terminal (vercel CLI) without needing an admin session cookie.
 * Useful for one-shot bulk backfills after migration 076 lands. Not
 * scheduled in vercel.json — operator triggers explicitly.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        "https://app.capturepilot.com/api/cron/backfill_extracted_contacts?limit=2000"
 */
export async function GET(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;

    const url = new URL(req.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || "2000"), 1), 5000);
    const onlyNull = url.searchParams.get("only_null") !== "false";

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

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
    const CONCURRENCY = 25;

    for (let i = 0; i < targets.length; i += CONCURRENCY) {
        const slice = targets.slice(i, i + CONCURRENCY);
        await Promise.all(slice.map(async (r) => {
            const ex = extractContacts(r.description || "");
            const rich = extractRichFields(r.description || "");
            const hasAny = ex.emails.length || ex.phones.length || ex.urls.length
                || rich.estimated_value_max !== null || rich.opportunity_class !== null
                || rich.government_offices.length > 0;
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
                    estimated_value_min: rich.estimated_value_min,
                    estimated_value_max: rich.estimated_value_max,
                    estimated_value_text: rich.estimated_value_text,
                    is_subcontract: rich.is_subcontract,
                    opportunity_class: rich.opportunity_class,
                    extracted_offices: rich.government_offices.length ? rich.government_offices : null,
                })
                .eq("id", r.id);
            if (upErr) {
                console.warn("[backfill-extracted-cron] update failed", r.id, upErr.message);
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
