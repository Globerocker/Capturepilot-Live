/**
 * One-off cleanup endpoint for contractor_profile_pages.
 *
 * Removes profile rows that shouldn't have been published in the first
 * place — foreign governments, US federal agencies, military commands.
 * The publish endpoint now filters these out at the source via the
 * NON_CONTRACTOR_PATTERNS list, but rows that slipped in during earlier
 * runs need a delete.
 *
 * Idempotent. Safe to call repeatedly. ?dry_run=true to preview.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

// Keep in sync with NON_CONTRACTOR_PATTERNS in publish_contractor_pages.
const PATTERNS: RegExp[] = [
    /^MINISTRY OF /i,
    /^GOVERNMENT OF /i,
    /^REPUBLIC OF /i,
    /^EMBASSY OF /i,
    /\bFOREIGN MILITARY SALES?\b/i,
    /^(AIR FORCE|ARMY|NAVY|MARINE CORPS|MARINES|COAST GUARD|SPACE FORCE)\b.*\bDEPARTMENT\b/i,
    /^DEPARTMENT OF (?!.*\bDEFENSE INC|.*LLC|.*CORP)/i,
    /\bUNITED STATES DEPARTMENT\b/i,
    /\bDEFENSE LOGISTICS AGENCY\b/i,
    /\bUS ARMY CORPS OF ENGINEERS\b/i,
    /\bNATIONAL (GUARD|RECONNAISSANCE|SECURITY) /i,
];

function isNonContractor(name: string): boolean {
    return PATTERNS.some((re) => re.test(name));
}

export async function GET(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;

    const dryRun = req.nextUrl.searchParams.get("dry_run") === "true";
    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    // Pull ALL published rows (the table is ~1K rows so a single pull works).
    const { data, error } = await sb
        .from("contractor_profile_pages")
        .select("id, slug, business_name, claim_email")
        .eq("is_published", true)
        .limit(10000);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    type Row = { id: string; slug: string; business_name: string; claim_email: string | null };
    const rows = (data || []) as Row[];

    // Only delete rows that match a non-contractor pattern AND haven't been
    // claimed (claim_email is null). Claimed profiles are off-limits.
    const toDelete = rows.filter((r) => isNonContractor(r.business_name) && !r.claim_email);

    if (dryRun) {
        return NextResponse.json({
            ok: true,
            dry_run: true,
            scanned: rows.length,
            would_delete: toDelete.length,
            sample: toDelete.slice(0, 20).map((r) => ({ slug: r.slug, name: r.business_name })),
        });
    }

    if (toDelete.length === 0) {
        return NextResponse.json({ ok: true, scanned: rows.length, deleted: 0, note: "no matches" });
    }

    const ids = toDelete.map((r) => r.id);
    const { error: delErr } = await sb.from("contractor_profile_pages").delete().in("id", ids);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

    return NextResponse.json({
        ok: true,
        scanned: rows.length,
        deleted: toDelete.length,
        sample: toDelete.slice(0, 10).map((r) => r.business_name),
    });
}
