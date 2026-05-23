import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";

export const maxDuration = 300;

/**
 * Daily Saved-Search alert cron.
 *
 * For each saved_search where alert_enabled = true:
 *   1. Re-apply the persisted filter against opportunities posted since
 *      the last alert (or last 24h if no prior alert)
 *   2. If there's at least one new match, send the owner an email and
 *      update last_alert_at + new_match_count
 *
 * Runs at 09:00 UTC. Add to vercel.json:
 *   { "path": "/api/cron/saved_search_alerts", "schedule": "0 9 * * *" }
 */

function svc() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

interface SavedSearchRow {
    id: string;
    user_profile_id: string;
    name: string;
    filters: Record<string, unknown>;
    last_alert_at: string | null;
}

interface OppRow {
    id: string;
    notice_id: string;
    title: string | null;
    agency: string | null;
    response_deadline: string | null;
    posted_date: string | null;
    naics_code: string | null;
}

/**
 * Translate the saved filter blob into Supabase query filters. Keys are
 * whatever the /matches page emits — listed here so we know what's
 * actually wired up. Unknown keys are silently ignored.
 *
 * Typed as `any` because chaining a generic FilterBuilder through
 * conditional .eq/.ilike calls is a notorious TS hassle with the Supabase
 * client. Output is still type-safe at the call site (PostgrestResponse).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(query: any, filters: Record<string, unknown>): any {
    let q = query;
    if (typeof filters.filterNoticeType === "string" && filters.filterNoticeType) {
        q = q.eq("notice_type", filters.filterNoticeType);
    }
    if (typeof filters.filterState === "string" && filters.filterState) {
        q = q.eq("place_of_performance_state", filters.filterState);
    }
    if (typeof filters.filterNaics === "string" && filters.filterNaics) {
        q = q.ilike("naics_code", `${filters.filterNaics}%`);
    }
    if (typeof filters.filterSetAside === "string" && filters.filterSetAside) {
        q = q.ilike("set_aside_code", `%${filters.filterSetAside}%`);
    }
    if (typeof filters.activeSearch === "string" && filters.activeSearch.length >= 3) {
        const term = filters.activeSearch;
        q = q.or(`title.ilike.%${term}%,description.ilike.%${term}%`);
    }
    return q;
}

export async function GET(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;

    const sb = svc();
    const startTime = Date.now();

    const { data: searches } = await sb
        .from("saved_searches")
        .select("id, user_profile_id, name, filters, last_alert_at")
        .eq("alert_enabled", true)
        .order("last_alert_at", { ascending: true, nullsFirst: true })
        .limit(500);

    const rows = (searches as SavedSearchRow[] | null) || [];
    if (rows.length === 0) {
        return NextResponse.json({ success: true, processed: 0, message: "no active alerts" });
    }

    // Group by profile so we batch one email per user even if they have
    // multiple saved searches that fired. Resend doesn't like one-per-second
    // and emails feel less spammy when combined.
    const byProfile = new Map<string, Array<SavedSearchRow & { newMatches: OppRow[] }>>();

    for (const s of rows) {
        const since = s.last_alert_at || new Date(Date.now() - 86400_000).toISOString();
        const baseQuery = sb
            .from("opportunities")
            .select("id, notice_id, title, agency, response_deadline, posted_date, naics_code")
            .eq("is_archived", false)
            .gte("created_at", since)
            .order("posted_date", { ascending: false, nullsFirst: false })
            .limit(10);
        const query = applyFilters(baseQuery, s.filters || {});
        const { data: opps } = await query;
        const newMatches = (opps as OppRow[] | null) || [];
        if (newMatches.length === 0) continue;
        const list = byProfile.get(s.user_profile_id) || [];
        list.push({ ...s, newMatches });
        byProfile.set(s.user_profile_id, list);
    }

    // Pull email addresses + send. Re-use the existing sendOpportunityAlert
    // helper if available; fall back to direct Resend.
    const { sendSavedSearchDigest } = await import("@/lib/email").catch(() => ({ sendSavedSearchDigest: null as null | ((args: { to: string; profileName: string; searches: Array<{ id: string; name: string; matches: OppRow[] }> }) => Promise<unknown>) }));

    let sent = 0;
    let totalMatches = 0;
    for (const [profileId, list] of byProfile) {
        const { data: profile } = await sb
            .from("user_profiles")
            .select("email, company_name")
            .eq("id", profileId)
            .maybeSingle();
        const p = profile as { email: string | null; company_name: string | null } | null;
        if (!p?.email) continue;

        // Update each search's metadata regardless of whether we successfully
        // emailed — last_alert_at marks "we processed this", not "user saw it".
        const now = new Date().toISOString();
        for (const s of list) {
            totalMatches += s.newMatches.length;
            await sb.from("saved_searches")
                .update({
                    last_alert_at: now,
                    new_match_count: s.newMatches.length,
                })
                .eq("id", s.id);
        }

        if (sendSavedSearchDigest) {
            try {
                await sendSavedSearchDigest({
                    to: p.email,
                    profileName: p.company_name || p.email,
                    searches: list.map(s => ({
                        id: s.id,
                        name: s.name,
                        matches: s.newMatches,
                    })),
                });
                sent++;
            } catch (e) {
                console.warn("saved-search digest email failed for", profileId, e);
            }
        }
    }

    return NextResponse.json({
        success: true,
        processed: rows.length,
        profiles_emailed: sent,
        new_matches_found: totalMatches,
        elapsed_ms: Date.now() - startTime,
    });
}
