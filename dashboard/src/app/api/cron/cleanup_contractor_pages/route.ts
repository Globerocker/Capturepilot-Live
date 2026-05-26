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
    // Comma-prefix state agency shape: "HEALTH, WASHINGTON STATE DEPARTMENT OF"
    /,\s*(?:[A-Z'\s-]+\s+)?(?:STATE\s+)?DEPARTMENT\s+OF/i,
    // Military bases — they receive facility-service contracts but aren't
    // contractors themselves.
    /\bAIR FORCE BASE\b/i,
    /\bARMY (BASE|GARRISON|DEPOT|RESERVE)\b/i,
    /\bNAVAL (BASE|STATION|AIR STATION|SUPPORT ACTIVITY)\b/i,
    /\bMARINE CORPS BASE\b/i,
    /\bAFB\s+LODGING\b/i,
];

// US state names that prefix state-agency entries like
// "UTAH DEPARTMENT OF HEALTH AND HUMAN SERVICES".
const US_STATES = new Set([
    "ALABAMA","ALASKA","ARIZONA","ARKANSAS","CALIFORNIA","COLORADO","CONNECTICUT",
    "DELAWARE","FLORIDA","GEORGIA","HAWAII","IDAHO","ILLINOIS","INDIANA","IOWA",
    "KANSAS","KENTUCKY","LOUISIANA","MAINE","MARYLAND","MASSACHUSETTS","MICHIGAN",
    "MINNESOTA","MISSISSIPPI","MISSOURI","MONTANA","NEBRASKA","NEVADA","NEW",
    "NORTH","OHIO","OKLAHOMA","OREGON","PENNSYLVANIA","RHODE","SOUTH","TENNESSEE",
    "TEXAS","UTAH","VERMONT","VIRGINIA","WASHINGTON","WEST","WISCONSIN","WYOMING",
    "DISTRICT","PUERTO","COMMONWEALTH",
]);

function isStateAgency(name: string): boolean {
    // Catches "UTAH DEPARTMENT OF X", "NEW MEXICO DEPARTMENT OF X", etc.
    const tokens = name.trim().split(/\s+/);
    const first = (tokens[0] || "").toUpperCase().replace(/[.,]/g, "");
    if (US_STATES.has(first) && /\bDEPARTMENT\b/i.test(name)) return true;
    return false;
}

function isNonContractor(name: string): boolean {
    if (!name) return false;
    if (PATTERNS.some((re) => re.test(name))) return true;
    if (isStateAgency(name)) return true;
    return false;
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
