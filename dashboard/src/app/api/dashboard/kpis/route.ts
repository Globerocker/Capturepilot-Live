/**
 * Dashboard KPI fetcher — runs the 13 stats queries that previously
 * blocked SSR on /dashboard, returning the same shape DashboardClient
 * expects. Moving these off the server-render critical path drops TTFB
 * from ~10-20s to ~200ms (the page renders with skeletons immediately,
 * KPIs stream in as this endpoint completes).
 *
 * Per-user authenticated. Same query set as dashboard/page.tsx had —
 * just runs here instead of blocking the page render.
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = ["ACTIVE", "EXPIRING_SOON", "MARKET_RESEARCH", "DISCOVERED"];

export async function GET() {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();
    if (!profile?.id) return NextResponse.json({ error: "no profile" }, { status: 404 });

    const profileId = profile.id as string;
    const today = new Date().toISOString().split("T")[0];
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [
        opsRes, hotRes, warmRes, urgentRes, topMatchRes,
        pursuitRes, actionsRes, competitorRes, recentPipelineRes,
        recentActionsRes, newOpps7dRes, newMatches7dRes,
    ] = await Promise.all([
        supabase.from("opportunities").select("*", { count: "estimated", head: true }).eq("is_archived", false),
        // Switched from "exact" → "estimated" for HOT/WARM tiles. The dashboard
        // shows these as rough counts (X HOT / Y WARM); estimated counts via
        // pg_class.reltuples are O(1) where exact-with-JOIN can be 10s+.
        supabase.from("user_matches")
            .select("id, opportunities!inner(id)", { count: "estimated", head: true })
            .eq("user_profile_id", profileId)
            .eq("classification", "HOT")
            .eq("is_dismissed", false)
            .eq("opportunities.is_archived", false)
            .in("opportunities.status", ACTIVE_STATUSES),
        supabase.from("user_matches")
            .select("id, opportunities!inner(id)", { count: "estimated", head: true })
            .eq("user_profile_id", profileId)
            .eq("classification", "WARM")
            .eq("is_dismissed", false)
            .eq("opportunities.is_archived", false)
            .in("opportunities.status", ACTIVE_STATUSES),
        supabase.from("opportunities").select("*", { count: "estimated", head: true })
            .eq("is_archived", false)
            .lte("response_deadline", new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString())
            .gte("response_deadline", today),
        supabase.from("user_matches")
            .select("score, classification, opportunities!inner(id, title, agency, naics_code, notice_type, response_deadline, set_aside_code, status, is_archived)")
            .eq("user_profile_id", profileId)
            .eq("is_dismissed", false)
            .eq("opportunities.is_archived", false)
            .in("opportunities.status", ACTIVE_STATUSES)
            .order("score", { ascending: false })
            .limit(8),
        supabase.from("user_pursuits").select("stage").eq("user_profile_id", profileId),
        supabase.from("user_action_items").select("status, priority").eq("user_profile_id", profileId),
        supabase.from("client_competitors").select("*", { count: "estimated", head: true }).eq("user_profile_id", profileId),
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
        supabase.from("opportunities").select("*", { count: "estimated", head: true })
            .eq("is_archived", false)
            .gte("created_at", sevenDaysAgo),
        supabase.from("user_matches").select("*", { count: "estimated", head: true })
            .eq("user_profile_id", profileId)
            .eq("is_dismissed", false)
            .gte("scored_at", sevenDaysAgo),
    ]);

    const hotMatchCount = hotRes.count || 0;
    const warmMatchCount = warmRes.count || 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const topData = (topMatchRes.data || []) as any[];
    const topOpps = topData.map(m => m.opportunities).filter(Boolean);
    const pursuits = (pursuitRes.data || []);
    const pipelineStages: Record<string, number> = {};
    pursuits.forEach(p => { pipelineStages[p.stage] = (pipelineStages[p.stage] || 0) + 1; });
    const actions = (actionsRes.data || []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recents = (recentPipelineRes.data || []) as any[];

    return NextResponse.json({
        opsCount: opsRes.count || 0,
        hotMatchCount,
        warmMatchCount,
        totalMatchCount: hotMatchCount + warmMatchCount,
        urgentCount: urgentRes.count || 0,
        topOpps,
        pipelineCount: pursuits.length,
        pipelineStages,
        actionsPending: actions.filter(a => a.status !== "completed").length,
        actionsUrgent: actions.filter(a => a.priority === "high" && a.status !== "completed").length,
        competitorCount: competitorRes.count || 0,
        recentPipeline: recents.filter(r => r.opportunities).map(r => ({
            id: r.id, stage: r.stage, title: r.opportunities.title, opportunity_id: r.opportunity_id,
        })),
        pendingActions: recentActionsRes.data || [],
        newOpps7d: newOpps7dRes.count || 0,
        newMatches7d: newMatches7dRes.count || 0,
    });
}
