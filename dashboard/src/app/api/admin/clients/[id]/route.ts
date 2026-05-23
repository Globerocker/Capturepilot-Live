import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/clients/[id] — Full client detail bundle for /admin/clients/[id].
 *
 * The client detail page was calling supabase directly from the browser
 * with the anon key. user_profiles RLS only lets a user read THEIR OWN
 * row, so admin browsers got "Client not found" on any profile that
 * wasn't theirs. This endpoint runs server-side with the service key
 * (gated by assertAdmin) so the admin can fan out across every related
 * table in one call.
 */

function svc() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const sb = svc();
    const [
        profileRes,
        tasksRes,
        docsRes,
        matchesRes,
        pursuitsRes,
        activityRes,
        competitorsRes,
    ] = await Promise.all([
        sb.from("user_profiles").select("*").eq("id", id).maybeSingle(),
        sb.from("client_tasks").select("*").eq("user_profile_id", id)
            .order("created_at", { ascending: false }),
        sb.from("client_documents").select("*").eq("user_profile_id", id)
            .order("created_at", { ascending: false }),
        sb.from("user_matches")
            .select("id, score, classification, is_saved, opportunity:opportunities!inner(id, title, agency, notice_id, response_deadline, naics_code, status)")
            .eq("user_profile_id", id)
            .eq("opportunities.is_archived", false)
            .order("score", { ascending: false })
            .limit(20),
        sb.from("user_pursuits")
            .select("id, stage, priority, notes, opportunity:opportunities!inner(id, title, agency, notice_id, response_deadline)")
            .eq("user_profile_id", id)
            .order("stage_changed_at", { ascending: false, nullsFirst: false }),
        sb.from("client_activity_log").select("*").eq("user_profile_id", id)
            .order("created_at", { ascending: false }).limit(50),
        sb.from("client_competitors").select("*").eq("user_profile_id", id),
    ]);

    if (!profileRes.data) {
        return NextResponse.json({ error: "Profile not found", id }, { status: 404 });
    }

    return NextResponse.json({
        profile: profileRes.data,
        tasks: tasksRes.data || [],
        documents: docsRes.data || [],
        matches: matchesRes.data || [],
        pursuits: pursuitsRes.data || [],
        activity: activityRes.data || [],
        competitors: competitorsRes.data || [],
    });
}
