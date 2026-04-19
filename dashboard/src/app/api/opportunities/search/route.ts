import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { extractBearer, resolveToken } from "@/lib/api-token";

export const maxDuration = 30;

/**
 * GET /api/opportunities/search
 *
 * Filters (all optional):
 *   q       — keyword (title OR description)
 *   naics   — 6-digit NAICS code (exact match)
 *   agency  — department partial match
 *   set_aside — e.g. SDVOSB, 8(a), HUBZone, WOSB (partial match)
 *   state   — place-of-performance state
 *   limit   — 1-50 (default 20)
 *
 * Used by the Zapier "Find Opportunity" search action and any external
 * integration. Same auth as /api/pursuits: cookie session OR bearer token.
 */

async function authorized(req: NextRequest): Promise<boolean> {
    const cookieStore = await cookies();
    const sb = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await sb.auth.getUser();
    if (user) return true;

    const token = extractBearer(req.headers.get("authorization"));
    const resolved = await resolveToken(token);
    return Boolean(resolved);
}

export async function GET(req: NextRequest) {
    if (!(await authorized(req))) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const naics = searchParams.get("naics");
    const agency = searchParams.get("agency");
    const setAside = searchParams.get("set_aside");
    const state = searchParams.get("state");
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    let query = admin
        .from("opportunities")
        .select("id, notice_id, title, department, agency, naics_code, psc_code, typeOfSetAside, typeOfSetAsideDescription, response_deadline, award_amount, place_of_performance_state, status")
        .in("status", ["ACTIVE", "EXPIRING_SOON", "DISCOVERED"])
        .order("response_deadline", { ascending: true, nullsFirst: false })
        .limit(limit);

    if (q) query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`);
    if (naics) query = query.eq("naics_code", naics);
    if (agency) query = query.ilike("department", `%${agency}%`);
    if (setAside) query = query.ilike("typeOfSetAsideDescription", `%${setAside}%`);
    if (state) query = query.eq("place_of_performance_state", state);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
        results: data || [],
        filter: { q, naics, agency, set_aside: setAside, state, limit },
    });
}
