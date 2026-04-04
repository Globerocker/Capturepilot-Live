import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getDb() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
}

/**
 * POST /api/saved-searches — Create a saved search
 * Body: { user_profile_id, name, filters, alert_enabled, alert_frequency }
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { user_profile_id, name, filters, alert_enabled = true, alert_frequency = "daily" } = body;

        if (!user_profile_id || !name) {
            return NextResponse.json({ error: "user_profile_id and name required" }, { status: 400 });
        }

        const db = getDb();

        // Run the search to get initial result count
        let query = db.from("opportunities")
            .select("notice_id", { count: "exact", head: true })
            .eq("is_archived", false);

        const f = filters || {};
        if (f.naics_codes?.length) query = query.in("naics_code", f.naics_codes);
        if (f.keywords) query = query.ilike("title", `%${f.keywords}%`);
        if (f.status) query = query.eq("status", f.status);
        if (f.state) query = query.eq("place_of_performance_state", f.state);
        if (f.veteran) query = query.eq("veteran_relevance_flag", true);
        if (f.wosb) query = query.eq("wosb_relevance_flag", true);
        if (f.small_business) query = query.eq("small_business_relevance_flag", true);

        const { count } = await query;

        const { data, error } = await db.from("saved_searches").insert({
            user_profile_id,
            name,
            filters: f,
            alert_enabled,
            alert_frequency,
            result_count: count || 0,
        }).select("id").single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true, id: data.id, result_count: count || 0 });

    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}

/**
 * GET /api/saved-searches?user_profile_id=xxx — List saved searches
 */
export async function GET(req: NextRequest) {
    try {
        const profileId = req.nextUrl.searchParams.get("user_profile_id");
        if (!profileId) return NextResponse.json({ error: "user_profile_id required" }, { status: 400 });

        const db = getDb();
        const { data, error } = await db
            .from("saved_searches")
            .select("*")
            .eq("user_profile_id", profileId)
            .order("created_at", { ascending: false });

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ searches: data || [] });

    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}

/**
 * DELETE /api/saved-searches?id=xxx — Delete a saved search
 */
export async function DELETE(req: NextRequest) {
    try {
        const id = req.nextUrl.searchParams.get("id");
        if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

        const db = getDb();
        await db.from("saved_searches").delete().eq("id", id);
        return NextResponse.json({ success: true });

    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
