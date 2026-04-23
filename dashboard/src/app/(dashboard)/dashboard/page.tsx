import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import DashboardClient from "./DashboardClient";

export const metadata = {
  title: "Dashboard | CapturePilot",
};

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // Get user profile (notes carries dashboard_layout)
  const { data: profileData } = await supabase
    .from("user_profiles")
    .select("id, company_name, naics_codes, sba_certifications, state, target_states, uei, cage_code, website, phone, employee_count, years_in_business, federal_awards_count, notes")
    .eq("auth_user_id", user.id)
    .single();

  if (!profileData) {
    redirect("/onboard");
  }

  const profileNotes = (profileData as unknown as { notes: Record<string, unknown> | null }).notes;
  const initialLayout = (profileNotes?.dashboard_layout as { hidden?: string[]; order?: string[] } | undefined) || {};

  const today = new Date().toISOString().split("T")[0];
  const profileId = profileData.id as string;
  const ACTIVE_STATUSES = ["ACTIVE", "EXPIRING_SOON", "MARKET_RESEARCH", "DISCOVERED"];

  // Fetch all dashboard data in parallel on the server
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
    supabase.from("client_competitors").select("*", { count: "exact", head: true }).eq("user_profile_id", profileId),
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

  const opsCount = opsRes.count || 0;
  const hotMatchCount = hotRes.count || 0;
  const warmMatchCount = warmRes.count || 0;
  const totalMatchCount = hotMatchCount + warmMatchCount;
  const urgentCount = urgentRes.count || 0;
  const topData = (topMatchRes.data || []) as any[];
  const topOpps = topData.map(m => m.opportunities).filter(Boolean);

  const pursuits = (pursuitRes.data || []);
  const pipelineCount = pursuits.length;
  const pipelineStages: Record<string, number> = {};
  pursuits.forEach(p => { pipelineStages[p.stage] = (pipelineStages[p.stage] || 0) + 1; });

  const actions = (actionsRes.data || []);
  const actionsPending = actions.filter(a => a.status !== "completed").length;
  const actionsUrgent = actions.filter(a => a.priority === "high" && a.status !== "completed").length;

  const competitorCount = competitorRes.count || 0;

  const recents = (recentPipelineRes.data || []) as any[];
  const recentPipeline = recents.filter(r => r.opportunities).map(r => ({
    id: r.id, stage: r.stage, title: r.opportunities.title, opportunity_id: r.opportunity_id,
  }));

  const pendingActions = (recentActionsRes.data || []);

  const stats = {
    opsCount,
    hotMatchCount,
    warmMatchCount,
    totalMatchCount,
    urgentCount,
    topOpps,
    pipelineCount,
    pipelineStages,
    actionsPending,
    actionsUrgent,
    competitorCount,
    recentPipeline,
    pendingActions
  };

  return <DashboardClient profile={profileData as any} stats={stats} initialLayout={initialLayout as any} />;
}
