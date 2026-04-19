import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendOpportunityAlert } from "@/lib/email";

export const maxDuration = 300;

/**
 * Market Watch weekly digest — Sunday 09:00 UTC.
 *
 * For every active market_watch_searches row:
 *   1. Run the saved query_text against opportunities (simple ILIKE on title
 *      + description + structured_requirements for now; AI filter in v2).
 *   2. Apply any stored filters (agency, naics, state).
 *   3. Take top 5 results by response_deadline (soonest first).
 *   4. Send via existing sendOpportunityAlert template.
 *   5. Update last_run_at + last_result_count.
 */

function getDb() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
}

interface OppRow {
    id: string;
    title: string | null;
    department: string | null;
    response_deadline: string | null;
}

interface SavedSearch {
    id: string;
    name: string;
    query_text: string;
    filters_json: Record<string, unknown> | null;
    user_profile_id: string;
}

interface ProfileRow {
    id: string;
    email: string | null;
    contact_name: string | null;
    company_name: string | null;
}

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();
    let sent = 0;
    let errors = 0;

    try {
        const { data: searches } = await db
            .from("market_watch_searches")
            .select("id, name, query_text, filters_json, user_profile_id")
            .eq("active", true);

        if (!searches || searches.length === 0) {
            return NextResponse.json({ success: true, sent: 0, message: "no active searches" });
        }

        // Group by user_profile_id so each user gets one digest email
        const byUser = new Map<string, SavedSearch[]>();
        for (const s of searches as SavedSearch[]) {
            const list = byUser.get(s.user_profile_id) || [];
            list.push(s);
            byUser.set(s.user_profile_id, list);
        }

        for (const [userId, userSearches] of byUser.entries()) {
            const { data: profileData } = await db
                .from("user_profiles")
                .select("id, email, contact_name, company_name")
                .eq("id", userId)
                .single();
            const profile = profileData as ProfileRow | null;
            if (!profile?.email) continue;

            const aggregatedOpps: Array<{ title: string; agency: string; score: number; deadline?: string }> = [];

            for (const search of userSearches) {
                const q = search.query_text.trim();
                const filters = (search.filters_json || {}) as Record<string, unknown>;

                // Only ingest opportunities in the active lifecycle window
                let query = db
                    .from("opportunities")
                    .select("id, title, department, response_deadline")
                    .in("status", ["ACTIVE", "EXPIRING_SOON", "DISCOVERED"])
                    .limit(5);

                if (q) {
                    query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`);
                }
                const agency = filters.agency as string | undefined;
                const naics = filters.naics as string | undefined;
                const state = filters.state as string | undefined;
                if (agency) query = query.ilike("department", `%${agency}%`);
                if (naics) query = query.eq("naics_code", naics);
                if (state) query = query.eq("place_of_performance_state", state);

                query = query.order("response_deadline", { ascending: true });

                const { data: opps } = await query;
                const rows = (opps || []) as OppRow[];
                for (const op of rows) {
                    aggregatedOpps.push({
                        title: op.title || "(untitled)",
                        agency: op.department || "Federal agency",
                        score: 0.75, // digest entries are not per-user scored; pass a placeholder
                        deadline: op.response_deadline || undefined,
                    });
                }

                await db
                    .from("market_watch_searches")
                    .update({
                        last_run_at: new Date().toISOString(),
                        last_result_count: rows.length,
                    })
                    .eq("id", search.id);
            }

            if (aggregatedOpps.length > 0) {
                try {
                    await sendOpportunityAlert(
                        profile.email,
                        profile.contact_name || profile.company_name || "there",
                        aggregatedOpps.slice(0, 10)
                    );
                    sent++;
                } catch {
                    errors++;
                }
            }
        }

        return NextResponse.json({ success: true, digests_sent: sent, errors });
    } catch (e) {
        const msg = e instanceof Error ? e.message : "market_watch_digest failed";
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}
