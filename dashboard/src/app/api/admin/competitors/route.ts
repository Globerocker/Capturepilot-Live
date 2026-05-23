import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";

function getAdmin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );
}

/**
 * POST /api/admin/competitors — Add competitor to client profile
 */
export async function POST(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    try {
        const body = await req.json();
        const {
            user_profile_id, competitor_name, website, uei, cage_code,
            naics_codes, employee_count, revenue_estimate, description,
            overlap_score, federal_presence,
        } = body;

        if (!user_profile_id || !competitor_name) {
            return NextResponse.json({ error: "user_profile_id and competitor_name required" }, { status: 400 });
        }

        const admin = getAdmin();
        const { data, error } = await admin.from("client_competitors").insert({
            user_profile_id,
            competitor_name,
            website: website || null,
            uei: uei || null,
            cage_code: cage_code || null,
            naics_codes: naics_codes || [],
            employee_count: employee_count || null,
            revenue_estimate: revenue_estimate || null,
            description: description || null,
            overlap_score: overlap_score || 0,
            federal_presence: federal_presence || "unknown",
            last_analyzed_at: new Date().toISOString(),
        }).select("id").single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        await admin.from("client_activity_log").insert({
            user_profile_id,
            action: "competitor_added",
            description: `Competitor added: ${competitor_name}`,
        });

        return NextResponse.json({ success: true, competitor_id: data.id });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}

/**
 * GET /api/admin/competitors?user_profile_id=xxx
 */
export async function GET(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    const profileId = req.nextUrl.searchParams.get("user_profile_id");
    const admin = getAdmin();

    let query = admin.from("client_competitors").select("*").order("overlap_score", { ascending: false });
    if (profileId) query = query.eq("user_profile_id", profileId);

    const { data, error } = await query.limit(50);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ competitors: data || [] });
}

/**
 * DELETE /api/admin/competitors?id=xxx
 */
export async function DELETE(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const admin = getAdmin();
    const { error } = await admin.from("client_competitors").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}
