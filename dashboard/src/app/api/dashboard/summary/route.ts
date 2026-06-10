import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// W2.1: parallelized dashboard summary endpoint.
// Replaces 11 sequential/batched browser-side Supabase calls with a single
// server round-trip that fans every read out concurrently using one client.
//
// Why this is faster than the previous client-side pattern:
// - One auth handshake (was 1 per top-level Supabase call from the browser).
// - One TCP / TLS path to the DB (Supabase pooler), not 11 parallel WebSocket-ish RPCs.
// - Independent reads truly fan out — the prior code blocked the second batch on
//   the first batch's completion.
// - Server can be edge-cached briefly if we ever want to (left dynamic for now).

export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = ["ACTIVE", "EXPIRING_SOON", "MARKET_RESEARCH", "DISCOVERED"];

export async function GET() {
    const supabase = await createSupabaseServerClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Profile must come first — every other query needs profile.id.
    const { data: profileData } = await supabase
        .from("user_profiles")
        .select(
            "id, company_name, naics_codes, sba_certifications, state, target_states, " +
            "uei, cage_code, website, phone, employee_count, years_in_business, federal_awards_count"
        )
        .eq("auth_user_id", user.id)
        .single();

    if (!profileData) {
        return NextResponse.json({ profile: null }, { status: 200 });
    }

    const profileId = (profileData as { id: string }).id;
    const today = new Date().toISOString().split("T")[0];
    const sevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // All independent reads fan out in one shot.
    const [
        opsRes,
        hotRes,
        warmRes,
        urgentRes,
        topMatchRes,
        pursuitRes,
        actionsRes,
        competitorRes,
        recentPipelineRes,
        recentActionsRes,
    ] = await Promise.all([
        supabase.from("opportunities").select("*", { count: "exact", head: true }).eq("is_archived", false),

        supabase.from("user_matches")
            .select("id, opportunities!inner(id)", { count: "exact", head: true })
            .eq("user_profile_id", profileId)
            .eq("classification", "HOT")
            .eq("is_dismissed", false)
            .eq("opportunities.is_archived", false)
            .in("opportunities.status", ACTIVE_STATUSES),

        supabase.from("user_matches")
            .select("id, opportunities!inner(id)", { count: "exact", head: true })
            .eq("user_profile_id", profileId)
            .eq("classification", "WARM")
            .eq("is_dismissed", false)
            .eq("opportunities.is_archived", false)
            .in("opportunities.status", ACTIVE_STATUSES),

        supabase.from("opportunities").select("*", { count: "exact", head: true })
            .eq("is_archived", false)
            .lte("response_deadline", sevenDays)
            .gte("response_deadline", today),

        supabase.from("user_matches")
            .select(
                "score, classification, opportunities!inner(" +
                "id, title, agency, naics_code, notice_type, response_deadline, set_aside_code, status, is_archived" +
                ")"
            )
            .eq("user_profile_id", profileId)
            .eq("is_dismissed", false)
            .eq("opportunities.is_archived", false)
            .in("opportunities.status", ACTIVE_STATUSES)
            .order("score", { ascending: false })
            .limit(8),

        supabase.from("user_pursuits").select("stage").eq("user_profile_id", profileId),

        supabase.from("user_action_items").select("status, priority").eq("user_profile_id", profileId),

        supabase.from("client_competitors")
            .select("*", { count: "exact", head: true })
            .eq("user_profile_id", profileId),

        supabase.from("user_pursuits")
            .select("id, stage, opportunity_id, opportunities(id, title)")
            .eq("user_profile_id", profileId)
            .order("stage_changed_at", { ascending: false })
            .limit(5),

        supabase.from("user_action_items")
            .select("id, title, priority, opportunity_id")
            .eq("user_profile_id", profileId)
            .neq("status", "completed")
            .order("priority", { ascending: false })
            .limit(5),
    ]);

    type TopOpp = {
        id: string;
        title: string;
        agency: string;
        naics_code: string;
        notice_type: string;
        response_deadline: string;
        set_aside_code: string;
    };

    const topMatches = (topMatchRes.data || []) as unknown as Array<{
        score: number;
        classification: string;
        opportunities: TopOpp;
    }>;
    const topOpps = topMatches.map(m => m.opportunities).filter(Boolean);

    const pursuits = (pursuitRes.data || []) as Array<{ stage: string }>;
    const pipelineStages: Record<string, number> = {};
    pursuits.forEach(p => { pipelineStages[p.stage] = (pipelineStages[p.stage] || 0) + 1; });

    const actions = (actionsRes.data || []) as Array<{ status: string; priority: string }>;
    const actionsPending = actions.filter(a => a.status !== "completed").length;
    const actionsUrgent = actions.filter(a => a.priority === "high" && a.status !== "completed").length;

    type RecentPursuit = {
        id: string;
        stage: string;
        opportunity_id: string;
        opportunities: { id: string; title: string } | null;
    };
    const recents = (recentPipelineRes.data || []) as unknown as RecentPursuit[];
    const recentPipeline = recents
        .filter(r => r.opportunities)
        .map(r => ({
            id: r.id,
            stage: r.stage,
            title: r.opportunities!.title,
            opportunity_id: r.opportunity_id,
        }));

    const pendingActions = (recentActionsRes.data || []) as Array<{
        id: string;
        title: string;
        priority: string;
        opportunity_id: string;
    }>;

    const hot = (hotRes as { count: number | null }).count || 0;
    const warm = (warmRes as { count: number | null }).count || 0;

    return NextResponse.json({
        profile: profileData,
        opsCount: opsRes.count || 0,
        hotMatchCount: hot,
        warmMatchCount: warm,
        totalMatchCount: hot + warm,
        urgentCount: urgentRes.count || 0,
        topOpps,
        pipelineCount: pursuits.length,
        pipelineStages,
        actionsPending,
        actionsUrgent,
        competitorCount: (competitorRes as { count: number | null }).count || 0,
        recentPipeline,
        pendingActions,
    });
}
